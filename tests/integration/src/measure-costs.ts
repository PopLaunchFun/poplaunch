/**
 * Measure what each instruction costs on the current build: compute units, transaction fee at the base
 * rate, and the rent of every account a launch creates. Runs one full launch on localnet and prints a table
 * (also written to docs/costs.json). Rent follows the cluster's rent parameters; CU is the real figure.
 *   pnpm --filter @pop/integration measure:costs
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@anchor-lang/core";
import { PopLaunchClient, launchAccounts, launchPda, metadataPda, receiptPda, v1Settings } from "@pop/sdk";
import { KeypairWallet, computeUnits, connect, makeActor, send } from "./harness.js";
import { MAINNET_LIKE_CONFIG, ensureAmmConfig } from "./raydium.js";

const connection = await connect();
const adminKey = Keypair.fromSeed(createHash("sha256").update("poplaunch-test-admin").digest());
const admin = { keypair: adminKey, provider: new AnchorProvider(connection, new KeypairWallet(adminKey), { commitment: "confirmed" }), client: null as never, pubkey: adminKey.publicKey };
const ammConfig = await ensureAmmConfig(connection);
const lc = new PopLaunchClient(admin.provider);
const feeRecipient = Keypair.generate().publicKey;
const terms = v1Settings(feeRecipient, ammConfig, { targetLamports: 2n * BigInt(LAMPORTS_PER_SOL), fundingWindowSecs: 60n, settlementTimeoutSecs: 60n, minContributionLamports: 10_000_000n });
await send(admin, [await lc.updateSettingsIx(admin.pubkey, terms)]);

const rows: { instruction: string; cu: number; feeLamports: number; signature: string }[] = [];
const measure = async (name: string, sig: string) => {
  const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  rows.push({ instruction: name, cu: await computeUnits(connection, sig), feeLamports: tx?.meta?.fee ?? 0, signature: sig });
};
const client = (a: { provider: AnchorProvider }) => new PopLaunchClient(a.provider);

const creator = await makeActor(connection, 10);
const mint = Keypair.generate();
const reserve = await client(creator).quoteSetupReserve(MAINNET_LIKE_CONFIG.createPoolFee, terms.minSetupReserveLamports);
await measure("create_launch", await send(creator, [await client(creator).createLaunchIx(creator.pubkey, mint.publicKey, { name: "COST", symbol: "COST", uri: "https://example.com/m.json", metadataHash: new Uint8Array(32), setupReserveLamports: reserve.total }, feeRecipient)], [mint]));
const launch = launchPda(mint.publicKey);
const a = launchAccounts(launch);
const b1 = await makeActor(connection, 5), b2 = await makeActor(connection, 5);
await measure("contribute (new receipt)", await send(b1, [await client(b1).contributeIx(b1.pubkey, launch, 1_000_000_000n)]));
await measure("contribute (existing receipt)", await send(b1, [await client(b1).contributeIx(b1.pubkey, launch, 500_000_000n)]));
await measure("contribute (fills target)", await send(b2, [await client(b2).contributeIx(b2.pubkey, launch, 500_000_000n)]));
const authBefore = await connection.getBalance(a.auth);
const fin = await client(b2).buildFinalizeTransaction(b2.pubkey, launch);
await measure("finalize_launch", await b2.provider.sendAndConfirm(fin, [], { commitment: "confirmed" }));
const authAfter = await connection.getBalance(a.auth);
await measure("claim_tokens (creates ATA)", await send(b1, [await client(b1).claimTokensIx(b1.pubkey, launch, mint.publicKey, b1.pubkey)]));
await measure("reclaim_unused_setup_reserve", await send(creator, [await client(creator).reclaimUnusedSetupReserveIx(creator.pubkey, launch)]));
// a second, under-funded launch for the refund path
const mint2 = Keypair.generate();
await send(creator, [await client(creator).createLaunchIx(creator.pubkey, mint2.publicKey, { name: "COST2", symbol: "COST2", uri: "https://example.com/m.json", metadataHash: new Uint8Array(32), setupReserveLamports: reserve.total }, feeRecipient)], [mint2]);
const launch2 = launchPda(mint2.publicKey);
await send(b1, [await client(b1).contributeIx(b1.pubkey, launch2, 100_000_000n)]);
const l2 = await lc.fetchLaunch(launch2);
while (((await connection.getBlockTime(await connection.getSlot("confirmed"))) ?? 0) < l2.fundingDeadline.toNumber()) await new Promise((r) => setTimeout(r, 1000));
await measure("refund (lazy expiry)", await send(b1, [await client(b1).refundIx(b1.pubkey, launch2, b1.pubkey)]));

const rent = async (n: number) => connection.getMinimumBalanceForRentExemption(n);
const launchSize = lc.program.account.launch.size, receiptSize = lc.program.account.contributionReceipt.size;
const rents = {
  "Launch account": await rent(launchSize),
  "Mint": await rent(82),
  "Backer vault + pool vault (token accounts)": 2 * (await rent(165)),
  "Token metadata (Metaplex, 679 bytes)": await rent(679),
  "Escrow + authority PDAs (system accounts)": 2 * (await rent(0)),
  "Contribution receipt (per backer, paid by backer)": await rent(receiptSize),
  "Backer token account on claim (paid by claimer)": await rent(165),
};
const out = { measuredAt: new Date().toISOString(), cluster: "localnet", notes: "CU and fees are measured; rents use the cluster rent rate (same as mainnet: 6.96 lamports/byte-year × 2 years).", instructions: rows, rentsLamports: rents, setupReserve: { quotedLamports: Number(reserve.total), parts: Object.fromEntries(Object.entries(reserve.parts).map(([k, v]) => [k, Number(v)])), consumedBySettlementLamports: authBefore - authAfter } };
writeFileSync(new URL("../../../docs/costs.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.table(rows.map((r) => ({ instruction: r.instruction, cu: r.cu, fee: r.feeLamports })));
console.table(Object.entries(rents).map(([k, v]) => ({ account: k, lamports: v, sol: v / LAMPORTS_PER_SOL })));
console.log(`setup reserve quoted ${Number(reserve.total) / LAMPORTS_PER_SOL} SOL, consumed by settlement ${(authBefore - authAfter) / LAMPORTS_PER_SOL} SOL (net of returned ATA rent)`);
void PublicKey; void metadataPda; void receiptPda;
