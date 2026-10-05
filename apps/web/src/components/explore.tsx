"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api, type MarketSummary } from "@/lib/api";
import { priceX64ToHuman, fmtPct, ago, fmtSolCompact } from "@/lib/format";
import { CoinImage, Info, Price, ProgressBar, ScarPreview, Skeleton, StatusTag } from "./ui";

type Tab = "new" | "active" | "graduated";
type Sort = "newest" | "volume" | "paired";

const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "graduated", label: "Graduated" },
];
const SORTS: { key: Sort; label: string; note: string }[] = [
  { key: "newest", label: "Newest", note: "Most recently activated first" },
  { key: "volume", label: "Volume", note: "SOL traded on both sides, all time" },
  { key: "paired", label: "Paired fees", note: "Lifetime SOL paired into scars" },
];

const PAIN_TIP = "Pain proven is a historical milestone: lifetime fees paired into locked liquidity (100 SOL) and bands hardened (10). It is not a safety rating and not guaranteed exit liquidity.";

/** Market cap in lamports from the cursor price and outstanding supply; null when either input is missing. */
function marketCapLamports(m: MarketSummary): bigint | null {
  const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
  const outstanding = Number(m.supply?.outstanding ?? 0) / 10 ** m.baseDecimals;
  if (!isFinite(price) || price <= 0 || !isFinite(outstanding) || outstanding <= 0) return null;
  return BigInt(Math.round(price * outstanding * 1e9));
}

/** Volume: total SOL on both sides when the indexer provides it; otherwise buy-only, labeled as such. */
function volumeOf(m: MarketSummary): { value: string; label: string; title: string } {
  if (m.volumeQuote) return { value: m.volumeQuote.allTime, label: "Vol", title: `Volume, all time: ${m.volumeQuote.definition}` };
  return { value: m.volume.buyQuote, label: "Buy vol", title: "Buy-side volume only (older indexer); sell volume not included" };
}

