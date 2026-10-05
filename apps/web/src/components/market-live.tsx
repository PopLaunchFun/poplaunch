"use client";
import { useEffect, useState } from "react";
import { api, type BinRow, type Candle, type MarketSummary, type Trade } from "@/lib/api";
import { PriceChart } from "./price-chart";
import { ScarMap } from "./scar-map";
import { TradeTicket } from "./trade-ticket";
import { RecentTrades } from "./recent-trades";
import { fmtSol, fmtBase } from "@/lib/format";

export function MarketLive({ summary }: { summary: MarketSummary }) {
  const [bins, setBins] = useState<BinRow[] | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [interval, setInterval_] = useState("5m");
  const [view, setView] = useState<"chart" | "map">("chart");
  const [sheet, setSheet] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [b, t, c] = await Promise.all([api.bins(summary.address), api.trades(summary.address, 40), api.candles(summary.address, interval, 400)]);
      if (!alive) return;
      if (b) setBins(b.bins);
      if (t) setTrades(t.trades);
      if (c) setCandles(c.candles);
      setStale(!b || !t);
    };
    void load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [summary.address, interval]);

  const depthRow = (k: "buy" | "sell") => (
    <div className="text-xs text-paper-2">
      <span className="text-paper-3">{k === "buy" ? "Buy depth" : "Sell depth"} within 5/10/20%:</span>{" "}
      {(["5", "10", "20"] as const).map((p) => {
        const d = summary.depth[`${k}${p}` as keyof MarketSummary["depth"]];
        return <span key={p} className="num mr-3">{k === "buy" ? fmtSol(d.input) : fmtSol(d.output)}</span>;
      })}
    </div>
  );

  return (
    <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="lg:hidden flex gap-1">
            <button className={`tag ${view === "chart" ? "tag-lime" : ""}`} onClick={() => setView("chart")}>chart</button>
            <button className={`tag ${view === "map" ? "tag-lime" : ""}`} onClick={() => setView("map")}>scar map</button>
          </div>
          <div className="flex gap-1 ml-auto">
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((i) => (
              <button key={i} className={`tag ${interval === i ? "tag-violet" : ""}`} onClick={() => setInterval_(i)}>{i}</button>
            ))}
            <label className="tag cursor-pointer"><input type="checkbox" className="mr-1" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />scar overlay</label>
          </div>
        </div>
        {stale && <div className="text-xs text-scar mt-2">Indexer data stale or unavailable. Quotes in the ticket are computed from live RPC state.</div>}
        <div className={`mt-3 ${view === "chart" ? "" : "hidden lg:block"}`}>
          <PriceChart candles={candles} summary={summary} bins={overlay ? bins : null} />
        </div>
        <div className={`mt-4 ${view === "map" ? "" : "hidden lg:block"}`}>
          <ScarMap bins={bins} summary={summary} />
        </div>
        <div className="mt-3 space-y-1">{depthRow("buy")}{depthRow("sell")}</div>
        <div className="mt-6"><RecentTrades trades={trades} summary={summary} /></div>
        <div className="mt-6 panel p-3 text-xs text-paper-2">
          <div className="label mb-1">Transparency</div>
          <div>Supply: seed {fmtBase(summary.supply.seedBase, summary.baseDecimals)} committed to bins; vesting allocations {fmtBase(summary.supply.allocated, summary.baseDecimals)} ({summary.supply.vestingCount} schedules, see POP page). Creator revenue claimable: {fmtSol(summary.revenue.creatorClaimableQuote)} + {fmtBase(summary.revenue.creatorClaimableBase, summary.baseDecimals)}. Protocol claimable: {fmtSol(summary.revenue.protocolClaimableQuote)}; buyback earmark {fmtSol(summary.revenue.buybackAccruedQuote)}.</div>
          <div className="mt-1 text-paper-3">Unique trader counts are not shown: without a methodology they would be fabricated.</div>
        </div>
      </div>
      <div className="hidden lg:block"><TradeTicket summary={summary} /></div>
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 p-3 bg-ink border-t border-line">
        <button className="btn btn-scar w-full" onClick={() => setSheet(true)}>Trade {summary.symbol}</button>
      </div>
      {sheet && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/70" onClick={() => setSheet(false)}>
          <div className="absolute bottom-0 inset-x-0 bg-ink border-t border-line rounded-t-lg p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <TradeTicket summary={summary} onClose={() => setSheet(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
