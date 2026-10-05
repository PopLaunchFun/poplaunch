import { describe, expect, it } from "vitest";
import { ALL_SCENARIOS } from "../src/scenarios.js";
import { serializeReport } from "../src/serialize.js";

describe("required scenarios", () => {
  for (const s of ALL_SCENARIOS) {
    it(`${s.id} runs deterministically and reconciles`, () => {
      const a = s.run();
      const b = s.run();
      const ra = Array.isArray(a) ? a : [a];
      const rb = Array.isArray(b) ? b : [b];
      expect(ra.length).toBe(rb.length);
      for (let i = 0; i < ra.length; i++) {
        expect(ra[i]!.reconciliation.ok).toBe(true);
        expect(serializeReport(ra[i]!)).toBe(serializeReport(rb[i]!));
        expect(ra[i]!.findings.some((f) => f.includes("UNEXPECTED"))).toBe(false);
      }
    });
  }
  it("exactly one graduation in the graduating run", () => {
    const r = ALL_SCENARIOS.find((s) => s.id === "maturity-threshold")!.run();
    const runs = Array.isArray(r) ? r : [r];
    expect(runs[2]!.matched.graduationEvents).toBe(1);
    expect(runs[0]!.matched.graduationEvents).toBe(0);
    expect(runs[1]!.matched.graduationEvents).toBe(0);
  });
});
