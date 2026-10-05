"use client";
/**
 * Per-wallet pending launch record in localStorage so an interrupted creation can resume without
 * creating a second mint. The mint secret is kept only until create_market is confirmed.
 */
export interface PendingLaunch {
  mintPubkey: string;
  mintSecret?: number[];
  name: string;
  symbol: string;
  uri: string;
  seedQuote: string;
  metadata: { imageUrl?: string; description?: string; website?: string; twitter?: string; telegram?: string };
  step: "created" | "pages" | "activated" | "metadata";
  signatures: Record<string, string>;
  updatedAt: number;
}

const key = (wallet: string) => `pop:launch:v2:${wallet}`;

export function loadPending(wallet: string): PendingLaunch | null {
  try {
    const raw = localStorage.getItem(key(wallet));
    return raw ? (JSON.parse(raw) as PendingLaunch) : null;
  } catch {
    return null;
  }
}

export function savePending(wallet: string, p: PendingLaunch): void {
  try {
    localStorage.setItem(key(wallet), JSON.stringify({ ...p, updatedAt: Date.now() }));
  } catch {
    /* storage unavailable: resume will rely on the on-chain creator lookup */
  }
}

export function clearPending(wallet: string): void {
  try {
    localStorage.removeItem(key(wallet));
  } catch {
    /* ignore */
  }
}
