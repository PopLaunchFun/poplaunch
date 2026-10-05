import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO } from "@/lib/config";
import { demoLaunches, withPreviewState } from "@/demo/fixtures";
import { api, isStale, toLaunch } from "@/lib/api";
import { type LaunchState, pctFunded } from "@/lib/launch";
import { LaunchScreen } from "@/components/launch-screen";
import { LaunchLive } from "@/components/launch-live";
import { fetchLaunchFromChain } from "@/lib/chain";
import { StateSelector } from "@/components/state-selector";

export const dynamic = "force-dynamic";

const STATES: LaunchState[] = ["funding", "ready", "live", "refundable"];

export default async function LaunchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> }) {
  const { id } = await params;
  const { state } = await searchParams;
  if (DEMO) {
    const now = Date.now();
    let l = demoLaunches(now).find((x) => x.id === id);
    if (!l) notFound();
    const preview = STATES.includes(state as LaunchState) ? (state as LaunchState) : null;
    if (preview) l = withPreviewState(l, preview, now);
    return (
      <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] pt-5 md:pt-8 pb-28 lg:pb-12">
        <nav className="flex items-center gap-2 label" aria-label="Breadcrumb"><Link href="/#launches" className="link">Launches</Link><span aria-hidden>/</span><span>{l.name}</span></nav>
        <div className="mt-3"><StateSelector id={l.id} current={l.state} /></div>
        <LaunchScreen l={l} pct={pctFunded(BigInt(l.raisedLamports), BigInt(l.targetLamports))} />
      </div>
    );
  }
  // The index may not have seen a brand-new launch yet: fall back to the chain before giving up.
  const r = await api.launch(id);
  const l = r ? toLaunch(r.launch) : await fetchLaunchFromChain(id).catch(() => null);
  if (!l) notFound();
  return (
    <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] pt-5 md:pt-8 pb-28 lg:pb-12">
      <nav className="flex items-center gap-2 label" aria-label="Breadcrumb"><Link href="/#launches" className="link">Launches</Link><span aria-hidden>/</span><span>{l.name}</span><span className="addr ml-2 hidden sm:inline">{l.mint}</span></nav>
      <LaunchLive initial={l} initialStale={!r || isStale(r.scanUpdatedAt)} />
    </div>
  );
}
