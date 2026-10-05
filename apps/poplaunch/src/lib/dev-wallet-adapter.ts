/**
 * Localnet-only "Dev wallet": a keypair kept in this browser's localStorage so the full flow can be
 * exercised without a browser extension. It is registered only when the app is built for localnet and
 * is labeled as such in the wallet menu. Never shipped for devnet or mainnet.
 */
import { BaseMessageSignerWalletAdapter, WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { Keypair, PublicKey, Transaction, VersionedTransaction, type TransactionVersion } from "@solana/web3.js";
import nacl from "tweetnacl";

export const DevWalletName = "Dev wallet (localnet)" as WalletName<"Dev wallet (localnet)">;
const KEY = "poplaunch.devwallet.secret";

export function devWalletKeypair(): Keypair {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
    const kp = Keypair.generate();
    localStorage.setItem(KEY, JSON.stringify([...kp.secretKey]));
    return kp;
  } catch {
    return Keypair.generate();
  }
}

export class DevWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = DevWalletName;
  url = "http://127.0.0.1:8899";
  icon = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#fddf31"/><text x="16" y="21" font-size="14" text-anchor="middle" font-family="sans-serif" font-weight="700">dev</text></svg>');
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0] as TransactionVersion[]);
  private _keypair: Keypair | null = null;
  private _connecting = false;

  get publicKey(): PublicKey | null {
    return this._keypair?.publicKey ?? null;
  }
  get connecting(): boolean {
    return this._connecting;
  }
  get readyState(): WalletReadyState {
    return typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.Installed;
  }

  async connect(): Promise<void> {
    if (this._connecting) return;
    this._connecting = true;
    try {
      this._keypair = this._keypair ?? devWalletKeypair();
      // Always announce: the provider attaches its listeners after child effects, so a repeat call must still notify it.
      this.emit("connect", this._keypair.publicKey);
    } finally {
      this._connecting = false;
    }
  }
  async disconnect(): Promise<void> {
    this._keypair = null;
    this.emit("disconnect");
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._keypair) throw new Error("Dev wallet not connected");
    if (tx instanceof Transaction) tx.partialSign(this._keypair);
    else tx.sign([this._keypair]);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const t of txs) await this.signTransaction(t);
    return txs;
  }
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._keypair) throw new Error("Dev wallet not connected");
    return nacl.sign.detached(message, this._keypair.secretKey);
  }
}
