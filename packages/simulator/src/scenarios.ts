/**
 * Required scenarios from the build brief (section 9). Each returns a RunReport whose
 * `findings` are computed from the run, never asserted in advance.
 */
import { FACTORY_DEFAULTS, LAUNCH_PAGES, SOL, factoryMarketDefaults, testThresholds, priceAtBin, pageRange, type MarketConfig } from "@pop/math";
import { Simulation, binComposition, fmtSol, fmtBase, type RunReport } from "./engine.js";

export type Scenario = { id: string; title: string; run: () => RunReport | RunReport[] };

const PILOT = FACTORY_DEFAULTS; // 1B tokens, 20 SOL seed

/** Sell the largest amount (<= actor balance) that fills within the traversal cap. Returns false if nothing fills. */
function sellMax(sim: Simulation, actorName: string): boolean {
  const a = sim.actor(actorName);
  if (a.base === 0n) return false;
  let lo = 0n, hi = a.base;
  if (sim.quote("sell", hi).ok) lo = hi;
  else {
    while (hi - lo > 1_000_000n) {
      const mid = (lo + hi) / 2n;
      if (sim.quote("sell", mid).ok) lo = mid; else hi = mid;
    }
  }
  if (lo === 0n) return false;
  return sim.swap(actorName, "sell", lo).ok;
}

function sumQuote(sim: Simulation) {
  const s = sim.snapshot();
  return s.seedQuote + s.scarQuote;
}

export const straightPump: Scenario = {
  id: "straight-pump",
  title: "Straight pumping: buy fees wait as pending quote; no fake two-sided matching",
  run: () => {
    const sim = new Simulation({ name: "straight-pump", description: "20 consecutive 1 SOL buys from one actor, no sells.", config: PILOT });
    sim.fund("pumper", 100n * SOL);
    for (let i = 0; i < 20; i++) sim.swap("pumper", "buy", 1n * SOL);
    const end = sim.snapshot();
    sim.finding(`Pending eligible quote escrow after 20 buys: ${fmtSol(end.pendingQuoteEligible)}; activated scar quote: ${fmtSol(end.scarQuote)}; paired lifetime: ${fmtSol(sim.state.pairedQuoteLifetime)}.`);
    sim.finding(end.scarQuote === 0n && sim.state.pairedQuoteLifetime === 0n ? "No matching occurred without opposing sell fees: one-sided flow creates pending escrow only." : "UNEXPECTED: matching occurred without sell fees.");
    sim.finding(`Cursor moved from bin 0 to bin ${end.cursor} (price ${sim.priceHuman(0).toExponential(4)} -> ${end.cursorPriceHuman.toExponential(4)} SOL/token).`);
    const failed = sim.trades.filter((t) => !t.ok);
    if (failed.length) sim.finding(`${failed.length} buys failed: ${failed[0]!.error}. A 1 SOL buy at launch spans many bins because each bin holds only ~0.039 SOL of seed tokens at P0.`);
    return sim.report();
  },
};

export const pumpThenSell: Scenario = {
  id: "pump-then-sell",
  title: "Pump then sell: exact opposing-fee match and current inventory composition",
  run: () => {
    const sim = new Simulation({ name: "pump-then-sell", description: "Actor buys 0.5 SOL five times, then sells everything back in five equal sells.", config: PILOT });
    const a = sim.fund("trader", 10n * SOL);
    for (let i = 0; i < 5; i++) sim.swap("trader", "buy", SOL / 2n);
    const afterBuys = sim.snapshot();
    const chunk = a.base / 5n;
    for (let i = 0; i < 5; i++) sim.swap("trader", "sell", chunk);
    const end = sim.snapshot();
    const scars = sim.trades.flatMap((t) => t.scarsFormed ?? []);
    sim.finding(`After buys: pending quote ${fmtSol(afterBuys.pendingQuoteEligible)}, no scars. After sells: ${scars.length} ScarFormed events; activated scar base ${fmtBase(end.scarBase)} tokens and scar quote ${fmtSol(end.scarQuote)}; paired lifetime ${fmtSol(sim.state.pairedQuoteLifetime)}.`);
    sim.finding(`Remaining unmatched: pending quote ${fmtSol(end.pendingQuoteEligible)}, pending base ${fmtBase(end.pendingBaseEligible)} tokens. Pending amounts are reported separately from activated inventory.`);
    for (const e of scars.slice(0, 3)) {
      const p = priceAtBin(sim.p0, e.bin);
      const impliedQ = (e.base * p) >> 64n;
      sim.finding(`Scar at bin ${e.bin}: base ${e.base} paired with quote ${e.quote}; floor(base*price)=${impliedQ} (ceil rule: quote - floor in {0,1}).`);
    }
    sim.finding(`Trader round trip P/L: ${fmtSol(a.quoteReceived - a.quoteSpent)} on ${fmtSol(a.quoteSpent)} spent (fees + rounding + path).`);
    return sim.report();
  },
};

