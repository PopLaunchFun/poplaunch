import { serve } from "@hono/node-server";
import { Connection } from "@solana/web3.js";
import { buildApi } from "./api.js";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { Ingester } from "./ingest.js";
import { Snapshotter } from "./snapshot.js";
import { BurnWatcher } from "./burns.js";
import { PublicKey } from "@solana/web3.js";
import { query } from "./db.js";

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
const burns = new BurnWatcher(connection);
void loop("burns", async () => {
  const [p] = await query<{ state: { popMint: string; buybackAuthority: string } }>("SELECT state FROM protocol WHERE id = 1");
  if (!p || !p.state.popMint || p.state.popMint === PublicKey.default.toBase58()) return;
  const n = await burns.poll(new PublicKey(p.state.popMint), new PublicKey(p.state.buybackAuthority));
  if (n) console.log(`[burns] ${n} signatures on the buyback POP account`);
  await burns.finalize();
}, config.pollMs * 5);

const app = buildApi(connection, startedAt);
serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`[api] listening on http://127.0.0.1:${info.port} (network ${config.network}, program ${config.programId})`));
