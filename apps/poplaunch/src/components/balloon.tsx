import { balloonScale } from "@/lib/launch";
import { Avatar } from "./avatar";

/**
 * The balloon holds the coin's avatar. Its shell scales with confirmed funding on a gentle bounded
 * curve; the exact number is always printed next to it by the caller. `popped` shows the reveal:
 * the shell becomes a small confetti burst and the coin stays intact above the headline.
 */
export function Balloon({ bps, name, ticker, hue, size = 280, popped = false, calm = false }: { bps: number; name: string; ticker: string; hue: number; size?: number; popped?: boolean; calm?: boolean }) {
  const scale = popped ? 1 : balloonScale(bps);
  const avatarSize = Math.round(size * 0.3);
  if (popped) {
    const pieces = Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      const r = size * (0.32 + (i % 3) * 0.08);
      return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.8, rot: (i * 47) % 360, color: ["#e74635", "#ffe36a", "#cbb6ff", "#ffd9c7", "#cdeedd"][i % 5], w: 6 + (i % 3) * 3 };
    });
    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }} aria-label={`${name} has launched`} role="img">
        {pieces.map((p, i) => (
          <span key={i} className="confetti-piece absolute rounded-sm" style={{ left: "50%", top: "50%", width: p.w, height: p.w * 1.6, background: p.color, ["--dx" as never]: `${p.dx}px`, ["--dy" as never]: `${p.dy}px`, ["--rot" as never]: `${p.rot}deg` } as React.CSSProperties} aria-hidden />
        ))}
        <div className="relative" style={{ transform: "translateY(-6%)" }}>
          <Avatar name={name} ticker={ticker} hue={hue} size={Math.round(size * 0.42)} />
        </div>
      </div>
    );
  }
  const W = 200, Hh = 260;
  return (
    <div className={`relative flex items-end justify-center ${calm ? "" : "balloon-float"}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${W} ${Hh}`} width={size} height={size} role="img" aria-label={`${name} balloon`}>
        <defs>
          <radialGradient id="shell" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ff8a7a" />
            <stop offset="55%" stopColor="#e74635" />
            <stop offset="100%" stopColor="#b9301f" />
          </radialGradient>
        </defs>
        {/* string */}
        <path d="M100 212 C 104 226, 92 236, 100 252" stroke="#b4a89a" strokeWidth="2" fill="none" strokeLinecap="round" />
        <g className="balloon-shell" style={{ transform: `scale(${scale})`, transformOrigin: "100px 212px" }}>
          {/* knot */}
          <path d="M92 202 L108 202 L112 214 L88 214 Z" fill="#b9301f" />
          {/* body */}
          <path d="M100 8 C 150 8, 182 52, 182 104 C 182 160, 138 206, 100 206 C 62 206, 18 160, 18 104 C 18 52, 50 8, 100 8 Z" fill="url(#shell)" />
          {/* gloss */}
          <ellipse cx="68" cy="56" rx="22" ry="34" fill="#fff" opacity="0.35" transform="rotate(-20 68 56)" />
          <ellipse cx="58" cy="96" rx="5" ry="10" fill="#fff" opacity="0.25" />
        </g>
      </svg>
      <div className="absolute" style={{ top: `${(104 / Hh) * 100}%`, left: "50%", transform: `translate(-50%, -50%) scale(${scale})`, transition: "transform 250ms ease-out" }}>
        <div className="rounded-full p-[3px] bg-white/90 shadow-sm">
          <Avatar name={name} ticker={ticker} hue={hue} size={avatarSize} />
        </div>
      </div>
    </div>
  );
}
