/**
 * Shared launch types and integer accounting for Pop Launch.
 * Amounts are lamports / token base units. Accounting never uses floating point.
 */

export type LaunchState = "funding" | "ready" | "live" | "refundable";

export const STATE_LABEL: Record<LaunchState, string> = {
  funding: "Filling up",
  ready: "Getting ready",
  live: "Live",
  refundable: "Refund available",
};

/** V1 protocol settings (versioned; apply to new launches only). */
export const V1 = {
  version: 1,
  targetLamports: 50_000_000_000n, // 50 SOL
  fundingWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  settlementTimeoutMs: 60 * 60 * 1000, // 60 minutes
  supplyBaseUnits: 1_000_000_000_000_000n, // 1,000,000,000 tokens × 10^6
  decimals: 6,
  backerAllocation: 500_000_000_000_000n, // 500,000,000 tokens
  poolAllocation: 500_000_000_000_000n, // 500,000,000 tokens
  creationFeeLamports: 100_000_000n, // 0.1 SOL, separate and disclosed
  minContributionLamports: 10_000_000n, // 0.01 SOL, except the exact final remainder
  dex: "Raydium CPMM (to be verified in Stage 2)",
  lpPolicy: "LP tokens will be burned at launch",
} as const;

export const LAMPORTS_PER_SOL = 1_000_000_000n;

export interface SocialLinks { website?: string; x?: string }

/** Demo artwork: extracted balloon PNGs. Production launches use `image` inside the SVG balloon frame. */
export interface LaunchArt { balloon: string; featured: string | null; color: "red" | "green" | "yellow" }

export interface Launch {
  id: string;
  name: string;
  ticker: string;
  /** Hue (0–360) for the deterministic demo avatar. */
  hue: number;
  art?: LaunchArt | null;
  /** Creator-uploaded artwork URL (production). */
  image?: string | null;
  tagline: string;
  description: string;
  creator: string;
  mint: string;
  socials: SocialLinks;
  state: LaunchState;
  /** Confirmed contribution total in lamports, as a decimal string (BigInt-safe across the server/client boundary). */
  raisedLamports: string;
  targetLamports: string;
  /** Unique contributing wallets (not people; can be manipulated). */
  backerWallets: number;
  openedAt: number;
  fundingDeadline: number;
  filledAt: number | null;
  settlementDeadline: number | null;
  liveAt: number | null;
  /** Why the launch became refundable, when it did. */
  refundReason: "missed-target" | "settlement-timeout" | null;
  /** Creator's own backing on the same terms, lamports string. */
  creatorContributionLamports: string;
  poolUrl: string | null;
}

/** Entitlement = floor(contribution × backerAllocation / target). */
export function entitlementBaseUnits(contributionLamports: bigint, targetLamports: bigint, backerAllocation: bigint): bigint {
  if (contributionLamports <= 0n || targetLamports <= 0n) return 0n;
  return (contributionLamports * backerAllocation) / targetLamports;
}

/** Launch price = target / pool allocation, in lamports per whole token (6 decimals), shown as SOL per token. */
export function launchPriceSolPerToken(targetLamports: bigint, poolAllocation: bigint, decimals: number): string {
  // (target / 1e9) / (pool / 10^decimals) = target × 10^decimals / (pool × 1e9)
  const num = targetLamports * 10n ** BigInt(decimals);
  const den = poolAllocation * LAMPORTS_PER_SOL;
  return fmtRatio(num, den, 10);
}

/** Exact decimal string for num/den with up to `places` fractional digits, trailing zeros trimmed. */
export function fmtRatio(num: bigint, den: bigint, places: number): string {
  const whole = num / den;
  let rem = num % den;
  let frac = "";
  for (let i = 0; i < places && rem > 0n; i++) {
    rem *= 10n;
    frac += (rem / den).toString();
    rem %= den;
  }
  frac = frac.replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Lamports → "12.5" (SOL), exact, no floating point; trims trailing zeros, keeps at most `places`. */
export function fmtSol(lamports: bigint | string, places = 4): string {
  const v = BigInt(lamports);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / LAMPORTS_PER_SOL;
  const rem = abs % LAMPORTS_PER_SOL;
  let frac = rem.toString().padStart(9, "0").slice(0, places).replace(/0+$/, "");
  const w = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${w}${frac ? "." + frac : ""}`;
}

/** Token base units → "10,000,000" whole tokens (floor), for display only. */
export function fmtTokens(baseUnits: bigint, decimals: number): string {
  const whole = baseUnits / 10n ** BigInt(decimals);
  return whole.toLocaleString("en-US");
}

/** Percent funded with one decimal, computed in integers (basis points). */
export function pctFunded(raised: bigint, target: bigint): { bps: number; text: string } {
  if (target <= 0n) return { bps: 0, text: "0%" };
  const bps = Number((raised * 10_000n) / target);
  const whole = Math.floor(bps / 100);
  const tenth = Math.floor((bps % 100) / 10);
  return { bps, text: tenth === 0 || whole >= 100 ? `${whole}%` : `${whole}.${tenth}%` };
}

/** Balloon scale: gentle bounded curve, not literal percentage-to-area. */
export function balloonScale(bps: number): number {
  const p = Math.max(0, Math.min(1, bps / 10_000));
  return 0.62 + 0.38 * Math.sqrt(p);
}

/** Discovery sort: highest percentage funded, then soonest deadline, then launch id. */
export function sortForDiscovery(a: Launch, b: Launch): number {
  const pa = pctFunded(BigInt(a.raisedLamports), BigInt(a.targetLamports)).bps;
  const pb = pctFunded(BigInt(b.raisedLamports), BigInt(b.targetLamports)).bps;
  if (pb !== pa) return pb - pa;
  if (a.fundingDeadline !== b.fundingDeadline) return a.fundingDeadline - b.fundingDeadline;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function remainingLamports(l: Launch): bigint {
  const r = BigInt(l.targetLamports) - BigInt(l.raisedLamports);
  return r > 0n ? r : 0n;
}

/** Parse a user-typed SOL amount into lamports exactly (max 9 decimals). Returns null when invalid. */
export function parseSol(input: string): bigint | null {
  const m = input.trim().match(/^(\d+)(?:\.(\d{0,9}))?$/);
  if (!m) return null;
  const whole = BigInt(m[1]!);
  const frac = (m[2] ?? "").padEnd(9, "0");
  return whole * LAMPORTS_PER_SOL + BigInt(frac);
}

export function short(addr: string, n = 4): string {
  return addr.length <= 2 * n + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`;
}
