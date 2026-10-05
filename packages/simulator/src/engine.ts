/**
 * Deterministic, event-based market simulation. Every run records starting inventory, deposits,
 * fee withdrawals, trades, fees by destination, pending inventory, matched contributions, burned
 * tokens and ending inventory. The simulator uses the exact integer math of @pop/math; it is an
 * executable specification, NOT evidence that the deployed contract works.
 */
import {
  BinStore,
  type MarketConfig,
  type MarketState,
  type SwapParams,
  type SwapOutcome,
  type SwapReceipt,
  type SwapFailure,
  type Direction,
  newMarketState,
  quantizeP0,
  quoteSwap,
  commitSwap,
  reconcile,
  priceAtBin,
  executableDepth,
  graduationProgress,
  matchBin,
  type MatchEvent,
  type Reconciliation,
  availableBase,
  availableQuote,
  SOL,
} from "@pop/math";

export interface Actor {
  name: string;
  base: bigint;
  quote: bigint;
  /** Quote spent on buys (gross) and received from sells, for P/L. */
  quoteSpent: bigint;
  quoteReceived: bigint;
  baseBought: bigint;
  baseSold: bigint;
}

export interface TradeRecord {
  seq: number;
  slot: number;
  actor: string;
  direction: Direction;
  grossInput: bigint;
  ok: boolean;
  error?: string;
  output?: bigint;
  scarFee?: bigint;
  protocolFee?: bigint;
  creatorFee?: bigint;
  binsInspected?: number;
  fills?: { bin: number; input: bigint; output: bigint; seedOut: bigint; scarOut: bigint; surplus: bigint }[];
  startBin?: number;
  endBin?: number;
  avgPrice?: number | null;
  scarsFormed?: { bin: number; base: bigint; quote: bigint }[];
  graduated?: boolean;
  internalBuyback?: boolean;
  /** Minimum output the trader demanded (slippage protection). */
  minOutput: bigint;
}

export interface ClaimRecord {
  seq: number;
  slot: number;
  kind: "protocol" | "creator" | "buyback_sweep";
  asset: "base" | "quote";
  amount: bigint;
  recipient: string;
}

export interface BuybackRecord {
  seq: number;
  slot: number;
  quoteSpent: bigint;
  popBought: bigint;
  popBurned: bigint;
  ok: boolean;
  error?: string;
}

export interface InventorySnapshot {
  seedBase: bigint;
  seedQuote: bigint;
  scarBase: bigint;
  scarQuote: bigint;
  pendingBaseEligible: bigint;
  pendingQuoteEligible: bigint;
  pendingBaseIneligible: bigint;
  pendingQuoteIneligible: bigint;
  unmaterializedSeedBase: bigint;
  unmaterializedSeedQuote: bigint;
  vaultBase: bigint;
  vaultQuote: bigint;
  feeVaultBase: bigint;
  feeVaultQuote: bigint;
  cursor: number;
  cursorPriceHuman: number;
}

export interface RunReport {
  name: string;
  description: string;
  configLabel: string;
  config: Record<string, string | number | boolean>;
  startingInventory: InventorySnapshot;
  endingInventory: InventorySnapshot;
  deposits: { seedBase: bigint; seedQuote: bigint };
  trades: TradeRecord[];
  tradeCount: { attempted: number; succeeded: number; failed: number };
  feesByDestination: {
    scarEligibleQuote: bigint;
    scarEligibleBase: bigint;
    scarIneligibleQuote: bigint;
    scarIneligibleBase: bigint;
    protocolQuoteOperating: bigint;
    protocolQuoteBuybackEarmark: bigint;
    protocolBase: bigint;
    creatorQuote: bigint;
    creatorBase: bigint;
  };
  withdrawals: ClaimRecord[];
  buybacks: BuybackRecord[];
  burnedBase: bigint;
  outstandingSupply: bigint;
  matched: {
    pairedQuoteLifetime: bigint;
    hardenedBands: number;
    graduationProgress: number;
    status: MarketState["status"];
    graduationEvents: number;
    bands: { band: number; pairedQuote: bigint; hardened: boolean }[];
  };
  depth: { direction: Direction; bps: number; input: bigint; output: bigint; bins: number }[];
  actors: (Actor & { quotePnL: bigint })[];
  reconciliation: { ok: boolean; expected: Reconciliation; ledgerBase: bigint; ledgerQuote: bigint };
  volume: { buyQuote: bigint; sellBase: bigint; swapCount: bigint };
  findings: string[];
  binsWithScars: number;
  binsWithCurrentQuote: number;
}

