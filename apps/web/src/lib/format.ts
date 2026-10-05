export const X64 = 2 ** 64;

export function lamportsToSol(x: bigint | string | number): number {
  return Number(x) / 1e9;
}

export function fmtSol(x: bigint | string | number, digits = 4): string {
  const v = lamportsToSol(x);
  if (v === 0) return "0 SOL";
  if (Math.abs(v) < 0.0001) return `${plainDecimal(v, 2)} SOL`;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: digits })} SOL`;
}

export function fmtBase(x: bigint | string | number, decimals = 6, symbol = "", digits = 2): string {
  const v = Number(x) / 10 ** decimals;
  const s = v.toLocaleString("en-US", { maximumFractionDigits: digits });
  return symbol ? `${s} ${symbol}` : s;
}

/** Q64.64 atomic price -> human quote per base. */
export function priceX64ToHuman(x: bigint | string, baseDecimals: number, quoteDecimals = 9): number {
  return (Number(BigInt(x)) / X64) * 10 ** (baseDecimals - quoteDecimals);
}

/** atomic price (double) -> human. */
export function atomicPriceToHuman(p: number, baseDecimals: number, quoteDecimals = 9): number {
  return p * 10 ** (baseDecimals - quoteDecimals);
}

/** Plain decimal with `sig` significant digits and no exponent (0.00000000233, never 2.33e-9). */
export function plainDecimal(p: number, sig = 4): string {
  if (!isFinite(p)) return "–";
  if (p === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(p)));
  const decimals = Math.max(0, sig - 1 - e);
  return p.toFixed(Math.min(decimals, 20)).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function fmtPrice(p: number): string {
  if (!isFinite(p) || p === 0) return "–";
  if (p < 0.01) return plainDecimal(p, 4);
  return p.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function short(addr: string, n = 4): string {
  return addr.length <= 2 * n + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

export function ago(ts: number | string | null): string {
  if (!ts) return "–";
  const t = typeof ts === "string" ? (/^\d+$/.test(ts) ? Number(ts) * 1000 : Date.parse(ts)) : Number(ts) * 1000;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtUsd(x: number | null): string {
  if (x === null || !isFinite(x)) return "USD unavailable";
  return `≈ $${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Compact number: 1,234 -> 1.23K, 1.2e6 -> 1.2M. */
export function compact(n: number, digits = 2): string {
  if (!isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  if (abs >= 1) return n.toFixed(digits);
  return n.toPrecision(3);
}

export function fmtSolCompact(x: bigint | string | number): string {
  const v = lamportsToSol(x);
  if (v === 0) return "0 SOL";
  if (v < 0.001) return `${v.toPrecision(2)} SOL`;
  return `${compact(v, v < 10 ? 3 : 2)} SOL`;
}

/**
 * Leading-zero subscript presentation for very small prices: 0.000000002330 -> { lead: "0.0", zeros: 8, rest: "2330" }.
 * Returns null when a plain decimal is readable (price >= 0.0001).
 */
export function subscriptPrice(p: number, sig = 4): { lead: string; zeros: number; rest: string; full: string } | null {
  if (!isFinite(p) || p <= 0 || p >= 1e-4) return null;
  const full = p.toFixed(20).replace(/0+$/, "");
  const frac = full.split(".")[1] ?? "";
  const zeros = frac.match(/^0*/)![0].length;
  const rest = frac.slice(zeros, zeros + sig).replace(/0+$/, "") || "0";
  return { lead: "0.0", zeros, rest, full: p.toPrecision(6) };
}