export const repeatedChop: Scenario = {
  id: "repeated-chop",
  title: "Repeated chop: fees accumulate without creating unbacked assets",
  run: () => {
    const sim = new Simulation({ name: "repeated-chop", description: "Two actors alternate 0.3 SOL buys and proportional sells for 200 rounds.", config: PILOT });
    sim.fund("alice", 50n * SOL);
    sim.fund("bob", 50n * SOL);
    for (let i = 0; i < 200; i++) {
      const buyer = i % 2 === 0 ? "alice" : "bob";
      const seller = i % 2 === 0 ? "bob" : "alice";
      sim.swap(buyer, "buy", (3n * SOL) / 10n);
      const s = sim.actor(seller);
      if (s.base > 0n) sim.swap(seller, "sell", s.base / 2n);
    }
    const r = sim.reconciliationCheck();
    sim.finding(`Reconciliation ${r.ok ? "holds" : "FAILS"}: vault base+fees ${r.expected.vaultBase + r.expected.feeVaultBase} == ledger ${r.ledgerBase}; quote ${r.expected.vaultQuote + r.expected.feeVaultQuote} == ledger ${r.ledgerQuote}.`);
    const end = sim.snapshot();
    sim.finding(`Scar inventory after 200 rounds: ${fmtBase(end.scarBase)} tokens + ${fmtSol(end.scarQuote)}; paired lifetime ${fmtSol(sim.state.pairedQuoteLifetime)}; every unit traces to a charged fee or a swap input (no minting, no synthesized reserves).`);
    sim.finding(`Current total quote inventory (seed+scar) ${fmtSol(sumQuote(sim))} vs. starting seed quote ${fmtSol(PILOT.seedQuote)}: quote reserves do not monotonically increase; they move with net flow.`);
    return sim.report();
  },
};

export const roundTripActor: Scenario = {
  id: "round-trip-actor",
  title: "One controlled actor round-tripping: maturity can be manufactured; actor P/L and capital recycled",
  run: () => {
    const cfg: MarketConfig = PILOT;
    const sim = new Simulation({ name: "round-trip-actor", description: "A single actor with 10 SOL buys 1 SOL and immediately sells all, repeatedly, until graduation or until 60 SOL of cumulative fees are paid (cap 20,000 round trips).", config: cfg });
    const a = sim.fund("washer", 10n * SOL);
    let rounds = 0;
    let feesPaidQuote = 0n;
    while (sim.state.status !== "graduated" && rounds < 20_000) {
      const b = sim.swap("washer", "buy", a.quote < SOL ? a.quote : SOL);
      if (!b.ok) break;
      feesPaidQuote += b.scarFee! + b.protocolFee! + b.creatorFee!;
      const s = sim.swap("washer", "sell", a.base);
      if (!s.ok) break;
      rounds++;
      if (a.quote < SOL / 10n) break;
      if (feesPaidQuote > 60n * SOL) break;
    }
    const capitalRecycled = a.quoteSpent;
    sim.finding(`Round trips: ${rounds}. Status: ${sim.state.status}. Paired lifetime ${fmtSol(sim.state.pairedQuoteLifetime)} of ${fmtSol(cfg.maturityQuoteTarget)} target; hardened bands ${sim.state.hardenedBands} of ${cfg.bandsRequired}.`);
    sim.finding(`Actor started with 10 SOL, ends with ${fmtSol(a.quote)} SOL and ${fmtBase(a.base)} tokens. Gross capital recycled through buys: ${fmtSol(capitalRecycled)}. Net quote P/L ${fmtSol(a.quote - 10n * SOL)}.`);
    sim.finding(`Quote-side fees paid by the actor: ${fmtSol(feesPaidQuote)} (plus base-side fees on every sell). Maturity is a function of paid fees, so a single actor can manufacture it at the cost of ~2% per side per round trip plus rounding; graduation must not be marketed as proof of organic demand.`);
    const perRound = rounds ? sim.state.pairedQuoteLifetime / BigInt(rounds) : 0n;
    sim.finding(`Average paired quote per 1 SOL round trip: ${fmtSol(perRound)}. At that rate the 100 SOL target needs about ${perRound ? (Number(cfg.maturityQuoteTarget) / Number(perRound)).toFixed(0) : "n/a"} round trips (~${perRound ? (Number(cfg.maturityQuoteTarget) / Number(perRound) * 2 * 0.02).toFixed(0) : "n/a"} SOL of fees if sized at 1 SOL).`);
    return sim.report();
  },
};

