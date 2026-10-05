import { PublicKey } from "@solana/web3.js";

export const SEEDS = {
  protocol: Buffer.from("protocol"),
  market: Buffer.from("market"),
  page: Buffer.from("page"),
  vesting: Buffer.from("vesting"),
  buyback: Buffer.from("buyback"),
  vaultBase: Buffer.from("vault_base"),
  vaultQuote: Buffer.from("vault_quote"),
  feeBase: Buffer.from("fee_base"),
  feeQuote: Buffer.from("fee_quote"),
  quote: Buffer.from("quote"),
  vault: Buffer.from("vault"),
};

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function i32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
}

export function protocolPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.protocol], programId)[0];
}

export function buybackPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.buyback], programId)[0];
}

export function buybackQuoteAccountPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.buyback, SEEDS.quote], programId)[0];
}

export function marketPda(programId: PublicKey, baseMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.market, baseMint.toBuffer()], programId)[0];
}

export function marketVaults(programId: PublicKey, market: PublicKey) {
  const f = (seed: Buffer) => PublicKey.findProgramAddressSync([seed, market.toBuffer()], programId)[0];
  return { baseVault: f(SEEDS.vaultBase), quoteVault: f(SEEDS.vaultQuote), feeVaultBase: f(SEEDS.feeBase), feeVaultQuote: f(SEEDS.feeQuote) };
}

export function pagePda(programId: PublicKey, market: PublicKey, pageIndex: number): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.page, market.toBuffer(), i32le(pageIndex)], programId)[0];
}

export function vestingPda(programId: PublicKey, market: PublicKey, index: number): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.vesting, market.toBuffer(), Buffer.from([index])], programId)[0];
}

export function vestingVaultPda(programId: PublicKey, vesting: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SEEDS.vesting, SEEDS.vault, vesting.toBuffer()], programId)[0];
}
