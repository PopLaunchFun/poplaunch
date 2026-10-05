// Generates the localnet fixture for Raydium CP-Swap's hardcoded pool-creation fee receiver:
// DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8 must exist as a wrapped-SOL token account because the
// program deserializes it (and transfers the create_pool_fee into it) during `initialize`.
// The account is preloaded into solana-test-validator with --account; its owner is a throwaway key
// derived from a fixed seed (no secret is stored, and nothing on localnet depends on it).
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AccountLayout, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const FEE_ACCOUNT = "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8";
const RENT = 2_039_280; // rent-exempt minimum for a 165-byte token account
const owner = Keypair.fromSeed(createHash("sha256").update("poplaunch-cpswap-fee-owner").digest()).publicKey;

const data = Buffer.alloc(AccountLayout.span);
AccountLayout.encode(
  {
    mint: NATIVE_MINT,
    owner,
    amount: 0n,
    delegateOption: 0,
    delegate: PublicKey.default,
    state: 1, // initialized
    isNativeOption: 1,
    isNative: BigInt(RENT), // for wrapped SOL this field holds the rent-exempt reserve
    delegatedAmount: 0n,
    closeAuthorityOption: 0,
    closeAuthority: PublicKey.default,
  },
  data,
);

const fixture = {
  pubkey: FEE_ACCOUNT,
  account: { lamports: RENT, data: [data.toString("base64"), "base64"], owner: TOKEN_PROGRAM_ID.toBase58(), executable: false, rentEpoch: 0 },
};
mkdirSync(new URL("../../fixtures/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../fixtures/create_pool_fee_account.json", import.meta.url), JSON.stringify(fixture, null, 2));
console.log(`wrote tests/fixtures/create_pool_fee_account.json (owner ${owner.toBase58()})`);
