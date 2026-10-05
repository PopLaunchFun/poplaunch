/** Direct chain reads: the source of truth when launchd is stale or down. */
import { Connection, PublicKey } from "@solana/web3.js";
import { LAUNCH_STATE, PopLaunchClient, launchPda, entitlement } from "@pop/sdk";
import { RPC_URL } from "./config";
import type { Launch } from "./launch";

let conn: Connection | null = null;
let client: PopLaunchClient | null = null;

export function connection(): Connection {
  if (!conn) conn = new Connection(RPC_URL, "confirmed");
  return conn;
}
export function readClient(): PopLaunchClient {
  if (!client) client = PopLaunchClient.readOnly(connection());
  return client;
}

type BNish = { toString(): string; toNumber(): number };

/** Decode a Launch account into the UI shape. Refundability is derived from chain time like the program does. */
export async function fetchLaunchFromChain(mint: string, previous?: Launch | null): Promise<Launch | null> {
  const mintPk = new PublicKey(mint);
  const address = launchPda(mintPk);
  const l = await readClient().program.account.launch.fetchNullable(address);
  if (!l) return null;
  const slot = await connection().getSlot("confirmed");
  const now = (await connection().getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const n = (x: BNish) => x.toNumber();
  const raised = BigInt(l.raisedLamports.toString()), target = BigInt(l.targetLamports.toString());
  let state = LAUNCH_STATE[l.state] ?? "refundable";
  let refundReason: Launch["refundReason"] = l.refundReason === 1 ? "missed-target" : l.refundReason === 2 ? "settlement-timeout" : null;
  if (state === "funding" && now >= n(l.fundingDeadline) && raised < target) { state = "refundable"; refundReason = "missed-target"; }
  if (state === "ready" && now >= n(l.settlementDeadline)) { state = "refundable"; refundReason = "settlement-timeout"; }
  return {
    id: mint,
    address: address.toBase58(),
    name: l.name,
    ticker: l.symbol,
    hue: previous?.hue ?? 30,
    art: null,
    image: previous?.image ?? null,
    tagline: previous?.tagline ?? "",
    description: previous?.description ?? "",
    creator: l.creator.toBase58(),
    mint,
    socials: previous?.socials ?? {},
    state,
    refundReason,
    raisedLamports: raised.toString(),
    targetLamports: target.toString(),
    backerWallets: l.backerWallets,
    openedAt: n(l.openedAt) * 1000,
    fundingDeadline: n(l.fundingDeadline) * 1000,
    filledAt: n(l.filledAt) ? n(l.filledAt) * 1000 : null,
    settlementDeadline: n(l.settlementDeadline) ? n(l.settlementDeadline) * 1000 : null,
    liveAt: n(l.liveAt) ? n(l.liveAt) * 1000 : null,
    creatorContributionLamports: "0",
    poolUrl: null,
    poolState: l.poolState.equals(PublicKey.default) ? null : l.poolState.toBase58(),
    lpBurned: l.lpBurned.toString(),
    supply: l.supply.toString(),
    decimals: l.decimals,
    backerAllocation: l.backerAllocation.toString(),
    poolAllocation: l.poolAllocation.toString(),
    settlementAttempts: previous?.settlementAttempts ?? [],
    updatedSlot: slot,
  };
}

export interface Position { contributed: bigint; claimed: bigint; refunded: bigint; entitled: bigint }

export async function fetchPosition(l: Launch, owner: PublicKey): Promise<Position | null> {
  if (!l.address) return null;
  const r = await readClient().fetchReceipt(new PublicKey(l.address), owner);
  if (!r) return null;
  const contributed = BigInt(r.contributedLamports.toString());
  return { contributed, claimed: BigInt(r.claimedBaseUnits.toString()), refunded: BigInt(r.refundedLamports.toString()), entitled: entitlement(contributed, BigInt(l.targetLamports), BigInt(l.backerAllocation ?? "0")) };
}
