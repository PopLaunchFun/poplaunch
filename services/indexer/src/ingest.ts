/**
 * Event ingestion. Idempotent: rows are keyed by (signature, event_index) and inserted with
 * ON CONFLICT DO NOTHING, so replays, restarts and overlapping polls never double count.
 * Confirmed events are stored with finalized=false; the finalizer marks them finalized or deletes
 * them if the transaction is no longer found after the chain has moved past it (rollback).
 */
import BN from "bn.js";
import { Connection, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { PopClient } from "@pop/sdk";
import { config } from "./config.js";
import { pool, query } from "./db.js";

const programId = new PublicKey(config.programId);

type AnyEvent = { name: string; data: Record<string, unknown> };

function j(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") {
    if (v instanceof PublicKey) return v.toBase58();
    if (BN.isBN(v)) return (v as BN).toString();
    if (Array.isArray(v)) return v.map(j);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = j(x);
    return out;
  }
  return v;
}

export class Ingester {
  readonly client: PopClient;
  constructor(readonly connection: Connection) {
    this.client = PopClient.readOnly(connection, "confirmed");
  }

  async loadCursor(): Promise<string | null> {
    const rows = await query<{ last_signature: string | null }>("SELECT last_signature FROM indexer_cursor WHERE program_id = $1", [config.programId]);
    return rows[0]?.last_signature ?? null;
  }

  async saveCursor(signature: string, slot: number): Promise<void> {
    await query(
      `INSERT INTO indexer_cursor (program_id, last_signature, last_slot, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (program_id) DO UPDATE SET last_signature = EXCLUDED.last_signature, last_slot = EXCLUDED.last_slot, updated_at = now()`,
      [config.programId, signature, slot],
    );
  }

  /** Fetch all signatures newer than `until`, oldest first. */
  async newSignatures(until: string | null): Promise<ConfirmedSignatureInfo[]> {
    const out: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;
    for (;;) {
      const batch = await this.connection.getSignaturesForAddress(programId, { before, until: until ?? undefined, limit: 1000 }, "confirmed");
      if (batch.length === 0) break;
      out.push(...batch);
      before = batch[batch.length - 1]!.signature;
      if (batch.length < 1000) break;
    }
    return out.reverse();
  }

  async ingestSignature(info: ConfirmedSignatureInfo): Promise<number> {
    if (info.err) return 0; // failed transactions emit nothing we store
    const tx = await this.connection.getTransaction(info.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta?.err) return 0;
    const logs = tx.meta?.logMessages ?? [];
    const events = [...this.client.eventParser.parseLogs(logs)] as AnyEvent[];
    if (events.length === 0) return 0;
    const slot = tx.slot;
    const blockTime = tx.blockTime ?? null;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      let idx = 0;
      for (const ev of events) {
        const data = j(ev.data) as Record<string, string | boolean | number>;
        const market = typeof data.market === "string" ? data.market : null;
        await c.query(
          `INSERT INTO events (signature, event_index, slot, block_time, name, market, data) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [info.signature, idx, slot, blockTime, ev.name, market, JSON.stringify(data)],
        );
        if (ev.name === "swapExecuted") {
          const gross = BigInt(data.grossInput as string);
          const output = BigInt(data.output as string);
          const isBuy = data.isBuy as boolean;
          // tradable input / output as a display price (quote atomic per base atomic)
          const fees = BigInt(data.scarFee as string) + BigInt(data.protocolFee as string) + BigInt(data.creatorFee as string);
          const tradable = gross - fees;
          const avg = output === 0n || tradable === 0n ? null : isBuy ? Number(tradable) / Number(output) : Number(output) / Number(tradable);
          await c.query(
            `INSERT INTO trades (signature, event_index, market, trader, is_buy, gross_input, output, scar_fee, protocol_fee, creator_fee, bins_inspected, start_bin, end_bin, internal_buyback, avg_price, slot, block_time)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING`,
            [info.signature, idx, data.market, data.user, isBuy, gross.toString(), output.toString(), data.scarFee, data.protocolFee, data.creatorFee, data.binsInspected, data.startBin, data.endBin, data.internalBuyback, avg, slot, blockTime],
          );
        } else if (ev.name === "scarFormed") {
          await c.query(
            `INSERT INTO scars (signature, event_index, market, bin_id, base, quote, bin_paired_lifetime, market_paired_lifetime, slot, block_time)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
            [info.signature, idx, data.market, data.binId, data.base, data.quote, data.binPairedQuoteLifetime, data.marketPairedQuoteLifetime, slot, blockTime],
          );
        }
        idx++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    return events.length;
  }

  /** One poll: ingest everything after the cursor. Returns number of signatures processed. */
  async poll(): Promise<number> {
    const until = await this.loadCursor();
    const sigs = await this.newSignatures(until);
    for (const s of sigs) {
      await this.ingestSignature(s);
      await this.saveCursor(s.signature, s.slot);
    }
    return sigs.length;
  }

  /**
   * Finalizer: for unfinalized rows, look the transaction up at finalized commitment. Found ->
   * mark finalized. Not found once the finalized tip is well past the row's slot -> re-check at
   * confirmed commitment; still missing means the fork was abandoned, so delete (rollback).
   */
  async finalize(): Promise<{ finalized: number; rolledBack: number }> {
    const rows = await query<{ signature: string; slot: string }>("SELECT DISTINCT signature, slot FROM events WHERE finalized = false ORDER BY slot ASC LIMIT 100");
    if (rows.length === 0) return { finalized: 0, rolledBack: 0 };
    const tip = await this.connection.getSlot("finalized");
    let finalized = 0;
    let rolledBack = 0;
    for (const row of rows) {
      const sig = row.signature;
      if (tip < Number(row.slot)) continue;
      const fin = await this.connection.getTransaction(sig, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
      if (fin && !fin.meta?.err) {
        await query("UPDATE events SET finalized = true WHERE signature = $1", [sig]);
        await query("UPDATE trades SET finalized = true WHERE signature = $1", [sig]);
        await query("UPDATE scars SET finalized = true WHERE signature = $1", [sig]);
        finalized++;
        continue;
      }
      if (tip > Number(row.slot) + 64) {
        const conf = await this.connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!conf) {
          await query("DELETE FROM events WHERE signature = $1", [sig]);
          await query("DELETE FROM trades WHERE signature = $1", [sig]);
          await query("DELETE FROM scars WHERE signature = $1", [sig]);
          rolledBack++;
        }
      }
    }
    return { finalized, rolledBack };
  }
}
