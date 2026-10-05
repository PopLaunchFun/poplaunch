"use client";
import { useEffect, useState } from "react";
import { SOL_USD_URL } from "./config";

/** SOL/USD from an optional configured feed. Null when unavailable: USD displays degrade to SOL. */
export function useSolUsd(): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!SOL_USD_URL) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(SOL_USD_URL);
        const j = (await r.json()) as { price?: number; solana?: { usd?: number } };
        const p = j.price ?? j.solana?.usd ?? null;
        if (alive && typeof p === "number") setPrice(p);
      } catch {
        /* unavailable */
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return price;
}