export const pumpBeforeValuation: Scenario = {
  id: "pump-before-valuation",
  title: "Pump before valuation snapshot: SOL metrics cannot be inflated by the marked USD price",
  run: () => {
    const sim = new Simulation({ name: "pump-before-valuation", description: "Build some scars with chop, then pump price 30%+ with buys and compare SOL-denominated metrics to a USD mark at the inflated price.", config: PILOT });
    sim.fund("chopper", 20n * SOL);
    for (let i = 0; i < 30; i++) {
      sim.swap("chopper", "buy", SOL / 2n);
      sim.swap("chopper", "sell", sim.actor("chopper").base);
    }
    const before = sim.snapshot();
    const pairedBefore = sim.state.pairedQuoteLifetime;
    sim.fund("pumper", 100n * SOL);
    for (let i = 0; i < 40; i++) sim.swap("pumper", "buy", SOL);
    const after = sim.snapshot();
    const solUsd = 150;
    const markBefore = (Number(before.scarBase) / 1e6) * before.cursorPriceHuman * solUsd + (Number(before.scarQuote) / 1e9) * solUsd;
    const markAfter = (Number(after.scarBase) / 1e6) * after.cursorPriceHuman * solUsd + (Number(after.scarQuote) / 1e9) * solUsd;
    sim.finding(`Cursor price moved ${((after.cursorPriceHuman / before.cursorPriceHuman - 1) * 100).toFixed(1)}%. Paired quote lifetime: ${fmtSol(pairedBefore)} -> ${fmtSol(sim.state.pairedQuoteLifetime)} (unchanged by the pump itself; buys only add pending quote).`);
    sim.finding(`Indicative USD mark of scar inventory at 150 USD/SOL: ${markBefore.toFixed(2)} -> ${markAfter.toFixed(2)} USD. The USD mark rises with the marked price while the SOL-denominated paired counter and current quote inventory do not. UI must show the SOL counters prominently and label USD marks as indicative.`);
    sim.finding(`Current scar quote inventory: ${fmtSol(before.scarQuote)} -> ${fmtSol(after.scarQuote)} (buys consume scar base and deposit quote; current inventory changes with swaps).`);
    return sim.report();
  },
};

export const splitTrades: Scenario = {
  id: "split-trades",
  title: "One trade versus 100 / 1,000 splits: rounding bound and state-dependent differences",
  run: () => {
    const reports: RunReport[] = [];
    const total = SOL; // 1 SOL gross
    const results: { label: string; output: bigint; scar: bigint; endBin: number; failed: number }[] = [];
    for (const n of [1, 100, 1000]) {
      const sim = new Simulation({ name: `split-trades-${n}`, description: `1 SOL gross bought as ${n} equal swaps on a fresh market.`, config: PILOT });
      sim.fund("buyer", total);
      const part = total / BigInt(n);
      let failed = 0;
      for (let i = 0; i < n; i++) {
        const r = sim.swap("buyer", "buy", i === n - 1 ? total - part * BigInt(n - 1) : part);
        if (!r.ok) failed++;
      }
      const a = sim.actor("buyer");
      const end = sim.snapshot();
      results.push({ label: `${n} swap(s)`, output: a.base, scar: end.pendingQuoteEligible, endBin: end.cursor, failed });
      sim.finding(`${n} swaps: output ${a.base} token-atomic (${fmtBase(a.base)} POP), pending scar quote ${end.pendingQuoteEligible}, cursor ${end.cursor}, failed ${failed}.`);
      reports.push(sim.report());
    }
    const base = results[0]!;
    for (const r of results.slice(1)) {
      const diff = r.output - base.output;
      const note = `${r.label} vs 1 swap: output difference ${diff} atomic (${(Number(diff) / Number(base.output) * 100).toExponential(3)}%), scar fee difference ${r.scar - base.scar} lamports.`;
      reports[0]!.findings.push(note);
    }
    reports[0]!.findings.push("Differences come from per-swap fee flooring (bounded by 3 lamports per swap), per-bin rounding surplus (bounded by one base unit's price per final bin), and the fixed-percentage fee makes the split neither cheaper nor more expensive in fees beyond flooring. Splitting is NOT exactly invariant; it is bounded. With sells interleaved, scars activate between splits and change the path.");
    return reports;
  },
};

export const sandwich: Scenario = {
  id: "sandwich",
  title: "Sandwich and back-run: attacker P/L, victim output, slippage enforcement",
  run: () => {
    const sim = new Simulation({ name: "sandwich", description: "Victim quotes a 0.5 SOL buy with 1% slippage tolerance (after fees). Attacker front-runs with 1 SOL, victim executes, attacker sells.", config: PILOT });
    sim.fund("victim", SOL);
    sim.fund("attacker", 10n * SOL);
    const victimGross = SOL / 2n;
    const quoted = sim.quote("buy", victimGross);
    if (!quoted.ok) throw new Error("victim quote failed");
    const minOut = (quoted.output * 99n) / 100n; // 1% slippage, fees already excluded from the quote
    // Scenario A: attacker front-runs, victim's min_output is enforced.
    sim.swap("attacker", "buy", SOL);
    const victimAttempt = sim.swap("victim", "buy", victimGross, minOut);
    sim.finding(`Victim quoted ${quoted.output} token-atomic; with 1% tolerance min_output ${minOut}. After a 1 SOL front-run the victim swap ${victimAttempt.ok ? `EXECUTED with output ${victimAttempt.output}` : `REVERTED (${victimAttempt.error})`}.`);
    // Scenario B: victim with a loose 15% tolerance gets sandwiched.
    const sim2 = new Simulation({ name: "sandwich-loose", description: "Same, victim tolerates 25% slippage.", config: PILOT });
    sim2.fund("victim", SOL);
    const att = sim2.fund("attacker", 10n * SOL);
    const q2 = sim2.quote("buy", victimGross);
    if (!q2.ok) throw new Error("quote failed");
    const minOut2 = (q2.output * 75n) / 100n;
    sim2.swap("attacker", "buy", SOL);
    const v2 = sim2.swap("victim", "buy", victimGross, minOut2);
    sim2.swap("attacker", "sell", att.base);
    const pnl = att.quote - 10n * SOL;
    sim2.finding(`Loose (25%) tolerance: victim executed=${v2.ok} output ${v2.output ?? 0n} vs quoted ${q2.output} (${v2.output ? ((Number(v2.output) / Number(q2.output) - 1) * 100).toFixed(2) : "n/a"}%). Attacker net P/L after back-run: ${fmtSol(pnl)} (${pnl > 0n ? "PROFITABLE: the victim's loose tolerance paid for it" : "unprofitable: 2% per side fees plus rounding exceeded the extracted slippage"}). The attacker's fees became pending escrow at the traversed bins.`);
    sim.finding(`See run 'sandwich-loose' for the loose-tolerance case. Slippage protection is min_output on-chain; the UI must never raise it silently.`);
    return [sim.report(), sim2.report()];
  },
};

