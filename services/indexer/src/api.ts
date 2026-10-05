import { Hono } from "hono";
import { cors } from "hono/cors";
import { Connection, PublicKey } from "@solana/web3.js";
import { PopClient } from "@pop/sdk";
import { config } from "./config.js";
import { query } from "./db.js";
import { readMetadata, verifyAndStore, type MetadataBody } from "./metadata.js";

const INTERVALS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };

/** Simple per-IP token bucket; unauthenticated APIs must be rate limited. */
class RateLimiter {
  private buckets = new Map<string, { tokens: number; ts: number }>();
  constructor(private perMinute: number) {}
  allow(ip: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(ip) ?? { tokens: this.perMinute, ts: now };
    b.tokens = Math.min(this.perMinute, b.tokens + ((now - b.ts) / 60_000) * this.perMinute);
    b.ts = now;
    if (b.tokens < 1) {
      this.buckets.set(ip, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(ip, b);
    if (this.buckets.size > 10_000) this.buckets.clear();
    return true;
  }
}

function isPubkey(s: string | undefined): s is string {
  if (!s) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

export function buildApi(connection: Connection, startedAt: number) {
  const app = new Hono();
  const limiter = new RateLimiter(config.rateLimitPerMinute);
  const writeLimiter = new RateLimiter(10);
  const client = PopClient.readOnly(connection, "confirmed");
  app.use("*", cors());
  app.use("*", async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "local";
    if (!limiter.allow(ip)) return c.json({ error: "rate limited" }, 429);
    await next();
  });

  app.get("/api/status", async (c) => {
    const [cursor] = await query<{ last_slot: string; updated_at: string }>("SELECT last_slot, updated_at FROM indexer_cursor WHERE program_id = $1", [config.programId]);
    const [snap] = await query<{ snapshot_slot: string; updated_at: string }>("SELECT snapshot_slot, updated_at FROM protocol WHERE id = 1");
    const [unfinal] = await query<{ n: string }>("SELECT count(*)::text AS n FROM events WHERE finalized = false");
    let chainSlot: number | null = null;
    let rpcOk = false;
    let programInfo: { executable: boolean; owner: string; upgradeAuthority: string | null; programDataAddress: string | null; lamports: number } | null = null;
    try {
      chainSlot = await connection.getSlot("confirmed");
      rpcOk = true;
      const pid = new PublicKey(config.programId);
      const acc = await connection.getAccountInfo(pid);
      if (acc) {
        let upgradeAuthority: string | null = null;
        let programDataAddress: string | null = null;
        if (acc.owner.toBase58() === "BPFLoaderUpgradeab1e11111111111111111111111" && acc.data.length >= 36) {
          programDataAddress = new PublicKey(acc.data.subarray(4, 36)).toBase58();
          const pd = await connection.getAccountInfo(new PublicKey(programDataAddress));
          if (pd && pd.data.length >= 45) {
            const hasAuthority = pd.data[12] === 1;
            upgradeAuthority = hasAuthority ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
          }
        }
        programInfo = { executable: acc.executable, owner: acc.owner.toBase58(), upgradeAuthority, programDataAddress, lamports: acc.lamports };
      }
    } catch {
      rpcOk = false;
    }
    return c.json({
      network: config.network,
      rpcUrl: config.rpcUrl,
      rpcOk,
      programId: config.programId,
      program: programInfo,
      gitCommit: config.gitCommit,
      chainSlot,
      indexer: { lastSlot: cursor ? Number(cursor.last_slot) : null, updatedAt: cursor?.updated_at ?? null, lagSlots: cursor && chainSlot !== null ? chainSlot - Number(cursor.last_slot) : null, unfinalizedEvents: Number(unfinal?.n ?? 0), uptimeSec: Math.round((Date.now() - startedAt) / 1000) },
      snapshot: { slot: snap ? Number(snap.snapshot_slot) : null, updatedAt: snap?.updated_at ?? null },
      time: new Date().toISOString(),
    });
  });

  /** Directory: activated markets with metadata and a short sparkline of executed prices. */
  app.get("/api/markets", async (c) => {
    const includeCreated = c.req.query("include") === "created";
    const rows = await query<{ state: Record<string, unknown>; base_mint: string; image_url: string | null; description: string | null; website: string | null; twitter: string | null; telegram: string | null; sparkline: number[] | null; vol_all: string; vol_24h: string }>(
      `SELECT m.state, m.base_mint, cm.image_url, cm.description, cm.website, cm.twitter, cm.telegram,
              (SELECT array_agg(avg_price ORDER BY slot, event_index) FROM (SELECT avg_price, slot, event_index FROM trades t WHERE t.market = m.address AND avg_price IS NOT NULL ORDER BY slot DESC, event_index DESC LIMIT 24) x) AS sparkline,
              -- SOL volume on both sides: buys count their gross SOL input, sells their SOL output
              (SELECT coalesce(sum(CASE WHEN is_buy THEN gross_input ELSE output END),0)::text FROM trades t WHERE t.market = m.address) AS vol_all,
              (SELECT coalesce(sum(CASE WHEN is_buy THEN gross_input ELSE output END),0)::text FROM trades t WHERE t.market = m.address AND block_time >= extract(epoch FROM now())::bigint - 86400) AS vol_24h
       FROM markets m LEFT JOIN coin_metadata cm ON cm.mint = m.base_mint
       ${includeCreated ? "" : "WHERE m.status <> 'created'"}
       ORDER BY m.created_slot DESC`,
    );
    return c.json({ markets: rows.map((r) => ({ ...r.state, metadata: { imageUrl: r.image_url, description: r.description, website: r.website, twitter: r.twitter, telegram: r.telegram }, sparkline: r.sparkline ?? [], volumeQuote: { allTime: r.vol_all, last24h: r.vol_24h, definition: "SOL on both sides: buy gross input + sell output" } })) });
  });

  app.get("/api/markets/:address", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const [row] = await query<{ state: Record<string, unknown>; base_mint: string; updated_at: string }>("SELECT state, base_mint, updated_at FROM markets WHERE address = $1", [address]);
    if (!row) return c.json({ error: "not found" }, 404);
    const metadata = await readMetadata(row.base_mint);
    return c.json({ market: { ...row.state, metadata }, updatedAt: row.updated_at });
  });

  /** Creator workspace: every market by this creator (any status) with claimables and missing pages. */
  app.get("/api/creators/:address/markets", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const rows = await query<{ state: Record<string, unknown>; base_mint: string; updated_at: string; vol_all: string }>("SELECT state, base_mint, updated_at, (SELECT coalesce(sum(CASE WHEN is_buy THEN gross_input ELSE output END),0)::text FROM trades t WHERE t.market = markets.address) AS vol_all FROM markets WHERE creator = $1 ORDER BY created_slot DESC", [address]);
    const out = [];
    for (const r of rows) out.push({ ...r.state, metadata: await readMetadata(r.base_mint), updatedAt: r.updated_at, volumeQuote: { allTime: r.vol_all, last24h: null, definition: "SOL on both sides: buy gross input + sell output" } });
    return c.json({ markets: out });
  });

