"use client";
/**
 * Three-stage launch state machine: create_market (1 sig) -> launch pages (1 sig) -> wrap + activate (1 sig),
 * then the signed off-chain metadata. Each stage checks on-chain state first, so retries never duplicate.
 */
import { AnchorProvider } from "@anchor-lang/core";
import { Keypair, PublicKey, SystemProgram, Transaction, type Connection } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PopClient, marketPda } from "@pop/sdk";
import bs58 from "bs58";
import { api } from "./api";
import { loadPending, savePending, clearPending, type PendingLaunch } from "./launch-store";

export type Stage = "idle" | "creating" | "pages" | "activating" | "metadata" | "done";

export interface WalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]>;
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
}

export class LaunchError extends Error {
  constructor(public kind: "rejected" | "insufficient" | "network" | "failed", message: string) {
    super(message);
  }
}

function classify(e: unknown): LaunchError {
  const msg = (e as Error).message ?? String(e);
  if (/User rejected|rejected the request/i.test(msg)) return new LaunchError("rejected", "Signature rejected in wallet. Nothing was sent; you can retry.");
  if (/insufficient lamports|insufficient funds|0x1\b/i.test(msg)) return new LaunchError("insufficient", "Not enough SOL for the seed plus rent. Top up and retry; completed steps are kept.");
  if (/blockhash|expired|Blockhash not found/i.test(msg)) return new LaunchError("network", "The transaction expired before confirmation. Retry; completed steps are detected on-chain.");
  return new LaunchError("failed", msg);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function runLaunch(
  connection: Connection,
  wallet: WalletLike,
  input: { name: string; symbol: string; seedQuote: bigint; metadata: PendingLaunch["metadata"] },
  onStage: (s: Stage, detail: string) => void,
  resume?: PendingLaunch | null,
): Promise<{ mint: PublicKey; market: PublicKey; signatures: Record<string, string> }> {
  const owner = wallet.publicKey.toBase58();
  const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
  const client = new PopClient(provider);
  const send = async (tx: Transaction, signers: Keypair[] = []) => {
    try {
      return await provider.sendAndConfirm(tx, signers, { commitment: "confirmed" });
    } catch (e) {
      throw classify(e);
    }
  };

  let pending: PendingLaunch;
  let mintKeypair: Keypair | null = null;
  if (resume && loadPending(owner)?.mintPubkey === resume.mintPubkey) {
    pending = resume;
    if (pending.mintSecret) mintKeypair = Keypair.fromSecretKey(Uint8Array.from(pending.mintSecret));
  } else {
    mintKeypair = Keypair.generate();
    pending = { mintPubkey: mintKeypair.publicKey.toBase58(), mintSecret: [...mintKeypair.secretKey], name: input.name, symbol: input.symbol, uri: api.metadataJsonUrl(mintKeypair.publicKey.toBase58()), seedQuote: input.seedQuote.toString(), metadata: input.metadata, step: "created", signatures: {}, updatedAt: Date.now() };
    savePending(owner, pending);
  }
  const mint = new PublicKey(pending.mintPubkey);
  const market = marketPda(client.programId, mint);

  // Stage 1: create (skip if the market account already exists)
  const existing = await connection.getAccountInfo(market);
  if (!existing) {
    if (!mintKeypair) throw new LaunchError("failed", "Pending launch has no mint key and the market does not exist on-chain. Start a new launch.");
    onStage("creating", "Creating mint and market (1 signature)…");
    const ix = await client.createMarketIx(wallet.publicKey, mint, { name: pending.name, symbol: pending.symbol, uri: pending.uri, seedBase: 1_000_000_000n * 1_000_000n, seedQuote: BigInt(pending.seedQuote), decimals: 6 });
    try {
      pending.signatures.create = await send(new Transaction().add(ix), [mintKeypair]);
    } catch (e) {
      // The send may have landed even if confirmation failed: re-check before surfacing the error.
      if (!(await connection.getAccountInfo(market))) throw e;
    }
  }
  delete pending.mintSecret;
  pending.step = "pages";
  savePending(owner, pending);

  // Stage 2: launch pages (skip existing)
  const v = await client.fetchMarket(market, PopClient.launchPages());
  const skip = new Set(PopClient.launchPages().filter((p) => !v.missingPages.includes(p)));
  const pageIxs = await client.initializePagesIxs(wallet.publicKey, market, v.config, PopClient.launchPages(), skip);
  if (pageIxs.length) {
    onStage("pages", `Creating ${pageIxs.length} price pages (1 signature, rent paid by you)…`);
    pending.signatures.pages = await send(new Transaction().add(...pageIxs));
  }
  pending.step = "activated";
  savePending(owner, pending);

  // Stage 3: wrap seed + activate (skip if already active)
  if (v.state.status === "created") {
    onStage("activating", `Locking ${Number(pending.seedQuote) / 1e9} SOL seed and activating (1 signature)…`);
    const ata = getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, wallet.publicKey, NATIVE_MINT),
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: ata, lamports: Number(pending.seedQuote) }),
      createSyncNativeInstruction(ata),
      await client.activateMarketIx(wallet.publicKey, market, mint),
    );
    pending.signatures.activate = await send(tx);
  }
  pending.step = "metadata";
  savePending(owner, pending);

  // Stage 4: signed off-chain metadata (optional; failures do not block the launch)
  const hasMeta = Object.values(pending.metadata).some((x) => x && x.trim());
  if (hasMeta && wallet.signMessage) {
    onStage("metadata", "Sign the coin description (no transaction)…");
    try {
      await signAndPostMetadata(wallet, mint.toBase58(), pending.metadata);
    } catch (e) {
      onStage("metadata", `Metadata not saved (${(e as Error).message}); you can add it later from My launches.`);
    }
  }
  clearPending(owner);
  onStage("done", "Your coin is live.");
  return { mint, market, signatures: pending.signatures };
}

/** Mirror of services/indexer/src/metadata.ts sanitize + canonicalMessage. */
export async function signAndPostMetadata(wallet: WalletLike, mint: string, metadata: PendingLaunch["metadata"]) {
  if (!wallet.signMessage) throw new Error("wallet cannot sign messages");
  const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
  const handle = (s?: string) => (s && s.trim() ? s.trim().replace(/^@/, "") : null);
  const url = (s?: string) => (s && s.trim() ? new URL(s.trim()).toString() : null);
  const payload = { imageUrl: url(metadata.imageUrl), description: clean(metadata.description), website: url(metadata.website), twitter: handle(metadata.twitter), telegram: handle(metadata.telegram) };
  const signedAt = Math.floor(Date.now() / 1000);
  const hash = await sha256Hex(JSON.stringify(payload));
  const msg = `pop-coin-metadata:v1\nmint:${mint}\nsha256:${hash}\nts:${signedAt}`;
  const sig = await wallet.signMessage(new TextEncoder().encode(msg));
  return api.postMetadata(mint, { payload: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v ?? undefined])), signer: wallet.publicKey.toBase58(), signature: bs58.encode(sig), signedAt });
}
