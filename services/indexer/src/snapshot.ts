/**
 * Periodic market/protocol snapshots from RPC into the markets/protocol tables. The chain is
 * authoritative; this cache lets the API answer directory and detail queries in one round trip.
 */
import { Connection } from "@solana/web3.js";
import { PopClient, STATUS, type MarketView } from "@pop/sdk";
import { executableDepth, graduationProgress, priceAtBin, reconcile, type Direction } from "@pop/math";
import { query } from "./db.js";

const str = (v: unknown) => (typeof v === "bigint" ? v.toString() : (v as { toString(): string }).toString());

export function marketSummary(v: MarketView, slot: number) {
  const r = reconcile(v.state, v.store);
  const cursorPrice = priceAtBin(v.p0X64, v.state.cursor);
  const depth = (d: Direction, bps: number) => {
    const x = executableDepth(v.config, v.state, v.p0X64, (b) => v.store.getVirtual(b), d, bps);
    return { input: x.input.toString(), output: x.output.toString(), bins: x.binsWithInventory };
  };
  const bands = [...v.state.bands.entries()].sort((a, b) => a[0] - b[0]).map(([band, s]) => ({ band, pairedQuote: s.pairedQuote.toString(), hardened: s.hardened }));
  return {
    address: v.address.toBase58(),
    baseMint: v.raw.baseMint.toBase58(),
    creator: v.raw.creator.toBase58(),
    name: v.raw.name,
    symbol: v.raw.symbol,
    uri: v.raw.uri,
    status: v.state.status,
    configVersion: v.config.configVersion,
    baseDecimals: v.config.baseDecimals,
    cursor: v.state.cursor,
    cursorPriceX64: cursorPrice.toString(),
    p0X64: v.p0X64.toString(),
    binMin: v.config.binMin,
    binMax: v.config.binMax,
    fees: v.config.fees,
    seedBase: v.config.seedBase.toString(),
    seedQuote: v.config.seedQuote.toString(),
    unmaterializedSeedBase: v.state.unmaterializedSeedBase.toString(),
    unmaterializedSeedQuote: v.state.unmaterializedSeedQuote.toString(),
    missingPages: v.missingPages,
    currentInventory: {
      seedBase: r.binSeedBase.toString(),
      seedQuote: r.binSeedQuote.toString(),
      scarBase: r.binScarBase.toString(),
      scarQuote: r.binScarQuote.toString(),
      pendingBaseEligible: r.pendingBaseEligible.toString(),
      pendingQuoteEligible: r.pendingQuoteEligible.toString(),
      vaultBase: r.vaultBase.toString(),
      vaultQuote: r.vaultQuote.toString(),
      feeVaultBase: r.feeVaultBase.toString(),
      feeVaultQuote: r.feeVaultQuote.toString(),
    },
    maturity: {
      pairedQuoteLifetime: v.state.pairedQuoteLifetime.toString(),
      maturityQuoteTarget: v.config.maturityQuoteTarget.toString(),
      hardenedBands: v.state.hardenedBands,
      bandsRequired: v.config.bandsRequired,
      bandQuoteTarget: v.config.bandQuoteTarget.toString(),
      progress: graduationProgress(v.state, v.config),
      graduatedAtSlot: v.state.graduatedAtSlot === null ? null : v.state.graduatedAtSlot.toString(),
      bands,
    },
    depth: {
      buy5: depth("buy", 500), buy10: depth("buy", 1000), buy20: depth("buy", 2000),
      sell5: depth("sell", 500), sell10: depth("sell", 1000), sell20: depth("sell", 2000),
    },
    revenue: {
      protocolClaimableBase: v.state.protocolClaimableBase.toString(),
      protocolClaimableQuote: v.state.protocolClaimableQuote.toString(),
      creatorClaimableBase: v.state.creatorClaimableBase.toString(),
      creatorClaimableQuote: v.state.creatorClaimableQuote.toString(),
      buybackAccruedQuote: v.state.buybackAccruedQuote.toString(),
    },
    volume: { buyQuote: v.state.totalBuyVolumeQuote.toString(), sellBase: v.state.totalSellVolumeBase.toString(), swapCount: v.state.swapCount.toString() },
    scarPreview: scarPreview(v),
    supply: { totalMinted: v.config.seedBase.toString(), outstanding: v.config.seedBase.toString() },
    activatedAtSlot: str(v.raw.activatedAtSlot),
    activatedAtTs: str(v.raw.activatedAtTs),
    createdAtSlot: str(v.raw.createdAtSlot),
    snapshotSlot: slot,
  };
}

/**
 * Compact scar preview for directory rows: 24 segments over a fixed window of bins around the
 * cursor (cursor-24 .. cursor+23, 2 bins per segment). Each segment = current scar quote inventory
 * (lamports) held in those bins; `max` lets the client normalize per coin. Uninitialized pages
 * hold no scars by definition.
 */
