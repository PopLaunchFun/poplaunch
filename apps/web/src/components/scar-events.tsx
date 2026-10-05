"use client";
import type { MarketSummary, ScarRow } from "@/lib/api";
import type { ConfirmedSwap } from "./trade-ticket";
import { explorerTx } from "@/lib/config";
import { ago, fmtBase, fmtSol, short } from "@/lib/format";

export function ScarEvents({ scars, summary, latest }: { scars: ScarRow[] | null; summary: MarketSummary; latest: ConfirmedSwap | null }) {
  const rows = scars ?? [];
  return (
    <div className="panel">
      <div className="label p-3">Scar events</div>
      <div className="px-3 pb-3 space-y-1 text-xs">
        {latest && latest.scarsFormed.length > 0 && (
          <div className="rounded-lg p-2 bg-green-dim border border-green text-green">
            Scar formed · your trade paired fees at {latest.scarsFormed.length} bin{latest.scarsFormed.length > 1 ? "s" : ""} ({latest.scarsFormed.map((s) => s.bin).join(", ")}) · <a className="link" href={explorerTx(latest.signature)} target="_blank" rel="noreferrer">{short(latest.signature, 6)}</a>
          </div>
        )}
        {latest && latest.scarsFormed.length === 0 && <div className="rounded-lg p-2 raised text-muted">Your trade executed; its fees are waiting to pair at bins {latest.touched[0]}…{latest.touched[1]}. <a className="link" href={explorerTx(latest.signature)} target="_blank" rel="noreferrer">{short(latest.signature, 6)}</a></div>}
        {rows.length === 0 && !latest && <div className="text-muted">No scars formed yet. Opposing buy and sell fees must meet at a bin.</div>}
        {rows.map((s) => (
          <div key={s.signature + s.event_index} className="flex justify-between gap-2 num border-t border-line pt-1">
            <span>bin {s.bin_id}: {fmtSol(s.quote)} + {fmtBase(s.base, summary.baseDecimals)}</span>
            <a className="link" href={explorerTx(s.signature)} target="_blank" rel="noreferrer">{short(s.signature, 4)}</a>
            <span className="text-muted">{ago(s.block_time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
