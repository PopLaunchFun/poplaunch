"use client";
import { useMemo, useState } from "react";
import { ALL_SCENARIOS, Simulation, serializeReport, type RunReport } from "@pop/simulator";
import { FACTORY_DEFAULTS, SOL } from "@pop/math";
import { fmtSol, fmtBase, fmtPrice } from "@/lib/format";

const PRESETS: { id: string; label: string; scenario: string }[] = [
  { id: "straight-pump", label: "Straight pump", scenario: "straight-pump" },
  { id: "pump-then-sell", label: "Dump after pump", scenario: "pump-then-sell" },
  { id: "repeated-chop", label: "Chop", scenario: "repeated-chop" },
  { id: "round-trip-actor", label: "Round-trip actor", scenario: "round-trip-actor" },
  { id: "split-trades", label: "Split trades", scenario: "split-trades" },
  { id: "distant-scar", label: "Thin-bin gap / distant scar", scenario: "distant-scar" },
  { id: "sell-depletion", label: "Exhausted bid inventory", scenario: "sell-depletion" },
  { id: "sandwich", label: "Sandwich", scenario: "sandwich" },
  { id: "multiple-launches", label: "Multiple launches", scenario: "multiple-launches" },
  { id: "interrupted-creation", label: "Interrupted creation", scenario: "interrupted-creation" },
  { id: "seed-size-sweep", label: "Seed size sweep", scenario: "seed-size-sweep" },
];

