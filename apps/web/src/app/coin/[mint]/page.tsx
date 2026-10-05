import { PublicKey } from "@solana/web3.js";
import { marketPda } from "@pop/sdk";
import { api } from "@/lib/api";
import { PROGRAM_ID, explorerAddress } from "@/lib/config";
import { fmtSol, fmtPrice, priceX64ToHuman, short, fmtBase, ago, fmtPct } from "@/lib/format";
import { CoinImage, Stat, StatusTag, Unavailable } from "@/components/ui";
import { CoinLive } from "@/components/coin-live";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  let address: string;
  try {
    address = marketPda(new PublicKey(PROGRAM_ID), new PublicKey(mint)).toBase58();
  } catch {
    return <Unavailable what="Invalid mint address" />;
  }
  const res = await api.market(address);
  if (!res) return <Unavailable what="Coin" />;
  const m = res.market;
  const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
  const curQuote = BigInt(m.currentInventory.seedQuote) + BigInt(m.currentInventory.scarQuote);
  const mcapLamports = BigInt(Math.round(price * 1e9 * (Number(m.supply.outstanding) / 10 ** m.baseDecimals)));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <CoinImage url={m.metadata?.imageUrl} symbol={m.symbol} size={44} />
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold leading-tight truncate">{m.name} <span className="text-muted font-normal">· {m.symbol}</span></h1>
          {m.metadata?.description && <p className="text-xs text-muted truncate max-w-xl">{m.metadata.description}</p>}
        </div>
        <StatusTag status={m.status} />
        <details className="ml-auto text-xs">
          <summary className="chip cursor-pointer">Details</summary>
          <div className="panel p-3 mt-2 space-y-1 num absolute z-10 right-4 max-w-sm break-all">
            <div><span className="label">mint</span> <a className="link" href={explorerAddress(m.baseMint)}>{m.baseMint}</a></div>
            <div><span className="label">market</span> <a className="link" href={explorerAddress(m.address)}>{m.address}</a></div>
            <div><span className="label">creator</span> <a className="link" href={explorerAddress(m.creator)}>{m.creator}</a></div>
            <div><span className="label">supply</span> {fmtBase(m.supply.totalMinted, m.baseDecimals)} minted, all seed; outstanding {fmtBase(m.supply.outstanding, m.baseDecimals)}</div>
            <div><span className="label">seed</span> {fmtSol(m.seedQuote)} locked</div>
            {m.metadata?.website && <div><span className="label">web</span> <a className="link" href={m.metadata.website} rel="noreferrer noopener" target="_blank">{m.metadata.website}</a></div>}
            {m.metadata?.twitter && <div><span className="label">x</span> @{m.metadata.twitter}</div>}
            {m.metadata?.telegram && <div><span className="label">tg</span> {m.metadata.telegram}</div>}
            <div className="text-muted font-sans">Ownership concentration: not computed (no holder indexing in v1).</div>
          </div>
        </details>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        <Stat label="Price" value={`${fmtPrice(price)} SOL`} sub={`bin ${m.cursor} · mcap ${fmtSol(mcapLamports)}`} />
        <Stat label="Pain proven" value={fmtPct(m.maturity.progress)} tone="green" sub={`${fmtSol(m.maturity.pairedQuoteLifetime)} paired · ${m.maturity.hardenedBands}/${m.maturity.bandsRequired} bands`} tip="Historical paired-fee milestone; not a safety rating." />
        <Stat label="SOL currently in scars" value={fmtSol(m.currentInventory.scarQuote)} sub={`+ ${fmtBase(m.currentInventory.scarBase, m.baseDecimals)} ${m.symbol} in scars`} />
        <Stat label="Waiting to pair" value={<span className="text-violet">{fmtSol(m.currentInventory.pendingQuoteEligible)}</span>} sub={`${fmtBase(m.currentInventory.pendingBaseEligible, m.baseDecimals)} ${m.symbol} pending`} tone="violet" />
        <Stat label="SOL reserves now" value={fmtSol(curQuote)} sub={`seed ${fmtSol(m.currentInventory.seedQuote)} + scars`} />
      </div>
      <CoinLive summary={m} />
      <p className="text-xs text-muted mt-6">Snapshot slot {m.snapshotSlot} ({ago(res.updatedAt)}). Historical counters are not exit liquidity. Reserves move with net flow. External venues may show different prices. Program {short(PROGRAM_ID)}.</p>
    </div>
  );
}
