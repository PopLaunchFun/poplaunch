"use client";
import { useState } from "react";
import { type Launch, V1, entitlementBaseUnits, fmtSol, fmtTokens, parseSol, remainingLamports } from "@/lib/launch";

export const LOCK_TEXT = "Your SOL is locked until this launch succeeds or becomes refundable. If it launches, you receive tokens. Your SOL goes into the trading pool. Network fees are separate.";

/**
 * Backing panel for a FUNDING launch. Stage 1: no wallet, no transaction. The form, estimate and
 * review step are real; the final action explains that backing arrives with the connected app.
 */
export function BackingPanel({ l, onClose }: { l: Launch; onClose?: () => void }) {
  const [amount, setAmount] = useState("0.5");
  const [review, setReview] = useState(false);
  const [demoNote, setDemoNote] = useState(false);
  const remaining = remainingLamports(l);
  const lamports = parseSol(amount);
  const target = BigInt(l.targetLamports);
  const tooSmall = lamports !== null && lamports < V1.minContributionLamports && lamports !== remaining;
  const tooBig = lamports !== null && lamports > remaining;
  const valid = lamports !== null && lamports > 0n && !tooSmall && !tooBig;
  const tokens = valid ? entitlementBaseUnits(lamports, target, V1.backerAllocation) : 0n;
  const shareBps = valid ? Number((lamports * 10_000n) / target) : 0;
  const presets = ["0.1", "0.5", "1"];
  const label = valid ? `Back with ${fmtSol(lamports)} SOL` : "Back with SOL";

  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h2 className="display-md text-[22px]">Help it pop</h2>
        {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">Close</button>}
      </div>
      {!review ? (
        <>
          <label className="block mt-4">
            <span className="label">Amount (SOL)</span>
            <input className="input mt-1 text-[22px] display-md num" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); }} aria-label="Amount in SOL" aria-invalid={!valid} />
          </label>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Presets">
            {presets.map((p) => <button key={p} type="button" className={`btn btn-sm ${amount === p ? "border-ink" : ""}`} aria-pressed={amount === p} onClick={() => setAmount(p)}>{p} SOL</button>)}
            <button type="button" className="btn btn-sm btn-ghost ml-auto" onClick={() => setAmount(fmtSol(remaining, 9))}>Fill the rest</button>
          </div>
          <div className="mt-2 text-sm min-h-5" aria-live="polite">
            {lamports === null && amount !== "" && <span className="text-coral-deep">Enter a number with up to 9 decimals.</span>}
            {tooSmall && <span className="text-coral-deep">Minimum is {fmtSol(V1.minContributionLamports)} SOL, unless you fill the exact remainder.</span>}
            {tooBig && <span className="text-coral-deep">Only {fmtSol(remaining)} SOL is left. A larger amount is rejected whole, never partly taken.</span>}
          </div>
          <dl className="mt-3 space-y-2 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Remaining to target</dt><dd className="num">{fmtSol(remaining)} SOL</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Estimated allocation at success</dt><dd className="num text-right">{valid ? `${fmtTokens(tokens, V1.decimals)} ${l.ticker}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Share of backer allocation</dt><dd className="num">{valid ? `${(shareBps / 100).toFixed(2)}%` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Wallet balance</dt><dd className="label">not connected</dd></div>
          </dl>
          <button type="button" className="btn btn-primary btn-lg w-full mt-5" disabled={!valid} onClick={() => setReview(true)}>{label}</button>
          <p className="label mt-3">{LOCK_TEXT}</p>
        </>
      ) : (
        <>
          <dl className="mt-4 space-y-2 text-[15px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">You commit</dt><dd className="num display-md text-[18px]">{fmtSol(lamports!)} SOL</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">At success you can claim</dt><dd className="num text-right">{fmtTokens(tokens, V1.decimals)} {l.ticker}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">If it never launches</dt><dd className="text-right">Reclaim {fmtSol(lamports!)} SOL</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Network fee</dt><dd className="label text-right">quoted at signing, not refundable</dd></div>
          </dl>
          <p className="mt-4 text-[15px] rounded-2xl bg-bg p-4 border border-line">{LOCK_TEXT}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn" onClick={() => { setReview(false); setDemoNote(false); }}>Back</button>
            <button type="button" className="btn btn-primary btn-lg flex-1" onClick={() => setDemoNote(true)} aria-describedby="demo-note">{label}</button>
          </div>
          <div id="demo-note" className="mt-3 text-sm min-h-5" aria-live="polite">
            {demoNote && <span className="pill pill-yellow">Demo preview: no wallet, no SOL moves. Real backing arrives in Stage 3.</span>}
          </div>
        </>
      )}
    </div>
  );
}
