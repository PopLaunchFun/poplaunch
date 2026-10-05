/**
 * PopLaunchClient: typed wrapper over the pop_launch program. PDAs, settlement account derivation
 * (including the Raydium CP-Swap addresses), integer entitlement math and transaction builders.
 */
import { AnchorProvider, EventParser, Program, type Provider } from "@anchor-lang/core";
import BN from "bn.js";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import launchIdl from "./idl/pop_launch.json" with { type: "json" };
import type { PopLaunch } from "./idl/pop_launch.js";
import { TOKEN_METADATA_PROGRAM_ID } from "./networks.js";

export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
/** The upgradeable loader's ProgramData account for a program. */
export function programDataPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE_ID)[0];
}
/** Metaplex Token Metadata PDA for a mint. */
export function metadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()], TOKEN_METADATA_PROGRAM_ID)[0];
}

export const LAUNCH_IDL = launchIdl as unknown as PopLaunch;
export const LAUNCH_PROGRAM_ID = new PublicKey((launchIdl as { address: string }).address);

/** Raydium CP-Swap mainnet program id (also used by the localnet fixture built from source). */
export const RAYDIUM_CP_SWAP = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
/** Raydium's hardcoded pool-creation fee receiver (wrapped-SOL token account). */
export const RAYDIUM_CREATE_POOL_FEE_RECEIVER = new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8");

export const LAUNCH_SEEDS = {
  config: Buffer.from("config"),
  launch: Buffer.from("launch"),
  auth: Buffer.from("auth"),
  escrow: Buffer.from("escrow"),
  backerVault: Buffer.from("backer_vault"),
  poolVault: Buffer.from("pool_vault"),
  receipt: Buffer.from("receipt"),
};

export function launchConfigPda(programId = LAUNCH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([LAUNCH_SEEDS.config], programId)[0];
}
export function launchPda(mint: PublicKey, programId = LAUNCH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([LAUNCH_SEEDS.launch, mint.toBuffer()], programId)[0];
}
export function launchAccounts(launch: PublicKey, programId = LAUNCH_PROGRAM_ID) {
  const pda = (seed: Buffer) => PublicKey.findProgramAddressSync([seed, launch.toBuffer()], programId)[0];
  return { auth: pda(LAUNCH_SEEDS.auth), escrow: pda(LAUNCH_SEEDS.escrow), backerVault: pda(LAUNCH_SEEDS.backerVault), poolVault: pda(LAUNCH_SEEDS.poolVault) };
}
export function receiptPda(launch: PublicKey, owner: PublicKey, programId = LAUNCH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync([LAUNCH_SEEDS.receipt, launch.toBuffer(), owner.toBuffer()], programId)[0];
}

/** Raydium CP-Swap addresses for a (config, token0, token1) pool; token0 must sort below token1. */
export function raydiumPoolAddresses(ammConfig: PublicKey, token0: PublicKey, token1: PublicKey, program = RAYDIUM_CP_SWAP) {
  const f = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program)[0];
  const authority = f([Buffer.from("vault_and_lp_mint_auth_seed")]);
  const poolState = f([Buffer.from("pool"), ammConfig.toBuffer(), token0.toBuffer(), token1.toBuffer()]);
  return {
    authority,
    poolState,
    lpMint: f([Buffer.from("pool_lp_mint"), poolState.toBuffer()]),
    token0Vault: f([Buffer.from("pool_vault"), poolState.toBuffer(), token0.toBuffer()]),
    token1Vault: f([Buffer.from("pool_vault"), poolState.toBuffer(), token1.toBuffer()]),
    observationState: f([Buffer.from("observation"), poolState.toBuffer()]),
  };
}
export function raydiumAmmConfigPda(index: number, program = RAYDIUM_CP_SWAP): PublicKey {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(index);
  return PublicKey.findProgramAddressSync([Buffer.from("amm_config"), b], program)[0];
}

/** Sorted mint pair the way Raydium expects (token0 < token1 by bytes). */
/** Raydium swap page for a launched coin (the only trading surface in V1). */
export function raydiumSwapUrl(mint: PublicKey, network: string): string {
  const base = network === "devnet" ? "https://raydium.io/swap/?cluster=devnet&" : "https://raydium.io/swap/?";
  return `${base}inputMint=sol&outputMint=${mint.toBase58()}`;
}

