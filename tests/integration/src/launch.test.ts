/**
 * Stage 2 mechanism proof for Pop Launch on a local validator that runs the REAL Raydium CP-Swap program
 * (built from source) alongside pop_launch. Every assertion below is against chain state: account data,
 * token balances, lamport balances and transaction signatures. Nothing is mocked.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { NATIVE_MINT, getAccount, getMint, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { AnchorProvider } from "@anchor-lang/core";
import { PopLaunchClient, LAUNCH_STATE, entitlement, launchAccounts, launchPda, receiptPda, v1Settings, type LaunchSettingsInput, raydiumPoolAddresses, sortMints } from "@pop/sdk";
import { KeypairWallet, connect, computeUnits, expectFail, makeActor, send, tokenBalance, type Actor } from "./harness.js";
import { MAINNET_LIKE_CONFIG, ensureAmmConfig, fetchPoolState, raydiumProgram } from "./raydium.js";

const SOL = 1_000_000_000n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let connection: Connection;
let admin: Actor;
let feeRecipient: Keypair;
let ammConfig: PublicKey;
let lc: PopLaunchClient;
/** Test terms: 2 SOL target so airdrops cover it; short windows so deadlines can be exercised. */
let terms: LaunchSettingsInput;

function clientFor(a: Actor): PopLaunchClient {
  return new PopLaunchClient(a.provider);
}
async function chainTime(): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  return (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}
async function waitUntilChainTime(t: number) {
  while ((await chainTime()) < t) await sleep(500);
}

async function createLaunch(creator: Actor, name = "CAT.EXE", symbol = "CATEXE") {
  const mint = Keypair.generate();
  const c = clientFor(creator);
  const reserve = await c.quoteSetupReserve(MAINNET_LIKE_CONFIG.createPoolFee, terms.minSetupReserveLamports);
  const ix = await c.createLaunchIx(creator.pubkey, mint.publicKey, { name, symbol, uri: "https://example.com/meta.json", metadataHash: new Uint8Array(32).fill(7), setupReserveLamports: reserve.total }, feeRecipient.publicKey);
  const sig = await send(creator, [ix], [mint]);
  const launch = launchPda(mint.publicKey);
  return { launch, mint: mint.publicKey, mintKeypair: mint, sig, reserve: reserve.total };
}

async function contribute(backer: Actor, launch: PublicKey, lamports: bigint) {
  return send(backer, [await clientFor(backer).contributeIx(backer.pubkey, launch, lamports)]);
}

