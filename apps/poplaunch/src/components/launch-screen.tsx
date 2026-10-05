"use client";
import { useState } from "react";
import { type Launch, V1, fmtSol, fmtTokens, short, entitlementBaseUnits } from "@/lib/launch";
import { Avatar } from "./avatar";
import { Balloon } from "./balloon";
import { Countdown, Ago } from "./countdown";
import { BackingPanel, LOCK_TEXT } from "./backing-panel";
import { LaunchDetails } from "./launch-details";

type Pct = { bps: number; text: string };

export function LaunchScreen({ l, pct }: { l: Launch; pct: Pct }) {
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const raised = BigInt(l.raisedLamports), target = BigInt(l.targetLamports);
  // Demo: an example wallet position so Live / Refundable screens can show their single relevant action.
  const exampleBacking = 1_000_000_000n;
  const exampleTokens = entitlementBaseUnits(exampleBacking, target, V1.backerAllocation);

  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href.split("?")[0]!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  const headline =
    l.state === "funding" ? null
    : l.state === "ready" ? "Filled! Getting your launch ready."
    : l.state === "live" ? `POP! ${l.name} is live.`
    : `This one didn’t launch. Your ${fmtSol(exampleBacking)} SOL is ready to reclaim.`;

  return (
    <div className="mt-5 grid lg:grid-cols-12 gap-8 lg:gap-10 items-start">
      {/* Left: identity, balloon, progress, details */}
      <div className="lg:col-span-7 min-w-0">
        <div className="flex items-start md:items-center gap-4">
          <Avatar name={l.name} ticker={l.ticker} hue={l.hue} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="display text-[30px] md:text-[40px] break-words"><span className="md:hidden"><StatePill state={l.state} /></span><span className="md:hidden block h-1" />{l.name} <span className="text-muted font-extrabold text-[20px] md:text-[24px] whitespace-nowrap">${l.ticker}</span></h1>
            <div className="label mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>by <span className="addr">{short(l.creator, 5)}</span></span>
              {l.socials.website && <a className="link" href={l.socials.website} target="_blank" rel="noreferrer noopener">Website</a>}
              {l.socials.x && <a className="link" href={`https://x.com/${l.socials.x}`} target="_blank" rel="noreferrer noopener">X</a>}
              <button type="button" className="link" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
            </div>
          </div>
          <span className="hidden md:inline-flex"><StatePill state={l.state} /></span>
        </div>
        <p className="mt-4 text-[17px] text-muted max-w-[56ch]">{l.tagline}</p>

        <div className="card mt-6 p-6 md:p-8 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-yellow/60" aria-hidden />
          <div className="absolute -left-10 bottom-6 w-28 h-28 rounded-full bg-lilac/50" aria-hidden />
          <div className="relative flex flex-col items-center text-center">
            <Balloon bps={pct.bps} name={l.name} ticker={l.ticker} hue={l.hue} size={280} popped={l.state === "live"} calm={l.state !== "funding"} />
            {headline && <h2 className="display text-[28px] md:text-[36px] mt-2 max-w-[18ch]">{headline}</h2>}
            {l.state === "live" && (
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button type="button" className="btn btn-primary btn-lg" aria-describedby="live-demo-note">Claim {fmtTokens(exampleTokens, V1.decimals)} {l.ticker}</button>
                <a className="btn btn-lg" href={l.poolUrl ?? "#"} target="_blank" rel="noreferrer noopener">Trade {l.ticker}</a>
              </div>
            )}
            {l.state === "refundable" && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <button type="button" className="btn btn-primary btn-lg" aria-describedby="live-demo-note">Reclaim SOL</button>
                <span className="label">{l.refundReason === "missed-target" ? `The target was not reached by the deadline (${fmtSol(raised, 2)} of ${fmtSol(target, 0)} SOL).` : "Settlement did not complete before its deadline."}</span>
              </div>
            )}
            {(l.state === "live" || l.state === "refundable") && <p id="live-demo-note" className="label mt-3">Demo preview: this wallet position is an example. Actions become real in Stage 3.</p>}
          </div>
          <div className="relative mt-6">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="num"><span className="display text-[34px]">{fmtSol(raised, 2)}</span> <span className="text-muted text-[18px]">of {fmtSol(target, 0)} SOL</span></div>
              <div className="display-md text-[24px] num text-coral">{pct.text}</div>
            </div>
            <div className="progress mt-3" role="progressbar" aria-valuenow={Math.round(pct.bps / 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Funded ${pct.text}`}><span style={{ width: `${Math.min(100, pct.bps / 100)}%` }} /></div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 label">
              {l.state === "funding" && <span><Countdown deadline={l.fundingDeadline} /></span>}
              {l.state === "ready" && l.settlementDeadline && <span>Recovery deadline: <Countdown deadline={l.settlementDeadline} suffix="" /> from now</span>}
              {l.state === "live" && l.liveAt && <span>Live since <Ago at={l.liveAt} /></span>}
              {l.state === "refundable" && <span>Funding closed <Ago at={l.fundingDeadline} /></span>}
              <span>{l.backerWallets} backing wallets</span>
            </div>
          </div>
        </div>

        {l.state === "ready" && <SettlementProgress l={l} />}

        <div className="mt-6"><LaunchDetails l={l} /></div>
        <p className="label mt-4">A successful launch does not promise profit or a minimum resale value. Backing counts can be manufactured by related wallets. Trading happens on a public DEX and is not confined to Pop Launch.</p>
      </div>

      {/* Right: backing panel (desktop) */}
      <aside className="lg:col-span-5 hidden lg:block lg:sticky lg:top-24">
        {l.state === "funding" ? <BackingPanel l={l} /> : <SidePanel l={l} exampleBacking={exampleBacking} exampleTokens={exampleTokens} />}
      </aside>

      {/* Mobile sticky action: sits in its own bar; page bottom padding keeps disclosures reachable. */}
      {l.state === "funding" && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 px-4 py-3 bg-surface/95 backdrop-blur-sm border-t border-line">
          <button type="button" className="btn btn-primary btn-lg w-full" onClick={() => setSheet(true)}>Help it pop</button>
        </div>
      )}
      {sheet && (
        <div className="lg:hidden fixed inset-0 z-40 bg-ink/40" onClick={() => setSheet(false)} role="dialog" aria-modal="true" aria-label="Back this launch">
          <div className="absolute bottom-0 inset-x-0 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-bg p-3" onClick={(e) => e.stopPropagation()}>
            <BackingPanel l={l} onClose={() => setSheet(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatePill({ state }: { state: Launch["state"] }) {
  if (state === "funding") return <span className="pill pill-peach">Filling up</span>;
  if (state === "ready") return <span className="pill pill-lilac">Getting ready</span>;
  if (state === "live") return <span className="pill pill-mint">Live</span>;
  return <span className="pill pill-line">Refund available</span>;
}

function SidePanel({ l, exampleBacking, exampleTokens }: { l: Launch; exampleBacking: bigint; exampleTokens: bigint }) {
  if (l.state === "ready") {
    return (
      <div className="card p-6">
        <h2 className="display-md text-[22px]">Filled. No more backing.</h2>
        <p className="text-[15px] text-muted mt-2">The target was reached, so deposits are closed. A settlement transaction creates the pool, burns the LP tokens and enables claims in one step. If that does not happen before the recovery deadline, every backer can reclaim their SOL.</p>
        <p className="label mt-3">{LOCK_TEXT}</p>
      </div>
    );
  }
  if (l.state === "live") {
    return (
      <div className="card p-6">
        <h2 className="display-md text-[22px]">Your position (example)</h2>
        <dl className="mt-3 space-y-2 text-[15px]">
          <div className="flex justify-between"><dt className="text-muted">Backed</dt><dd className="num">{fmtSol(exampleBacking)} SOL</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Claimable</dt><dd className="num">{fmtTokens(exampleTokens, V1.decimals)} {l.ticker}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Claimed so far</dt><dd className="num">0 {l.ticker}</dd></div>
        </dl>
        <p className="label mt-3">Claims never expire and stay available even if you already traded elsewhere. Claim status comes from your on-chain receipt, not from wallet holdings.</p>
      </div>
    );
  }
  return (
    <div className="card p-6">
      <h2 className="display-md text-[22px]">Your position (example)</h2>
      <dl className="mt-3 space-y-2 text-[15px]">
        <div className="flex justify-between"><dt className="text-muted">Backed</dt><dd className="num">{fmtSol(exampleBacking)} SOL</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Reclaimable</dt><dd className="num">{fmtSol(exampleBacking)} SOL</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Reclaimed so far</dt><dd className="num">0 SOL</dd></div>
      </dl>
      <p className="label mt-3">Refunds never expire and go only to the wallet that backed. Network fees paid earlier are not returned. After a refund you will see the receipt and signature here.</p>
    </div>
  );
}

function SettlementProgress({ l }: { l: Launch }) {
  // Demo: in the connected app each step reflects an actual transaction; here the steps are labeled examples.
  const steps = [
    { t: "Target reached", s: "done" },
    { t: "Wrap 50 SOL and seed the pool", s: "pending" },
    { t: "Burn LP tokens", s: "waiting" },
    { t: "Enable claims", s: "waiting" },
  ];
  return (
    <div className="card mt-6 p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="display-md text-[20px]">Settlement progress</h2>
        <span className="pill pill-line">Demo steps</span>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.t} className="flex items-center gap-3 text-[15px]">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${s.s === "done" ? "bg-mint text-success" : s.s === "pending" ? "bg-yellow" : "bg-bg border border-line text-muted"}`} aria-hidden>{s.s === "done" ? "✓" : s.s === "pending" ? "…" : ""}</span>
            <span className={s.s === "waiting" ? "text-muted" : ""}>{s.t}</span>
            <span className="label ml-auto">{s.s === "done" ? "confirmed" : s.s === "pending" ? "in progress" : "waiting"}</span>
          </li>
        ))}
      </ol>
      <p className="label mt-3">The balloon pops only after settlement is finalized, not when funding hits 100%. If settlement is not finished before {l.settlementDeadline ? new Date(l.settlementDeadline).toUTCString().replace(" GMT", " UTC") : "the recovery deadline"}, this launch becomes refundable.</p>
    </div>
  );
}
