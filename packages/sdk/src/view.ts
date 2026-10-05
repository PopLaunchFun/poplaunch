/**
 * Convert raw on-chain accounts into the @pop/math types so quotes run the exact same integer
 * walker as the program.
 */
import type { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import {
  BinStore,
  floorDiv,
  type BinState,
  type MarketConfig,
  type MarketState,
  type MarketStatus,
} from "@pop/math";

type Big = BN | bigint | number;
const big = (x: Big): bigint => (typeof x === "bigint" ? x : BigInt(x.toString()));

/** Shape of the decoded `Market` account (camelCase as emitted by the Anchor IDL). */
export interface RawMarket {
  baseMint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  feeVaultBase: PublicKey;
  feeVaultQuote: PublicKey;
  p0X64: Big;
  binMin: number;
  binMax: number;
  binsPerPage: number;
  bandSize: number;
  maxBinsPerSwap: number;
  cursor: number;
  status: number;
  isPopMarket: boolean;
  configVersion: number;
  scarFeeBps: number;
  protocolFeeBps: number;
  creatorFeeBps: number;
  buybackShareBps: number;
  maturityQuoteTarget: Big;
  bandQuoteTarget: Big;
  bandsRequired: number;
  minQuoteIn: Big;
  minBaseIn: Big;
  baseDecimals: number;
  seedBaseTotal: Big;
  seedQuoteTotal: Big;
  unmaterializedSeedBase: Big;
  unmaterializedSeedQuote: Big;
  allocatedSupply: Big;
  vestingCount: number;
  pairedQuoteLifetime: Big;
  hardenedBands: number;
  bandPairedQuote: Big[];
  bandHardenedBits: Big;
  protocolClaimableBase: Big;
  protocolClaimableQuote: Big;
  creatorClaimableBase: Big;
  creatorClaimableQuote: Big;
  buybackAccruedQuote: Big;
  totalBuyVolumeQuote: Big;
  totalSellVolumeBase: Big;
  swapCount: Big;
  createdAtSlot: Big;
  activatedAtSlot: Big;
  activatedAtTs: Big;
  graduatedAtSlot: Big;
  name: string;
  symbol: string;
  uri: string;
  bump: number;
}

export interface RawBin {
  seedBase: Big;
  seedQuote: Big;
  scarBase: Big;
  scarQuote: Big;
  pendingBaseEligible: Big;
  pendingQuoteEligible: Big;
  pendingBaseIneligible: Big;
  pendingQuoteIneligible: Big;
  buyVolumeQuote: Big;
  sellVolumeBase: Big;
  pairedQuoteLifetime: Big;
  lastExecutionSlot: Big;
}

export interface RawBinPage {
  market: PublicKey;
  pageIndex: number;
  bump: number;
  bins: RawBin[];
}

export const STATUS: Record<number, MarketStatus> = { 0: "created", 1: "active", 2: "graduated" };

export function toMarketConfig(m: RawMarket): MarketConfig {
  return {
    baseDecimals: m.baseDecimals,
    quoteDecimals: 9,
    seedBase: big(m.seedBaseTotal),
    seedQuote: big(m.seedQuoteTotal),
    binMin: m.binMin,
    binMax: m.binMax,
    binsPerPage: m.binsPerPage,
    bandSize: m.bandSize,
    initialCursor: 0,
    maxBinsPerSwap: m.maxBinsPerSwap,
    fees: { scarFeeBps: m.scarFeeBps, protocolFeeBps: m.protocolFeeBps, creatorFeeBps: m.creatorFeeBps, buybackShareBps: m.buybackShareBps },
    maturityQuoteTarget: big(m.maturityQuoteTarget),
    bandQuoteTarget: big(m.bandQuoteTarget),
    bandsRequired: m.bandsRequired,
    minQuoteIn: big(m.minQuoteIn),
    minBaseIn: big(m.minBaseIn),
    isPopMarket: m.isPopMarket,
    configVersion: m.configVersion,
  };
}

export function toMarketState(m: RawMarket): MarketState {
  const cfg = toMarketConfig(m);
  const minBand = floorDiv(cfg.binMin, cfg.bandSize);
  const bits = big(m.bandHardenedBits);
  const bands = new Map<number, { pairedQuote: bigint; hardened: boolean }>();
  m.bandPairedQuote.forEach((v, i) => {
    const paired = big(v);
    const hardened = ((bits >> BigInt(i)) & 1n) === 1n;
    if (paired > 0n || hardened) bands.set(minBand + i, { pairedQuote: paired, hardened });
  });
  return {
    cursor: m.cursor,
    status: STATUS[m.status] ?? "created",
    pairedQuoteLifetime: big(m.pairedQuoteLifetime),
    hardenedBands: m.hardenedBands,
    bands,
    protocolClaimableBase: big(m.protocolClaimableBase),
    protocolClaimableQuote: big(m.protocolClaimableQuote),
    creatorClaimableBase: big(m.creatorClaimableBase),
    creatorClaimableQuote: big(m.creatorClaimableQuote),
    buybackAccruedQuote: big(m.buybackAccruedQuote),
    unmaterializedSeedBase: big(m.unmaterializedSeedBase),
    unmaterializedSeedQuote: big(m.unmaterializedSeedQuote),
    totalBuyVolumeQuote: big(m.totalBuyVolumeQuote),
    totalSellVolumeBase: big(m.totalSellVolumeBase),
    swapCount: big(m.swapCount),
    graduatedAtSlot: big(m.graduatedAtSlot) === 0n ? null : big(m.graduatedAtSlot),
  };
}

export function toBinState(b: RawBin): BinState {
  return {
    seedBase: big(b.seedBase),
    seedQuote: big(b.seedQuote),
    scarBase: big(b.scarBase),
    scarQuote: big(b.scarQuote),
    pendingBaseEligible: big(b.pendingBaseEligible),
    pendingQuoteEligible: big(b.pendingQuoteEligible),
    pendingBaseIneligible: big(b.pendingBaseIneligible),
    pendingQuoteIneligible: big(b.pendingQuoteIneligible),
    buyVolumeQuote: big(b.buyVolumeQuote),
    sellVolumeBase: big(b.sellVolumeBase),
    pairedQuoteLifetime: big(b.pairedQuoteLifetime),
    lastExecutionSlot: big(b.lastExecutionSlot),
  };
}

/** Build a BinStore from fetched pages. Missing pages stay absent (quotes report PageNotInitialized). */
export function toBinStore(cfg: MarketConfig, pages: RawBinPage[]): BinStore {
  const store = new BinStore(cfg);
  for (const p of pages) store.pages.set(p.pageIndex, p.bins.map(toBinState));
  return store;
}