export interface SimulationOptions {
  name: string;
  description: string;
  config: MarketConfig;
  configLabel?: string;
  /** Initialize all pages up front (default true). */
  initAllPages?: boolean;
}

export class Simulation {
  readonly config: MarketConfig;
  readonly state: MarketState;
  readonly store: BinStore;
  readonly p0: bigint;
  readonly actors = new Map<string, Actor>();
  readonly trades: TradeRecord[] = [];
  readonly withdrawals: ClaimRecord[] = [];
  readonly buybacks: BuybackRecord[] = [];
  readonly findings: string[] = [];
  readonly name: string;
  readonly description: string;
  readonly configLabel: string;
  slot = 1;
  seq = 0;
  burnedBase = 0n;
  graduationEvents = 0;
  /** Total supply minted for this market's base token (seed + any published allocations). */
  totalMinted: bigint;
  // Independent ledger of physical flows into/out of the market's custody.
  private ledgerBaseIn = 0n;
  private ledgerBaseOut = 0n;
  private ledgerQuoteIn = 0n;
  private ledgerQuoteOut = 0n;
  private startingInventory: InventorySnapshot;

  constructor(opts: SimulationOptions) {
    this.config = opts.config;
    this.name = opts.name;
    this.description = opts.description;
    this.configLabel = opts.configLabel ?? (opts.config.configVersion >= 1000 ? "TEST thresholds" : "pilot defaults");
    this.state = newMarketState(opts.config);
    this.store = new BinStore(opts.config);
    if (opts.initAllPages ?? true) this.store.initAllPages(this.state);
    this.state.status = "active";
    this.p0 = quantizeP0(opts.config.seedQuote, opts.config.seedBase);
    this.totalMinted = opts.config.seedBase;
    this.startingInventory = this.snapshot();
  }

  actor(name: string, quote = 0n, base = 0n): Actor {
    let a = this.actors.get(name);
    if (!a) {
      a = { name, base, quote, quoteSpent: 0n, quoteReceived: 0n, baseBought: 0n, baseSold: 0n };
      this.actors.set(name, a);
    }
    return a;
  }

  fund(name: string, quote: bigint, base = 0n): Actor {
    const a = this.actor(name);
    a.quote += quote;
    a.base += base;
    return a;
  }

  priceHuman(bin: number): number {
    const p = priceAtBin(this.p0, bin);
    return (Number(p) / 2 ** 64) * 10 ** (this.config.baseDecimals - this.config.quoteDecimals);
  }

  /** Quote without committing. */
  quote(direction: Direction, grossInput: bigint, minOutput = 0n, internalBuyback = false): SwapOutcome {
    return quoteSwap(this.config, this.state, this.p0, (b) => this.store.get(b), {
      direction,
      grossInput,
      minOutput,
      internalBuyback,
      slot: BigInt(this.slot),
    });
  }

  /** Execute a swap for an actor. Failed swaps leave all state untouched. */
  swap(actorName: string, direction: Direction, grossInput: bigint, minOutput = 0n): TradeRecord {
    const actor = this.actor(actorName);
    const params: SwapParams = { direction, grossInput, minOutput, slot: BigInt(this.slot) };
    const rec: TradeRecord = { seq: ++this.seq, slot: this.slot, actor: actorName, direction, grossInput, ok: false, minOutput };
    const have = direction === "buy" ? actor.quote : actor.base;
    if (have < grossInput) {
      rec.error = "InsufficientActorBalance";
      this.trades.push(rec);
      this.slot++;
      return rec;
    }
    const q = quoteSwap(this.config, this.state, this.p0, (b) => this.store.get(b), params);
    if (!q.ok) {
      rec.error = `${q.error}: ${q.detail}`;
      rec.binsInspected = q.binsInspected;
      this.trades.push(rec);
      this.slot++;
      return rec;
    }
    const r = commitSwap(this.config, this.state, this.p0, (b) => this.store.getOrThrow(b), q, params);
    this.applyReceipt(actor, direction, grossInput, r, rec, false);
    this.trades.push(rec);
    this.slot++;
    return rec;
  }

