/**
 * Checked integer arithmetic shared by the TypeScript SDK/simulator and mirrored
 * exactly by the Rust program (`programs/pop_market/src/math.rs`).
 *
 * Conventions
 * - Amounts are u64 (token atomic units).
 * - Prices are Q64.64 fixed point stored in u128: `price_x64 = floor(P * 2^64)` where
 *   P is quote atomic units per base atomic unit.
 * - Every operation is checked. Overflow throws `MathError` here and returns an error on-chain.
 */

export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;
export const ONE_X64 = 1n << 64n;

export class MathError extends Error {
  constructor(public readonly code: MathErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MathError";
  }
}

export type MathErrorCode = "Overflow" | "DivisionByZero" | "Underflow" | "OutOfRange";

export function assertU64(x: bigint, what = "value"): bigint {
  if (x < 0n || x > U64_MAX) throw new MathError("OutOfRange", `${what} is not a u64: ${x}`);
  return x;
}

export function assertU128(x: bigint, what = "value"): bigint {
  if (x < 0n || x > U128_MAX) throw new MathError("OutOfRange", `${what} is not a u128: ${x}`);
  return x;
}

export function checkedAddU64(a: bigint, b: bigint): bigint {
  const r = a + b;
  if (r > U64_MAX) throw new MathError("Overflow", `u64 add overflow: ${a} + ${b}`);
  return r;
}

export function checkedSubU64(a: bigint, b: bigint): bigint {
  if (b > a) throw new MathError("Underflow", `u64 sub underflow: ${a} - ${b}`);
  return a - b;
}

export function checkedAddU128(a: bigint, b: bigint): bigint {
  const r = a + b;
  if (r > U128_MAX) throw new MathError("Overflow", `u128 add overflow`);
  return r;
}

/** floor((a * b) / 2^64) with a 256-bit intermediate; result must fit in u128. */
export function mulShr64(a: bigint, b: bigint): bigint {
  const r = (a * b) >> 64n;
  if (r > U128_MAX) throw new MathError("Overflow", `mulShr64 overflow`);
  return r;
}

/** floor((a * b) / d). Result must fit in u128. */
export function mulDivFloor(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new MathError("DivisionByZero");
  const r = (a * b) / d;
  if (r > U128_MAX) throw new MathError("Overflow", `mulDivFloor overflow`);
  return r;
}

/** ceil((a * b) / d). Result must fit in u128. */
export function mulDivCeil(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new MathError("DivisionByZero");
  const p = a * b;
  const r = p / d + (p % d === 0n ? 0n : 1n);
  if (r > U128_MAX) throw new MathError("Overflow", `mulDivCeil overflow`);
  return r;
}

/** True floor division for signed integers (JS `/` truncates toward zero for bigint). */
export function floorDiv(a: number, b: number): number {
  if (b === 0) throw new MathError("DivisionByZero");
  const q = Math.trunc(a / b);
  return a % b !== 0 && (a < 0) !== (b < 0) ? q - 1 : q;
}

export function floorMod(a: number, b: number): number {
  return a - floorDiv(a, b) * b;
}

/**
 * Base output for a given quote input at price p (x64): floor(q * 2^64 / p).
 * Result must fit u64 (the caller enforces inventory caps before use).
 */
export function baseForQuoteFloor(q: bigint, priceX64: bigint): bigint {
  if (priceX64 === 0n) throw new MathError("DivisionByZero");
  return (q << 64n) / priceX64;
}

/** Quote required to purchase b base at price p: ceil(b * p / 2^64). */
export function quoteForBaseCeil(b: bigint, priceX64: bigint): bigint {
  const prod = b * priceX64;
  return (prod >> 64n) + ((prod & (ONE_X64 - 1n)) === 0n ? 0n : 1n);
}

/** Quote received for selling b base at price p: floor(b * p / 2^64). */
export function quoteForBaseFloor(b: bigint, priceX64: bigint): bigint {
  return (b * priceX64) >> 64n;
}

/** Base required to buy all of q quote at price p (as a seller): ceil(q * 2^64 / p). */
export function baseForQuoteCeil(q: bigint, priceX64: bigint): bigint {
  if (priceX64 === 0n) throw new MathError("DivisionByZero");
  const num = q << 64n;
  return num / priceX64 + (num % priceX64 === 0n ? 0n : 1n);
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
