"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { subscriptPrice, fmtPrice } from "@/lib/format";

/** Metric: label + tabular value; `tip` opens an accessible info popover. */
export function Metric({ label, value, sub, tone, tip, align = "left" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "green" | "neg" | "violet"; tip?: string; align?: "left" | "right" }) {
  const color = tone === "green" ? "text-green" : tone === "neg" ? "text-neg" : tone === "violet" ? "text-violet" : "";
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className="label flex items-center gap-1 justify-start" style={align === "right" ? { justifyContent: "flex-end" } : undefined}>{label}{tip && <Info text={tip} />}</div>
      <div className={`num text-[16px] font-semibold mt-0.5 truncate ${color}`}>{value}</div>
      {sub && <div className="label mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function StatusTag({ status, compact = false }: { status: string; compact?: boolean }) {
  if (status === "graduated") return <span className="tag tag-green" title="Graduated: historical paired-fee milestone reached">{compact ? "✓" : "✓ Graduated"}</span>;
  if (status === "active") return compact ? null : <span className="tag">Active</span>;
  return <span className="tag tag-violet">Pending activation</span>;
}

export function Unavailable({ what }: { what: string }) {
  return <div className="panel p-6 text-muted text-[14px]">{what} unavailable. The indexer or RPC is not reachable; nothing is shown rather than invented numbers.</div>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "progress"}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Deterministic identicon fallback (no invented artwork): two-letter initials on a hashed hue. */
export function CoinImage({ url, symbol, size = 44, name }: { url: string | null | undefined; symbol: string; size?: number; name?: string }) {
  const letters = (symbol || "?").slice(0, 2).toUpperCase();
  let h = 0;
  for (const ch of symbol || "") h = (h * 31 + ch.charCodeAt(0)) % 360;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name ? `${name} image` : ""} width={size} height={size} referrerPolicy="no-referrer" loading="lazy" className="rounded-lg object-cover bg-raised shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-lg flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, background: `hsl(${h} 18% 22%)`, color: `hsl(${h} 30% 78%)`, fontSize: Math.round(size * 0.34) }} aria-hidden>
      {letters}
    </div>
  );
}

/** Small ⓘ button with a popover; keyboard and touch accessible, closes on Escape/outside click. */
export function Info({ text, label = "More information" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="relative inline-flex" ref={ref}>
      <button type="button" className="w-5 h-5 -my-1 inline-flex items-center justify-center rounded-full text-muted hover:text-text" aria-label={label} aria-expanded={open} aria-controls={id} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><circle cx="7" cy="7" r="6" /><path d="M7 6.2v4M7 4.2v.2" strokeLinecap="round" /></svg>
      </button>
      {open && <span id={id} role="tooltip" className="menu absolute left-0 top-6 z-30 w-64 p-3 text-[12px] text-text font-normal normal-case tracking-normal">{text}</span>}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Price with leading-zero subscript for tiny values; exact value on hover/tap and for screen readers. */
export function Price({ value, unit = "SOL" }: { value: number; unit?: string }) {
  const sub = subscriptPrice(value);
  if (!sub) return <span className="num">{fmtPrice(value)} {unit}</span>;
  const exact = `${sub.full} ${unit}`;
  return (
    <span className="num" title={exact} aria-label={exact}>
      <span aria-hidden>{sub.lead}<sub className="text-[0.72em] align-sub">{sub.zeros}</sub>{sub.rest} {unit}</span>
    </span>
  );
}

/**
 * Scar distribution preview: 24 segments over a fixed window around the cursor; segment height =
 * current scar quote inventory in those bins, normalized to this coin's max. Em dash when absent.
 */
export function ScarPreview({ preview, width = 120, height = 20 }: { preview: { segments: string[]; max: string; cursorSegment: number; binsPerSegment: number; startBin: number } | null | undefined; width?: number; height?: number }) {
  if (!preview || preview.segments.length === 0) return <span className="text-muted">—</span>;
  const max = Number(preview.max);
  const n = preview.segments.length;
  const gap = 1;
  const w = (width - gap * (n - 1)) / n;
  const total = preview.segments.reduce((a, s) => a + Number(s), 0);
  if (total === 0) return <span className="text-muted" title="No scar liquidity in the window around the current price">0</span>;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Scar liquidity across ${n} price segments of ${preview.binsPerSegment} bins each around the current price`}>
      {preview.segments.map((s, i) => {
        const v = Number(s);
        const h = max > 0 ? Math.max(v > 0 ? 2 : 1, (v / max) * height) : 1;
        const isCursor = i === preview.cursorSegment;
        return <rect key={i} x={i * (w + gap)} y={height - h} width={w} height={h} fill={v > 0 ? "#00ff85" : "#2d353a"} opacity={v > 0 ? 0.55 + 0.45 * (v / max) : 1} stroke={isCursor ? "#f2f5f3" : "none"} strokeWidth={isCursor ? 0.75 : 0} />;
      })}
    </svg>
  );
}
