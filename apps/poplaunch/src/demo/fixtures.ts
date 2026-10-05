import type { Launch, LaunchState } from "@/lib/launch";
import { V1 } from "@/lib/launch";

/**
 * DEMO FIXTURES: the three sample coins from the approved mockup. Every number, wallet and backer
 * count is invented for the visual preview. Nothing is on chain. Production uses real launch data
 * and the creator's uploaded artwork inside the same balloon frame.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const H = 60 * 60 * 1000;
const SOL = 1_000_000_000n;
const target = V1.targetLamports.toString();

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
  hoursLeft: number;
  creatorSol?: bigint;
};

const seeds: Seed[] = [
  { id: "cat-exe", name: "CAT.EXE", ticker: "CATEXE", hue: 4, art: { balloon: "/art/balloon-cat.png", featured: "/art/balloon-cat-featured.png", color: "red" }, tagline: "Terminal cat. Higher together.", description: "A coin by the people. For the people.", socials: { x: "catexe" }, state: "funding", raisedLamports: (42n * SOL).toString(), backerWallets: 212, hoursLeft: 2, creatorSol: 1n * SOL },
  { id: "froggo", name: "FROGGO", ticker: "FROGGO", hue: 128, art: { balloon: "/art/balloon-frog.png", featured: null, color: "green" }, tagline: "Just a frog. Big plans.", description: "Just a frog. Big plans.", socials: {}, state: "funding", raisedLamports: (28n * SOL).toString(), backerWallets: 131, hoursLeft: 5 },
  { id: "goodboy", name: "GOODBOY", ticker: "GOODBOY", hue: 40, art: { balloon: "/art/balloon-dog.png", featured: null, color: "yellow" }, tagline: "Good dogs go higher.", description: "Good dogs go higher.", socials: {}, state: "funding", raisedLamports: (19n * SOL).toString(), backerWallets: 88, hoursLeft: 8 },
];

/** Builds the demo set relative to `now` (ms) so countdowns look alive without pretending to be real. */
export function demoLaunches(now: number): Launch[] {
  return seeds.map((s) => {
    const fundingDeadline = now + s.hoursLeft * H + 59 * 1000;
    const openedAt = fundingDeadline - V1.fundingWindowMs;
    const { hoursLeft: _h, creatorSol, ...rest } = s;
    return {
      ...rest,
      targetLamports: target,
      creator: addr(`creator:${s.id}`),
      mint: addr(`mint:${s.id}`),
      openedAt,
      fundingDeadline,
      filledAt: null,
      settlementDeadline: null,
      liveAt: null,
      refundReason: null,
      creatorContributionLamports: (creatorSol ?? 0n).toString(),
      poolUrl: null,
    };
  });
}

/** Dev-only preview: rewrite a launch into another state with consistent timestamps. */
export function withPreviewState(l: Launch, state: LaunchState, now: number): Launch {
  const t = V1.targetLamports;
  if (state === "funding") return l;
  if (state === "ready") return { ...l, state, raisedLamports: t.toString(), openedAt: now - 19 * H, fundingDeadline: now + 5 * H, filledAt: now - 12 * 60 * 1000, settlementDeadline: now + 48 * 60 * 1000, liveAt: null, refundReason: null, poolUrl: null };
  if (state === "live") return { ...l, state, raisedLamports: t.toString(), openedAt: now - 30 * H, fundingDeadline: now - 6 * H, filledAt: now - 7 * H, settlementDeadline: now - 6 * H, liveAt: now - 2 * H, refundReason: null, poolUrl: "https://raydium.io/" };
  return { ...l, state, openedAt: now - 40 * H, fundingDeadline: now - 16 * H, filledAt: null, settlementDeadline: null, liveAt: null, refundReason: "missed-target", poolUrl: null };
}
