import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, IDL, marketPda, pagePda, protocolPda, marketVaults, toMarketConfig, toMarketState, PILOT_SETTINGS, TEST_SETTINGS } from "../src/index.js";
import { POP_PILOT_DEFAULTS } from "@pop/math";

describe("sdk", () => {
  it("program id matches the IDL and Anchor.toml", () => {
    expect(PROGRAM_ID.toBase58()).toBe("6pTC8K5PtUKGpQdHZoEsu26qLEehFDh2m1BLKRndNggx");
    expect((IDL as { address: string }).address).toBe(PROGRAM_ID.toBase58());
  });

  it("derives deterministic PDAs with little-endian signed page indices", () => {
    const mint = new PublicKey("So11111111111111111111111111111111111111112");
    const market = marketPda(PROGRAM_ID, mint);
    expect(pagePda(PROGRAM_ID, market, -1).equals(pagePda(PROGRAM_ID, market, -1))).toBe(true);
    expect(pagePda(PROGRAM_ID, market, -1).equals(pagePda(PROGRAM_ID, market, 1))).toBe(false);
    expect(protocolPda(PROGRAM_ID).toBase58().length).toBeGreaterThan(30);
    const v = marketVaults(PROGRAM_ID, market);
    expect(new Set([v.baseVault, v.quoteVault, v.feeVaultBase, v.feeVaultQuote].map((k) => k.toBase58())).size).toBe(4);
  });

  it("pilot settings mirror @pop/math defaults; test settings only lower thresholds", () => {
    expect(PILOT_SETTINGS.seedQuote).toBe(POP_PILOT_DEFAULTS.seedQuote);
    expect(PILOT_SETTINGS.scarFeeBps).toBe(POP_PILOT_DEFAULTS.fees.scarFeeBps);
    expect(PILOT_SETTINGS.maturityQuoteTarget).toBe(POP_PILOT_DEFAULTS.maturityQuoteTarget);
    expect(TEST_SETTINGS.scarFeeBps).toBe(PILOT_SETTINGS.scarFeeBps);
    expect(TEST_SETTINGS.maturityQuoteTarget < PILOT_SETTINGS.maturityQuoteTarget).toBe(true);
  });

  it("converts a raw market into math config/state", () => {
    const raw = {
      baseMint: PublicKey.default, quoteMint: PublicKey.default, creator: PublicKey.default, baseVault: PublicKey.default, quoteVault: PublicKey.default, feeVaultBase: PublicKey.default, feeVaultQuote: PublicKey.default,
      p0X64: "409927646082434", binMin: -64, binMax: 511, binsPerPage: 16, bandSize: 10, maxBinsPerSwap: 32, cursor: 3, status: 1, isPopMarket: true, configVersion: 1,
      scarFeeBps: 150, protocolFeeBps: 25, creatorFeeBps: 25, buybackShareBps: 5000, maturityQuoteTarget: "100000000000", bandQuoteTarget: "1000000000", bandsRequired: 10, minQuoteIn: "100000", minBaseIn: "1000000", baseDecimals: 6,
      seedBaseTotal: "900000000000000", seedQuoteTotal: "20000000000", unmaterializedSeedBase: "0", unmaterializedSeedQuote: "0", allocatedSupply: "0", vestingCount: 0, pairedQuoteLifetime: "5", hardenedBands: 1,
      bandPairedQuote: Array.from({ length: 64 }, (_, i) => (i === 7 ? "5" : "0")), bandHardenedBits: String(1 << 7), protocolClaimableBase: "0", protocolClaimableQuote: "0", creatorClaimableBase: "0", creatorClaimableQuote: "0", buybackAccruedQuote: "0",
      totalBuyVolumeQuote: "0", totalSellVolumeBase: "0", swapCount: "0", createdAtSlot: "0", activatedAtSlot: "0", activatedAtTs: "0", graduatedAtSlot: "0", name: "POP", symbol: "POP", uri: "x", bump: 1,
    };
    const cfg = toMarketConfig(raw as never);
    expect(cfg.seedBase).toBe(900_000_000_000_000n);
    const st = toMarketState(raw as never);
    expect(st.status).toBe("active");
    expect(st.cursor).toBe(3);
    // band slot 7 relative to min band -7 => band 0
    expect(st.bands.get(0)).toEqual({ pairedQuote: 5n, hardened: true });
  });
});
