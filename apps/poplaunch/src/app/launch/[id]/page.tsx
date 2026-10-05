import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO, demoLaunches, withPreviewState } from "@/demo/fixtures";
import { type LaunchState, fmtSol, pctFunded, short } from "@/lib/launch";
import { LaunchScreen } from "@/components/launch-screen";
import { StateSelector } from "@/components/state-selector";

export const dynamic = "force-dynamic";

const STATES: LaunchState[] = ["funding", "ready", "live", "refundable"];

export default async function LaunchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> }) {
  const { id } = await params;
  const { state } = await searchParams;
  if (!DEMO) notFound();
  const now = Date.now();
  let l = demoLaunches(now).find((x) => x.id === id);
  if (!l) notFound();
  const preview = STATES.includes(state as LaunchState) ? (state as LaunchState) : null;
  if (preview) l = withPreviewState(l, preview, now);
  const pct = pctFunded(BigInt(l.raisedLamports), BigInt(l.targetLamports));
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-8 pt-5 md:pt-8 pb-28 lg:pb-12">
      <nav className="flex items-center gap-2 label" aria-label="Breadcrumb"><Link href="/#launches" className="link">Launches</Link><span aria-hidden>/</span><span>{l.name}</span></nav>
      <div className="mt-3"><StateSelector id={l.id} current={l.state} /></div>
      <LaunchScreen l={l} pct={pct} />
      <p className="sr-only">{l.name} {l.ticker}: {fmtSol(l.raisedLamports)} of {fmtSol(l.targetLamports, 0)} SOL, creator {short(l.creator)}.</p>
    </div>
  );
}