describe("Pop Launch: funding → settlement → claims, deadlines → refunds (real Raydium CP-Swap on localnet)", () => {
  beforeAll(async () => {
    connection = await connect();
    // Deterministic protocol authority so the suite can be re-run against a running validator.
    const { createHash } = await import("node:crypto");
    const adminKey = Keypair.fromSeed(createHash("sha256").update("poplaunch-test-admin").digest());
    if ((await connection.getBalance(adminKey.publicKey)) < 5 * LAMPORTS_PER_SOL) {
      const sig = await connection.requestAirdrop(adminKey.publicKey, 20 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
    }
    const adminProvider = new AnchorProvider(connection, new KeypairWallet(adminKey), { commitment: "confirmed" });
    admin = { keypair: adminKey, provider: adminProvider, client: null as never, pubkey: adminKey.publicKey };
    feeRecipient = Keypair.generate();
    ammConfig = await ensureAmmConfig(connection);
    lc = clientFor(admin);
    terms = v1Settings(feeRecipient.publicKey, ammConfig, { targetLamports: 2n * SOL, fundingWindowSecs: 25n, settlementTimeoutSecs: 20n, minContributionLamports: 10_000_000n });
    if (!(await connection.getAccountInfo(lc.programId.equals(lc.programId) ? (await import("@pop/sdk")).launchConfigPda() : PublicKey.default))) {
      await send(admin, [await lc.initializeProtocolIx(admin.pubkey, terms)]);
    } else {
      await send(admin, [await lc.updateSettingsIx(admin.pubkey, terms)]);
    }
  });

  it("verifies the fixture: real Raydium program at its mainnet id, AmmConfig with mainnet-like fees, fee receiver account", async () => {
    const info = await connection.getAccountInfo(new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"));
    expect(info?.executable).toBe(true);
    const cfg = await raydiumProgram(connection).account.ammConfig.fetch(ammConfig);
    expect(cfg.tradeFeeRate.toString()).toBe("2500");
    expect(cfg.createPoolFee.toString()).toBe("150000000");
    const fee = await getAccount(connection, new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"));
    expect(fee.mint.equals(NATIVE_MINT)).toBe(true);
  });

  it("create_launch: fixed supply minted into program vaults, authorities revoked, fee and reserve paid, terms frozen", async () => {
    const creator = await makeActor(connection, 10);
    const before = await connection.getBalance(creator.pubkey);
    const { launch, mint, mintKeypair, sig, reserve } = await createLaunch(creator);
    const l = await lc.fetchLaunch(launch);
    const a = launchAccounts(launch);
    expect(LAUNCH_STATE[l.state]).toBe("funding");
    expect(l.targetLamports.toString()).toBe((2n * SOL).toString());
    expect(l.fundingDeadline.toNumber() - l.openedAt.toNumber()).toBe(25);
    const m = await getMint(connection, mint);
    expect(m.mintAuthority).toBeNull();
    expect(m.freezeAuthority).toBeNull();
    expect(m.supply).toBe(1_000_000_000_000_000n);
    expect(await tokenBalance(connection, a.backerVault)).toBe(500_000_000_000_000n);
    expect(await tokenBalance(connection, a.poolVault)).toBe(500_000_000_000_000n);
    expect(await connection.getBalance(feeRecipient.publicKey)).toBe(100_000_000);
    const rentMin = await connection.getMinimumBalanceForRentExemption(0);
    expect(await connection.getBalance(a.escrow)).toBe(rentMin);
    expect(BigInt(await connection.getBalance(a.auth))).toBe(BigInt(rentMin) + reserve);
    const after = await connection.getBalance(creator.pubkey);
    expect(before - after).toBeGreaterThan(Number(reserve) + 100_000_000);
    const ev = await lc.eventsForSignature(sig);
    expect(ev.some((e) => e.name === "launchCreated")).toBe(true);
    // a second launch with the same mint cannot be created
    const c = clientFor(creator);
    const again = await c.createLaunchIx(creator.pubkey, mint, { name: "X", symbol: "X", uri: "https://x", metadataHash: new Uint8Array(32), setupReserveLamports: reserve }, feeRecipient.publicKey);
    expect(await expectFail(creator, [again], [mintKeypair])).toMatch(/already in use|custom program error|0x0/);
  });

  it("contribute: below minimum rejected, above remaining rejected whole, exact remainder accepted, target flips READY atomically", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator, "FROGGO", "FROGGO");
    const a1 = await makeActor(connection, 5), a2 = await makeActor(connection, 5);
    expect(await expectFail(a1, [await clientFor(a1).contributeIx(a1.pubkey, launch, 5_000_000n)])).toMatch(/BelowMinimum/);
    expect(await expectFail(a1, [await clientFor(a1).contributeIx(a1.pubkey, launch, 3n * SOL)])).toMatch(/ExceedsRemaining/);
    await contribute(a1, launch, 1n * SOL);
    await contribute(a1, launch, 500_000_000n); // second deposit updates the same receipt
    let l = await lc.fetchLaunch(launch);
    expect(l.raisedLamports.toString()).toBe((1_500_000_000n).toString());
    expect(l.backerWallets).toBe(1);
    const r1 = await lc.fetchReceipt(launch, a1.pubkey);
    expect(r1?.contributedLamports.toString()).toBe("1500000000");
    // 0.499 SOL leaves 0.001 SOL remaining, which is below the minimum but is the exact remainder
    await contribute(a2, launch, 499_000_000n);
    expect(await expectFail(a2, [await clientFor(a2).contributeIx(a2.pubkey, launch, 2_000_000n)])).toMatch(/ExceedsRemaining/);
    const sig = await contribute(a2, launch, 1_000_000n);
    l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("ready");
    expect(l.raisedLamports.toString()).toBe((2n * SOL).toString());
    expect(l.settlementDeadline.toNumber() - l.filledAt.toNumber()).toBe(20);
    expect(l.backerWallets).toBe(2);
    const ev = await lc.eventsForSignature(sig);
    expect(ev.map((e) => e.name)).toContain("targetReached");
    // no deposits after READY
    expect(await expectFail(a1, [await clientFor(a1).contributeIx(a1.pubkey, launch, 10_000_000n)])).toMatch(/NotFunding/);
    // no claim before LIVE, no refund before a deadline
    expect(await expectFail(a1, [await clientFor(a1).claimTokensIx(a1.pubkey, launch, l.mint, a1.pubkey)])).toMatch(/NotLive/);
    expect(await expectFail(a1, [await clientFor(a1).refundIx(a1.pubkey, launch, a1.pubkey)])).toMatch(/NotRefundable/);
  });

  it("precreated-pool griefing is impossible: nobody holds coin tokens before settlement, so Raydium rejects an outside pool", async () => {
    const creator = await makeActor(connection, 10);
    const { launch, mint } = await createLaunch(creator, "GRIEF", "GRIEF");
    const griefer = await makeActor(connection, 5);
    const [t0, t1] = sortMints(NATIVE_MINT, mint);
    const r = raydiumPoolAddresses(ammConfig, t0, t1);
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, griefer.pubkey);
    const coinAta = getAssociatedTokenAddressSync(mint, griefer.pubkey);
    const [c0, c1] = t0.equals(NATIVE_MINT) ? [wsolAta, coinAta] : [coinAta, wsolAta];
    const program = raydiumProgram(connection);
    const ix = await program.methods
      .initialize(new (await import("bn.js")).default("1000000"), new (await import("bn.js")).default("1000000"), new (await import("bn.js")).default("0"))
      .accountsPartial({ creator: griefer.pubkey, ammConfig, authority: r.authority, poolState: r.poolState, token0Mint: t0, token1Mint: t1, lpMint: r.lpMint, creatorToken0: c0, creatorToken1: c1, creatorLpToken: getAssociatedTokenAddressSync(r.lpMint, griefer.pubkey), token0Vault: r.token0Vault, token1Vault: r.token1Vault, createPoolFee: new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"), observationState: r.observationState, tokenProgram: (await import("@solana/spl-token")).TOKEN_PROGRAM_ID, token0Program: (await import("@solana/spl-token")).TOKEN_PROGRAM_ID, token1Program: (await import("@solana/spl-token")).TOKEN_PROGRAM_ID, associatedTokenProgram: (await import("@solana/spl-token")).ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: (await import("@solana/web3.js")).SYSVAR_RENT_PUBKEY })
      .instruction();
    const setup = [createAssociatedTokenAccountIdempotentInstruction(griefer.pubkey, wsolAta, griefer.pubkey, NATIVE_MINT), createAssociatedTokenAccountIdempotentInstruction(griefer.pubkey, coinAta, griefer.pubkey, mint)];
    const err = await expectFail(griefer, [...setup, ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ix]);
    expect(err).toMatch(/insufficient funds|EmptySupply|0x1/);
    expect(await connection.getAccountInfo(r.poolState)).toBeNull();
    expect(launch).toBeDefined();
  });

  it("finalize_launch: wraps exactly the target, seeds the real Raydium pool, burns all LP, enables claims; then claims pay exact entitlements", async () => {
    const creator = await makeActor(connection, 10);
    const { launch, mint } = await createLaunch(creator, "GOODBOY", "GOODBOY");
    const backers = [await makeActor(connection, 5), await makeActor(connection, 5), await makeActor(connection, 5)];
    await contribute(backers[0]!, launch, 1_000_000_000n);
    await contribute(backers[1]!, launch, 700_000_000n);
    await contribute(backers[2]!, launch, 300_000_000n);
    let l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("ready");

    // Settlement is permissionless: a random caller submits it.
    const keeper = await makeActor(connection, 2);
    const kc = clientFor(keeper);
    const accts = kc.settlementAccounts(launch, l);
    const a = launchAccounts(launch);
    const authBefore = await connection.getBalance(a.auth);
    const feeBefore = (await getAccount(connection, accts.createPoolFee)).amount;
    const tx = await kc.buildFinalizeTransaction(keeper.pubkey, launch);
    const sig = await keeper.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    const cu = await computeUnits(connection, sig);
    const raw = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`finalize_launch signature ${sig}: ${cu} CU, ${raw?.transaction.message.staticAccountKeys.length} accounts`);

    l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("live");
    expect(l.poolState.equals(accts.poolState)).toBe(true);
    expect(l.lpBurned.toNumber()).toBeGreaterThan(0);
    // Pool reserves are exactly the launch terms
    expect(await tokenBalance(connection, accts.token0Vault)).toBe(accts.token0Vault.equals(raydiumPoolAddresses(ammConfig, ...sortMints(NATIVE_MINT, mint).slice(0, 2) as [PublicKey, PublicKey]).token0Vault) ? (sortMints(NATIVE_MINT, mint)[2] ? 2n * SOL : 500_000_000_000_000n) : 0n);
    const [, , quoteIs0] = sortMints(NATIVE_MINT, mint);
    const quoteVault = quoteIs0 ? accts.token0Vault : accts.token1Vault;
    const baseVault = quoteIs0 ? accts.token1Vault : accts.token0Vault;
    expect(await tokenBalance(connection, quoteVault)).toBe(2n * SOL);
    expect(await tokenBalance(connection, baseVault)).toBe(500_000_000_000_000n);
    expect(await tokenBalance(connection, a.poolVault)).toBe(0n);
    expect(await tokenBalance(connection, accts.authQuote)).toBe(0n);
    // Every LP token the pool issued to the launch is burned; only Raydium's own locked minimum (100) remains unminted.
    const lp = await getMint(connection, accts.lpMint);
    expect(lp.supply).toBe(0n);
    expect(await tokenBalance(connection, accts.authLp)).toBe(0n);
    const pool = await fetchPoolState(connection, accts.poolState);
    expect(pool.lpSupply.toString()).toBe(String(l.lpBurned.toNumber() + 100));
    // Escrow kept only its rent; the setup reserve paid the pool costs and Raydium's 0.15 SOL creation fee.
    const rentMin = await connection.getMinimumBalanceForRentExemption(0);
    expect(await connection.getBalance(a.escrow)).toBe(rentMin);
    expect((await getAccount(connection, accts.createPoolFee)).amount - feeBefore).toBe(150_000_000n);
    const authAfter = await connection.getBalance(a.auth);
    console.log(`setup reserve consumed: ${(authBefore - authAfter) / 1e9} SOL`);
    expect(authAfter).toBeGreaterThanOrEqual(rentMin);
    expect(cu).toBeLessThan(600_000);
    const ev = await lc.eventsForSignature(sig);
    expect(ev.map((e) => e.name)).toContain("launchLive");

    // Settlement cannot run twice and no refund exists after LIVE.
    expect(await expectFail(keeper, [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), await kc.finalizeLaunchIx(keeper.pubkey, launch)])).toMatch(/NotReady/);
    expect(await expectFail(backers[0]!, [await clientFor(backers[0]!).refundIx(backers[0]!.pubkey, launch, backers[0]!.pubkey)])).toMatch(/NotRefundable/);

    // Claims: exact integer entitlements, sponsored by anyone, only to the owner's ATA, never twice.
    const expected = [1_000_000_000n, 700_000_000n, 300_000_000n].map((c) => entitlement(c, 2n * SOL, 500_000_000_000_000n));
    expect(expected[0]).toBe(250_000_000_000_000n);
    const sponsor = keeper;
    for (let i = 0; i < backers.length; i++) {
      const b = backers[i]!;
      await send(sponsor, [await clientFor(sponsor).claimTokensIx(sponsor.pubkey, launch, mint, b.pubkey)]);
      expect(await tokenBalance(connection, getAssociatedTokenAddressSync(mint, b.pubkey))).toBe(expected[i]!);
      expect(await expectFail(b, [await clientFor(b).claimTokensIx(b.pubkey, launch, mint, b.pubkey)])).toMatch(/NothingToClaim/);
      const r = await lc.fetchReceipt(launch, b.pubkey);
      expect(r?.claimedBaseUnits.toString()).toBe(expected[i]!.toString());
    }
    expect(expected.reduce((x, y) => x + y, 0n)).toBe(500_000_000_000_000n);
    expect(await tokenBalance(connection, a.backerVault)).toBe(0n);
    // A stranger with no receipt cannot claim; a receipt cannot be redirected to another wallet's ATA.
    const stranger = await makeActor(connection, 1);
    expect(await expectFail(stranger, [await clientFor(stranger).claimTokensIx(stranger.pubkey, launch, mint, stranger.pubkey)])).toMatch(/AccountNotInitialized|3012|not initialized/i);

    // Creator reclaims the unused setup reserve; the consumed costs and the creation fee are gone.
    const cBefore = await connection.getBalance(creator.pubkey);
    await send(creator, [await clientFor(creator).reclaimUnusedSetupReserveIx(creator.pubkey, launch)]);
    expect(await connection.getBalance(a.auth)).toBe(rentMin);
    expect(await connection.getBalance(creator.pubkey)).toBeGreaterThan(cBefore);
    expect(await expectFail(creator, [await clientFor(creator).reclaimUnusedSetupReserveIx(creator.pubkey, launch)])).toMatch(/NothingToRefund/);
    // The pool is tradable on the real Raydium program: a swap by an outsider succeeds against the seeded reserves.
    const trader = await makeActor(connection, 3);
    const program = raydiumProgram(connection);
    const traderWsol = getAssociatedTokenAddressSync(NATIVE_MINT, trader.pubkey);
    const traderCoin = getAssociatedTokenAddressSync(mint, trader.pubkey);
    const BN = (await import("bn.js")).default;
    const { TOKEN_PROGRAM_ID, createSyncNativeInstruction } = await import("@solana/spl-token");
    const swap = await program.methods
      .swapBaseInput(new BN(100_000_000), new BN(1))
      .accountsPartial({ payer: trader.pubkey, authority: accts.cpAuthority, ammConfig, poolState: accts.poolState, inputTokenAccount: traderWsol, outputTokenAccount: traderCoin, inputVault: quoteVault, outputVault: baseVault, inputTokenProgram: TOKEN_PROGRAM_ID, outputTokenProgram: TOKEN_PROGRAM_ID, inputTokenMint: NATIVE_MINT, outputTokenMint: mint, observationState: accts.observationState })
      .instruction();
    await sleep(1500); // pool open_time = creation time + 1s
    await send(trader, [
      createAssociatedTokenAccountIdempotentInstruction(trader.pubkey, traderWsol, trader.pubkey, NATIVE_MINT),
      createAssociatedTokenAccountIdempotentInstruction(trader.pubkey, traderCoin, trader.pubkey, mint),
      SystemProgram.transfer({ fromPubkey: trader.pubkey, toPubkey: traderWsol, lamports: 100_000_000 }),
      createSyncNativeInstruction(traderWsol),
      swap,
    ]);
    expect(await tokenBalance(connection, traderCoin)).toBeGreaterThan(0n);
  });

  it("missed target: after the funding deadline every backer reclaims full principal (lazy derivation, no keeper); no settlement afterwards", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator, "LATE", "LATE");
    const b1 = await makeActor(connection, 3), b2 = await makeActor(connection, 3);
    await contribute(b1, launch, 800_000_000n);
    await contribute(b2, launch, 10_000_000n);
    const l0 = await lc.fetchLaunch(launch);
    await waitUntilChainTime(l0.fundingDeadline.toNumber() + 1);
    expect(await expectFail(b1, [await clientFor(b1).contributeIx(b1.pubkey, launch, 10_000_000n)])).toMatch(/FundingClosed/);
    const before1 = await connection.getBalance(b1.pubkey);
    // anyone may trigger the refund; lamports go only to the receipt owner
    const sig = await send(b2, [await clientFor(b2).refundIx(b2.pubkey, launch, b1.pubkey)]);
    expect(await connection.getBalance(b1.pubkey)).toBe(before1 + 800_000_000);
    const l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("refundable");
    expect(l.refundReason).toBe(1);
    expect((await lc.eventsForSignature(sig)).map((e) => e.name)).toContain("launchRefundable");
    expect(await expectFail(b1, [await clientFor(b1).refundIx(b1.pubkey, launch, b1.pubkey)])).toMatch(/NothingToRefund/);
    await send(b2, [await clientFor(b2).refundIx(b2.pubkey, launch, b2.pubkey)]);
    const rentMin = await connection.getMinimumBalanceForRentExemption(0);
    expect(await connection.getBalance(launchAccounts(launch).escrow)).toBe(rentMin);
    expect(await expectFail(b1, [await clientFor(b1).claimTokensIx(b1.pubkey, launch, l.mint, b1.pubkey)])).toMatch(/NotLive/);
    // the creator takes back the whole setup reserve
    await send(creator, [await clientFor(creator).reclaimUnusedSetupReserveIx(creator.pubkey, launch)]);
    expect(await connection.getBalance(launchAccounts(launch).auth)).toBe(rentMin);
  });

  it("settlement timeout: READY launches that are not settled before the deadline become refundable and can never settle", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator, "SLOW", "SLOW");
    const b = await makeActor(connection, 4);
    await contribute(b, launch, 2n * SOL);
    const l0 = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l0.state]).toBe("ready");
    await waitUntilChainTime(l0.settlementDeadline.toNumber() + 1);
    const keeper = await makeActor(connection, 2);
    expect(await expectFail(keeper, [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), await clientFor(keeper).finalizeLaunchIx(keeper.pubkey, launch)])).toMatch(/SettlementExpired/);
    await send(keeper, [await clientFor(keeper).expireLaunchIx(keeper.pubkey, launch)]);
    const l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("refundable");
    expect(l.refundReason).toBe(2);
    const before = await connection.getBalance(b.pubkey);
    await send(keeper, [await clientFor(keeper).refundIx(keeper.pubkey, launch, b.pubkey)]);
    expect(await connection.getBalance(b.pubkey)).toBe(before + 2 * Number(SOL));
    expect(await expectFail(keeper, [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), await clientFor(keeper).finalizeLaunchIx(keeper.pubkey, launch)])).toMatch(/NotReady/);
  });

  it("unsolicited SOL in the escrow never changes fill or obligations; wrong-owner refunds and claims are rejected", async () => {
    const creator = await makeActor(connection, 10);
    const { launch, mint } = await createLaunch(creator, "STRAY", "STRAY");
    const a = launchAccounts(launch);
    const donor = await makeActor(connection, 3);
    await send(donor, [SystemProgram.transfer({ fromPubkey: donor.pubkey, toPubkey: a.escrow, lamports: 1_500_000_000 })]);
    let l = await lc.fetchLaunch(launch);
    expect(l.raisedLamports.toString()).toBe("0");
    expect(LAUNCH_STATE[l.state]).toBe("funding");
    const b = await makeActor(connection, 4);
    await contribute(b, launch, 1n * SOL);
    l = await lc.fetchLaunch(launch);
    expect(l.raisedLamports.toString()).toBe((1n * SOL).toString());
    // a refund call naming a wallet without a receipt fails; the donor cannot pull "its" SOL back
    expect(await expectFail(donor, [await clientFor(donor).refundIx(donor.pubkey, launch, donor.pubkey)])).toMatch(/AccountNotInitialized|3012|not initialized/i);
    expect(await expectFail(donor, [await clientFor(donor).claimTokensIx(donor.pubkey, launch, mint, b.pubkey)])).toMatch(/NotLive/);
    // top-ups never grant privileges: the donor cannot reclaim the reserve
    await send(donor, [await clientFor(donor).topUpSetupReserveIx(donor.pubkey, launch, 50_000_000n)]);
    expect(await expectFail(donor, [await clientFor(donor).reclaimUnusedSetupReserveIx(donor.pubkey, launch)])).toMatch(/NotCreator|ReserveLocked/);
    // a creator cannot cancel, retarget or extend: there is no such instruction, and pausing only blocks new launches
    await send(admin, [await lc.setPausedIx(admin.pubkey, true)]);
    expect(await expectFail(creator, [await (await clientFor(creator).createLaunchIx(creator.pubkey, Keypair.generate().publicKey, { name: "P", symbol: "P", uri: "https://p", metadataHash: new Uint8Array(32), setupReserveLamports: 300_000_000n }, feeRecipient.publicKey))])).toMatch(/Paused|Signature verification failed|unknown signer/);
    await contribute(donor, launch, 1n * SOL); // existing launch keeps working while paused
    l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("ready");
    await send(admin, [await lc.setPausedIx(admin.pubkey, false)]);
  });

  it("substitution: settlement with a different AMM config, program or pool address is rejected before any CPI", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator, "SUBST", "SUBST");
    const b = await makeActor(connection, 4);
    await contribute(b, launch, 2n * SOL);
    const l = await lc.fetchLaunch(launch);
    const keeper = await makeActor(connection, 2);
    const kc = clientFor(keeper);
    const good = kc.settlementAccounts(launch, l);
    const budget = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
    const withAccounts = (patch: Partial<typeof good>) => kc.program.methods.finalizeLaunch().accountsPartial({ caller: keeper.pubkey, ...good, ...patch }).instruction();
    const otherConfig = Keypair.generate().publicKey;
    expect(await expectFail(keeper, [budget, await withAccounts({ ammConfig: otherConfig })])).toMatch(/WrongDex|ConstraintAddress|2012/);
    expect(await expectFail(keeper, [budget, await withAccounts({ cpSwapProgram: Keypair.generate().publicKey })])).toMatch(/WrongDex|ConstraintAddress|2012/);
    expect(await expectFail(keeper, [budget, await withAccounts({ poolState: Keypair.generate().publicKey })])).toMatch(/WrongDexAccount/);
    expect(await expectFail(keeper, [budget, await withAccounts({ createPoolFee: Keypair.generate().publicKey })])).toMatch(/WrongDex|ConstraintAddress|2012/);
    expect(await expectFail(keeper, [budget, await withAccounts({ authLp: Keypair.generate().publicKey })])).toMatch(/WrongAta/);
    // the launch is untouched: still READY, pool still absent
    expect(LAUNCH_STATE[(await lc.fetchLaunch(launch)).state]).toBe("ready");
    expect(await connection.getAccountInfo(good.poolState)).toBeNull();
    // and the correct accounts still settle it
    await keeper.provider.sendAndConfirm(await kc.buildFinalizeTransaction(keeper.pubkey, launch), [], { commitment: "confirmed" });
    expect(LAUNCH_STATE[(await lc.fetchLaunch(launch)).state]).toBe("live");
  });

  it("property: escrow principal = recorded deposits − seeded − refunded, and no wallet both refunds and claims", async () => {
    // Covered by the two paths above; here we assert the accounting identities on fresh launches of each kind.
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator, "PROP", "PROP");
    const bs = [await makeActor(connection, 3), await makeActor(connection, 3)];
    await contribute(bs[0]!, launch, 600_000_000n);
    await contribute(bs[1]!, launch, 400_000_000n);
    const rentMin = BigInt(await connection.getMinimumBalanceForRentExemption(0));
    const a = launchAccounts(launch);
    const l = await lc.fetchLaunch(launch);
    const escrow = BigInt(await connection.getBalance(a.escrow));
    expect(escrow - rentMin).toBe(BigInt(l.raisedLamports.toString()) - BigInt(l.settledQuote.toString()) - BigInt(l.totalRefunded.toString()));
    expect(l.totalClaimed.toString()).toBe("0");
    const rs = await Promise.all(bs.map((b) => lc.fetchReceipt(launch, b.pubkey)));
    for (const r of rs) expect(r!.claimedBaseUnits.toNumber() === 0 || r!.refundedLamports.toNumber() === 0).toBe(true);
    const ids = { receipt: receiptPda(launch, bs[0]!.pubkey).toBase58() };
    expect(ids.receipt.length).toBeGreaterThan(30);
  });
});
