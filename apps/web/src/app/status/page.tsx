import { api } from "@/lib/api";
import { GIT_COMMIT, NETWORK, PROGRAM_ID, RPC_URL, explorerAddress } from "@/lib/config";
import { ago, fmtSol, fmtBase, short } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Status() {
  const s = await api.status();
  const bb = await api.buyback();
  const rows: [string, React.ReactNode][] = [
    ["Network (web)", NETWORK],
    ["RPC (web)", RPC_URL],
    ["Program ID (web)", <a key="p" className="link num" href={explorerAddress(PROGRAM_ID)}>{PROGRAM_ID}</a>],
    ["Web build commit", <span key="c" className="num">{GIT_COMMIT}</span>],
  ];
  const missing: string[] = [];
  if (!s) missing.push("indexer API unreachable");
  if (s && !s.rpcOk) missing.push("RPC unreachable from indexer");
  if (s?.program && s.program.upgradeAuthority) missing.push("program upgrade authority is NOT revoked: custody is upgradeable / multisig-controlled, not immutable");
  if (NETWORK !== "mainnet-beta") missing.push("not a mainnet deployment; mainnet launch is disabled until release gates pass");
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Status</h1>
      <table className="w-full text-sm mt-4">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-line"><td className="py-2 pr-4 text-muted w-56">{k}</td><td className="py-2 break-all">{v}</td></tr>
          ))}
          {s && (
            <>
              <tr className="border-t border-line"><td className="py-2 text-muted">Indexer network</td><td className="py-2">{s.network}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Indexer commit</td><td className="py-2 num">{s.gitCommit}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Chain slot</td><td className="py-2 num">{s.chainSlot ?? "–"}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Indexer lag</td><td className="py-2 num">{s.indexer.lagSlots ?? "–"} slots · updated {ago(s.indexer.updatedAt)} · {s.indexer.unfinalizedEvents} unfinalized events</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Snapshot</td><td className="py-2 num">slot {s.snapshot.slot ?? "–"} · {ago(s.snapshot.updatedAt)}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Program account</td><td className="py-2 num break-all">{s.program ? `${s.program.executable ? "executable" : "NOT executable"} · owner ${s.program.owner}` : "not found"}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Upgrade authority</td><td className="py-2 num break-all">{s.program ? (s.program.upgradeAuthority ?? "revoked (none)") : "–"}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-muted">Program data</td><td className="py-2 num break-all">{s.program?.programDataAddress ?? "–"}</td></tr>
            </>
          )}
        </tbody>
      </table>
      <h2 className="font-bold mt-8">Missing launch prerequisites</h2>
      <ul className="mt-2 text-sm text-muted list-disc ml-5 space-y-1">
        {missing.map((m) => <li key={m}>{m}</li>)}
        <li>independent smart-contract review: not performed</li>
        <li>verified build: compare the deployed program hash with the reviewed source (see docs/deployment.md)</li>
      </ul>
      <p className="text-xs text-muted mt-6">Custody is described as immutable only after the upgrade authority is revoked. A PDA alone does not make funds permanently locked.</p>
      <h2 className="font-bold mt-8">Protocol buyback escrow</h2>
      {bb ? (
        <div className="text-sm mt-2 space-y-2">
          <p className="text-muted text-xs">50% of the protocol&apos;s SOL fee from every coin is swept into this on-chain escrow. The buyback authority may withdraw bounded amounts only to its own wrapped-SOL account, in the same transaction as a Jupiter buy of the published POP mint and an SPL burn (keeper, see docs/deployment.md). Withdrawals without a burn in the same transaction are flagged.</p>
          <table className="w-full text-sm"><tbody>
            <tr className="border-t border-line"><td className="py-1.5 text-muted w-56">POP mint (external)</td><td className="num break-all">{bb.popMint === "11111111111111111111111111111111" ? "not published yet" : <a className="link" href={explorerAddress(bb.popMint)}>{bb.popMint}</a>}</td></tr>
            <tr className="border-t border-line"><td className="py-1.5 text-muted">Buyback authority</td><td className="num break-all"><a className="link" href={explorerAddress(bb.authority)}>{bb.authority}</a></td></tr>
            <tr className="border-t border-line"><td className="py-1.5 text-muted">Escrow balance</td><td className="num">{fmtSol(bb.vault.escrowBalance)}</td></tr>
            <tr className="border-t border-line"><td className="py-1.5 text-muted">Received / withdrawn</td><td className="num">{fmtSol(bb.vault.totalReceived)} / {fmtSol(bb.vault.totalWithdrawn)} ({bb.vault.withdrawalCount} withdrawals, cap {fmtSol(bb.vault.maxWithdrawPerExecution)} each, min interval {bb.vault.minIntervalSlots} slots)</td></tr>
            <tr className="border-t border-line"><td className="py-1.5 text-muted">POP burned (observed)</td><td className="num">{fmtBase(bb.totalBurned, 6)}</td></tr>
          </tbody></table>
          <table className="w-full text-xs mt-2"><thead><tr className="label text-left"><th className="py-1">Withdrawal</th><th>Amount</th><th>Burn in same tx</th><th>When</th></tr></thead><tbody>
            {bb.withdrawals.length === 0 && <tr><td className="py-1 text-muted" colSpan={4}>No withdrawals.</td></tr>}
            {bb.withdrawals.map((w) => <tr key={w.signature} className="border-t border-line"><td className="py-1 num"><a className="link" href={`/tx/${w.signature}`}>{short(w.signature, 6)}</a></td><td className="num">{fmtSol(w.data.amount ?? "0")}</td><td>{w.burnInSameTx ? <span className="text-green">yes</span> : <span className="text-neg">no (burn pending or manual)</span>}</td><td className="text-muted">{ago(w.block_time)}</td></tr>)}
          </tbody></table>
        </div>
      ) : <p className="text-xs text-muted mt-2">Buyback data unavailable.</p>}
    </div>
  );
}