export function sortMints(a: PublicKey, b: PublicKey): [PublicKey, PublicKey, boolean] {
  const aFirst = Buffer.compare(a.toBuffer(), b.toBuffer()) < 0;
  return aFirst ? [a, b, true] : [b, a, false];
}

/** Entitlement = floor(contribution × backerAllocation / target). Integer only. */
export function entitlement(contributionLamports: bigint, targetLamports: bigint, backerAllocation: bigint): bigint {
  if (targetLamports === 0n) return 0n;
  return (contributionLamports * backerAllocation) / targetLamports;
}

export interface LaunchSettingsInput {
  targetLamports: bigint;
  fundingWindowSecs: bigint;
  settlementTimeoutSecs: bigint;
  supply: bigint;
  decimals: number;
  backerAllocation: bigint;
  poolAllocation: bigint;
  creationFeeLamports: bigint;
  minContributionLamports: bigint;
  minSetupReserveLamports: bigint;
  feeRecipient: PublicKey;
  cpSwapProgram: PublicKey;
  ammConfig: PublicKey;
  createPoolFeeReceiver: PublicKey;
  quoteMint: PublicKey;
}

/** V1 design defaults from the product specification. Localnet tests override the windows. */
export function v1Settings(feeRecipient: PublicKey, ammConfig: PublicKey, overrides: Partial<LaunchSettingsInput> = {}): LaunchSettingsInput {
  return {
    targetLamports: 50_000_000_000n,
    fundingWindowSecs: 86_400n,
    settlementTimeoutSecs: 3_600n,
    supply: 1_000_000_000_000_000n,
    decimals: 6,
    backerAllocation: 500_000_000_000_000n,
    poolAllocation: 500_000_000_000_000n,
    creationFeeLamports: 100_000_000n,
    minContributionLamports: 10_000_000n,
    minSetupReserveLamports: 200_000_000n,
    feeRecipient,
    cpSwapProgram: RAYDIUM_CP_SWAP,
    ammConfig,
    createPoolFeeReceiver: RAYDIUM_CREATE_POOL_FEE_RECEIVER,
    quoteMint: NATIVE_MINT,
    ...overrides,
  };
}

const bn = (x: bigint) => new BN(x.toString());

function toIdlSettings(s: LaunchSettingsInput) {
  return {
    targetLamports: bn(s.targetLamports),
    fundingWindowSecs: bn(s.fundingWindowSecs),
    settlementTimeoutSecs: bn(s.settlementTimeoutSecs),
    supply: bn(s.supply),
    decimals: s.decimals,
    backerAllocation: bn(s.backerAllocation),
    poolAllocation: bn(s.poolAllocation),
    creationFeeLamports: bn(s.creationFeeLamports),
    minContributionLamports: bn(s.minContributionLamports),
    minSetupReserveLamports: bn(s.minSetupReserveLamports),
    feeRecipient: s.feeRecipient,
    cpSwapProgram: s.cpSwapProgram,
    ammConfig: s.ammConfig,
    createPoolFeeReceiver: s.createPoolFeeReceiver,
    quoteMint: s.quoteMint,
  };
}

export type LaunchAccount = Awaited<ReturnType<Program<PopLaunch>["account"]["launch"]["fetch"]>>;
export type ReceiptAccount = Awaited<ReturnType<Program<PopLaunch>["account"]["contributionReceipt"]["fetch"]>>;
export const LAUNCH_STATE = ["funding", "ready", "live", "refundable"] as const;

export class PopLaunchClient {
  readonly program: Program<PopLaunch>;
  readonly programId: PublicKey;
  constructor(readonly provider: Provider) {
    this.program = new Program<PopLaunch>(LAUNCH_IDL, provider);
    this.programId = this.program.programId;
  }
  static readOnly(connection: Connection): PopLaunchClient {
    const provider = new AnchorProvider(connection, { publicKey: PublicKey.default, signTransaction: async (t) => t, signAllTransactions: async (t) => t }, { commitment: "confirmed" });
    return new PopLaunchClient(provider);
  }
  get connection(): Connection {
    return this.provider.connection;
  }

