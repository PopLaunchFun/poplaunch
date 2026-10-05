/**
 * Runtime mode. Three mutually exclusive configurations, decided at build time:
 *   demo     NEXT_PUBLIC_DEMO=1            fixtures only, no chain, no API (the visual preview)
 *   localnet NEXT_PUBLIC_SOLANA_NETWORK=localnet   real program on a local validator, test SOL
 *   devnet / mainnet-beta                  real program on a public cluster
 * Demo fixtures are never loaded unless DEMO is on, so they cannot leak into a live feed.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
const NETWORKS = ["localnet", "devnet", "mainnet-beta"] as const;
const rawNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "";
// Fail closed: a live build must say which cluster it is for. There is no default, so a mainnet deployment
// that forgets the variable cannot ship the localnet Dev wallet, airdrop button or custom-cluster links.
if (!DEMO && !(NETWORKS as readonly string[]).includes(rawNetwork)) {
  throw new Error(`NEXT_PUBLIC_SOLANA_NETWORK must be one of ${NETWORKS.join(", ")} (got "${rawNetwork}"); set NEXT_PUBLIC_DEMO=1 for the demo build`);
}
export const NETWORK = DEMO ? "demo" : rawNetwork;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? (NETWORK === "localnet" || DEMO ? "http://127.0.0.1:8899" : "");
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (NETWORK === "localnet" || DEMO ? "http://127.0.0.1:8788" : "");
if (NETWORK === "mainnet-beta" && !/^https:\/\//.test(RPC_URL)) throw new Error("mainnet builds need an https NEXT_PUBLIC_RPC_URL");
if (NETWORK === "mainnet-beta" && !/^https:\/\//.test(API_URL)) throw new Error("mainnet builds need an https NEXT_PUBLIC_API_URL");
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

/** The project's token contract address, shown as a copyable chip in the header once it exists. Empty hides the chip. */
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").trim();
