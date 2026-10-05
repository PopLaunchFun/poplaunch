import type { RunReport } from "./engine.js";

/** JSON with bigint -> string, stable key order as produced. */
export function serializeReport(r: RunReport, pretty = true): string {
  return JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v), pretty ? 2 : undefined);
}