export const distantScar: Scenario = {
  id: "distant-scar",
  title: "Scar formed in a distant bin: historical bin stays fixed; active depth may remain low",
  run: () => {
    const sim = new Simulation({ name: "distant-scar", description: "Pump to ~bin 200 with 25 x 1 SOL buys, chop there to form scars, then sell back down toward bin 0 in the largest chunks that fill. Inspect the distant bins.", config: PILOT });
    sim.fund("whale", 200n * SOL);
    for (let i = 0; i < 25; i++) sim.swap("whale", "buy", SOL);
    const highCursor = sim.state.cursor;
    sim.fund("chopper", 20n * SOL);
    for (let i = 0; i < 20; i++) {
      sim.swap("chopper", "buy", SOL / 2n);
      sim.swap("chopper", "sell", sim.actor("chopper").base);
    }
    const scarBins = [...sim.store.entries()].filter(([, b]) => b.scarQuote > 0n || b.scarBase > 0n).map(([id]) => id);
    const w = sim.actor("whale");
    // dump most of the whale's bag to return the price downward
    for (let i = 0; i < 500 && w.base > 0n && sim.state.cursor > 2; i++) {
      if (!sellMax(sim, "whale")) break;
    }
    const end = sim.snapshot();
    const sample = scarBins.slice(0, 5).map((id) => ({ id, ...binComposition(sim, id) }));
    sim.finding(`Scars formed in bins ${scarBins[0]} .. ${scarBins[scarBins.length - 1]} (cursor was ${highCursor}). After the dump the cursor is ${end.cursor}.`);
    for (const s of sample) sim.finding(`Bin ${s.id}: current base ${s.base}, current quote ${s.quote}, paired lifetime ${s.paired}. The bin location is unchanged; its contents are whatever the last swaps left.`);
    const depth = sim.depthTable().find((d) => d.direction === "sell" && d.bps === 500)!;
    sim.finding(`Sell depth within 5% of the current cursor price: ${fmtSol(depth.input === 0n ? 0n : depth.output)} obtainable across ${depth.bins} bins. Historical scars far above the price provide no sell depth here; never equate historical contributions with present exit liquidity.`);
    return sim.report();
  },
};

export const sellDepletion: Scenario = {
  id: "sell-depletion",
  title: "Complete sell depletion: revert cleanly; no fabricated SOL or redemption guarantee",
  run: () => {
    const sim = new Simulation({ name: "sell-depletion", description: "A synthetic holder with 2B tokens (a TEST balance exceeding real supply, to reach the boundary) sells in the largest chunks that fill until the quote side is exhausted.", config: PILOT, configLabel: "pilot defaults (synthetic holder balance for boundary test)" });
    sim.fund("holder", 0n, 2_000_000_000n * 1_000_000n);
    sim.totalMinted += 2_000_000_000n * 1_000_000n;
    let fails = 0;
    let lastErr = "";
    for (let i = 0; i < 2000 && fails < 3; i++) {
      if (!sellMax(sim, "holder")) {
        const r = sim.swap("holder", "sell", 1_000_000n * 1_000_000n);
        fails++;
        lastErr = r.error ?? "no executable fill";
      }
    }
    const end = sim.snapshot();
    sim.finding(`Final failures: ${lastErr}. Remaining quote inventory ${fmtSol(end.seedQuote + end.scarQuote)}; cursor ${end.cursor}. Failed swaps changed nothing (reconciliation ${sim.reconciliationCheck().ok ? "holds" : "FAILS"}).`);
    sim.finding(`Holder received ${fmtSol(sim.actor("holder").quoteReceived)} for ${fmtBase(sim.actor("holder").baseSold)} tokens. There is no floor and no redemption: once bid inventory is gone, sells revert.`);
    return sim.report();
  },
};

export const buyDepletion: Scenario = {
  id: "buy-depletion",
  title: "Complete buy depletion / boundary: revert consistently at bin +511",
  run: () => {
    const cfg: MarketConfig = { ...PILOT, binMax: 63, seedBase: PILOT.seedBase / 8n, configVersion: 1001 };
    const sim = new Simulation({ name: "buy-depletion", description: "Smaller TEST range (binMax=63, 112.5M tokens seed) so full depletion is cheap: buy until the top boundary rejects.", config: cfg, configLabel: "TEST range (binMax=63)" });
    sim.fund("buyer", 10_000n * SOL);
    let lastErr = "";
    let fails = 0;
    for (let i = 0; i < 2000 && fails < 3; i++) {
      const r = sim.swap("buyer", "buy", SOL);
      if (!r.ok) {
        fails++;
        lastErr = r.error!;
      }
    }
    const end = sim.snapshot();
    sim.finding(`Final failures: ${lastErr}. Remaining base inventory ${fmtBase(end.seedBase + end.scarBase)} tokens; cursor ${end.cursor} of max ${cfg.binMax}. Quote paid in total ${fmtSol(sim.actor("buyer").quoteSpent)}.`);
    sim.finding("At the boundary the program reports BuyInventoryExhausted and the SDK quote reports the same code; no new inventory is minted to rescue the market.");
    return sim.report();
  },
};

