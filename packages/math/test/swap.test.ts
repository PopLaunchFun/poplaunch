import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  BinStore,
  FACTORY_DEFAULTS,
  SOL,
  commitSwap,
  emptyBin,
  matchEligibleAtBin,
  newMarketState,
  priceAtBin,
  quantizeP0,
  quoteForBaseCeil,
  quoteSwap,
  reconcile,
  testThresholds,
  type MarketConfig,
  type MarketState,
  type SwapParams,
} from "../src/index.js";

function setup(cfg: MarketConfig = FACTORY_DEFAULTS) {
  const state = newMarketState(cfg);
  const store = new BinStore(cfg);
  store.initAllPages(state);
  state.status = "active";
  const p0 = quantizeP0(cfg.seedQuote, cfg.seedBase);
  return { cfg, state, store, p0 };
}

/** Independent ledger: tracks what physically entered and left the market. */
class Ledger {
  baseIn = 0n;
  baseOut = 0n;
  quoteIn = 0n;
  quoteOut = 0n;
  constructor(public seedBase: bigint, public seedQuote: bigint) {}
  expectedBaseHeld() {
    return this.seedBase + this.baseIn - this.baseOut;
  }
  expectedQuoteHeld() {
    return this.seedQuote + this.quoteIn - this.quoteOut;
  }
}

function swap(env: ReturnType<typeof setup>, ledger: Ledger, params: SwapParams) {
  const q = quoteSwap(env.cfg, env.state, env.p0, (b) => env.store.get(b), params);
  if (!q.ok) return q;
  const r = { ok: true as const, ...commitSwap(env.cfg, env.state, env.p0, (b) => env.store.getOrThrow(b), q, params) };
  if (params.direction === "buy") {
    ledger.quoteIn += params.grossInput;
    ledger.baseOut += q.output;
  } else {
    ledger.baseIn += params.grossInput;
    ledger.quoteOut += q.output;
  }
  return r;
}

function checkReconciliation(env: ReturnType<typeof setup>, ledger: Ledger) {
  const r = reconcile(env.state, env.store);
  expect(r.vaultBase + r.feeVaultBase).toBe(ledger.expectedBaseHeld());
  expect(r.vaultQuote + r.feeVaultQuote).toBe(ledger.expectedQuoteHeld());
  for (const [, b] of env.store.entries()) {
    for (const v of Object.values(b)) expect(v >= 0n).toBe(true);
  }
}

