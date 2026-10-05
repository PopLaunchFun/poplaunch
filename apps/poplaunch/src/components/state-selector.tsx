"use client";
import Link from "next/link";
import { STATE_LABEL, type LaunchState } from "@/lib/launch";

/** Dev-only preview control for the four on-chain states. Rendered only in demo mode. */
export function StateSelector({ id, current }: { id: string; current: LaunchState }) {
  const states: LaunchState[] = ["funding", "ready", "live", "refundable"];
  return (
    <div className="card-sm p-3 flex items-center gap-2 flex-wrap text-sm" role="group" aria-label="Dev-only state preview">
      <span className="pill bg-ink text-white text-[11px]">Dev preview</span>
      <span className="label">Show this launch as:</span>
      {states.map((s) => (
        <Link key={s} href={`/launch/${id}?state=${s}`} className="tab text-[14px] px-3 py-1.5 min-h-9" aria-current={s === current ? "page" : undefined} aria-selected={s === current} role="tab">{STATE_LABEL[s]}</Link>
      ))}
    </div>
  );
}