  // ---------------------------------------------------------------- reads
  fetchConfig() {
    return this.program.account.protocolConfig.fetch(launchConfigPda(this.programId));
  }
  fetchLaunch(launch: PublicKey) {
    return this.program.account.launch.fetch(launch);
  }
  fetchReceipt(launch: PublicKey, owner: PublicKey) {
    return this.program.account.contributionReceipt.fetchNullable(receiptPda(launch, owner, this.programId));
  }
  /** All receipts of one wallet, straight from chain (owner is at offset 8 + 32). */
  fetchReceiptsByOwner(owner: PublicKey) {
    return this.program.account.contributionReceipt.all([{ memcmp: { offset: 8 + 32, bytes: owner.toBase58() } }]);
  }
  fetchAllLaunches() {
    return this.program.account.launch.all();
  }
  async eventsForSignature(signature: string) {
    const tx = await this.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx?.meta?.logMessages) return [];
    const parser = new EventParser(this.programId, this.program.coder);
    return [...parser.parseLogs(tx.meta.logMessages)];
  }

  // ---------------------------------------------------------------- admin
  initializeProtocolIx(authority: PublicKey, settings: LaunchSettingsInput) {
    return this.program.methods.initializeProtocol(toIdlSettings(settings)).accountsPartial({ authority, config: launchConfigPda(this.programId), program: this.programId, programData: programDataPda(this.programId), systemProgram: SystemProgram.programId }).instruction();
  }
  updateSettingsIx(authority: PublicKey, settings: LaunchSettingsInput) {
    return this.program.methods.updateSettings(toIdlSettings(settings)).accountsPartial({ authority, config: launchConfigPda(this.programId) }).instruction();
  }
  setPausedIx(authority: PublicKey, paused: boolean) {
    return this.program.methods.setPaused(paused).accountsPartial({ authority, config: launchConfigPda(this.programId) }).instruction();
  }

  // ---------------------------------------------------------------- creator
  /**
   * Quote the creator's setup reserve: rent for every account settlement creates (WSOL ATA, LP mint, LP ATA,
   * pool state, two pool vaults, observation state) plus Raydium's create_pool_fee, plus a small margin.
   */
  async quoteSetupReserve(createPoolFeeLamports: bigint, minimumLamports = 0n): Promise<{ total: bigint; parts: Record<string, bigint> }> {
    const rent = (bytes: number) => this.connection.getMinimumBalanceForRentExemption(bytes).then(BigInt);
    const parts: Record<string, bigint> = {
      wsolAta: await rent(165),
      lpMint: await rent(82),
      lpAta: await rent(165),
      poolState: await rent(637),
      vault0: await rent(165),
      vault1: await rent(165),
      observation: await rent(8 + 1 + 2 + 32 + 40 * 100 + 32),
      createPoolFee: createPoolFeeLamports,
      margin: 10_000_000n,
    };
    const sum = Object.values(parts).reduce((a, b) => a + b, 0n);
    return { total: sum > minimumLamports ? sum : minimumLamports, parts };
  }

  async createLaunchIx(creator: PublicKey, mint: PublicKey, args: { name: string; symbol: string; uri: string; metadataHash: Uint8Array; setupReserveLamports: bigint }, feeRecipient: PublicKey) {
    const launch = launchPda(mint, this.programId);
    const a = launchAccounts(launch, this.programId);
    return this.program.methods
      .createLaunch({ name: args.name, symbol: args.symbol, uri: args.uri, metadataHash: Array.from(args.metadataHash) as number[], setupReserveLamports: bn(args.setupReserveLamports) })
      .accountsPartial({ creator, config: launchConfigPda(this.programId), launch, mint, auth: a.auth, escrow: a.escrow, backerVault: a.backerVault, poolVault: a.poolVault, feeRecipient, metadata: metadataPda(mint), tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
      .instruction();
  }

  // ---------------------------------------------------------------- backers
  contributeIx(backer: PublicKey, launch: PublicKey, lamports: bigint) {
    const a = launchAccounts(launch, this.programId);
    return this.program.methods.contribute(bn(lamports)).accountsPartial({ backer, launch, escrow: a.escrow, receipt: receiptPda(launch, backer, this.programId), systemProgram: SystemProgram.programId }).instruction();
  }
  claimTokensIx(payer: PublicKey, launch: PublicKey, mint: PublicKey, owner: PublicKey) {
    const a = launchAccounts(launch, this.programId);
    return this.program.methods
      .claimTokens()
      .accountsPartial({ payer, launch, receipt: receiptPda(launch, owner, this.programId), owner, mint, auth: a.auth, backerVault: a.backerVault, ownerAta: getAssociatedTokenAddressSync(mint, owner, true), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .instruction();
  }
  refundIx(caller: PublicKey, launch: PublicKey, owner: PublicKey) {
    const a = launchAccounts(launch, this.programId);
    return this.program.methods.refund().accountsPartial({ caller, launch, receipt: receiptPda(launch, owner, this.programId), owner, escrow: a.escrow, systemProgram: SystemProgram.programId }).instruction();
  }
  expireLaunchIx(caller: PublicKey, launch: PublicKey) {
    return this.program.methods.expireLaunch().accountsPartial({ caller, launch }).instruction();
  }
  topUpSetupReserveIx(funder: PublicKey, launch: PublicKey, lamports: bigint) {
    const a = launchAccounts(launch, this.programId);
    return this.program.methods.topUpSetupReserve(bn(lamports)).accountsPartial({ funder, launch, auth: a.auth, systemProgram: SystemProgram.programId }).instruction();
  }
  reclaimUnusedSetupReserveIx(creator: PublicKey, launch: PublicKey) {
    const a = launchAccounts(launch, this.programId);
    return this.program.methods.reclaimUnusedSetupReserve().accountsPartial({ creator, launch, auth: a.auth, systemProgram: SystemProgram.programId }).instruction();
  }

  // ---------------------------------------------------------------- settlement
  /** Every account the atomic settlement touches, derived from the launch record. */
  settlementAccounts(launch: PublicKey, l: { mint: PublicKey; quoteMint: PublicKey; ammConfig: PublicKey; cpSwapProgram: PublicKey; createPoolFeeReceiver: PublicKey }) {
    const a = launchAccounts(launch, this.programId);
    const [t0, t1] = sortMints(l.quoteMint, l.mint);
    const r = raydiumPoolAddresses(l.ammConfig, t0, t1, l.cpSwapProgram);
    return {
      launch,
      mint: l.mint,
      auth: a.auth,
      escrow: a.escrow,
      poolVault: a.poolVault,
      quoteMint: l.quoteMint,
      authQuote: getAssociatedTokenAddressSync(l.quoteMint, a.auth, true),
      authLp: getAssociatedTokenAddressSync(r.lpMint, a.auth, true),
      cpSwapProgram: l.cpSwapProgram,
      ammConfig: l.ammConfig,
      cpAuthority: r.authority,
      poolState: r.poolState,
      lpMint: r.lpMint,
      token0Vault: r.token0Vault,
      token1Vault: r.token1Vault,
      createPoolFee: l.createPoolFeeReceiver,
      observationState: r.observationState,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    };
  }
  async finalizeLaunchIx(caller: PublicKey, launch: PublicKey, l?: LaunchAccount) {
    const rec = l ?? (await this.fetchLaunch(launch));
    return this.program.methods.finalizeLaunch().accountsPartial({ caller, ...this.settlementAccounts(launch, rec) }).instruction();
  }
  /** Settlement transaction with a generous compute budget; the Raydium CPI is the expensive part. */
  async buildFinalizeTransaction(caller: PublicKey, launch: PublicKey): Promise<Transaction> {
    const ix = await this.finalizeLaunchIx(caller, launch);
    return new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ix);
  }

  static newMintKeypair(): Keypair {
    return Keypair.generate();
  }
  static ixs(...ixs: TransactionInstruction[]): Transaction {
    return new Transaction().add(...ixs);
  }
}
