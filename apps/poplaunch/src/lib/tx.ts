"use client";
/** Shared transaction runner with the explicit states the spec requires: signing, pending, confirmed, rejected, failed. */
import type { Connection, Transaction } from "@solana/web3.js";

export type TxStage = "idle" | "signing" | "pending" | "confirmed" | "rejected" | "failed";
export interface TxState { stage: TxStage; signature: string | null; error: string | null }
export const IDLE: TxState = { stage: "idle", signature: null, error: null };

export interface SignerLike {
  publicKey: { toBase58(): string } | null;
  signTransaction?: <T extends Transaction>(tx: T) => Promise<T>;
}

export function classify(e: unknown): { stage: "rejected" | "failed"; message: string } {
  const msg = (e as Error)?.message ?? String(e);
  if (/User rejected|rejected the request|user declined/i.test(msg)) return { stage: "rejected", message: "Rejected in your wallet. Nothing was sent." };
  if (/insufficient lamports|insufficient funds|0x1\b/i.test(msg)) return { stage: "failed", message: "Not enough SOL for this amount plus network fees." };
  if (/block height exceeded|expired|Blockhash not found/i.test(msg)) return { stage: "failed", message: "The transaction expired before it was confirmed. Check your wallet activity before trying again." };
  const m = msg.match(/Error Message: ([^.]+)\./);
  return { stage: "failed", message: m ? m[1]! : msg.slice(0, 300) };
}

export async function runTx(connection: Connection, wallet: SignerLike, tx: Transaction, setState: (s: TxState) => void): Promise<string | null> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    setState({ stage: "failed", signature: null, error: "Connect a wallet first." });
    return null;
  }
  let signature: string | null = null;
  try {
    tx.feePayer = tx.feePayer ?? (wallet.publicKey as never);
    const bh = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = bh.blockhash;
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) throw new Error(`Simulation failed: ${(sim.value.logs ?? []).filter((l) => /Error|failed/.test(l)).join(" ") || JSON.stringify(sim.value.err)}`);
    setState({ stage: "signing", signature: null, error: null });
    const signed = await wallet.signTransaction(tx);
    setState({ stage: "pending", signature: null, error: null });
    signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    setState({ stage: "pending", signature, error: null });
    const conf = await connection.confirmTransaction({ signature, ...bh }, "confirmed");
    if (conf.value.err) throw new Error(`Transaction failed on chain: ${JSON.stringify(conf.value.err)}`);
    setState({ stage: "confirmed", signature, error: null });
    return signature;
  } catch (e) {
    // A transaction that was broadcast may still land (RPC hiccup, confirmation timeout). Never report
    // "not executed" without checking, so a retry cannot double-commit SOL.
    if (signature) {
      const landed = await settleStatus(connection, signature);
      if (landed === "ok") { setState({ stage: "confirmed", signature, error: null }); return signature; }
      if (landed === "unknown") { setState({ stage: "failed", signature, error: "Could not confirm whether the transaction landed. Check the signature in the explorer before trying again." }); return null; }
    }
    const c = classify(e);
    setState({ stage: c.stage, signature, error: c.message });
    return null;
  }
}

/** Poll a sent signature for up to ~30 s: "ok" if it confirmed, "err" if it failed on chain, "unknown" if never seen. */
async function settleStatus(connection: Connection, signature: string): Promise<"ok" | "err" | "unknown"> {
  for (let i = 0; i < 15; i++) {
    try {
      const st = (await connection.getSignatureStatuses([signature])).value[0];
      if (st) return st.err ? "err" : "ok";
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "unknown";
}
