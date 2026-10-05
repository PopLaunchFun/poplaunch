/**
 * End-to-end tests against a local validator (scripts/localnet.sh start) with TEST thresholds.
 * Exercises: protocol init, genesis market with vesting, lazy pages, activation with authority
 * revocation, swaps matching the SDK quote exactly, scar formation, reconciliation, failure
 * paths, fee claims, graduation (exactly one event), second market + buyback, vesting claims,
 * and compute measurement for a worst-case traversal.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Connection } from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PopClient, TEST_SETTINGS, buybackPda, buybackQuoteAccountPda, marketPda, marketVaults, pagePda, type MarketView } from "@pop/sdk";
import { pageRange, reconcile, SOL, totalBase, totalQuote } from "@pop/math";
import { chunk, computeUnits, connect, ensureAta, expectFail, makeActor, mintInfo, send, tokenBalance, wrapSol, type Actor } from "./harness.js";

let connection: Connection;
let admin: Actor; // protocol authority, POP creator, buyback authority
let trader: Actor;
let treasury: Keypair; // protocol fee recipient (never signs)
let popMint: Keypair;
let popMarket: PublicKey;
const POP_SUPPLY_SEED = 900_000_000n * 1_000_000n;
const FOUNDER = 50_000_000n * 1_000_000n;
const ECOSYSTEM = 50_000_000n * 1_000_000n;
const graduatedEvents: string[] = [];

async function view(actor: Actor, market: PublicKey): Promise<MarketView> {
  return actor.client.fetchMarket(market);
}

/** Largest gross buy (<= cap) that fills within the traversal cap on the given view. */
function maxBuy(actor: Actor, v: MarketView, cap: bigint): bigint {
  let lo = v.config.minQuoteIn;
  let hi = cap;
  if (actor.client.quote(v, "buy", hi).ok) return hi;
  while (hi - lo > 100_000n) {
    const mid = (lo + hi) / 2n;
    if (actor.client.quote(v, "buy", mid).ok) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Largest sell (<= held) that fills within the traversal cap. */
function maxSell(actor: Actor, v: MarketView, held: bigint): bigint {
  let lo = v.config.minBaseIn;
  let hi = held;
  if (actor.client.quote(v, "sell", hi).ok) return hi;
  while (hi - lo > 1_000_000n) {
    const mid = (lo + hi) / 2n;
    if (actor.client.quote(v, "sell", mid).ok) lo = mid;
    else hi = mid;
  }
  return lo;
}

async function deadline(c: Connection): Promise<bigint> {
  return BigInt(await c.getSlot("confirmed")) + 150n;
}

/** Execute a swap through the SDK, assert the chain output equals the SDK quote, and return the receipt. */
async function swap(actor: Actor, market: PublicKey, isBuy: boolean, gross: bigint, opts: { minOutput?: bigint; slippageBps?: number } = {}) {
  const v = await view(actor, market);
  const q = actor.client.quote(v, isBuy ? "buy" : "sell", gross);
  if (!q.ok) throw new Error(`quote failed: ${q.error} ${q.detail}`);
  const minOutput = opts.minOutput ?? (q.output * BigInt(10_000 - (opts.slippageBps ?? 100))) / 10_000n;
  const tx = await actor.client.buildSwapTransaction(actor.pubkey, v, q, { isBuy, grossInput: gross, minOutput, deadlineSlot: await deadline(connection) });
  const baseAta = getAssociatedTokenAddressSync(v.raw.baseMint, actor.pubkey);
  const quoteAta = getAssociatedTokenAddressSync(NATIVE_MINT, actor.pubkey);
  const [b0, q0] = [await tokenBalance(connection, baseAta), await tokenBalance(connection, quoteAta)];
  const sig = await actor.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  const [b1, q1] = [await tokenBalance(connection, baseAta), await tokenBalance(connection, quoteAta)];
  const events = await actor.client.eventsForSignature(sig);
  const swapEv = events.find((e) => e.name === "swapExecuted")!;
  expect(swapEv).toBeDefined();
  expect(BigInt(swapEv.data.output.toString())).toBe(q.output);
  if (isBuy) {
    expect(b1 - b0).toBe(q.output);
    // wrap adds gross then swap takes it: net quote change is 0 on the WSOL ATA
    expect(q1).toBe(q0);
  } else {
    expect(b0 - b1).toBe(gross);
    expect(q1 - q0).toBe(q.output);
  }
  for (const e of events) if (e.name === "graduated") graduatedEvents.push(sig);
  return { sig, q, events, cu: await computeUnits(connection, sig) };
}

/** Account sums must equal physical vault balances. */
async function assertReconciled(actor: Actor, market: PublicKey) {
  const v = await view(actor, market);
  expect(v.missingPages).toEqual([]);
  const r = reconcile(v.state, v.store);
  const vaults = marketVaults(actor.client.programId, market);
  expect(await tokenBalance(connection, vaults.baseVault)).toBe(r.vaultBase);
  expect(await tokenBalance(connection, vaults.quoteVault)).toBe(r.vaultQuote);
  expect(await tokenBalance(connection, vaults.feeVaultBase)).toBe(r.feeVaultBase);
  expect(await tokenBalance(connection, vaults.feeVaultQuote)).toBe(r.feeVaultQuote);
  let paired = 0n;
  for (const [, b] of v.store.entries()) {
    paired += b.pairedQuoteLifetime;
    for (const x of Object.values(b)) expect(x >= 0n).toBe(true);
  }
  expect(paired).toBe(v.state.pairedQuoteLifetime);
  return v;
}

async function createAndActivateMarket(creator: Actor, mint: Keypair, args: { name: string; symbol: string; seedBase: bigint; isPop: boolean; vesting?: boolean }) {
  const market = marketPda(creator.client.programId, mint.publicKey);
  await send(creator, [await creator.client.createMarketIx(creator.pubkey, mint.publicKey, { name: args.name, symbol: args.symbol, uri: "https://example.invalid/meta.json", seedBase: args.seedBase, decimals: 6, isPopMarket: args.isPop })], [mint]);
  if (args.vesting) {
    const month = 30n * 24n * 3600n;
    await send(creator, [await creator.client.createVestingIx(creator.pubkey, market, mint.publicKey, { index: 0, beneficiary: creator.pubkey, amount: FOUNDER, startOffset: 12n * month, cliffOffset: 12n * month, endOffset: 36n * month, label: "founder" })]);
    // ecosystem: linear from activation over 36 months, no cliff -> claimable immediately after activation
    await send(creator, [await creator.client.createVestingIx(creator.pubkey, market, mint.publicKey, { index: 1, beneficiary: creator.pubkey, amount: ECOSYSTEM, startOffset: 0n, cliffOffset: 0n, endOffset: 36n * month, label: "ecosystem" })]);
  }
  const raw = await creator.client.fetchMarketRaw(market);
  const cfg = (await creator.client.fetchMarket(market, [])).config;
  const ixs = await creator.client.initializeAllPagesIxs(creator.pubkey, market, cfg);
  for (const batch of chunk(ixs, 6)) await send(creator, batch);
  await wrapSol(creator, BigInt(raw.seedQuoteTotal.toString()));
  await send(creator, [await creator.client.activateMarketIx(creator.pubkey, market, mint.publicKey)]);
  return market;
}

beforeAll(async () => {
  connection = await connect();
  admin = await makeActor(connection, 100);
  trader = await makeActor(connection, 100);
  treasury = Keypair.generate();
  popMint = Keypair.generate();
});

describe("protocol and genesis market", () => {
  it("initializes the protocol with TEST settings", async () => {
    await send(admin, [await admin.client.initializeProtocolIx(admin.pubkey, { authority: admin.pubkey, protocolFeeRecipient: treasury.publicKey, buybackAuthority: admin.pubkey, settings: TEST_SETTINGS, buybackMinIntervalSlots: 1n, buybackMaxSpendPerExecution: 1n * SOL, launchesEnabled: true })]);
    const cfg = await admin.client.fetchProtocol();
    expect(cfg.authority.equals(admin.pubkey)).toBe(true);
    expect(cfg.settings.bandsRequired).toBe(2);
    expect(cfg.popMint.equals(PublicKey.default)).toBe(true);
  });

  it("non-authority cannot create the genesis market", async () => {
    const m = Keypair.generate();
    const text = await expectFail(trader, [await trader.client.createMarketIx(trader.pubkey, m.publicKey, { name: "Fake", symbol: "FAKE", uri: "x", seedBase: POP_SUPPLY_SEED, decimals: 6, isPopMarket: true })], [m]);
    expect(text).toContain("Unauthorized");
  });

  it("creates, seeds, pages and activates the POP market; mint authority is revoked", async () => {
    popMarket = await createAndActivateMarket(admin, popMint, { name: "Proof of Pain", symbol: "POP", seedBase: POP_SUPPLY_SEED, isPop: true, vesting: true });
    const mi = await mintInfo(connection, popMint.publicKey);
    expect(mi.mintAuthority).toBeNull();
    expect(mi.freezeAuthority).toBeNull();
    expect(mi.supply).toBe(POP_SUPPLY_SEED + FOUNDER + ECOSYSTEM);
    const v = await assertReconciled(admin, popMarket);
    expect(v.state.status).toBe("active");
    expect(v.state.unmaterializedSeedBase).toBe(0n);
    expect(v.state.unmaterializedSeedQuote).toBe(0n);
    const cfg = await admin.client.fetchProtocol();
    expect(cfg.popMint.equals(popMint.publicKey)).toBe(true);
    const { minPage, maxPage } = pageRange(v.config);
    expect(maxPage - minPage + 1).toBe(36);
  });

  it("rejects re-initializing a page and vesting after activation", async () => {
    const text = await expectFail(admin, [await admin.client.initializeBinPageIx(admin.pubkey, popMarket, 0)]);
    expect(text.length).toBeGreaterThan(0); // account already in use
    const t2 = await expectFail(admin, [await admin.client.createVestingIx(admin.pubkey, popMarket, popMint.publicKey, { index: 2, beneficiary: admin.pubkey, amount: 1n, startOffset: 0n, cliffOffset: 0n, endOffset: 10n, label: "late" })]);
    expect(t2).toContain("MarketNotCreated");
  });
});

describe("swaps", () => {
  it("buy output equals the SDK quote and scar fee lands as pending quote", async () => {
    const r = await swap(trader, popMarket, true, SOL / 20n); // 0.05 SOL
    expect(r.q.fills.length).toBeGreaterThan(0);
    const v = await assertReconciled(trader, popMarket);
    const pending = r.q.scarShares.reduce((a, s) => a + s.amount, 0n);
    expect(pending).toBe(r.q.fees.scarFee);
    expect(v.state.protocolClaimableQuote).toBe(r.q.fees.protocolFee);
    expect(v.state.creatorClaimableQuote).toBe(r.q.fees.creatorFee);
    expect(v.state.buybackAccruedQuote).toBe(0n); // POP market excluded
    expect(v.state.cursor).toBe(r.q.newCursor);
  });

  it("sell forms scars where buy fees are waiting", async () => {
    const baseAta = getAssociatedTokenAddressSync(popMint.publicKey, trader.pubkey);
    const held = await tokenBalance(connection, baseAta);
    const r = await swap(trader, popMarket, false, held / 2n);
    const formed = r.events.filter((e) => e.name === "scarFormed");
    expect(formed.length).toBeGreaterThan(0);
    const v = await assertReconciled(trader, popMarket);
    expect(v.state.pairedQuoteLifetime).toBeGreaterThan(0n);
    const top = v.store.getOrThrow(r.q.fills[0]!.bin);
    expect(top.scarBase > 0n && top.scarQuote > 0n).toBe(true);
  });

  it("enforces min_output, deadline, config version and page provision; failed swaps move nothing", async () => {
    const v = await view(trader, popMarket);
    const vaults = marketVaults(trader.client.programId, popMarket);
    const before = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    const q = trader.client.quote(v, "buy", SOL / 50n);
    if (!q.ok) throw new Error(q.error);
    await wrapSol(trader, SOL / 50n);
    const pages = trader.client.pagesForQuote(v, q);
    const base = { isBuy: true, grossInput: SOL / 50n, minOutput: 0n, deadlineSlot: await deadline(connection) };
    expect(await expectFail(trader, [await trader.client.swapIx(trader.pubkey, v, { ...base, minOutput: q.output + 1n }, pages)])).toContain("OutputBelowMinimum");
    expect(await expectFail(trader, [await trader.client.swapIx(trader.pubkey, v, { ...base, deadlineSlot: 1n }, pages)])).toContain("DeadlinePassed");
    expect(await expectFail(trader, [await trader.client.swapIx(trader.pubkey, v, { ...base, expectedConfigVersion: 99 }, pages)])).toContain("ConfigVersionMismatch");
    expect(await expectFail(trader, [await trader.client.swapIx(trader.pubkey, v, base, [])])).toContain("PageNotProvided");
    // page of another market index that is out of this market's range is rejected as InvalidPage/PageOutOfRange
    const bogus = pagePda(trader.client.programId, popMarket, 99);
    const t = await expectFail(trader, [await trader.client.swapIx(trader.pubkey, v, base, [bogus])]);
    expect(t.length).toBeGreaterThan(0);
    const after = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    expect(after).toEqual(before);
  });

  it("rejects substituted vaults and wrong-mint user accounts without transferring funds", async () => {
    const v = await view(trader, popMarket);
    const q = trader.client.quote(v, "buy", SOL / 50n);
    if (!q.ok) throw new Error(q.error);
    const pages = trader.client.pagesForQuote(v, q);
    const vaults = marketVaults(trader.client.programId, popMarket);
    const ix = await trader.client.swapIx(trader.pubkey, v, { isBuy: true, grossInput: SOL / 50n, minOutput: 0n, deadlineSlot: await deadline(connection) }, pages);
    // swap base_vault for a foreign token account of the same mint: has_one constraint must fail
    const foreign = await ensureAta(trader, popMint.publicKey, treasury.publicKey);
    const userBase = getAssociatedTokenAddressSync(popMint.publicKey, trader.pubkey);
    const tampered = ix.keys.map((k) => (k.pubkey.equals(vaults.baseVault) ? { ...k, pubkey: foreign } : k));
    const text = await expectFail(trader, [{ ...ix, keys: tampered } as typeof ix]);
    expect(text).toContain("InvalidVault");
    // wrong mint for user_quote (use base ATA where quote ATA is expected)
    const userQuote = getAssociatedTokenAddressSync(NATIVE_MINT, trader.pubkey);
    const tampered2 = ix.keys.map((k) => (k.pubkey.equals(userQuote) ? { ...k, pubkey: userBase } : k));
    const text2 = await expectFail(trader, [{ ...ix, keys: tampered2 } as typeof ix]);
    expect(text2.length).toBeGreaterThan(0);
    await assertReconciled(trader, popMarket);
  });

  it("match_bins is idempotent and evaluate_graduation does nothing early", async () => {
    const v0 = await view(trader, popMarket);
    const { minPage, maxPage } = pageRange(v0.config);
    const ixs = [];
    for (let p = minPage; p <= maxPage; p++) ixs.push(await trader.client.matchBinsIx(popMarket, p));
    for (const batch of chunk(ixs, 8)) await send(trader, batch);
    await send(trader, [await trader.client.evaluateGraduationIx(popMarket)]);
    const v1 = await assertReconciled(trader, popMarket);
    expect(v1.state.pairedQuoteLifetime).toBe(v0.state.pairedQuoteLifetime);
    expect(v1.state.status).toBe("active");
  });
});

describe("fee claims", () => {
  it("claims only claimable balances to published recipients; locked vaults unchanged", async () => {
    const v = await view(admin, popMarket);
    const vaults = marketVaults(admin.client.programId, popMarket);
    const lockedBefore = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    const treasuryAta = await ensureAta(admin, NATIVE_MINT, treasury.publicKey);
    const creatorAta = await ensureAta(admin, NATIVE_MINT, admin.pubkey);
    const c0 = await tokenBalance(connection, creatorAta);
    // anyone may crank; destination is forced to the recipient
    await send(trader, [await trader.client.claimFeesIx(popMarket, 0, "quote", treasury.publicKey, popMint.publicKey)]);
    await send(trader, [await trader.client.claimFeesIx(popMarket, 1, "quote", admin.pubkey, popMint.publicKey)]);
    expect(await tokenBalance(connection, treasuryAta)).toBe(v.state.protocolClaimableQuote);
    expect((await tokenBalance(connection, creatorAta)) - c0).toBe(v.state.creatorClaimableQuote);
    const v2 = await assertReconciled(admin, popMarket);
    expect(v2.state.protocolClaimableQuote).toBe(0n);
    // wrong destination owner is rejected; nothing to claim afterwards
    const t = await expectFail(trader, [await trader.client.claimFeesIx(popMarket, 0, "quote", trader.pubkey, popMint.publicKey)]);
    expect(t).toContain("InvalidClaimDestination");
    const t2 = await expectFail(trader, [await trader.client.claimFeesIx(popMarket, 0, "quote", treasury.publicKey, popMint.publicKey)]);
    expect(t2).toContain("NothingToClaim");
    const lockedAfter = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    expect(lockedAfter).toEqual(lockedBefore);
  });
});

describe("graduation under TEST thresholds", () => {
  it("graduates exactly once and keeps trading with identical fees", async () => {
    let worst = 0;
    const baseAta = getAssociatedTokenAddressSync(popMint.publicKey, trader.pubkey);
    for (let i = 0; i < 80; i++) {
      const size = maxBuy(trader, await view(trader, popMarket), SOL / 5n);
      const b = await swap(trader, popMarket, true, size);
      worst = Math.max(worst, b.cu);
      const held = await tokenBalance(connection, baseAta);
      const s = await swap(trader, popMarket, false, maxSell(trader, await view(trader, popMarket), held));
      worst = Math.max(worst, s.cu);
      const v = await view(trader, popMarket);
      if (v.state.status === "graduated") break;
    }
    const v = await assertReconciled(trader, popMarket);
    expect(v.state.status).toBe("graduated");
    expect(v.state.pairedQuoteLifetime >= v.config.maturityQuoteTarget).toBe(true);
    expect(v.state.hardenedBands >= v.config.bandsRequired).toBe(true);
    expect(graduatedEvents.length).toBe(1);
    const size = maxBuy(trader, await view(trader, popMarket), SOL / 10n);
    const after = await swap(trader, popMarket, true, size);
    expect(after.q.fees.scarFee).toBe((size * 150n) / 10_000n);
    expect(after.events.filter((e) => e.name === "graduated").length).toBe(0);
    console.log(`[cu] worst swap during chop: ${worst}`);
  });

  it("measures compute for a traversal-capped buy", async () => {
    const v = await view(trader, popMarket);
    let lo = SOL / 100n;
    let hi = 50n * SOL;
    while (hi - lo > 1_000_000n) {
      const mid = (lo + hi) / 2n;
      if (trader.client.quote(v, "buy", mid).ok) lo = mid;
      else hi = mid;
    }
    const q = trader.client.quote(v, "buy", lo);
    if (!q.ok) throw new Error(q.error);
    const r = await swap(trader, popMarket, true, lo, { slippageBps: 50 });
    console.log(`[cu] ${r.q.binsInspected} bins inspected, ${r.q.fills.length} fills, ${r.q.pagesTouched.length} pages: ${r.cu} CU`);
    expect(r.cu).toBeLessThan(1_400_000);
  });
});

describe("second market and buybacks", () => {
  let otherMint: Keypair;
  let otherMarket: PublicKey;

  it("launches a non-POP market whose quote protocol fees are earmarked 50% for buybacks", async () => {
    otherMint = Keypair.generate();
    otherMarket = await createAndActivateMarket(trader, otherMint, { name: "Second", symbol: "SEC", seedBase: 1_000_000_000n * 1_000_000n, isPop: false });
    await ensureAta(admin, otherMint.publicKey);
    const r = await swap(admin, otherMarket, true, SOL / 10n);
    const v = await assertReconciled(admin, otherMarket);
    expect(v.state.buybackAccruedQuote).toBe(r.q.fees.protocolFee / 2n);
    expect(v.state.protocolClaimableQuote).toBe(r.q.fees.protocolFee - r.q.fees.protocolFee / 2n);
  });

  it("sweeps the earmark, rejects sweeping from POP, executes a bounded buyback and burns", async () => {
    const v = await view(admin, otherMarket);
    const earmark = v.state.buybackAccruedQuote;
    await send(trader, [await trader.client.sweepBuybackIx(otherMarket)]);
    const bbQuote = buybackQuoteAccountPda(admin.client.programId);
    expect(await tokenBalance(connection, bbQuote)).toBe(earmark);
    expect(await expectFail(trader, [await trader.client.sweepBuybackIx(popMarket)])).toContain("BuybackSourceExcluded");
    // execute buyback on POP with bounds
    const bb = buybackPda(admin.client.programId);
    await ensureAta(admin, popMint.publicKey, bb, true);
    const pv = await view(admin, popMarket);
    const q = admin.client.quote(pv, "buy", earmark, 0n, true);
    if (!q.ok) throw new Error(q.error);
    const supplyBefore = (await mintInfo(connection, popMint.publicKey)).supply;
    const maxPrice = admin.client.priceAt(pv, pv.state.cursor) * 2n;
    const sig = await send(admin, [await admin.client.executeBuybackIx(admin.pubkey, popMarket, popMint.publicKey, { quoteSpend: earmark, minPopOut: (q.output * 99n) / 100n, maxPriceX64: maxPrice }, admin.client.pagesForQuote(pv, q))]);
    const events = await admin.client.eventsForSignature(sig);
    const ev = events.find((e) => e.name === "buybackExecuted")!;
    expect(BigInt(ev.data.popBurned.toString())).toBe(q.output);
    expect((await mintInfo(connection, popMint.publicKey)).supply).toBe(supplyBefore - q.output);
    const after = await assertReconciled(admin, popMarket);
    expect(after.state.pairedQuoteLifetime).toBe(pv.state.pairedQuoteLifetime); // ineligible escrow never pairs
    let inel = 0n;
    for (const [, b] of after.store.entries()) inel += b.pendingQuoteIneligible;
    expect(inel).toBe(q.fees.scarFee);
    // unauthorized caller and over-cap are rejected
    expect(await expectFail(trader, [await trader.client.executeBuybackIx(trader.pubkey, popMarket, popMint.publicKey, { quoteSpend: 1n, minPopOut: 0n, maxPriceX64: maxPrice }, admin.client.pagesForQuote(pv, q))])).toContain("Unauthorized");
    expect(await expectFail(admin, [await admin.client.executeBuybackIx(admin.pubkey, popMarket, popMint.publicKey, { quoteSpend: 2n * SOL, minPopOut: 0n, maxPriceX64: maxPrice }, admin.client.pagesForQuote(pv, q))])).toContain("BuybackSpendCap");
  });

  it("launch toggle blocks new non-POP markets", async () => {
    await send(admin, [await admin.client.setLaunchesEnabledIx(admin.pubkey, false)]);
    const m = Keypair.generate();
    const t = await expectFail(trader, [await trader.client.createMarketIx(trader.pubkey, m.publicKey, { name: "Blocked", symbol: "BLK", uri: "x", seedBase: 1_000_000n, decimals: 6, isPopMarket: false })], [m]);
    expect(t).toContain("LaunchesDisabled");
    await send(admin, [await admin.client.setLaunchesEnabledIx(admin.pubkey, true)]);
    expect(await expectFail(trader, [await trader.client.setLaunchesEnabledIx(trader.pubkey, false)])).toContain("Unauthorized");
  });
});

describe("vesting", () => {
  it("founder allocation is locked before the cliff; ecosystem vests linearly from activation", async () => {
    await ensureAta(admin, popMint.publicKey);
    const t = await expectFail(admin, [await admin.client.claimVestedIx(admin.pubkey, popMarket, 0, popMint.publicKey)]);
    expect(t).toContain("NothingToClaim");
    const ata = getAssociatedTokenAddressSync(popMint.publicKey, admin.pubkey);
    const before = await tokenBalance(connection, ata);
    await send(admin, [await admin.client.claimVestedIx(admin.pubkey, popMarket, 1, popMint.publicKey)]);
    const got = (await tokenBalance(connection, ata)) - before;
    expect(got).toBeGreaterThan(0n);
    expect(got).toBeLessThan(ECOSYSTEM / 1000n); // seconds into a 36-month schedule
    const ves = await admin.client.fetchVesting(popMarket, 1);
    expect(BigInt(ves!.claimed.toString())).toBe(got);
    expect(await expectFail(trader, [await trader.client.claimVestedIx(trader.pubkey, popMarket, 1, popMint.publicKey)])).toContain("Unauthorized");
  });
});
