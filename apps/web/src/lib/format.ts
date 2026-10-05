export const X64 = 2 ** 64;

export function lamportsToSol(x: bigint | string | number): number {
  return Number(x) / 1e9;
}

export function fmtSol(x: bigint | string | number, digits = 4): string {
  const v = lamportsToSol(x);
  if (v === 0) return "0 SOL";
  if (Math.abs(v) < 0.0001) return `${v.toExponential(2)} SOL`;
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

export function fmtPrice(p: number): string {
  if (!isFinite(p) || p === 0) return "–";
  if (p < 1e-6) return p.toExponential(3);
  if (p < 0.01) return p.toFixed(8);
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
  const t = typeof ts === "string" ? Date.parse(ts) : Number(ts) * 1000;
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