  app.get("/api/coins/:mint/metadata", async (c) => {
    const mint = c.req.param("mint");
    if (!isPubkey(mint)) return c.json({ error: "bad mint" }, 400);
    const m = await readMetadata(mint);
    return c.json({ mint, metadata: m });
  });

  /** Metaplex-style JSON usable as the on-chain `uri`. */
  app.get("/api/coins/:mint/metadata.json", async (c) => {
    const mint = c.req.param("mint");
    if (!isPubkey(mint)) return c.json({ error: "bad mint" }, 400);
    const [row] = await query<{ name: string; symbol: string }>("SELECT name, symbol FROM markets WHERE base_mint = $1", [mint]);
    const m = await readMetadata(mint);
    return c.json({ name: row?.name ?? null, symbol: row?.symbol ?? null, description: m?.description ?? "", image: m?.imageUrl ?? null, external_url: m?.website ?? null, properties: { twitter: m?.twitter ?? null, telegram: m?.telegram ?? null }, launchpad: "POP / Proof of Pain" });
  });

  app.post("/api/coins/:mint/metadata", async (c) => {
    const mint = c.req.param("mint");
    if (!isPubkey(mint)) return c.json({ error: "bad mint" }, 400);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!writeLimiter.allow(ip)) return c.json({ error: "rate limited" }, 429);
    let body: { payload?: MetadataBody; signer?: string; signature?: string; signedAt?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad json" }, 400);
    }
    if (!body.payload || !isPubkey(body.signer) || typeof body.signature !== "string" || typeof body.signedAt !== "number") return c.json({ error: "payload, signer, signature, signedAt required" }, 400);
    try {
      await verifyAndStore(connection, mint, body.payload, body.signer, body.signature, body.signedAt);
      return c.json({ ok: true, metadata: await readMetadata(mint) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.get("/api/markets/:address/bins", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const [row] = await query<{ bins: unknown; snapshot_slot: string; updated_at: string }>("SELECT bins, snapshot_slot, updated_at FROM markets WHERE address = $1", [address]);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ bins: row.bins, snapshotSlot: Number(row.snapshot_slot), updatedAt: row.updated_at });
  });

  app.get("/api/markets/:address/trades", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const rows = await query(
      `SELECT signature, event_index, trader, is_buy, gross_input::text, output::text, scar_fee::text, protocol_fee::text, creator_fee::text, bins_inspected, start_bin, end_bin, avg_price, slot, block_time, finalized
       FROM trades WHERE market = $1 ORDER BY slot DESC, event_index DESC LIMIT $2`,
      [address, limit],
    );
    return c.json({ trades: rows, programId: config.programId });
  });