export function Lab() {
  const [reports, setReports] = useState<RunReport[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ buys: number; size: number; sells: boolean }>({ buys: 10, size: 0.5, sells: true });

  function run(id: string) {
    setBusy(id);
    setTimeout(() => {
      const s = ALL_SCENARIOS.find((x) => x.id === id)!;
      const out = s.run();
      setReports(Array.isArray(out) ? out : [out]);
      setSelected(0);
      setBusy(null);
    }, 10);
  }

  function runCustom() {
    setBusy("custom");
    setTimeout(() => {
      const sim = new Simulation({ name: "custom", description: `${custom.buys} buys of ${custom.size} SOL${custom.sells ? ", each followed by a full sell" : ""}.`, config: FACTORY_DEFAULTS });
      sim.fund("you", 1000n * SOL);
      const gross = BigInt(Math.round(custom.size * 1e9));
      for (let i = 0; i < custom.buys; i++) {
        sim.swap("you", "buy", gross);
        if (custom.sells) sim.swap("you", "sell", sim.actor("you").base);
      }
      setReports([sim.report()]);
      setSelected(0);
      setBusy(null);
    }, 10);
  }

  const r = reports?.[selected] ?? null;
  const priceSeries = useMemo(() => (r ? r.trades.filter((t) => t.ok && t.avgPrice).map((t) => t.avgPrice as number) : []), [r]);

  return (
    <div className="mt-6 grid lg:grid-cols-[280px_1fr] gap-6">
      <div className="space-y-2">
        <div className="label">Presets</div>
        {PRESETS.map((p) => (
          <button key={p.id} className="btn w-full justify-start" disabled={!!busy} onClick={() => run(p.scenario)}>{busy === p.scenario ? "running…" : p.label}</button>
        ))}
        <div className="label mt-4">Custom</div>
        <label className="block text-xs">buys <input className="input mt-1" type="number" min={1} max={500} value={custom.buys} onChange={(e) => setCustom({ ...custom, buys: Number(e.target.value) })} /></label>
        <label className="block text-xs">size (SOL) <input className="input mt-1" type="number" step="0.01" min={0.001} value={custom.size} onChange={(e) => setCustom({ ...custom, size: Number(e.target.value) })} /></label>
        <label className="text-xs flex gap-2 items-center"><input type="checkbox" checked={custom.sells} onChange={(e) => setCustom({ ...custom, sells: e.target.checked })} /> sell everything after each buy</label>
        <button className="btn btn-green w-full" disabled={!!busy} onClick={runCustom}>Run custom</button>
        {reports && <button className="btn w-full" onClick={() => { const blob = new Blob([serializeReport(reports[selected]!)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${reports[selected]!.name}.json`; a.click(); }}>Download run (JSON)</button>}
      </div>
      <div className="min-w-0">
        {!r && <div className="panel p-6 text-muted text-sm">Pick a preset. Seed money and scar money are tracked separately; every swap is inspectable.</div>}
        {r && (
          <div className="space-y-4">
            {reports!.length > 1 && (
              <div className="flex gap-1">{reports!.map((x, i) => <button key={x.name} className={`chip ${i === selected ? "chip-on" : ""}`} onClick={() => setSelected(i)}>{x.name}</button>)}</div>
            )}
            <div className="panel p-3 text-sm"><div className="font-semibold">{r.name} <span className="chip ml-2">{r.configLabel}</span></div><div className="text-muted mt-1">{r.description}</div></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs num">
              <Box k="Trades" v={`${r.tradeCount.succeeded} ok / ${r.tradeCount.failed} failed`} />
              <Box k="Historical paired" v={fmtSol(r.matched.pairedQuoteLifetime)} tone="scar" />
              <Box k="Current scar inventory" v={`${fmtSol(r.endingInventory.scarQuote)} · ${fmtBase(r.endingInventory.scarBase, 6)} tokens`} tone="scar" />
              <Box k="Pending escrow" v={`${fmtSol(r.endingInventory.pendingQuoteEligible)} · ${fmtBase(r.endingInventory.pendingBaseEligible, 6)} tokens`} tone="violet" />
              <Box k="Seed inventory now" v={`${fmtSol(r.endingInventory.seedQuote)} · ${fmtBase(r.endingInventory.seedBase, 6)} tokens`} />
              <Box k="Cursor price" v={`${fmtPrice(r.endingInventory.cursorPriceHuman)} SOL (bin ${r.endingInventory.cursor})`} />
              <Box k="Status" v={`${r.matched.status} · ${r.matched.hardenedBands} bands · ${(r.matched.graduationProgress * 100).toFixed(1)}%`} />
              <Box k="Reconciliation" v={r.reconciliation.ok ? "OK" : "FAILED"} tone={r.reconciliation.ok ? "lime" : "scar"} />
            </div>
            <Spark values={priceSeries} label="executed price per swap" />
            <Spark values={r.trades.filter((t) => t.ok).map((t) => Number(t.scarFee))} label="scar fee per swap (input units)" />
            <div className="panel p-3 text-xs">
              <div className="label mb-1">Findings</div>
              <ul className="list-disc ml-4 space-y-1 text-muted">{r.findings.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
            <div className="panel overflow-x-auto">
              <div className="label p-3">Every simulated swap</div>
              <table className="w-full text-xs num">
                <thead><tr className="text-muted text-left"><th className="px-2">#</th><th>actor</th><th>side</th><th>gross</th><th>output</th><th>bins</th><th>scars formed</th><th>result</th></tr></thead>
                <tbody>
                  {r.trades.slice(0, 300).map((t) => (
                    <tr key={t.seq} className="border-t border-line">
                      <td className="px-2">{t.seq}</td><td>{t.actor}</td><td className={t.direction === "buy" ? "text-green" : "text-neg"}>{t.direction}</td>
                      <td>{t.direction === "buy" ? fmtSol(t.grossInput) : fmtBase(t.grossInput, 6)}</td>
                      <td>{t.ok ? (t.direction === "buy" ? fmtBase(t.output!, 6) : fmtSol(t.output!)) : "–"}</td>
                      <td>{t.ok ? `${t.startBin}→${t.endBin} (${t.binsInspected})` : t.binsInspected ?? "–"}</td>
                      <td>{t.scarsFormed?.length ?? 0}</td>
                      <td className={t.ok ? "text-green" : "text-neg"}>{t.ok ? (t.graduated ? "ok · GRADUATED" : "ok") : t.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.trades.length > 300 && <div className="text-xs text-muted p-2">Showing 300 of {r.trades.length}; download the run for all.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Box({ k, v, tone }: { k: string; v: string; tone?: "scar" | "lime" | "violet" }) {
  return <div className="panel p-2"><div className="label">{k}</div><div className={tone === "scar" ? "text-neg" : tone === "lime" ? "text-green" : tone === "violet" ? "text-violet" : ""}>{v}</div></div>;
}

function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const W = 600, H = 60;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * (H - 4) - 2}`).join(" ");
  return (
    <div className="panel p-2">
      <div className="label">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16"><polyline points={pts} fill="none" stroke="#f0f4f2" strokeWidth="1" /></svg>
    </div>
  );
}