export function Explore({ initial, network }: { initial: MarketSummary[] | null; network: string }) {
  const [markets, setMarkets] = useState<MarketSummary[] | null>(initial);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("new");
  const [sort, setSort] = useState<Sort>("newest");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await api.markets();
      if (!alive) return;
      if (d) {
        setMarkets(d.markets);
        setStale(false);
        setFailed(false);
      } else {
        setFailed(true);
        setStale(true);
      }
    };
    if (initial === null) void load();
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [initial]);

  const rows = useMemo(() => {
    if (!markets) return [];
    const needle = q.trim().toLowerCase();
    return markets
      .filter((m) => m.status !== "created")
      .filter((m) => (needle ? m.name.toLowerCase().includes(needle) || m.symbol.toLowerCase().includes(needle) || m.baseMint.toLowerCase().startsWith(needle) || m.address.toLowerCase() === needle : true))
      .filter((m) => (tab === "graduated" ? m.status === "graduated" : tab === "active" ? m.status === "active" : true))
      .sort((a, b) =>
        sort === "volume"
          ? Number(volumeOf(b).value) - Number(volumeOf(a).value)
          : sort === "paired"
            ? Number(b.maturity.pairedQuoteLifetime) - Number(a.maturity.pairedQuoteLifetime)
            : Number(b.activatedAtSlot) - Number(a.activatedAtSlot),
      );
  }, [markets, q, tab, sort]);

  const testNet = network !== "mainnet-beta";

  return (
    <section className="mt-3">
      <DirectoryToolbar q={q} setQ={setQ} tab={tab} setTab={setTab} sort={sort} setSort={setSort} />

      {stale && markets && (
        <div className="mt-2 text-[12px] text-neg" role="status">Showing the last loaded data. The indexer is not responding; values may be stale.</div>
      )}

      {markets === null ? (
        failed ? (
          <div className="mt-4 panel p-6">
            <div className="font-semibold">Directory unavailable</div>
            <p className="text-[14px] text-muted mt-1">The indexer is not reachable, so no coins are listed. Nothing is shown rather than invented numbers.</p>
          </div>
        ) : (
          <SkeletonRows />
        )
      ) : rows.length === 0 ? (
        <div className="mt-4 panel p-8 text-center">
          <div className="text-[16px] font-semibold">{markets.length === 0 ? "Be the first to launch" : "No coins match"}</div>
          <p className="text-[14px] text-muted mt-1">{markets.length === 0 ? `No coins have been activated on ${network} yet.` : "Try another search, tab or sort."}</p>
          {markets.length === 0 && <Link href="/launch" className="btn btn-green mt-4">Launch coin</Link>}
        </div>
      ) : (
        <>
          <CoinList rows={rows} />
          <CoinTable rows={rows} />
        </>
      )}
      {testNet && markets && markets.length > 0 && <p className="label mt-3">Test launches on {network}. Not real-money markets.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ toolbar */

function DirectoryToolbar({ q, setQ, tab, setTab, sort, setSort }: { q: string; setQ: (s: string) => void; tab: Tab; setTab: (t: Tab) => void; sort: Sort; setSort: (s: Sort) => void }) {
  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search coins or paste address</span>
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" strokeLinecap="round" /></svg>
        <input className="input input-lg pl-9" placeholder="Search coins or paste address" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <div className="mt-2 flex items-center border-b border-line">
        <div role="tablist" aria-label="Directory" className="flex min-w-0">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className="tab" onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <SortMenu sort={sort} setSort={setSort} />
      </div>
    </div>
  );
}

function SortMenu({ sort, setSort }: { sort: Sort; setSort: (s: Sort) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = SORTS.find((s) => s.key === sort)!;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="relative ml-auto shrink-0" ref={ref}>
      <button type="button" className="btn btn-ghost h-9 px-2 sm:px-3 -mb-px" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={`Sort: ${current.label}`} title={current.note} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round" /></svg>
        <span className="hidden sm:inline text-text">{current.label}</span>
        <svg className="hidden sm:block" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div id={id} role="menu" aria-label="Sort by" className="menu absolute right-0 mt-1 z-30 w-60">
          {SORTS.map((s) => (
            <button key={s.key} role="menuitemradio" aria-checked={sort === s.key} className="menu-item" onClick={() => { setSort(s.key); setOpen(false); }}>
              <span className="flex flex-col items-start"><span>{s.label}</span><span className="label">{s.note}</span></span>
              {sort === s.key && <span className="text-green" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- mobile list */

function PrimaryMetric({ m, align = "right" }: { m: MarketSummary; align?: "left" | "right" }) {
  const mc = marketCapLamports(m);
  const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
  const cls = align === "right" ? "text-right" : "";
  if (mc !== null) {
    return (
      <div className={cls}>
        <div className="num text-[14px] font-semibold"><span className="label font-normal mr-1">MC</span>{fmtSolCompact(mc)}</div>
      </div>
    );
  }
  return (
    <div className={cls}>
      <div className="num text-[14px] font-semibold"><span className="label font-normal mr-1">Price</span><Price value={price} /></div>
    </div>
  );
}

function VolumeMetric({ m }: { m: MarketSummary }) {
  const v = volumeOf(m);
  return (
    <div className="label num text-right" title={v.title}>
      {v.label} <span className="text-text">{fmtSolCompact(v.value)}</span>
    </div>
  );
}

function CoinList({ rows }: { rows: MarketSummary[] }) {
  return (
    <ul className="md:hidden -mx-4 mt-1">
      {rows.map((m) => (
        <li key={m.address} className="border-b border-line">
          <Link href={`/coin/${m.baseMint}`} className="row-hover block px-4 py-4 min-h-[100px]" aria-label={`${m.name} (${m.symbol})`}>
            <div className="flex items-center gap-3">
              <CoinImage url={m.metadata?.imageUrl} symbol={m.symbol} size={44} name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[16px] font-semibold truncate">{m.name}</span>
                  <StatusTag status={m.status} compact />
                </div>
                <div className="label truncate">{m.symbol} · {ago(m.activatedAtTs)}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <PrimaryMetric m={m} />
                <VolumeMetric m={m} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1"><ProgressBar value={m.maturity.progress} label={`Pain proven ${fmtPct(m.maturity.progress, 0)}`} /></div>
              <span className="label num shrink-0">Pain proven <span className="text-text">{fmtPct(m.maturity.progress, 0)}</span></span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- desktop table */

function CoinTable({ rows }: { rows: MarketSummary[] }) {
  return (
    <table className="hidden md:table w-full mt-1 border-collapse">
      <thead>
        <tr className="label text-left">
          <th className="font-medium py-2 pr-3 w-[38%]">Coin</th>
          <th className="font-medium py-2 px-3 text-right">Market cap / Price</th>
          <th className="font-medium py-2 px-3 text-right">Volume <span className="font-normal">(SOL, all time)</span></th>
          <th className="font-medium py-2 px-3">Liquidity scars <Info text="Current SOL held in scars across 48 price bins around the current price (24 segments of 2 bins). Taller is more. Scaled to each coin's own maximum; not comparable across coins." label="About liquidity scars" /></th>
          <th className="font-medium py-2 pl-3 w-[18%]">Pain proven <Info text={PAIN_TIP} label="About Pain proven" /></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => {
          const mc = marketCapLamports(m);
          const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
          const v = volumeOf(m);
          const href = `/coin/${m.baseMint}`;
          return (
            <tr key={m.address} className="row-hover border-t border-line h-[80px]">
              <td className="pr-3 py-3">
                <Link href={href} className="flex items-center gap-3 min-w-0 -my-3 py-3 rounded-lg" aria-label={`${m.name} (${m.symbol})`}>
                  <CoinImage url={m.metadata?.imageUrl} symbol={m.symbol} size={44} name={m.name} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 min-w-0"><span className="text-[16px] font-semibold truncate">{m.name}</span><StatusTag status={m.status} compact /></span>
                    <span className="label block truncate">{m.symbol} · {ago(m.activatedAtTs)}</span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3 text-right align-middle">
                <div className="num text-[14px] font-semibold">{mc !== null ? fmtSolCompact(mc) : "—"}</div>
                <div className="label num"><Price value={price} /></div>
              </td>
              <td className="px-3 py-3 text-right align-middle">
                <div className="num text-[14px]" title={v.title}>{fmtSolCompact(v.value)}</div>
                {v.label !== "Vol" && <div className="label">buy side only</div>}
              </td>
              <td className="px-3 py-3 align-middle">
                <ScarPreview preview={m.scarPreview} />
              </td>
              <td className="pl-3 py-3 align-middle">
                <div className="num text-[14px] mb-1">{fmtPct(m.maturity.progress, 0)}</div>
                <ProgressBar value={m.maturity.progress} label={`Pain proven ${fmtPct(m.maturity.progress, 0)}`} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SkeletonRows() {
  return (
    <div className="mt-1" aria-busy="true" aria-label="Loading coins">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="border-b border-line py-4 md:h-[80px] md:py-0 md:flex md:items-center">
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-lg" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div>
            <div className="space-y-2 flex flex-col items-end"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-16" /></div>
          </div>
          <div className="mt-3 md:hidden"><Skeleton className="h-[3px] w-full" /></div>
        </div>
      ))}
    </div>
  );
}

export { marketCapLamports, volumeOf };
