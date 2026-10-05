/* eslint-disable @next/next/no-img-element */
import type { Launch } from "@/lib/launch";
import { Avatar } from "./avatar";

/**
 * The balloon frame around a coin's artwork. Demo launches ship their extracted balloon PNGs.
 * Production launches draw the same balloon in SVG (red, green or yellow shell, black outline,
 * gloss, knot) and clip the creator's uploaded image inside it.
 */
export function BalloonFrame({ l, size = 90, featured = false, className = "" }: { l: Launch; size?: number; featured?: boolean; className?: string }) {
  const src = featured ? (l.art?.featured ?? l.art?.balloon) : l.art?.balloon;
  if (src) {
    return <img src={src} alt={`${l.name} balloon`} width={size} height={Math.round(size * 1.12)} className={`block select-none h-auto ${className}`} draggable={false} />;
  }
  return <SvgBalloon color={l.art?.color ?? "red"} size={size} className={className} label={`${l.name} balloon`} image={l.image ?? null} fallback={<Avatar name={l.name} ticker={l.ticker} hue={l.hue} size={Math.round(size * 0.58)} />} />;
}

const SHELL: Record<"red" | "green" | "yellow", { a: string; b: string; knot: string }> = {
  red: { a: "#ff7b70", b: "#f33d30", knot: "#d6281c" },
  green: { a: "#8ee38f", b: "#37c04a", knot: "#1f8f33" },
  yellow: { a: "#ffe39a", b: "#ffbf5e", knot: "#e09a2b" },
};

export function SvgBalloon({ color, size, className = "", label, image, fallback }: { color: "red" | "green" | "yellow"; size: number; className?: string; label: string; image: string | null; fallback: React.ReactNode }) {
  const c = SHELL[color];
  const W = 100, Hh = 112;
  const id = `shell-${color}`;
  return (
    <div className={`relative ${className}`} style={{ width: size, height: (size * Hh) / W }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} width={size} height={(size * Hh) / W} role="img" aria-label={label} className="block">
        <defs>
          <radialGradient id={id} cx="35%" cy="28%" r="80%"><stop offset="0%" stopColor={c.a} /><stop offset="100%" stopColor={c.b} /></radialGradient>
        </defs>
        <path d="M44 93 L56 93 L60 104 L40 104 Z" fill={c.knot} stroke="#000" strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 3 C 76 3, 96 25, 96 50 C 96 76, 72 96, 50 96 C 28 96, 4 76, 4 50 C 4 25, 24 3, 50 3 Z" fill={`url(#${id})`} stroke="#000" strokeWidth="3.5" />
        <ellipse cx="30" cy="30" rx="8" ry="15" fill="#fff" opacity="0.75" transform="rotate(-25 30 30)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: "12%" }}>
        {image ? <img src={image} alt="" className="rounded-full object-cover" style={{ width: "60%", height: "60%" }} /> : fallback}
      </div>
    </div>
  );
}
