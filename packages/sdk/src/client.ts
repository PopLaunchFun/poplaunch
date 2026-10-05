/**
 * PopClient: thin typed wrapper over the Anchor program with quote helpers that run the exact
 * @pop/math walker on freshly fetched chain state. The on-chain min_output is the final
 * protection; a client quote is only a prediction over the state it was computed from.
 */
import { AnchorProvider, EventParser, Program, type Idl, type Provider } from "@anchor-lang/core";
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  BinStore,
  LAUNCH_PAGES,
  commitSwap,
  executableDepth,
  graduationProgress,
  pageIndexOf,
  pageRange,
  priceAtBin,
  quoteSwap,
  type Direction,
  type MarketConfig,
  type MarketState,
  type SwapOutcome,
  type SwapQuote,
} from "@pop/math";
import idlJson from "./idl/pop_market.json" with { type: "json" };
import type { PopMarket } from "./idl/pop_market.js";
import { buybackPda, buybackQuoteAccountPda, marketPda, marketVaults, pagePda, protocolPda } from "./pda.js";
import { toBinStore, toMarketConfig, toMarketState, type RawBinPage, type RawMarket } from "./view.js";

export const IDL = idlJson as unknown as PopMarket;
export const PROGRAM_ID = new PublicKey((idlJson as { address: string }).address);

/** Byte size of a BinPage account (8 disc + 32 market + 4 index + 1 bump + 3 pad + 16 bins * 80). */
export const BIN_PAGE_SIZE = 8 + 32 + 4 + 1 + 3 + 16 * 80;
/** Byte offset of `creator` inside a Market account (after discriminator, base_mint, quote_mint). */
const MARKET_CREATOR_OFFSET = 8 + 32 + 32;
/**
 * Byte size of a Market account: 8 + Market::INIT_SPACE. The Anchor coder's `size()` ignores
 * `#[max_len]` strings, so the real size is pinned here and verified by the integration suite.
 */
export const MARKET_ACCOUNT_SIZE = 1224;

export interface FactorySettingsInput {
  minSeedQuote: bigint;
  scarFeeBps: number;
  protocolFeeBps: number;
  creatorFeeBps: number;
  buybackShareBps: number;
  maturityQuoteTarget: bigint;
  bandQuoteTarget: bigint;
  bandsRequired: number;
  minQuoteIn: bigint;
  minBaseIn: bigint;
  binMin: number;
  binMax: number;
  maxBinsPerSwap: number;
  bandSize: number;
}

/** Factory defaults from the brief (experimental calibration). Minimum seed is an owner decision. */
export const PILOT_SETTINGS: FactorySettingsInput = {
  minSeedQuote: 1_000_000_000n,
  scarFeeBps: 150,
  protocolFeeBps: 25,
  creatorFeeBps: 25,
  buybackShareBps: 5000,
  maturityQuoteTarget: 100_000_000_000n,
  bandQuoteTarget: 1_000_000_000n,
  bandsRequired: 10,
  minQuoteIn: 100_000n,
  minBaseIn: 1_000_000n,
  binMin: -64,
  binMax: 511,
  maxBinsPerSwap: 32,
  bandSize: 10,
};

/** Small thresholds for local-validator demonstrations. TEST ONLY. */
export const TEST_SETTINGS: FactorySettingsInput = {
  ...PILOT_SETTINGS,
  maturityQuoteTarget: 100_000_000n, // 0.1 SOL
  bandQuoteTarget: 1_000_000n, // 0.001 SOL
  bandsRequired: 2,
};

export interface MarketView {
  address: PublicKey;
  raw: RawMarket;
  config: MarketConfig;
  state: MarketState;
  store: BinStore;
  p0X64: bigint;
  missingPages: number[];
}

export interface RoutePages {
  /** Pages the program must receive (traversal order, cursor page first). */
  pages: PublicKey[];
  /** Page indices among them that do not exist yet and must be created in the same transaction. */
  toCreate: number[];
}

