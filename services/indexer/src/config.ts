import { PROGRAM_ID } from "@pop/sdk";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://pop:pop@127.0.0.1:5432/pop",
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8899",
  network: process.env.SOLANA_NETWORK ?? "localnet",
  programId: process.env.PROGRAM_ID ?? PROGRAM_ID.toBase58(),
  port: Number(process.env.PORT ?? 8787),
  pollMs: Number(process.env.POLL_MS ?? 2000),
  snapshotMs: Number(process.env.SNAPSHOT_MS ?? 10000),
  gitCommit: process.env.GIT_COMMIT ?? "unknown",
  /** Max requests per minute per IP on unauthenticated endpoints. */
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 240),
  /** Optional SOL/USD price endpoint; when unset USD displays degrade to SOL. */
  solUsdUrl: process.env.SOL_USD_URL ?? "",
};