  app.get("/api/markets/:address/candles", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const interval = c.req.query("interval") ?? "5m";
    const secs = INTERVALS[interval];
    if (!secs) return c.json({ error: "bad interval" }, 400);
    const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit") ?? 300)));
    // Candles are computed from executed trades (buybacks included as executions but flagged);
    // computing on read means replays never double count.
    const rows = await query(
      `WITH t AS (
         SELECT (block_time / $2) * $2 AS bucket, avg_price, slot, event_index,
                CASE WHEN is_buy THEN gross_input ELSE 0 END AS vq,
                CASE WHEN is_buy THEN 0 ELSE gross_input END AS vb
         FROM trades WHERE market = $1 AND avg_price IS NOT NULL AND block_time IS NOT NULL
       )
       SELECT bucket, (array_agg(avg_price ORDER BY slot, event_index))[1] AS open, max(avg_price) AS high, min(avg_price) AS low,
              (array_agg(avg_price ORDER BY slot DESC, event_index DESC))[1] AS close,
              sum(vq)::text AS volume_quote, sum(vb)::text AS volume_base, count(*)::int AS trades
       FROM t GROUP BY bucket ORDER BY bucket DESC LIMIT $3`,
      [address, secs, limit],
    );
    return c.json({ interval, candles: rows.reverse() });
  });

  app.get("/api/markets/:address/scars", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") ?? 100)));
    const rows = await query(`SELECT signature, event_index, bin_id, base::text, quote::text, bin_paired_lifetime::text, market_paired_lifetime::text, slot, block_time, finalized FROM scars WHERE market = $1 ORDER BY slot DESC, event_index DESC LIMIT $2`, [address, limit]);
    return c.json({ scars: rows });
  });

  app.get("/api/markets/:address/events", async (c) => {
    const address = c.req.param("address");
    if (!isPubkey(address)) return c.json({ error: "bad address" }, 400);
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const rows = await query(`SELECT signature, event_index, name, data, slot, block_time, finalized FROM events WHERE market = $1 ORDER BY slot DESC, event_index DESC LIMIT $2`, [address, limit]);
    return c.json({ events: rows });
  });

  /** Buyback escrow transparency: vault, policy, sweeps, withdrawals and observed burns. */
  app.get("/api/buyback", async (c) => {
    const [p] = await query<{ state: { popMint: string; buybackAuthority: string }; buyback: unknown; snapshot_slot: string; updated_at: string }>("SELECT state, buyback, snapshot_slot, updated_at FROM protocol WHERE id = 1");
    if (!p) return c.json({ error: "protocol not initialized" }, 404);
    const sweeps = await query(`SELECT signature, event_index, market, data, slot, block_time, finalized FROM events WHERE name = 'buybackSwept' ORDER BY slot DESC LIMIT 100`);
    const withdrawals = await query(`SELECT signature, event_index, data, slot, block_time, finalized FROM events WHERE name = 'buybackWithdrawn' ORDER BY slot DESC LIMIT 100`);
    const burns = await query(`SELECT signature, amount::text, mint, slot, block_time, finalized FROM buyback_burns ORDER BY slot DESC LIMIT 100`);
    const burnedSigs = new Set(burns.map((b) => b.signature as string));
    const [tot] = await query<{ burned: string }>("SELECT coalesce(sum(amount),0)::text AS burned FROM buyback_burns");
    return c.json({
      popMint: p.state.popMint,
      authority: p.state.buybackAuthority,
      vault: p.buyback,
      totalBurned: tot?.burned ?? "0",
      sweeps,
      withdrawals: withdrawals.map((w) => ({ ...w, burnInSameTx: burnedSigs.has(w.signature as string) })),
      burns,
      snapshotSlot: Number(p.snapshot_slot),
      updatedAt: p.updated_at,
    });
  });

  app.get("/api/totals", async (c) => {
    const [t] = await query<{ markets: string; trades: string; scars: string; paired: string; graduated: string }>(
      `SELECT (SELECT count(*)::text FROM markets) AS markets,
              (SELECT count(*)::text FROM trades) AS trades,
              (SELECT count(*)::text FROM scars) AS scars,
              (SELECT coalesce(sum((state->'maturity'->>'pairedQuoteLifetime')::numeric),0)::text FROM markets) AS paired,
              (SELECT count(*)::text FROM markets WHERE status = 'graduated') AS graduated,
              (SELECT count(*)::text FROM markets WHERE status <> 'created') AS activeMarkets`,
    );
    return c.json({ totals: t });
  });

  /** Optional quote endpoint: fresh RPC state, exact math, state fingerprint. */
  app.get("/api/quote", async (c) => {
    const market = c.req.query("market");
    const direction = c.req.query("direction");
    const amount = c.req.query("amount");
    if (!isPubkey(market) || (direction !== "buy" && direction !== "sell") || !amount || !/^\d+$/.test(amount)) return c.json({ error: "market, direction=buy|sell, amount (atomic) required" }, 400);
    try {
      const v = await client.fetchMarket(new PublicKey(market));
      const slot = await connection.getSlot("confirmed");
      const q = client.quote(v, direction, BigInt(amount));
      const fingerprint = `${v.state.cursor}:${v.state.swapCount}:${v.state.pairedQuoteLifetime}`;
      if (!q.ok) return c.json({ ok: false, error: q.error, detail: q.detail, slot, fingerprint });
      return c.json({
        ok: true,
        slot,
        fingerprint,
        configVersion: v.config.configVersion,
        output: q.output.toString(),
        fees: { gross: q.fees.gross.toString(), scarFee: q.fees.scarFee.toString(), protocolFee: q.fees.protocolFee.toString(), creatorFee: q.fees.creatorFee.toString(), tradable: q.fees.tradable.toString() },
        binsInspected: q.binsInspected,
        fills: q.fills.map((f) => ({ bin: f.bin, input: f.input.toString(), output: f.output.toString() })),
        pages: q.pagesTouched,
        newCursor: q.newCursor,
        startPriceX64: q.startPriceX64.toString(),
        endPriceX64: q.endPriceX64.toString(),
        avgPriceX64: q.avgPriceX64?.toString() ?? null,
      });
    } catch (e) {
      return c.json({ ok: false, error: "rpc", detail: String((e as Error).message) }, 502);
    }
  });

  return app;
}