describe("swap walker", () => {
  it("a 0.01 SOL buy at launch consumes seed base at bin 0 and deposits quote there", () => {
    const env = setup();
    const ledger = new Ledger(env.cfg.seedBase, env.cfg.seedQuote);
    const r = swap(env, ledger, { direction: "buy", grossInput: SOL / 100n, minOutput: 0n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = r.quote;
    expect(q.fees.tradable).toBe(9_800_000n);
    expect(q.fills.length).toBe(1);
    expect(q.fills[0]!.bin).toBe(0);
    expect(q.newCursor).toBe(0);
    // seed at bin 0 is 900M/512 POP; price 2.22e-5 lamports/atomic -> ~44.1M POP for 0.98 SOL
    const bin0 = env.store.getOrThrow(0);
    expect(bin0.seedQuote).toBe(9_800_000n);
    expect(bin0.scarQuote).toBe(0n);
    expect(bin0.pendingQuoteEligible).toBe(150_000n);
    expect(bin0.pendingBaseEligible).toBe(0n);
    expect(env.state.creatorClaimableQuote).toBe(25_000n);
    expect(env.state.buybackAccruedQuote).toBe(12_500n); // 50% of the 25,000 lamport protocol fee
    expect(env.state.protocolClaimableQuote).toBe(12_500n);
    expect(q.output).toBe((9_800_000n << 64n) / priceAtBin(env.p0, 0));
    checkReconciliation(env, ledger);
  });

  it("a buy that clears bin 0 pays ceil(avail * price) and advances", () => {
    const env = setup();
    const ledger = new Ledger(env.cfg.seedBase, env.cfg.seedQuote);
    const bin0Base = env.store.getOrThrow(0).seedBase;
    const needBin0 = quoteForBaseCeil(bin0Base, priceAtBin(env.p0, 0));
    // gross so that tradable = needBin0 + 0.01 SOL (lands in bin 1)
    const tradable = needBin0 + SOL / 100n;
    const gross = (tradable * 10_000n + 9_799n) / 9_800n; // ceil
    const r = swap(env, ledger, { direction: "buy", grossInput: gross, minOutput: 0n });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.fills.length).toBe(2);
    expect(r.quote.fills[0]!.output).toBe(bin0Base);
    expect(r.quote.fills[0]!.input).toBe(needBin0);
    expect(r.quote.fills[0]!.roundingSurplus).toBe(0n);
    expect(r.quote.newCursor).toBe(1);
    expect(env.store.getOrThrow(0).seedBase).toBe(0n);
    checkReconciliation(env, ledger);
  });

  it("sells walk downward into seed quote and a following buy consumes the deposited base", () => {
    const env = setup();
    const ledger = new Ledger(env.cfg.seedBase, env.cfg.seedQuote);
    // seller needs base first: buy some
    const b = swap(env, ledger, { direction: "buy", grossInput: SOL / 2n, minOutput: 0n });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const got = b.quote.output;
    const cursorAfterBuy = env.state.cursor;
    expect(cursorAfterBuy).toBeGreaterThan(0);
    const s = swap(env, ledger, { direction: "sell", grossInput: got, minOutput: 0n });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    // sell starts at the cursor where the buy deposited quote and walks downward
    expect(s.quote.fills[0]!.bin).toBe(cursorAfterBuy);
    expect(s.quote.newCursor <= cursorAfterBuy).toBe(true);
    // scar fee on sell is base and is pending at the visited bins
    const pendingBase = s.quote.scarShares.reduce((a, x) => a + x.amount, 0n);
    expect(pendingBase).toBe(s.quote.fees.scarFee);
    checkReconciliation(env, ledger);
    // matching should have happened at bin 0: buy fee (quote) vs sell fee (base)
    const top = env.store.getOrThrow(cursorAfterBuy);
    expect(top.scarBase > 0n && top.scarQuote > 0n).toBe(true);
    let sumPaired = 0n;
    for (const [, bin] of env.store.entries()) sumPaired += bin.pairedQuoteLifetime;
    expect(env.state.pairedQuoteLifetime).toBe(sumPaired);
    const formed = s.events.filter((e) => e.type === "ScarFormed");
    expect(formed.length).toBeGreaterThan(0);
  });

  it("rejects input below the minimum and reports exhaustion at range limits", () => {
    const env = setup();
    const ledger = new Ledger(env.cfg.seedBase, env.cfg.seedQuote);
    const tiny = swap(env, ledger, { direction: "buy", grossInput: 10n, minOutput: 0n });
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.error).toBe("InputBelowMinimum");
    // sell with no base inventory to sell into beyond seed quote: dump a huge amount
    const huge = quoteSwap(env.cfg, env.state, env.p0, (b) => env.store.get(b), {
      direction: "sell",
      grossInput: env.cfg.seedBase, // far more than 20 SOL of quote can absorb
      minOutput: 0n,
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(["SellInventoryExhausted", "TraversalLimit"]).toContain(huge.error);
  });

  it("enforces the 32-bin traversal cap counting empty bins", () => {
    const env = setup({ ...FACTORY_DEFAULTS });
    const ledger = new Ledger(env.cfg.seedBase, env.cfg.seedQuote);
    // Clear all base in bins 0..31 by pre-emptying them (simulate a prior state) then buy.
    for (let i = 0; i < 40; i++) {
      const b = env.store.getOrThrow(i);
      env.state.unmaterializedSeedBase += b.seedBase; // keep reconciliation honest
      b.seedBase = 0n;
    }
    const r = swap(env, ledger, { direction: "buy", grossInput: 1n * SOL, minOutput: 0n });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("TraversalLimit");
      expect(r.binsInspected).toBe(32);
    }
  });

  it("fails when a page is missing instead of inventing inventory", () => {
    const cfg = FACTORY_DEFAULTS;
    const state = newMarketState(cfg);
    const store = new BinStore(cfg);
    store.initPage(state, 0);
    state.status = "active";
    const p0 = quantizeP0(cfg.seedQuote, cfg.seedBase);
    const q = quoteSwap(cfg, state, p0, (b) => store.get(b), { direction: "sell", grossInput: 10n * 1_000_000n, minOutput: 0n });
    // sell at cursor 0: bin 0 has no quote; moves to -1 whose page (-1) is missing
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.error).toBe("PageNotInitialized");
    expect(() => store.initPage(state, 0)).toThrow(/already initialized/);
  });

  it("min_output protects the trader", () => {
    const env = setup();
    const q = quoteSwap(env.cfg, env.state, env.p0, (b) => env.store.get(b), {
      direction: "buy",
      grossInput: 1n * SOL,
      minOutput: 1n << 62n,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.error).toBe("OutputBelowMinimum");
  });

  it("deadline and config version are enforced", () => {
    const env = setup();
    const a = quoteSwap(env.cfg, env.state, env.p0, (b) => env.store.get(b), { direction: "buy", grossInput: 1n * SOL, minOutput: 0n, slot: 10n, deadlineSlot: 9n });
    expect(a.ok).toBe(false);
    const b = quoteSwap(env.cfg, env.state, env.p0, (b) => env.store.get(b), { direction: "buy", grossInput: 1n * SOL, minOutput: 0n, expectedConfigVersion: 99 });
    expect(b.ok).toBe(false);
  });
});

describe("matching", () => {
  it("matches the brief's example: 0.46 SOL vs 315,000 tokens at 1e-6 SOL/token", () => {
    // price 0.000001 SOL per token in human units with 6/9 decimals: 1e-6 * 1e9 / 1e6 = 1e-3 lamports per atomic
    const price = (1n << 64n) / 1000n;
    const bin = emptyBin();
    bin.pendingQuoteEligible = 460_000_000n; // 0.46 SOL
    bin.pendingBaseEligible = 315_000n * 1_000_000n; // 315,000 tokens
    const m = matchEligibleAtBin(bin, price);
    expect(m).not.toBeNull();
    expect(m!.base).toBe(315_000n * 1_000_000n);
    // 315,000 tokens * 1e-6 SOL = 0.315 SOL = 315,000,000 lamports (price is floored so ceil may add dust)
    expect(m!.quote).toBeGreaterThanOrEqual(315_000_000n - 1n);
    expect(m!.quote).toBeLessThanOrEqual(315_000_000n);
    expect(bin.pendingQuoteEligible).toBe(460_000_000n - m!.quote);
    expect(bin.scarBase).toBe(m!.base);
    expect(bin.scarQuote).toBe(m!.quote);
  });

  it("never pairs more than eligible escrow (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1n << 60n }),
        fc.bigInt({ min: 0n, max: 1n << 60n }),
        fc.bigInt({ min: 1n << 32n, max: 1n << 80n }),
        (B, Q, price) => {
          const bin = emptyBin();
          bin.pendingBaseEligible = B;
          bin.pendingQuoteEligible = Q;
          const m = matchEligibleAtBin(bin, price);
          if (!m) return bin.pendingBaseEligible === B && bin.pendingQuoteEligible === Q;
          return m.base <= B && m.quote <= Q && m.base > 0n && m.quote > 0n &&
            quoteForBaseCeil(m.base, price) === m.quote &&
            // maximality: one more base unit would exceed Q (or B)
            (m.base === B || quoteForBaseCeil(m.base + 1n, price) > Q);
        },
      ),
    );
  });
});

