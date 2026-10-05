import { ImageResponse } from "next/og";
import { DEMO } from "@/lib/config";
import { demoLaunches } from "@/demo/fixtures";
import { api } from "@/lib/api";
import { fmtSol, pctFunded } from "@/lib/launch";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** Deterministic share card: name, funding snapshot with its timestamp, and the call to action. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name = "Pop Launch", ticker = "", raised = 0n, target = 0n, state = "funding";
  if (DEMO) {
    const l = demoLaunches(Date.now()).find((x) => x.id === id);
    if (l) { name = l.name; ticker = l.ticker; raised = BigInt(l.raisedLamports); target = BigInt(l.targetLamports); state = l.state; }
  } else {
    const r = await api.launch(id);
    if (r) { name = r.launch.name; ticker = r.launch.symbol; raised = BigInt(r.launch.raisedLamports); target = BigInt(r.launch.targetLamports); state = r.launch.state; }
  }
  const pct = pctFunded(raised, target);
  const snapshot = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const line = state === "live" ? "It popped. Live now." : state === "refundable" ? "This one didn’t launch." : state === "ready" ? "Filled! Getting ready." : "Help it pop.";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fcfaf6", color: "#000", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 44, fontWeight: 900 }}>pop launch</div>
          <div style={{ fontSize: 22, padding: "8px 16px", border: "3px solid #000", borderRadius: 12, background: "#fff" }}>Snapshot {snapshot}</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", width: 260, height: 300, borderRadius: 150, background: "#fb473b", border: "6px solid #000", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 72, fontWeight: 900 }}>{ticker.slice(0, 2) || "POP"}</div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1 }}>{name}</div>
            <div style={{ fontSize: 36, marginTop: 8 }}>{ticker ? `$${ticker}` : ""}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 36 }}>
              <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 0.9 }}>{pct.text}</div>
              <div style={{ fontSize: 40, fontFamily: "monospace" }}>{fmtSol(raised, 2)} / {fmtSol(target, 0)} SOL</div>
            </div>
            <div style={{ display: "flex", height: 36, border: "4px solid #000", borderRadius: 999, background: "#fff", marginTop: 20, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, pct.bps / 100)}%`, background: pct.bps >= 7500 ? "#fb473b" : "#fddf31", display: "flex" }} />
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, marginTop: 28 }}>{line}</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
