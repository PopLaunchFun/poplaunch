"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, isStale, toLaunch, type LaunchDto } from "@/lib/api";
import { sortForDiscovery, type Launch } from "@/lib/launch";
import { LaunchRow } from "./launch-row";
import { ArrowRight } from "./art";

type Tab = "filling" | "launched";

/** Live discovery feed from launchd, polled every few seconds; stale data is labeled, never hidden. */
export function LiveFeed({ initialFilling, initialLaunched, initialStale }: { initialFilling: LaunchDto[]; initialLaunched: LaunchDto[]; initialStale: boolean }) {
  const [tab, setTab] = useState<Tab>("filling");
  const [q, setQ] = useState("");
  const [filling, setFilling] = useState<Launch[]>(initialFilling.map(toLaunch));
  const [launched, setLaunched] = useState<Launch[]>(initialLaunched.map(toLaunch));
  const [stale, setStale] = useState(initialStale);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [f, l] = await Promise.all([api.launches("filling"), api.launches("launched")]);
      if (!alive) return;
      if (f && l) {
        setFilling(f.launches.map(toLaunch));
        setLaunched(l.launches.map(toLaunch));
        setStale(isStale(f.scanUpdatedAt));
        setApiDown(false);
      } else setApiDown(true);
    };
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const src = tab === "filling" ? [...filling].sort(sortForDiscovery) : launched;
    return needle ? src.filter((l) => l.name.toLowerCase().includes(needle) || l.ticker.toLowerCase().includes(needle) || l.mint.toLowerCase().startsWith(needle)) : src;
  }, [tab, q, filling, launched]);

  return (
    <section id="launches" className="mx-auto max-w-[1536px] px-4 md:px-[45px] pt-5 md:pt-[18px] scroll-mt-24">
      <div className="flex flex-col md:flex-row md:items-end gap-4 px-0 md:px-[10px]">
        <h2 className="display text-[32px] md:text-[42px]">Launches</h2>
        <div role="tablist" aria-label="Launch feed" className="flex gap-1 md:ml-4">
          <button role="tab" aria-selected={tab === "filling"} className="tab" onClick={() => setTab("filling")}>Filling up</button>
          <button role="tab" aria-selected={tab === "launched"} className="tab" onClick={() => setTab("launched")}>Just launched</button>
        </div>
        <label className="relative md:ml-auto md:w-80">
          <span className="sr-only">Search by name, ticker or mint</span>
          <input className="input pl-4" placeholder="Search name, ticker or mint" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
      </div>
      {(stale || apiDown) && (
        <p className="mt-3 tag tag-yellow" role="status">{apiDown ? "The launch index is unreachable. Showing the last loaded data; launch pages read the chain directly." : "Launch data may be a little behind the chain."}</p>
      )}
      {rows.length === 0 ? (
        <div className="box p-10 mt-6 text-center">
          <div className="display text-[28px]">{filling.length + launched.length === 0 ? "The next pop could be yours." : q ? "No launches match." : tab === "filling" ? "Nothing is filling up right now." : "Nothing has launched yet."}</div>
          <p className="label mt-2">{filling.length + launched.length === 0 ? "Launch a token and let the crowd fill its balloon." : q ? "Try another name, ticker or mint." : tab === "filling" && launched.length > 0 ? "See what just launched, or create a coin." : "Launch a token and let the crowd fill its balloon."}</p>
          {filling.length + launched.length === 0 && <Link href="/create" className="btn btn-red mt-5">Launch a token <ArrowRight /></Link>}
        </div>
      ) : (
        <ul className="mt-6 md:mt-[22px] space-y-[18px]" role="list">
          {rows.map((l) => <LaunchRow key={l.id} l={l} />)}
        </ul>
      )}
      <p className="label mt-4">{tab === "filling" ? "Sorted by percentage funded, then soonest deadline." : "Most recently launched first."} Backer counts mean unique contributing wallets, not verified people.</p>
    </section>
  );
}
