/**
 * Market configuration and derived layout helpers (pages, bands, seed schedule).
 * All defaults are EXPERIMENTAL CALIBRATION CHOICES from the build brief, not validated economics.
 */
import { floorDiv, MathError } from "./fixed.js";

export interface FeeConfig {
  /** Fee routed to scar escrow for traversed bins, in basis points of gross input. */
  scarFeeBps: number;
  /** Protocol revenue, bps of gross input. */
  protocolFeeBps: number;
  /** Creator revenue, bps of gross input. */
  creatorFeeBps: number;
  /** Share of collected WSOL protocol fees earmarked for POP buyback on non-POP markets, bps. */
  buybackShareBps: number;
}

export interface MarketConfig {
  baseDecimals: number;
  quoteDecimals: number;
  /** Seed base atomic units committed to bins [0, binMax]. */
  seedBase: bigint;
  /** Seed quote atomic units committed to bins [binMin, -1]. */
  seedQuote: bigint;
  binMin: number;
  binMax: number;
  binsPerPage: number;
  bandSize: number;
  initialCursor: number;
  maxBinsPerSwap: number;
  fees: FeeConfig;
  /** Lifetime eligible paired quote required for graduation (atomic quote). */
  maturityQuoteTarget: bigint;
  /** Paired quote per band required for the band to count as hardened. */
  bandQuoteTarget: bigint;
  /** Number of hardened bands required. */
  bandsRequired: number;
  minQuoteIn: bigint;
  minBaseIn: bigint;
  /** POP's own market is excluded from buyback funding (self-referential loop). */
  isPopMarket: boolean;
  /** Config version this market was created under (immutable). */
  configVersion: number;
}

export const SOL = 1_000_000_000n;

/** Pilot defaults from the brief (section 3). Experimental calibration, not validated economics. */
export const POP_PILOT_DEFAULTS: MarketConfig = {
  baseDecimals: 6,
  quoteDecimals: 9,
  seedBase: 900_000_000n * 1_000_000n,
  seedQuote: 20n * SOL,
  binMin: -64,
  binMax: 511,
  binsPerPage: 16,
  bandSize: 10,
  initialCursor: 0,
  maxBinsPerSwap: 32,
  fees: { scarFeeBps: 150, protocolFeeBps: 25, creatorFeeBps: 25, buybackShareBps: 5000 },
  maturityQuoteTarget: 100n * SOL,
  bandQuoteTarget: 1n * SOL,
  bandsRequired: 10,
  minQuoteIn: 100_000n, // 0.0001 SOL
  minBaseIn: 1_000_000n, // 1 token at 6 decimals
  isPopMarket: true,
  configVersion: 1,
};

/** Defaults for a non-POP market launched through the factory: 100% supply to seed, same seed quote. */
export function factoryMarketDefaults(totalSupplyAtomic: bigint, baseDecimals = 6): MarketConfig {
  return { ...POP_PILOT_DEFAULTS, baseDecimals, seedBase: totalSupplyAtomic, isPopMarket: false };
}

/** Small thresholds for local-validator demonstrations. Clearly labeled TEST config; never for mainnet. */
export function testThresholds(cfg: MarketConfig): MarketConfig {
  return { ...cfg, maturityQuoteTarget: 1n * SOL, bandQuoteTarget: SOL / 100n, bandsRequired: 2, configVersion: 1000 };
}

export function validateConfig(c: MarketConfig): void {
  const bad = (m: string) => { throw new MathError("OutOfRange", `invalid market config: ${m}`); };
  if (c.binMin >= 0 || c.binMax <= 0) bad("binMin must be < 0 and binMax > 0");
  if (c.initialCursor !== 0) bad("initial cursor must be 0 in v1");
  if (c.binsPerPage <= 0 || c.bandSize <= 0) bad("page/band size");
  if (c.maxBinsPerSwap <= 0 || c.maxBinsPerSwap > 64) bad("maxBinsPerSwap");
  const f = c.fees;
  if (f.scarFeeBps + f.protocolFeeBps + f.creatorFeeBps >= 10_000) bad("fees >= 100%");
  if (f.buybackShareBps > 10_000) bad("buyback share");
  if (c.seedBase <= 0n || c.seedQuote <= 0n) bad("seed amounts");
  if (c.bandsRequired <= 0) bad("bandsRequired");
}

export function pageIndexOf(c: MarketConfig, bin: number): number {
  return floorDiv(bin, c.binsPerPage);
}

export function pageFirstBin(c: MarketConfig, pageIndex: number): number {
  return pageIndex * c.binsPerPage;
}

export function pageRange(c: MarketConfig): { minPage: number; maxPage: number } {
  return { minPage: pageIndexOf(c, c.binMin), maxPage: pageIndexOf(c, c.binMax) };
}

/** Territory band index: floor_div(bin, bandSize) with true floor division for negatives. */
export function bandIndexOf(c: MarketConfig, bin: number): number {
  return floorDiv(bin, c.bandSize);
}

export function bandRange(c: MarketConfig): { minBand: number; maxBand: number } {
  return { minBand: bandIndexOf(c, c.binMin), maxBand: bandIndexOf(c, c.binMax) };
}

export function isBinInRange(c: MarketConfig, bin: number): boolean {
  return bin >= c.binMin && bin <= c.binMax;
}

/**
 * Fixed seed schedule. Quote is uniform across [binMin, -1]; base is uniform across [0, binMax].
 * The remainder of the division goes one unit each to the lowest-id bins of that side so the
 * schedule sums exactly to the funded totals.
 */
export function seedAllocationForBin(c: MarketConfig, bin: number): { seedBase: bigint; seedQuote: bigint } {
  if (!isBinInRange(c, bin)) return { seedBase: 0n, seedQuote: 0n };
  if (bin < 0) {
    const n = BigInt(-c.binMin); // bins binMin..-1
    const per = c.seedQuote / n;
    const rem = c.seedQuote % n;
    const pos = BigInt(bin - c.binMin);
    return { seedBase: 0n, seedQuote: per + (pos < rem ? 1n : 0n) };
  }
  const n = BigInt(c.binMax + 1); // bins 0..binMax
  const per = c.seedBase / n;
  const rem = c.seedBase % n;
  const pos = BigInt(bin);
  return { seedBase: per + (pos < rem ? 1n : 0n), seedQuote: 0n };
}

/** Sum of the seed schedule over a page (used by lazy page initialization). */
export function seedAllocationForPage(c: MarketConfig, pageIndex: number): { seedBase: bigint; seedQuote: bigint } {
  let seedBase = 0n;
  let seedQuote = 0n;
  const first = pageFirstBin(c, pageIndex);
  for (let i = first; i < first + c.binsPerPage; i++) {
    const a = seedAllocationForBin(c, i);
    seedBase += a.seedBase;
    seedQuote += a.seedQuote;
  }
  return { seedBase, seedQuote };
}
