/**
 * swap_exact_in: exact-input, fill-or-kill swap across fixed price bins.
 *
 * The quote (`quoteSwap`) is a pure computation over a snapshot of bins; `commitSwap` applies
 * a quote to mutable state. The on-chain program performs both in one pass over the same
 * integer rules, so a client quote and the chain agree bit-for-bit on identical state.
 */
import type { MarketConfig } from "./config.js";
import { isBinInRange, pageIndexOf } from "./config.js";
import { availableBase, availableQuote, splitByOutputInventory, type BinState } from "./bin.js";
import { splitFees, splitProtocolQuoteFee, largestRemainder, type FeeBreakdown, type BinShare } from "./fees.js";
import { baseForQuoteCeil, baseForQuoteFloor, quoteForBaseCeil, quoteForBaseFloor } from "./fixed.js";
import { priceAtBin } from "./price.js";
import { matchBin, type MatchEvent } from "./matching.js";
import type { MarketState } from "./state.js";

export type Direction = "buy" | "sell";

export type SwapErrorCode =
  | "MarketNotActive"
  | "InputBelowMinimum"
  | "TraversalLimit"
  | "BuyInventoryExhausted"
  | "SellInventoryExhausted"
  | "PageNotInitialized"
  | "OutputBelowMinimum"
  | "DeadlinePassed"
  | "ConfigVersionMismatch"
  | "NoExecutableFill";

export interface Fill {
  bin: number;
  priceX64: bigint;
  /** Tradable input executed into this bin (quote for buys, base for sells). */
  input: bigint;
  /** Output taken from this bin (base for buys, quote for sells). */
  output: bigint;
  seedOut: bigint;
  scarOut: bigint;
  seedIn: bigint;
  scarIn: bigint;
  /** Rounding surplus left in the bin: input - ceil(output * price) for buys (bounded by < price + 1). */
  roundingSurplus: bigint;
}

export interface SwapParams {
  direction: Direction;
  grossInput: bigint;
  minOutput: bigint;
  /** Slot the swap executes in (for deadline checks and last-execution instrumentation). */
  slot?: bigint;
  deadlineSlot?: bigint;
  expectedConfigVersion?: number;
}

export interface SwapQuote {
  ok: true;
  direction: Direction;
  fees: FeeBreakdown;
  fills: Fill[];
  output: bigint;
  /** Number of bins inspected including empty ones (<= maxBinsPerSwap). */
  binsInspected: number;
  inspectedBins: number[];
  newCursor: number;
  scarShares: BinShare[];
  pagesTouched: number[];
  /** Volume-weighted average execution price (x64) over fills, for display. */
  avgPriceX64: bigint | null;
  startPriceX64: bigint;
  endPriceX64: bigint;
}

export interface SwapFailure {
  ok: false;
  error: SwapErrorCode;
  detail: string;
  binsInspected: number;
  pagesTouched: number[];
}

export type SwapOutcome = SwapQuote | SwapFailure;

export type BinLookup = (bin: number) => BinState | undefined;

