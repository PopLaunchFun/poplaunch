# Pop Launch mechanism — Stage 2 proof

Status: **proven on a local validator against the real Raydium CP-Swap program**, built from Raydium's
source. Not deployed to devnet or mainnet. Not audited. Not safe for public deposits yet (see "What is
not done").

## What the program does

`programs/pop_launch` (program id on localnet `Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy`).

| Instruction | Who | Effect |
|---|---|---|
| `initialize_protocol` | authority, once | Stores versioned V1 settings |
| `update_settings` / `set_paused` | authority | New launches only; pause never touches settlement, claims or refunds |
| `create_launch` | creator | Creates the mint, mints the fixed supply into two program vaults (backer 500M, pool 500M), revokes the mint authority (no freeze authority was ever set), freezes name/symbol/uri/metadata hash and every term, pays the 0.1 SOL creation fee, funds escrow rent and the setup reserve, opens funding |
| `contribute` | anyone | Moves SOL into the launch escrow PDA; rejects below-minimum (unless exact remainder) and over-remaining amounts whole; the contribution that reaches the target flips the launch to READY and records the settlement deadline |
| `finalize_launch` | anyone, before the settlement deadline | Wraps exactly the target SOL, creates the Raydium pool with exactly the pool allocation, burns every LP token issued, verifies reserves, marks LIVE. One transaction, all or nothing |
| `claim_tokens` | anyone, for a receipt owner | Sends the owner's remaining entitlement to the owner's associated token account. Never expires, never redirectable |
| `refund` | anyone, for a receipt owner | After the funding deadline below target, or after the settlement deadline, returns the owner's full principal. Refundability is derived from chain time inside the call |
| `expire_launch` | anyone | Convenience: persists the derived REFUNDABLE state |
| `top_up_setup_reserve` | anyone | Adds to the setup reserve without gaining any privilege |
| `reclaim_unused_setup_reserve` | creator, after LIVE or REFUNDABLE | Returns what settlement did not consume |

There is no instruction that withdraws backer principal to anyone but the receipt owner, no cancel,
no retarget, no extend, no creator or platform token allocation, and no admin sweep.

### Accounts

- `ProtocolConfig` PDA `["config"]`: authority, paused, version, settings.
- `Launch` PDA `["launch", mint]`: immutable terms, timeline, accounting, settlement record.
- `ContributionReceipt` PDA `["receipt", launch, wallet]`: contributed, claimed, refunded. Non-transferable.
- Escrow PDA `["escrow", launch]`: system account holding backer principal plus its own rent. Only
  `finalize_launch` (exactly target, into the launch's WSOL account) and `refund` (to receipt owners) move
  lamports out of it. Unsolicited lamports sent to it are ignored by all accounting.
- Authority PDA `["auth", launch]`: system account that is Raydium's pool "creator", the authority of
  both token vaults, the WSOL account and the LP account, and the holder of the setup reserve.
- Backer vault `["backer_vault", launch]` and pool vault `["pool_vault", launch]`: SPL token accounts.

### Integer accounting

Entitlement = `floor(contribution_lamports × backer_allocation / target_lamports)` in u128. With the V1
defaults (50 SOL, 500,000,000 tokens with 6 decimals) that is exactly 10,000 base units per lamport, so
no dust exists. Percentages shown in the UI are basis points computed the same way.

### Settlement, step by step (one transaction)

1. Checks: READY, chain time < settlement deadline, pool vault holds the full pool allocation, escrow holds
   rent + target.
2. Derives every Raydium address (authority, pool state, LP mint, both vaults, observation state) from the
   approved program id and AMM config recorded in the launch, and requires the passed accounts to match.
   Requires the pool state account to be empty: a pre-existing pool is never adopted.
3. Creates the authority's WSOL associated token account (rent from the setup reserve), transfers exactly
   `target` lamports from the escrow into it, `sync_native`, and checks the token amount equals target.
4. CPI `raydium_cp_swap::initialize(init_amount_0, init_amount_1, open_time = 0)` signed by the
   authority PDA. Raydium creates the pool state, vaults, LP mint, LP account and observation account,
   charges its 0.15 SOL creation fee from the authority, mints LP to the authority and keeps its own
   100-unit minimum locked.
5. Reads the pool vaults: quote vault == target, base vault == pool allocation, launch WSOL account == 0.
6. Burns the entire LP balance of the authority and checks it is zero afterwards.
7. Marks LIVE, records pool, LP mint, LP burned, seeded amounts; emits `LaunchLive`.

Measured on localnet: **210,687 compute units, 24 accounts, one legacy transaction (no lookup table
needed), 0.194 SOL of setup reserve consumed** (0.15 SOL of it is Raydium's creation fee; the rest is
rent for the accounts Raydium creates and the WSOL account).

## What the tests prove

`tests/integration/src/launch.test.ts`, run with `pnpm --filter @pop/integration exec vitest run
src/launch.test.ts` against `scripts/localnet.sh start`. 9 tests, all passing, every assertion on chain state:

- Fixture: the Raydium program is executable at `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`, an
  AmmConfig with mainnet-like fees (0.25% trade, 0.15 SOL creation) exists, the hardcoded fee receiver
  account is a WSOL token account.
- `create_launch`: supply 1,000,000,000 minted and split 500M/500M into the vaults; mint and freeze
  authorities null; fee recipient received 0.1 SOL; escrow holds exactly its rent; authority holds rent +
  reserve; a second launch on the same mint fails.
- `contribute`: below minimum rejected; above remaining rejected whole; repeated deposits update one
  receipt; the exact sub-minimum remainder is accepted; the target flips READY atomically with the
  settlement deadline recorded; no deposit, claim or refund afterwards.
- Pre-created-pool griefing: an outsider cannot create the pool for the coin because no coin exists
  outside the program vaults (Raydium rejects empty supply); the pool PDA stays empty.
- `finalize_launch`: reserves exactly target / pool allocation; launch WSOL and pool vault empty; LP supply
  0 (every issued LP token burned, Raydium's `lp_supply` = burned + 100 locked); escrow back to its rent;
  Raydium's fee account received 0.15 SOL; cannot run twice; no refund after LIVE. Claims pay exact
  entitlements (1 SOL of 2 SOL → 250,000,000 tokens), sponsored by a third party, into the owner's ATA,
  never twice; a wallet with no receipt cannot claim; the backer vault ends empty; the creator reclaims
  the unused reserve once. The pool is tradable: an outsider's `swap_base_input` on the real program
  returns coin.
- Missed target: deposits rejected after the deadline; any caller can trigger a refund that pays only the
  receipt owner; full principal returned; state becomes REFUNDABLE with reason 1; escrow back to rent;
  no claim; creator reclaims the whole reserve.
- Settlement timeout: a READY launch past its deadline cannot settle (`SettlementExpired`), becomes
  REFUNDABLE with reason 2, refunds in full, and can never settle afterwards.
- Unsolicited SOL sent to the escrow changes neither `raised` nor state; a donor cannot refund or claim;
  a reserve top-up grants no reclaim right; pausing blocks new launches while an existing launch keeps
  accepting contributions and reaching READY.
- Accounting identity: escrow lamports − rent == raised − seeded − refunded; no receipt has both a
  claim and a refund.

## How to run it

```
scripts/raydium-fixture.sh                               # builds Raydium CP-Swap from source (Docker)
node tests/integration/scripts/raydium-fee-account.mjs   # fee-receiver account fixture
scripts/build-program.sh                                 # builds pop_market and pop_launch, copies IDLs
scripts/localnet.sh start                                # validator with both programs + Raydium
pnpm --filter @pop/sdk build
pnpm --filter @pop/integration exec vitest run src/launch.test.ts
```

## Known limits and what is not done

- **Token metadata.** Name, symbol, uri and a 32-byte metadata hash are frozen in the `Launch` account.
  Metaplex Token Metadata is not created on-chain yet: the Metaplex program binary cannot be downloaded
  in this environment, so it is not in the localnet fixture. The connected app (Stage 3) must create
  immutable metadata before opening funding; the program already stores the hash to pin it against.
- **Raydium addresses are per network.** The program verifies the DEX program id, AMM config and fee
  receiver recorded in the protocol settings. For devnet those are Raydium's devnet ids
  (`DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`, fee receiver
  `3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy`); for mainnet the ids above. They must be inspected
  and set at deployment, never assumed.
- **Open time.** The pool opens one second after creation (Raydium's rule for `open_time = 0`). Claims
  are enabled in the same transaction, so faster claimers and outside buyers can trade first, as the
  specification states.
- **Setup reserve quote** is computed client-side from rent sizes plus Raydium's configured creation fee,
  with the protocol minimum (0.2 SOL) as a floor. If Raydium changes account sizes or fees, the quote and
  the minimum must be revisited.
- **Upgrade authority.** The program is upgradeable until its authority is revoked or moved to a
  disclosed multisig/timelock. Until then the system is not trustless and must not be described as such.
- **No independent security review** has been performed.
- **Devnet** deployment is blocked in this environment (public RPC hosts are unreachable from the
  sandbox). `scripts/deploy/devnet.sh` from the earlier project shows the intended procedure.