describe("graduation", () => {
  it("requires both thresholds and emits exactly one event", () => {
    const cfg = testThresholds(FACTORY_DEFAULTS); // 1 SOL paired, 2 bands at 0.01 SOL
    const env = setup(cfg);
    const ledger = new Ledger(cfg.seedBase, cfg.seedQuote);
    let graduated = 0;
    const seen: MarketState["status"][] = [];
    for (let i = 0; i < 400 && env.state.status !== "graduated"; i++) {
      const b = swap(env, ledger, { direction: "buy", grossInput: SOL / 2n, minOutput: 0n, slot: BigInt(i) });
      if (!b.ok) break;
      graduated += b.events.filter((e) => e.type === "Graduated").length;
      const s = swap(env, ledger, { direction: "sell", grossInput: b.quote.output, minOutput: 0n, slot: BigInt(i) });
      if (!s.ok) break;
      graduated += s.events.filter((e) => e.type === "Graduated").length;
      seen.push(env.state.status);
    }
    expect(env.state.status).toBe("graduated");
    expect(graduated).toBe(1);
    expect(env.state.pairedQuoteLifetime >= cfg.maturityQuoteTarget).toBe(true);
    expect(env.state.hardenedBands >= cfg.bandsRequired).toBe(true);
    checkReconciliation(env, ledger);
    // further matching does not re-emit
    const more = swap(env, ledger, { direction: "buy", grossInput: SOL / 2n, minOutput: 0n });
    if (more.ok) expect(more.events.filter((e) => e.type === "Graduated").length).toBe(0);
  });
});

