import { describe, expect, it } from "vitest";
import {
  DOWN_X64,
  MIN_P0_X64,
  ONE_X64,
  FACTORY_DEFAULTS,
  UP_X64,
  floorDiv,
  priceAtBin,
  quantizeP0,
  validatePriceRange,
  bandIndexOf,
  pageIndexOf,
  seedAllocationForBin,
  seedAllocationForPage,
  pageRange,
} from "../src/index.js";

const c = FACTORY_DEFAULTS;
const p0 = quantizeP0(c.seedQuote, c.seedBase);

describe("price table", () => {
  it("quantizes P0 = 20 SOL / 1B tokens in atomic units", () => {
    expect(p0).toBe(368934881474191n);
    expect(p0 >= MIN_P0_X64).toBe(true);
    // 20e9 lamports / 1e15 base atomic = 2e-5 lamports per atomic
    expect(Number(p0) / Number(ONE_X64)).toBeCloseTo(2e-5, 12);
  });

  it("is strictly increasing across the whole range and matches 1.01^i within the documented bound", () => {
    let prev = 0n;
    for (let i = c.binMin; i <= c.binMax; i++) {
      const p = priceAtBin(p0, i);
      expect(p > prev).toBe(true);
      prev = p;
      const exact = (Number(p0) / Number(ONE_X64)) * Math.pow(1.01, i);
      const got = Number(p) / Number(ONE_X64);
      expect(Math.abs(got - exact) / exact).toBeLessThan(2.1e-9);
    }
  });

  it("adjacent bins differ by 1% (within rounding)", () => {
    for (const i of [-64, -1, 0, 1, 100, 510]) {
      const a = priceAtBin(p0, i);
      const b = priceAtBin(p0, i + 1);
      const ratio = Number(b) / Number(a);
      expect(ratio).toBeCloseTo(1.01, 9);
    }
  });

  it("UP/DOWN constants are inverse-consistent", () => {
    for (let k = 0; k < DOWN_X64.length; k++) {
      const prod = (UP_X64[k]! * DOWN_X64[k]!) >> 64n;
      // product should be ~1.0 in x64
      expect(Number(prod) / Number(ONE_X64)).toBeCloseTo(1, 12);
    }
  });

  it("validates the pilot range and rejects a P0 below 2^32", () => {
    expect(() => validatePriceRange(p0, c.binMin, c.binMax)).not.toThrow();
    expect(() => quantizeP0(1n, 1n << 40n)).toThrow(/below minimum/);
  });

  it("refuses bins outside the table", () => {
    expect(() => priceAtBin(p0, 512)).toThrow();
    expect(() => priceAtBin(p0, -128)).toThrow();
  });
});

describe("layout helpers", () => {
  it("uses true floor division for negative bins", () => {
    expect(floorDiv(-1, 10)).toBe(-1);
    expect(floorDiv(-10, 10)).toBe(-1);
    expect(floorDiv(-11, 10)).toBe(-2);
    expect(floorDiv(9, 10)).toBe(0);
    expect(bandIndexOf(c, -1)).toBe(-1);
    expect(bandIndexOf(c, -64)).toBe(-7);
    expect(bandIndexOf(c, 511)).toBe(51);
    expect(pageIndexOf(c, -1)).toBe(-1);
    expect(pageIndexOf(c, -64)).toBe(-4);
    expect(pageIndexOf(c, 511)).toBe(31);
    expect(pageRange(c)).toEqual({ minPage: -4, maxPage: 31 });
  });

  it("seed schedule sums exactly to funded totals", () => {
    let base = 0n;
    let quote = 0n;
    for (let i = c.binMin; i <= c.binMax; i++) {
      const a = seedAllocationForBin(c, i);
      base += a.seedBase;
      quote += a.seedQuote;
      if (i < 0) expect(a.seedBase).toBe(0n);
      else expect(a.seedQuote).toBe(0n);
    }
    expect(base).toBe(c.seedBase);
    expect(quote).toBe(c.seedQuote);
    let pb = 0n;
    let pq = 0n;
    for (let p = -4; p <= 31; p++) {
      const a = seedAllocationForPage(c, p);
      pb += a.seedBase;
      pq += a.seedQuote;
    }
    expect(pb).toBe(c.seedBase);
    expect(pq).toBe(c.seedQuote);
    // 20 SOL / 64 bins = 0.3125 SOL per bin, 1B / 512 bins
    expect(seedAllocationForBin(c, -5).seedQuote).toBe(312_500_000n);
    expect(seedAllocationForBin(c, 7).seedBase).toBe(1_000_000_000n * 1_000_000n / 512n);
  });

  it("distributes remainders to the lowest ids", () => {
    const odd = { ...c, seedQuote: 64n * 7n + 3n, seedBase: 512n * 11n + 5n };
    expect(seedAllocationForBin(odd, -64).seedQuote).toBe(8n);
    expect(seedAllocationForBin(odd, -62).seedQuote).toBe(8n);
    expect(seedAllocationForBin(odd, -61).seedQuote).toBe(7n);
    expect(seedAllocationForBin(odd, 0).seedBase).toBe(12n);
    expect(seedAllocationForBin(odd, 4).seedBase).toBe(12n);
    expect(seedAllocationForBin(odd, 5).seedBase).toBe(11n);
  });
});
