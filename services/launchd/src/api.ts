import { Hono } from "hono";
import { cors } from "hono/cors";
import { PublicKey, type Connection } from "@solana/web3.js";
import { entitlement, launchPda } from "@pop/sdk";
import { config } from "./config.js";
import { query } from "./db.js";
import { sha256Hex, verifyDraftSignature } from "./auth.js";
import type { Keeper } from "./keeper.js";

type Row = Record<string, string | number | null>;

const STATE = ["funding", "ready", "live", "refundable"] as const;

/** Effective state: refundability derived from chain time exactly like the program does. */
function effectiveState(r: Row, now: number): { state: (typeof STATE)[number]; refundReason: number } {
  const chain = Number(r.chain_state);
  const raised = BigInt(String(r.raised_lamports)), target = BigInt(String(r.target_lamports));
  if (chain === 0 && now >= Number(r.funding_deadline) && raised < target) return { state: "refundable", refundReason: 1 };
  if (chain === 1 && now >= Number(r.settlement_deadline)) return { state: "refundable", refundReason: 2 };
  return { state: STATE[chain] ?? "refundable", refundReason: Number(r.refund_reason) };
}

function pctBps(r: Row): number {
  const raised = BigInt(String(r.raised_lamports)), target = BigInt(String(r.target_lamports));
  return target === 0n ? 0 : Number((raised * 10_000n) / target);
}

async function draftFor(mint: string) {
  const [d] = await query<{ description: string | null; website: string | null; x: string | null; image_id: string; published_at: string | null }>(`SELECT description, website, x, image_id, published_at FROM drafts WHERE mint = $1`, [mint]);
  return d ?? null;
}

function toDto(r: Row, now: number, extra: { image: string | null; description: string | null; website: string | null; x: string | null; attempts?: unknown[] }) {
  const eff = effectiveState(r, now);
  const num = (k: string) => (r[k] === null ? null : Number(r[k]));
  return {
    address: r.address,
    id: r.mint, // routes use the mint: names and tickers are not unique
    mint: r.mint,
    creator: r.creator,
    version: num("version"),
    state: eff.state,
    chainState: STATE[Number(r.chain_state)],
    refundReason: eff.refundReason,
    name: r.name,
    symbol: r.symbol,
    uri: r.uri,
    metadataHash: r.metadata_hash,
    image: extra.image,
    description: extra.description,
    website: extra.website,
    x: extra.x,
    targetLamports: String(r.target_lamports),
    raisedLamports: String(r.raised_lamports),
    pctBps: pctBps(r),
    backerWallets: num("backer_wallets"),
    supply: String(r.supply),
    decimals: num("decimals"),
    backerAllocation: String(r.backer_allocation),
    poolAllocation: String(r.pool_allocation),
    openedAt: num("opened_at"),
    fundingDeadline: num("funding_deadline"),
    filledAt: num("filled_at") || null,
    settlementDeadline: num("settlement_deadline") || null,
    liveAt: num("live_at") || null,
    poolState: r.pool_state,
    lpMint: r.lp_mint,
    lpBurned: String(r.lp_burned),
    settledQuote: String(r.settled_quote),
    settledBase: String(r.settled_base),
    totalClaimed: String(r.total_claimed),
    totalRefunded: String(r.total_refunded),
    setupReserveFunded: String(r.setup_reserve_funded),
    setupReserveReclaimed: String(r.setup_reserve_reclaimed),
    creationFeePaid: String(r.creation_fee_paid),
    cpSwapProgram: r.cp_swap_program,
    ammConfig: r.amm_config,
    updatedSlot: num("updated_slot"),
    updatedAt: r.updated_at,
    settlementAttempts: extra.attempts ?? [],
  };
}

const MAGIC: [string, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];
function sniffImage(bytes: Uint8Array): string | null {
  for (const [mime, magic] of MAGIC) if (magic.every((b, i) => bytes[i] === b)) return mime === "image/webp" ? (bytes[8] === 0x57 && bytes[9] === 0x45 ? mime : null) : mime;
  return null;
}

const clean = (s: unknown, max: number) => {
  if (typeof s !== "string") return "";
  const t = s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  if (t.length > max) throw new Error(`field exceeds ${max} characters`);
  return t;
};
const cleanUrl = (s: unknown) => {
  const t = clean(s, 200);
  if (!t) return "";
  const u = new URL(t);
  if (u.protocol !== "https:") throw new Error("only https links are accepted");
  return u.toString();
};
const cleanHandle = (s: unknown) => {
  const t = clean(s, 32).replace(/^@/, "");
  if (t && !/^[A-Za-z0-9_]{1,15}$/.test(t)) throw new Error("invalid X handle");
  return t;
};

