/**
 * Per-bin accounting record. A bin is NOT a token account; it is an accounting entry
 * against the market vaults. Inventory classes:
 *   seed*     - launch seed inventory (never withdrawable, trades at the bin price)
 *   scar*     - activated fee-funded inventory (never withdrawable, trades at the bin price)
 *   pending*  - collected scar fees waiting for an opposing fee to match
 * Only recorded swap fees enter pending escrow; nothing else qualifies for matching.
 */
export interface BinState {
  seedBase: bigint;
  seedQuote: bigint;
  scarBase: bigint;
  scarQuote: bigint;
  pendingBaseEligible: bigint;
  pendingQuoteEligible: bigint;
  /** Cumulative gross quote input executed into this bin by buys (net of fees, i.e., tradable). */
  buyVolumeQuote: bigint;
  /** Cumulative base input executed into this bin by sells (tradable). */
  sellVolumeBase: bigint;
  /** Lifetime eligible paired quote activated at this bin (monotonic). */
  pairedQuoteLifetime: bigint;
  lastExecutionSlot: bigint;
}

export function emptyBin(): BinState {
  return {
    seedBase: 0n,
    seedQuote: 0n,
    scarBase: 0n,
    scarQuote: 0n,
    pendingBaseEligible: 0n,
    pendingQuoteEligible: 0n,
    buyVolumeQuote: 0n,
    sellVolumeBase: 0n,
    pairedQuoteLifetime: 0n,
    lastExecutionSlot: 0n,
  };
}

export function cloneBin(b: BinState): BinState {
  return { ...b };
}

export function availableBase(b: BinState): bigint {
  return b.seedBase + b.scarBase;
}

export function availableQuote(b: BinState): bigint {
  return b.seedQuote + b.scarQuote;
}

/** Total base held in the bin across all classes (for vault reconciliation). */
export function totalBase(b: BinState): bigint {
  return b.seedBase + b.scarBase + b.pendingBaseEligible;
}

export function totalQuote(b: BinState): bigint {
  return b.seedQuote + b.scarQuote + b.pendingQuoteEligible;
}

export interface ClassSplit {
  seed: bigint;
  scar: bigint;
}

/**
 * Split an amount between seed and scar classes proportionally to the available OUTPUT
 * inventory of each class. The scar share is floored; the residual goes to seed. If seed
 * inventory is zero the scar class receives the residual (it is then the whole amount).
 */
export function splitByOutputInventory(amount: bigint, seedAvail: bigint, scarAvail: bigint): ClassSplit {
  const avail = seedAvail + scarAvail;
  if (avail === 0n) throw new Error("splitByOutputInventory on empty inventory");
  if (seedAvail === 0n) return { seed: 0n, scar: amount };
  const scar = (amount * scarAvail) / avail;
  return { seed: amount - scar, scar };
}

/**
 * A never-initialized page can only contain its fixed seed schedule with zero history. Quoting
 * against that virtual content is exact: if someone materializes the page before the trader's
 * transaction, the trader's prepended `initialize_bin_page` fails and the whole transaction
 * reverts (then the client re-quotes).
 */
export function seedBinState(seedBase: bigint, seedQuote: bigint): BinState {
  const b = emptyBin();
  b.seedBase = seedBase;
  b.seedQuote = seedQuote;
  return b;
}
