/**
 * Bootstrap a deployed program on a real cluster (devnet): initialize the protocol with PILOT
 * settings, create the genesis POP market with the published allocations, pre-create pages,
 * fund 20 SOL seed and activate. Prints every address and signature. Idempotent-ish: skips
 * steps whose accounts already exist.
 */
import { readFileSync } from "node:fs";
import { AnchorProvider } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { PopClient, PILOT_SETTINGS, marketPda } from "@pop/sdk";
import { KeypairWallet, chunk, wrapSol } from "./harness.js";

const rpc = process.env.POP_RPC_URL ?? "https://api.devnet.solana.com";
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.POP_DEPLOYER!, "utf8"))));
const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.POP_TREASURY!, "utf8"))));
const connection = new Connection(rpc, "confirmed");
const provider = new AnchorProvider(connection, new KeypairWallet(deployer), { commitment: "confirmed" });
const client = new PopClient(provider);
const actor = { keypair: deployer, provider, client, pubkey: deployer.publicKey };
const send = async (ixs: Parameters<Transaction["add"]>, signers: Keypair[] = []) => provider.sendAndConfirm(new Transaction().add(...ixs), signers);

console.log("rpc", rpc, "program", client.programId.toBase58(), "deployer", deployer.publicKey.toBase58(), "treasury", treasury.publicKey.toBase58());
let cfg = await client.program.account.protocolConfig.fetchNullable(client.protocolAddress);
if (!cfg) {
  const sig = await send([await client.initializeProtocolIx(deployer.publicKey, { authority: deployer.publicKey, protocolFeeRecipient: treasury.publicKey, buybackAuthority: deployer.publicKey, settings: PILOT_SETTINGS, buybackMinIntervalSlots: 1000n, buybackMaxSpendPerExecution: 5_000_000_000n, launchesEnabled: true })]);
  console.log("initialize_protocol", sig);
  cfg = await client.fetchProtocol();
}
let popMint: PublicKey;
if (cfg.popMint.equals(PublicKey.default)) {
  const mint = Keypair.generate();
  popMint = mint.publicKey;
  const market = marketPda(client.programId, popMint);
  const sig = await send([await client.createMarketIx(deployer.publicKey, popMint, { name: "Proof of Pain", symbol: "POP", uri: "https://poplaunch.fun/pop.json", seedBase: 900_000_000n * 1_000_000n, decimals: 6, isPopMarket: true })], [mint]);
  console.log("create_market", market.toBase58(), "mint", popMint.toBase58(), sig);
  const month = 30n * 24n * 3600n;
  console.log("create_vesting founder", await send([await client.createVestingIx(deployer.publicKey, market, popMint, { index: 0, beneficiary: deployer.publicKey, amount: 50_000_000n * 1_000_000n, startOffset: 12n * month, cliffOffset: 12n * month, endOffset: 36n * month, label: "founder" })]));
  console.log("create_vesting ecosystem", await send([await client.createVestingIx(deployer.publicKey, market, popMint, { index: 1, beneficiary: treasury.publicKey, amount: 50_000_000n * 1_000_000n, startOffset: 0n, cliffOffset: 0n, endOffset: 36n * month, label: "ecosystem" })]));
} else {
  popMint = cfg.popMint;
}
const market = marketPda(client.programId, popMint);
const v = await client.fetchMarket(market);
if (v.missingPages.length) {
  const ixs = await client.initializeAllPagesIxs(deployer.publicKey, market, v.config, new Set([...v.store.pages.keys()]));
  for (const b of chunk(ixs, 6)) console.log("initialize_bin_page x6", await send(b));
}
if (v.state.status === "created") {
  await wrapSol(actor, v.config.seedQuote);
  console.log("activate_market", await send([await client.activateMarketIx(deployer.publicKey, market, popMint)]));
}
console.log("done. market", market.toBase58(), "status", (await client.fetchMarket(market, [])).state.status);
