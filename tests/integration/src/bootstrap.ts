/**
 * Bootstrap a deployed program on a real cluster (devnet): initialize the protocol with PILOT
 * settings and, if POP_MINT is set, publish the external POP mint. Markets are launched through
 * the public /launch flow (or `--demo` here, labeled). Idempotent: skips steps already done.
 */
import { readFileSync } from "node:fs";
import { AnchorProvider } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { PopClient, PILOT_SETTINGS, marketPda } from "@pop/sdk";
import { KeypairWallet, wrapSol } from "./harness.js";

const rpc = process.env.POP_RPC_URL ?? "https://api.devnet.solana.com";
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.POP_DEPLOYER!, "utf8"))));
const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.POP_TREASURY!, "utf8"))));
const connection = new Connection(rpc, "confirmed");
const provider = new AnchorProvider(connection, new KeypairWallet(deployer), { commitment: "confirmed" });
const client = new PopClient(provider);
const send = async (ixs: Parameters<Transaction["add"]>, signers: Keypair[] = []) => provider.sendAndConfirm(new Transaction().add(...ixs), signers);

console.log("rpc", rpc, "program", client.programId.toBase58(), "deployer", deployer.publicKey.toBase58(), "treasury", treasury.publicKey.toBase58());
let cfg = await client.program.account.protocolConfig.fetchNullable(client.protocolAddress);
if (!cfg) {
  const sig = await send([await client.initializeProtocolIx(deployer.publicKey, { authority: deployer.publicKey, protocolFeeRecipient: treasury.publicKey, buybackAuthority: deployer.publicKey, settings: PILOT_SETTINGS, buybackMinIntervalSlots: 1000n, buybackMaxWithdrawPerExecution: 5_000_000_000n, launchesEnabled: true })]);
  console.log("initialize_protocol", sig);
  cfg = await client.fetchProtocol();
}
if (process.env.POP_MINT && cfg.popMint.equals(PublicKey.default)) {
  console.log("set_pop_mint", await send([await client.setPopMintIx(deployer.publicKey, new PublicKey(process.env.POP_MINT))]));
}
if (process.argv.includes("--demo")) {
  const mint = Keypair.generate();
  const market = marketPda(client.programId, mint.publicKey);
  const seed = BigInt(cfg.settings.minSeedQuote.toString());
  console.log("create_market (DEMO)", await send([await client.createMarketIx(deployer.publicKey, mint.publicKey, { name: "Demo Coin (test)", symbol: "DEMO", uri: "https://example.invalid/demo.json", seedBase: 1_000_000_000n * 1_000_000n, seedQuote: seed, decimals: 6 })], [mint]));
  const v = await client.fetchMarket(market, []);
  console.log("pages", await send(await client.initializePagesIxs(deployer.publicKey, market, v.config, PopClient.launchPages())));
  await wrapSol({ keypair: deployer, provider, client, pubkey: deployer.publicKey }, seed);
  console.log("activate", await send([await client.activateMarketIx(deployer.publicKey, market, mint.publicKey)]), "market", market.toBase58(), "mint", mint.publicKey.toBase58());
}
console.log("done. popMint", (await client.fetchProtocol()).popMint.toBase58());
