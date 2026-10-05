/**
 * Localnet bootstrap for Pop Launch: creates the Raydium AmmConfig fixture and initializes (or updates)
 * the protocol settings with the deterministic test authority. Run after `scripts/localnet.sh start`.
 *   pnpm --filter @pop/integration bootstrap:launch            # V1 defaults (50 SOL, 24h, 60 min)
 *   POP_FUNDING_SECS=180 POP_SETTLE_SECS=90 POP_TARGET_SOL=2 pnpm --filter @pop/integration bootstrap:launch
 */
import { createHash } from "node:crypto";
import { AnchorProvider } from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PopLaunchClient, launchConfigPda, v1Settings } from "@pop/sdk";
import { KeypairWallet, connect } from "./harness.js";
import { ensureAmmConfig } from "./raydium.js";

const connection = await connect();
const admin = Keypair.fromSeed(createHash("sha256").update("poplaunch-test-admin").digest());
if ((await connection.getBalance(admin.publicKey)) < 5 * LAMPORTS_PER_SOL) {
  const sig = await connection.requestAirdrop(admin.publicKey, 20 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
}
const ammConfig = await ensureAmmConfig(connection);
const feeRecipient = process.env.POP_FEE_RECIPIENT ? new PublicKey(process.env.POP_FEE_RECIPIENT) : admin.publicKey;
const settings = v1Settings(feeRecipient, ammConfig, {
  targetLamports: BigInt(Math.round(Number(process.env.POP_TARGET_SOL ?? 50) * 1e9)),
  fundingWindowSecs: BigInt(process.env.POP_FUNDING_SECS ?? 86_400),
  settlementTimeoutSecs: BigInt(process.env.POP_SETTLE_SECS ?? 3_600),
});
const client = new PopLaunchClient(new AnchorProvider(connection, new KeypairWallet(admin), { commitment: "confirmed" }));
const exists = await connection.getAccountInfo(launchConfigPda());
const ix = exists ? await client.updateSettingsIx(admin.publicKey, settings) : await client.initializeProtocolIx(admin.publicKey, settings);
const sig = await client.provider.sendAndConfirm!(PopLaunchClient.ixs(ix), [], { commitment: "confirmed" });
const cfg = await client.fetchConfig();
console.log(JSON.stringify({ signature: sig, authority: admin.publicKey.toBase58(), version: cfg.version, ammConfig: ammConfig.toBase58(), feeRecipient: feeRecipient.toBase58(), targetSol: Number(cfg.settings.targetLamports.toString()) / 1e9, fundingWindowSecs: cfg.settings.fundingWindowSecs.toString(), settlementTimeoutSecs: cfg.settings.settlementTimeoutSecs.toString() }, null, 2));