export function scarPreview(v: MarketView) {
  const start = v.state.cursor - 24;
  const segments: string[] = [];
  let max = 0n;
  for (let s = 0; s < 24; s++) {
    let q = 0n;
    for (let k = 0; k < 2; k++) {
      const b = v.store.get(start + s * 2 + k);
      if (b) q += b.scarQuote;
    }
    if (q > max) max = q;
    segments.push(q.toString());
  }
  return { startBin: start, binsPerSegment: 2, measure: "scarQuoteLamports", segments, max: max.toString(), cursorSegment: 12 };
}

export function binSnapshot(v: MarketView) {
  const out: Record<string, unknown>[] = [];
  for (const [id, b] of v.store.entries()) {
    const touched = b.buyVolumeQuote || b.sellVolumeBase || b.pendingQuoteEligible || b.pendingBaseEligible || b.scarBase || b.scarQuote;
    out.push({
      bin: id,
      priceX64: priceAtBin(v.p0X64, id).toString(),
      seedBase: b.seedBase.toString(),
      seedQuote: b.seedQuote.toString(),
      scarBase: b.scarBase.toString(),
      scarQuote: b.scarQuote.toString(),
      pendingBaseEligible: b.pendingBaseEligible.toString(),
      pendingQuoteEligible: b.pendingQuoteEligible.toString(),
      buyVolumeQuote: b.buyVolumeQuote.toString(),
      sellVolumeBase: b.sellVolumeBase.toString(),
      pairedQuoteLifetime: b.pairedQuoteLifetime.toString(),
      lastExecutionSlot: b.lastExecutionSlot.toString(),
      touched: Boolean(touched),
    });
  }
  return out;
}

export class Snapshotter {
  readonly client: PopClient;
  constructor(readonly connection: Connection) {
    this.client = PopClient.readOnly(connection, "confirmed");
  }

  async run(): Promise<number> {
    const slot = await this.connection.getSlot("confirmed");
    const markets = await this.client.fetchAllMarkets();
    for (const m of markets) {
      const v = await this.client.fetchMarket(m.publicKey);
      const summary = marketSummary(v, slot);
      await query(
        `INSERT INTO markets (address, base_mint, creator, name, symbol, uri, status, seed_quote, config_version, created_slot, state, bins, snapshot_slot, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
         ON CONFLICT (address) DO UPDATE SET status = EXCLUDED.status, state = EXCLUDED.state, bins = EXCLUDED.bins, snapshot_slot = EXCLUDED.snapshot_slot, updated_at = now()`,
        [summary.address, summary.baseMint, summary.creator, summary.name, summary.symbol, summary.uri, summary.status, summary.seedQuote, summary.configVersion, summary.createdAtSlot, JSON.stringify(summary), JSON.stringify(binSnapshot(v)), slot],
      );
    }
    // protocol + buyback escrow
    try {
      const p = await this.client.fetchProtocol();
      const bb = await this.client.fetchBuybackVault();
      const escrowBalance = await this.connection.getTokenAccountBalance(bb.quoteAccount, "confirmed").then((r) => r.value.amount).catch(() => "0");
      const state = {
        version: p.version, authority: p.authority.toBase58(), protocolFeeRecipient: p.protocolFeeRecipient.toBase58(), buybackAuthority: p.buybackAuthority.toBase58(),
        popMint: p.popMint.toBase58(), launchesEnabled: p.launchesEnabled, marketCount: p.marketCount.toString(),
        settings: Object.fromEntries(Object.entries(p.settings).map(([k, v]) => [k, typeof v === "object" ? (v as { toString(): string }).toString() : v])),
      };
      const buyback = { authority: bb.authority.toBase58(), quoteAccount: bb.quoteAccount.toBase58(), escrowBalance, totalReceived: bb.totalReceived.toString(), totalWithdrawn: bb.totalWithdrawn.toString(), lastWithdrawalSlot: bb.lastWithdrawalSlot.toString(), minIntervalSlots: bb.minIntervalSlots.toString(), maxWithdrawPerExecution: bb.maxWithdrawPerExecution.toString(), withdrawalCount: bb.withdrawalCount.toString() };
      await query(
        `INSERT INTO protocol (id, state, buyback, snapshot_slot, updated_at) VALUES (1,$1,$2,$3,now())
         ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, buyback = EXCLUDED.buyback, snapshot_slot = EXCLUDED.snapshot_slot, updated_at = now()`,
        [JSON.stringify(state), JSON.stringify(buyback), slot],
      );
    } catch {
      // protocol not initialized yet
    }
    return markets.length;
  }
}

export { STATUS };
