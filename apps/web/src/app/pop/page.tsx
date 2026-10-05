import { api } from "@/lib/api";
import { explorerAddress } from "@/lib/config";
import { fmtBase, fmtSol, short, ago } from "@/lib/format";
import { Stat, Unavailable } from "@/components/ui";

export const dynamic = "force-dynamic";

const MONTH = 30 * 24 * 3600;

export default async function Pop() {
  const p = await api.pop();
  if (!p) return <Unavailable what="POP token data" />;
  const m = p.popMarket;
  const seed = m ? BigInt(m.supply.seedBase) : 0n;
  const allocated = m ? BigInt(m.supply.allocated) : 0n;
  const minted = seed + allocated;
  const burned = BigInt(p.buyback.totalBurned);
  const outstanding = minted - burned;
  const act = m ? Number(m.activatedAtTs) : 0;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">POP token</h1>
      <p className="text-sm text-paper-2 mt-2">Platform token and the first market demonstrating the mechanism. No APY, no price forecast, no revenue claim for holders. Buybacks are funded only by other markets&apos; WSOL protocol fees.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Stat label="Total minted" value={fmtBase(minted, 6, "POP", 0)} />
        <Stat label="Burned" value={fmtBase(burned, 6, "POP", 0)} tone="scar" />
        <Stat label="Outstanding" value={fmtBase(outstanding, 6, "POP", 0)} sub="minted − burned" />
        <Stat label="Mint authority" value={<span className="text-lime">revoked</span>} sub="checked at activation; freeze authority absent" />
      </div>

      <h2 className="font-bold mt-8">Allocation</h2>
      <table className="w-full text-sm mt-2">
        <thead><tr className="label text-left"><th className="py-2">Allocation</th><th>Amount</th><th>Custody</th><th>Schedule</th><th>Claimed</th></tr></thead>
        <tbody>
          <tr className="border-t border-line"><td className="py-2">Market seed inventory</td><td className="num">{fmtBase(seed, 6, "POP", 0)}</td><td className="num">{m ? <a className="link" href={explorerAddress(m.address)}>{short(m.address)}</a> : "–"}</td><td>permanently committed to bins 0..{m?.binMax ?? "–"}</td><td>–</td></tr>
          {p.vestings.map((v) => (
            <tr key={v.address} className="border-t border-line">
              <td className="py-2">{v.label}</td>
              <td className="num">{fmtBase(v.total, 6, "POP", 0)}</td>
              <td className="num"><a className="link" href={explorerAddress(v.vault)}>{short(v.vault)}</a> → <a className="link" href={explorerAddress(v.beneficiary)}>{short(v.beneficiary)}</a></td>
              <td className="text-xs">
                cliff {Math.round(Number(v.cliffOffset) / MONTH)} mo · linear to {Math.round(Number(v.endOffset) / MONTH)} mo
                {act ? ` · unlock from ${new Date((act + Number(v.cliffOffset)) * 1000).toISOString().slice(0, 10)}` : ""}
              </td>
              <td className="num">{fmtBase(v.claimed, 6, "POP", 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-paper-3 mt-2">Vesting starts at actual market activation ({act ? new Date(act * 1000).toISOString() : "not activated"}). On devnet/localnet these timestamps are test timestamps.</p>

      <h2 className="font-bold mt-8">Addresses</h2>
      <table className="w-full text-sm mt-2">
        <tbody>
          {[
            ["POP mint", p.protocol.popMint],
            ["POP market", p.protocol.popMarket],
            ["Protocol fee recipient (operating treasury)", p.protocol.protocolFeeRecipient],
            ["Factory authority", p.protocol.authority],
            ["Buyback authority (manual execution)", p.buyback.authority],
            ["Buyback WSOL escrow", p.buyback.quoteAccount],
          ].map(([k, v]) => (
            <tr key={k} className="border-t border-line"><td className="py-2 text-paper-3 w-72">{k}</td><td className="num break-all"><a className="link" href={explorerAddress(v)}>{v}</a></td></tr>
          ))}
        </tbody>
      </table>

      <h2 className="font-bold mt-8">Buybacks</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        <Stat label="Realized funds received" value={fmtSol(p.buyback.totalReceived)} sub="swept from non-POP markets" />
        <Stat label="Spent" value={fmtSol(p.buyback.totalSpent)} />
        <Stat label="POP burned" value={fmtBase(p.buyback.totalBurned, 6, "", 0)} tone="scar" />
        <Stat label="Executions" value={p.buyback.executionCount} sub={`cap ${fmtSol(p.buyback.maxSpendPerExecution)} / exec · min interval ${p.buyback.minIntervalSlots} slots`} />
      </div>
      <p className="text-xs text-paper-3 mt-2">Policy: 50% of WSOL protocol fees from non-POP markets is earmarked. Execution is manual, authority-approved, with explicit spend cap, minimum output and a reference-price guard. Automatic execution stays disabled until an independently defensible price reference exists. Funded escrow is shown separately from executed purchases.</p>
      <table className="w-full text-sm mt-3">
        <thead><tr className="label text-left"><th className="py-2">Event</th><th>Amount</th><th>Signature</th><th>When</th></tr></thead>
        <tbody>
          {p.buybackHistory.length === 0 && <tr><td className="py-2 text-paper-3" colSpan={4}>No buyback executions recorded.</td></tr>}
          {p.buybackHistory.map((h) => (
            <tr key={h.signature + h.event_index} className="border-t border-line">
              <td className="py-2">{h.data.popBurned !== undefined ? "Executed + burned" : "Swept"}</td>
              <td className="num">{h.data.popBurned !== undefined ? `${fmtSol(String(h.data.quoteSpent))} → ${fmtBase(String(h.data.popBurned), 6, "POP")}` : fmtSol(String(h.data.amount))}</td>
              <td className="num"><a className="link" href={`/tx/${h.signature}`}>{short(h.signature, 6)}</a></td>
              <td className="text-paper-3">{ago(h.block_time)}{h.finalized ? "" : " · pending finality"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-paper-3 mt-4">Snapshot slot {p.snapshotSlot}, {ago(p.updatedAt)}. Launches enabled: {String(p.protocol.launchesEnabled)}.</p>
    </div>
  );
}
