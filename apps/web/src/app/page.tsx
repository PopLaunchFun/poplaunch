import Link from "next/link";
import { api } from "@/lib/api";
import { fmtSol } from "@/lib/format";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [totals, pop, status] = await Promise.all([api.totals(), api.pop(), api.status()]);
  const t = totals?.totals ?? null;
  return (
    <div className="max-w-5xl">
      <section className="pt-6 md:pt-16">
        <h1 className="wordmark text-5xl md:text-7xl">The market remembers.</h1>
        <p className="mt-6 text-lg text-paper-2 max-w-2xl">
          Every eligible trade pays a fee. Opposing buy and sell fees pair at the price bins they crossed, forming nonwithdrawable inventory that stays exactly where the trading happened.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {pop?.popMarket ? (
            <Link href={`/market/${pop.popMarket.baseMint}`} className="btn btn-scar">Trade POP</Link>
          ) : (
            <span className="btn" aria-disabled>Trade POP (market not deployed)</span>
          )}
          <Link href="/markets" className="btn">Explore markets</Link>
        </div>
      </section>

      <section className="mt-16 grid md:grid-cols-3 gap-4">
        {[
          ["1", "Trade pays fees", "2.00% of gross input: 1.50% to scar escrow for the bins the trade crossed, 0.25% protocol, 0.25% creator."],
          ["2", "Opposing fees pair", "Buy fees arrive in SOL, sell fees in the token. At each bin the two sides match at that bin's fixed price."],
          ["3", "Bins gain permanent inventory", "Matched fees become scar liquidity at that bin. It can be traded through, never withdrawn or moved."],
        ].map(([n, h, b]) => (
          <div key={n} className="panel p-5">
            <div className="num text-scar text-sm">{n}</div>
            <h3 className="font-bold mt-2">{h}</h3>
            <p className="text-sm text-paper-2 mt-2 leading-relaxed">{b}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <div className="label mb-3">Live verified totals · {status?.network ?? "network unavailable"}</div>
        {t ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Markets" value={t.markets} />
            <Stat label="Swaps indexed" value={t.trades} sub="excludes internal buybacks" />
            <Stat label="Scar events" value={t.scars} tone="scar" />
            <Stat label="Paired quote, all markets" value={fmtSol(t.paired)} sub="historical, not current depth" />
          </div>
        ) : (
          <div className="panel p-4 text-paper-3 text-sm">Totals unavailable: indexer not reachable. No numbers are invented.</div>
        )}
      </section>

      <section className="mt-12 text-sm text-paper-2 space-y-2">
        <p>
          Read the <Link className="link" href="/mechanism">mechanism</Link> and the <Link className="link" href="/pop">POP token allocation</Link>. Try the <Link className="link" href="/lab">lab simulator</Link> (no wallet, no real trades).
        </p>
        <p className="text-paper-3">Reserves can go down as well as up. There is no floor, no guaranteed exit, and graduation is a fee-history milestone, not proof of demand.</p>
      </section>
    </div>
  );
}