  private applyReceipt(actor: Actor | null, direction: Direction, grossInput: bigint, r: SwapReceipt, rec: TradeRecord, internal: boolean) {
    const q = r.quote;
    if (direction === "buy") {
      if (actor) {
        actor.quote -= grossInput;
        actor.base += q.output;
        actor.quoteSpent += grossInput;
        actor.baseBought += q.output;
      }
      this.ledgerQuoteIn += grossInput;
      this.ledgerBaseOut += q.output;
    } else {
      if (actor) {
        actor.base -= grossInput;
        actor.quote += q.output;
        actor.quoteReceived += q.output;
        actor.baseSold += grossInput;
      }
      this.ledgerBaseIn += grossInput;
      this.ledgerQuoteOut += q.output;
    }
    rec.ok = true;
    rec.output = q.output;
    rec.scarFee = q.fees.scarFee;
    rec.protocolFee = q.fees.protocolFee;
    rec.creatorFee = q.fees.creatorFee;
    rec.binsInspected = q.binsInspected;
    rec.fills = q.fills.map((f) => ({ bin: f.bin, input: f.input, output: f.output, seedOut: f.seedOut, scarOut: f.scarOut, surplus: f.roundingSurplus }));
    rec.startBin = q.fills[0]!.bin;
    rec.endBin = q.newCursor;
    rec.avgPrice = q.avgPriceX64 === null ? null : (Number(q.avgPriceX64) / 2 ** 64) * 10 ** (this.config.baseDecimals - this.config.quoteDecimals);
    rec.scarsFormed = r.events.filter((e): e is Extract<MatchEvent, { type: "ScarFormed" }> => e.type === "ScarFormed").map((e) => ({ bin: e.bin, base: e.base, quote: e.quote }));
    const grads = r.events.filter((e) => e.type === "Graduated").length;
    this.graduationEvents += grads;
    rec.graduated = grads > 0;
    rec.internalBuyback = internal;
  }

  /** Permissionless keeper pass: try to match every initialized bin. Idempotent. */
  matchAllBins(): MatchEvent[] {
    const events: MatchEvent[] = [];
    for (const [id, bin] of this.store.entries()) {
      events.push(...matchBin(this.state, this.config, id, bin, priceAtBin(this.p0, id), BigInt(this.slot)));
    }
    this.graduationEvents += events.filter((e) => e.type === "Graduated").length;
    this.slot++;
    return events;
  }

  claimProtocol(asset: "base" | "quote", recipient = "protocol-treasury"): ClaimRecord {
    const amount = asset === "base" ? this.state.protocolClaimableBase : this.state.protocolClaimableQuote;
    if (asset === "base") this.state.protocolClaimableBase = 0n;
    else this.state.protocolClaimableQuote = 0n;
    return this.recordWithdrawal("protocol", asset, amount, recipient);
  }

  claimCreator(asset: "base" | "quote", recipient = "creator"): ClaimRecord {
    const amount = asset === "base" ? this.state.creatorClaimableBase : this.state.creatorClaimableQuote;
    if (asset === "base") this.state.creatorClaimableBase = 0n;
    else this.state.creatorClaimableQuote = 0n;
    return this.recordWithdrawal("creator", asset, amount, recipient);
  }

  /** Attempt to withdraw from locked custody. Always rejected: no such instruction exists. */
  attemptLockedWithdrawal(): { ok: false; error: string } {
    return { ok: false, error: "NoSuchInstruction: scar/seed custody has no withdrawal path" };
  }

  /** Sweep the buyback earmark out of this (non-POP) market into the buyback vault. */
  sweepBuyback(): ClaimRecord | { ok: false; error: string } {
    if (this.config.isPopMarket) return { ok: false, error: "BuybackSourceExcluded: POP market cannot fund buybacks" };
    const amount = this.state.buybackAccruedQuote;
    this.state.buybackAccruedQuote = 0n;
    return this.recordWithdrawal("buyback_sweep", "quote", amount, "buyback-vault");
  }

  private recordWithdrawal(kind: ClaimRecord["kind"], asset: "base" | "quote", amount: bigint, recipient: string): ClaimRecord {
    if (asset === "base") this.ledgerBaseOut += amount;
    else this.ledgerQuoteOut += amount;
    const rec: ClaimRecord = { seq: ++this.seq, slot: this.slot++, kind, asset, amount, recipient };
    this.withdrawals.push(rec);
    const a = this.actor(recipient);
    if (asset === "base") a.base += amount;
    else a.quote += amount;
    return rec;
  }

