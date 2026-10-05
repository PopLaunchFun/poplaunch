/**
 * Real-SOL dry run on a public cluster: prove the refund path end to end with one wallet acting as both
 * creator and backer. Nothing here can fill a launch; the coin it creates is a deliberately unfilled launch
 * whose metadata says so (apps/poplaunch/public/dry-run/metadata.json).
 *
 *   CLUSTER=mainnet-beta RPC_URL=... POP_ADMIN_KEYPAIR=~/.config/poplaunch/mainnet-deployer.json \
 *   POP_DRY_RUN_URI=https://www.poplaunch.fun/dry-run/metadata.json POP_DRY_RUN_HASH=<sha256 hex> \
 *   pnpm --filter @pop/integration dry-run:cluster create          # create the launch and back it with 0.01 SOL
 *   POP_LAUNCH=<launch address> ... dry-run:cluster finish         # after the window: expire, refund, reclaim reserve
 *   POP_LAUNCH=<launch address> ... dry-run:cluster status
 *
 * Confirmation polls getSignatureStatuses (no websocket needed).
 */
import { readFileSync } from "node:fs";
import { AnchorProvider } from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { LAUNCH_STATE, PopLaunchClient, launchAccounts, launchPda, networkAddresses, raydiumAmmConfigPda } from "@pop/sdk";
import { KeypairWallet } from "./harness.js";

const phase = process.argv[2] ?? "status";
const cluster = process.env.CLUSTER ?? "devnet";
const net = networkAddresses(cluster);
const rpc = process.env.RPC_URL;
if (!rpc) throw new Error("RPC_URL required");
const keypairPath = process.env.POP_ADMIN_KEYPAIR;
if (!keypairPath) throw new Error("POP_ADMIN_KEYPAIR required");
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath.replace(/^~/, process.env.HOME ?? ""), "utf8")) as number[]));
const connection = new Connection(rpc, { commitment: "confirmed", wsEndpoint: "ws://127.0.0.1:1" });
const client = new PopLaunchClient(new AnchorProvider(connection, new KeypairWallet(wallet), { commitment: "confirmed" }));
const sol = (l: bigint | number) => `${Number(l) / LAMPORTS_PER_SOL} SOL`;
const balance = async () => BigInt(await connection.getBalance(wallet.publicKey, "confirmed"));

async function send(label: string, ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<string> {
  const bh = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ ...bh, feePayer: wallet.publicKey }).add(...ixs);
  tx.sign(wallet, ...signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
  const started = Date.now();
  for (;;) {
    const { value: [st] } = await connection.getSignatureStatuses([sig]);
    if (st?.err) throw new Error(`${label} failed: ${JSON.stringify(st.err)} (${sig})`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) break;
    if (Date.now() - started > 120_000) throw new Error(`${label} not confirmed after 120s (${sig})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`${label}: ${sig}`);
  return sig;
}

console.log(`cluster ${cluster}  wallet ${wallet.publicKey.toBase58()}  balance ${sol(await balance())}`);
const cfg = await client.fetchConfig();
const terms = cfg.settings;

if (phase === "create") {
  const uri = process.env.POP_DRY_RUN_URI, hashHex = process.env.POP_DRY_RUN_HASH;
  if (!uri || !hashHex || hashHex.length !== 64) throw new Error("POP_DRY_RUN_URI and POP_DRY_RUN_HASH (sha256 hex of the document) required");
  const ammConfig = raydiumAmmConfigPda(net.ammConfigIndex, net.cpSwapProgram);
  const info = await connection.getAccountInfo(ammConfig);
  if (!info) throw new Error("AmmConfig missing");
  const createPoolFee = info.data.readBigUInt64LE(8 + 1 + 1 + 2 + 8 + 8 + 8);
  const reserve = await client.quoteSetupReserve(createPoolFee, BigInt(terms.minSetupReserveLamports.toString()));
  const mint = PopLaunchClient.newMintKeypair();
  const launch = launchPda(mint.publicKey, client.programId);
  const before = await balance();
  console.log(`terms: target ${sol(BigInt(terms.targetLamports.toString()))}, window ${terms.fundingWindowSecs.toString()}s, creation fee ${sol(BigInt(terms.creationFeeLamports.toString()))}, reserve ${sol(reserve.total)}`);
  const ix = await client.createLaunchIx(wallet.publicKey, mint.publicKey, { name: "Pop Launch mainnet dry run", symbol: "DRYRUN", uri, metadataHash: Uint8Array.from(Buffer.from(hashHex, "hex")), setupReserveLamports: reserve.total }, terms.feeRecipient);
  await send("create_launch", [ix], [mint]);
  const back = 10_000_000n;
  await send(`contribute ${sol(back)}`, [await client.contributeIx(wallet.publicKey, launch, back)]);
  const l = await client.fetchLaunch(launch);
  console.log(JSON.stringify({ mint: mint.publicKey.toBase58(), launch: launch.toBase58(), state: LAUNCH_STATE[l.state], raised: sol(BigInt(l.raisedLamports.toString())), fundingDeadline: new Date(Number(l.fundingDeadline.toString()) * 1000).toISOString(), spentSoFar: sol(before - (await balance())) }, null, 2));
} else {
  const launchAddr = process.env.POP_LAUNCH;
  if (!launchAddr) throw new Error("POP_LAUNCH required");
  const launch = new PublicKey(launchAddr);
  const l = await client.fetchLaunch(launch);
  const a = launchAccounts(launch, client.programId);
  const now = Math.floor(Date.now() / 1000);
  const deadline = Number(l.fundingDeadline.toString());
  const show = async () => {
    const cur = await client.fetchLaunch(launch);
    const receipt = await client.fetchReceipt(launch, wallet.publicKey);
    console.log(JSON.stringify({ state: LAUNCH_STATE[cur.state], raised: sol(BigInt(cur.raisedLamports.toString())), escrow: sol(await connection.getBalance(a.escrow)), authReserve: sol(await connection.getBalance(a.auth)), reserveReclaimed: sol(BigInt(cur.setupReserveReclaimed.toString())), receipt: receipt ? { contributed: sol(BigInt(receipt.contributedLamports.toString())), refunded: sol(BigInt(receipt.refundedLamports.toString())) } : null, fundingDeadline: new Date(deadline * 1000).toISOString(), secondsToDeadline: deadline - now }, null, 2));
  };
  await show();
  if (phase === "finish") {
    const before = await balance();
    if (LAUNCH_STATE[l.state] === "funding") {
      if (now <= deadline) throw new Error(`window still open for ${deadline - now}s`);
      await send("expire_launch", [await client.expireLaunchIx(wallet.publicKey, launch)]);
    }
    const r = await client.fetchReceipt(launch, wallet.publicKey);
    if (r && BigInt(r.refundedLamports.toString()) < BigInt(r.contributedLamports.toString())) await send("refund", [await client.refundIx(wallet.publicKey, launch, wallet.publicKey)]);
    if (BigInt((await client.fetchLaunch(launch)).setupReserveReclaimed.toString()) === 0n) await send("reclaim_unused_setup_reserve", [await client.reclaimUnusedSetupReserveIx(wallet.publicKey, launch)]);
    console.log(`recovered ${sol((await balance()) - before)} in this phase`);
    await show();
  }
}
