"use client";
/**
 * Live (on-chain) actions for a launch page. Every button here sends a real transaction through the
 * connected wallet; states are explicit: signing, pending, confirmed, rejected, failed. Positions are read
 * from the wallet's receipt on chain, never inferred from token holdings.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@anchor-lang/core";
import { PublicKey, Transaction } from "@solana/web3.js";
import { PopLaunchClient, raydiumSwapUrl, launchPda } from "@pop/sdk";
import { type Launch, V1, fmtSol, fmtTokens, parseSol, remainingLamports, entitlementBaseUnits, short } from "@/lib/launch";
import { NETWORK, explorerTx } from "@/lib/config";
import { fetchPosition, fetchLaunchFromChain, type Position } from "@/lib/chain";
import { IDLE, runTx, type TxState } from "@/lib/tx";
import { LOCK_TEXT } from "./backing-panel";
import { Countdown } from "./countdown";

function useClient(): PopLaunchClient | null {
  const { connection } = useConnection();
  const wallet = useWallet();
  if (!wallet.publicKey || !wallet.signTransaction) return null;
  return new PopLaunchClient(new AnchorProvider(connection, wallet as never, { commitment: "confirmed" }));
}

export function usePosition(l: Launch, bump: number): { position: Position | null; loading: boolean } {
  const { publicKey } = useWallet();
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!publicKey || !l.address) { setPosition(null); return; }
    let alive = true;
    setLoading(true);
    const load = () => fetchPosition(l, publicKey).then((p) => { if (alive) { setPosition(p); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    load();
    const id = setInterval(load, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [publicKey, l, bump]);
  return { position, loading };
}

export function TxStatus({ s, success, pending }: { s: TxState; success: string; pending: string }) {
  if (s.stage === "idle") return null;
  const tone = s.stage === "confirmed" ? "bg-[#bff0c6]" : s.stage === "failed" ? "bg-[#ffd3cf]" : s.stage === "rejected" ? "bg-bg" : "bg-yellow";
  return (
    <div className={`mt-3 rounded-xl border-2 border-ink p-3 text-[15px] ${tone}`} role="status" aria-live="polite">
      <div className="font-bold">{s.stage === "signing" ? "Approve in your wallet…" : s.stage === "pending" ? pending : s.stage === "confirmed" ? success : s.error}</div>
      {s.signature && <a className="link addr break-all text-[13px]" href={explorerTx(s.signature)} target="_blank" rel="noreferrer noopener">{s.signature}</a>}
    </div>
  );
}

/* ----------------------------------------------------------------------------- backing (FUNDING) */

