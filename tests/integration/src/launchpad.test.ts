/**
 * End-to-end tests against a local validator (scripts/reset-localnet.sh) with TEST thresholds.
 * Launchpad flow: protocol init, external POP mint published once, two coins launched by two
 * creators with different seeds (pages created lazily), swaps equal to SDK quotes, a trade that
 * creates the page it needs, per-market isolation, interrupted creation resumed without
 * duplicates, fee claims, graduation exactly once, buyback earmark/sweep/bounded withdrawal,
 * failure paths, and a compute measurement for a traversal-capped swap.
 */
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { Keypair, PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { NATIVE_MINT, createMint, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MARKET_ACCOUNT_SIZE, PopClient, TEST_SETTINGS, buybackQuoteAccountPda, marketPda, marketVaults, pagePda, type MarketView } from "@pop/sdk";
import { LAUNCH_PAGES, pageRange, reconcile, SOL } from "@pop/math";
import { chunk, computeUnits, connect, ensureAta, expectFail, makeActor, mintInfo, send, tokenBalance, wrapSol, type Actor } from "./harness.js";

let connection: Connection;
let admin: Actor; // protocol authority + buyback authority
let alice: Actor; // creator of coin A
let bob: Actor; // creator of coin B, trades on A
let treasury: Keypair;
let popMint: PublicKey; // external POP mint (simulated with a plain SPL mint)
let mintA: Keypair;
let marketA: PublicKey;
let mintB: Keypair;
let marketB: PublicKey;
const SUPPLY = 1_000_000_000n * 1_000_000n;
const graduatedEvents: string[] = [];
const perf: Record<string, unknown> = {};

const view = (actor: Actor, market: PublicKey) => actor.client.fetchMarket(market);
const deadline = async () => BigInt(await connection.getSlot("confirmed")) + 150n;

function maxFill(actor: Actor, v: MarketView, dir: "buy" | "sell", cap: bigint): bigint {
  let lo = dir === "buy" ? v.config.minQuoteIn : v.config.minBaseIn;
  let hi = cap;
  if (hi <= lo) return lo;
  if (actor.client.quote(v, dir, hi).ok) return hi;
  while (hi - lo > (dir === "buy" ? 100_000n : 1_000_000n)) {
    const mid = (lo + hi) / 2n;
    if (actor.client.quote(v, dir, mid).ok) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Swap via the SDK transaction builder (creates missing pages); assert the chain output equals the quote. */
async function swap(actor: Actor, market: PublicKey, isBuy: boolean, gross: bigint, opts: { minOutput?: bigint; slippageBps?: number } = {}) {
  const v = await view(actor, market);
  const q = actor.client.quote(v, isBuy ? "buy" : "sell", gross);
  if (!q.ok) throw new Error(`quote failed: ${q.error} ${q.detail}`);
  const route = actor.client.routePages(v, q);
  const minOutput = opts.minOutput ?? (q.output * BigInt(10_000 - (opts.slippageBps ?? 100))) / 10_000n;
  const tx = await actor.client.buildSwapTransaction(actor.pubkey, v, q, { isBuy, grossInput: gross, minOutput, deadlineSlot: await deadline() });
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
    expect(q1).toBe(q0);
  } else {
    expect(b0 - b1).toBe(gross);
    expect(q1 - q0).toBe(q.output);
  }
  for (const e of events) if (e.name === "graduated") graduatedEvents.push(sig);
  return { sig, q, events, route, cu: await computeUnits(connection, sig) };
}

/** Account sums must equal physical vault balances; missing pages contribute their unmaterialized seed. */
async function assertReconciled(actor: Actor, market: PublicKey) {
  const v = await view(actor, market);
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

/** The public launch path: create (1 sig) -> launch pages (1 sig) -> wrap + activate (1 sig). */
async function launch(creator: Actor, mint: Keypair, args: { name: string; symbol: string; seedQuote: bigint; pages?: number[] }) {
  const market = marketPda(creator.client.programId, mint.publicKey);
  await send(creator, [await creator.client.createMarketIx(creator.pubkey, mint.publicKey, { name: args.name, symbol: args.symbol, uri: "https://example.invalid/meta.json", seedBase: SUPPLY, seedQuote: args.seedQuote, decimals: 6 })], [mint]);
  const cfg = (await creator.client.fetchMarket(market, [])).config;
  const ixs = await creator.client.initializePagesIxs(creator.pubkey, market, cfg, args.pages ?? PopClient.launchPages());
  for (const batch of chunk(ixs, 6)) await send(creator, batch);
  await wrapSol(creator, args.seedQuote);
  await send(creator, [await creator.client.activateMarketIx(creator.pubkey, market, mint.publicKey)]);
  return market;
}

beforeAll(async () => {
  connection = await connect();
  admin = await makeActor(connection, 100);
  alice = await makeActor(connection, 100);
  bob = await makeActor(connection, 100);
  treasury = Keypair.generate();
  popMint = await createMint(connection, admin.keypair, admin.pubkey, null, 6);
  mintA = Keypair.generate();
  mintB = Keypair.generate();
});

describe("protocol", () => {
  it("initializes with TEST settings and publishes the external POP mint exactly once", async () => {
    await send(admin, [await admin.client.initializeProtocolIx(admin.pubkey, { authority: admin.pubkey, protocolFeeRecipient: treasury.publicKey, buybackAuthority: admin.pubkey, settings: TEST_SETTINGS, buybackMinIntervalSlots: 1n, buybackMaxWithdrawPerExecution: SOL / 2n, launchesEnabled: true })]);
    const cfg = await admin.client.fetchProtocol();
    expect(cfg.popMint.equals(PublicKey.default)).toBe(true);
    expect(BigInt(cfg.settings.minSeedQuote.toString())).toBe(1n * SOL);
    expect(await expectFail(bob, [await bob.client.setPopMintIx(bob.pubkey, popMint)])).toContain("Unauthorized");
    await send(admin, [await admin.client.setPopMintIx(admin.pubkey, popMint)]);
    expect((await admin.client.fetchProtocol()).popMint.equals(popMint)).toBe(true);
    expect(await expectFail(admin, [await admin.client.setPopMintIx(admin.pubkey, popMint)])).toContain("PopMintAlreadySet");
  });
});

describe("launches", () => {
  it("rejects a seed below the factory minimum", async () => {
    const m = Keypair.generate();
    const t = await expectFail(alice, [await alice.client.createMarketIx(alice.pubkey, m.publicKey, { name: "Tiny", symbol: "TINY", uri: "https://x", seedBase: SUPPLY, seedQuote: SOL / 2n, decimals: 6 })], [m]);
    expect(t).toContain("SeedQuoteBelowMinimum");
  });

  it("launches coin A (1 SOL seed, launch pages only); mint authority revoked at creation", async () => {
    marketA = await launch(alice, mintA, { name: "Alpha Coin", symbol: "ALPHA", seedQuote: 1n * SOL });
    const mi = await mintInfo(connection, mintA.publicKey);
    expect(mi.mintAuthority).toBeNull();
    expect(mi.freezeAuthority).toBeNull();
    expect(mi.supply).toBe(SUPPLY);
    const v = await assertReconciled(alice, marketA);
    expect(v.state.status).toBe("active");
    expect((await connection.getAccountInfo(marketA))!.data.length).toBe(MARKET_ACCOUNT_SIZE);
    const { minPage, maxPage } = pageRange(v.config);
    expect(v.missingPages.length).toBe(maxPage - minPage + 1 - LAUNCH_PAGES.length);
    expect(v.state.unmaterializedSeedBase > 0n).toBe(true);
    expect(v.raw.creator.equals(alice.pubkey)).toBe(true);
  });

  it("launches coin B (2 SOL seed) by a different creator", async () => {
    marketB = await launch(bob, mintB, { name: "Beta Coin", symbol: "BETA", seedQuote: 2n * SOL });
    const v = await assertReconciled(bob, marketB);
    expect(v.config.seedQuote).toBe(2n * SOL);
    expect(v.p0X64).not.toBe((await view(alice, marketA)).p0X64);
  });

  it("a trade whose route crosses an uninitialized page creates it in the same transaction (trader pays rent)", async () => {
    const v = await view(bob, marketA);
    // ~20 bins at 1 SOL seed runs from page 0 into page 1... launch pages cover -1..2, so push past bin 47
    const gross = maxFill(bob, v, "buy", SOL / 4n);
    const q = bob.client.quote(v, "buy", gross);
    if (!q.ok) throw new Error(q.error);
    const route = bob.client.routePages(v, q);
    const strict = bob.client.quote(v, "buy", gross, 0n, { virtualPages: false });
    if (route.toCreate.length === 0) {
      // not enough to leave the launch pages at this seed; make sure the strict quote agrees
      expect(strict.ok).toBe(true);
    } else {
      expect(strict.ok).toBe(false);
      if (!strict.ok) expect(strict.error).toBe("PageNotInitialized");
    }
    const lamportsBefore = await connection.getBalance(bob.pubkey);
    const r = await swap(bob, marketA, true, gross);
    expect(r.route.toCreate).toEqual(route.toCreate);
    for (const p of route.toCreate) expect(await bob.client.fetchPage(marketA, p)).not.toBeNull();
    const rent = await bob.client.pageRentLamports();
    const spent = lamportsBefore - (await connection.getBalance(bob.pubkey));
    expect(spent >= Number(gross) + rent * route.toCreate.length).toBe(true);
    const after = await assertReconciled(bob, marketA);
    expect(after.missingPages.length).toBe(v.missingPages.length - route.toCreate.length);
  });

  it("sell on A forms scars; B is untouched (isolation)", async () => {
    const bBefore = await view(bob, marketB);
    const held = await tokenBalance(connection, getAssociatedTokenAddressSync(mintA.publicKey, bob.pubkey));
    const r = await swap(bob, marketA, false, maxFill(bob, await view(bob, marketA), "sell", held / 2n));
    expect(r.events.filter((e) => e.name === "scarFormed").length).toBeGreaterThan(0);
    const a = await assertReconciled(bob, marketA);
    expect(a.state.pairedQuoteLifetime > 0n).toBe(true);
    expect(a.state.creatorClaimableQuote > 0n).toBe(true);
    const bAfter = await assertReconciled(bob, marketB);
    expect(bAfter.state.pairedQuoteLifetime).toBe(bBefore.state.pairedQuoteLifetime);
    expect(bAfter.state.swapCount).toBe(bBefore.state.swapCount);
    expect(bAfter.state.creatorClaimableQuote).toBe(0n);
    expect(bAfter.state.buybackAccruedQuote).toBe(0n);
    expect(await tokenBalance(connection, marketVaults(bob.client.programId, marketB).quoteVault)).toBe(2n * SOL);
  });

  it("resumes an interrupted creation without duplicates", async () => {
    const mint = Keypair.generate();
    const market = marketPda(alice.client.programId, mint.publicKey);
    // step 1: create, then "crash" after initializing only page 0
    await send(alice, [await alice.client.createMarketIx(alice.pubkey, mint.publicKey, { name: "Gamma", symbol: "GAMMA", uri: "https://x", seedBase: SUPPLY, seedQuote: 1n * SOL, decimals: 6 })], [mint]);
    await send(alice, [await alice.client.initializeBinPageIx(alice.pubkey, market, 0)]);
    // a second create_market with the same mint fails (mint account already exists)
    expect((await expectFail(alice, [await alice.client.createMarketIx(alice.pubkey, mint.publicKey, { name: "Gamma", symbol: "GAMMA", uri: "https://x", seedBase: SUPPLY, seedQuote: 1n * SOL, decimals: 6 })], [mint])).length).toBeGreaterThan(0);
    // resume: rediscover by creator, skip existing pages
    const mine = await alice.client.fetchMarketsByCreator(alice.pubkey);
    const found = mine.find((m) => m.publicKey.equals(market));
    expect(found).toBeDefined();
    expect(found!.account.status).toBe(0);
    const v = await alice.client.fetchMarket(market, PopClient.launchPages());
    const existing = new Set(PopClient.launchPages().filter((p) => !v.missingPages.includes(p)));
    expect(existing.has(0)).toBe(true);
    const ixs = await alice.client.initializePagesIxs(alice.pubkey, market, v.config, PopClient.launchPages(), existing);
    expect(ixs.length).toBe(PopClient.launchPages().length - 1);
    await send(alice, ixs);
    expect((await expectFail(alice, [await alice.client.initializeBinPageIx(alice.pubkey, market, 0)])).length).toBeGreaterThan(0); // already in use
    await wrapSol(alice, 1n * SOL);
    await send(alice, [await alice.client.activateMarketIx(alice.pubkey, market, mint.publicKey)]);
    expect(await expectFail(alice, [await alice.client.activateMarketIx(alice.pubkey, market, mint.publicKey)])).toContain("MarketAlreadyActive");
    const after = await assertReconciled(alice, market);
    expect(after.state.status).toBe("active");
    expect(after.state.unmaterializedSeedBase).toBe(SUPPLY - 3n * (SUPPLY / 512n) * 16n);
  });
});

describe("swap failure paths", () => {
  it("enforces min_output, deadline, config version and page provision; failed swaps move nothing", async () => {
    const v = await view(bob, marketA);
    const vaults = marketVaults(bob.client.programId, marketA);
    const before = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    const gross = SOL / 100n;
    const q = bob.client.quote(v, "buy", gross);
    if (!q.ok) throw new Error(q.error);
    await wrapSol(bob, gross);
    const pages = bob.client.routePages(v, q).pages;
    const base = { isBuy: true, grossInput: gross, minOutput: 0n, deadlineSlot: await deadline() };
    expect(await expectFail(bob, [await bob.client.swapIx(bob.pubkey, v, { ...base, minOutput: q.output + 1n }, pages)])).toContain("OutputBelowMinimum");
    expect(await expectFail(bob, [await bob.client.swapIx(bob.pubkey, v, { ...base, deadlineSlot: 1n }, pages)])).toContain("DeadlinePassed");
    expect(await expectFail(bob, [await bob.client.swapIx(bob.pubkey, v, { ...base, expectedConfigVersion: 99 }, pages)])).toContain("ConfigVersionMismatch");
    expect(await expectFail(bob, [await bob.client.swapIx(bob.pubkey, v, base, [])])).toContain("PageNotProvided");
    const foreign = await ensureAta(bob, mintA.publicKey, treasury.publicKey);
    const ix = await bob.client.swapIx(bob.pubkey, v, base, pages);
    const tampered = ix.keys.map((k) => (k.pubkey.equals(vaults.baseVault) ? { ...k, pubkey: foreign } : k));
    expect(await expectFail(bob, [{ ...ix, keys: tampered } as typeof ix])).toContain("InvalidVault");
    // page of market B passed to market A
    const bogus = pagePda(bob.client.programId, marketB, 0);
    expect((await expectFail(bob, [await bob.client.swapIx(bob.pubkey, v, base, [bogus])])).length).toBeGreaterThan(0);
    const after = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    expect(after).toEqual(before);
  });

  it("match_bins is idempotent and evaluate_graduation does nothing early", async () => {
    const v0 = await view(bob, marketA);
    const ixs = [];
    for (const p of PopClient.launchPages()) ixs.push(await bob.client.matchBinsIx(marketA, p));
    await send(bob, ixs);
    await send(bob, [await bob.client.evaluateGraduationIx(marketA)]);
    const v1 = await assertReconciled(bob, marketA);
    expect(v1.state.pairedQuoteLifetime).toBe(v0.state.pairedQuoteLifetime);
    expect(v1.state.status).toBe("active");
  });
});

describe("fee claims", () => {
  it("creator and protocol claims only move claimable balances; locked vaults unchanged; wrong destination rejected", async () => {
    const v = await view(alice, marketA);
    const vaults = marketVaults(alice.client.programId, marketA);
    const lockedBefore = [await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)];
    const treasuryAta = await ensureAta(admin, NATIVE_MINT, treasury.publicKey);
    const aliceAta = await ensureAta(alice, NATIVE_MINT, alice.pubkey);
    const a0 = await tokenBalance(connection, aliceAta);
    await send(bob, [await bob.client.claimFeesIx(marketA, 0, "quote", treasury.publicKey, mintA.publicKey)]);
    await send(bob, [await bob.client.claimFeesIx(marketA, 1, "quote", alice.pubkey, mintA.publicKey)]);
    expect(await tokenBalance(connection, treasuryAta)).toBe(v.state.protocolClaimableQuote);
    expect((await tokenBalance(connection, aliceAta)) - a0).toBe(v.state.creatorClaimableQuote);
    // bob (not the creator) cannot redirect creator fees
    expect(await expectFail(bob, [await bob.client.claimFeesIx(marketA, 1, "quote", bob.pubkey, mintA.publicKey)])).toContain("InvalidClaimDestination");
    expect(await expectFail(bob, [await bob.client.claimFeesIx(marketA, 1, "quote", alice.pubkey, mintA.publicKey)])).toContain("NothingToClaim");
    const after = await assertReconciled(alice, marketA);
    expect(after.state.creatorClaimableQuote).toBe(0n);
    expect([await tokenBalance(connection, vaults.baseVault), await tokenBalance(connection, vaults.quoteVault)]).toEqual(lockedBefore);
  });
});

describe("buyback escrow", () => {
  it("every market earmarks 50% of quote protocol fees; sweep is permissionless; withdrawal is bounded and lands only in the authority's WSOL ATA", async () => {
    const r = await swap(alice, marketB, true, SOL / 20n);
    const vB = await view(alice, marketB);
    expect(vB.state.buybackAccruedQuote).toBe(r.q.fees.protocolFee / 2n);
    const escrow = buybackQuoteAccountPda(admin.client.programId);
    const e0 = await tokenBalance(connection, escrow);
    await send(bob, [await bob.client.sweepBuybackIx(marketB)]);
    const vA = await view(alice, marketA);
    if (vA.state.buybackAccruedQuote > 0n) await send(bob, [await bob.client.sweepBuybackIx(marketA)]);
    const e1 = await tokenBalance(connection, escrow);
    expect(e1 - e0).toBe(vB.state.buybackAccruedQuote + vA.state.buybackAccruedQuote);
    expect(await expectFail(bob, [await bob.client.sweepBuybackIx(marketB)])).toContain("NothingToClaim");
    // withdrawal
    const authAta = await ensureAta(admin, NATIVE_MINT, admin.pubkey);
    const a0 = await tokenBalance(connection, authAta);
    expect(await expectFail(bob, [await bob.client.withdrawBuybackIx(bob.pubkey, 1n)])).toContain("Unauthorized");
    expect(await expectFail(admin, [await admin.client.withdrawBuybackIx(admin.pubkey, SOL)])).toContain("BuybackWithdrawCap");
    const amount = e1 / 2n;
    const ix = await admin.client.withdrawBuybackIx(admin.pubkey, amount);
    // destination substituted with bob's ATA: associated-token constraint fails
    const bobAta = await ensureAta(bob, NATIVE_MINT, bob.pubkey);
    const tampered = ix.keys.map((k) => (k.pubkey.equals(authAta) ? { ...k, pubkey: bobAta } : k));
    expect((await expectFail(admin, [{ ...ix, keys: tampered } as typeof ix])).length).toBeGreaterThan(0);
    const sig = await send(admin, [ix]);
    expect((await tokenBalance(connection, authAta)) - a0).toBe(amount);
    const ev = (await admin.client.eventsForSignature(sig)).find((e) => e.name === "buybackWithdrawn")!;
    expect(ev).toBeDefined();
    expect((ev.data.popMint as PublicKey).equals(popMint)).toBe(true);
    const bb = await admin.client.fetchBuybackVault();
    expect(BigInt(bb.totalWithdrawn.toString())).toBe(amount);
    expect(BigInt(bb.totalReceived.toString())).toBe(e1);
  });
});

describe("graduation under TEST thresholds", () => {
  it("graduates exactly once and keeps trading with identical fees", async () => {
    let worst = 0;
    const baseAta = getAssociatedTokenAddressSync(mintA.publicKey, bob.pubkey);
    for (let i = 0; i < 120; i++) {
      const b = await swap(bob, marketA, true, maxFill(bob, await view(bob, marketA), "buy", SOL / 5n));
      worst = Math.max(worst, b.cu);
      const held = await tokenBalance(connection, baseAta);
      const s = await swap(bob, marketA, false, maxFill(bob, await view(bob, marketA), "sell", held));
      worst = Math.max(worst, s.cu);
      if ((await view(bob, marketA)).state.status === "graduated") break;
    }
    const v = await assertReconciled(bob, marketA);
    expect(v.state.status).toBe("graduated");
    expect(graduatedEvents.length).toBe(1);
    const size = maxFill(bob, await view(bob, marketA), "buy", SOL / 10n);
    const after = await swap(bob, marketA, true, size);
    expect(after.q.fees.scarFee).toBe((size * 150n) / 10_000n);
    expect(after.events.filter((e) => e.name === "graduated").length).toBe(0);
    perf.worstChopSwapCu = worst;
  });

  it("measures compute for a traversal-capped buy", async () => {
    const v = await view(bob, marketA);
    const lo = maxFill(bob, v, "buy", 50n * SOL);
    const r = await swap(bob, marketA, true, lo, { slippageBps: 50 });
    perf.cappedBuy = { binsInspected: r.q.binsInspected, fills: r.q.fills.length, pages: r.q.pagesTouched.length, pagesCreated: r.route.toCreate.length, computeUnits: r.cu, grossLamports: lo.toString() };
    writeFileSync(new URL("../compute.json", import.meta.url), JSON.stringify(perf, null, 2));
    expect(r.cu).toBeLessThan(1_400_000);
  });

  it("launch toggle blocks new markets", async () => {
    await send(admin, [await admin.client.setLaunchesEnabledIx(admin.pubkey, false)]);
    const m = Keypair.generate();
    expect(await expectFail(bob, [await bob.client.createMarketIx(bob.pubkey, m.publicKey, { name: "Blocked", symbol: "BLK", uri: "x", seedBase: SUPPLY, seedQuote: SOL, decimals: 6 })], [m])).toContain("LaunchesDisabled");
    await send(admin, [await admin.client.setLaunchesEnabledIx(admin.pubkey, true)]);
    expect(await expectFail(bob, [await bob.client.setLaunchesEnabledIx(bob.pubkey, false)])).toContain("Unauthorized");
  });
});
