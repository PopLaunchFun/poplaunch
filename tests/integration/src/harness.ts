import { AnchorProvider, type Wallet } from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAccount, getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { PopClient } from "@pop/sdk";

export const RPC_URL = process.env.POP_RPC_URL ?? "http://127.0.0.1:8899";

export class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) tx.partialSign(this.payer);
    else tx.sign([this.payer]);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const t of txs) await this.signTransaction(t);
    return txs;
  }
}

export interface Actor {
  keypair: Keypair;
  provider: AnchorProvider;
  client: PopClient;
  pubkey: PublicKey;
}

export async function connect(): Promise<Connection> {
  const c = new Connection(RPC_URL, "confirmed");
  await c.getLatestBlockhash();
  return c;
}

export async function makeActor(connection: Connection, sol = 50): Promise<Actor> {
  const keypair = Keypair.generate();
  const sig = await connection.requestAirdrop(keypair.publicKey, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  const provider = new AnchorProvider(connection, new KeypairWallet(keypair), { commitment: "confirmed" });
  return { keypair, provider, client: new PopClient(provider), pubkey: keypair.publicKey };
}

export async function send(actor: Actor, ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return actor.provider.sendAndConfirm(tx, signers, { commitment: "confirmed" });
}

/** Run a tx expected to fail; returns the error text (logs + message). */
export async function expectFail(actor: Actor, ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<string> {
  try {
    await send(actor, ixs, signers);
  } catch (e: unknown) {
    const err = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
    return [err.message ?? "", ...(err.logs ?? []), ...(err.transactionLogs ?? [])].join("\n");
  }
  throw new Error("transaction unexpectedly succeeded");
}

export async function wrapSol(actor: Actor, lamports: bigint): Promise<void> {
  const ata = getAssociatedTokenAddressSync(NATIVE_MINT, actor.pubkey);
  await send(actor, [
    createAssociatedTokenAccountIdempotentInstruction(actor.pubkey, ata, actor.pubkey, NATIVE_MINT),
    SystemProgram.transfer({ fromPubkey: actor.pubkey, toPubkey: ata, lamports: Number(lamports) }),
    createSyncNativeInstruction(ata),
  ]);
}

export async function ensureAta(actor: Actor, mint: PublicKey, owner: PublicKey = actor.pubkey, allowOffCurve = false): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, allowOffCurve);
  await send(actor, [createAssociatedTokenAccountIdempotentInstruction(actor.pubkey, ata, owner, mint)]);
  return ata;
}

export async function tokenBalance(connection: Connection, account: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, account, "confirmed")).amount;
  } catch {
    return 0n;
  }
}

export async function mintInfo(connection: Connection, mint: PublicKey) {
  return getMint(connection, mint, "confirmed");
}

export async function computeUnits(connection: Connection, signature: string): Promise<number> {
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return tx?.meta?.computeUnitsConsumed ?? -1;
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
