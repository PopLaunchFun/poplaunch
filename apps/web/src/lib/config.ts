export const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "localnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8899";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? "6pTC8K5PtUKGpQdHZoEsu26qLEehFDh2m1BLKRndNggx";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://explorer.solana.com";
export const SOL_USD_URL = process.env.NEXT_PUBLIC_SOL_USD_URL ?? "";
export const GIT_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT ?? "dev";
export const IS_MAINNET = NETWORK === "mainnet-beta";

export function explorerTx(sig: string): string {
  const cluster = NETWORK === "mainnet-beta" ? "" : NETWORK === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `${EXPLORER}/tx/${sig}${cluster}`;
}

export function explorerAddress(addr: string): string {
  const cluster = NETWORK === "mainnet-beta" ? "" : NETWORK === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `${EXPLORER}/address/${addr}${cluster}`;
}