const bn = (x: bigint | number) => new BN(x.toString());

export class PopClient {
  readonly program: Program<PopMarket>;
  readonly programId: PublicKey;
  readonly connection: Connection;
  readonly eventParser: EventParser;

  constructor(readonly provider: Provider) {
    this.program = new Program<PopMarket>(IDL as Idl as PopMarket, provider);
    this.programId = this.program.programId;
    this.connection = provider.connection;
    this.eventParser = new EventParser(this.programId, this.program.coder);
  }

  static readOnly(connection: Connection, commitment: Commitment = "confirmed"): PopClient {
    const provider = new AnchorProvider(connection, { publicKey: PublicKey.default, signTransaction: async <T>(t: T) => t, signAllTransactions: async <T>(t: T[]) => t } as never, { commitment });
    return new PopClient(provider);
  }

  get protocolAddress() {
    return protocolPda(this.programId);
  }

  // ---------------------------------------------------------------- reads

  async fetchProtocol() {
    return this.program.account.protocolConfig.fetch(this.protocolAddress);
  }

  async fetchBuybackVault() {
    return this.program.account.buybackVault.fetch(buybackPda(this.programId));
  }

  async fetchMarketRaw(market: PublicKey): Promise<RawMarket> {
    return (await this.program.account.market.fetch(market)) as unknown as RawMarket;
  }

  private marketSize(): number {
    return MARKET_ACCOUNT_SIZE;
  }

  async fetchAllMarkets(): Promise<{ publicKey: PublicKey; account: RawMarket }[]> {
    const all = await this.program.account.market.all([{ dataSize: this.marketSize() }]);
    return all.map((a) => ({ publicKey: a.publicKey, account: a.account as unknown as RawMarket }));
  }

  /** Markets created by `creator` (any status), via memcmp on the immutable creator field. */
  async fetchMarketsByCreator(creator: PublicKey): Promise<{ publicKey: PublicKey; account: RawMarket }[]> {
    const all = await this.program.account.market.all([
      { dataSize: this.marketSize() },
      { memcmp: { offset: MARKET_CREATOR_OFFSET, bytes: creator.toBase58() } },
    ]);
    return all.map((a) => ({ publicKey: a.publicKey, account: a.account as unknown as RawMarket }));
  }

  /** Fetch a market with all its pages (36 pages for the pilot range; one RPC batch). */
  async fetchMarket(market: PublicKey, pageIndices?: number[]): Promise<MarketView> {
    const raw = await this.fetchMarketRaw(market);
    const config = toMarketConfig(raw);
    const { minPage, maxPage } = pageRange(config);
    const indices = pageIndices ?? Array.from({ length: maxPage - minPage + 1 }, (_, i) => minPage + i);
    const keys = indices.map((i) => pagePda(this.programId, market, i));
    const fetched = keys.length ? await this.program.account.binPage.fetchMultiple(keys) : [];
    const pages: RawBinPage[] = [];
    const missingPages: number[] = [];
    fetched.forEach((p, k) => {
      if (p) pages.push(p as unknown as RawBinPage);
      else missingPages.push(indices[k]!);
    });
    const store = toBinStore(config, pages);
    return { address: market, raw, config, state: toMarketState(raw), store, p0X64: BigInt(raw.p0X64.toString()), missingPages: pageIndices ? store.missingPages() : missingPages };
  }

  async fetchPage(market: PublicKey, pageIndex: number): Promise<RawBinPage | null> {
    const p = await this.program.account.binPage.fetchNullable(pagePda(this.programId, market, pageIndex));
    return p as unknown as RawBinPage | null;
  }

  async pageRentLamports(): Promise<number> {
    return this.connection.getMinimumBalanceForRentExemption(BIN_PAGE_SIZE);
  }

  // ---------------------------------------------------------------- quotes