export function buildApi(connection: Connection, keeper: Keeper, startedAt: number) {
  const app = new Hono();
  app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));
  const hits = new Map<string, { n: number; t: number }>();
  app.use("*", async (c, next) => {
    const ip = c.req.header("x-forwarded-for") ?? "local";
    const now = Date.now();
    const h = hits.get(ip) ?? { n: 0, t: now };
    if (now - h.t > 60_000) { h.n = 0; h.t = now; }
    h.n++;
    hits.set(ip, h);
    if (h.n > config.rateLimitPerMinute) return c.json({ error: "rate limited" }, 429);
    await next();
  });

  app.get("/api/status", async (c) => {
    const [scan] = await query<{ value: string; updated_at: string }>(`SELECT value, updated_at FROM sync WHERE key = 'scan_slot'`);
    let chainSlot: number | null = null, rpcOk = true;
    try { chainSlot = await connection.getSlot("confirmed"); } catch { rpcOk = false; }
    const [counts] = await query<{ launches: string; receipts: string; events: string }>(`SELECT (SELECT count(*) FROM launches) AS launches, (SELECT count(*) FROM receipts) AS receipts, (SELECT count(*) FROM events) AS events`);
    return c.json({ network: config.network, rpcUrl: config.rpcUrl, rpcOk, programId: config.programId, keeper: keeper.address, keeperEnabled: !!keeper.address, chainSlot, scanSlot: scan ? Number(scan.value) : null, scanUpdatedAt: scan?.updated_at ?? null, lagSlots: chainSlot !== null && scan ? chainSlot - Number(scan.value) : null, counts, gitCommit: config.gitCommit, uptimeSec: Math.round((Date.now() - startedAt) / 1000), time: new Date().toISOString() });
  });

  /** Discovery feed. tab=filling (funding + ready, highest % then soonest deadline then id) | launched (live, newest first). */
  app.get("/api/launches", async (c) => {
    const now = Math.floor(Date.now() / 1000);
    const tab = c.req.query("tab") === "launched" ? "launched" : "filling";
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 60)));
    const cursor = Math.max(0, Number(c.req.query("cursor") ?? 0));
    const rows = await query<Row>(`SELECT * FROM launches`);
    let items = rows
      .map((r) => ({ r, eff: effectiveState(r, now) }))
      .filter(({ eff }) => (tab === "launched" ? eff.state === "live" : eff.state === "funding" || eff.state === "ready"))
      .filter(({ r }) => !q || String(r.name).toLowerCase().includes(q) || String(r.symbol).toLowerCase().includes(q) || String(r.mint).toLowerCase().startsWith(q));
    items = tab === "launched"
      ? items.sort((a, b) => Number(b.r.live_at) - Number(a.r.live_at) || String(a.r.mint).localeCompare(String(b.r.mint)))
      : items.sort((a, b) => pctBps(b.r) - pctBps(a.r) || Number(a.r.funding_deadline) - Number(b.r.funding_deadline) || String(a.r.address).localeCompare(String(b.r.address)));
    const page = items.slice(cursor, cursor + limit);
    const out = [];
    for (const { r } of page) {
      const d = await draftFor(String(r.mint));
      out.push(toDto(r, now, { image: d ? `${config.publicUrl}/api/images/${d.image_id}` : null, description: d?.description ?? null, website: d?.website ?? null, x: d?.x ?? null }));
    }
    const [scan] = await query<{ value: string; updated_at: string }>(`SELECT value, updated_at FROM sync WHERE key = 'scan_slot'`);
    return c.json({ launches: out, nextCursor: cursor + limit < items.length ? cursor + limit : null, total: items.length, scanSlot: scan ? Number(scan.value) : null, scanUpdatedAt: scan?.updated_at ?? null, time: new Date().toISOString() });
  });

  app.get("/api/launches/:id", async (c) => {
    const id = c.req.param("id");
    const now = Math.floor(Date.now() / 1000);
    const [r] = await query<Row>(`SELECT * FROM launches WHERE mint = $1 OR address = $1`, [id]);
    if (!r) return c.json({ error: "not found" }, 404);
    const d = await draftFor(String(r.mint));
    const attempts = await query(`SELECT signature, status, error, created_at AS "createdAt" FROM settlement_attempts WHERE launch = $1 ORDER BY created_at DESC LIMIT 10`, [r.address]);
    const [scan] = await query<{ value: string; updated_at: string }>(`SELECT value, updated_at FROM sync WHERE key = 'scan_slot'`);
    return c.json({ launch: toDto(r, now, { image: d ? `${config.publicUrl}/api/images/${d.image_id}` : null, description: d?.description ?? null, website: d?.website ?? null, x: d?.x ?? null, attempts }), scanSlot: scan ? Number(scan.value) : null, scanUpdatedAt: scan?.updated_at ?? null, time: new Date().toISOString() });
  });

  app.get("/api/launches/:id/events", async (c) => {
    const id = c.req.param("id");
    const [r] = await query<{ address: string }>(`SELECT address FROM launches WHERE mint = $1 OR address = $1`, [id]);
    if (!r) return c.json({ error: "not found" }, 404);
    const events = await query(`SELECT signature, event_index AS "eventIndex", name, wallet, data, slot, block_time AS "blockTime" FROM events WHERE launch = $1 ORDER BY slot DESC, event_index DESC LIMIT 200`, [r.address]);
    return c.json({ events });
  });

  /** Everything one wallet has to do with launches: receipts with their single relevant action, created launches, and its transaction history. */
  app.get("/api/wallets/:address/launches", async (c) => {
    const owner = c.req.param("address");
    try { new PublicKey(owner); } catch { return c.json({ error: "invalid address" }, 400); }
    const now = Math.floor(Date.now() / 1000);
    const rows = await query<Row & { contributed: string; claimed: string; refunded: string }>(
      `SELECT l.*, r.contributed, r.claimed, r.refunded FROM receipts r JOIN launches l ON l.address = r.launch WHERE r.owner = $1`,
      [owner],
    );
    const entries = [];
    for (const r of rows) {
      const eff = effectiveState(r, now);
      const contributed = BigInt(r.contributed), claimed = BigInt(r.claimed), refunded = BigInt(r.refunded);
      const entitled = entitlement(contributed, BigInt(String(r.target_lamports)), BigInt(String(r.backer_allocation)));
      const action = eff.state === "live" && entitled > claimed ? "claim" : eff.state === "refundable" && contributed > refunded ? "refund" : eff.state === "funding" || eff.state === "ready" ? "wait" : "done";
      const d = await draftFor(String(r.mint));
      entries.push({ launch: toDto(r, now, { image: d ? `${config.publicUrl}/api/images/${d.image_id}` : null, description: d?.description ?? null, website: d?.website ?? null, x: d?.x ?? null }), receipt: { contributed: r.contributed, claimed: r.claimed, refunded: r.refunded, entitled: entitled.toString() }, action });
    }
    const createdRows = await query<Row>(`SELECT * FROM launches WHERE creator = $1 ORDER BY opened_at DESC`, [owner]);
    const created = [];
    for (const r of createdRows) {
      const d = await draftFor(String(r.mint));
      created.push(toDto(r, now, { image: d ? `${config.publicUrl}/api/images/${d.image_id}` : null, description: d?.description ?? null, website: d?.website ?? null, x: d?.x ?? null }));
    }
    const history = await query(`SELECT signature, name, launch, data, slot, block_time AS "blockTime" FROM events WHERE wallet = $1 ORDER BY slot DESC LIMIT 200`, [owner]);
    const drafts = await query(`SELECT mint, name, symbol, created_at AS "createdAt", published_at AS "publishedAt" FROM drafts WHERE creator = $1 AND published_at IS NULL ORDER BY created_at DESC`, [owner]);
    return c.json({ entries, created, history, drafts, time: new Date().toISOString() });
  });

  /**
   * Draft upload: multipart with `payload` (JSON string: name, symbol, description, website, x, mint),
   * `signer`, `signature` (base58 ed25519 over the draft message), `signedAt` (unix seconds) and `image`.
   * Returns the frozen metadata URI and hash the creator passes to create_launch.
   */
  app.post("/api/drafts", async (c) => {
    try {
      const form = await c.req.formData();
      const payload = String(form.get("payload") ?? "");
      const signer = String(form.get("signer") ?? "");
      const signature = String(form.get("signature") ?? "");
      const signedAt = Number(form.get("signedAt") ?? 0);
      const file = form.get("image");
      if (!(file instanceof File)) throw new Error("image file required");
      if (file.size > config.maxImageBytes) throw new Error(`image larger than ${config.maxImageBytes} bytes`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = sniffImage(bytes);
      if (!mime) throw new Error("unsupported image type (png, jpeg, gif or webp)");
      const pk = await verifyDraftSignature(payload, signer, signature, signedAt);
      const p = JSON.parse(payload) as Record<string, unknown>;
      const name = clean(p.name, 32), symbol = clean(p.symbol, 10).toUpperCase();
      if (!name) throw new Error("name required");
      if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new Error("ticker must be 1-10 letters or digits");
      const description = clean(p.description, 500), website = cleanUrl(p.website), x = cleanHandle(p.x);
      const mint = new PublicKey(String(p.mint)).toBase58();
      const [existing] = await query<{ published_at: string | null; creator: string }>(`SELECT published_at, creator FROM drafts WHERE mint = $1`, [mint]);
      if (existing?.published_at) throw new Error("this launch is already published; its metadata is frozen");
      if (existing && existing.creator !== pk.toBase58()) throw new Error("draft belongs to another wallet");
      const imageId = sha256Hex(bytes);
      await query(`INSERT INTO images (id, mime, bytes, size) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [imageId, mime, Buffer.from(bytes), bytes.length]);
      const image = `${config.publicUrl}/api/images/${imageId}`;
      const metadata = {
        name, symbol, description: description || undefined, image,
        external_url: website || undefined,
        properties: { files: [{ uri: image, type: mime }], category: "image", x: x || undefined, launch: { mint, program: config.programId, network: config.network } },
      };
      const metadataJson = canonical(metadata);
      const metadataHash = sha256Hex(metadataJson);
      await query(
        `INSERT INTO drafts (mint, creator, name, symbol, description, website, x, image_id, metadata_json, metadata_hash, signed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (mint) DO UPDATE SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, description=EXCLUDED.description, website=EXCLUDED.website, x=EXCLUDED.x, image_id=EXCLUDED.image_id, metadata_json=EXCLUDED.metadata_json, metadata_hash=EXCLUDED.metadata_hash, signed_at=EXCLUDED.signed_at
         WHERE drafts.published_at IS NULL`,
        [mint, pk.toBase58(), name, symbol, description || null, website || null, x || null, imageId, metadataJson, metadataHash, signedAt],
      );
      return c.json({ ok: true, mint, name, symbol, image, uri: `${config.publicUrl}/api/launches/${mint}/metadata.json`, metadataHash });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  app.get("/api/drafts/:mint", async (c) => {
    const [d] = await query(`SELECT mint, creator, name, symbol, description, website, x, image_id AS "imageId", metadata_hash AS "metadataHash", created_at AS "createdAt", published_at AS "publishedAt" FROM drafts WHERE mint = $1`, [c.req.param("mint")]);
    if (!d) return c.json({ error: "not found" }, 404);
    return c.json({ draft: { ...d, image: `${config.publicUrl}/api/images/${(d as { imageId: string }).imageId}`, uri: `${config.publicUrl}/api/launches/${(d as { mint: string }).mint}/metadata.json` } });
  });

  /** The frozen metadata document the on-chain `uri` points to. Served byte-for-byte as hashed. */
  app.get("/api/launches/:mint/metadata.json", async (c) => {
    const [d] = await query<{ metadata_json: unknown; metadata_hash: string }>(`SELECT metadata_json, metadata_hash FROM drafts WHERE mint = $1`, [c.req.param("mint")]);
    if (!d) return c.json({ error: "not found" }, 404);
    c.header("content-type", "application/json; charset=utf-8");
    c.header("x-metadata-sha256", d.metadata_hash);
    c.header("cache-control", "public, max-age=60");
    return c.body(canonical(d.metadata_json));
  });

  app.get("/api/images/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f]{64}$/.test(id)) return c.text("not found", 404);
    const [img] = await query<{ mime: string; bytes: Buffer }>(`SELECT mime, bytes FROM images WHERE id = $1`, [id]);
    if (!img) return c.text("not found", 404);
    c.header("content-type", img.mime);
    c.header("cache-control", "public, max-age=31536000, immutable");
    c.header("content-security-policy", "default-src 'none'");
    return c.body(new Uint8Array(img.bytes));
  });

  app.get("/api/pda/:mint", (c) => c.json({ launch: launchPda(new PublicKey(c.req.param("mint"))).toBase58() }));
  return app;
}

/** Canonical JSON: sorted keys, no whitespace, undefined dropped. Stable across runs so the hash is reproducible. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