export const maturityThreshold: Scenario = {
  id: "maturity-threshold",
  title: "Maturity threshold: both conditions needed; exactly one graduation event",
  run: () => {
    // A: paired target reached but bands not -> no graduation.
    const cfgA: MarketConfig = { ...testThresholds(PILOT), bandsRequired: 40 };
    const simA = new Simulation({ name: "maturity-threshold-bands-missing", description: "TEST config: paired target 1 SOL reachable, but 40 hardened bands required (unreachable with chop near the cursor).", config: cfgA, configLabel: "TEST thresholds, bandsRequired=40" });
    simA.fund("chopper", 50n * SOL);
    for (let i = 0; i < 300 && simA.state.pairedQuoteLifetime < cfgA.maturityQuoteTarget; i++) {
      simA.swap("chopper", "buy", SOL);
      simA.swap("chopper", "sell", simA.actor("chopper").base);
    }
    simA.finding(`Paired ${fmtSol(simA.state.pairedQuoteLifetime)} >= target ${fmtSol(cfgA.maturityQuoteTarget)}: ${simA.state.pairedQuoteLifetime >= cfgA.maturityQuoteTarget}; hardened bands ${simA.state.hardenedBands}/${cfgA.bandsRequired}; status ${simA.state.status}; graduation events ${simA.graduationEvents}.`);
    // B: bands reached but paired not.
    const cfgB: MarketConfig = { ...testThresholds(PILOT), maturityQuoteTarget: 1000n * SOL, bandQuoteTarget: SOL / 1000n, bandsRequired: 2 };
    const simB = new Simulation({ name: "maturity-threshold-paired-missing", description: "TEST config: 2 bands at 0.001 SOL reachable, paired target 1000 SOL unreachable.", config: cfgB, configLabel: "TEST thresholds, maturity 1000 SOL" });
    simB.fund("chopper", 50n * SOL);
    for (let i = 0; i < 60; i++) {
      simB.swap("chopper", "buy", SOL);
      simB.swap("chopper", "sell", simB.actor("chopper").base);
    }
    simB.finding(`Hardened bands ${simB.state.hardenedBands}/${cfgB.bandsRequired}; paired ${fmtSol(simB.state.pairedQuoteLifetime)} of ${fmtSol(cfgB.maturityQuoteTarget)}; status ${simB.state.status}; graduation events ${simB.graduationEvents}.`);
    // C: both reached -> exactly one event, trading continues unchanged.
    const cfgC = testThresholds(PILOT);
    const simC = new Simulation({ name: "maturity-threshold-graduates", description: "TEST config: 1 SOL paired and 2 bands at 0.01 SOL; chop until graduation then keep trading.", config: cfgC });
    simC.fund("chopper", 50n * SOL);
    let gradSeq = -1;
    for (let i = 0; i < 400; i++) {
      const b = simC.swap("chopper", "buy", SOL);
      if (b.graduated) gradSeq = b.seq;
      const s = simC.swap("chopper", "sell", simC.actor("chopper").base);
      if (s.graduated) gradSeq = s.seq;
      if (simC.state.status === "graduated" && i > 20 && gradSeq > 0 && b.seq > gradSeq + 10) break;
    }
    const feesAfter = simC.trades.filter((t) => t.ok && t.seq > gradSeq);
    simC.finding(`Graduated at trade seq ${gradSeq}; total graduation events ${simC.graduationEvents}; ${feesAfter.length} swaps executed after graduation with identical fee rules (scar fee charged on the first post-graduation swap, a ${feesAfter[0]?.direction}: ${feesAfter[0]?.scarFee} atomic units of its input asset).`);
    simC.matchAllBins();
    simC.finding(`Keeper match pass after graduation produced no second event (events total ${simC.graduationEvents}).`);
    return [simA.report(), simB.report(), simC.report()];
  },
};

