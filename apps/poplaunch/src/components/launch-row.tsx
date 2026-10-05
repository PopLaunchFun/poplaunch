import Link from "next/link";
import { type Launch, fmtSol, pctFunded } from "@/lib/launch";
import { BalloonFrame } from "./balloon-frame";
import { Countdown } from "./countdown";
import { ArrowRight, BalloonString, ClockIcon } from "./art";

/** Compact horizontal launch row: balloon avatar, name and tagline, progress, percentage, time left, action. */
export function LaunchRow({ l }: { l: Launch }) {
  const raised = BigInt(l.raisedLamports), target = BigInt(l.targetLamports);
  const pct = pctFunded(raised, target);
  const fillPct = Math.min(100, pct.bps / 100);
  const fill = pct.bps >= 7500 ? "bg-red" : "bg-yellow";
  const href = `/launch/${l.id}`;
  return (
    <li className="box bg-surface relative rounded-[16px]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[142px_292px_363px_95px_174px_auto] items-center gap-x-4 md:gap-x-5 px-4 md:px-0 py-4 md:py-0 md:h-[106px]">
        {/* balloon avatar overhanging the row like the mockup */}
        <div className="relative w-[70px] md:w-[142px] h-[86px] md:h-full">
          <div className="absolute left-0 md:left-[40px] -top-3 md:-top-[6px] z-10">
            <BalloonFrame l={l} size={88} className="w-[70px] md:w-[88px] drop-shadow-[-6px_8px_6px_rgba(0,0,0,0.12)]" />
            <BalloonString className="absolute left-[34px] md:left-[40px] top-[82px] md:top-[100px]" height={42} />
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="display text-[24px] md:text-[30px] truncate"><Link href={href} className="hover:underline underline-offset-4 decoration-[3px] decoration-red">{l.name}</Link></h3>
          <p className="mono text-[13px] md:text-[15px] mt-1.5 md:truncate">{l.tagline}</p>
        </div>
        <div className="col-span-2 md:col-span-1 mt-3 md:mt-0">
          <div className="bar" role="progressbar" aria-valuenow={Math.round(pct.bps / 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.name} funded ${pct.text}`}><span className={fill} style={{ width: `${fillPct}%` }} /></div>
          <div className="mono font-bold text-[14px] num mt-2 md:mt-2.5">{fmtSol(raised, 2)} / {fmtSol(target, 0)} SOL</div>
        </div>
        <div className="font-extrabold text-[24px] md:text-[27px] num md:text-left mt-2 md:mt-0 self-start md:self-center">{pct.text}</div>
        <div className="flex items-center gap-2.5 font-semibold text-[17px] md:text-[18px] num mt-2 md:mt-0 justify-end md:justify-start"><ClockIcon /><Countdown deadline={l.fundingDeadline} /></div>
        <div className="col-span-2 md:col-span-1 mt-4 md:mt-0 md:pr-[30px]">
          <Link href={href} className="btn btn-red btn-lg w-full md:w-[243px]" aria-label={`Help ${l.name} pop`}>Help it pop <ArrowRight /></Link>
        </div>
      </div>
    </li>
  );
}
