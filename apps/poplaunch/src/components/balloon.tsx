/* eslint-disable @next/next/no-img-element */
import { balloonScale, type Launch } from "@/lib/launch";
import { BalloonFrame } from "./balloon-frame";
import { Avatar } from "./avatar";

/**
 * Launch-detail balloon. The shell (the coin's balloon artwork) scales with confirmed funding on a
 * gentle bounded curve; the caller prints the exact number beside it. `popped` is the reveal after
 * finalized settlement: the shell becomes a small confetti burst and the coin's face stays intact.
 */
export function Balloon({ l, bps, size = 300, popped = false, calm = false }: { l: Launch; bps: number; size?: number; popped?: boolean; calm?: boolean }) {
  if (popped) {
    const pieces = Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      const r = size * (0.3 + (i % 3) * 0.08);
      return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.8, rot: (i * 47) % 360, color: ["#fb473b", "#fddf31", "#37c04a", "#ffbf5e", "#000"][i % 5], w: 7 + (i % 3) * 3 };
    });
    const face = l.art?.face ?? null;
    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.8 }} aria-label={`${l.name} has launched`} role="img">
        {pieces.map((p, i) => (
          <span key={i} className="confetti-piece absolute rounded-sm border border-ink" style={{ left: "50%", top: "50%", width: p.w, height: p.w * 1.6, background: p.color, ["--dx" as never]: `${p.dx}px`, ["--dy" as never]: `${p.dy}px`, ["--rot" as never]: `${p.rot}deg` } as React.CSSProperties} aria-hidden />
        ))}
        {face ? <img src={face} alt="" className="relative rounded-full border-[3px] border-ink bg-white" style={{ width: size * 0.5, height: size * 0.5 }} /> : <Avatar name={l.name} ticker={l.ticker} hue={l.hue} size={Math.round(size * 0.45)} />}
      </div>
    );
  }
  const scale = balloonScale(bps);
  return (
    <div className={`flex items-end justify-center ${calm ? "" : "balloon-float"}`} style={{ width: size, height: size * 1.25 }}>
      <div className="balloon-shell" style={{ transform: `scale(${scale})`, transformOrigin: "50% 100%" }}>
        <BalloonFrame l={l} featured size={size} className="w-[220px] md:w-[300px]" />
      </div>
    </div>
  );
}
