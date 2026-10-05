"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type BinRow, type Candle, type MarketSummary, type ScarRow, type Trade } from "@/lib/api";
import { PriceChart } from "./price-chart";
import { ScarMap } from "./scar-map";
import { TradeTicket, type ConfirmedSwap } from "./trade-ticket";
import { RecentTrades } from "./recent-trades";
import { ScarEvents } from "./scar-events";
import { fmtSol } from "@/lib/format";

export function CoinLive({ summary }: { summary: MarketSummary }) {
  const [bins, setBins] = useState<BinRow[] | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [scars, setScars] = useState<ScarRow[] | null>(null);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [interval, setInterval_] = useState("5m");
  const [view, setView] = useState<"price" | "scars">("price");
  const [sheet, setSheet] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [stale, setStale] = useState(false);
  const [last, setLast] = useState<ConfirmedSwap | null>(null);

  const load = useCallback(async () => {
    const [b, t, c, s] = await Promise.all([api.bins(summary.address), api.trades(summary.address, 40), api.candles(summary.address, interval, 400), api.scars(summary.address, 30)]);
    if (b) setBins(b.bins);
    if (t) setTrades(t.trades);
    if (c) setCandles(c.candles);
    if (s) setScars(s.scars);
    setStale(!b || !t);
  }, [summary.address, interval]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const onConfirmed = (c: ConfirmedSwap) => {
    setLast(c);
    setTimeout(() => void load(), 1500);
    if (window.innerWidth < 1024) setView("scars");
  };

  const depthRow = (k: "buy" | "sell") => (
    <span className="text-xs text-muted">
      {k === "buy" ? "Buy" : "Sell"} depth 5/10/20%:{" "}
      {(["5", "10", "20"] as const).map((p) => {
        const d = summary.depth[`${k}${p}` as keyof MarketSummary["depth"]];
        return <span key={p} className="num text-text mr-2">{k === "buy" ? fmtSol(d.input) : fmtSol(d.output)}</span>;
      })}
    </span>
  );

  return (
    <div className="mt-5 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="lg:hidden flex gap-1" role="tablist">
            <button role="tab" aria-selected={view === "price"} className={`chip ${view === "price" ? "chip-on" : ""}`} onClick={() => setView("price")}>Price</button>
            <button role="tab" aria-selected={view === "scars"} className={`chip ${view === "scars" ? "chip-on" : ""}`} onClick={() => setView("scars")}>Liquidity scars</button>
          </div>
          <div className="flex gap-1 ml-auto items-center">
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((i) => (
              <button key={i} className={`chip ${interval === i ? "chip-on" : ""}`} onClick={() => setInterval_(i)}>{i}</button>
            ))}
            <label className="chip cursor-pointer"><input type="checkbox" className="accent-green" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />scars on chart</label>
          </div>
        </div>
        {stale && <div className="text-xs text-neg mt-2">Indexer data stale or unavailable. The trade ticket quotes from live RPC state.</div>}
        <div className={`mt-3 ${view === "price" ? "" : "hidden lg:block"}`}>
          <PriceChart candles={candles} summary={summary} bins={overlay ? bins : null} />
        </div>
        <div className={`mt-4 ${view === "scars" ? "" : "hidden lg:block"}`}>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Liquidity scars</h2><span className="text-xs text-muted">Buy and sell fees pair here to add locked liquidity.</span></div>
          <ScarMap bins={bins} summary={summary} highlight={last} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4">{depthRow("buy")}{depthRow("sell")}</div>
        <div className="mt-5 grid md:grid-cols-[1fr_280px] gap-4">
          <RecentTrades trades={trades} summary={summary} />
          <ScarEvents scars={scars} summary={summary} latest={last} />
        </div>
      </div>
      <div className="hidden lg:block"><TradeTicket summary={summary} onConfirmed={onConfirmed} /></div>
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 p-3 bg-bg border-t border-line">
        <button className="btn btn-green w-full" onClick={() => setSheet(true)}>Trade {summary.symbol}</button>
      </div>
      {sheet && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/70" onClick={() => setSheet(false)} role="dialog" aria-modal="true">
          <div className="absolute bottom-0 inset-x-0 bg-bg border-t border-line rounded-t-xl p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <TradeTicket summary={summary} onClose={() => setSheet(false)} onConfirmed={(c) => { setSheet(false); onConfirmed(c); }} />
          </div>
        </div>
      )}
    </div>
  );
}
