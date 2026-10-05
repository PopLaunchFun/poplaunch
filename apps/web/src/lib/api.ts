import { API_URL } from "./config";

export interface DepthEntry { input: string; output: string; bins: number }
export interface MarketSummary {
  address: string; baseMint: string; creator: string; name: string; symbol: string; uri: string;
  isPopMarket: boolean; status: "created" | "active" | "graduated"; configVersion: number; baseDecimals: number;
  cursor: number; cursorPriceX64: string; p0X64: string; binMin: number; binMax: number;
  fees: { scarFeeBps: number; protocolFeeBps: number; creatorFeeBps: number; buybackShareBps: number };
  seedBase: string; seedQuote: string; unmaterializedSeedBase: string; unmaterializedSeedQuote: string; missingPages: number[];
  currentInventory: { seedBase: string; seedQuote: string; scarBase: string; scarQuote: string; pendingBaseEligible: string; pendingQuoteEligible: string; pendingBaseIneligible: string; pendingQuoteIneligible: string; vaultBase: string; vaultQuote: string; feeVaultBase: string; feeVaultQuote: string };
  maturity: { pairedQuoteLifetime: string; maturityQuoteTarget: string; hardenedBands: number; bandsRequired: number; bandQuoteTarget: string; progress: number; graduatedAtSlot: string | null; bands: { band: number; pairedQuote: string; hardened: boolean }[] };
  depth: Record<"buy5" | "buy10" | "buy20" | "sell5" | "sell10" | "sell20", DepthEntry>;
  revenue: { protocolClaimableBase: string; protocolClaimableQuote: string; creatorClaimableBase: string; creatorClaimableQuote: string; buybackAccruedQuote: string };
  volume: { buyQuote: string; sellBase: string; swapCount: string };
  supply: { seedBase: string; allocated: string; vestingCount: number };
  activatedAtSlot: string; activatedAtTs: string; createdAtSlot: string; snapshotSlot: number;
}
export interface Trade { signature: string; event_index: number; trader: string; is_buy: boolean; gross_input: string; output: string; scar_fee: string; protocol_fee: string; creator_fee: string; bins_inspected: number; start_bin: number; end_bin: number; internal_buyback: boolean; avg_price: number | null; slot: string; block_time: string | null; finalized: boolean }
export interface Candle { bucket: string; open: number; high: number; low: number; close: number; volume_quote: string; volume_base: string; trades: number }
export interface BinRow { bin: number; priceX64: string; seedBase: string; seedQuote: string; scarBase: string; scarQuote: string; pendingBaseEligible: string; pendingQuoteEligible: string; pendingBaseIneligible: string; pendingQuoteIneligible: string; buyVolumeQuote: string; sellVolumeBase: string; pairedQuoteLifetime: string; lastExecutionSlot: string; touched: boolean }
export interface ScarRow { signature: string; event_index: number; bin_id: number; base: string; quote: string; bin_paired_lifetime: string; market_paired_lifetime: string; slot: string; block_time: string | null; finalized: boolean }
export interface StatusInfo { network: string; rpcUrl: string; rpcOk: boolean; programId: string; program: { executable: boolean; owner: string; upgradeAuthority: string | null; programDataAddress: string | null; lamports: number } | null; gitCommit: string; chainSlot: number | null; indexer: { lastSlot: number | null; updatedAt: string | null; lagSlots: number | null; unfinalizedEvents: number; uptimeSec: number }; snapshot: { slot: number | null; updatedAt: string | null }; time: string }
export interface PopInfo { protocol: { version: number; authority: string; protocolFeeRecipient: string; buybackAuthority: string; popMint: string; popMarket: string; launchesEnabled: boolean; marketCount: string; settings: Record<string, string | number> }; buyback: { authority: string; quoteAccount: string; totalReceived: string; totalSpent: string; totalBurned: string; lastExecutionSlot: string; minIntervalSlots: string; maxSpendPerExecution: string; executionCount: string }; vestings: { address: string; beneficiary: string; vault: string; index: number; total: string; claimed: string; startOffset: string; cliffOffset: string; endOffset: string; label: string }[]; buybackHistory: { signature: string; event_index: number; data: Record<string, string | boolean | number>; slot: string; block_time: string | null; finalized: boolean }[]; popMarket: MarketSummary | null; snapshotSlot: number; updatedAt: string }
export interface Totals { markets: string; trades: string; scars: string; paired: string; graduated: string }

async function get<T>(path: string, revalidate = 0): Promise<T | null> {
  try {
    const r = await fetch(`${API_URL}${path}`, { cache: "no-store", next: revalidate ? { revalidate } : undefined });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  status: () => get<StatusInfo>("/api/status"),
  totals: () => get<{ totals: Totals }>("/api/totals"),
  markets: () => get<{ markets: MarketSummary[] }>("/api/markets"),
  market: (address: string) => get<{ market: MarketSummary; updatedAt: string }>(`/api/markets/${address}`),
  bins: (address: string) => get<{ bins: BinRow[]; snapshotSlot: number; updatedAt: string }>(`/api/markets/${address}/bins`),
  trades: (address: string, limit = 50) => get<{ trades: Trade[]; programId: string }>(`/api/markets/${address}/trades?limit=${limit}`),
  candles: (address: string, interval = "5m", limit = 300) => get<{ interval: string; candles: Candle[] }>(`/api/markets/${address}/candles?interval=${interval}&limit=${limit}`),
  scars: (address: string, limit = 100) => get<{ scars: ScarRow[] }>(`/api/markets/${address}/scars?limit=${limit}`),
  pop: () => get<PopInfo>("/api/pop"),
};
