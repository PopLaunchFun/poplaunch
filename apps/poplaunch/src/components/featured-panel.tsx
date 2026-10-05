import Link from "next/link";
import { type Launch, fmtSol, pctFunded } from "@/lib/launch";
import { BalloonFrame } from "./balloon-frame";
import { Countdown } from "./countdown";
import { Chevrons, Cloud, Sparkle, Squiggle } from "./art";

/**
 * The sunflower-yellow featured panel from the mockup: note card, balloon overhanging the top edge,
 * name and caption, big percentage, bar, countdown chip, clouds. Desktop positions are absolute to
 * match the reference; mobile stacks the same pieces in flow.
 */
export function FeaturedPanel({ l }: { l: Launch }) {
  const raised = BigInt(l.raisedLamports), target = BigInt(l.targetLamports);
  const pct = pctFunded(raised, target);
  const fillPct = Math.min(100, pct.bps / 100);
  return (
    <section className="box bg-yellow relative rounded-[18px] w-full md:h-[405px]" aria-labelledby="featured-name">
      {/* clipped layer: clouds only */}
      <div className="absolute inset-0 overflow-hidden rounded-[15px]" aria-hidden>
        <Cloud className="absolute -bottom-1 left-[300px] hidden md:block" width={120} />
        <Cloud className="absolute -bottom-1 -right-1.5" width={220} />
      </div>

      <div className="relative px-5 pt-6 pb-20 md:p-0 md:h-full flex flex-col gap-5 md:block">
        {/* note card */}
        <div className="relative md:absolute md:left-[37px] md:top-[26px] self-start -rotate-[8deg] bg-white border-[2.5px] border-ink rounded-[3px] px-3.5 py-3 mono font-bold text-[14px] md:text-[17px] leading-[1.25] uppercase tracking-[0.03em] w-[152px]" aria-hidden>
          Community funded coins on Solana
          <Squiggle className="absolute -right-4 -bottom-5" size={36} />
        </div>
        <Chevrons className="absolute left-[212px] top-[92px] hidden md:block" />

        {/* balloon, overhanging the panel's top edge like the mockup */}
        <div className="self-center md:absolute md:left-[258px] md:-top-[21px] -mt-2 md:mt-0 balloon-float">
          <BalloonFrame l={l} featured size={325} className="w-[230px] md:w-[325px]" />
        </div>
        <Sparkle className="absolute left-[322px] top-[296px] hidden md:block" size={34} flip />

        {/* name + caption */}
        <div className="md:absolute md:left-[37px] md:top-[236px] md:w-[300px]">
          <h2 id="featured-name" className="condensed text-[56px] md:text-[84px] leading-[0.85]">{l.name}</h2>
          <p className="mono font-bold text-[12px] md:text-[15px] uppercase tracking-[0.2em] mt-3 md:mt-[14px] leading-[1.6] max-w-[300px]">{l.description}</p>
        </div>

        {/* stats */}
        <div className="md:absolute md:right-[27px] md:top-[66px] md:w-[288px]">
          <Sparkle className="absolute -right-2 -top-7 hidden md:block" size={44} />
          <div className="condensed text-[84px] md:text-[124px] num leading-[0.8] md:text-right md:pr-1">{pct.text}</div>
          <div className="mono font-bold text-[20px] md:text-[26px] num mt-3 md:mt-[14px] md:text-right md:pr-6">{fmtSol(raised, 2)} / {fmtSol(target, 0)} SOL</div>
          <div className="bar bar-lg mt-3 md:mt-[18px] bg-white" role="progressbar" aria-valuenow={Math.round(pct.bps / 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.name} funded ${pct.text}`}>
            <span className="bg-red" style={{ width: `${fillPct}%` }} />
          </div>
          <div className="mt-3 md:mt-[12px]"><span className="chip num"><Countdown deadline={l.fundingDeadline} /></span></div>
          <Sparkle className="absolute -left-4 top-[132px] hidden md:block" size={30} flip />
        </div>
      </div>
      <Link href={`/launch/${l.id}`} className="sr-only">Help {l.name} pop</Link>
    </section>
  );
}
