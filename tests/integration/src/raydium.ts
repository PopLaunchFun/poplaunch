/**
 * Raydium CP-Swap localnet fixture helpers. The program binary is built from Raydium's source with the
 * `localnet` feature (scripts/raydium-fixture.sh) so the deterministic test admin below may create an
 * AmmConfig; everything else (pool PDAs, fees, LP minting, minimum-liquidity lock) is the real program.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnchorProvider, Program } from "@anchor-lang/core";
import type { RaydiumCpSwap } from "../../fixtures/raydium_cp_swap.js";
import BN from "bn.js";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { RAYDIUM_CP_SWAP, raydiumAmmConfigPda } from "@pop/sdk";
import { KeypairWallet } from "./harness.js";

export const RAYDIUM_IDL = JSON.parse(readFileSync(new URL("../../fixtures/raydium_cp_swap.json", import.meta.url), "utf8")) as RaydiumCpSwap;

/** The admin the fixture was built with (see scripts/raydium-fixture.sh). Deterministic, test-only. */
export function localnetAdmin(): Keypair {
  return Keypair.fromSeed(createHash("sha256").update("poplaunch-cpswap-localnet-admin").digest());
}

export interface AmmConfigParams {
  index: number;
  tradeFeeRate: bigint;
  protocolFeeRate: bigint;
  fundFeeRate: bigint;
  createPoolFee: bigint;
  creatorFeeRate: bigint;
}

/** Mirrors Raydium's standard mainnet config 0: 0.25% trade fee, 0.15 SOL pool creation fee. */
export const MAINNET_LIKE_CONFIG: AmmConfigParams = { index: 0, tradeFeeRate: 2500n, protocolFeeRate: 120_000n, fundFeeRate: 40_000n, createPoolFee: 150_000_000n, creatorFeeRate: 0n };

export async function ensureAmmConfig(connection: Connection, params: AmmConfigParams = MAINNET_LIKE_CONFIG): Promise<PublicKey> {
  const admin = localnetAdmin();
  const config = raydiumAmmConfigPda(params.index);
  if (await connection.getAccountInfo(config, "confirmed")) return config;
  if ((await connection.getBalance(admin.publicKey, "confirmed")) < LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(admin.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
  }
  const provider = new AnchorProvider(connection, new KeypairWallet(admin), { commitment: "confirmed" });
  const program = new Program<RaydiumCpSwap>(RAYDIUM_IDL, provider);
  const bn = (x: bigint) => new BN(x.toString());
  await program.methods
    .createAmmConfig(params.index, bn(params.tradeFeeRate), bn(params.protocolFeeRate), bn(params.fundFeeRate), bn(params.createPoolFee), bn(params.creatorFeeRate))
    .accountsPartial({ owner: admin.publicKey, ammConfig: config, systemProgram: SystemProgram.programId })
    .rpc({ commitment: "confirmed" });
  return config;
}

export function raydiumProgram(connection: Connection): Program<RaydiumCpSwap> {
  const provider = new AnchorProvider(connection, new KeypairWallet(Keypair.generate()), { commitment: "confirmed" });
  return new Program<RaydiumCpSwap>(RAYDIUM_IDL, provider);
}

export async function fetchPoolState(connection: Connection, poolState: PublicKey) {
  return raydiumProgram(connection).account.poolState.fetch(poolState);
}

export { RAYDIUM_CP_SWAP };
