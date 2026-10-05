import type { FeeConfig } from "./config.js";
import { checkedSubU64 } from "./fixed.js";

export interface FeeBreakdown {
  gross: bigint;
  scarFee: bigint;
  protocolFee: bigint;
  creatorFee: bigint;
  tradable: bigint;
}

/** Fees are floor(input * bps / 10000) of the GROSS input, each computed independently. */
export function splitFees(gross: bigint, fees: FeeConfig): FeeBreakdown {
  const scarFee = (gross * BigInt(fees.scarFeeBps)) / 10_000n;
  const protocolFee = (gross * BigInt(fees.protocolFeeBps)) / 10_000n;
  const creatorFee = (gross * BigInt(fees.creatorFeeBps)) / 10_000n;
  let tradable = checkedSubU64(gross, scarFee);
  tradable = checkedSubU64(tradable, protocolFee);
  tradable = checkedSubU64(tradable, creatorFee);
  return { gross, scarFee, protocolFee, creatorFee, tradable };
}

/** Split of the quote protocol fee: buyback escrow earmark vs. operations. Applies to every market. */
export function splitProtocolQuoteFee(protocolFee: bigint, buybackShareBps: number): { buyback: bigint; operating: bigint } {
  const buyback = (protocolFee * BigInt(buybackShareBps)) / 10_000n;
  return { buyback, operating: protocolFee - buyback };
}

export interface BinShare {
  bin: number;
  amount: bigint;
}

/**
 * Largest-remainder allocation of `total` across bins proportional to `weights`
 * (executed net input per visited bin). Ties in remainder are broken by ascending bin id.
 * The result sums exactly to `total`. Bins with zero weight receive nothing.
 */
export function largestRemainder(total: bigint, weights: { bin: number; weight: bigint }[]): BinShare[] {
  const positive = weights.filter((w) => w.weight > 0n);
  if (total === 0n || positive.length === 0) return [];
  const sum = positive.reduce((a, w) => a + w.weight, 0n);
  const rows = positive.map((w) => {
    const prod = total * w.weight;
    return { bin: w.bin, amount: prod / sum, rem: prod % sum };
  });
  let assigned = rows.reduce((a, r) => a + r.amount, 0n);
  let leftover = total - assigned;
  // Sort a copy by (remainder desc, bin asc) and hand out the leftover units.
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? a.bin - b.bin : a.rem > b.rem ? -1 : 1));
  for (const r of order) {
    if (leftover === 0n) break;
    r.amount += 1n;
    leftover -= 1n;
  }
  assigned = rows.reduce((a, r) => a + r.amount, 0n);
  if (assigned !== total) throw new Error("largestRemainder invariant violated");
  return rows.map((r) => ({ bin: r.bin, amount: r.amount }));
}
