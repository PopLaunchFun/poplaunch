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
  if (/block height exceeded|expired|Blockhash not found/i.test(msg)) return { stage: "failed", message: "The transaction expired before it was confirmed. Nothing was executed. Try again." };
  const m = msg.match(/Error Message: ([^.]+)\./);
  return { stage: "failed", message: m ? m[1]! : msg.slice(0, 300) };
}

export async function runTx(connection: Connection, wallet: SignerLike, tx: Transaction, setState: (s: TxState) => void): Promise<string | null> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    setState({ stage: "failed", signature: null, error: "Connect a wallet first." });
    return null;
  }
  try {
    tx.feePayer = tx.feePayer ?? (wallet.publicKey as never);
    const bh = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = bh.blockhash;
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) throw new Error(`Simulation failed: ${(sim.value.logs ?? []).filter((l) => /Error|failed/.test(l)).join(" ") || JSON.stringify(sim.value.err)}`);
    setState({ stage: "signing", signature: null, error: null });
    const signed = await wallet.signTransaction(tx);
    setState({ stage: "pending", signature: null, error: null });
    const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    setState({ stage: "pending", signature, error: null });
    const conf = await connection.confirmTransaction({ signature, ...bh }, "confirmed");
    if (conf.value.err) throw new Error(`Transaction failed on chain: ${JSON.stringify(conf.value.err)}`);
    setState({ stage: "confirmed", signature, error: null });
    return signature;
  } catch (e) {
    const c = classify(e);
    setState({ stage: c.stage, signature: null, error: c.message });
    return null;
  }
}
