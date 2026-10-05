import Link from "next/link";
import { api, type MarketSummary } from "@/lib/api";
import { fmtSol, fmtPrice, priceX64ToHuman, fmtPct } from "@/lib/format";
import { StatusTag, Unavailable } from "@/components/ui";

export const dynamic = "force-dynamic";

const SORTS: Record<string, { label: string; fn: (a: MarketSummary, b: MarketSummary) => number }> = {
  created: { label: "Newest first", fn: (a, b) => Number(b.createdAtSlot) - Number(a.createdAtSlot) },
  paired: { label: "Historical paired quote", fn: (a, b) => Number(b.maturity.pairedQuoteLifetime) - Number(a.maturity.pairedQuoteLifetime) },
  depth: { label: "Current quote depth", fn: (a, b) => Number(b.currentInventory.seedQuote) + Number(b.currentInventory.scarQuote) - Number(a.currentInventory.seedQuote) - Number(a.currentInventory.scarQuote) },
  volume: { label: "Buy volume (SOL)", fn: (a, b) => Number(b.volume.buyQuote) - Number(a.volume.buyQuote) },
};

export default async function Markets({ searchParams }: { searchParams: Promise<{ filter?: string; sort?: string }> }) {
  const sp = await searchParams;
  const data = await api.markets();
  if (!data) return <Unavailable what="Market directory" />;
  const filter = sp.filter ?? "all";
  const sortKey = SORTS[sp.sort ?? ""] ? sp.sort! : "created";
  const pop = data.markets.find((m) => m.isPopMarket);
  const rest = data.markets
    .filter((m) => !m.isPopMarket)
    .filter((m) => (filter === "graduated" ? m.status === "graduated" : filter === "forming" ? m.status === "active" : true))
    .sort(SORTS[sortKey]!.fn);
  const rows = [...(pop ? [pop] : []), ...rest];
  return (
    <div>
      <h1 className="text-2xl font-bold">Markets</h1>
      <div className="flex flex-wrap gap-2 mt-4 items-center text-sm">
        {["all", "forming", "graduated"].map((f) => (
          <Link key={f} href={`/markets?filter=${f}&sort=${sortKey}`} className={`tag ${filter === f ? "tag-lime" : ""}`}>{f}</Link>
        ))}
        <span className="text-paper-3 ml-2">sort by</span>
        {Object.entries(SORTS).map(([k, v]) => (
          <Link key={k} href={`/markets?filter=${filter}&sort=${k}`} className={`tag ${sortKey === k ? "tag-violet" : ""}`}>{v.label}</Link>
        ))}
      </div>
      <p className="text-xs text-paper-3 mt-2">Sorting is by the named metric only. No “safest” ranking exists: historical scar counters are not a safety score.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="label text-left">
              <th className="py-2 pr-3">Market</th>
              <th className="py-2 pr-3">Price (SOL)</th>
              <th className="py-2 pr-3">Current quote depth</th>
              <th className="py-2 pr-3">Historical paired</th>
              <th className="py-2 pr-3">Graduation</th>
              <th className="py-2 pr-3">Buy volume</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.address} className="border-t border-line hover:bg-ink-2">
                <td className="py-3 pr-3">
                  <Link href={`/market/${m.baseMint}`} className="font-semibold">{m.symbol}</Link>
                  <span className="text-paper-3 ml-2">{m.name}</span>
                  {m.isPopMarket && <span className="tag tag-scar ml-2">genesis</span>}
                </td>
                <td className="num py-3 pr-3">{fmtPrice(priceX64ToHuman(m.cursorPriceX64, m.baseDecimals))}</td>
                <td className="num py-3 pr-3">{fmtSol(BigInt(m.currentInventory.seedQuote) + BigInt(m.currentInventory.scarQuote))}</td>
                <td className="num py-3 pr-3 text-scar">{fmtSol(m.maturity.pairedQuoteLifetime)}</td>
                <td className="num py-3 pr-3">{fmtPct(m.maturity.progress)}</td>
                <td className="num py-3 pr-3">{fmtSol(m.volume.buyQuote)}</td>
                <td className="py-3 pr-3"><StatusTag status={m.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-paper-3 text-sm mt-6">No markets match.</div>}
      </div>
    </div>
  );
}
