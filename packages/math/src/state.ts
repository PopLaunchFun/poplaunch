import type { MarketConfig } from "./config.js";
import { bandIndexOf, seedAllocationForPage, pageRange, pageFirstBin, seedAllocationForBin, validateConfig } from "./config.js";
import { emptyBin, totalBase, totalQuote, type BinState } from "./bin.js";

export type MarketStatus = "created" | "active" | "graduated";

export interface BandState {
  pairedQuote: bigint;
  hardened: boolean;
}

/** Market-level mutable state (mirrors the on-chain Market account). */
export interface MarketState {
  cursor: number;
  status: MarketStatus;
  pairedQuoteLifetime: bigint;
  hardenedBands: number;
  bands: Map<number, BandState>;
  protocolClaimableBase: bigint;
  protocolClaimableQuote: bigint;
  creatorClaimableBase: bigint;
  creatorClaimableQuote: bigint;
  /** Quote earmarked for POP buyback (non-POP markets only); physically in the fee vault until swept. */
  buybackAccruedQuote: bigint;
  unmaterializedSeedBase: bigint;
  unmaterializedSeedQuote: bigint;
  totalBuyVolumeQuote: bigint;
  totalSellVolumeBase: bigint;
  swapCount: bigint;
  graduatedAtSlot: bigint | null;
}

export function newMarketState(c: MarketConfig): MarketState {
  validateConfig(c);
  return {
    cursor: c.initialCursor,
    status: "created",
    pairedQuoteLifetime: 0n,
    hardenedBands: 0,
    bands: new Map(),
    protocolClaimableBase: 0n,
    protocolClaimableQuote: 0n,
    creatorClaimableBase: 0n,
    creatorClaimableQuote: 0n,
    buybackAccruedQuote: 0n,
    unmaterializedSeedBase: c.seedBase,
    unmaterializedSeedQuote: c.seedQuote,
    totalBuyVolumeQuote: 0n,
    totalSellVolumeBase: 0n,
    swapCount: 0n,
    graduatedAtSlot: null,
  };
}

/** In-memory page store; the on-chain equivalent is one BinPage account per page index. */
export class BinStore {
  readonly pages = new Map<number, BinState[]>();
  constructor(readonly config: MarketConfig) {}

  hasPage(pageIndex: number): boolean {
    return this.pages.has(pageIndex);
  }

  /**
   * Lazily materialize a page: assigns the fixed seed schedule exactly once and debits the
   * market's unmaterialized counters. Re-initialization is rejected.
   */
  initPage(state: MarketState, pageIndex: number): void {
    const { minPage, maxPage } = pageRange(this.config);
    if (pageIndex < minPage || pageIndex > maxPage) throw new Error(`page ${pageIndex} out of range`);
    if (this.pages.has(pageIndex)) throw new Error(`page ${pageIndex} already initialized`);
    const bins: BinState[] = [];
    const first = pageFirstBin(this.config, pageIndex);
    for (let i = first; i < first + this.config.binsPerPage; i++) {
      const b = emptyBin();
      const a = seedAllocationForBin(this.config, i);
      b.seedBase = a.seedBase;
      b.seedQuote = a.seedQuote;
      bins.push(b);
    }
    const tot = seedAllocationForPage(this.config, pageIndex);
    if (tot.seedBase > state.unmaterializedSeedBase || tot.seedQuote > state.unmaterializedSeedQuote) {
      throw new Error("seed schedule exceeds unmaterialized balance");
    }
    state.unmaterializedSeedBase -= tot.seedBase;
    state.unmaterializedSeedQuote -= tot.seedQuote;
    this.pages.set(pageIndex, bins);
  }

  initAllPages(state: MarketState): void {
    const { minPage, maxPage } = pageRange(this.config);
    for (let p = minPage; p <= maxPage; p++) if (!this.pages.has(p)) this.initPage(state, p);
  }

  /** Returns undefined if the page holding `bin` is not initialized. */
  get(bin: number): BinState | undefined {
    const pageIndex = Math.floor(bin / this.config.binsPerPage);
    const page = this.pages.get(pageIndex);
    if (!page) return undefined;
    return page[bin - pageIndex * this.config.binsPerPage];
  }

  getOrThrow(bin: number): BinState {
    const b = this.get(bin);
    if (!b) throw new Error(`page for bin ${bin} not initialized`);
    return b;
  }

  *entries(): IterableIterator<[number, BinState]> {
    const keys = [...this.pages.keys()].sort((a, b) => a - b);
    for (const p of keys) {
      const page = this.pages.get(p)!;
      for (let k = 0; k < page.length; k++) yield [p * this.config.binsPerPage + k, page[k]!];
    }
  }
}

export interface Reconciliation {
  /** Expected balance of the locked base trading vault. */
  vaultBase: bigint;
  /** Expected balance of the locked quote trading vault. */
  vaultQuote: bigint;
  /** Expected balance of the withdrawable base fee vault. */
  feeVaultBase: bigint;
  /** Expected balance of the withdrawable quote fee vault (includes buyback earmark until swept). */
  feeVaultQuote: bigint;
  binSeedBase: bigint;
  binSeedQuote: bigint;
  binScarBase: bigint;
  binScarQuote: bigint;
  pendingBaseEligible: bigint;
  pendingQuoteEligible: bigint;
  pendingBaseIneligible: bigint;
  pendingQuoteIneligible: bigint;
}

/** Account sums that must equal physical vault balances at all times. */
export function reconcile(state: MarketState, store: BinStore): Reconciliation {
  const r: Reconciliation = {
    vaultBase: state.unmaterializedSeedBase,
    vaultQuote: state.unmaterializedSeedQuote,
    feeVaultBase: state.protocolClaimableBase + state.creatorClaimableBase,
    feeVaultQuote: state.protocolClaimableQuote + state.creatorClaimableQuote + state.buybackAccruedQuote,
    binSeedBase: 0n,
    binSeedQuote: 0n,
    binScarBase: 0n,
    binScarQuote: 0n,
    pendingBaseEligible: 0n,
    pendingQuoteEligible: 0n,
    pendingBaseIneligible: 0n,
    pendingQuoteIneligible: 0n,
  };
  for (const [, b] of store.entries()) {
    r.vaultBase += totalBase(b);
    r.vaultQuote += totalQuote(b);
    r.binSeedBase += b.seedBase;
    r.binSeedQuote += b.seedQuote;
    r.binScarBase += b.scarBase;
    r.binScarQuote += b.scarQuote;
    r.pendingBaseEligible += b.pendingBaseEligible;
    r.pendingQuoteEligible += b.pendingQuoteEligible;
    r.pendingBaseIneligible += b.pendingBaseIneligible;
    r.pendingQuoteIneligible += b.pendingQuoteIneligible;
  }
  return r;
}

export function bandOf(state: MarketState, c: MarketConfig, bin: number): BandState {
  const idx = bandIndexOf(c, bin);
  let b = state.bands.get(idx);
  if (!b) {
    b = { pairedQuote: 0n, hardened: false };
    state.bands.set(idx, b);
  }
  return b;
}

/** Graduation progress in [0,1] = min(1, paired/target, hardened/required). */
export function graduationProgress(state: MarketState, c: MarketConfig): number {
  const a = Number(state.pairedQuoteLifetime) / Number(c.maturityQuoteTarget);
  const b = state.hardenedBands / c.bandsRequired;
  return Math.min(1, a, b);
}
