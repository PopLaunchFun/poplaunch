/**
 * Deterministic bin price table.
 *
 *   P_i = P0 * 1.01^i   (quote atomic units per base atomic unit, Q64.64)
 *
 * P0 is quantized once at market creation:
 *   p0_x64 = floor(seed_quote_atomic * 2^64 / seed_base_atomic)
 *
 * Powers of 1.01 are applied by binary exponentiation using the precomputed
 * Q64.64 constants below (round-to-nearest of the exact rational, relative error
 * < 4e-20 each; see scripts in docs/mechanism.md for the derivation). Each
 * multiplication floors, so a price derived with k set bits carries at most
 * k ulps of accumulated floor error plus the constant error. With |i| <= 511 there
 * are at most 9 multiplications. We require p0_x64 >= 2^32 so that one ulp is at
 * most 2^-32 relative, giving a documented relative error bound of
 *   9 * 2^-32 + 9 * 4e-20  <  2.1e-9
 * between the integer price and the exact real P0 * 1.01^i. Both the program and
 * this package compute the identical integers, so the bound only matters for
 * economic interpretation, never for consensus between client and chain.
 */
import { MathError, mulShr64, ONE_X64 } from "./fixed.js";

/** round(1.01^(2^k) * 2^64) for k = 0..8 (covers exponents 0..511). */
export const UP_X64: readonly bigint[] = [
  18631211514446647132n,
  18817523629591113603n,
  19195755854545894987n,
  19975180517221435052n,
  21630258169204612293n,
  25363178813395704310n,
  34872866287395834719n,
  65925823995780828431n,
  235608747655198994952n,
];

/** round((100/101)^(2^k) * 2^64) for k = 0..6 (covers exponents 1..127, we use up to 64). */
export const DOWN_X64: readonly bigint[] = [
  18264103043276783778n,
  18083270339878003741n,
  17726958474539754672n,
  17035258661495792883n,
  15731775564537856108n,
  13416392693695651194n,
  9757797484055027497n,
];

export const MAX_UP_EXPONENT = (1 << UP_X64.length) - 1; // 511
export const MAX_DOWN_EXPONENT = (1 << DOWN_X64.length) - 1; // 127
export const MIN_P0_X64 = 1n << 32n;

/** Quantize the reference price once. Throws if the result is below MIN_P0_X64. */
export function quantizeP0(seedQuoteAtomic: bigint, seedBaseAtomic: bigint): bigint {
  if (seedBaseAtomic <= 0n) throw new MathError("DivisionByZero", "seed base must be > 0");
  if (seedQuoteAtomic <= 0n) throw new MathError("OutOfRange", "seed quote must be > 0");
  const p0 = (seedQuoteAtomic << 64n) / seedBaseAtomic;
  if (p0 < MIN_P0_X64) throw new MathError("OutOfRange", `p0_x64 ${p0} below minimum 2^32`);
  return p0;
}

/** Price at logical bin `i` relative to p0. Throws on overflow or if the price rounds to zero. */
export function priceAtBin(p0X64: bigint, i: number): bigint {
  if (!Number.isInteger(i)) throw new MathError("OutOfRange", "bin must be an integer");
  let price = p0X64;
  if (i > 0) {
    if (i > MAX_UP_EXPONENT) throw new MathError("OutOfRange", `bin ${i} above table`);
    for (let k = 0; k < UP_X64.length; k++) {
      if ((i >> k) & 1) price = mulShr64(price, UP_X64[k]!);
    }
  } else if (i < 0) {
    const e = -i;
    if (e > MAX_DOWN_EXPONENT) throw new MathError("OutOfRange", `bin ${i} below table`);
    for (let k = 0; k < DOWN_X64.length; k++) {
      if ((e >> k) & 1) price = mulShr64(price, DOWN_X64[k]!);
    }
  }
  if (price === 0n) throw new MathError("OutOfRange", `price at bin ${i} is zero`);
  return price;
}

/**
 * Validate that every bin in [binMin, binMax] has a representable nonzero price.
 * Because UP constants are >= 1 and DOWN constants are <= 1, checking the two
 * extremes is sufficient (partial products are bounded by the extremes).
 */
export function validatePriceRange(p0X64: bigint, binMin: number, binMax: number): void {
  if (binMin > 0 || binMax < 0 || binMin > binMax) throw new MathError("OutOfRange", "bin range must contain 0");
  priceAtBin(p0X64, binMin);
  priceAtBin(p0X64, binMax);
}

/** Build the full table (client convenience). */
export function priceTable(p0X64: bigint, binMin: number, binMax: number): Map<number, bigint> {
  const t = new Map<number, bigint>();
  for (let i = binMin; i <= binMax; i++) t.set(i, priceAtBin(p0X64, i));
  return t;
}

/** Human price (quote units per base unit) as a JS number, for display only. */
export function priceX64ToHuman(priceX64: bigint, baseDecimals: number, quoteDecimals: number): number {
  const atomic = Number(priceX64) / Number(ONE_X64);
  return atomic * 10 ** (baseDecimals - quoteDecimals);
}
