"use client";
/**
 * Protocol admin for the connected authority: initialize the protocol on a fresh cluster, set the creation
 * fee (e.g. 0 for a feeless day, then 0.1 SOL), pause new launches, hand the authority to another key.
 * Every button sends one transaction signed by the connected wallet; the program refuses anyone who is
 * not the authority (or, for initialization, not the program's upgrade authority). No funds move here.
 */
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@anchor-lang/core";
import { PublicKey, Transaction } from "@solana/web3.js";
import { PopLaunchClient, launchConfigPda, networkAddresses, raydiumAmmConfigPda, v1Settings, type LaunchSettingsInput } from "@pop/sdk";
import { DEMO, NETWORK, explorerAddress } from "@/lib/config";
import { fmtSol } from "@/lib/launch";
import { IDLE, runTx, type TxState } from "@/lib/tx";
import { TxStatus } from "./live-panel";
import { api } from "@/lib/api";
import { SIGN_DOMAIN } from "@/lib/config";
import { canonical, sha256Hex, siteMessage } from "@/lib/sign";
import bs58 from "bs58";

type Cfg = { authority: string; paused: boolean; version: number; feeSol: string; feeRecipient: string; targetSol: string; windowH: number; timeoutM: number; cpSwap: string; ammConfig: string };

export function AdminPanel() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [cfg, setCfg] = useState<Cfg | null | "none">(null);
  const [tx, setTx] = useState<TxState>(IDLE);
  const [fee, setFee] = useState("0.1");
  const [recipient, setRecipient] = useState("");
  const [newAuth, setNewAuth] = useState("");
  const [initFee, setInitFee] = useState("0");
  const [err, setErr] = useState<string | null>(null);
  const [ca, setCa] = useState("");
  const [caSaved, setCaSaved] = useState<string | null>(null);
  const [feelessUntil, setFeelessUntil] = useState<string | null>(null);
  const [caBusy, setCaBusy] = useState(false);
  useEffect(() => { if (!DEMO) void api.site().then((r) => { if (r) { setCa(r.contractAddress); setCaSaved(r.contractAddress); setFeelessUntil(r.feelessUntil); } }); }, []);
  /** Signs the site message with the authority wallet; the backend checks the signer against the on-chain authority. */
  const saveContractAddress = async () => {
    if (!wallet.publicKey || !wallet.signMessage) { setErr("this wallet cannot sign messages"); return; }
    setErr(null); setCaBusy(true);
    try {
      const payload = canonical({ contractAddress: ca.trim() });
      const signedAt = Math.floor(Date.now() / 1000);
      const sig = await wallet.signMessage(new TextEncoder().encode(siteMessage(SIGN_DOMAIN, await sha256Hex(payload), signedAt)));
      const saved = await api.postSite({ payload, signer: wallet.publicKey.toBase58(), signature: bs58.encode(sig), signedAt });
      setCa(saved.contractAddress); setCaSaved(saved.contractAddress); if (saved.feelessUntil) setFeelessUntil(saved.feelessUntil);
    } catch (e) { setErr((e as Error).message); } finally { setCaBusy(false); }
  };

  const load = async () => {
    try {
      const info = await connection.getAccountInfo(launchConfigPda());
      if (!info) { setCfg("none"); return; }
      const c = await PopLaunchClient.readOnly(connection).fetchConfig();
      const s = c.settings;
      setCfg({ authority: c.authority.toBase58(), paused: c.paused, version: c.version, feeSol: fmtSol(BigInt(s.creationFeeLamports.toString())), feeRecipient: s.feeRecipient.toBase58(), targetSol: fmtSol(BigInt(s.targetLamports.toString()), 0), windowH: Number(s.fundingWindowSecs.toString()) / 3600, timeoutM: Number(s.settlementTimeoutSecs.toString()) / 60, cpSwap: s.cpSwapProgram.toBase58(), ammConfig: s.ammConfig.toBase58() });
      setRecipient((r) => r || s.feeRecipient.toBase58());
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { if (!DEMO) void load(); }, [connection, tx.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (DEMO) return <div className="mx-auto max-w-[760px] px-4 md:px-8 pt-10 pb-16"><h1 className="display text-[40px]">Protocol admin</h1><p className="label mt-3">Not available in the demo preview.</p></div>;
  const isAuthority = !!wallet.publicKey && cfg && cfg !== "none" && cfg.authority === wallet.publicKey.toBase58();
  const client = () => new PopLaunchClient(new AnchorProvider(connection, wallet as never, { commitment: "confirmed" }));
  const sendIx = async (build: (c: PopLaunchClient) => Promise<import("@solana/web3.js").TransactionInstruction>) => {
    if (!wallet.publicKey) return;
    setErr(null);
    try { const ix = await build(client()); await runTx(connection, wallet, new Transaction().add(ix), setTx); } catch (e) { setErr((e as Error).message); }
  };
  /** Current settings from chain with one field changed, so nothing else drifts. */
  const current = async (): Promise<LaunchSettingsInput> => {
    const c = await PopLaunchClient.readOnly(connection).fetchConfig(); const s = c.settings;
    return { targetLamports: BigInt(s.targetLamports.toString()), fundingWindowSecs: BigInt(s.fundingWindowSecs.toString()), settlementTimeoutSecs: BigInt(s.settlementTimeoutSecs.toString()), supply: BigInt(s.supply.toString()), decimals: s.decimals, backerAllocation: BigInt(s.backerAllocation.toString()), poolAllocation: BigInt(s.poolAllocation.toString()), creationFeeLamports: BigInt(s.creationFeeLamports.toString()), minContributionLamports: BigInt(s.minContributionLamports.toString()), minSetupReserveLamports: BigInt(s.minSetupReserveLamports.toString()), feeRecipient: s.feeRecipient, cpSwapProgram: s.cpSwapProgram, ammConfig: s.ammConfig, createPoolFeeReceiver: s.createPoolFeeReceiver, quoteMint: s.quoteMint };
  };
  const sol = (v: string) => BigInt(Math.round(Number(v) * 1e9));
  const busy = tx.stage === "signing" || tx.stage === "pending";

  return (
    <div className="mx-auto max-w-[900px] px-4 md:px-8 pt-6 md:pt-10 pb-16 text-[16px]">
      <h1 className="display text-[40px] md:text-[56px]">Protocol admin</h1>
      <p className="label mt-3 max-w-[60ch]">Settings for new launches on <b>{NETWORK}</b>. Only the protocol authority can change anything here, and nothing on this page can move SOL or tokens. Existing launches never change.</p>

      <section className="box p-5 md:p-6 mt-8">
        <h2 className="display text-[22px]">Current settings</h2>
        {cfg === null && <p className="label mt-2">Reading the chain…</p>}
        {cfg === "none" && <p className="mt-2">The protocol is <b>not initialized</b> on this cluster yet.</p>}
        {cfg && cfg !== "none" && (
          <dl className="mt-3 grid md:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-muted">Authority</dt><dd className="break-all"><a className="link addr" href={explorerAddress(cfg.authority)} target="_blank" rel="noreferrer noopener">{cfg.authority}</a>{isAuthority && <span className="tag tag-green ml-2">you</span>}</dd>
            <dt className="text-muted">Settings version</dt><dd>{cfg.version}</dd>
            <dt className="text-muted">New launches</dt><dd>{cfg.paused ? <span className="tag">Paused</span> : <span className="tag tag-green">Open</span>}</dd>
            <dt className="text-muted">Creation fee</dt><dd>{cfg.feeSol} SOL {cfg.feeSol === "0" && <span className="tag tag-yellow ml-1">feeless</span>}</dd>
            <dt className="text-muted">Fee recipient</dt><dd className="break-all addr">{cfg.feeRecipient}</dd>
            <dt className="text-muted">Target / window / timeout</dt><dd>{cfg.targetSol} SOL / {cfg.windowH} h / {cfg.timeoutM} min</dd>
            <dt className="text-muted">DEX</dt><dd className="break-all addr">{cfg.cpSwap}<br />config {cfg.ammConfig}</dd>
          </dl>
        )}
      </section>

      {!wallet.connected && <p className="label mt-6">Connect the authority wallet to make changes.</p>}

      {wallet.connected && cfg === "none" && (
        <section className="box p-5 md:p-6 mt-6">
          <h2 className="display text-[22px]">Initialize protocol</h2>
          <p className="label mt-2">Uses the V1 terms (50 SOL target, 24 h window, 60 min settlement, 1B supply split 50/50, 0.01 SOL minimum) and the verified {NETWORK} addresses. Only the program&apos;s upgrade authority can do this.</p>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <label className="block"><span className="label">Creation fee (SOL)</span><input className="input mt-1" value={initFee} onChange={(e) => setInitFee(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
            <label className="block"><span className="label">Fee recipient</span><input className="input mt-1" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder={wallet.publicKey?.toBase58()} /></label>
          </div>
          <button type="button" className="btn btn-red btn-lg mt-4" disabled={busy} onClick={() => void sendIx(async (c) => {
            const net = networkAddresses(NETWORK);
            const fr = new PublicKey(recipient || wallet.publicKey!.toBase58());
            return c.initializeProtocolIx(wallet.publicKey!, v1Settings(fr, raydiumAmmConfigPda(net.ammConfigIndex, net.cpSwapProgram), { cpSwapProgram: net.cpSwapProgram, createPoolFeeReceiver: net.createPoolFeeReceiver, creationFeeLamports: sol(initFee || "0") }));
          })}>Initialize on {NETWORK}</button>
        </section>
      )}

      {isAuthority && (
        <>
          <section className="box p-5 md:p-6 mt-6">
            <h2 className="display text-[22px]">Creation fee</h2>
            <p className="label mt-2">Applies to launches created from now on. Set 0 for a feeless period, then back to 0.1.</p>
            <div className="flex flex-wrap items-end gap-3 mt-4">
              <label className="block"><span className="label">Fee (SOL)</span><input className="input mt-1 w-40" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
              <label className="block flex-1 min-w-[260px]"><span className="label">Fee recipient</span><input className="input mt-1" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} /></label>
              <button type="button" className="btn btn-red" disabled={busy} onClick={() => void sendIx(async (c) => c.updateSettingsIx(wallet.publicKey!, { ...(await current()), creationFeeLamports: sol(fee || "0"), feeRecipient: new PublicKey(recipient) }))}>Save fee</button>
            </div>
          </section>
          <section className="box p-5 md:p-6 mt-6">
            <h2 className="display text-[22px]">New launches</h2>
            <p className="label mt-2">Pausing blocks new launches only. Filling, settlement, claims and refunds keep working.</p>
            <button type="button" className="btn mt-4" disabled={busy} onClick={() => void sendIx(async (c) => c.setPausedIx(wallet.publicKey!, !(cfg as Cfg).paused))}>{(cfg as Cfg).paused ? "Resume new launches" : "Pause new launches"}</button>
          </section>
          <section className="box p-5 md:p-6 mt-6">
            <h2 className="display text-[22px]">Contract address chip</h2>
            <p className="label mt-2">The CA shown in the site header. Changes apply within a minute, no redeploy. Leave empty to show &ldquo;CA soon&rdquo;. Saving a <b>new</b> address also restarts the &ldquo;Feeless for 24 hours&rdquo; countdown from that moment (the bubble only shows while the creation fee above is 0). This signs a message with your wallet; it is not a transaction and costs nothing.</p>
            <div className="flex flex-wrap items-end gap-3 mt-4">
              <label className="block flex-1 min-w-[260px]"><span className="label">Contract address</span><input className="input mt-1" value={ca} onChange={(e) => setCa(e.target.value.trim())} placeholder="token mint address (empty for none)" /></label>
              <button type="button" className="btn btn-red" disabled={caBusy || ca === caSaved} onClick={() => void saveContractAddress()}>{caBusy ? "Signing…" : "Save CA"}</button>
            </div>
            {caSaved !== null && <p className="label mt-2">Currently shown: {caSaved ? <span className="addr">{caSaved}</span> : "CA soon"}</p>}
            {feelessUntil && <p className="label mt-1">Feeless countdown ends {new Date(feelessUntil).toLocaleString()} ({Date.parse(feelessUntil) > Date.now() ? "running" : "over"}).</p>}
          </section>
          <section className="box p-5 md:p-6 mt-6">
            <h2 className="display text-[22px]">Hand over the authority</h2>
            <p className="label mt-2">One step and final: after this, only the new key can change settings. Double-check the address.</p>
            <div className="flex flex-wrap items-end gap-3 mt-4">
              <label className="block flex-1 min-w-[260px]"><span className="label">New authority</span><input className="input mt-1" value={newAuth} onChange={(e) => setNewAuth(e.target.value.trim())} placeholder="wallet address" /></label>
              <button type="button" className="btn" disabled={busy || !newAuth} onClick={() => void sendIx(async (c) => c.transferAuthorityIx(wallet.publicKey!, new PublicKey(newAuth)))}>Transfer</button>
            </div>
          </section>
        </>
      )}
      {wallet.connected && cfg && cfg !== "none" && !isAuthority && <p className="label mt-6">The connected wallet is not the protocol authority, so this page is read-only for you.</p>}
      <div className="mt-6"><TxStatus s={tx} success="Done. Settings updated on chain." pending="Sending…" />{err && <p className="text-red-deep mt-2 text-[15px]">{err}</p>}</div>
    </div>
  );
}