  /**
   * Quote using the exact integer walker. Uninitialized pages are treated as their fixed seed
   * schedule (virtual pages); `routePages` reports which ones the transaction must create.
   */
  quote(view: MarketView, direction: Direction, grossInput: bigint, minOutput = 0n, opts: { virtualPages?: boolean } = {}): SwapOutcome {
    const virtual = opts.virtualPages ?? true;
    return quoteSwap(view.config, view.state, view.p0X64, (b) => (virtual ? view.store.getVirtual(b) : view.store.get(b)), { direction, grossInput, minOutput });
  }

  routePages(view: MarketView, q: SwapQuote): RoutePages {
    return {
      pages: q.pagesTouched.map((i) => pagePda(this.programId, view.address, i)),
      toCreate: q.pagesTouched.filter((i) => !view.store.hasPage(i)),
    };
  }

  /** @deprecated use routePages */
  pagesForQuote(view: MarketView, q: SwapQuote): PublicKey[] {
    return this.routePages(view, q).pages;
  }

  depth(view: MarketView, direction: Direction, bps: number) {
    return executableDepth(view.config, view.state, view.p0X64, (b) => view.store.getVirtual(b), direction, bps);
  }

  progress(view: MarketView) {
    return graduationProgress(view.state, view.config);
  }

  priceAt(view: MarketView, bin: number) {
    return priceAtBin(view.p0X64, bin);
  }

  /** Apply a quote locally (optimistic UI / tests); mirrors commit_swap. Requires real pages. */
  applyLocally(view: MarketView, q: SwapQuote, direction: Direction, grossInput: bigint) {
    return commitSwap(view.config, view.state, view.p0X64, (b) => view.store.getOrThrow(b), q, { direction, grossInput, minOutput: 0n });
  }

  // ---------------------------------------------------------------- instruction builders

  async initializeProtocolIx(payer: PublicKey, args: { authority: PublicKey; protocolFeeRecipient: PublicKey; buybackAuthority: PublicKey; settings: FactorySettingsInput; buybackMinIntervalSlots: bigint; buybackMaxWithdrawPerExecution: bigint; launchesEnabled: boolean }) {
    const s = args.settings;
    return this.program.methods
      .initializeProtocol({
        authority: args.authority,
        protocolFeeRecipient: args.protocolFeeRecipient,
        buybackAuthority: args.buybackAuthority,
        settings: {
          minSeedQuote: bn(s.minSeedQuote),
          scarFeeBps: s.scarFeeBps,
          protocolFeeBps: s.protocolFeeBps,
          creatorFeeBps: s.creatorFeeBps,
          buybackShareBps: s.buybackShareBps,
          maturityQuoteTarget: bn(s.maturityQuoteTarget),
          bandQuoteTarget: bn(s.bandQuoteTarget),
          bandsRequired: s.bandsRequired,
          minQuoteIn: bn(s.minQuoteIn),
          minBaseIn: bn(s.minBaseIn),
          binMin: s.binMin,
          binMax: s.binMax,
          maxBinsPerSwap: s.maxBinsPerSwap,
          bandSize: s.bandSize,
        },
        buybackMinIntervalSlots: bn(args.buybackMinIntervalSlots),
        buybackMaxWithdrawPerExecution: bn(args.buybackMaxWithdrawPerExecution),
        launchesEnabled: args.launchesEnabled,
      })
      .accountsPartial({ payer, protocolConfig: this.protocolAddress, buybackVault: buybackPda(this.programId), buybackQuoteAccount: buybackQuoteAccountPda(this.programId), quoteMint: NATIVE_MINT })
      .instruction();
  }

  async setLaunchesEnabledIx(authority: PublicKey, enabled: boolean) {
    return this.program.methods.setLaunchesEnabled(enabled).accountsPartial({ authority, protocolConfig: this.protocolAddress }).instruction();
  }

  async setPopMintIx(authority: PublicKey, popMint: PublicKey) {
    return this.program.methods.setPopMint().accountsPartial({ authority, protocolConfig: this.protocolAddress, popMint }).instruction();
  }

