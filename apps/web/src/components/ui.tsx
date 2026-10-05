import type { ReactNode } from "react";

export function Stat({ label, value, sub, tone, tip }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "green" | "neg" | "violet"; tip?: string }) {
  const color = tone === "green" ? "text-green" : tone === "neg" ? "text-neg" : tone === "violet" ? "text-violet" : "";
  return (
    <div className="panel p-3 min-w-0">
      <div className="label" title={tip}>{label}{tip ? <span className="ml-1 text-muted cursor-help" aria-label={tip}>ⓘ</span> : null}</div>
      <div className={`num text-base md:text-lg mt-1 truncate ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  if (status === "graduated") return <span className="chip chip-on">Graduated</span>;
  if (status === "active") return <span className="chip">Active</span>;
  return <span className="chip chip-violet">Pending activation</span>;
}

export function Unavailable({ what }: { what: string }) {
  return <div className="panel p-6 text-muted text-sm">{what} unavailable. The indexer or RPC is not reachable; nothing is shown rather than invented numbers.</div>;
}

export function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CoinImage({ url, symbol, size = 36 }: { url: string | null | undefined; symbol: string; size?: number }) {
  const letter = (symbol || "?").slice(0, 2).toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" loading="lazy" className="rounded-lg object-cover bg-raised shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-lg bg-raised border border-line flex items-center justify-center num text-xs text-muted shrink-0" style={{ width: size, height: size }} aria-hidden>
      {letter}
    </div>
  );
}
