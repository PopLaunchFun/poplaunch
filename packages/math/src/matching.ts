import type { MarketConfig } from "./config.js";
import { bandIndexOf } from "./config.js";
import type { BinState } from "./bin.js";
import { baseForQuoteFloor, minBig, quoteForBaseCeil } from "./fixed.js";
import { bandOf, type MarketState } from "./state.js";

export interface ScarFormedEvent {
  type: "ScarFormed";
  bin: number;
  base: bigint;
  quote: bigint;
}

export interface GraduatedEvent {
  type: "Graduated";
  pairedQuoteLifetime: bigint;
  hardenedBands: number;
  slot: bigint;
}

export interface BandHardenedEvent {
  type: "BandHardened";
  band: number;
  pairedQuote: bigint;
}

export type MatchEvent = ScarFormedEvent | GraduatedEvent | BandHardenedEvent;

/**
 * Match eligible pending base and quote escrow at a fixed bin.
 * Let B = eligible pending base, Q = eligible pending quote, P = bin price.
 * Choose the largest integer b <= B with q = ceil(b * P) <= Q.
 * Proof that b = min(B, floor(Q / P)) satisfies the bound: floor(Q/P) * P <= Q and Q is an
 * integer, so ceil(floor(Q/P) * P) <= Q. q is RECOMPUTED from b (never rounded independently).
 */
export function matchEligibleAtBin(bin: BinState, priceX64: bigint): { base: bigint; quote: bigint } | null {
  const B = bin.pendingBaseEligible;
  const Q = bin.pendingQuoteEligible;
  if (B === 0n || Q === 0n) return null;
  const b = minBig(B, baseForQuoteFloor(Q, priceX64));
  if (b === 0n) return null;
  const q = quoteForBaseCeil(b, priceX64);
  if (q === 0n) return null;
  if (q > Q) throw new Error("matching invariant violated: q > Q");
  bin.pendingBaseEligible = B - b;
  bin.pendingQuoteEligible = Q - q;
  bin.scarBase += b;
  bin.scarQuote += q;
  bin.pairedQuoteLifetime += q;
  return { base: b, quote: q };
}

/**
 * Apply a matched quote amount to maturity counters (bin band + market), then evaluate graduation.
 * Graduation is a one-way status transition derived from stored counters only.
 */
export function applyMaturity(
  state: MarketState,
  c: MarketConfig,
  bin: number,
  pairedQuote: bigint,
  slot: bigint,
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const band = bandOf(state, c, bin);
  band.pairedQuote += pairedQuote;
  state.pairedQuoteLifetime += pairedQuote;
  if (!band.hardened && band.pairedQuote >= c.bandQuoteTarget) {
    band.hardened = true;
    state.hardenedBands += 1;
    events.push({ type: "BandHardened", band: bandIndexOf(c, bin), pairedQuote: band.pairedQuote });
  }
  if (
    state.status === "active" &&
    state.pairedQuoteLifetime >= c.maturityQuoteTarget &&
    state.hardenedBands >= c.bandsRequired
  ) {
    state.status = "graduated";
    state.graduatedAtSlot = slot;
    events.push({
      type: "Graduated",
      pairedQuoteLifetime: state.pairedQuoteLifetime,
      hardenedBands: state.hardenedBands,
      slot,
    });
  }
  return events;
}

/** Match a single bin and update maturity. Permissionless on-chain (`match_bins`). */
export function matchBin(
  state: MarketState,
  c: MarketConfig,
  binId: number,
  bin: BinState,
  priceX64: bigint,
  slot: bigint,
): MatchEvent[] {
  const m = matchEligibleAtBin(bin, priceX64);
  if (!m) return [];
  const events: MatchEvent[] = [{ type: "ScarFormed", bin: binId, base: m.base, quote: m.quote }];
  events.push(...applyMaturity(state, c, binId, m.quote, slot));
  return events;
}
