/**
 * Read-only chain sync. Every few seconds: scan all Launch and ContributionReceipt accounts of the
 * program and upsert them; then walk new program signatures and store their events. The database is a
 * cache: when it is stale the UI reads receipts from chain directly, and refunds never depend on it.
 */
import { Connection, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { EventParser } from "@anchor-lang/core";
import { PopLaunchClient } from "@pop/sdk";
import { query } from "./db.js";

type BNish = { toString(): string };
type Pk = { toBase58(): string };

export class Syncer {
  readonly client: PopLaunchClient;
  constructor(readonly connection: Connection, readonly programId: PublicKey) {
    this.client = PopLaunchClient.readOnly(connection);
  }

  async scanAccounts(): Promise<{ launches: number; receipts: number; slot: number }> {
    const slot = await this.connection.getSlot("confirmed");
    const launches = await this.client.program.account.launch.all();
    for (const { publicKey, account: l } of launches) {
      const s = (x: BNish) => x.toString();
      await query(
        `INSERT INTO launches (address, mint, creator, version, chain_state, refund_reason, name, symbol, uri, metadata_hash, target_lamports, raised_lamports, backer_wallets, supply, decimals, backer_allocation, pool_allocation, opened_at, funding_deadline, filled_at, settlement_deadline, live_at, pool_state, lp_mint, lp_burned, settled_quote, settled_base, total_claimed, total_refunded, setup_reserve_funded, setup_reserve_reclaimed, creation_fee_paid, cp_swap_program, amm_config, updated_slot, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,now())
         ON CONFLICT (address) DO UPDATE SET chain_state=EXCLUDED.chain_state, refund_reason=EXCLUDED.refund_reason, raised_lamports=EXCLUDED.raised_lamports, backer_wallets=EXCLUDED.backer_wallets,
           filled_at=EXCLUDED.filled_at, settlement_deadline=EXCLUDED.settlement_deadline, live_at=EXCLUDED.live_at, pool_state=EXCLUDED.pool_state, lp_mint=EXCLUDED.lp_mint, lp_burned=EXCLUDED.lp_burned,
           settled_quote=EXCLUDED.settled_quote, settled_base=EXCLUDED.settled_base, total_claimed=EXCLUDED.total_claimed, total_refunded=EXCLUDED.total_refunded,
           setup_reserve_funded=EXCLUDED.setup_reserve_funded, setup_reserve_reclaimed=EXCLUDED.setup_reserve_reclaimed, updated_slot=EXCLUDED.updated_slot, updated_at=now()
         WHERE launches.updated_slot <= EXCLUDED.updated_slot`,
        [
          publicKey.toBase58(), (l.mint as Pk).toBase58(), (l.creator as Pk).toBase58(), l.version, l.state, l.refundReason, l.name, l.symbol, l.uri, Buffer.from(l.metadataHash as number[]).toString("hex"),
          s(l.targetLamports), s(l.raisedLamports), l.backerWallets, s(l.supply), l.decimals, s(l.backerAllocation), s(l.poolAllocation),
          s(l.openedAt), s(l.fundingDeadline), s(l.filledAt), s(l.settlementDeadline), s(l.liveAt),
          nullIfDefault((l.poolState as Pk).toBase58()), nullIfDefault((l.lpMint as Pk).toBase58()), s(l.lpBurned), s(l.settledQuote), s(l.settledBase), s(l.totalClaimed), s(l.totalRefunded),
          s(l.setupReserveFunded), s(l.setupReserveReclaimed), s(l.creationFeePaid), (l.cpSwapProgram as Pk).toBase58(), (l.ammConfig as Pk).toBase58(), slot,
        ],
      );
      // A draft whose hash matches the chain is now published and frozen.
      await query(`UPDATE drafts SET published_at = COALESCE(published_at, now()) WHERE mint = $1 AND metadata_hash = $2`, [(l.mint as Pk).toBase58(), Buffer.from(l.metadataHash as number[]).toString("hex")]);
    }
    const receipts = await this.client.program.account.contributionReceipt.all();
    for (const { account: r } of receipts) {
      await query(
        `INSERT INTO receipts (launch, owner, contributed, claimed, refunded, updated_slot, updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (launch, owner) DO UPDATE SET contributed=EXCLUDED.contributed, claimed=EXCLUDED.claimed, refunded=EXCLUDED.refunded, updated_slot=EXCLUDED.updated_slot, updated_at=now()
         WHERE receipts.updated_slot <= EXCLUDED.updated_slot`,
        [(r.launch as Pk).toBase58(), (r.owner as Pk).toBase58(), r.contributedLamports.toString(), r.claimedBaseUnits.toString(), r.refundedLamports.toString(), slot],
      );
    }
    await query(`INSERT INTO sync (key, value, updated_at) VALUES ('scan_slot', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [String(slot)]);
    return { launches: launches.length, receipts: receipts.length, slot };
  }

  /** Walk program signatures newer than the last one stored; parse and store events idempotently. */
  async ingestEvents(): Promise<number> {
    const [row] = await query<{ value: string }>(`SELECT value FROM sync WHERE key = 'last_signature'`);
    const until = row?.value;
    const sigs: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;
    for (let page = 0; page < 20; page++) {
      const batch = await this.connection.getSignaturesForAddress(this.programId, { limit: 1000, before, until }, "confirmed");
      sigs.push(...batch);
      if (batch.length < 1000) break;
      before = batch[batch.length - 1]!.signature;
    }
    if (sigs.length === 0) return 0;
    const parser = new EventParser(this.programId, this.client.program.coder);
    let n = 0;
    for (const s of sigs.reverse()) {
      if (s.err) continue;
      const tx = await this.connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (!tx?.meta?.logMessages) continue;
      let i = 0;
      for (const ev of parser.parseLogs(tx.meta.logMessages)) {
        const data = ev.data as Record<string, unknown>;
        const json: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) json[k] = typeof v === "object" && v !== null && "toString" in v ? (v as BNish).toString() : v;
        await query(
          `INSERT INTO events (signature, event_index, name, launch, wallet, data, slot, block_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [s.signature, i++, ev.name, json.launch ?? null, json.wallet ?? json.creator ?? json.from ?? null, JSON.stringify(json), s.slot, s.blockTime ?? null],
        );
        n++;
      }
    }
    const newest = sigs[sigs.length - 1]!.signature;
    await query(`INSERT INTO sync (key, value, updated_at) VALUES ('last_signature', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [newest]);
    return n;
  }
}

function nullIfDefault(k: string): string | null {
  return k === PublicKey.default.toBase58() ? null : k;
}
