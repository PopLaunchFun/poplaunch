import type { ReactNode } from "react";

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "scar" | "lime" | "violet" }) {
  const color = tone === "scar" ? "text-scar" : tone === "lime" ? "text-lime" : tone === "violet" ? "text-violet" : "";
  return (
    <div className="panel p-3">
      <div className="label">{label}</div>
      <div className={`num text-lg mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-paper-3 mt-1">{sub}</div>}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  if (status === "graduated") return <span className="tag tag-lime">Graduated</span>;
  if (status === "active") return <span className="tag">Forming</span>;
  return <span className="tag tag-violet">Created</span>;
}

export function Unavailable({ what }: { what: string }) {
  return <div className="panel p-6 text-paper-3 text-sm">{what} unavailable. The indexer or RPC is not reachable; nothing is shown rather than invented numbers.</div>;
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="underline decoration-dotted decoration-paper-3 underline-offset-2 cursor-help" title={text}>
      {children}
    </span>
  );
}
