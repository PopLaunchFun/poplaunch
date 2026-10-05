import Link from "next/link";
import { V1, fmtSol } from "@/lib/launch";
import { ArrowRight, Chevrons, Cloud, Sparkle, Squiggle } from "./art";

/**
 * Empty state for the featured slot, in the same yellow panel as a live featured launch (the CAT.EXE
 * card from the approved mockup) but with no invented numbers: an invitation, the real target, and a
 * create button where the countdown would be. The brimming bar, the 49.99/50 figure and the trembling balloon are
 * illustration of the moment before a pop, not a launch: no coin name, no link, nothing to back.
 */
export function FeaturedEmpty() {
  return (
    <section className="box bg-yellow relative rounded-[18px] w-full md:h-[405px]" aria-label="No launch is filling up right now">
      <div className="absolute inset-0 overflow-hidden rounded-[15px]" aria-hidden>
        <Cloud className="absolute -bottom-1 left-[300px] hidden md:block" width={120} />
        <Cloud className="absolute -bottom-1 -right-1.5" width={220} />
      </div>
      <div className="relative px-5 pt-6 pb-8 md:p-0 md:h-full flex flex-col gap-5 md:block">
        <div className="relative md:absolute md:left-[37px] md:top-[26px] self-start -rotate-[8deg] bg-white border-[2.5px] border-ink rounded-[3px] px-3.5 py-3 mono font-bold text-[14px] md:text-[17px] leading-[1.25] uppercase tracking-[0.03em] w-[152px]" aria-hidden>
          Community funded coins on Solana
          <Squiggle className="absolute -right-4 -bottom-5" size={36} />
        </div>
        <Chevrons className="absolute left-[212px] top-[92px] hidden md:block" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="self-center md:absolute md:left-[258px] md:-top-[21px] -mt-2 md:mt-0 balloon-burst"><img src="/art/balloon-cat-featured.png" alt="" width={325} height={420} className="block select-none h-auto w-[230px] md:w-[325px]" draggable={false} /></div>
        <Sparkle className="absolute left-[322px] top-[296px] hidden md:block" size={34} flip />
        <div className="md:absolute md:left-[37px] md:top-[236px] md:w-[300px] relative">
          <h2 className="condensed text-[56px] md:text-[84px] leading-[0.85]">NEXT POP</h2>
          {/* hand-drawn arrow from the words to the balloon: up-right on desktop (balloon sits above right), up on phones (balloon above) */}
          <svg className="absolute hidden md:block left-[255px] -top-[4px]" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 94 C 30 70, 44 52, 76 30" /><path d="M56 26 L 80 26 L 76 50" />
          </svg>
          <svg className="absolute md:hidden right-2 -top-[70px]" width="60" height="70" viewBox="0 0 60 70" fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M30 66 C 20 50, 40 30, 30 8" /><path d="M14 22 L 30 6 L 46 22" />
          </svg>
        </div>
        <div className="md:absolute md:right-[27px] md:top-[66px] md:w-[288px]">
          <Sparkle className="absolute -right-2 -top-7 hidden md:block" size={44} />
          <div className="md:text-center">
            <div className="condensed text-[64px] md:text-[80px] num leading-[0.85] tracking-[-0.01em]">49.99<span className="text-[40px] md:text-[52px]">/50</span></div>
            <div className="mono font-bold text-[20px] md:text-[26px] num mt-1 md:mt-1">SOL TARGET</div>
          </div>
          <div className="bar bar-brim mt-3 md:mt-[18px] bg-white" role="presentation"><span className="bg-green" /></div>
          <div className="mt-3 md:mt-[14px] text-center"><Link href="/create" className="btn btn-red">Launch a token <ArrowRight /></Link></div>
        </div>
      </div>
    </section>
  );
}
