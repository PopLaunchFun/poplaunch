/**
 * Settlement keeper. Finds READY launches and submits the permissionless `finalize_launch`. It signs with
 * its own fee wallet only: it has no authority over escrow, and anyone (including the UI's "Finish launch"
 * button) can submit the same instruction if the keeper is late. Attempts are recorded so the launch page
 * can show real settlement progress.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AnchorProvider, type Wallet } from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { PopLaunchClient } from "@pop/sdk";
import { config } from "./config.js";
import { query } from "./db.js";

class KeypairWallet implements Wallet {
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

export class Keeper {
  readonly keypair: Keypair | null;
  readonly client: PopLaunchClient | null;
  constructor(readonly connection: Connection) {
    this.keypair = loadKeeperKeypair();
    this.client = this.keypair ? new PopLaunchClient(new AnchorProvider(connection, new KeypairWallet(this.keypair), { commitment: "confirmed" })) : null;
  }

  get address(): string | null {
    return this.keypair?.publicKey.toBase58() ?? null;
  }
  lastSuccessAt: string | null = null;
  private lastLowBalanceLog = 0;

  /** Operational health for /api/status and alerting. */
  async health(): Promise<{ address: string | null; enabled: boolean; balanceSol: number | null; readyLaunches: { address: string; ageSec: number }[]; failedAttempts15m: number; lastSuccessAt: string | null }> {
    let balanceSol: number | null = null;
    if (this.keypair) { try { balanceSol = (await this.connection.getBalance(this.keypair.publicKey, "confirmed")) / LAMPORTS_PER_SOL; } catch { /* rpc down: reported separately */ } }
    const now = Math.floor(Date.now() / 1000);
    const ready = await query<{ address: string; filled_at: string }>(`SELECT address, filled_at FROM launches WHERE chain_state = 1 AND settlement_deadline > $1`, [now]);
    const [failed] = await query<{ n: string }>(`SELECT count(*) AS n FROM settlement_attempts WHERE status = 'failed' AND created_at > now() - interval '15 minutes'`);
    return { address: this.address, enabled: !!this.keypair, balanceSol, readyLaunches: ready.map((r) => ({ address: r.address, ageSec: now - Number(r.filled_at) })), failedAttempts15m: Number(failed?.n ?? 0), lastSuccessAt: this.lastSuccessAt };
  }

  async ensureFunded(): Promise<void> {
    if (!this.keypair || config.network !== "localnet") return;
    const bal = await this.connection.getBalance(this.keypair.publicKey, "confirmed");
    if (bal < LAMPORTS_PER_SOL) {
      const sig = await this.connection.requestAirdrop(this.keypair.publicKey, 5 * LAMPORTS_PER_SOL);
      await this.connection.confirmTransaction({ signature: sig, ...(await this.connection.getLatestBlockhash()) }, "confirmed");
    }
  }

  async tick(): Promise<number> {
    if (!this.client || !this.keypair) return 0;
    // Below the floor the keeper stands down (anyone can still settle from the launch page) instead of
    // draining its last lamports on attempts that cannot pay their own fee.
    const balance = await this.connection.getBalance(this.keypair.publicKey, "confirmed");
    if (balance < config.keeperMinBalanceSol * LAMPORTS_PER_SOL) {
      // Logged once a minute rather than every tick; /api/status and the keeper-balance-low alert carry the state.
      if (Date.now() - this.lastLowBalanceLog > 60_000) { this.lastLowBalanceLog = Date.now(); console.error(`[keeper] balance ${balance / LAMPORTS_PER_SOL} SOL below floor ${config.keeperMinBalanceSol}; not sending`); }
      return 0;
    }
    const now = Math.floor(Date.now() / 1000);
    const ready = await query<{ address: string; settlement_deadline: string }>(
      `SELECT address, settlement_deadline FROM launches WHERE chain_state = 1 AND settlement_deadline > $1
         AND NOT EXISTS (SELECT 1 FROM settlement_attempts a WHERE a.launch = launches.address AND a.created_at > now() - interval '15 seconds')`,
      [now + 3],
    );
    let n = 0;
    for (const r of ready) {
      const launch = new PublicKey(r.address);
      let signature: string | null = null;
      try {
        // Re-check on chain right before sending; the database is only a hint. A read failure for one launch
        // must not abort the tick for the others.
        const l = await this.client.fetchLaunch(launch);
        if (l.state !== 1) continue;
        const tx = await this.client.buildFinalizeTransaction(this.keypair.publicKey, launch);
        tx.feePayer = this.keypair.publicKey;
        const bh = await this.connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = bh.blockhash;
        tx.sign(this.keypair);
        signature = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        await query(`INSERT INTO settlement_attempts (launch, signature, status) VALUES ($1, $2, 'sent')`, [r.address, signature]);
        const conf = await this.connection.confirmTransaction({ signature, ...bh }, "confirmed");
        if (conf.value.err) throw new Error(`on-chain error ${JSON.stringify(conf.value.err)}`);
        await query(`UPDATE settlement_attempts SET status = 'confirmed' WHERE signature = $1`, [signature]);
        this.lastSuccessAt = new Date().toISOString();
        n++;
      } catch (e) {
        const msg = ((e as Error).message ?? String(e)).slice(0, 1000);
        if (signature) await query(`UPDATE settlement_attempts SET status = 'failed', error = $2 WHERE signature = $1`, [signature, msg]);
        else await query(`INSERT INTO settlement_attempts (launch, signature, status, error) VALUES ($1, NULL, 'failed', $2)`, [r.address, msg]);
        console.error(`[keeper] ${r.address}: ${msg}`);
      }
    }
    return n;
  }
}

function loadKeeperKeypair(): Keypair | null {
  // Hosted deployments pass the keypair JSON array through a secret variable instead of a file.
  if (process.env.KEEPER_KEYPAIR_JSON) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEEPER_KEYPAIR_JSON) as number[]));
  const path = config.keeperKeypairPath;
  if (!path) return null;
  if (!existsSync(path)) {
    if (config.network !== "localnet") throw new Error(`keeper keypair not found at ${path}`);
    // Localnet convenience only: generate a throwaway fee wallet.
    const kp = Keypair.generate();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
    return kp;
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}
