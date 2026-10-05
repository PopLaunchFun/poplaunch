"use client";
import { useEffect, useState } from "react";

function fmt(ms: number): string {
  if (ms <= 0) return "0m";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/**
 * Approximate client countdown to `deadline` (ms). Renders a dash until mounted so server and client
 * markup match. A real deployment re-fetches chain state when it reaches zero; here it just shows "0m".
 */
export function Countdown({ deadline, prefix = "", suffix = " left" }: { deadline: number; prefix?: string; suffix?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <span className="num" aria-live="off">{prefix}—</span>;
  return <time className="num" dateTime={new Date(deadline).toISOString()} title={new Date(deadline).toLocaleString()}>{prefix}{fmt(deadline - now)}{suffix}</time>;
}

export function Ago({ at }: { at: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  if (now === null) return <span>—</span>;
  return <time dateTime={new Date(at).toISOString()}>{fmt(now - at)} ago</time>;
}
