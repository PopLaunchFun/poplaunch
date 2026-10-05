import { PublicKey } from "@solana/web3.js";
import { marketPda } from "@pop/sdk";
import { api } from "@/lib/api";
import { PROGRAM_ID, explorerAddress } from "@/lib/config";
import { fmtSol, fmtPrice, priceX64ToHuman, short, fmtBase, ago, fmtPct } from "@/lib/format";
import { Stat, StatusTag, Tip, Unavailable } from "@/components/ui";
import { MarketLive } from "@/components/market-live";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  let address: string;
  try {
    address = marketPda(new PublicKey(PROGRAM_ID), new PublicKey(mint)).toBase58();
  } catch {
    return <Unavailable what="Invalid mint address" />;
  }
  const res = await api.market(address);
  if (!res) return <Unavailable what="Market" />;
  const m = res.market;
  const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
  const p0 = priceX64ToHuman(m.p0X64, m.baseDecimals);
  const curQuote = BigInt(m.currentInventory.seedQuote) + BigInt(m.currentInventory.scarQuote);
  const outstanding = BigInt(m.supply.seedBase) + BigInt(m.supply.allocated);
  return (
    <div className="max-w-7xl">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold">{m.symbol}</h1>
        <span className="text-paper-2">{m.name}</span>
        <StatusTag status={m.status} />
        {m.isPopMarket && <span className="tag tag-scar">genesis</span>}
        <span className="text-xs text-paper-3 num">mint <a className="link" href={explorerAddress(m.baseMint)}>{short(m.baseMint, 6)}</a> · market <a className="link" href={explorerAddress(m.address)}>{short(m.address, 6)}</a> · creator <a className="link" href={explorerAddress(m.creator)}>{short(m.creator)}</a></span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        <Stat label="Cursor price" value={`${fmtPrice(price)} SOL`} sub={`bin ${m.cursor} · P0 ${fmtPrice(p0)}`} />
        <Stat label="Current quote reserves" value={fmtSol(curQuote)} sub={`seed ${fmtSol(m.currentInventory.seedQuote)} + scar ${fmtSol(m.currentInventory.scarQuote)}`} />
        <Stat label={<Tip text="Cumulative fees activated by matching. A monotonic milestone counter, not current inventory.">Historical paired quote</Tip> as unknown as string} value={fmtSol(m.maturity.pairedQuoteLifetime)} tone="scar" sub={`${fmtPct(m.maturity.progress)} of graduation · ${m.maturity.hardenedBands}/${m.maturity.bandsRequired} bands`} />
        <Stat label="Pending escrow" value={<span className="text-violet">{fmtSol(m.currentInventory.pendingQuoteEligible)} · {fmtBase(m.currentInventory.pendingBaseEligible, m.baseDecimals)} {m.symbol}</span>} sub="waiting for opposing fees" />
        <Stat label="Market cap (reference)" value={`${fmtSol(BigInt(Math.round(price * 1e9 * Number(outstanding) / 10 ** m.baseDecimals)))}`} sub={`${fmtBase(outstanding, m.baseDecimals)} outstanding × cursor price`} />
      </div>
      <MarketLive summary={m} />
      <p className="text-xs text-paper-3 mt-6">Snapshot slot {m.snapshotSlot} ({ago(res.updatedAt)}). Historical counters are not exit liquidity. Reserves move with net flow. External venues may show different prices.</p>
    </div>
  );
}
