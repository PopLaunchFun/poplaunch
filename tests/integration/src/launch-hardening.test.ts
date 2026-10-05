/**
 * Stage 4 regression tests for the review findings: settlement cannot be bricked by stray lamports, token
 * metadata is immutable at opening, settings changes never touch open launches, settings are validated
 * against the verified address allowlist, racing final contributions serialize, numeric limits, and the
 * creator gets the settlement ATAs' rent back. Runs against the same localnet as launch.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { AnchorProvider } from "@anchor-lang/core";
import { PopLaunchClient, LAUNCH_STATE, TOKEN_METADATA_PROGRAM_ID, launchAccounts, launchPda, metadataPda, receiptPda, v1Settings, type LaunchSettingsInput } from "@pop/sdk";
import { KeypairWallet, connect, expectFail, makeActor, send, tokenBalance, type Actor } from "./harness.js";
import { MAINNET_LIKE_CONFIG, ensureAmmConfig } from "./raydium.js";

const SOL = 1_000_000_000n;
let connection: Connection;
let admin: Actor;
let feeRecipient: Keypair;
let ammConfig: PublicKey;
let lc: PopLaunchClient;
let terms: LaunchSettingsInput;
const clientFor = (a: Actor) => new PopLaunchClient(a.provider);

async function createLaunch(creator: Actor, name = "HARD.EXE", symbol = "HARD") {
  const mint = Keypair.generate();
  const c = clientFor(creator);
  const reserve = await c.quoteSetupReserve(MAINNET_LIKE_CONFIG.createPoolFee, terms.minSetupReserveLamports);
  const ix = await c.createLaunchIx(creator.pubkey, mint.publicKey, { name, symbol, uri: "https://example.com/meta.json", metadataHash: new Uint8Array(32).fill(9), setupReserveLamports: reserve.total }, feeRecipient.publicKey);
  await send(creator, [ix], [mint]);
  return { launch: launchPda(mint.publicKey), mint: mint.publicKey, reserve: reserve.total };
}
const contribute = (b: Actor, launch: PublicKey, lamports: bigint) => clientFor(b).contributeIx(b.pubkey, launch, lamports).then((ix) => send(b, [ix]));

describe("Pop Launch hardening (Stage 4 review findings)", () => {
  beforeAll(async () => {
    connection = await connect();
    const { createHash } = await import("node:crypto");
    const adminKey = Keypair.fromSeed(createHash("sha256").update("poplaunch-test-admin").digest());
    if ((await connection.getBalance(adminKey.publicKey)) < 5 * LAMPORTS_PER_SOL) {
      const sig = await connection.requestAirdrop(adminKey.publicKey, 20 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
    }
    admin = { keypair: adminKey, provider: new AnchorProvider(connection, new KeypairWallet(adminKey), { commitment: "confirmed" }), client: null as never, pubkey: adminKey.publicKey };
    feeRecipient = Keypair.generate();
    ammConfig = await ensureAmmConfig(connection);
    lc = clientFor(admin);
    terms = v1Settings(feeRecipient.publicKey, ammConfig, { targetLamports: 2n * SOL, fundingWindowSecs: 60n, settlementTimeoutSecs: 60n, minContributionLamports: 10_000_000n });
    await send(admin, [await lc.updateSettingsIx(admin.pubkey, terms)]);
  });

  it("stray lamports at the future pool address and at the authority's WSOL ATA cannot block settlement", async () => {
    const creator = await makeActor(connection, 10);
    const { launch, mint, reserve } = await createLaunch(creator);
    const a = launchAccounts(launch);
    const backers = [await makeActor(connection, 5), await makeActor(connection, 5)];
    await contribute(backers[0]!, launch, 1_500_000_000n);
    await contribute(backers[1]!, launch, 500_000_000n);
    const l = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[l.state]).toBe("ready");
    const kc = clientFor(backers[0]!);
    const accts = kc.settlementAccounts(launch, l);
    // Griefer: the rent minimum (the smallest amount the runtime lets a new account hold, ~0.0009 SOL) to the pool
    // PDA, creating a system-owned empty account there, and a pre-created, pre-funded WSOL ATA for the authority.
    const griefer = await makeActor(connection, 2);
    const rentMin = await connection.getMinimumBalanceForRentExemption(0);
    await send(griefer, [
      SystemProgram.transfer({ fromPubkey: griefer.pubkey, toPubkey: accts.poolState, lamports: rentMin }),
      createAssociatedTokenAccountIdempotentInstruction(griefer.pubkey, accts.authQuote, a.auth, NATIVE_MINT),
      SystemProgram.transfer({ fromPubkey: griefer.pubkey, toPubkey: accts.authQuote, lamports: 1_234 }),
    ]);
    expect((await connection.getAccountInfo(accts.poolState))?.lamports).toBe(rentMin);
    expect((await connection.getAccountInfo(accts.poolState))?.owner.equals(SystemProgram.programId)).toBe(true);
    const authBefore = await connection.getBalance(a.auth);
    // Settlement still succeeds and seeds exactly the target, not target + 1234.
    const tx = await kc.buildFinalizeTransaction(backers[0]!.pubkey, launch);
    await backers[0]!.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    const live = await lc.fetchLaunch(launch);
    expect(LAUNCH_STATE[live.state]).toBe("live");
    const t0IsQuote = NATIVE_MINT.toBuffer().compare(mint.toBuffer()) < 0;
    expect(await tokenBalance(connection, t0IsQuote ? accts.token0Vault : accts.token1Vault)).toBe(2n * SOL);
    expect(await tokenBalance(connection, t0IsQuote ? accts.token1Vault : accts.token0Vault)).toBe(500_000_000_000_000n);
    // Both settlement ATAs are closed; their rent and the stray 1,234 lamports now sit in the setup reserve.
    expect(await connection.getAccountInfo(accts.authQuote)).toBeNull();
    expect(await connection.getAccountInfo(accts.authLp)).toBeNull();
    const authAfter = await connection.getBalance(a.auth);
    expect(authAfter).toBeGreaterThan(authBefore - Number(reserve)); // pool costs consumed, rents returned
    // LP mint supply is zero after the burn (checked on chain too)
    const lpMint = await connection.getAccountInfo(accts.lpMint);
    expect(lpMint!.data.readBigUInt64LE(36)).toBe(0n);
    // Creator reclaims everything above the rent minimum.
    await send(creator, [await clientFor(creator).reclaimUnusedSetupReserveIx(creator.pubkey, launch)]);
    expect(await connection.getBalance(a.auth)).toBe(await connection.getMinimumBalanceForRentExemption(0));
  });

  it("token metadata is created immutable at opening, with the launch authority as update authority", async () => {
    const creator = await makeActor(connection, 10);
    const { launch, mint } = await createLaunch(creator, "META CAT", "MCAT");
    const a = launchAccounts(launch);
    const md = await connection.getAccountInfo(metadataPda(mint));
    expect(md).not.toBeNull();
    expect(md!.owner.equals(TOKEN_METADATA_PROGRAM_ID)).toBe(true);
    const d = md!.data;
    expect(d[0]).toBe(4); // Key::MetadataV1
    expect(new PublicKey(d.subarray(1, 33)).equals(a.auth)).toBe(true);
    expect(new PublicKey(d.subarray(33, 65)).equals(mint)).toBe(true);
    const name = d.subarray(69, 69 + 32).toString("utf8").replace(/\0+$/, "");
    const symbol = d.subarray(69 + 32 + 4, 69 + 32 + 4 + 10).toString("utf8").replace(/\0+$/, "");
    expect(name).toBe("META CAT");
    expect(symbol).toBe("MCAT");
    // after name(4+32) symbol(4+10) uri(4+200) seller_fee(2) creators Option(1) primary_sale(1) comes is_mutable
    expect(d[65 + 36 + 14 + 204 + 2 + 1 + 1]).toBe(0);
  });

  it("update_settings never alters an open launch: the minimum contribution stays as copied at opening", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator);
    await send(admin, [await lc.updateSettingsIx(admin.pubkey, { ...terms, minContributionLamports: 1_000_000_000n })]);
    const backer = await makeActor(connection, 3);
    await contribute(backer, launch, 50_000_000n); // 0.05 SOL still fine on the open launch
    expect((await lc.fetchReceipt(launch, backer.pubkey))!.contributedLamports.toString()).toBe("50000000");
    const { launch: later } = await createLaunch(creator, "LATER", "LATER");
    expect(await expectFail(backer, [await clientFor(backer).contributeIx(backer.pubkey, later, 50_000_000n)])).toMatch(/BelowMinimum/);
    await send(admin, [await lc.updateSettingsIx(admin.pubkey, terms)]);
  });

  it("settings are validated against the verified allowlist; only the authority may change them", async () => {
    const bad = (o: Partial<LaunchSettingsInput>) => lc.updateSettingsIx(admin.pubkey, { ...terms, ...o }).then((ix) => expectFail(admin, [ix]));
    expect(await bad({ cpSwapProgram: Keypair.generate().publicKey })).toMatch(/InvalidSettings/);
    expect(await bad({ createPoolFeeReceiver: Keypair.generate().publicKey })).toMatch(/InvalidSettings/);
    expect(await bad({ quoteMint: Keypair.generate().publicKey })).toMatch(/InvalidSettings/);
    expect(await bad({ minSetupReserveLamports: 0n })).toMatch(/InvalidSettings/);
    const stranger = await makeActor(connection, 2);
    expect(await expectFail(stranger, [await clientFor(stranger).updateSettingsIx(stranger.pubkey, terms)])).toMatch(/has one constraint|ConstraintHasOne|2001/);
    expect(await expectFail(stranger, [await clientFor(stranger).setPausedIx(stranger.pubkey, true)])).toMatch(/has one constraint|ConstraintHasOne|2001/);
    // initialize_protocol is restricted to the program's upgrade authority; the singleton already exists here, so
    // a second call fails on the account itself. The constraint is exercised by the bootstrap on a fresh validator.
    expect(await expectFail(stranger, [await clientFor(stranger).initializeProtocolIx(stranger.pubkey, terms)])).toMatch(/already in use|NotUpgradeAuthority|0x0/);
  });

  it("racing final contributions serialize on the launch account: exactly one fills, the other is rejected whole", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator);
    const first = await makeActor(connection, 5);
    await contribute(first, launch, 1_500_000_000n);
    const racers = [await makeActor(connection, 5), await makeActor(connection, 5)];
    const bh = await connection.getLatestBlockhash("confirmed");
    const txs = await Promise.all(racers.map(async (r) => {
      const tx = new Transaction({ ...bh, feePayer: r.pubkey }).add(await clientFor(r).contributeIx(r.pubkey, launch, 500_000_000n));
      tx.sign(r.keypair);
      return tx;
    }));
    const sent = await Promise.allSettled(txs.map((t) => connection.sendRawTransaction(t.serialize(), { skipPreflight: true })));
    const sigs = sent.filter((s): s is PromiseFulfilledResult<string> => s.status === "fulfilled").map((s) => s.value);
    await Promise.all(sigs.map((s) => connection.confirmTransaction({ signature: s, ...bh }, "confirmed").catch(() => null)));
    const statuses = await connection.getSignatureStatuses(sigs);
    const ok = statuses.value.filter((s) => s && !s.err).length;
    expect(ok).toBe(1);
    const l = await lc.fetchLaunch(launch);
    expect(l.raisedLamports.toString()).toBe((2n * SOL).toString());
    expect(LAUNCH_STATE[l.state]).toBe("ready");
    const receipts = await Promise.all(racers.map((r) => lc.fetchReceipt(launch, r.pubkey)));
    expect(receipts.filter((r) => r && r.contributedLamports.toString() === "500000000").length).toBe(1);
  });

  it("numeric limits and state guards: u64::MAX rejected whole, no expiry before deadline, no reserve reclaim while READY", async () => {
    const creator = await makeActor(connection, 10);
    const { launch } = await createLaunch(creator);
    const backer = await makeActor(connection, 3);
    expect(await expectFail(backer, [await clientFor(backer).contributeIx(backer.pubkey, launch, 18_446_744_073_709_551_615n)])).toMatch(/ExceedsRemaining/);
    expect(await connection.getAccountInfo(receiptPda(launch, backer.pubkey))).toBeNull();
    expect(await expectFail(backer, [await clientFor(backer).expireLaunchIx(backer.pubkey, launch)])).toMatch(/NotRefundable/);
    await contribute(backer, launch, 2n * SOL);
    expect(LAUNCH_STATE[(await lc.fetchLaunch(launch)).state]).toBe("ready");
    expect(await expectFail(creator, [await clientFor(creator).reclaimUnusedSetupReserveIx(creator.pubkey, launch)])).toMatch(/ReserveLocked/);
    const stranger = await makeActor(connection, 2);
    expect(await expectFail(stranger, [await clientFor(stranger).reclaimUnusedSetupReserveIx(stranger.pubkey, launch)])).toMatch(/NotCreator/);
  });
});