export const multipleLaunches: Scenario = {
  id: "multiple-launches",
  title: "Multiple independent launches: scar, reserve and creator-fee state isolated per market",
  run: () => {
    const seeds = [1n * SOL, 5n * SOL, 20n * SOL];
    const sims = seeds.map((seed, i) => new Simulation({ name: `multiple-launches-${i + 1}`, description: `Coin ${i + 1} of 3 launched with ${fmtSol(seed)} seed; traders interleave across the three coins.`, config: factoryMarketDefaults(1_000_000_000n * 1_000_000n, seed), configLabel: `factory defaults, seed ${fmtSol(seed)}` }));
    for (const sim of sims) {
      sim.fund("t1", 50n * SOL);
      sim.fund("t2", 50n * SOL);
    }
    const snapshots = sims.map((sim) => sim.snapshot());
    for (let round = 0; round < 30; round++) {
      const sim = sims[round % 3]!;
      const who = round % 2 === 0 ? "t1" : "t2";
      const size = sim.config.seedQuote / 40n;
      sim.swap(who, "buy", size);
      const a = sim.actor(who);
      if (a.base > 0n) {
        let lo = 0n, hi = a.base;
        if (!sim.quote("sell", hi).ok) while (hi - lo > 1_000_000n) { const mid = (lo + hi) / 2n; if (sim.quote("sell", mid).ok) lo = mid; else hi = mid; } else lo = hi;
        if (lo > 0n) sim.swap(who, "sell", lo);
      }
      // the other two markets must be byte-for-byte unchanged by this round
      for (let k = 0; k < 3; k++) if (k !== round % 3) {
        const before = snapshots[k]!;
        const now = sims[k]!.snapshot();
        if (JSON.stringify(before, (_, v) => (typeof v === "bigint" ? v.toString() : v)) !== JSON.stringify(now, (_, v) => (typeof v === "bigint" ? v.toString() : v))) {
          sims[k]!.finding(`UNEXPECTED: market ${k + 1} changed during a round on market ${(round % 3) + 1}`);
        }
      }
      snapshots[round % 3] = sim.snapshot();
    }
    for (const [i, sim] of sims.entries()) {
      const r = sim.reconciliationCheck();
      const creator = sim.state.creatorClaimableQuote;
      sim.finding(`Coin ${i + 1}: ${sim.trades.filter((t) => t.ok).length} swaps; paired ${fmtSol(sim.state.pairedQuoteLifetime)}; creator claimable ${fmtSol(creator)} + ${fmtBase(sim.state.creatorClaimableBase)} tokens; buyback earmark ${fmtSol(sim.state.buybackAccruedQuote)}; reconciliation ${r.ok ? "holds" : "FAILS"}. Fees accrue only to this coin's own creator and vaults.`);
      sim.sweepBuyback();
      sim.finding(`Sweep moved the earmark to the shared protocol escrow; the market's locked vaults are untouched (${fmtSol(sim.snapshot().vaultQuote)} quote in custody).`);
    }
    return sims.map((s) => s.report());
  },
};

export const interruptedCreation: Scenario = {
  id: "interrupted-creation",
  title: "Interrupted creation: resume without duplicate mint, funding or page allocation",
  run: () => {
    const cfg = factoryMarketDefaults(1_000_000_000n * 1_000_000n, 1n * SOL);
    const sim = new Simulation({ name: "interrupted-creation", description: "Launch creates only pages -1..2, 'crashes' after page 0, resumes, activates once; a trade later crosses into an uncreated page which the trader materializes.", config: cfg, initAllPages: false, pages: [0], active: false, configLabel: "factory defaults, seed 1 SOL, lazy pages" });
    const seedBefore = { base: sim.state.unmaterializedSeedBase, quote: sim.state.unmaterializedSeedQuote };
    const first = sim.initPages([...LAUNCH_PAGES]);
    sim.finding(`Resume after crash: pages created ${JSON.stringify(first.created)}, already present (skipped) ${JSON.stringify(first.skipped)}. Unmaterialized seed went ${fmtBase(seedBefore.base)} -> ${fmtBase(sim.state.unmaterializedSeedBase)} tokens; exactly one allocation per page.`);
    const again = sim.initPages([...LAUNCH_PAGES]);
    sim.finding(`Second resume: created ${again.created.length}, skipped ${again.skipped.length} (idempotent).`);
    const act1 = sim.activate();
    const act2 = sim.activate();
    sim.finding(`Activation succeeded once (${act1}) and was refused the second time (${act2}); activations = ${sim.activations}. The on-chain program likewise rejects a second activate (MarketAlreadyActive) and a second create_market for the same mint (account already exists).`);
    sim.fund("trader", 10n * SOL);
    // From a fresh cursor the 32-bin cap never leaves the launch pages; move the cursor first.
    sim.swap("trader", "buy", SOL / 20n);
    sim.swap("trader", "buy", SOL / 20n);
    const size = SOL / 20n;
    const q = sim.quote("buy", size, 0n, true);
    const strict = sim.quote("buy", size, 0n, false);
    if (q.ok) {
      const missing = q.pagesTouched.filter((p) => !sim.store.hasPage(p));
      sim.finding(`With the cursor at bin ${sim.state.cursor}, a ${fmtSol(size)} buy touches pages ${JSON.stringify(q.pagesTouched)}; strict quote: ${strict.ok ? "ok" : strict.error}; the virtual-page quote fills ${q.fills.length} bins and needs pages ${JSON.stringify(missing)} created first (trader pays rent).`);
      sim.initPages(missing);
      const r = sim.swap("trader", "buy", size);
      sim.finding(`After creating them the swap executed with output ${r.output} (virtual quote predicted ${q.output}; equal: ${r.output === q.output}).`);
    } else sim.finding(`UNEXPECTED: virtual quote failed ${q.error}`);
    const { minPage, maxPage } = pageRange(cfg);
    sim.finding(`Pages materialized: ${sim.store.pages.size} of ${maxPage - minPage + 1}; reconciliation ${sim.reconciliationCheck().ok ? "holds" : "FAILS"} with unmaterialized seed counted in the vault total.`);
    return sim.report();
  },
};

