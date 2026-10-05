"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { type Launch, sortForDiscovery } from "@/lib/launch";
import { LaunchCard } from "./launch-card";

type Tab = "filling" | "launched";

export function Feed({ launches }: { launches: Launch[] }) {
  const [tab, setTab] = useState<Tab>("filling");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return launches
      .filter((l) => (tab === "filling" ? l.state === "funding" || l.state === "ready" : l.state === "live"))
      .filter((l) => (needle ? l.name.toLowerCase().includes(needle) || l.ticker.toLowerCase().includes(needle) || l.mint.toLowerCase().startsWith(needle) : true))
      .sort(tab === "filling" ? sortForDiscovery : (a, b) => (b.liveAt ?? 0) - (a.liveAt ?? 0));
  }, [launches, tab, q]);
  return (
    <section id="launches" className="scroll-mt-24">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <h2 className="display text-[32px] md:text-[40px]">Launches</h2>
        <div role="tablist" aria-label="Launch feed" className="flex gap-1 md:ml-4">
          <button role="tab" aria-selected={tab === "filling"} className="tab" onClick={() => setTab("filling")}>Filling up</button>
          <button role="tab" aria-selected={tab === "launched"} className="tab" onClick={() => setTab("launched")}>Just launched</button>
        </div>
        <label className="relative md:ml-auto md:w-80">
          <span className="sr-only">Search launches by name, ticker or mint</span>
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="8" cy="8" r="5" /><path d="m12 12 4 4" strokeLinecap="round" /></svg>
          <input className="input pl-10" placeholder="Search name, ticker or mint" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="card p-10 mt-6 text-center">
          <div className="display-md text-[24px]">{launches.length === 0 ? "The next pop could be yours." : "No launches match."}</div>
          <p className="label mt-2">{launches.length === 0 ? "Create a coin and let the crowd fill its balloon." : "Try another name or ticker."}</p>
          {launches.length === 0 && <Link href="/#create" className="btn btn-primary mt-5">Create a coin</Link>}
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" role="list">
          {rows.map((l) => <li key={l.id}><LaunchCard l={l} /></li>)}
        </ul>
      )}
      <p className="label mt-4">{tab === "filling" ? "Sorted by percentage funded, then soonest deadline." : "Most recently launched first."} Backer counts mean unique contributing wallets, not verified people.</p>
    </section>
  );
}
