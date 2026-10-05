/**
 * Off-chain coin metadata (image URL, description, socials) written by the creator through a
 * signed message. The on-chain Market stores name/symbol/uri immutably; this record is editable
 * by the creator only, sanitized, and never fetched server-side (no URL proxy).
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey, type Connection } from "@solana/web3.js";
import { PopClient } from "@pop/sdk";
import { query } from "./db.js";

export interface MetadataBody {
  imageUrl?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export const METADATA_LIMITS = { imageUrl: 512, description: 500, website: 200, twitter: 64, telegram: 64 } as const;

function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!t) return null;
  if (t.length > max) throw new Error(`field exceeds ${max} characters`);
  return t;
}

function cleanUrl(s: unknown, max: number): string | null {
  const t = cleanText(s, max);
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new Error("invalid URL");
  }
  if (u.protocol !== "https:") throw new Error("only https URLs are accepted");
  return u.toString();
}

function cleanHandle(s: unknown, max: number): string | null {
  const t = cleanText(s, max);
  if (!t) return null;
  if (!/^[A-Za-z0-9_]{1,64}$/.test(t.replace(/^@/, ""))) throw new Error("invalid handle");
  return t.replace(/^@/, "");
}

export function sanitize(body: MetadataBody) {
  return {
    imageUrl: cleanUrl(body.imageUrl, METADATA_LIMITS.imageUrl),
    description: cleanText(body.description, METADATA_LIMITS.description),
    website: cleanUrl(body.website, METADATA_LIMITS.website),
    twitter: cleanHandle(body.twitter, METADATA_LIMITS.twitter),
    telegram: cleanHandle(body.telegram, METADATA_LIMITS.telegram),
  };
}

/** Canonical message the creator signs (wallet `signMessage`). Shared with the web client. */
export function canonicalMessage(mint: string, payload: ReturnType<typeof sanitize>, signedAt: number): string {
  const json = JSON.stringify(payload);
  const hash = createHash("sha256").update(json).digest("hex");
  return `pop-coin-metadata:v1\nmint:${mint}\nsha256:${hash}\nts:${signedAt}`;
}

export async function verifyAndStore(connection: Connection, mint: string, body: MetadataBody, signer: string, signature: string, signedAt: number): Promise<void> {
  const payload = sanitize(body);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(signedAt) || Math.abs(now - signedAt) > 600) throw new Error("timestamp outside the 10 minute window");
  const msg = new TextEncoder().encode(canonicalMessage(mint, payload, signedAt));
  const ok = nacl.sign.detached.verify(msg, bs58.decode(signature), new PublicKey(signer).toBytes());
  if (!ok) throw new Error("bad signature");
  // Only the on-chain creator may write.
  const client = PopClient.readOnly(connection);
  const market = PopClient.marketAddress(client.programId, new PublicKey(mint));
  const raw = await client.fetchMarketRaw(market);
  if (!raw.creator.equals(new PublicKey(signer))) throw new Error("signer is not the market creator");
  const [existing] = await query<{ signed_at: string }>("SELECT signed_at FROM coin_metadata WHERE mint = $1", [mint]);
  if (existing && Number(existing.signed_at) >= signedAt) throw new Error("stale signature");
  await query(
    `INSERT INTO coin_metadata (mint, creator, image_url, description, website, twitter, telegram, signature, signed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (mint) DO UPDATE SET image_url = EXCLUDED.image_url, description = EXCLUDED.description, website = EXCLUDED.website, twitter = EXCLUDED.twitter, telegram = EXCLUDED.telegram, signature = EXCLUDED.signature, signed_at = EXCLUDED.signed_at, updated_at = now()`,
    [mint, signer, payload.imageUrl, payload.description, payload.website, payload.twitter, payload.telegram, signature, signedAt],
  );
}

export async function readMetadata(mint: string) {
  const [row] = await query<{ image_url: string | null; description: string | null; website: string | null; twitter: string | null; telegram: string | null; updated_at: string }>("SELECT image_url, description, website, twitter, telegram, updated_at FROM coin_metadata WHERE mint = $1", [mint]);
  if (!row) return null;
  return { imageUrl: row.image_url, description: row.description, website: row.website, twitter: row.twitter, telegram: row.telegram, updatedAt: row.updated_at };
}