  /** Creates the mint + market (mint authority revoked inside). `baseMint` must sign (fresh keypair). */
  async createMarketIx(creator: PublicKey, baseMint: PublicKey, args: { name: string; symbol: string; uri: string; seedBase: bigint; seedQuote: bigint; decimals: number }) {
    const market = marketPda(this.programId, baseMint);
    return this.program.methods
      .createMarket({ name: args.name, symbol: args.symbol, uri: args.uri, seedBase: bn(args.seedBase), seedQuote: bn(args.seedQuote), decimals: args.decimals })
      .accountsPartial({ creator, protocolConfig: this.protocolAddress, baseMint, quoteMint: NATIVE_MINT, market, ...marketVaults(this.programId, market) })
      .instruction();
  }

  async initializeBinPageIx(payer: PublicKey, market: PublicKey, pageIndex: number) {
    return this.program.methods.initializeBinPage(pageIndex).accountsPartial({ payer, market, page: pagePda(this.programId, market, pageIndex) }).instruction();
  }

  /** Instructions to initialize the given pages (default: all), skipping ones that already exist. */
  async initializePagesIxs(payer: PublicKey, market: PublicKey, config: MarketConfig, indices?: number[], skip: Set<number> = new Set()) {
    const { minPage, maxPage } = pageRange(config);
    const list = indices ?? Array.from({ length: maxPage - minPage + 1 }, (_, i) => minPage + i);
    const ixs: TransactionInstruction[] = [];
    for (const p of list) if (p >= minPage && p <= maxPage && !skip.has(p)) ixs.push(await this.initializeBinPageIx(payer, market, p));
    return ixs;
  }

  /** @deprecated use initializePagesIxs */
  async initializeAllPagesIxs(payer: PublicKey, market: PublicKey, config: MarketConfig, skip: Set<number> = new Set()) {
    return this.initializePagesIxs(payer, market, config, undefined, skip);
  }

  /** Pages created at launch (cursor page and neighbours). */
  static launchPages(): number[] {
    return [...LAUNCH_PAGES];
  }

  async activateMarketIx(creator: PublicKey, market: PublicKey, baseMint: PublicKey) {
    const v = marketVaults(this.programId, market);
    return this.program.methods
      .activateMarket()
      .accountsPartial({ creator, market, baseMint, baseVault: v.baseVault, quoteVault: v.quoteVault, creatorQuoteAccount: getAssociatedTokenAddressSync(NATIVE_MINT, creator) })
      .instruction();
  }