export function BackingPanelLive({ l, onDone, onClose }: { l: Launch; onDone: () => void; onClose?: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const client = useClient();
  const [amount, setAmount] = useState("0.5");
  const [review, setReview] = useState(false);
  const [tx, setTx] = useState<TxState>(IDLE);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [remaining, setRemaining] = useState<bigint>(remainingLamports(l));
  const [fresh, setFresh] = useState(true);
  const { position } = usePosition(l, tx.stage === "confirmed" ? 1 : 0);

  useEffect(() => {
    if (!wallet.publicKey) { setBalance(null); return; }
    let alive = true;
    const load = () => connection.getBalance(wallet.publicKey!).then((b) => { if (alive) setBalance(BigInt(b)); }).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [wallet.publicKey, connection, tx.stage]);

  // Refresh the remaining capacity from chain before every review so the amount offered is exact.
  const refreshRemaining = useCallback(async () => {
    try {
      const c = await fetchLaunchFromChain(l.mint, l);
      if (c) { setRemaining(remainingLamports(c)); setFresh(true); return c; }
    } catch { /* fall through */ }
    setFresh(false);
    return null;
  }, [l]);

  const lamports = parseSol(amount);
  const target = BigInt(l.targetLamports);
  const tooSmall = lamports !== null && lamports < V1.minContributionLamports && lamports !== remaining;
  const tooBig = lamports !== null && lamports > remaining;
  const fee = 10_000_000n; // network fee + receipt rent headroom
  const insufficient = lamports !== null && balance !== null && balance < lamports + fee;
  const valid = lamports !== null && lamports > 0n && !tooSmall && !tooBig && remaining > 0n;
  const tokens = valid ? entitlementBaseUnits(lamports, target, BigInt(l.backerAllocation ?? V1.backerAllocation.toString())) : 0n;
  const label = valid ? `Back with ${fmtSol(lamports)} SOL` : "Back with SOL";

  async function submit() {
    if (!client || !wallet.publicKey || lamports === null) return;
    const c = await refreshRemaining();
    if (!c) { setTx({ stage: "failed", signature: null, error: "Could not refresh the launch from the chain. Try again." }); return; }
    if (c.state !== "funding") { setTx({ stage: "failed", signature: null, error: "This launch is no longer accepting backing." }); return; }
    if (lamports > remainingLamports(c)) { setTx({ stage: "failed", signature: null, error: `Only ${fmtSol(remainingLamports(c))} SOL is left. Adjust the amount.` }); setReview(false); return; }
    const ix = await client.contributeIx(wallet.publicKey, new PublicKey(l.address!), lamports);
    const sig = await runTx(connection, wallet, new Transaction().add(ix), setTx);
    if (sig) onDone();
  }

  if (tx.stage === "confirmed") {
    return (
      <div className="box p-5 md:p-6">
        <h2 className="display text-[26px]">You’re in. Let’s make it pop.</h2>
        <dl className="mt-3 space-y-2 text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">Backed just now</dt><dd className="num">{fmtSol(lamports ?? 0n)} SOL</dd></div>
          {position && <div className="flex justify-between gap-3"><dt className="text-muted">Your total backing</dt><dd className="num">{fmtSol(position.contributed)} SOL</dd></div>}
          {position && <div className="flex justify-between gap-3"><dt className="text-muted">At success you can claim</dt><dd className="num text-right">{fmtTokens(position.entitled, l.decimals ?? 6)} {l.ticker}</dd></div>}
        </dl>
        <TxStatus s={tx} success="Confirmed on chain." pending="Confirming your backing…" />
        <p className="label mt-3">{LOCK_TEXT}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn" onClick={() => { setTx(IDLE); setReview(false); }}>Back more</button>
          {onClose && <button type="button" className="btn btn-plain" onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="box p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h2 className="display text-[22px]">Help it pop</h2>
        {onClose && <button className="btn btn-plain btn-sm" onClick={onClose} aria-label="Close">Close</button>}
      </div>
      {position && position.contributed > 0n && <p className="tag tag-yellow mt-2">You already backed {fmtSol(position.contributed)} SOL</p>}
      {!review ? (
        <>
          <label className="block mt-4">
            <span className="label">Amount (SOL)</span>
            <input className="input mt-1 text-[22px] display num" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setTx(IDLE); }} aria-label="Amount in SOL" aria-invalid={!valid} />
          </label>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Presets">
            {["0.1", "0.5", "1"].map((p) => <button key={p} type="button" className={`btn btn-sm ${amount === p ? "border-ink bg-yellow" : ""}`} aria-pressed={amount === p} onClick={() => setAmount(p)}>{p} SOL</button>)}
            <button type="button" className="btn btn-sm btn-plain ml-auto" onClick={() => setAmount(fmtSol(remaining, 9))}>Fill the rest</button>
          </div>
          <div className="mt-2 text-sm min-h-5" aria-live="polite">
            {lamports === null && amount !== "" && <span className="text-red-deep">Enter a number with up to 9 decimals.</span>}
            {tooSmall && <span className="text-red-deep">Minimum is {fmtSol(V1.minContributionLamports)} SOL, unless you fill the exact remainder.</span>}
            {tooBig && <span className="text-red-deep">Only {fmtSol(remaining)} SOL is left. A larger amount is rejected whole, never partly taken.</span>}
            {insufficient && <span className="text-red-deep">Your wallet needs {fmtSol(lamports! + fee)} SOL including network fees.</span>}
            {!fresh && <span className="text-red-deep">Could not refresh the remaining amount from the chain; backing is paused until it can.</span>}
          </div>
          <dl className="mt-3 space-y-2 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Remaining to target</dt><dd className="num">{fmtSol(remaining)} SOL</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Estimated allocation at success</dt><dd className="num text-right">{valid ? `${fmtTokens(tokens, l.decimals ?? 6)} ${l.ticker}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Wallet balance</dt><dd className="num">{balance === null ? "not connected" : `${fmtSol(balance)} SOL`}</dd></div>
          </dl>
          <button type="button" className="btn btn-red btn-lg w-full mt-5" disabled={!valid || !wallet.connected || !!insufficient || !fresh} onClick={async () => { await refreshRemaining(); setReview(true); }}>{wallet.connected ? label : "Connect a wallet to back"}</button>
          <p className="label mt-3">{LOCK_TEXT}</p>
        </>
      ) : (
        <>
          <dl className="mt-4 space-y-2 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">You commit</dt><dd className="num display text-[18px]">{fmtSol(lamports!)} SOL</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">At success you can claim</dt><dd className="num text-right">{fmtTokens(tokens, l.decimals ?? 6)} {l.ticker}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">If it never launches</dt><dd className="text-right">Reclaim {fmtSol(lamports!)} SOL</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Network fee</dt><dd className="label text-right">about 0.000005 SOL, plus 0.0016 SOL receipt rent the first time</dd></div>
          </dl>
          <p className="mt-4 text-[15px] rounded-2xl bg-bg p-4 border-2 border-ink">{LOCK_TEXT}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn" disabled={tx.stage === "signing" || tx.stage === "pending"} onClick={() => { setReview(false); setTx(IDLE); }}>Back</button>
            <button type="button" className="btn btn-red btn-lg flex-1" disabled={tx.stage === "signing" || tx.stage === "pending"} onClick={() => void submit()}>
              {tx.stage === "signing" ? "Approve in wallet…" : tx.stage === "pending" ? "Confirming your backing…" : label}
            </button>
          </div>
          <TxStatus s={tx} success="Confirmed." pending="Confirming your backing…" />
          {tx.stage === "failed" && <button type="button" className="btn btn-sm mt-2" onClick={() => void submit()}>Retry</button>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- READY: finish launch */

export function SettlementPanel({ l, onDone }: { l: Launch; onDone: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const client = useClient();
  const [tx, setTx] = useState<TxState>(IDLE);
  const attempts = l.settlementAttempts ?? [];
  async function finish() {
    if (!client || !wallet.publicKey || !l.address) return;
    const t = await client.buildFinalizeTransaction(wallet.publicKey, new PublicKey(l.address));
    const sig = await runTx(connection, wallet, t, setTx);
    if (sig) onDone();
  }
  return (
    <div className="box p-5 md:p-6">
      <h2 className="display text-[22px]">Filled. No more backing.</h2>
      <p className="text-[15px] text-muted mt-2">The target was reached, so deposits are closed. One settlement transaction creates the pool, burns the LP tokens and enables claims. If that does not happen before the recovery deadline, every backer can reclaim their SOL.</p>
      {l.settlementDeadline && <p className="font-bold mt-3">Recovery deadline: <Countdown deadline={l.settlementDeadline} suffix="" /> from now</p>}
      <ol className="mt-3 space-y-1.5 text-[15px]">
        {attempts.length === 0 && <li className="label">No settlement transaction has been submitted yet. The keeper normally submits it within seconds; you can also finish it yourself.</li>}
        {attempts.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`tag ${a.status === "confirmed" ? "tag-green" : a.status === "failed" ? "bg-[#ffd3cf]" : "tag-yellow"}`}>{a.status}</span>
            {a.signature ? <a className="link addr text-[13px]" href={explorerTx(a.signature)} target="_blank" rel="noreferrer noopener">{short(a.signature, 8)}</a> : <span className="label">not sent</span>}
            {a.error && <span className="label truncate" title={a.error}>{a.error.slice(0, 80)}</span>}
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-red btn-lg w-full mt-4" disabled={!wallet.connected || tx.stage === "signing" || tx.stage === "pending"} onClick={() => void finish()}>
        {!wallet.connected ? "Connect a wallet to finish the launch" : tx.stage === "signing" ? "Approve in wallet…" : tx.stage === "pending" ? "Settling…" : "Finish launch now"}
      </button>
      <p className="label mt-2">Anyone may submit settlement; it only pays the network fee. Your wallet never touches the escrow.</p>
      <TxStatus s={tx} success="Settled. The pool is live." pending="Settling…" />
    </div>
  );
}

/* -------------------------------------------------------------------- LIVE / REFUNDABLE position */

export function PositionPanel({ l, onDone }: { l: Launch; onDone: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const client = useClient();
  const [tx, setTx] = useState<TxState>(IDLE);
  const [bump, setBump] = useState(0);
  const { position, loading } = usePosition(l, bump);
  const dec = l.decimals ?? 6;
  const isCreator = wallet.publicKey?.toBase58() === l.creator;
  const [reclaim, setReclaim] = useState<TxState>(IDLE);

  async function claim() {
    if (!client || !wallet.publicKey || !l.address) return;
    const ix = await client.claimTokensIx(wallet.publicKey, new PublicKey(l.address), new PublicKey(l.mint), wallet.publicKey);
    const sig = await runTx(connection, wallet, new Transaction().add(ix), setTx);
    if (sig) { setBump((b) => b + 1); onDone(); }
  }
  async function refund() {
    if (!client || !wallet.publicKey || !l.address) return;
    const ix = await client.refundIx(wallet.publicKey, new PublicKey(l.address), wallet.publicKey);
    const sig = await runTx(connection, wallet, new Transaction().add(ix), setTx);
    if (sig) { setBump((b) => b + 1); onDone(); }
  }
  async function reclaimReserve() {
    if (!client || !wallet.publicKey || !l.address) return;
    const ix = await client.reclaimUnusedSetupReserveIx(wallet.publicKey, new PublicKey(l.address));
    const sig = await runTx(connection, wallet, new Transaction().add(ix), setReclaim);
    if (sig) onDone();
  }

  const claimable = position ? position.entitled - position.claimed : 0n;
  const refundable = position ? position.contributed - position.refunded : 0n;
  const busy = tx.stage === "signing" || tx.stage === "pending";
  return (
    <div className="box p-5 md:p-6">
      <h2 className="display text-[22px]">Your position</h2>
      {!wallet.connected ? (
        <p className="label mt-2">Connect the wallet you backed with to see your receipt, claim or reclaim.</p>
      ) : loading && !position ? (
        <p className="label mt-2">Reading your receipt from the chain…</p>
      ) : !position ? (
        <p className="label mt-2">This wallet has no backing receipt for this launch.</p>
      ) : (
        <dl className="mt-3 space-y-2 text-[15px]">
          <div className="flex justify-between"><dt className="text-muted">Backed</dt><dd className="num">{fmtSol(position.contributed)} SOL</dd></div>
          {l.state === "live" && <>
            <div className="flex justify-between"><dt className="text-muted">Entitled</dt><dd className="num">{fmtTokens(position.entitled, dec)} {l.ticker}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Claimed so far</dt><dd className="num">{fmtTokens(position.claimed, dec)} {l.ticker}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Claimable</dt><dd className="num font-bold">{fmtTokens(claimable, dec)} {l.ticker}</dd></div>
          </>}
          {l.state === "refundable" && <>
            <div className="flex justify-between"><dt className="text-muted">Reclaimed so far</dt><dd className="num">{fmtSol(position.refunded)} SOL</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Reclaimable</dt><dd className="num font-bold">{fmtSol(refundable)} SOL</dd></div>
          </>}
        </dl>
      )}
      {l.state === "live" && (
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn btn-red btn-lg w-full" disabled={!wallet.connected || claimable === 0n || busy} onClick={() => void claim()}>
            {busy ? (tx.stage === "signing" ? "Approve in wallet…" : "Claiming…") : claimable > 0n ? `Claim ${fmtTokens(claimable, dec)} ${l.ticker}` : "Nothing to claim"}
          </button>
          {NETWORK === "localnet"
            ? <span className="btn btn-lg w-full" aria-disabled="true">Trade {l.ticker} (not on localnet)</span>
            : <a className="btn btn-lg w-full" href={raydiumSwapUrl(new PublicKey(l.mint), NETWORK)} target="_blank" rel="noreferrer noopener">Trade {l.ticker}</a>}
          <p className="label">Claims never expire and stay available even if you already traded elsewhere. Claim status comes from your on-chain receipt. Trading happens on Raydium, outside Pop Launch{NETWORK === "localnet" ? "; the Raydium site cannot see a localnet pool" : ""}.</p>
        </div>
      )}
      {l.state === "refundable" && (
        <div className="mt-4">
          <button type="button" className="btn btn-red btn-lg w-full" disabled={!wallet.connected || refundable === 0n || busy} onClick={() => void refund()}>
            {busy ? (tx.stage === "signing" ? "Approve in wallet…" : "Reclaiming…") : refundable > 0n ? `Reclaim ${fmtSol(refundable)} SOL` : "Nothing to reclaim"}
          </button>
          <p className="label mt-2">{l.refundReason === "settlement-timeout" ? "Settlement did not complete before its deadline." : "The target was not reached by the deadline."} Refunds never expire and go only to the wallet that backed. Network fees paid earlier are not returned.</p>
        </div>
      )}
      <TxStatus s={tx} success={l.state === "live" ? "Claimed. Tokens are in your wallet." : "Reclaimed. SOL is back in your wallet."} pending={l.state === "live" ? "Claiming…" : "Reclaiming…"} />
      {tx.stage === "failed" && <button type="button" className="btn btn-sm mt-2" onClick={() => (l.state === "live" ? void claim() : void refund())}>Retry</button>}
      {isCreator && (
        <div className="mt-5 border-t-2 border-ink pt-4">
          <div className="font-bold">Creator</div>
          <p className="label mt-1">Take back the part of your setup reserve that settlement did not consume. The creation fee and consumed costs are not returned.</p>
          <button type="button" className="btn btn-sm mt-2" disabled={reclaim.stage === "signing" || reclaim.stage === "pending"} onClick={() => void reclaimReserve()}>Reclaim unused setup reserve</button>
          <TxStatus s={reclaim} success="Reserve returned." pending="Returning reserve…" />
        </div>
      )}
      <p className="label mt-4"><Link href="/my-pops" className="link">My pops</Link> lists every launch this wallet backed or created.</p>
    </div>
  );
}
