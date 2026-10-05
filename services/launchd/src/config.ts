import { LAUNCH_PROGRAM_ID } from "@pop/sdk";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://pop:pop@127.0.0.1:5432/poplaunch",
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8899",
  network: process.env.SOLANA_NETWORK ?? "localnet",
  programId: process.env.LAUNCH_PROGRAM_ID ?? LAUNCH_PROGRAM_ID.toBase58(),
  port: Number(process.env.PORT ?? 8788),
  /** Public base URL of this service, used inside metadata URIs. */
  publicUrl: process.env.PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8788}`,
  /** Hostname the web app signs draft messages for (must match what the browser signs). */
  signDomain: process.env.SIGN_DOMAIN ?? "poplaunch.fun",
  syncMs: Number(process.env.SYNC_MS ?? 2500),
  keeperMs: Number(process.env.KEEPER_MS ?? 4000),
  /** Path to the keeper's fee-wallet keypair JSON. The keeper only pays network fees; it has no authority over escrow. */
  keeperKeypairPath: process.env.KEEPER_KEYPAIR ?? "",
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES ?? 1_048_576),
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 240),
  gitCommit: process.env.GIT_COMMIT ?? "unknown",
};
