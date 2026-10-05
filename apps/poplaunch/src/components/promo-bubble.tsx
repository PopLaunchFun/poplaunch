"use client";
/**
 * "Feeless" promotion bubble. Shows only while BOTH are true: the configured end time has not passed, and the
 * protocol's live creation fee is actually zero. The second check is read from the chain so the page can never
 * advertise something the program will not honour.
 */
import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PopLaunchClient } from "@pop/sdk";
import { DEMO } from "@/lib/config";

export const FEELESS_UNTIL = Date.parse(process.env.NEXT_PUBLIC_FEELESS_UNTIL ?? "") || 0;

function left(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60);
  return h >= 1 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function useFeeless(): { active: boolean; until: number } {
  const { connection } = useConnection();
  const [feeZero, setFeeZero] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!FEELESS_UNTIL || DEMO) return;
    PopLaunchClient.readOnly(connection).fetchConfig().then((c) => setFeeZero(c.settings.creationFeeLamports.toString() === "0")).catch(() => setFeeZero(false));
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [connection]);
  return { active: !!FEELESS_UNTIL && now < FEELESS_UNTIL && (DEMO ? true : feeZero === true), until: FEELESS_UNTIL };
}

/** Big speech bubble for the homepage hero. */
export function PromoBubble({ className = "" }: { className?: string }) {
  const { active, until } = useFeeless();
  if (!active) return null;
  return (
    <div className={`relative inline-block ${className}`} role="status">
      <div className="promo-bubble bg-red text-white border-[3px] border-ink rounded-[18px] px-4 py-3 md:px-5 md:py-4 shadow-[5px_5px_0_#000] -rotate-[4deg]">
        <div className="display text-[22px] md:text-[30px] leading-[0.9]">Feeless for 24 hours!</div>
        <div className="mono font-bold text-[12px] md:text-[14px] uppercase tracking-[0.12em] mt-1.5">No SOL creation fee · {left(until - Date.now())} left</div>
        <svg className="absolute -bottom-[14px] left-8" width="26" height="16" viewBox="0 0 26 16" aria-hidden><path d="M2 0 L24 0 L8 15 Z" fill="#fb473b" stroke="#000" strokeWidth="3" strokeLinejoin="round" /><path d="M5 0 L21 0" stroke="#fb473b" strokeWidth="4" /></svg>
      </div>
    </div>
  );
}

/** Small tag for the create page. */
export function PromoTag() {
  const { active, until } = useFeeless();
  if (!active) return null;
  return <span className="tag tag-yellow">Feeless · {left(until - Date.now())} left</span>;
}