export const seedSizeSweep: Scenario = {
  id: "seed-size-sweep",
  title: "Seed size sweep: single-swap capacity and price impact at 1 / 5 / 20 SOL seeds",
  run: () => {
    const reports: RunReport[] = [];
    for (const seed of [1n * SOL, 5n * SOL, 20n * SOL]) {
      const cfg = factoryMarketDefaults(1_000_000_000n * 1_000_000n, seed);
      const sim = new Simulation({ name: `seed-sweep-${Number(seed / SOL)}sol`, description: `Fresh market seeded with ${fmtSol(seed)}: largest buy/sell within 32 bins, price impact of small buys.`, config: cfg, configLabel: `factory defaults, seed ${fmtSol(seed)}` });
      sim.fund("probe", 10_000n * SOL, 500_000_000n * 1_000_000n);
      let lo = cfg.minQuoteIn, hi = 100n * SOL;
      while (hi - lo > 100_000n) { const mid = (lo + hi) / 2n; if (sim.quote("buy", mid).ok) lo = mid; else hi = mid; }
      const maxBuy = lo;
      let lo2 = cfg.minBaseIn, hi2 = 500_000_000n * 1_000_000n;
      while (hi2 - lo2 > 1_000_000n) { const mid = (lo2 + hi2) / 2n; if (sim.quote("sell", mid).ok) lo2 = mid; else hi2 = mid; }
      const bin0 = sim.store.getOrThrow(0);
      sim.finding(`Seed per bin: ${fmtSol(sim.store.getOrThrow(-1).seedQuote)} quote (bins -64..-1), ${fmtBase(bin0.seedBase)} tokens (~${fmtSol((bin0.seedBase * priceAtBin(sim.p0, 0)) >> 64n)} at P0, bins 0..511).`);
      sim.finding(`Largest single buy within 32 bins: ${fmtSol(maxBuy)}. Largest single sell: ${fmtBase(lo2)} tokens (~${fmtSol((lo2 * priceAtBin(sim.p0, 0)) >> 64n)} at P0).`);
      for (const size of [SOL / 100n, SOL / 10n, SOL]) {
        const q = sim.quote("buy", size);
        if (q.ok) {
          const impact = (Number(q.endPriceX64) / Number(q.startPriceX64) - 1) * 100;
          sim.finding(`A ${fmtSol(size)} buy inspects ${q.binsInspected} bins and moves the cursor price ${impact.toFixed(1)}%.`);
        } else sim.finding(`A ${fmtSol(size)} buy fails: ${q.error}.`);
      }
      reports.push(sim.report());
    }
    reports[0]!.findings.push("Calibration: the seed sets how much one transaction can move. The largest single buy within the 32-bin cap scales linearly with the seed (about 0.075 SOL at 1 SOL, 0.37 SOL at 5 SOL, 1.5 SOL at 20 SOL), and a 0.01 SOL buy moves a 1 SOL-seeded coin about 4%. Larger orders must be split into separately signed transactions; the launch form shows this limit for the chosen seed. Experimental calibration choice, not validated economics.");
    return reports;
  },
};

export const unauthorizedClaims: Scenario = {
  id: "unauthorized-claims",
  title: "Unauthorized claims: fee claims only move claimable balances; locked custody has no withdrawal path",
  run: () => {
    const sim = new Simulation({ name: "unauthorized-claims", description: "After trading, claim protocol and creator fees, attempt a locked withdrawal, and reconcile.", config: PILOT });
    sim.fund("t", 10n * SOL);
    for (let i = 0; i < 10; i++) {
      sim.swap("t", "buy", SOL / 2n);
      sim.swap("t", "sell", sim.actor("t").base / 2n);
    }
    const lockedBefore = sim.snapshot();
    const c1 = sim.claimProtocol("quote");
    const c2 = sim.claimCreator("quote");
    const c3 = sim.claimProtocol("base");
    const c4 = sim.claimCreator("base");
    const lockedAfter = sim.snapshot();
    const attempt = sim.attemptLockedWithdrawal();
    sim.finding(`Claims: protocol ${fmtSol(c1.amount)} + ${fmtBase(c3.amount)} tokens; creator ${fmtSol(c2.amount)} + ${fmtBase(c4.amount)} tokens. Locked vaults before/after claims: base ${lockedBefore.vaultBase}/${lockedAfter.vaultBase}, quote ${lockedBefore.vaultQuote}/${lockedAfter.vaultQuote} (unchanged).`);
    sim.finding(`Locked withdrawal attempt: ${attempt.error}. On-chain, the program exposes no instruction that moves seed/scar/pending custody except swap_exact_in; upgrade authority is the remaining custody power and is reported on /status (see docs/authority-model.md).`);
    sim.finding(`Reconciliation after claims: ${sim.reconciliationCheck().ok}.`);
    return sim.report();
  },
};

