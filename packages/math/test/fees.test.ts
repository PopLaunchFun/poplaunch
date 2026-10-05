import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { POP_PILOT_DEFAULTS, largestRemainder, splitFees, splitProtocolQuoteFee, SOL } from "../src/index.js";

describe("fees", () => {
  it("splits 2.00% of gross input into 150/25/25 bps", () => {
    const f = splitFees(100n * SOL, POP_PILOT_DEFAULTS.fees);
    expect(f.scarFee).toBe(15n * SOL / 10n);
    expect(f.protocolFee).toBe(25n * SOL / 100n);
    expect(f.creatorFee).toBe(25n * SOL / 100n);
    expect(f.tradable).toBe(98n * SOL);
    expect(f.scarFee + f.protocolFee + f.creatorFee + f.tradable).toBe(f.gross);
  });

  it("internal buyback pays only the scar fee", () => {
    const f = splitFees(100n * SOL, POP_PILOT_DEFAULTS.fees, true);
    expect(f.protocolFee).toBe(0n);
    expect(f.creatorFee).toBe(0n);
    expect(f.scarFee).toBe(15n * SOL / 10n);
  });

  it("fee totals always equal charged input (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }), (g) => {
        const f = splitFees(g, POP_PILOT_DEFAULTS.fees);
        return f.scarFee + f.protocolFee + f.creatorFee + f.tradable === g;
      }),
    );
  });

  it("earmarks 50% of quote protocol fees for buybacks only on non-POP markets", () => {
    const protocolFee = splitFees(100n * SOL, POP_PILOT_DEFAULTS.fees).protocolFee; // 0.25 SOL
    expect(splitProtocolQuoteFee(protocolFee, 5000, false)).toEqual({ buyback: 125_000_000n, operating: 125_000_000n });
    expect(splitProtocolQuoteFee(protocolFee, 5000, true)).toEqual({ buyback: 0n, operating: 250_000_000n });
  });

  it("largest remainder sums exactly and breaks ties by bin id", () => {
    const shares = largestRemainder(10n, [
      { bin: 3, weight: 1n },
      { bin: 1, weight: 1n },
      { bin: 2, weight: 1n },
    ]);
    const total = shares.reduce((a, s) => a + s.amount, 0n);
    expect(total).toBe(10n);
    // 10/3 = 3 each, remainder 1 -> lowest bin id (1) gets +1
    expect(shares.find((s) => s.bin === 1)!.amount).toBe(4n);
    expect(shares.find((s) => s.bin === 2)!.amount).toBe(3n);
    expect(shares.find((s) => s.bin === 3)!.amount).toBe(3n);
  });

  it("largest remainder sum property, zero-weight bins get nothing", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1n << 50n }),
        fc.array(fc.record({ bin: fc.integer({ min: -64, max: 511 }), weight: fc.bigInt({ min: 0n, max: 1n << 40n }) }), { minLength: 1, maxLength: 32 }),
        (total, ws) => {
          // unique bins
          const seen = new Set<number>();
          const uniq = ws.filter((w) => (seen.has(w.bin) ? false : (seen.add(w.bin), true)));
          const shares = largestRemainder(total, uniq);
          const sum = shares.reduce((a, s) => a + s.amount, 0n);
          const anyWeight = uniq.some((w) => w.weight > 0n);
          if (!anyWeight) return shares.length === 0;
          return sum === total && shares.every((s) => uniq.find((w) => w.bin === s.bin)!.weight > 0n);
        },
      ),
    );
  });
});
