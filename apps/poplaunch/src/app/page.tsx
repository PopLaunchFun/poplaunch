import Link from "next/link";
import { DEMO, demoLaunches } from "@/demo/fixtures";
import { sortForDiscovery, type Launch } from "@/lib/launch";
import { FeaturedPanel } from "@/components/featured-panel";
import { LaunchRow } from "@/components/launch-row";
import { ArrowRight } from "@/components/art";

export const dynamic = "force-dynamic";

/** Featured launch: deterministic choice from active launches (top of the discovery sort). */
function pickFeatured(launches: Launch[]): Launch | null {
  return launches.filter((l) => l.state === "funding").sort(sortForDiscovery)[0] ?? null;
}

export default function Home() {
  // The visual preview runs on the mockup's three sample coins. Production reads real launches.
  const launches = DEMO ? demoLaunches(Date.now()) : [];
  const featured = pickFeatured(launches);
  const rows = launches.filter((l) => l.state === "funding" || l.state === "ready").sort(sortForDiscovery);
  return (
    <>
      {/* Hero: stacked headline left, featured panel right */}
      <section className="mx-auto max-w-[1536px] px-4 md:px-[55px] pt-6 md:pt-[22px] pb-8 md:pb-[26px] grid md:grid-cols-[minmax(0,1fr)_887px] gap-x-12 gap-y-10 items-start">
        <div className="pt-1 md:pt-[30px]">
          <h1 className="display text-[64px] sm:text-[88px] md:text-[118px] leading-[0.86]">
            <span className="block">Back it.</span>
            <span className="block">Fill it.</span>
            <span className="block text-red-deep">Pop it.</span>
          </h1>
          <p className="font-bold text-[20px] md:text-[25px] mt-5 md:mt-[14px] tracking-[-0.01em]">Fill the balloon. Launch a coin together.</p>
        </div>
        {featured ? (
          <FeaturedPanel l={featured} />
        ) : (
          <div className="box p-10 text-center">
            <div className="display text-[32px]">The next pop could be yours.</div>
            <Link href="/#create" className="btn btn-red mt-5">Create a coin</Link>
          </div>
        )}
      </section>

      <div className="border-t-[3px] border-ink" />

      <section id="launches" className="mx-auto max-w-[1536px] px-4 md:px-[45px] pt-5 md:pt-[18px] scroll-mt-24">
        <div className="flex items-end justify-between gap-4 px-0 md:px-[10px]">
          <h2 className="display text-[32px] md:text-[40px]"><span className="marker">Demo</span> launches</h2>
          <a href="#launches" className="font-semibold text-[15px] md:text-[16px] inline-flex items-center gap-2 pr-0 md:pr-[7px] whitespace-nowrap shrink-0">See all launches <ArrowRight size={18} /></a>
        </div>
        {rows.length === 0 ? (
          <div className="box p-10 mt-6 text-center">
            <div className="display text-[28px]">The next pop could be yours.</div>
            <p className="label mt-2">Create a coin and let the crowd fill its balloon.</p>
          </div>
        ) : (
          <ul className="mt-6 md:mt-[22px] space-y-[18px]" role="list">
            {rows.map((l) => <LaunchRow key={l.id} l={l} />)}
          </ul>
        )}
      </section>
      <p id="create" className="sr-only">Create a coin opens with the connected app.</p>
    </>
  );
}