  /**
   * Execute a POP buyback on THIS market (must be the POP market) with realized funds from the
   * buyback vault: internal swap (scar fee ineligible, no protocol/creator fee), then burn.
   */
  executeBuyback(vault: Actor, quoteSpend: bigint, minPopOut: bigint, maxPriceHuman?: number): BuybackRecord {
    const rec: BuybackRecord = { seq: ++this.seq, slot: this.slot, quoteSpent: 0n, popBought: 0n, popBurned: 0n, ok: false };
    if (!this.config.isPopMarket) {
      rec.error = "NotPopMarket";
      this.buybacks.push(rec);
      return rec;
    }
    if (vault.quote < quoteSpend) {
      rec.error = "InsufficientBuybackFunds";
      this.buybacks.push(rec);
      return rec;
    }
    if (maxPriceHuman !== undefined && this.priceHuman(this.state.cursor) > maxPriceHuman) {
      rec.error = "ReferencePriceGuard";
      this.buybacks.push(rec);
      return rec;
    }
    const params: SwapParams = { direction: "buy", grossInput: quoteSpend, minOutput: minPopOut, internalBuyback: true, slot: BigInt(this.slot) };
    const q = quoteSwap(this.config, this.state, this.p0, (b) => this.store.get(b), params);
    if (!q.ok) {
      rec.error = `${q.error}: ${q.detail}`;
      this.buybacks.push(rec);
      return rec;
    }
    const r = commitSwap(this.config, this.state, this.p0, (b) => this.store.getOrThrow(b), q, params);
    const trade: TradeRecord = { seq: this.seq, slot: this.slot, actor: vault.name, direction: "buy", grossInput: quoteSpend, ok: false, minOutput: minPopOut };
    this.applyReceipt(vault, "buy", quoteSpend, r, trade, true);
    this.trades.push(trade);
    // Atomic burn of purchased POP.
    vault.base -= q.output;
    this.burnedBase += q.output;
    rec.ok = true;
    rec.quoteSpent = quoteSpend;
    rec.popBought = q.output;
    rec.popBurned = q.output;
    this.buybacks.push(rec);
    this.slot++;
    return rec;
  }

  snapshot(): InventorySnapshot {
    const r = reconcile(this.state, this.store);
    return {
      seedBase: r.binSeedBase,
      seedQuote: r.binSeedQuote,
      scarBase: r.binScarBase,
      scarQuote: r.binScarQuote,
      pendingBaseEligible: r.pendingBaseEligible,
      pendingQuoteEligible: r.pendingQuoteEligible,
      pendingBaseIneligible: r.pendingBaseIneligible,
      pendingQuoteIneligible: r.pendingQuoteIneligible,
      unmaterializedSeedBase: this.state.unmaterializedSeedBase,
      unmaterializedSeedQuote: this.state.unmaterializedSeedQuote,
      vaultBase: r.vaultBase,
      vaultQuote: r.vaultQuote,
      feeVaultBase: r.feeVaultBase,
      feeVaultQuote: r.feeVaultQuote,
      cursor: this.state.cursor,
      cursorPriceHuman: this.priceHuman(this.state.cursor),
    };
  }

  depthTable() {
    const out: RunReport["depth"] = [];
    for (const direction of ["buy", "sell"] as Direction[]) {
      for (const bps of [500, 1000, 2000]) {
        const d = executableDepth(this.config, this.state, this.p0, (b) => this.store.get(b), direction, bps);
        out.push({ direction, bps, input: d.input, output: d.output, bins: d.binsWithInventory });
      }
    }
    return out;
  }

  reconciliationCheck() {
    const expected = reconcile(this.state, this.store);
    const ledgerBase = this.config.seedBase + this.ledgerBaseIn - this.ledgerBaseOut;
    const ledgerQuote = this.config.seedQuote + this.ledgerQuoteIn - this.ledgerQuoteOut;
    const ok = expected.vaultBase + expected.feeVaultBase === ledgerBase && expected.vaultQuote + expected.feeVaultQuote === ledgerQuote;
    return { ok, expected, ledgerBase, ledgerQuote };
  }

  finding(text: string) {
    this.findings.push(text);
  }

