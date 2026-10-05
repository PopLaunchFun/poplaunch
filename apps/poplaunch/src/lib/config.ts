/**
 * Runtime mode. Three mutually exclusive configurations, decided at build time:
 *   demo     NEXT_PUBLIC_DEMO=1            fixtures only, no chain, no API (the visual preview)
 *   localnet NEXT_PUBLIC_SOLANA_NETWORK=localnet   real program on a local validator, test SOL
 *   devnet / mainnet-beta                  real program on a public cluster
 * Demo fixtures are never loaded unless DEMO is on, so they cannot leak into a live feed.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const NETWORK = DEMO ? "demo" : (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "localnet");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8899";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8788";
/** Hostname bound into signed draft messages; must match launchd's SIGN_DOMAIN. */
export const SIGN_DOMAIN = process.env.NEXT_PUBLIC_SIGN_DOMAIN ?? "poplaunch.fun";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://explorer.solana.com";
export const IS_MAINNET = NETWORK === "mainnet-beta";
export const IS_LOCALNET = NETWORK === "localnet";

export const NETWORK_LABEL: Record<string, string> = {
  demo: "Demo preview · no chain connected · no real SOL",
  localnet: "Localnet · test SOL only",
  devnet: "Devnet · test SOL only",
  "mainnet-beta": "Mainnet",
};

export function explorerTx(sig: string): string {
  const cluster = NETWORK === "mainnet-beta" ? "" : NETWORK === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `${EXPLORER}/tx/${sig}${cluster}`;
}
export function explorerAddress(addr: string): string {
  const cluster = NETWORK === "mainnet-beta" ? "" : NETWORK === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  return `${EXPLORER}/address/${addr}${cluster}`;
}
