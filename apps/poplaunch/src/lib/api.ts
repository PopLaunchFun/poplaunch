import { API_URL } from "./config";
import type { Launch, LaunchState } from "./launch";

/** Launch record as served by launchd (`services/launchd/src/api.ts`). */
export interface LaunchDto {
  address: string;
  id: string;
  mint: string;
  creator: string;
  version: number;
  state: LaunchState;
  chainState: LaunchState;
  refundReason: number;
  name: string;
  symbol: string;
  uri: string;
  metadataHash: string;
  image: string | null;
  description: string | null;
  website: string | null;
  x: string | null;
  targetLamports: string;
  raisedLamports: string;
  pctBps: number;
  backerWallets: number;
  supply: string;
  decimals: number;
  backerAllocation: string;
  poolAllocation: string;
  openedAt: number;
  fundingDeadline: number;
  filledAt: number | null;
  settlementDeadline: number | null;
  liveAt: number | null;
  poolState: string | null;
  lpMint: string | null;
  lpBurned: string;
  settledQuote: string;
  settledBase: string;
  totalClaimed: string;
  totalRefunded: string;
  setupReserveFunded: string;
  setupReserveReclaimed: string;
  creationFeePaid: string;
  cpSwapProgram: string;
  ammConfig: string;
  updatedSlot: number;
  updatedAt: string;
  settlementAttempts: { signature: string | null; status: "sent" | "confirmed" | "failed"; error: string | null; createdAt: string }[];
}

export interface WalletEntry {
  launch: LaunchDto;
  receipt: { contributed: string; claimed: string; refunded: string; entitled: string };
  action: "claim" | "refund" | "wait" | "done";
}
export interface HistoryItem { signature: string; name: string; launch: string | null; data: Record<string, string>; slot: number; blockTime: number | null }
export interface StatusInfo { network: string; rpcHost: string; rpcOk: boolean; programId: string; keeper: { address: string | null; enabled: boolean; balanceSol: number | null; readyLaunches: { address: string; ageSec: number }[]; failedAttempts15m: number; lastSuccessAt: string | null }; chainSlot: number | null; scanSlot: number | null; scanUpdatedAt: string | null; lagSlots: number | null; alerts: string[]; counts: { launches: string; receipts: string; events: string }; time: string }

/** Route ids are mints or addresses: anything else never reaches the backend. */
export function isBase58Key(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  status: () => get<StatusInfo>("/api/status"),
  launches: (tab: "filling" | "launched" = "filling", q = "") => get<{ launches: LaunchDto[]; nextCursor: number | null; total: number; scanSlot: number | null; scanUpdatedAt: string | null; time: string }>(`/api/launches?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  launch: (id: string) => (isBase58Key(id) ? get<{ launch: LaunchDto; scanSlot: number | null; scanUpdatedAt: string | null; time: string }>(`/api/launches/${encodeURIComponent(id)}`) : Promise.resolve(null)),
  wallet: (address: string) => (isBase58Key(address) ? get<{ entries: WalletEntry[]; created: LaunchDto[]; history: HistoryItem[]; drafts: { mint: string; name: string; symbol: string; createdAt: string }[]; time: string }>(`/api/wallets/${encodeURIComponent(address)}/launches`) : Promise.resolve(null)),
  draft: (mint: string) => (isBase58Key(mint) ? get<{ draft: { mint: string; name: string; symbol: string; image: string; uri: string; metadataHash: string; publishedAt: string | null } }>(`/api/drafts/${encodeURIComponent(mint)}`) : Promise.resolve(null)),
  postDraft: async (form: FormData) => {
    const r = await fetch(`${API_URL}/api/drafts`, { method: "POST", body: form });
    const j = (await r.json()) as { ok?: boolean; error?: string; mint?: string; uri?: string; metadataHash?: string; image?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? "upload rejected");
    return j as { ok: true; mint: string; uri: string; metadataHash: string; image: string };
  },
};

/** Convert an API record into the UI's Launch shape (shared with the demo fixtures). */
export function toLaunch(d: LaunchDto): Launch {
  return {
    id: d.mint,
    address: d.address,
    name: d.name,
    ticker: d.symbol,
    hue: hueOf(d.mint),
    art: null,
    image: d.image,
    tagline: d.description ?? "",
    description: d.description ?? "",
    creator: d.creator,
    mint: d.mint,
    socials: { website: d.website ?? undefined, x: d.x ?? undefined },
    state: d.state,
    refundReason: d.refundReason === 1 ? "missed-target" : d.refundReason === 2 ? "settlement-timeout" : null,
    raisedLamports: d.raisedLamports,
    targetLamports: d.targetLamports,
    backerWallets: d.backerWallets,
    openedAt: d.openedAt * 1000,
    fundingDeadline: d.fundingDeadline * 1000,
    filledAt: d.filledAt ? d.filledAt * 1000 : null,
    settlementDeadline: d.settlementDeadline ? d.settlementDeadline * 1000 : null,
    liveAt: d.liveAt ? d.liveAt * 1000 : null,
    creatorContributionLamports: "0",
    poolUrl: null,
    poolState: d.poolState,
    lpBurned: d.lpBurned,
    supply: d.supply,
    decimals: d.decimals,
    backerAllocation: d.backerAllocation,
    poolAllocation: d.poolAllocation,
    settlementAttempts: d.settlementAttempts,
    updatedSlot: d.updatedSlot,
  };
}

function hueOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Index freshness: older than 30 s counts as stale and pages fall back to reading the chain. */
export function isStale(scanUpdatedAt: string | null | undefined): boolean {
  if (!scanUpdatedAt) return true;
  return Date.now() - Date.parse(scanUpdatedAt) > 30_000;
}
