/** Print authority state and vault reconciliation for the deployed protocol. */
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, getAccount } from "@solana/spl-token";
import { PopClient, marketVaults } from "@pop/sdk";
import { reconcile } from "@pop/math";

const rpc = process.env.POP_RPC_URL ?? "https://api.devnet.solana.com";
const connection = new Connection(rpc, "confirmed");
const client = PopClient.readOnly(connection);
const acc = await connection.getAccountInfo(client.programId);
let upgradeAuthority: string | null = "unknown";
if (acc && acc.owner.toBase58() === "BPFLoaderUpgradeab1e11111111111111111111111") {
  const pd = await connection.getAccountInfo(new PublicKey(acc.data.subarray(4, 36)));
  upgradeAuthority = pd && pd.data[12] === 1 ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
}
console.log("program", client.programId.toBase58(), "upgrade authority:", upgradeAuthority ?? "REVOKED");
for (const m of await client.fetchAllMarkets()) {
  const v = await client.fetchMarket(m.publicKey);
  const mint = await getMint(connection, v.raw.baseMint);
  const vaults = marketVaults(client.programId, m.publicKey);
  const bal = async (k: PublicKey) => (await getAccount(connection, k)).amount;
  const r = reconcile(v.state, v.store);
  const ok = (await bal(vaults.baseVault)) === r.vaultBase && (await bal(vaults.quoteVault)) === r.vaultQuote && (await bal(vaults.feeVaultBase)) === r.feeVaultBase && (await bal(vaults.feeVaultQuote)) === r.feeVaultQuote;
  console.log(`${v.raw.symbol} ${m.publicKey.toBase58()} status=${v.state.status} mintAuthority=${mint.mintAuthority?.toBase58() ?? "none"} freezeAuthority=${mint.freezeAuthority?.toBase58() ?? "none"} supply=${mint.supply} reconciled=${ok} missingPages=${v.missingPages.length}`);
}
