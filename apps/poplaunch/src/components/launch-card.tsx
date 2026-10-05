import Link from "next/link";
import { type Launch, fmtSol, pctFunded } from "@/lib/launch";
import { Avatar } from "./avatar";
import { Countdown } from "./countdown";

export function LaunchCard({ l }: { l: Launch }) {
  const raised = BigInt(l.raisedLamports), target = BigInt(l.targetLamports);
  const pct = pctFunded(raised, target);
  const href = `/launch/${l.id}`;
  return (
    <article className="card p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <Avatar name={l.name} ticker={l.ticker} hue={l.hue} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="display-md text-[20px] truncate"><Link href={href} className="hover:underline underline-offset-4 decoration-2 decoration-coral">{l.name}</Link></h3>
          <div className="label">${l.ticker}</div>
        </div>
        {l.state === "live" && <span className="pill pill-mint">Live</span>}
        {l.state === "ready" && <span className="pill pill-lilac">Getting ready</span>}
      </div>
      {l.state === "live" ? (
        <>
          <p className="text-sm text-muted">Pool open. Market figures appear only when sourced and timestamped.</p>
          <div className="mt-auto flex items-center gap-3">
            <a className="btn btn-sm" href={l.poolUrl ?? "#"} target="_blank" rel="noreferrer noopener">Trade ${l.ticker}</a>
            <Link href={href} className="text-action text-sm">Details</Link>
          </div>
        </>
      ) : (
        <>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="num"><span className="display-md text-[22px]">{fmtSol(raised, 2)}</span> <span className="text-muted">/ {fmtSol(target, 0)} SOL</span></div>
              <div className="display-md text-[18px] num text-coral">{pct.text}</div>
            </div>
            <div className="progress mt-2" role="progressbar" aria-valuenow={Math.round(pct.bps / 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.name} funded ${pct.text}`}><span style={{ width: `${Math.min(100, pct.bps / 100)}%` }} /></div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3">
            <span className="label">{l.state === "ready" ? "Filled, preparing launch" : <Countdown deadline={l.fundingDeadline} />}</span>
            <Link href={href} className={`btn btn-sm ${l.state === "funding" ? "btn-primary" : ""}`}>{l.state === "funding" ? "Help it pop" : "View"}</Link>
          </div>
        </>
      )}
    </article>
  );
}
