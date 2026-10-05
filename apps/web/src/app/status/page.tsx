import { api } from "@/lib/api";
import { GIT_COMMIT, NETWORK, PROGRAM_ID, RPC_URL, explorerAddress } from "@/lib/config";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Status() {
  const s = await api.status();
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
            <tr key={k} className="border-t border-line"><td className="py-2 pr-4 text-paper-3 w-56">{k}</td><td className="py-2 break-all">{v}</td></tr>
          ))}
          {s && (
            <>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Indexer network</td><td className="py-2">{s.network}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Indexer commit</td><td className="py-2 num">{s.gitCommit}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Chain slot</td><td className="py-2 num">{s.chainSlot ?? "–"}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Indexer lag</td><td className="py-2 num">{s.indexer.lagSlots ?? "–"} slots · updated {ago(s.indexer.updatedAt)} · {s.indexer.unfinalizedEvents} unfinalized events</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Snapshot</td><td className="py-2 num">slot {s.snapshot.slot ?? "–"} · {ago(s.snapshot.updatedAt)}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Program account</td><td className="py-2 num break-all">{s.program ? `${s.program.executable ? "executable" : "NOT executable"} · owner ${s.program.owner}` : "not found"}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Upgrade authority</td><td className="py-2 num break-all">{s.program ? (s.program.upgradeAuthority ?? "revoked (none)") : "–"}</td></tr>
              <tr className="border-t border-line"><td className="py-2 text-paper-3">Program data</td><td className="py-2 num break-all">{s.program?.programDataAddress ?? "–"}</td></tr>
            </>
          )}
        </tbody>
      </table>
      <h2 className="font-bold mt-8">Missing launch prerequisites</h2>
      <ul className="mt-2 text-sm text-paper-2 list-disc ml-5 space-y-1">
        {missing.map((m) => <li key={m}>{m}</li>)}
        <li>independent smart-contract review: not performed</li>
        <li>verified build: compare the deployed program hash with the reviewed source (see docs/deployment.md)</li>
      </ul>
      <p className="text-xs text-paper-3 mt-6">Custody is described as immutable only after the upgrade authority is revoked. A PDA alone does not make funds permanently locked.</p>
    </div>
  );
}
