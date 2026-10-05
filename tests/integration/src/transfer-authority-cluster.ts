/**
 * Hand the protocol authority to another key on a public cluster (one-way; the new key must sign any later change).
 *   CLUSTER=mainnet-beta RPC_URL=... POP_ADMIN_KEYPAIR=<current authority> POP_NEW_AUTHORITY=<pubkey> \
 *   pnpm --filter @pop/integration transfer-authority:cluster
 */
import { readFileSync } from "node:fs";
import { AnchorProvider } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PopLaunchClient } from "@pop/sdk";
import { KeypairWallet } from "./harness.js";

const rpc = process.env.RPC_URL;
if (!rpc) throw new Error("RPC_URL required");
const keypairPath = process.env.POP_ADMIN_KEYPAIR;
if (!keypairPath) throw new Error("POP_ADMIN_KEYPAIR required");
const next = process.env.POP_NEW_AUTHORITY;
if (!next) throw new Error("POP_NEW_AUTHORITY required");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath.replace(/^~/, process.env.HOME ?? ""), "utf8")) as number[]));
const connection = new Connection(rpc, { commitment: "confirmed", wsEndpoint: "ws://127.0.0.1:1" });
const client = new PopLaunchClient(new AnchorProvider(connection, new KeypairWallet(admin), { commitment: "confirmed" }));
const before = await client.fetchConfig();
console.log(`cluster ${process.env.CLUSTER ?? "?"}  current authority ${before.authority.toBase58()}  signer ${admin.publicKey.toBase58()}`);
const tx = PopLaunchClient.ixs(await client.transferAuthorityIx(admin.publicKey, new PublicKey(next)));
const bh = await connection.getLatestBlockhash("confirmed");
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
console.log(`transfer_authority ${sig}`);
console.log(`protocol authority now ${(await client.fetchConfig()).authority.toBase58()}`);
