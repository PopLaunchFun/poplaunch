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
void loop("housekeeping", () => syncer.housekeeping(config.draftTtlHours), 5 * 60_000);

// Alert transitions are logged once each way so a log-based monitor can page on the word ALERT.
let active = new Set<string>();
void loop("alerts", async () => {
  const r = await fetch(`http://127.0.0.1:${config.port}/api/status`).then((x) => x.json() as Promise<{ alerts: string[] }>).catch(() => null);
  if (!r) return;
  const now = new Set(r.alerts);
  for (const a of now) if (!active.has(a)) console.error(`ALERT raised ${a}`);
  for (const a of active) if (!now.has(a)) console.error(`ALERT cleared ${a}`);
  active = now;
}, 30_000);

serve({ fetch: buildApi(connection, keeper, startedAt).fetch, port: config.port, hostname: "0.0.0.0" });
console.log(`launchd on :${config.port} (${config.network}, program ${config.programId}, keeper ${keeper.address ?? "disabled"})`);