describe("conservation under random histories (property)", () => {
  it("vault sums always reconcile with an independent ledger and nothing goes negative", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            buy: fc.boolean(),
            amount: fc.bigInt({ min: 1n, max: 2n * SOL }),
            fraction: fc.integer({ min: 1, max: 100 }),
          }),
          { minLength: 1, maxLength: 60 },
        ),
        (ops) => {
          const env = setup();
          const ledger = new Ledger(env.cfg.seedBase, env.cfg.seedQuote);
          let heldBase = 0n; // trader's base balance from previous buys
          let pairedBefore = 0n;
          let quoteScarFees = 0n; // every buy's scar fee: it is either still pending or was paired
          for (const op of ops) {
            if (op.buy) {
              const r = swap(env, ledger, { direction: "buy", grossInput: op.amount, minOutput: 0n });
              if (r.ok) {
                heldBase += r.quote.output;
                quoteScarFees += r.quote.fees.scarFee;
              }
            } else {
              if (heldBase === 0n) continue;
              const amt = (heldBase * BigInt(op.fraction)) / 100n;
              if (amt === 0n) continue;
              const r = swap(env, ledger, { direction: "sell", grossInput: amt, minOutput: 0n });
              if (r.ok) heldBase -= amt;
            }
            // monotonic milestone counter
            expect(env.state.pairedQuoteLifetime >= pairedBefore).toBe(true);
            pairedBefore = env.state.pairedQuoteLifetime;
            checkReconciliation(env, ledger);
          }
          // Every lamport of buy scar fee is either still pending or was paired exactly once.
          // (Paired quote then sits in scar inventory and may later be traded away, so the
          // historical counter can exceed current scar quote; that is expected.)
          const r = reconcile(env.state, env.store);
          expect(r.pendingQuoteEligible + env.state.pairedQuoteLifetime).toBe(quoteScarFees);
          return true;
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("virtual pages", () => {
  it("quoting across an uninitialized page equals quoting after it is materialized", async () => {
    const { FACTORY_DEFAULTS: cfg0, BinStore: Store, newMarketState: ns, quantizeP0: qp, quoteSwap: qs, LAUNCH_PAGES } = await import("../src/index.js");
    const cfg = { ...cfg0, seedQuote: SOL };
    const stateA = ns(cfg);
    const storeA = new Store(cfg);
    expect(LAUNCH_PAGES).toEqual([-1, 0, 1, 2]);
    for (const p of [-1, 0]) storeA.initPage(stateA, p);
    stateA.status = "active";
    const p0 = qp(cfg.seedQuote, cfg.seedBase);
    // ~20 bins at 1 SOL seed: runs past page 0 (bins 0..15) into the uninitialized page 1
    const gross = SOL / 25n;
    const strict = qs(cfg, stateA, p0, (b) => storeA.get(b), { direction: "buy", grossInput: gross, minOutput: 0n });
    const virtual = qs(cfg, stateA, p0, (b) => storeA.getVirtual(b), { direction: "buy", grossInput: gross, minOutput: 0n });
    const stateB = ns(cfg);
    const storeB = new Store(cfg);
    storeB.initAllPages(stateB);
    stateB.status = "active";
    const full = qs(cfg, stateB, p0, (b) => storeB.get(b), { direction: "buy", grossInput: gross, minOutput: 0n });
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error).toBe("PageNotInitialized");
    expect(virtual.ok && full.ok).toBe(true);
    if (virtual.ok && full.ok) {
      expect(virtual.output).toBe(full.output);
      expect(virtual.fills).toEqual(full.fills);
      expect(virtual.pagesTouched).toEqual(full.pagesTouched);
      expect(virtual.pagesTouched.some((p) => storeA.missingPages().includes(p))).toBe(true);
    }
  });
});
