"use client";
import { useState } from "react";
import type { BinRow, MarketSummary } from "@/lib/api";
import { fmtSol, fmtBase, fmtPrice, priceX64ToHuman } from "@/lib/format";

/**
 * Logarithmic price ladder (bins are 1% apart so equal spacing is logarithmic). For each bin:
 * left of center = quote (SOL) inventory, right = base inventory. Seed in grey, scar in coral,
 * pending in violet (hatched). Click a band (10 bins) for a breakdown.
 */
export function ScarMap({ bins, summary }: { bins: BinRow[] | null; summary: MarketSummary }) {
  const [band, setBand] = useState<number | null>(null);
  if (!bins) return <div className="panel p-4 text-paper-3 text-sm">Scar map unavailable (no bin snapshot).</div>;
  const dec = summary.baseDecimals;
  const cursor = summary.cursor;
  // window around the cursor plus any touched bins
  const lo = Math.min(cursor - 24, ...bins.filter((b) => b.touched).map((b) => b.bin));
  const hi = Math.max(cursor + 24, ...bins.filter((b) => b.touched).map((b) => b.bin));
  const rows = bins.filter((b) => b.bin >= lo && b.bin <= hi).sort((a, b) => b.bin - a.bin);
  const priceOf = (b: BinRow) => priceX64ToHuman(b.priceX64, dec);
  const quoteVal = (b: BinRow) => Number(b.seedQuote) + Number(b.scarQuote) + Number(b.pendingQuoteEligible) + Number(b.pendingQuoteIneligible);
  const baseVal = (b: BinRow) => (Number(b.seedBase) + Number(b.scarBase) + Number(b.pendingBaseEligible) + Number(b.pendingBaseIneligible)) * priceOf(b) * 1e9 / 10 ** dec; // in lamports-equivalent at bin price
  const maxV = Math.max(1, ...rows.map((b) => Math.max(quoteVal(b), baseVal(b))));
  const W = 640, rowH = 10, left = 300, mid = 320;
  const H = rows.length * rowH + 20;
  const bandOf = (b: number) => Math.floor(b / 10);
  const bandRows = band === null ? [] : bins.filter((b) => bandOf(b.bin) === band);
  const sum = (f: (b: BinRow) => bigint) => bandRows.reduce((a, b) => a + f(b), 0n);
  return (
    <div className="panel p-2">
      <div className="flex justify-between text-xs text-paper-3 px-2"><span>SOL inventory (sell side)</span><span>price ladder, 1% per bin, log scale</span><span>{summary.symbol} inventory (buy side)</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scar map: inventory per price bin">
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#8d7cf6" strokeWidth="2" /></pattern>
        </defs>
        {rows.map((b, i) => {
          const y = 10 + i * rowH;
          const sq = (Number(b.seedQuote) / maxV) * left, cq = (Number(b.scarQuote) / maxV) * left, pq = ((Number(b.pendingQuoteEligible) + Number(b.pendingQuoteIneligible)) / maxV) * left;
          const p = priceOf(b) * 1e9 / 10 ** dec;
          const sb = (Number(b.seedBase) * p / maxV) * left, cb = (Number(b.scarBase) * p / maxV) * left, pb = ((Number(b.pendingBaseEligible) + Number(b.pendingBaseIneligible)) * p / maxV) * left;
          const isCursor = b.bin === cursor;
          return (
            <g key={b.bin} onClick={() => setBand(bandOf(b.bin))} className="cursor-pointer">
              <title>{`bin ${b.bin} @ ${fmtPrice(priceOf(b))} SOL · seed ${fmtSol(b.seedQuote)} / ${fmtBase(b.seedBase, dec)} · scar ${fmtSol(b.scarQuote)} / ${fmtBase(b.scarBase, dec)} · pending ${fmtSol(b.pendingQuoteEligible)} / ${fmtBase(b.pendingBaseEligible, dec)} · paired lifetime ${fmtSol(b.pairedQuoteLifetime)}`}</title>
              {isCursor && <rect x="0" y={y - 1} width={W} height={rowH} fill="#f2efe9" opacity="0.08" />}
              <rect x={mid - 20 - sq} y={y} width={sq} height={rowH - 2} fill="#4a4a55" />
              <rect x={mid - 20 - sq - cq} y={y} width={cq} height={rowH - 2} fill="#ff4a3d" />
              <rect x={mid - 20 - sq - cq - pq} y={y} width={pq} height={rowH - 2} fill="url(#hatch)" />
              <rect x={mid + 20} y={y} width={sb} height={rowH - 2} fill="#4a4a55" />
              <rect x={mid + 20 + sb} y={y} width={cb} height={rowH - 2} fill="#ff4a3d" />
              <rect x={mid + 20 + sb + cb} y={y} width={pb} height={rowH - 2} fill="url(#hatch)" />
              {(b.bin % 10 === 0 || isCursor) && <text x={mid} y={y + rowH - 3} textAnchor="middle" fontSize="7" fill={isCursor ? "#f2efe9" : "#7d786f"} fontFamily="ui-monospace, monospace">{isCursor ? "▸" : ""}{b.bin}</text>}
              {BigInt(b.pairedQuoteLifetime) > 0n && <circle cx={mid} cy={y + 2} r="1.5" fill="#ff8a7a" />}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs px-2 pb-1 text-paper-3">
        <span><span className="inline-block w-3 h-2 bg-[#4a4a55] mr-1" />seed</span>
        <span><span className="inline-block w-3 h-2 bg-scar mr-1" />activated scar</span>
        <span><span className="inline-block w-3 h-2 mr-1" style={{ background: "repeating-linear-gradient(45deg,#8d7cf6 0 2px,transparent 2px 4px)" }} />pending fees</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-scar-2 mr-1" />historical match at bin</span>
        <span>bars: inventory valued at the bin price; click a bin for its 10-bin band</span>
      </div>
      {band !== null && (
        <div className="m-2 p-3 bg-ink border border-line rounded text-xs">
          <div className="flex justify-between"><span className="font-semibold">Band {band} (bins {band * 10}..{band * 10 + 9})</span><button className="text-paper-3" onClick={() => setBand(null)}>close</button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 num">
            <div><div className="label">Current SOL</div>{fmtSol(sum((b) => BigInt(b.seedQuote) + BigInt(b.scarQuote)))}</div>
            <div><div className="label">Current {summary.symbol}</div>{fmtBase(sum((b) => BigInt(b.seedBase) + BigInt(b.scarBase)), dec)}</div>
            <div><div className="label">Pending</div>{fmtSol(sum((b) => BigInt(b.pendingQuoteEligible)))} · {fmtBase(sum((b) => BigInt(b.pendingBaseEligible)), dec)}</div>
            <div><div className="label">Historical paired</div><span className="text-scar">{fmtSol(sum((b) => BigInt(b.pairedQuoteLifetime)))}</span>{summary.maturity.bands.find((x) => x.band === band)?.hardened ? " · hardened" : ""}</div>
          </div>
          <div className="text-paper-3 mt-2">“Hardened” means the band&apos;s lifetime paired quote reached the band target. It is not a floor. Current inventory may be only tokens.</div>
        </div>
      )}
    </div>
  );
}