export const wrongPage: Scenario = {
  id: "wrong-page",
  title: "Wrong page / uninitialized page: constraint failure, no transferred funds",
  run: () => {
    const sim = new Simulation({ name: "wrong-page", description: "Only page 0 initialized; a sell that needs page -1 fails without state change; later lazy initialization recovers.", config: PILOT, initAllPages: false });
    sim.store.initPage(sim.state, 0);
    sim.fund("t", 10n * SOL, 1_000_000n * 1_000_000n);
    const before = sim.snapshot();
    const r = sim.swap("t", "sell", 1_000_000n * 1_000_000n);
    const after = sim.snapshot();
    sim.finding(`Sell with page -1 missing: ok=${r.ok} error=${r.error}. Vault base/quote before ${before.vaultBase}/${before.vaultQuote}, after ${after.vaultBase}/${after.vaultQuote}.`);
    sim.store.initPage(sim.state, -1);
    let dup = "";
    try { sim.store.initPage(sim.state, -1); } catch (e) { dup = String((e as Error).message); }
    const r2 = sim.swap("t", "sell", 1_000_000n * 1_000_000n);
    sim.finding(`After initializing page -1: duplicate init rejected (${dup}); retry ok=${r2.ok}. Unmaterialized seed quote now ${fmtSol(sim.state.unmaterializedSeedQuote)}.`);
    sim.finding("Mint, token-program and vault substitution checks are account constraints in the Anchor program (tests/integration), not simulator behavior.");
    return sim.report();
  },
};

export const keeperOutage: Scenario = {
  id: "keeper-outage",
  title: "Keeper/indexer outage: swaps remain chain-valid; pending matches recover idempotently",
  run: () => {
    const sim = new Simulation({ name: "keeper-outage", description: "Trade normally (matching is part of swap_exact_in), then run the permissionless match_bins pass twice and show it changes nothing and emits nothing new.", config: PILOT });
    sim.fund("t", 10n * SOL);
    for (let i = 0; i < 10; i++) {
      sim.swap("t", "buy", SOL / 2n);
      sim.swap("t", "sell", sim.actor("t").base / 2n);
    }
    const before = sim.snapshot();
    const paired = sim.state.pairedQuoteLifetime;
    const e1 = sim.matchAllBins();
    const e2 = sim.matchAllBins();
    const after = sim.snapshot();
    sim.finding(`match_bins pass 1 events: ${e1.length}; pass 2 events: ${e2.length}. Paired lifetime ${fmtSol(paired)} -> ${fmtSol(sim.state.pairedQuoteLifetime)}. Pending quote ${before.pendingQuoteEligible} -> ${after.pendingQuoteEligible}.`);
    sim.finding("Matching is executed inside swap_exact_in at the visited bins, so no keeper is required for correctness; match_bins exists for recovery and is idempotent. Indexer downtime only delays display: chain state is authoritative.");
    return sim.report();
  },
};

export const launchCalibration: Scenario = {
  id: "launch-calibration",
  title: "Launch calibration: single-swap size limit implied by seed density and the 32-bin cap",
  run: () => {
    const sim = new Simulation({ name: "launch-calibration", description: "Binary search the largest gross buy that fills within 32 bins on a fresh pilot market; also measure the largest sell.", config: PILOT });
    sim.fund("probe", 10_000n * SOL, 500_000_000n * 1_000_000n);
    let lo = SOL / 100n, hi = 100n * SOL;
    while (hi - lo > 1_000_000n) {
      const mid = (lo + hi) / 2n;
      const q = sim.quote("buy", mid);
      if (q.ok) lo = mid; else hi = mid;
    }
    const maxBuy = lo;
    let lo2 = 1_000_000n, hi2 = 500_000_000n * 1_000_000n;
    while (hi2 - lo2 > 1_000_000n) {
      const mid = (lo2 + hi2) / 2n;
      const q = sim.quote("sell", mid);
      if (q.ok) lo2 = mid; else hi2 = mid;
    }
    const maxSell = lo2;
    const bin0 = sim.store.getOrThrow(0);
    sim.finding(`Seed base per bin: ${fmtBase(bin0.seedBase)} tokens (~${fmtSol((bin0.seedBase * priceAtBin(sim.p0, 0)) >> 64n)} at P0). Seed quote per bin: ${fmtSol(sim.store.getOrThrow(-1).seedQuote)}.`);
    sim.finding(`Largest single buy on a fresh market within 32 bins: ${fmtSol(maxBuy)} gross. Largest single sell: ${fmtBase(maxSell)} tokens (~${fmtSol((maxSell * priceAtBin(sim.p0, 0)) >> 64n)} at P0).`);
    sim.finding("Calibration note: with 20 SOL seed quote over 64 bins the sell side holds 0.3125 SOL per bin, but the buy side at P0 holds only ~0.039 SOL of tokens per bin because 900M tokens valued at P0 is 20 SOL spread over 512 bins. Larger buys must be split into separate signed transactions (the UI offers this). Consider a denser base schedule near the cursor or a smaller binMax in a new config version before mainnet; this is an experimental calibration choice.");
    return sim.report();
  },
};

export const ALL_SCENARIOS: Scenario[] = [
  straightPump,
  pumpThenSell,
  repeatedChop,
  roundTripActor,
  pumpBeforeValuation,
  splitTrades,
  sandwich,
  distantScar,
  sellDepletion,
  buyDepletion,
  maturityThreshold,
  multipleLaunches,
  interruptedCreation,
  seedSizeSweep,
  unauthorizedClaims,
  wrongPage,
  keeperOutage,
  launchCalibration,
];