  report(): RunReport {
    const c = this.config;
    let scarEligibleQuote = 0n, scarEligibleBase = 0n, scarIneligibleQuote = 0n, scarIneligibleBase = 0n;
    let protocolQuote = 0n, protocolBase = 0n, creatorQuote = 0n, creatorBase = 0n;
    for (const t of this.trades) {
      if (!t.ok) continue;
      if (t.direction === "buy") {
        if (t.internalBuyback) scarIneligibleQuote += t.scarFee!;
        else scarEligibleQuote += t.scarFee!;
        protocolQuote += t.protocolFee!;
        creatorQuote += t.creatorFee!;
      } else {
        if (t.internalBuyback) scarIneligibleBase += t.scarFee!;
        else scarEligibleBase += t.scarFee!;
        protocolBase += t.protocolFee!;
        creatorBase += t.creatorFee!;
      }
    }
    const buybackEarmark = c.isPopMarket ? 0n : (protocolQuote * BigInt(c.fees.buybackShareBps)) / 10_000n;
    let binsWithScars = 0, binsWithCurrentQuote = 0;
    for (const [, b] of this.store.entries()) {
      if (b.scarBase > 0n || b.scarQuote > 0n) binsWithScars++;
      if (availableQuote(b) > 0n) binsWithCurrentQuote++;
    }
    const bands = [...this.state.bands.entries()].sort((a, b) => a[0] - b[0]).map(([band, s]) => ({ band, pairedQuote: s.pairedQuote, hardened: s.hardened }));
    return {
      name: this.name,
      description: this.description,
      configLabel: this.configLabel,
      config: {
        seedBase: c.seedBase.toString(),
        seedQuote: c.seedQuote.toString(),
        binMin: c.binMin,
        binMax: c.binMax,
        maxBinsPerSwap: c.maxBinsPerSwap,
        scarFeeBps: c.fees.scarFeeBps,
        protocolFeeBps: c.fees.protocolFeeBps,
        creatorFeeBps: c.fees.creatorFeeBps,
        maturityQuoteTarget: c.maturityQuoteTarget.toString(),
        bandQuoteTarget: c.bandQuoteTarget.toString(),
        bandsRequired: c.bandsRequired,
        isPopMarket: c.isPopMarket,
        configVersion: c.configVersion,
        p0HumanQuotePerBase: this.priceHuman(0),
      },
      startingInventory: this.startingInventory,
      endingInventory: this.snapshot(),
      deposits: { seedBase: c.seedBase, seedQuote: c.seedQuote },
      trades: this.trades,
      tradeCount: { attempted: this.trades.length, succeeded: this.trades.filter((t) => t.ok).length, failed: this.trades.filter((t) => !t.ok).length },
      feesByDestination: {
        scarEligibleQuote, scarEligibleBase, scarIneligibleQuote, scarIneligibleBase,
        protocolQuoteOperating: protocolQuote - buybackEarmark,
        protocolQuoteBuybackEarmark: buybackEarmark,
        protocolBase, creatorQuote, creatorBase,
      },
      withdrawals: this.withdrawals,
      buybacks: this.buybacks,
      burnedBase: this.burnedBase,
      outstandingSupply: this.totalMinted - this.burnedBase,
      matched: {
        pairedQuoteLifetime: this.state.pairedQuoteLifetime,
        hardenedBands: this.state.hardenedBands,
        graduationProgress: graduationProgress(this.state, c),
        status: this.state.status,
        graduationEvents: this.graduationEvents,
        bands,
      },
      depth: this.depthTable(),
      actors: [...this.actors.values()].map((a) => ({ ...a, quotePnL: a.quoteReceived - a.quoteSpent })),
      reconciliation: this.reconciliationCheck(),
      volume: { buyQuote: this.state.totalBuyVolumeQuote, sellBase: this.state.totalSellVolumeBase, swapCount: this.state.swapCount },
      findings: this.findings,
      binsWithScars,
      binsWithCurrentQuote,
    };
  }
}

export const fmtSol = (x: bigint) => `${(Number(x) / Number(SOL)).toFixed(6)} SOL`;
export const fmtBase = (x: bigint, decimals = 6) => `${(Number(x) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Does a bin currently provide sell depth (quote inventory) or does it hold only tokens? */
export function binComposition(sim: Simulation, bin: number) {
  const b = sim.store.getOrThrow(bin);
  return { base: availableBase(b), quote: availableQuote(b), pendingQuote: b.pendingQuoteEligible, pendingBase: b.pendingBaseEligible, paired: b.pairedQuoteLifetime };
}

export function failureOf(r: TradeRecord | SwapFailure): string {
  return "error" in r && r.error ? String(r.error) : "";
}
