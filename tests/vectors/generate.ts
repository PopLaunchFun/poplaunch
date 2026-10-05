/**
 * Golden vectors shared by the TypeScript and Rust implementations. Run:
 *   pnpm --filter @pop/math exec tsx ../../tests/vectors/generate.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BinStore, POP_PILOT_DEFAULTS, SOL, commitSwap, newMarketState, priceAtBin, quantizeP0, quoteSwap, testThresholds,
  type MarketConfig, type SwapParams,
} from "../../packages/math/src/index.js";

function run(cfg: MarketConfig, ops: { buy: boolean; gross: bigint }[]) {
  const state = newMarketState(cfg);
  const store = new BinStore(cfg);
  store.initAllPages(state);
  state.status = "active";
  const p0 = quantizeP0(cfg.seedQuote, cfg.seedBase);
  const results: unknown[] = [];
  let slot = 1n;
  let held = 0n;
  for (const op of ops) {
    const params: SwapParams = { direction: op.buy ? "buy" : "sell", grossInput: op.buy ? op.gross : (op.gross > held ? held : op.gross), minOutput: 0n, slot };
    if (!op.buy && params.grossInput === 0n) continue;
    const q = quoteSwap(cfg, state, p0, (b) => store.get(b), params);
    if (!q.ok) {
      results.push({ isBuy: op.buy, gross: params.grossInput.toString(), error: q.error });
      continue;
    }
    const r = commitSwap(cfg, state, p0, (b) => store.getOrThrow(b), q, params);
    if (op.buy) held += q.output; else held -= params.grossInput;
    results.push({
      isBuy: op.buy,
      gross: params.grossInput.toString(),
      output: q.output.toString(),
      scarFee: q.fees.scarFee.toString(),
      protocolFee: q.fees.protocolFee.toString(),
      creatorFee: q.fees.creatorFee.toString(),
      binsInspected: q.binsInspected,
      newCursor: q.newCursor,
      fills: q.fills.map((f) => ({ bin: f.bin, input: f.input.toString(), output: f.output.toString(), seedOut: f.seedOut.toString(), scarOut: f.scarOut.toString(), seedIn: f.seedIn.toString(), scarIn: f.scarIn.toString() })),
      scarShares: q.scarShares.map((s) => ({ bin: s.bin, amount: s.amount.toString() })),
      scarsFormed: r.events.filter((e) => e.type === "ScarFormed").map((e: any) => ({ bin: e.bin, base: e.base.toString(), quote: e.quote.toString() })),
      pairedQuoteLifetime: state.pairedQuoteLifetime.toString(),
      hardenedBands: state.hardenedBands,
      status: state.status,
      protocolClaimableQuote: state.protocolClaimableQuote.toString(),
      creatorClaimableBase: state.creatorClaimableBase.toString(),
    });
    slot += 1n;
  }
  const bins: Record<string, unknown> = {};
  for (const [id, b] of store.entries()) {
    if (b.buyVolumeQuote === 0n && b.sellVolumeBase === 0n && b.pendingQuoteEligible === 0n) continue;
    bins[id] = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.toString()]));
  }
  return { results, bins, cursor: state.cursor };
}

const cfg = POP_PILOT_DEFAULTS;
const p0 = quantizeP0(cfg.seedQuote, cfg.seedBase);
const prices: Record<string, string> = {};
for (let i = cfg.binMin; i <= cfg.binMax; i++) prices[i] = priceAtBin(p0, i).toString();

const ops: { buy: boolean; gross: bigint }[] = [];
for (let i = 0; i < 12; i++) {
  ops.push({ buy: true, gross: (SOL * BigInt(3 + (i * 7) % 11)) / 10n });
  ops.push({ buy: false, gross: 7_000_000_000_000n * BigInt(1 + (i % 5)) });
}
ops.push({ buy: true, gross: 5n * SOL }); // traversal failure expected
ops.push({ buy: true, gross: 10n }); // below minimum

const out = {
  config: { seedBase: cfg.seedBase.toString(), seedQuote: cfg.seedQuote.toString(), binMin: cfg.binMin, binMax: cfg.binMax, maxBinsPerSwap: cfg.maxBinsPerSwap, scarFeeBps: cfg.fees.scarFeeBps, protocolFeeBps: cfg.fees.protocolFeeBps, creatorFeeBps: cfg.fees.creatorFeeBps, maturityQuoteTarget: cfg.maturityQuoteTarget.toString(), bandQuoteTarget: cfg.bandQuoteTarget.toString(), bandsRequired: cfg.bandsRequired, minQuoteIn: cfg.minQuoteIn.toString(), minBaseIn: cfg.minBaseIn.toString() },
  p0: p0.toString(),
  prices,
  pilot: run(cfg, ops),
  test: run(testThresholds(cfg), Array.from({ length: 240 }, (_, i) => (i % 2 === 0 ? { buy: true, gross: SOL } : { buy: false, gross: 1n << 62n }))),
};
const file = resolve(import.meta.dirname, "golden.json");
writeFileSync(file, JSON.stringify(out, null, 1));
console.log("wrote", file, "pilot ops", out.pilot.results.length, "test ops", out.test.results.length);
