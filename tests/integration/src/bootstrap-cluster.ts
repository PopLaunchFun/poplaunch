/**
 * Initialize (or update) the protocol settings on a public cluster with the verified addresses for that
 * cluster. The signer must be the program's upgrade authority (initialize) or the protocol authority (update).
 *   CLUSTER=devnet RPC_URL=https://... POP_ADMIN_KEYPAIR=~/.config/poplaunch/devnet-deployer.json \
 *   POP_FEE_RECIPIENT=<treasury> pnpm --filter @pop/integration bootstrap:cluster
 * Optional overrides: POP_TARGET_SOL, POP_FUNDING_SECS, POP_SETTLE_SECS, POP_CREATION_FEE_SOL (e.g. 0 for a feeless period).
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
// Confirmation polls getSignatureStatuses; the websocket endpoint is a dead address so no subscription is attempted.
const connection = new Connection(rpc, { commitment: "confirmed", wsEndpoint: "ws://127.0.0.1:1" });
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
  ...(process.env.POP_CREATION_FEE_SOL !== undefined ? { creationFeeLamports: BigInt(Math.round(Number(process.env.POP_CREATION_FEE_SOL) * 1e9)) } : {}),
});
const client = new PopLaunchClient(new AnchorProvider(connection, new KeypairWallet(admin), { commitment: "confirmed" }));
const exists = await connection.getAccountInfo(launchConfigPda());
const ix = exists ? await client.updateSettingsIx(admin.publicKey, settings) : await client.initializeProtocolIx(admin.publicKey, settings);
const bh = await connection.getLatestBlockhash("confirmed");
const tx = PopLaunchClient.ixs(ix);
tx.recentBlockhash = bh.blockhash;
tx.feePayer = admin.publicKey;
tx.sign(admin);
const sig = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
for (const started = Date.now(); ; ) {
  const { value: [st] } = await connection.getSignatureStatuses([sig]);
  if (st?.err) throw new Error(`failed: ${JSON.stringify(st.err)} (${sig})`);
  if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
  if (Date.now() - started > 120_000) throw new Error(`not confirmed after 120s; check ${sig}`);
  await new Promise((r) => setTimeout(r, 2000));
}
const cfg = await client.fetchConfig();
console.log(JSON.stringify({ action: exists ? "update_settings" : "initialize_protocol", signature: sig, authority: cfg.authority.toBase58(), version: cfg.version, cpSwapProgram: net.cpSwapProgram.toBase58(), ammConfig: ammConfig.toBase58(), createPoolFeeReceiver: net.createPoolFeeReceiver.toBase58(), feeRecipient: feeRecipient.toBase58(), targetSol: Number(cfg.settings.targetLamports.toString()) / 1e9, creationFeeSol: Number(cfg.settings.creationFeeLamports.toString()) / 1e9, fundingWindowSecs: cfg.settings.fundingWindowSecs.toString(), settlementTimeoutSecs: cfg.settings.settlementTimeoutSecs.toString() }, null, 2));
