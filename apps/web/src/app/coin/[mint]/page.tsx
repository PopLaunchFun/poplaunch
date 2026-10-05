import { PublicKey } from "@solana/web3.js";
import { marketPda } from "@pop/sdk";
import { api } from "@/lib/api";
import { PROGRAM_ID, explorerAddress } from "@/lib/config";
import { fmtSol, priceX64ToHuman, short, fmtBase, ago, fmtPct, fmtSolCompact } from "@/lib/format";
import { CoinImage, Metric, Price, StatusTag, Unavailable } from "@/components/ui";
import { CoinLive } from "@/components/coin-live";

export const dynamic = "force-dynamic";

const PAIN_TIP = "Historical milestone: lifetime fees paired into locked liquidity (target 100 SOL) and bands hardened (10 of 10). Not a safety rating and not guaranteed exit liquidity.";

export default async function CoinPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  let address: string;
  try {
    address = marketPda(new PublicKey(PROGRAM_ID), new PublicKey(mint)).toBase58();
  } catch {
    return <div className="mt-6"><Unavailable what="Invalid mint address" /></div>;
  }
  const res = await api.market(address);
  if (!res) return <div className="mt-6"><Unavailable what="Coin" /></div>;
  const m = res.market;
  const price = priceX64ToHuman(m.cursorPriceX64, m.baseDecimals);
  const outstanding = Number(m.supply.outstanding) / 10 ** m.baseDecimals;
  const mcapLamports = outstanding > 0 && price > 0 ? BigInt(Math.round(price * 1e9 * outstanding)) : null;
  return (
    <div className="pt-4 md:pt-6">
      <div className="flex items-center gap-3 min-w-0">
        <CoinImage url={m.metadata?.imageUrl} symbol={m.symbol} size={44} name={m.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[22px] md:text-[24px] font-semibold leading-tight truncate">{m.name}</h1>
            <StatusTag status={m.status} />
          </div>
          <div className="label truncate">{m.symbol} · launched {ago(m.activatedAtTs)} · creator <span className="addr">{short(m.creator)}</span></div>
        </div>
        <details className="relative shrink-0">
          <summary className="btn btn-sm cursor-pointer list-none">Details</summary>
          <div className="menu absolute right-0 mt-2 z-20 w-[min(92vw,420px)] p-3 space-y-1.5 text-[12px] break-all">
            <div><span className="label">Mint</span> <a className="link addr" href={explorerAddress(m.baseMint)}>{m.baseMint}</a></div>
            <div><span className="label">Market</span> <a className="link addr" href={explorerAddress(m.address)}>{m.address}</a></div>
            <div><span className="label">Creator</span> <a className="link addr" href={explorerAddress(m.creator)}>{m.creator}</a></div>
            <div className="num"><span className="label">Supply</span> {fmtBase(m.supply.totalMinted, m.baseDecimals)} minted (all seed) · {fmtBase(m.supply.outstanding, m.baseDecimals)} outstanding</div>
            <div className="num"><span className="label">Seed</span> {fmtSol(m.seedQuote)} locked · bin {m.cursor}</div>
            {m.metadata?.description && <p className="text-muted">{m.metadata.description}</p>}
            {m.metadata?.website && <div><span className="label">Web</span> <a className="link" href={m.metadata.website} rel="noreferrer noopener" target="_blank">{m.metadata.website}</a></div>}
            {m.metadata?.twitter && <div><span className="label">X</span> @{m.metadata.twitter}</div>}
            {m.metadata?.telegram && <div><span className="label">Telegram</span> {m.metadata.telegram}</div>}
            <div className="text-muted">Ownership concentration is not computed (no holder indexing).</div>
          </div>
        </details>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3 mt-4">
        <Metric label="Price" value={<Price value={price} />} sub={mcapLamports !== null ? `MC ${fmtSolCompact(mcapLamports)}` : undefined} />
        <Metric label="Pain proven" value={fmtPct(m.maturity.progress)} tone="green" tip={PAIN_TIP} sub={`${fmtSol(m.maturity.pairedQuoteLifetime)} paired · ${m.maturity.hardenedBands}/${m.maturity.bandsRequired} bands`} />
        <Metric label="SOL currently in scars" value={fmtSol(m.currentInventory.scarQuote)} sub={`+ ${fmtBase(m.currentInventory.scarBase, m.baseDecimals)} ${m.symbol}`} tip="Fee-funded liquidity held in price bins right now. It is traded against like any inventory, so it can decline." />
        <Metric label="Waiting to pair" value={fmtSol(m.currentInventory.pendingQuoteEligible)} tone="violet" sub={`${fmtBase(m.currentInventory.pendingBaseEligible, m.baseDecimals)} ${m.symbol} pending`} tip="Buy fees (SOL) and sell fees (coin) that have not yet met an opposing fee at the same bin." />
        <Metric label="SOL reserves now" value={fmtSol(BigInt(m.currentInventory.seedQuote) + BigInt(m.currentInventory.scarQuote))} sub={`seed ${fmtSol(m.currentInventory.seedQuote)} + scars`} />
      </div>

      <CoinLive summary={m} />
      <p className="label mt-6">Snapshot slot {m.snapshotSlot} ({ago(res.updatedAt)}). Reserves move with net flow; historical counters are not exit liquidity. Program <span className="addr">{short(PROGRAM_ID)}</span>.</p>
    </div>
  );
}
