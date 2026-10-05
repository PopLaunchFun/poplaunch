/**
 * Wallet-signature authentication for draft uploads. The browser signs a domain-bound, expiring message
 * over the sha256 of the exact payload it sends; the server verifies with the wallet's public key, rejects
 * stale or reused signatures, and never needs any key of its own.
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { query } from "./db.js";

export const SIGN_WINDOW_SECS = 600;

export function sha256Hex(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

/** The exact text the wallet signs. Kept identical in apps/poplaunch/src/lib/sign.ts. */
export function draftMessage(domain: string, payloadHash: string, signedAt: number): string {
  return `Pop Launch draft\nDomain: ${domain}\nPayload: ${payloadHash}\nSigned at: ${signedAt}\n\nThis signature only authorizes uploading launch metadata. It does not move funds.`;
}

/** Site-setting message (contract address chip). Kept identical in apps/poplaunch/src/lib/sign.ts. */
export function siteMessage(domain: string, payloadHash: string, signedAt: number): string {
  return `Pop Launch site setting\nDomain: ${domain}\nPayload: ${payloadHash}\nSigned at: ${signedAt}\n\nThis signature only updates text shown on the website. It does not move funds.`;
}

export const verifyDraftSignature = (payload: string, signer: string, signature: string, signedAt: number) => verifySignedPayload(draftMessage, payload, signer, signature, signedAt);
export const verifySiteSignature = (payload: string, signer: string, signature: string, signedAt: number) => verifySignedPayload(siteMessage, payload, signer, signature, signedAt);

async function verifySignedPayload(message: typeof draftMessage, payload: string, signer: string, signature: string, signedAt: number): Promise<PublicKey> {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(signedAt) || Math.abs(now - signedAt) > SIGN_WINDOW_SECS) throw new Error("signature expired");
  let pk: PublicKey;
  try {
    pk = new PublicKey(signer);
  } catch {
    throw new Error("invalid signer");
  }
  const msg = new TextEncoder().encode(message(config.signDomain, sha256Hex(payload), signedAt));
  let sig: Uint8Array;
  try {
    sig = bs58.decode(signature);
  } catch {
    throw new Error("invalid signature encoding");
  }
  if (sig.length !== 64 || !nacl.sign.detached.verify(msg, sig, pk.toBytes())) throw new Error("signature does not verify");
  const [used] = await query(`SELECT 1 FROM used_signatures WHERE signature = $1`, [signature]);
  if (used) throw new Error("signature already used");
  return pk;
}

/** Burn a verified signature. Called only after the upload validated, so a rejected form does not cost a re-sign. */
export async function consumeSignature(signature: string): Promise<void> {
  const used = await query(`INSERT INTO used_signatures (signature) VALUES ($1) ON CONFLICT DO NOTHING RETURNING signature`, [signature]);
  if (used.length === 0) throw new Error("signature already used");
}
