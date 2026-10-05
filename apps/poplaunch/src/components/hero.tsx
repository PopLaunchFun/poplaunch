import Link from "next/link";
import { type Launch, fmtSol, pctFunded } from "@/lib/launch";
import { Balloon } from "./balloon";
import { Countdown } from "./countdown";

export function Hero({ featured }: { featured: Launch | null }) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 md:px-8 pt-10 md:pt-20 pb-6 md:pb-10 grid md:grid-cols-12 gap-10 items-center">
      <div className="md:col-span-7">
        <h1 className="display text-[42px] sm:text-[52px] md:text-[72px] lg:text-[80px] max-w-[11ch]">Big ideas. Ready to pop.</h1>
        <p className="mt-5 md:mt-7 text-[18px] md:text-[20px] text-muted max-w-[34ch]">Back a coin. Fill the balloon. Launch together.</p>
        <div className="mt-7 md:mt-9 flex items-center gap-6 flex-wrap">
          <Link href="/#launches" className="btn btn-primary btn-lg">Explore launches</Link>
          <Link href="/#create" className="text-action text-[17px]">Create a coin</Link>
        </div>
      </div>
      <div className="md:col-span-5">
        {featured ? <FeaturedCard l={featured} /> : (
          <div className="card p-8 text-center">
            <Balloon bps={0} name="Your coin" ticker="?" hue={30} size={200} calm />
            <div className="display-md text-[24px] mt-2">The next pop could be yours.</div>
            <Link href="/#create" className="btn btn-primary mt-4">Create a coin</Link>
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturedCard({ l }: { l: Launch }) {
  const raised = BigInt(l.raisedLamports), target = BigInt(l.targetLamports);
  const pct = pctFunded(raised, target);
  return (
    <div className="card p-6 md:p-7 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-yellow/70" aria-hidden />
      <div className="absolute -left-8 bottom-10 w-24 h-24 rounded-full bg-lilac/60" aria-hidden />
      <div className="relative flex items-center justify-between">
        <span className="eyebrow">Featured launch</span>
        <span className="pill pill-line">Demo</span>
      </div>
      <div className="relative flex justify-center my-2">
        <Balloon bps={pct.bps} name={l.name} ticker={l.ticker} hue={l.hue} size={250} />
      </div>
      <div className="relative">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display-md text-[26px]">{l.name} <span className="text-muted font-bold text-[18px]">${l.ticker}</span></h2>
          <div className="display-md text-[22px] num text-coral">{pct.text}</div>
        </div>
        <div className="progress mt-3" role="progressbar" aria-valuenow={Math.round(pct.bps / 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.name} funded ${pct.text}`}><span style={{ width: `${Math.min(100, pct.bps / 100)}%` }} /></div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="num"><span className="display-md text-[22px]">{fmtSol(raised, 2)}</span> <span className="text-muted">of {fmtSol(target, 0)} SOL</span></div>
          <span className="label"><Countdown deadline={l.fundingDeadline} /></span>
        </div>
        <Link href={`/launch/${l.id}`} className="btn btn-primary w-full mt-5">Help it pop</Link>
      </div>
    </div>
  );
}
