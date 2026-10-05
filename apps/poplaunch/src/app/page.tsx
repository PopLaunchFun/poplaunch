import Link from "next/link";
import { DEMO } from "@/lib/config";
import { demoLaunches } from "@/demo/fixtures";
import { api, isStale, toLaunch } from "@/lib/api";
import { sortForDiscovery, type Launch } from "@/lib/launch";
import { FeaturedPanel } from "@/components/featured-panel";
import { LaunchRow } from "@/components/launch-row";
import { LiveFeed } from "@/components/live-feed";
import { ArrowRight } from "@/components/art";

export const dynamic = "force-dynamic";

/** Featured launch: deterministic choice from active launches (top of the discovery sort). */
function pickFeatured(launches: Launch[]): Launch | null {
  return launches.filter((l) => l.state === "funding").sort(sortForDiscovery)[0] ?? null;
}

export default async function Home() {
  if (DEMO) {
    const launches = demoLaunches(Date.now());
    const rows = launches.filter((l) => l.state === "funding" || l.state === "ready").sort(sortForDiscovery);
    return (
      <>
        <Hero featured={pickFeatured(launches)} />
        <div className="border-t-[3px] border-ink" />
        <section id="launches" className="mx-auto max-w-[1536px] px-4 md:px-[45px] pt-5 md:pt-[18px] scroll-mt-24">
          <div className="flex items-end justify-between gap-4 px-0 md:px-[10px]">
            <h2 className="display text-[32px] md:text-[42px]"><span className="marker">Demo</span> launches</h2>
            <a href="#launches" className="font-semibold text-[15px] md:text-[16px] inline-flex items-center gap-2 pr-0 md:pr-[7px] whitespace-nowrap shrink-0">See all launches <ArrowRight size={18} /></a>
          </div>
          <ul className="mt-6 md:mt-[22px] space-y-[18px]" role="list">
            {rows.map((l) => <LaunchRow key={l.id} l={l} />)}
          </ul>
        </section>
      </>
    );
  }
  const [filling, launched] = await Promise.all([api.launches("filling"), api.launches("launched")]);
  const featured = pickFeatured((filling?.launches ?? []).map(toLaunch));
  return (
    <>
      <Hero featured={featured} />
      <div className="border-t-[3px] border-ink" />
      <LiveFeed initialFilling={filling?.launches ?? []} initialLaunched={launched?.launches ?? []} initialStale={!filling || isStale(filling.scanUpdatedAt)} />
    </>
  );
}

function Hero({ featured }: { featured: Launch | null }) {
  return (
    <section className="mx-auto max-w-[1536px] px-4 md:px-[55px] pt-6 md:pt-[22px] pb-8 md:pb-[26px] grid md:grid-cols-[minmax(0,1fr)_887px] gap-x-12 gap-y-10 items-start">
      <div className="pt-1 md:pt-[26px]">
        <h1 className="display text-[66px] sm:text-[92px] md:text-[132px] leading-[0.85] tracking-[-0.045em]">
          <span className="block">Back it.</span>
          <span className="block">Fill it.</span>
          <span className="block text-red-deep">Pop it.</span>
        </h1>
        <p className="font-bold text-[20px] md:text-[25px] mt-5 md:mt-[12px] tracking-[-0.01em]">Fill the balloon. Launch a coin together.</p>
      </div>
      {featured ? (
        <FeaturedPanel l={featured} />
      ) : (
        <div className="box bg-yellow p-10 md:p-14 text-center md:min-h-[405px] flex flex-col items-center justify-center">
          <div className="display text-[36px] md:text-[48px]">The next pop could be yours.</div>
          <p className="font-bold text-[18px] mt-3">No launch is filling up right now.</p>
          <Link href="/create" className="btn btn-red btn-lg mt-6">Create a coin <ArrowRight /></Link>
        </div>
      )}
    </section>
  );
}