export function quoteSwap(
  c: MarketConfig,
  state: MarketState,
  p0X64: bigint,
  lookup: BinLookup,
  params: SwapParams,
): SwapOutcome {
  const pagesTouched: number[] = [];
  const touch = (bin: number) => {
    const p = pageIndexOf(c, bin);
    if (!pagesTouched.includes(p)) pagesTouched.push(p);
  };
  const fail = (error: SwapErrorCode, detail: string, binsInspected = 0): SwapFailure => ({
    ok: false,
    error,
    detail,
    binsInspected,
    pagesTouched,
  });

  if (state.status === "created") return fail("MarketNotActive", "market is not active");
  if (params.expectedConfigVersion !== undefined && params.expectedConfigVersion !== c.configVersion) {
    return fail("ConfigVersionMismatch", `expected ${params.expectedConfigVersion}, market has ${c.configVersion}`);
  }
  if (params.deadlineSlot !== undefined && params.slot !== undefined && params.slot > params.deadlineSlot) {
    return fail("DeadlinePassed", `slot ${params.slot} > deadline ${params.deadlineSlot}`);
  }
  const isBuy = params.direction === "buy";
  const min = isBuy ? c.minQuoteIn : c.minBaseIn;
  if (params.grossInput < min) return fail("InputBelowMinimum", `gross ${params.grossInput} < min ${min}`);

  const fees = splitFees(params.grossInput, c.fees);
  let remaining = fees.tradable;
  if (remaining === 0n) return fail("InputBelowMinimum", "tradable input is zero after fees");

  const dir = isBuy ? 1 : -1;
  let bin = state.cursor;
  let inspected = 0;
  const inspectedBins: number[] = [];
  const fills: Fill[] = [];
  let lastFillBin = state.cursor;
  let output = 0n;

  while (remaining > 0n) {
    if (!isBinInRange(c, bin)) {
      return fail(
        isBuy ? "BuyInventoryExhausted" : "SellInventoryExhausted",
        `reached bin range limit at ${bin} with ${remaining} input unfilled`,
        inspected,
      );
    }
    if (inspected >= c.maxBinsPerSwap) {
      return fail("TraversalLimit", `inspected ${inspected} bins; ${remaining} input unfilled`, inspected);
    }
    inspected += 1;
    inspectedBins.push(bin);
    touch(bin);
    const b = lookup(bin);
    if (!b) return fail("PageNotInitialized", `page ${pageIndexOf(c, bin)} for bin ${bin} not initialized`, inspected);

    const seedAvail = isBuy ? b.seedBase : b.seedQuote;
    const scarAvail = isBuy ? b.scarBase : b.scarQuote;
    const avail = seedAvail + scarAvail;
    if (avail === 0n) {
      bin += dir;
      continue;
    }
    const price = priceAtBin(p0X64, bin);
    let out: bigint;
    let input: bigint;
    if (isBuy) {
      const need = quoteForBaseCeil(avail, price);
      if (remaining >= need) {
        out = avail;
        input = need;
      } else {
        out = baseForQuoteFloor(remaining, price);
        input = remaining;
      }
    } else {
      const need = baseForQuoteCeil(avail, price);
      if (remaining >= need) {
        out = avail;
        input = need;
      } else {
        out = quoteForBaseFloor(remaining, price);
        input = remaining;
      }
    }
    if (out > avail) throw new Error("walker invariant: out > avail");
    const outSplit = splitByOutputInventory(out, seedAvail, scarAvail);
    const inSplit = splitByOutputInventory(input, seedAvail, scarAvail);
    const exactIn = isBuy ? quoteForBaseCeil(out, price) : baseForQuoteCeil(out, price);
    const roundingSurplus = input - exactIn;
    if (roundingSurplus < 0n) throw new Error("walker invariant: negative rounding surplus");
    fills.push({
      bin,
      priceX64: price,
      input,
      output: out,
      seedOut: outSplit.seed,
      scarOut: outSplit.scar,
      seedIn: inSplit.seed,
      scarIn: inSplit.scar,
      roundingSurplus,
    });
    output += out;
    remaining -= input;
    lastFillBin = bin;
    if (remaining === 0n) break;
    bin += dir;
  }

  if (fills.length === 0) return fail("NoExecutableFill", "no bin produced a fill", inspected);
  if (output < params.minOutput) {
    return fail("OutputBelowMinimum", `output ${output} < min_output ${params.minOutput}`, inspected);
  }

  const scarShares = largestRemainder(
    fees.scarFee,
    fills.map((f) => ({ bin: f.bin, weight: f.input })),
  );

  // VWAP for display: total input / total output expressed as x64 quote-per-base.
  let avgPriceX64: bigint | null = null;
  const totIn = fills.reduce((a, f) => a + f.input, 0n);
  if (output > 0n && totIn > 0n) {
    avgPriceX64 = isBuy ? (totIn << 64n) / output : (output << 64n) / totIn;
  }

  return {
    ok: true,
    direction: params.direction,
    fees,
    fills,
    output,
    binsInspected: inspected,
    inspectedBins,
    newCursor: lastFillBin,
    scarShares,
    pagesTouched,
    avgPriceX64,
    startPriceX64: priceAtBin(p0X64, state.cursor),
    endPriceX64: priceAtBin(p0X64, lastFillBin),
  };
}

export interface SwapExecutedEvent {
  type: "SwapExecuted";
  direction: Direction;
  grossInput: bigint;
  output: bigint;
  scarFee: bigint;
  protocolFee: bigint;
  creatorFee: bigint;
  binsInspected: number;
  startBin: number;
  endBin: number;
  slot: bigint;
}

export interface SwapReceipt {
  quote: SwapQuote;
  events: (SwapExecutedEvent | MatchEvent)[];
}

/**
 * Apply a successful quote to mutable state. Must be called on the SAME state the quote was
 * computed from (the simulator and SDK enforce this; on-chain the two are one pass).
 */
