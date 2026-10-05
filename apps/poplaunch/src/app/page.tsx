import Link from "next/link";
import { DEMO, demoLaunches } from "@/demo/fixtures";
import { sortForDiscovery, type Launch } from "@/lib/launch";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Feed } from "@/components/feed";

export const dynamic = "force-dynamic";

/** Featured launch: deterministic choice from real active launches (the top of the discovery sort). */
function pickFeatured(launches: Launch[]): Launch | null {
  const active = launches.filter((l) => l.state === "funding").sort(sortForDiscovery);
  return active[0] ?? null;
}

export default function Home() {
  // Stage 1 has no chain or indexer: the feed is the labeled demo set, or empty when demo mode is off.
  const launches = DEMO ? demoLaunches(Date.now()) : [];
  return (
    <>
      <Hero featured={pickFeatured(launches)} />
      <HowItWorks />
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <Feed launches={launches} />
        <section id="create" className="mt-16 md:mt-24 card p-8 md:p-12 grid md:grid-cols-12 gap-8 items-center scroll-mt-24">
          <div className="md:col-span-8">
            <h2 className="display text-[32px] md:text-[44px]">Anyone can make a coin. The crowd makes it pop.</h2>
            <p className="mt-4 text-[17px] text-muted max-w-[52ch]">Name it, add an image, publish. Every launch uses the same standard terms: a 50 SOL target, a 24-hour window, half the supply to backers and half into the pool with all the SOL. You keep no allocation and can back on the same terms as everyone else.</p>
          </div>
          <div className="md:col-span-4 flex flex-col gap-3 md:items-end">
            <Link href="/#create" className="btn btn-lg" aria-disabled="true" title="Coin creation opens with the connected app (Stage 3)">Create a coin</Link>
            <span className="label md:text-right">Creation opens with the connected app. Drafts cost nothing; the 0.1 SOL creation fee is paid only when the on-chain launch is created.</span>
          </div>
        </section>
      </div>
    </>
  );
}
