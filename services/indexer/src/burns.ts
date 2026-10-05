/**
 * Watches the buyback authority's POP token account for SPL Burn / BurnChecked instructions of the
 * published POP mint. Covers both the atomic keeper transaction (withdraw + swap + burn) and the
 * manual mode (separate burn transaction). Idempotent by signature with the same finalize pattern.
 */
import { Connection, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { query } from "./db.js";

const KEY = "buyback_burns";

export class BurnWatcher {
  constructor(readonly connection: Connection) {}

  async poll(popMint: PublicKey, authority: PublicKey): Promise<number> {
    const ata = getAssociatedTokenAddressSync(popMint, authority, true);
    const [cur] = await query<{ last_signature: string | null }>("SELECT last_signature FROM watcher_cursor WHERE key = $1", [KEY]);
    const until = cur?.last_signature ?? undefined;
    const sigs: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;
    for (;;) {
      const batch = await this.connection.getSignaturesForAddress(ata, { before, until, limit: 1000 }, "confirmed");
      if (batch.length === 0) break;
      sigs.push(...batch);
      before = batch[batch.length - 1]!.signature;
      if (batch.length < 1000) break;
    }
    sigs.reverse();
    for (const s of sigs) {
      if (!s.err) await this.ingest(s.signature, popMint, ata);
      await query(
        `INSERT INTO watcher_cursor (key, last_signature, last_slot, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (key) DO UPDATE SET last_signature = EXCLUDED.last_signature, last_slot = EXCLUDED.last_slot, updated_at = now()`,
        [KEY, s.signature, s.slot],
      );
    }
    return sigs.length;
  }

  private async ingest(signature: string, popMint: PublicKey, ata: PublicKey) {
    const tx = await this.connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta?.err) return;
    let burned = 0n;
    const scan = (ixs: { program?: string; programId: PublicKey; parsed?: { type?: string; info?: Record<string, unknown> } }[]) => {
      for (const ix of ixs) {
        if (!ix.programId.equals(TOKEN_PROGRAM_ID) || !ix.parsed) continue;
        const t = ix.parsed.type;
        if (t !== "burn" && t !== "burnChecked") continue;
        const info = ix.parsed.info ?? {};
        if (info.account !== ata.toBase58() || info.mint !== popMint.toBase58()) continue;
        const amt = (info.tokenAmount as { amount?: string } | undefined)?.amount ?? (info.amount as string | undefined);
        if (amt) burned += BigInt(amt);
      }
    };
    scan(tx.transaction.message.instructions as never);
    for (const inner of tx.meta?.innerInstructions ?? []) scan(inner.instructions as never);
    if (burned === 0n) return;
    await query(
      `INSERT INTO buyback_burns (signature, amount, mint, slot, block_time) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [signature, burned.toString(), popMint.toBase58(), tx.slot, tx.blockTime ?? null],
    );
  }

  async finalize(): Promise<number> {
    const rows = await query<{ signature: string; slot: string }>("SELECT signature, slot FROM buyback_burns WHERE finalized = false ORDER BY slot ASC LIMIT 50");
    let n = 0;
    for (const r of rows) {
      const fin = await this.connection.getTransaction(r.signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
      if (fin && !fin.meta?.err) {
        await query("UPDATE buyback_burns SET finalized = true WHERE signature = $1", [r.signature]);
        n++;
      }
    }
    return n;
  }
}
