"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type MarketSummary } from "@/lib/api";
import { fmtSol, fmtPrice, priceX64ToHuman, fmtPct, ago, atomicPriceToHuman } from "@/lib/format";
import { CoinImage, Progress, StatusTag, Unavailable } from "./ui";

type Filter = "all" | "new" | "active" | "graduated";
type Sort = "newest" | "volume" | "paired";

export function Explore({ initial, network }: { initial: MarketSummary[] | null; network: string }) {
  const [markets, setMarkets] = useState<MarketSummary[] | null>(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [stale, setStale] = useState(initial === null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await api.markets();
      if (!alive) return;
      if (d) {
        setMarkets(d.markets);
        setStale(false);
      } else setStale(true);
    };
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    if (!markets) return [];
    const needle = q.trim().toLowerCase();
    const nowSlot = Math.max(...markets.map((m) => Number(m.snapshotSlot)), 0);
    return markets
      .filter((m) => (needle ? m.name.toLowerCase().includes(needle) || m.symbol.toLowerCase().includes(needle) || m.baseMint.toLowerCase().startsWith(needle) : true))
      .filter((m) => (filter === "graduated" ? m.status === "graduated" : filter === "active" ? m.status === "active" : filter === "new" ? nowSlot - Number(m.activatedAtSlot) < 216_000 /* ~1 day of slots */ : true))
      .sort((a, b) => (sort === "volume" ? Number(b.volume.buyQuote) - Number(a.volume.buyQuote) : sort === "paired" ? Number(b.maturity.pairedQuoteLifetime) - Number(a.maturity.pairedQuoteLifetime) : Number(b.activatedAtSlot) - Number(a.activatedAtSlot)));
  }, [markets, q, filter, sort]);

  if (markets === null) return <div className="mt-6"><Unavailable what="Coin directory" /></div>;

  return (
    <section className="mt-5">
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input max-w-sm py-2" placeholder="Search name, ticker or mint" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search coins" />
        <div className="flex gap-1" role="group" aria-label="Filter">
          {(["all", "new", "active", "graduated"] as Filter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? "chip-on" : ""}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <div className="flex gap-1 items-center ml-auto" role="group" aria-label="Sort">
          <span className="label">sort</span>
          {([["newest", "newest"], ["volume", "buy volume"], ["paired", "paired fees"]] as [Sort, string][]).map(([k, l]) => (
            <button key={k} className={`chip ${sort === k ? "chip-on" : ""}`} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
      </div>
      {stale && <div className="text-xs text-neg mt-2">Directory data is stale: the indexer is not responding.</div>}
      {network !== "mainnet-beta" && <div className="text-xs text-muted mt-2">Showing {network} coins. These are test launches, not real-money markets.</div>}

      {rows.length === 0 ? (
        <div className="panel p-10 mt-4 text-center">
          <div className="text-lg font-semibold">{markets.length === 0 ? "Be the first to launch" : "No coins match"}</div>
          <p className="text-sm text-muted mt-1">{markets.length === 0 ? "No coins have been activated on this network yet." : "Try another search or filter."}</p>
          {markets.length === 0 && <Link href="/launch" className="btn btn-green mt-4">Launch coin</Link>}
        </div>
      ) : (
        <div className="mt-4 panel overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1.3fr_1fr_0.9fr] gap-3 px-4 py-2 label border-b border-line">
            <span>Coin</span><span>Age</span><span className="text-right">Price (SOL)</span><span className="text-right">Buy volume</span><span>Pain proven</span><span>Trend</span><span>Status</span>
          </div>
          {rows.map((m) => {
            const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
            const spark = (m.sparkline ?? []).map((p) => atomicPriceToHuman(p, m.baseDecimals));
            return (
              <Link key={m.address} href={`/coin/${m.baseMint}`} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_1.3fr_1fr_0.9fr] gap-x-3 gap-y-1 items-center px-4 py-3 border-b border-line last:border-b-0 hover:bg-raised">
                <div className="flex items-center gap-3 min-w-0">
                  <CoinImage url={m.metadata?.imageUrl} symbol={m.symbol} />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{m.name} <span className="text-muted font-normal">· {m.symbol}</span></div>
                    <div className="text-xs text-muted truncate md:hidden">{fmtPrice(price)} SOL · vol {fmtSol(m.volume.buyQuote)}</div>
                  </div>
                </div>
                <div className="num text-sm text-muted hidden md:block">{ago(m.activatedAtTs)}</div>
                <div className="num text-sm text-right hidden md:block">{fmtPrice(price)}</div>
                <div className="num text-sm text-right hidden md:block">{fmtSol(m.volume.buyQuote)}</div>
                <div className="col-span-2 md:col-span-1 min-w-0">
                  <div className="flex justify-between text-xs"><span className="text-muted md:hidden">Pain proven</span><span className="num text-green ml-auto">{fmtPct(m.maturity.progress)}</span></div>
                  <Progress value={m.maturity.progress} />
                </div>
                <div className="hidden md:block"><Sparkline values={spark} /></div>
                <div className="justify-self-end md:justify-self-start"><StatusTag status={m.status} /></div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted mt-3">Sorting uses the named metric only. “Pain proven” is a historical paired-fee milestone, not a safety rating.</p>
    </section>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-muted">–</span>;
  const min = Math.min(...values), max = Math.max(...values);
  const W = 90, H = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label="price trend">
      <polyline points={pts} fill="none" stroke={up ? "#00ff85" : "#f07886"} strokeWidth="1.5" />
    </svg>
  );
}
