/**
 * Verify the external addresses a cluster's protocol settings depend on, against the live chain.
 * Run before `initialize_protocol` on a new cluster and again before every release:
 *   RPC_URL=https://api.devnet.solana.com CLUSTER=devnet pnpm --filter @pop/integration verify:addresses
 * Exit code 1 on any mismatch. Nothing here signs or sends a transaction.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { AccountLayout } from "@solana/spl-token";
import { LAUNCH_PROGRAM_ID, PopLaunchClient, launchConfigPda, networkAddresses, raydiumAmmConfigPda } from "@pop/sdk";

const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const cluster = process.env.CLUSTER ?? "localnet";
const programId = new PublicKey(process.env.LAUNCH_PROGRAM_ID ?? LAUNCH_PROGRAM_ID.toBase58());
const net = networkAddresses(cluster);
const connection = new Connection(rpc, "confirmed");
let failures = 0;
const ok = (label: string, pass: boolean, detail = "") => { console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`); if (!pass) failures++; };
const info = (label: string, detail: string) => console.log(`info  ${label}  ${detail}`);

async function program(label: string, id: PublicKey) {
  const acc = await connection.getAccountInfo(id);
  ok(`${label} ${id.toBase58()} exists and is executable`, !!acc && acc.executable);
  if (!acc) return;
  if (acc.owner.equals(BPF_UPGRADEABLE)) {
    const programData = new PublicKey(acc.data.subarray(4, 36));
    const pd = await connection.getAccountInfo(programData);
    if (pd) {
      const hasAuthority = pd.data[12] === 1;
      const authority = hasAuthority ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : "none (immutable)";
      const slot = Number(pd.data.readBigUInt64LE(4));
      info(`${label} upgrade authority`, `${authority}; last deployed slot ${slot}; ${pd.data.length - 45} bytes`);
      if (cluster === "mainnet-beta" && label === "pop_launch" && hasAuthority) info("note", "mainnet upgrade authority must be the disclosed multisig (docs/authority-disclosure.md)");
    }
  } else info(`${label} owner`, acc.owner.toBase58());
}

console.log(`cluster ${cluster}  rpc ${rpc}\n`);
await program("pop_launch", programId);
await program("raydium cp-swap", net.cpSwapProgram);
await program("token metadata", net.tokenMetadataProgram);

const ammConfig = raydiumAmmConfigPda(net.ammConfigIndex, net.cpSwapProgram);
const cfg = await connection.getAccountInfo(ammConfig);
ok(`AmmConfig[${net.ammConfigIndex}] ${ammConfig.toBase58()} exists`, !!cfg);
if (cfg) {
  ok("AmmConfig owned by cp-swap", cfg.owner.equals(net.cpSwapProgram));
  const d = cfg.data;
  const disc = Buffer.from([218, 244, 33, 104, 203, 203, 43, 111]);
  ok("AmmConfig discriminator", d.subarray(0, 8).equals(disc));
  const disableCreatePool = d[9] === 1, index = d.readUInt16LE(10);
  const tradeFee = d.readBigUInt64LE(12), protocolFee = d.readBigUInt64LE(20), fundFee = d.readBigUInt64LE(28), createPoolFee = d.readBigUInt64LE(36);
  const creatorFee = d.readBigUInt64LE(108);
  ok("AmmConfig index matches", index === net.ammConfigIndex, String(index));
  ok("AmmConfig allows pool creation", !disableCreatePool);
  info("AmmConfig fees", `trade ${Number(tradeFee) / 10_000}%  protocol share ${Number(protocolFee) / 10_000}%  fund share ${Number(fundFee) / 10_000}%  creator ${Number(creatorFee) / 10_000}%  create_pool_fee ${Number(createPoolFee) / 1e9} SOL`);
  // Mainnet config 0 carries no creator fee. Raydium's devnet configs all do (it accrues to the pool creator, i.e.
  // the launch authority PDA, where nothing collects it); acceptable for testing, a hard failure for mainnet.
  if (cluster === "mainnet-beta") ok("creator fee rate is zero (no hidden fee on the pool)", creatorFee === 0n);
  else info("creator fee rate", creatorFee === 0n ? "0 (none)" : `${Number(creatorFee) / 10_000}% (devnet test config; accrues to the launch authority, uncollectable)`);
}

const fee = await connection.getAccountInfo(net.createPoolFeeReceiver);
ok(`create-pool fee receiver ${net.createPoolFeeReceiver.toBase58()} exists`, !!fee);
if (fee) {
  let isWsol = false;
  try { const t = AccountLayout.decode(fee.data); isWsol = new PublicKey(t.mint).equals(net.wsolMint); } catch { /* not a token account */ }
  ok("fee receiver is a wrapped-SOL token account", isWsol);
}

const configPda = launchConfigPda(programId);
const pc = await connection.getAccountInfo(configPda);
if (!pc) info("protocol config", `${configPda.toBase58()} not initialized yet on this cluster (expected before initialize_protocol)`);
else {
  const c = await PopLaunchClient.readOnly(connection).fetchConfig();
  const s = c.settings;
  info("protocol config", `authority ${c.authority.toBase58()}  paused ${c.paused}  version ${c.version}`);
  ok("settings.cp_swap_program matches registry", s.cpSwapProgram.equals(net.cpSwapProgram), s.cpSwapProgram.toBase58());
  ok("settings.amm_config matches registry", s.ammConfig.equals(ammConfig), s.ammConfig.toBase58());
  ok("settings.create_pool_fee_receiver matches registry", s.createPoolFeeReceiver.equals(net.createPoolFeeReceiver));
  ok("settings.quote_mint is wrapped SOL", s.quoteMint.equals(net.wsolMint));
  info("settings", `target ${Number(s.targetLamports) / 1e9} SOL  window ${Number(s.fundingWindowSecs) / 3600}h  timeout ${Number(s.settlementTimeoutSecs) / 60}m  fee ${Number(s.creationFeeLamports) / 1e9} SOL to ${s.feeRecipient.toBase58()}  min reserve ${Number(s.minSetupReserveLamports) / 1e9} SOL`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
