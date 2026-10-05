"use client";
import type { MarketSummary, Trade } from "@/lib/api";
import { explorerTx, PROGRAM_ID } from "@/lib/config";
import { ago, fmtBase, fmtSol, fmtPrice, atomicPriceToHuman, short } from "@/lib/format";

export function RecentTrades({ trades, summary }: { trades: Trade[] | null; summary: MarketSummary }) {
  if (!trades) return <div className="panel p-4 text-paper-3 text-sm">Recent trades unavailable.</div>;
  return (
    <div className="panel overflow-x-auto">
      <div className="label p-3">Recent trades · program {short(PROGRAM_ID)}</div>
      <table className="w-full text-xs">
        <thead><tr className="text-paper-3 text-left"><th className="px-3 py-1">Side</th><th>Input</th><th>Output</th><th>Avg price</th><th>Fees (scar / proto / creator)</th><th>Bins</th><th>Signature</th><th>Time</th></tr></thead>
        <tbody>
          {trades.length === 0 && <tr><td className="px-3 py-2 text-paper-3" colSpan={8}>No trades indexed.</td></tr>}
          {trades.map((t) => (
            <tr key={t.signature + t.event_index} className="border-t border-line num">
              <td className={`px-3 py-1 ${t.is_buy ? "text-up" : "text-down"}`}>{t.is_buy ? "buy" : "sell"}{t.internal_buyback ? <span className="tag tag-violet ml-1">buyback</span> : ""}</td>
              <td>{t.is_buy ? fmtSol(t.gross_input) : fmtBase(t.gross_input, summary.baseDecimals, summary.symbol)}</td>
              <td>{t.is_buy ? fmtBase(t.output, summary.baseDecimals, summary.symbol) : fmtSol(t.output)}</td>
              <td>{t.avg_price ? fmtPrice(atomicPriceToHuman(t.avg_price, summary.baseDecimals)) : "–"}</td>
              <td>{t.is_buy ? `${fmtSol(t.scar_fee)} / ${fmtSol(t.protocol_fee)} / ${fmtSol(t.creator_fee)}` : `${fmtBase(t.scar_fee, summary.baseDecimals)} / ${fmtBase(t.protocol_fee, summary.baseDecimals)} / ${fmtBase(t.creator_fee, summary.baseDecimals)}`}</td>
              <td>{t.start_bin}→{t.end_bin} ({t.bins_inspected})</td>
              <td><a className="link" href={explorerTx(t.signature)} target="_blank" rel="noreferrer">{short(t.signature, 5)}</a></td>
              <td className="text-paper-3 pr-3">{ago(t.block_time)}{t.finalized ? "" : " · pending"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
