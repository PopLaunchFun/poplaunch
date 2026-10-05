"use client";
import type { MarketSummary, Trade } from "@/lib/api";
import { explorerTx, PROGRAM_ID } from "@/lib/config";
import { ago, fmtBase, fmtSol, fmtPrice, atomicPriceToHuman, short } from "@/lib/format";

export function RecentTrades({ trades, summary }: { trades: Trade[] | null; summary: MarketSummary }) {
  if (!trades) return <div className="panel p-4 label">Recent trades unavailable (indexer not reachable).</div>;
  return (
    <div className="panel overflow-x-auto">
      <div className="flex items-center justify-between p-3"><span className="text-[14px] font-semibold">Recent trades</span><span className="label">program <span className="addr">{short(PROGRAM_ID)}</span></span></div>
      <table className="w-full text-[12px] whitespace-nowrap">
        <thead><tr className="label text-left"><th className="px-3 py-1 font-medium">Side</th><th className="font-medium pr-3">Input</th><th className="font-medium pr-3">Output</th><th className="font-medium pr-3">Avg price</th><th className="font-medium pr-3">Fees (scar / protocol / creator)</th><th className="font-medium pr-3">Bins</th><th className="font-medium pr-3">Signature</th><th className="font-medium">Time</th></tr></thead>
        <tbody>
          {trades.length === 0 && <tr><td className="px-3 py-2 text-muted" colSpan={8}>No trades indexed.</td></tr>}
          {trades.map((t) => (
            <tr key={t.signature + t.event_index} className="border-t border-line num">
              <td className={`px-3 py-1.5 font-medium ${t.is_buy ? "text-green" : "text-neg"}`}>{t.is_buy ? "Buy" : "Sell"}</td>
              <td className="pr-3">{t.is_buy ? fmtSol(t.gross_input) : fmtBase(t.gross_input, summary.baseDecimals, summary.symbol)}</td>
              <td className="pr-3">{t.is_buy ? fmtBase(t.output, summary.baseDecimals, summary.symbol) : fmtSol(t.output)}</td>
              <td className="pr-3">{t.avg_price ? fmtPrice(atomicPriceToHuman(t.avg_price, summary.baseDecimals)) : "—"}</td>
              <td className="pr-3">{t.is_buy ? `${fmtSol(t.scar_fee)} / ${fmtSol(t.protocol_fee)} / ${fmtSol(t.creator_fee)}` : `${fmtBase(t.scar_fee, summary.baseDecimals)} / ${fmtBase(t.protocol_fee, summary.baseDecimals)} / ${fmtBase(t.creator_fee, summary.baseDecimals)}`}</td>
              <td className="pr-3">{t.start_bin} to {t.end_bin} ({t.bins_inspected})</td>
              <td className="pr-3"><a className="link addr" href={explorerTx(t.signature)} target="_blank" rel="noreferrer">{short(t.signature, 5)}</a></td>
              <td className="text-muted pr-3">{ago(t.block_time)}{t.finalized ? "" : " · pending"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
