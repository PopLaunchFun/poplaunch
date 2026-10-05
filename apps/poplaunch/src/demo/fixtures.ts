import type { Launch, LaunchState } from "@/lib/launch";
import { V1 } from "@/lib/launch";

/**
 * DEMO FIXTURES. Every launch here is an invented example for the Stage 1 visual slice.
 * Numbers, wallets and backers are made up. Nothing is on chain. These fixtures never
 * feed a production feed; `isDemo()` gates everything that reads them.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const H = 60 * 60 * 1000;
const SOL = 1_000_000_000n;
const target = V1.targetLamports.toString();

// Fake but well-formed base58 strings so address rendering is exercised.
const addr = (seed: string) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let h = 7;
  let out = "";
  for (let i = 0; i < 44; i++) {
    h = (h * 31 + seed.charCodeAt(i % seed.length) + i) % 100_003;
    out += alphabet[h % alphabet.length];
  }
  return out;
};

type Seed = Omit<Launch, "targetLamports" | "creator" | "mint" | "openedAt" | "fundingDeadline" | "filledAt" | "settlementDeadline" | "liveAt" | "refundReason" | "poolUrl" | "creatorContributionLamports"> & {
  openedHoursAgo: number;
  creatorSol?: bigint;
};

const seeds: Seed[] = [
  { id: "demo-moonberry", name: "Moonberry", ticker: "MOON", hue: 262, glyph: "🫐", tagline: "A berry for the moon crowd.", description: "Moonberry is a demo launch used to show what a healthy, mid-funded balloon looks like. Nothing about it is real.", socials: { website: "https://example.com", x: "moonberry" }, state: "funding", raisedLamports: (36n * SOL + 500_000_000n).toString(), backerWallets: 212, openedHoursAgo: 15, creatorSol: 2n * SOL },
  { id: "demo-pixel-pup", name: "Pixel Pup", ticker: "PUP", hue: 28, glyph: "🐶", tagline: "Eight bits of good boy.", description: "Demo launch close to its target.", socials: { x: "pixelpup" }, state: "funding", raisedLamports: (44n * SOL + 900_000_000n).toString(), backerWallets: 341, openedHoursAgo: 21 },
  { id: "demo-sunny-side", name: "Sunny Side", ticker: "SUNY", hue: 48, glyph: "🍳", tagline: "Breakfast, but on-chain.", description: "Demo launch, roughly 42% funded.", socials: { website: "https://example.com" }, state: "funding", raisedLamports: (21n * SOL + 250_000_000n).toString(), backerWallets: 98, openedHoursAgo: 10 },
  { id: "demo-orbit-owl", name: "Orbit Owl", ticker: "OWL", hue: 200, glyph: "🦉", tagline: "Night shift, every shift.", description: "Demo launch that just opened.", socials: {}, state: "funding", raisedLamports: (7n * SOL + 400_000_000n).toString(), backerWallets: 31, openedHoursAgo: 5 },
  { id: "demo-mango-mode", name: "Mango Mode", ticker: "MNGO", hue: 20, glyph: "🥭", tagline: "Ripe when you are.", description: "Demo launch, early.", socials: {}, state: "funding", raisedLamports: (3n * SOL + 120_000_000n).toString(), backerWallets: 14, openedHoursAgo: 2 },
  { id: "demo-cloud-nine", name: "Cloud Nine", ticker: "NINE", hue: 215, glyph: "☁️", tagline: "Soft landing guaranteed? No. Soft, yes.", description: "Demo launch that reached its target and is being prepared.", socials: { x: "cloudnine" }, state: "ready", raisedLamports: target, backerWallets: 417, openedHoursAgo: 19 },
  { id: "demo-lemon-drop", name: "Lemon Drop", ticker: "LMN", hue: 55, glyph: "🍋", tagline: "When life gives you a pool.", description: "Demo launch that is live.", socials: { website: "https://example.com", x: "lemondrop" }, state: "live", raisedLamports: target, backerWallets: 503, openedHoursAgo: 30 },
  { id: "demo-tidal", name: "Tidal", ticker: "TIDE", hue: 180, glyph: "🌊", tagline: "In and out, on schedule.", description: "Demo launch that is live.", socials: {}, state: "live", raisedLamports: target, backerWallets: 288, openedHoursAgo: 52 },
  { id: "demo-night-fox", name: "Night Fox", ticker: "FOX", hue: 345, glyph: "🦊", tagline: "Quick, quiet, curious.", description: "Demo launch that missed its target; backers can reclaim.", socials: {}, state: "refundable", raisedLamports: (31n * SOL).toString(), backerWallets: 156, openedHoursAgo: 40 },
];

/** Builds the demo set relative to `now` (ms) so countdowns look alive without pretending to be real. */
export function demoLaunches(now: number): Launch[] {
  return seeds.map((s) => {
    const openedAt = now - s.openedHoursAgo * H;
    const fundingDeadline = openedAt + V1.fundingWindowMs;
    const filledAt = s.state === "ready" ? now - 12 * 60 * 1000 : s.state === "live" ? openedAt + 18 * H : null;
    const settlementDeadline = filledAt !== null ? filledAt + V1.settlementTimeoutMs : null;
    const liveAt = s.state === "live" ? (filledAt ?? now) + 7 * 60 * 1000 : null;
    const { openedHoursAgo: _h, creatorSol, ...rest } = s;
    return {
      ...rest,
      targetLamports: target,
      creator: addr(`creator:${s.id}`),
      mint: addr(`mint:${s.id}`),
      openedAt,
      fundingDeadline,
      filledAt,
      settlementDeadline,
      liveAt,
      refundReason: s.state === "refundable" ? "missed-target" : null,
      creatorContributionLamports: (creatorSol ?? 0n).toString(),
      poolUrl: s.state === "live" ? "https://raydium.io/" : null,
    };
  });
}

/** Dev-only preview: rewrite a launch into another state with consistent timestamps. */
export function withPreviewState(l: Launch, state: LaunchState, now: number): Launch {
  const t = V1.targetLamports;
  if (state === "funding") {
    const raised = BigInt(l.raisedLamports) >= t ? (36n * SOL + 500_000_000n).toString() : l.raisedLamports;
    return { ...l, state, raisedLamports: raised, openedAt: now - 15 * H, fundingDeadline: now + 9 * H, filledAt: null, settlementDeadline: null, liveAt: null, refundReason: null, poolUrl: null };
  }
  if (state === "ready") return { ...l, state, raisedLamports: t.toString(), openedAt: now - 19 * H, fundingDeadline: now + 5 * H, filledAt: now - 12 * 60 * 1000, settlementDeadline: now + 48 * 60 * 1000, liveAt: null, refundReason: null, poolUrl: null };
  if (state === "live") return { ...l, state, raisedLamports: t.toString(), openedAt: now - 30 * H, fundingDeadline: now - 6 * H, filledAt: now - 7 * H, settlementDeadline: now - 6 * H, liveAt: now - 2 * H, refundReason: null, poolUrl: "https://raydium.io/" };
  return { ...l, state, raisedLamports: (31n * SOL).toString(), openedAt: now - 40 * H, fundingDeadline: now - 16 * H, filledAt: null, settlementDeadline: null, liveAt: null, refundReason: "missed-target", poolUrl: null };
}
