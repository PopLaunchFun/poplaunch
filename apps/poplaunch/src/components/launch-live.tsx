"use client";
/** Live launch page: polls launchd, falls back to reading the chain, and renders the approved screen with real actions. */
import { useCallback, useEffect, useState } from "react";
import { api, toLaunch } from "@/lib/api";
import { fetchLaunchFromChain } from "@/lib/chain";
import { pctFunded, type Launch } from "@/lib/launch";
import { LaunchScreen } from "./launch-screen";

export function LaunchLive({ initial, initialStale }: { initial: Launch; initialStale: boolean }) {
  const [l, setL] = useState<Launch>(initial);
  const [source, setSource] = useState<"index" | "chain" | "none">(initialStale ? "chain" : "index");

  const refresh = useCallback(async () => {
    const r = await api.launch(l.mint);
    if (r && Date.now() - Date.parse(r.scanUpdatedAt ?? "") < 30_000) {
      setL((prev) => ({ ...toLaunch(r.launch), hue: prev.hue }));
      setSource("index");
      return;
    }
    const c = await fetchLaunchFromChain(l.mint, r ? toLaunch(r.launch) : l).catch(() => null);
    if (c) { setL(c); setSource("chain"); } else setSource("none");
  }, [l]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <>
      {source !== "index" && (
        <p className="tag tag-yellow mt-3" role="status">{source === "chain" ? "The launch index is behind; this page is reading the chain directly." : "Neither the index nor the chain could be reached. Showing the last known state."}</p>
      )}
      <LaunchScreen l={l} pct={pctFunded(BigInt(l.raisedLamports), BigInt(l.targetLamports))} live onRefresh={() => void refresh()} />
    </>
  );
}
