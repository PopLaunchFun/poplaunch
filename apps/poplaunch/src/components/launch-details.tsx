import { type Launch, V1, fmtSol, fmtTokens, launchPriceSolPerToken, short } from "@/lib/launch";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 py-2.5 border-t border-line text-[15px]">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

export function LaunchDetails({ l }: { l: Launch }) {
  const fmtDate = (t: number | null) => (t === null ? "—" : new Date(t).toUTCString().replace(" GMT", " UTC"));
  const lpText = l.state === "live" ? "LP tokens burned at launch (demo: not verifiable here)" : "LP tokens will be burned at launch";
  return (
    <details className="box p-5 md:p-6 group">
      <summary className="flex items-center justify-between">
        <span className="display text-[20px]">Launch details</span>
        <span className="btn btn-sm" aria-hidden><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></span>
      </summary>
      <dl className="mt-4">
        <Row k="Funding deadline" v={fmtDate(l.fundingDeadline)} />
        <Row k="Settlement timeout" v={`${V1.settlementTimeoutMs / 60000} minutes after the target is reached${l.settlementDeadline ? ` (${fmtDate(l.settlementDeadline)})` : ""}`} />
        <Row k="Total supply" v={`${fmtTokens(V1.supplyBaseUnits, V1.decimals)} ${l.ticker} (${V1.decimals} decimals)`} />
        <Row k="Allocation" v={`50% to backers (${fmtTokens(V1.backerAllocation, V1.decimals)}), 50% to the pool (${fmtTokens(V1.poolAllocation, V1.decimals)}), paired with all ${fmtSol(V1.targetLamports, 0)} SOL`} />
        <Row k="Creator allocation" v="0 tokens. The creator can back on the same terms as anyone." />
        <Row k="Launch price" v={`${launchPriceSolPerToken(V1.targetLamports, V1.poolAllocation, V1.decimals)} SOL per ${l.ticker} (initial pool ratio, before fees and trades)`} />
        <Row k="Creator contribution" v={`${fmtSol(l.creatorContributionLamports)} SOL`} />
        <Row k="Approved DEX" v={V1.dex} />
        <Row k="LP protection" v={<>{lpText}. <span className="text-muted">Burning the LP tokens means nobody, including Pop Launch or the creator, can withdraw the pooled SOL and tokens. It does not prevent price declines or holders selling.</span></>} />
        <Row k="Fees" v={`No fee is deducted from backing. The creator pays a ${fmtSol(V1.creationFeeLamports)} SOL creation fee and a separately quoted setup reserve. Backers pay network fees and token-account rent on claim.`} />
        <Row k="Mint" v={<><span className="addr">{l.mint}</span> <span className="label">(demo address, no explorer link)</span></>} />
        <Row k="Creator" v={<span className="addr">{short(l.creator, 6)}</span>} />
        <Row k="Protocol settings" v={`Version ${V1.version}. Terms are fixed at opening and cannot be changed, extended or canceled.`} />
      </dl>
    </details>
  );
}
