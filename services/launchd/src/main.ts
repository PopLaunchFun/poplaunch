import { serve } from "@hono/node-server";
import { Connection, PublicKey } from "@solana/web3.js";
import { buildApi } from "./api.js";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { Keeper } from "./keeper.js";
import { Syncer } from "./sync.js";

const startedAt = Date.now();
await migrate();
const connection = new Connection(config.rpcUrl, "confirmed");
const programId = new PublicKey(config.programId);
const syncer = new Syncer(connection, programId);
const keeper = new Keeper(connection);
await keeper.ensureFunded();

async function loop(name: string, fn: () => Promise<unknown>, ms: number) {
  for (;;) {
    try {
      await fn();
    } catch (e) {
      console.error(`[${name}]`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, ms));
  }
}

void loop("sync", async () => {
  const s = await syncer.scanAccounts();
  const n = await syncer.ingestEvents();
  if (n) console.log(`[sync] slot ${s.slot}: ${s.launches} launches, ${s.receipts} receipts, ${n} new events`);
}, config.syncMs);
void loop("keeper", async () => {
  const n = await keeper.tick();
  if (n) console.log(`[keeper] settled ${n} launch(es)`);
}, config.keeperMs);

serve({ fetch: buildApi(connection, keeper, startedAt).fetch, port: config.port, hostname: "0.0.0.0" });
console.log(`launchd on :${config.port} (${config.network}, program ${config.programId}, keeper ${keeper.address ?? "disabled"})`);
