import { serve } from "@hono/node-server";
import { Connection } from "@solana/web3.js";
import { buildApi } from "./api.js";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { Ingester } from "./ingest.js";
import { Snapshotter } from "./snapshot.js";

const startedAt = Date.now();
await migrate();
const connection = new Connection(config.rpcUrl, "confirmed");
const ingester = new Ingester(connection);
const snapshotter = new Snapshotter(connection);

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

void loop("ingest", async () => {
  const n = await ingester.poll();
  if (n) console.log(`[ingest] ${n} signatures`);
  const f = await ingester.finalize();
  if (f.finalized || f.rolledBack) console.log(`[finalize] finalized=${f.finalized} rolledBack=${f.rolledBack}`);
}, config.pollMs);
void loop("snapshot", () => snapshotter.run(), config.snapshotMs);

const app = buildApi(connection, startedAt);
serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`[api] listening on http://127.0.0.1:${info.port} (network ${config.network}, program ${config.programId})`));
