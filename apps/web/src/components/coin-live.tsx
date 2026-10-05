"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BinRow, type Candle, type MarketSummary, type ScarRow, type Trade } from "@/lib/api";
import { PriceChart } from "./price-chart";
import { ScarMap } from "./scar-map";
import { TradeTicket, type ConfirmedSwap } from "./trade-ticket";
import { RecentTrades } from "./recent-trades";
import { ScarEvents } from "./scar-events";
import { fmtSol } from "@/lib/format";
import { Info } from "./ui";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

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
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Only a confirmed swap (with its real ScarFormed events) reaches here. The highlight is brief:
  // a 200ms fade-in, held for a few seconds, then cleared.
  const onConfirmed = (c: ConfirmedSwap) => {
    setLast(c);
    setTimeout(() => void load(), 1500);
    if (window.innerWidth < 1024) setView("scars");
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setLast(null), 6000);
  };

  const depth = (k: "buy" | "sell") => (
    <span className="label">
      {k === "buy" ? "Buy" : "Sell"} depth 5 / 10 / 20%:{" "}
      {(["5", "10", "20"] as const).map((p) => {
        const d = summary.depth[`${k}${p}` as keyof MarketSummary["depth"]];
        return <span key={p} className="num text-text mr-2">{k === "buy" ? fmtSol(d.input) : fmtSol(d.output)}</span>;
      })}
    </span>
  );

  return (
    <div className="mt-5 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 border-b border-line lg:border-b-0">
          <div className="lg:hidden flex min-w-0" role="tablist" aria-label="Chart view">
            <button role="tab" aria-selected={view === "price"} className="tab" onClick={() => setView("price")}>Price</button>
            <button role="tab" aria-selected={view === "scars"} className="tab" onClick={() => setView("scars")}>Liquidity scars</button>
          </div>
          <div className={`flex items-center gap-1 ml-auto ${view === "price" ? "" : "invisible lg:visible"}`} role="group" aria-label="Candle interval">
            {INTERVALS.map((i) => (
              <button key={i} className={`h-8 px-2 rounded-md text-[12px] num ${interval === i ? "bg-raised text-text" : "text-muted hover:text-text"}`} aria-pressed={interval === i} onClick={() => setInterval_(i)}>{i}</button>
            ))}
            <label className="hidden sm:flex items-center gap-1.5 ml-2 label cursor-pointer"><input type="checkbox" className="accent-green" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />scars on chart</label>
          </div>
        </div>
        {stale && <div className="text-[12px] text-neg mt-2" role="status">Indexer data is stale or unavailable. The trade ticket quotes from live RPC state.</div>}
        <div className={`mt-3 ${view === "price" ? "" : "hidden lg:block"}`}>
          <PriceChart candles={candles} summary={summary} bins={overlay ? bins : null} />
        </div>
        <div className={`mt-4 ${view === "scars" ? "" : "hidden lg:block"}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-semibold">Liquidity scars</h2>
            <Info text="Scar inventory is fee-funded liquidity locked at fixed price bins. It trades like any inventory, so the SOL held in scars can decline; historical paired fees are a milestone, not a floor." label="About liquidity scars" />
            <span className="label">Buy and sell fees pair to add locked liquidity at these prices.</span>
          </div>
          <ScarMap bins={bins} summary={summary} highlight={last} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">{depth("buy")}{depth("sell")}</div>
        <div className="mt-5 grid md:grid-cols-[minmax(0,1fr)_300px] gap-4">
          <RecentTrades trades={trades} summary={summary} />
          <ScarEvents scars={scars} summary={summary} latest={last} />
        </div>
      </div>
      <div className="hidden lg:block"><div className="sticky top-[84px]"><TradeTicket summary={summary} onConfirmed={onConfirmed} /></div></div>
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 px-4 py-3 bg-nav border-t border-line">
        <button className="btn btn-green btn-lg w-full" onClick={() => setSheet(true)}>Trade {summary.symbol}</button>
      </div>
      {sheet && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/70" onClick={() => setSheet(false)} role="dialog" aria-modal="true" aria-label={`Trade ${summary.symbol}`}>
          <div className="absolute bottom-0 inset-x-0 bg-bg border-t border-line rounded-t-xl p-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <TradeTicket summary={summary} onClose={() => setSheet(false)} onConfirmed={(c) => { setSheet(false); onConfirmed(c); }} />
          </div>
        </div>
      )}
    </div>
  );
}
