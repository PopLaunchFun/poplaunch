"use client";
import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, ColorType, LineStyle, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { BinRow, Candle, MarketSummary } from "@/lib/api";
import { atomicPriceToHuman, priceX64ToHuman } from "@/lib/format";

export function PriceChart({ candles, summary, bins }: { candles: Candle[] | null; summary: MarketSummary; bins: BinRow[] | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: "#181c1f" }, textColor: "#a4afaa", fontFamily: "Inter Variable, Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "#22282b" }, horzLines: { color: "#22282b" } },
      rightPriceScale: { borderColor: "#2d353a" },
      timeScale: { borderColor: "#2d353a", timeVisible: true },
      height: 320,
      autoSize: true,
    });
    chartRef.current = chart;
    const series = chart.addSeries(CandlestickSeries, { upColor: "#00ff85", downColor: "#f07886", borderVisible: false, wickUpColor: "#00ff85", wickDownColor: "#f07886", priceFormat: { type: "price", precision: 10, minMove: 1e-10 } });
    const data = (candles ?? []).map((c) => ({ time: Number(c.bucket) as UTCTimestamp, open: atomicPriceToHuman(c.open, summary.baseDecimals), high: atomicPriceToHuman(c.high, summary.baseDecimals), low: atomicPriceToHuman(c.low, summary.baseDecimals), close: atomicPriceToHuman(c.close, summary.baseDecimals) }));
    if (data.length) series.setData(data);
    // Stationary scar overlay: horizontal lines at bins holding activated scar inventory.
    if (bins) {
      const scarred = bins.filter((b) => BigInt(b.scarQuote) > 0n || BigInt(b.scarBase) > 0n);
      const maxPaired = scarred.reduce((a, b) => (BigInt(b.pairedQuoteLifetime) > a ? BigInt(b.pairedQuoteLifetime) : a), 0n);
      for (const b of scarred.slice(0, 60)) {
        const w = maxPaired > 0n ? Number((BigInt(b.pairedQuoteLifetime) * 100n) / maxPaired) : 0;
        series.createPriceLine({ price: priceX64ToHuman(b.priceX64, summary.baseDecimals), color: w > 50 ? "#00ff85" : "#00ff8566", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      }
    }
    series.createPriceLine({ price: priceX64ToHuman(summary.cursorPriceX64, summary.baseDecimals), color: "#f2f5f3", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "cursor" });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, bins, summary]);

  return (
    <div className="panel p-2 overflow-hidden">
      <div ref={ref} className="w-full" style={{ height: 320 }} />
      {(!candles || candles.length === 0) && <div className="label p-2">No executed trades indexed for this interval yet. The chart shows only real executions.</div>}
      <div className="label px-2 pb-1">Executed prices per bucket, not an oracle. Dotted green lines: bins holding scar liquidity.</div>
    </div>
  );
}
