/**
 * Initialize (or update) the protocol settings on a public cluster with the verified addresses for that
 * cluster. The signer must be the program's upgrade authority (initialize) or the protocol authority (update).
 *   CLUSTER=devnet RPC_URL=https://... POP_ADMIN_KEYPAIR=~/.config/poplaunch/devnet-deployer.json \
 *   POP_FEE_RECIPIENT=<treasury> pnpm --filter @pop/integration bootstrap:cluster
 * Optional overrides for test clusters: POP_TARGET_SOL, POP_FUNDING_SECS, POP_SETTLE_SECS.
 */
import { readFileSync } from "node:fs";
import { AnchorProvider } from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PopLaunchClient, launchConfigPda, networkAddresses, raydiumAmmConfigPda, v1Settings } from "@pop/sdk";
import { KeypairWallet } from "./harness.js";

const cluster = process.env.CLUSTER ?? "devnet";
if (cluster === "localnet") throw new Error("use bootstrap:launch for localnet");
const net = networkAddresses(cluster);
const rpc = process.env.RPC_URL;
if (!rpc) throw new Error("RPC_URL required");
const keypairPath = process.env.POP_ADMIN_KEYPAIR;
if (!keypairPath) throw new Error("POP_ADMIN_KEYPAIR required");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath.replace(/^~/, process.env.HOME ?? ""), "utf8")) as number[]));
const connection = new Connection(rpc, "confirmed");
console.log(`cluster ${cluster}  admin ${admin.publicKey.toBase58()}  balance ${(await connection.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL} SOL`);

const ammConfig = raydiumAmmConfigPda(net.ammConfigIndex, net.cpSwapProgram);
const cfgInfo = await connection.getAccountInfo(ammConfig);
if (!cfgInfo || !cfgInfo.owner.equals(net.cpSwapProgram)) throw new Error(`AmmConfig ${ammConfig.toBase58()} not found on ${cluster}; run verify:addresses`);
const feeRecipient = process.env.POP_FEE_RECIPIENT ? new PublicKey(process.env.POP_FEE_RECIPIENT) : admin.publicKey;
const settings = v1Settings(feeRecipient, ammConfig, {
  cpSwapProgram: net.cpSwapProgram,
  createPoolFeeReceiver: net.createPoolFeeReceiver,
  targetLamports: BigInt(Math.round(Number(process.env.POP_TARGET_SOL ?? 50) * 1e9)),
  fundingWindowSecs: BigInt(process.env.POP_FUNDING_SECS ?? 86_400),
  settlementTimeoutSecs: BigInt(process.env.POP_SETTLE_SECS ?? 3_600),
});
const client = new PopLaunchClient(new AnchorProvider(connection, new KeypairWallet(admin), { commitment: "confirmed" }));
const exists = await connection.getAccountInfo(launchConfigPda());
const ix = exists ? await client.updateSettingsIx(admin.publicKey, settings) : await client.initializeProtocolIx(admin.publicKey, settings);
const sig = await client.provider.sendAndConfirm!(PopLaunchClient.ixs(ix), [], { commitment: "confirmed" });
const cfg = await client.fetchConfig();
console.log(JSON.stringify({ action: exists ? "update_settings" : "initialize_protocol", signature: sig, authority: cfg.authority.toBase58(), version: cfg.version, cpSwapProgram: net.cpSwapProgram.toBase58(), ammConfig: ammConfig.toBase58(), createPoolFeeReceiver: net.createPoolFeeReceiver.toBase58(), feeRecipient: feeRecipient.toBase58(), targetSol: Number(cfg.settings.targetLamports.toString()) / 1e9, fundingWindowSecs: cfg.settings.fundingWindowSecs.toString(), settlementTimeoutSecs: cfg.settings.settlementTimeoutSecs.toString() }, null, 2));
