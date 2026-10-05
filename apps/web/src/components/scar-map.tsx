"use client";
import { useState } from "react";
import type { BinRow, MarketSummary } from "@/lib/api";
import type { ConfirmedSwap } from "./trade-ticket";
import { fmtSol, fmtBase, fmtPrice, priceX64ToHuman } from "@/lib/format";
import { Skeleton } from "./ui";

/**
 * Logarithmic price ladder (bins are 1% apart so equal spacing is logarithmic). Left of center =
 * SOL inventory, right = token inventory. Seed grey, scars green, pending violet (hatched).
 * `highlight` marks the bins a confirmed swap touched and briefly highlights bands where REAL
 * ScarFormed events landed (one 200ms fade-in, no pulsing); nothing animates on a click or a
 * signature alone.
 */
export function ScarMap({ bins, summary, highlight }: { bins: BinRow[] | null; summary: MarketSummary; highlight: ConfirmedSwap | null }) {
  const [band, setBand] = useState<number | null>(null);
  if (!bins) return <div className="panel p-3 mt-2" aria-busy="true"><Skeleton className="h-[220px] w-full" /><div className="label mt-2">Loading bin snapshot…</div></div>;
  const dec = summary.baseDecimals;
  const cursor = summary.cursor;
  const touched = bins.filter((b) => b.touched).map((b) => b.bin);
  const lo = Math.max(summary.binMin, Math.min(cursor - 20, ...touched));
  const hi = Math.min(summary.binMax, Math.max(cursor + 20, ...touched));
  const rows = bins.filter((b) => b.bin >= lo && b.bin <= hi).sort((a, b) => b.bin - a.bin);
  const priceOf = (b: BinRow) => priceX64ToHuman(b.priceX64, dec);
  const pLam = (b: BinRow) => (priceOf(b) * 1e9) / 10 ** dec;
  const quoteVal = (b: BinRow) => Number(b.seedQuote) + Number(b.scarQuote) + Number(b.pendingQuoteEligible);
  const baseVal = (b: BinRow) => (Number(b.seedBase) + Number(b.scarBase) + Number(b.pendingBaseEligible)) * pLam(b);
  const maxV = Math.max(1, ...rows.map((b) => Math.max(quoteVal(b), baseVal(b))));
  const W = 640, rowH = 9, half = 290, mid = 320;
  const H = rows.length * rowH + 16;
  const bandOf = (b: number) => Math.floor(b / 10);
  const pulseBands = new Set((highlight?.scarsFormed ?? []).map((s) => bandOf(s.bin)));
  const touchedRange = highlight ? [Math.min(...highlight.touched), Math.max(...highlight.touched)] : null;
  const bandRows = band === null ? [] : bins.filter((b) => bandOf(b.bin) === band);
  const sum = (f: (b: BinRow) => bigint) => bandRows.reduce((a, b) => a + f(b), 0n);
  return (
    <div className="panel p-2 mt-2">
      <div className="flex justify-between label px-2 py-1"><span>SOL (sell side)</span><span className="hidden sm:inline">1% per bin · log ladder</span><span>{summary.symbol} (buy side)</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Liquidity scars: inventory per price bin">
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#8d7cf6" strokeWidth="2" /></pattern>
        </defs>
        {rows.map((b, i) => {
          const y = 8 + i * rowH;
          const sq = (Number(b.seedQuote) / maxV) * half, cq = (Number(b.scarQuote) / maxV) * half, pq = (Number(b.pendingQuoteEligible) / maxV) * half;
          const p = pLam(b);
          const sb = ((Number(b.seedBase) * p) / maxV) * half, cb = ((Number(b.scarBase) * p) / maxV) * half, pb = ((Number(b.pendingBaseEligible) * p) / maxV) * half;
          const isCursor = b.bin === cursor;
          const inTouched = touchedRange && b.bin >= touchedRange[0] && b.bin <= touchedRange[1];
          const pulse = pulseBands.has(bandOf(b.bin));
          return (
            <g key={b.bin} onClick={() => setBand(bandOf(b.bin))} className="cursor-pointer">
              <title>{`bin ${b.bin} @ ${fmtPrice(priceOf(b))} SOL · seed ${fmtSol(b.seedQuote)} / ${fmtBase(b.seedBase, dec)} · scar ${fmtSol(b.scarQuote)} / ${fmtBase(b.scarBase, dec)} · waiting ${fmtSol(b.pendingQuoteEligible)} / ${fmtBase(b.pendingBaseEligible, dec)} · paired lifetime ${fmtSol(b.pairedQuoteLifetime)}`}</title>
              {isCursor && <rect x="0" y={y - 1} width={W} height={rowH} fill="#f2f5f3" opacity="0.07" />}
              {inTouched && <rect x="0" y={y - 1} width={W} height={rowH} fill="#00ff85" opacity="0.08" />}
              {pulse && <rect className="scar-hit" x="0" y={y - 1} width={W} height={rowH} fill="#00ff85" />}
              <rect x={mid - 18 - sq} y={y} width={sq} height={rowH - 2} fill="#3a4449" />
              <rect x={mid - 18 - sq - cq} y={y} width={cq} height={rowH - 2} fill="#00ff85" />
              <rect x={mid - 18 - sq - cq - pq} y={y} width={pq} height={rowH - 2} fill="url(#hatch)" />
              <rect x={mid + 18} y={y} width={sb} height={rowH - 2} fill="#3a4449" />
              <rect x={mid + 18 + sb} y={y} width={cb} height={rowH - 2} fill="#00ff85" />
              <rect x={mid + 18 + sb + cb} y={y} width={pb} height={rowH - 2} fill="url(#hatch)" />
              {(b.bin % 10 === 0 || isCursor) && <text x={mid} y={y + rowH - 2.5} textAnchor="middle" fontSize="6.5" fill={isCursor ? "#f2f5f3" : "#6f7a76"} fontFamily="Inter Variable, Inter, system-ui, sans-serif">{isCursor ? "▸" : ""}{b.bin}</text>}
              {BigInt(b.pairedQuoteLifetime) > 0n && <circle cx={mid} cy={y + 1.5} r="1.3" fill="#00ff85" />}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 label px-2 py-1">
        <span><span className="inline-block w-3 h-2 bg-[#3a4449] mr-1 rounded-sm" />seed</span>
        <span><span className="inline-block w-3 h-2 bg-green mr-1 rounded-sm" />scar (locked)</span>
        <span><span className="inline-block w-3 h-2 mr-1 rounded-sm" style={{ background: "repeating-linear-gradient(45deg,#8d7cf6 0 2px,transparent 2px 4px)" }} />waiting to pair</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green mr-1" />paired here before</span>
        <span>tap a bin for its band</span>
      </div>
      {band !== null && (
        <div className="m-2 p-3 raised rounded-lg text-[12px]">
          <div className="flex justify-between items-center"><span className="font-semibold text-[14px]">Band {band} (bins {band * 10}..{band * 10 + 9})</span><button className="btn btn-ghost btn-sm" onClick={() => setBand(null)}>Close</button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 num">
            <div><div className="label">SOL now</div>{fmtSol(sum((b) => BigInt(b.seedQuote) + BigInt(b.scarQuote)))}</div>
            <div><div className="label">{summary.symbol} now</div>{fmtBase(sum((b) => BigInt(b.seedBase) + BigInt(b.scarBase)), dec)}</div>
            <div><div className="label">Waiting to pair</div>{fmtSol(sum((b) => BigInt(b.pendingQuoteEligible)))} · {fmtBase(sum((b) => BigInt(b.pendingBaseEligible)), dec)}</div>
            <div><div className="label">Paired, lifetime (historical)</div><span className="text-green">{fmtSol(sum((b) => BigInt(b.pairedQuoteLifetime)))}</span>{summary.maturity.bands.find((x) => x.band === band)?.hardened ? " · hardened" : ""}</div>
          </div>
          <div className="text-muted mt-2">“Hardened” means this band&apos;s lifetime paired fees reached the target. It is not a floor; current inventory may be only tokens.</div>
        </div>
      )}
    </div>
  );
}