  async swapIx(user: PublicKey, view: MarketView, args: { isBuy: boolean; grossInput: bigint; minOutput: bigint; deadlineSlot: bigint; expectedConfigVersion?: number }, pages: PublicKey[]) {
    const v = marketVaults(this.programId, view.address);
    return this.program.methods
      .swapExactIn({ isBuy: args.isBuy, grossInput: bn(args.grossInput), minOutput: bn(args.minOutput), deadlineSlot: bn(args.deadlineSlot), expectedConfigVersion: args.expectedConfigVersion ?? view.config.configVersion })
      .accountsPartial({
        user,
        market: view.address,
        baseVault: v.baseVault,
        quoteVault: v.quoteVault,
        feeVaultBase: v.feeVaultBase,
        feeVaultQuote: v.feeVaultQuote,
        userBase: getAssociatedTokenAddressSync(view.raw.baseMint, user),
        userQuote: getAssociatedTokenAddressSync(NATIVE_MINT, user),
      })
      .remainingAccounts(pages.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
      .instruction();
  }

  /**
   * Full swap transaction for a wallet: compute budget, idempotent ATAs, creation of any bin
   * pages the route needs (rent paid by the trader), SOL wrapping for buys (or unwrapping after
   * sells when `unwrap` is set), then the swap.
   */
  async buildSwapTransaction(user: PublicKey, view: MarketView, q: SwapQuote, args: { isBuy: boolean; grossInput: bigint; minOutput: bigint; deadlineSlot: bigint; unwrap?: boolean; computeUnits?: number }) {
    const route = this.routePages(view, q);
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: args.computeUnits ?? 400_000 + 30_000 * route.toCreate.length }));
    const userBase = getAssociatedTokenAddressSync(view.raw.baseMint, user);
    const userQuote = getAssociatedTokenAddressSync(NATIVE_MINT, user);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userBase, user, view.raw.baseMint));
    tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userQuote, user, NATIVE_MINT));
    for (const p of route.toCreate) tx.add(await this.initializeBinPageIx(user, view.address, p));
    if (args.isBuy) {
      tx.add(SystemProgram.transfer({ fromPubkey: user, toPubkey: userQuote, lamports: Number(args.grossInput) }));
      tx.add(createSyncNativeInstruction(userQuote));
    }
    tx.add(await this.swapIx(user, view, args, route.pages));
    if (args.unwrap) tx.add(createCloseAccountInstruction(userQuote, user, user));
    return tx;
  }

  async matchBinsIx(market: PublicKey, pageIndex: number) {
    return this.program.methods.matchBins().accountsPartial({ market, page: pagePda(this.programId, market, pageIndex) }).instruction();
  }

  async evaluateGraduationIx(market: PublicKey) {
    return this.program.methods.evaluateGraduation().accountsPartial({ market }).instruction();
  }

  /** kind 0 = protocol, 1 = creator. `asset` picks the fee vault. Destination must be the recipient's ATA. */
  async claimFeesIx(market: PublicKey, kind: 0 | 1, asset: "base" | "quote", recipient: PublicKey, baseMint: PublicKey) {
    const v = marketVaults(this.programId, market);
    const mint = asset === "base" ? baseMint : NATIVE_MINT;
    return this.program.methods
      .claimFees(kind)
      .accountsPartial({ protocolConfig: this.protocolAddress, market, feeVault: asset === "base" ? v.feeVaultBase : v.feeVaultQuote, destination: getAssociatedTokenAddressSync(mint, recipient) })
      .instruction();
  }

  async sweepBuybackIx(market: PublicKey) {
    const v = marketVaults(this.programId, market);
    return this.program.methods.sweepBuybackFunds().accountsPartial({ market, feeVaultQuote: v.feeVaultQuote, buybackVault: buybackPda(this.programId), buybackQuoteAccount: buybackQuoteAccountPda(this.programId) }).instruction();
  }

  /** Bounded withdrawal to the authority's own WSOL ATA (must be combined with the buy-and-burn by the keeper). */
  async withdrawBuybackIx(authority: PublicKey, amount: bigint) {
    return this.program.methods
      .withdrawBuybackFunds(bn(amount))
      .accountsPartial({ authority, protocolConfig: this.protocolAddress, buybackVault: buybackPda(this.programId), buybackQuoteAccount: buybackQuoteAccountPda(this.programId), destination: getAssociatedTokenAddressSync(NATIVE_MINT, authority), quoteMint: NATIVE_MINT })
      .instruction();
  }

  // ---------------------------------------------------------------- events

  /** Decode this program's events from a confirmed transaction's logs. */
  async eventsForSignature(signature: string, commitment: Commitment = "confirmed") {
    const tx = await this.connection.getTransaction(signature, { commitment: commitment as "confirmed" | "finalized", maxSupportedTransactionVersion: 0 });
    const logs = tx?.meta?.logMessages ?? [];
    return [...this.eventParser.parseLogs(logs)];
  }

  // ---------------------------------------------------------------- helpers

  static ata(mint: PublicKey, owner: PublicKey, allowOffCurve = false) {
    return getAssociatedTokenAddressSync(mint, owner, allowOffCurve, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  }

  static marketAddress(programId: PublicKey, baseMint: PublicKey) {
    return marketPda(programId, baseMint);
  }

  static newMintKeypair() {
    return Keypair.generate();
  }
}