export function commitSwap(
  c: MarketConfig,
  state: MarketState,
  p0X64: bigint,
  lookupMut: (bin: number) => BinState,
  q: SwapQuote,
  params: SwapParams,
): SwapReceipt {
  const isBuy = q.direction === "buy";
  const slot = params.slot ?? 0n;

  // 1. Apply fills.
  for (const f of q.fills) {
    const b = lookupMut(f.bin);
    if (isBuy) {
      if (f.seedOut > b.seedBase || f.scarOut > b.scarBase) throw new Error("commit: stale state (base)");
      b.seedBase -= f.seedOut;
      b.scarBase -= f.scarOut;
      b.seedQuote += f.seedIn;
      b.scarQuote += f.scarIn;
      b.buyVolumeQuote += f.input;
    } else {
      if (f.seedOut > b.seedQuote || f.scarOut > b.scarQuote) throw new Error("commit: stale state (quote)");
      b.seedQuote -= f.seedOut;
      b.scarQuote -= f.scarOut;
      b.seedBase += f.seedIn;
      b.scarBase += f.scarIn;
      b.sellVolumeBase += f.input;
    }
    b.lastExecutionSlot = slot;
  }

  // 2. Distribute the scar fee to visited bins as pending escrow.
  for (const s of q.scarShares) {
    const b = lookupMut(s.bin);
    if (isBuy) b.pendingQuoteEligible += s.amount;
    else b.pendingBaseEligible += s.amount;
  }

  // 3. Protocol and creator revenue (never touch locked custody).
  if (isBuy) {
    const split = splitProtocolQuoteFee(q.fees.protocolFee, c.fees.buybackShareBps);
    state.protocolClaimableQuote += split.operating;
    state.buybackAccruedQuote += split.buyback;
    state.creatorClaimableQuote += q.fees.creatorFee;
    state.totalBuyVolumeQuote += q.fees.gross;
  } else {
    state.protocolClaimableBase += q.fees.protocolFee;
    state.creatorClaimableBase += q.fees.creatorFee;
    state.totalSellVolumeBase += q.fees.gross;
  }

  // 4. Cursor and counters.
  state.cursor = q.newCursor;
  state.swapCount += 1n;

  const events: (SwapExecutedEvent | MatchEvent)[] = [
    {
      type: "SwapExecuted",
      direction: q.direction,
      grossInput: q.fees.gross,
      output: q.output,
      scarFee: q.fees.scarFee,
      protocolFee: q.fees.protocolFee,
      creatorFee: q.fees.creatorFee,
      binsInspected: q.binsInspected,
      startBin: q.fills[0]!.bin,
      endBin: q.newCursor,
      slot,
    },
  ];

  // 5. Match opposing eligible escrow at visited bins. Scars formed here are only usable by
  //    later transactions because the fills above were computed before matching.
  for (const f of q.fills) {
    const b = lookupMut(f.bin);
    events.push(...matchBin(state, c, f.bin, b, f.priceX64, slot));
  }
  return { quote: q, events };
}

/**
 * Executable depth: quote input required to consume all opposite inventory in bins whose price
 * stays within `bps` of the cursor price, walking in `direction` (ignores the traversal cap, so
 * it is an upper bound on what a single swap could execute). Returns both the input needed and
 * the output obtainable. Current inventory only; pending escrow is excluded.
 */
export function executableDepth(
  c: MarketConfig,
  state: MarketState,
  p0X64: bigint,
  lookup: BinLookup,
  direction: Direction,
  bps: number,
): { input: bigint; output: bigint; binsWithInventory: number } {
  const isBuy = direction === "buy";
  const ref = priceAtBin(p0X64, state.cursor);
  const limit = isBuy ? (ref * BigInt(10_000 + bps)) / 10_000n : (ref * BigInt(10_000 - bps)) / 10_000n;
  let input = 0n;
  let output = 0n;
  let bins = 0;
  for (let bin = state.cursor; isBinInRange(c, bin); bin += isBuy ? 1 : -1) {
    const price = priceAtBin(p0X64, bin);
    if (isBuy ? price > limit : price < limit) break;
    const b = lookup(bin);
    if (!b) break;
    const avail = isBuy ? availableBase(b) : availableQuote(b);
    if (avail === 0n) continue;
    bins += 1;
    output += avail;
    input += isBuy ? quoteForBaseCeil(avail, price) : baseForQuoteCeil(avail, price);
  }
  return { input, output, binsWithInventory: bins };
}
