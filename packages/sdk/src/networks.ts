/**
 * Per-network addresses the launch program depends on. Every value here is read into a launch's
 * immutable settings at creation and re-verified by the program on settlement, so a wrong value cannot
 * steal funds; it can only make settlement fail (and the launch refund). Still, each address must be
 * verified against the live cluster before `initialize_protocol` runs there: `pnpm --filter @pop/integration verify:addresses`.
 *
 * Sources (checked 2026-10-05):
 *  - Raydium CP-Swap program ids, create-pool fee receivers and admin ids: `programs/cp-swap/src/lib.rs`
 *    in github.com/raydium-io/raydium-cp-swap (declare_id! and pubkey! constants, mainnet and devnet).
 *  - AMM config accounts are PDAs of ["amm_config", u16 index] under the CP-Swap program; the fee tier
 *    (trade / protocol / fund fee, create_pool_fee) is read live by the verification script, never assumed.
 *  - Metaplex Token Metadata program id: the same on every cluster.
 */
import { PublicKey } from "@solana/web3.js";

export type ClusterName = "localnet" | "devnet" | "mainnet-beta";

export interface NetworkAddresses {
  cluster: ClusterName;
  /** Raydium CP-Swap (CPMM) program. */
  cpSwapProgram: PublicKey;
  /** Raydium's hardcoded pool-creation fee receiver (a wrapped-SOL token account). */
  createPoolFeeReceiver: PublicKey;
  /** Raydium admin that creates AmmConfig accounts (informational; verified for provenance). */
  cpSwapAdmin: PublicKey;
  /** AmmConfig index the protocol settings point at. Index 0 is Raydium's standard 0.25% tier on mainnet; verify live. */
  ammConfigIndex: number;
  /** Metaplex Token Metadata program. */
  tokenMetadataProgram: PublicKey;
  /** Wrapped SOL mint. */
  wsolMint: PublicKey;
  /** Where the string came from, for the disclosure page. */
  provenance: string;
}

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
import { WSOL_MINT } from "./pda.js";
export { WSOL_MINT };

const MAINNET: NetworkAddresses = {
  cluster: "mainnet-beta",
  cpSwapProgram: new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"),
  createPoolFeeReceiver: new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"),
  cpSwapAdmin: new PublicKey("GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ"),
  ammConfigIndex: 0,
  tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
  wsolMint: WSOL_MINT,
  provenance: "raydium-cp-swap lib.rs (mainnet cfg), 2026-10-05",
};

const DEVNET: NetworkAddresses = {
  cluster: "devnet",
  cpSwapProgram: new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"),
  createPoolFeeReceiver: new PublicKey("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy"),
  cpSwapAdmin: new PublicKey("DRayqG9RXYi8WHgWEmRQGrUWRWbhjYWYkCRJDd6JBBak"),
  ammConfigIndex: 0,
  tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
  wsolMint: WSOL_MINT,
  provenance: "raydium-cp-swap lib.rs (devnet cfg), 2026-10-05. An older devnet deployment CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW also exists; the current source declares DRaycp…",
};

/** Localnet runs the mainnet-id fixture built from source (scripts/raydium-fixture.sh) with a test admin and a preloaded fee account. */
const LOCALNET: NetworkAddresses = {
  ...MAINNET,
  cluster: "localnet",
  cpSwapAdmin: new PublicKey("FYUEYom2oZYEj7Mp8ndYQww2Pr86uJ35pB4YSAB1RorR"),
  provenance: "localnet fixture: mainnet program id, test admin sha256('poplaunch-cpswap-localnet-admin')",
};

export const NETWORKS: Record<ClusterName, NetworkAddresses> = { "mainnet-beta": MAINNET, devnet: DEVNET, localnet: LOCALNET };

export function networkAddresses(cluster: string): NetworkAddresses {
  const n = NETWORKS[cluster as ClusterName];
  if (!n) throw new Error(`unknown cluster ${cluster}`);
  return n;
}
