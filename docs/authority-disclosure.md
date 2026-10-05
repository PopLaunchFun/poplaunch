# Pop Launch authority disclosure

What each key can and cannot do. This page is the source for the public `/authority` page in the app
and must be updated before any cluster deployment. Pop Launch is **not trustless** while an upgrade
authority exists; this document says exactly who holds which power.

## 1. Program upgrade authority (highest power)

Solana programs deployed with the upgradeable loader can be replaced by their upgrade authority. A new
program version could change escrow logic, so this is the one key that could, in principle, take backer
funds. Mitigations, in the order they apply:

| Cluster | Upgrade authority | Status |
|---|---|---|
| localnet | throwaway key in `scripts/deploy/keys/` (gitignored) | test only |
| devnet | deployer hot key | test only; funds are test SOL |
| mainnet | **must be a Squads multisig with a timelock** (threshold and members published here before deployment) | not deployed |

Rules for mainnet:
- The program is deployed from a **verifiable build** (`anchor build --verifiable` / `solana-verify`) and the
  build hash is published next to the program id so anyone can confirm the deployed bytes match this repo.
- The upgrade authority is transferred to the multisig in the same release session as the deployment, and
  the transfer signature is published here.
- Every upgrade proposal is announced with its diff and build hash at least the timelock period before it
  can execute. Backers who disagree can refund or claim during that period (refunds and claims never depend
  on an upgrade).
- Once the mechanism has run unchanged for a disclosed period, the authority is set to **none**
  (`solana program set-upgrade-authority --final`), which makes the program immutable. That decision is
  announced in advance.

What an upgrade cannot do even in the worst case: change a token's mint authority (revoked, see below),
un-burn LP tokens, or take tokens out of a Raydium pool that it does not own.

## 2. Protocol authority (`ProtocolConfig.authority`)

A single on-chain key stored in the protocol config account. It can call exactly two instructions:

| Instruction | Effect | Cannot |
|---|---|---|
| `update_settings` | Change the settings for launches created from now on (target, window, timeout, supply, allocations, creation fee, minimum contribution, minimum setup reserve, fee recipient, AMM program and config, fee receiver, quote mint). Bumps the settings version. | Alter any existing launch: terms are copied into the Launch account at creation and never read from the config again. |
| `set_paused` | Block new launches. | Stop settlement, claims, refunds or setup-reserve reclaims on existing launches. |

There is no instruction that moves SOL or tokens out of any escrow, vault, receipt or pool to the
authority. There is no admin "sweep". Unsolicited SOL sent to a vault stays there.

The protocol authority will be the same multisig as the upgrade authority on mainnet. Changing it requires
a program upgrade in V1 (there is no transfer instruction); that is a deliberate V1 limitation and is listed
in the review findings.

## 3. Creation-fee recipient (`settings.fee_recipient`)

Receives the 0.1 SOL creation fee that a creator pays when `create_launch` succeeds. It has no other
power. It is a plain wallet (mainnet: a multisig-controlled treasury address published here).

## 4. Settlement keeper (operational)

The `launchd` service runs a keeper that submits the permissionless `finalize_launch` instruction for
filled launches. It signs with its own fee wallet only. The program gives the keeper **no privilege**:
anyone, including the launch page's "Finish launch now" button, can submit the same instruction. If the
keeper is offline, settlement is late but not lost; if nobody settles within 60 minutes, backers refund.

The keeper wallet holds only enough SOL for transaction fees. Pool-creation costs are paid from the
creator's setup reserve held in the launch's authority PDA, not by the keeper.

## 5. Raydium (external program)

Settlement creates the pool through Raydium's CP-Swap program and burns all LP tokens issued to the
launch. Raydium's own admin controls its AMM config (fee tiers) and can pause pool creation; neither
gives Raydium access to pooled assets. Raydium's protocol/fund fee share of trading fees is Raydium's,
disclosed in Launch details. The addresses used per cluster and their provenance are in
`packages/sdk/src/networks.ts` and are verified live with `pnpm --filter @pop/integration verify:addresses`.

## 6. Token authorities

For every launched coin: supply is minted in full into program vaults inside `create_launch`, the mint
authority is revoked in the same transaction, and no freeze authority is ever set. Token metadata is
created immutable (`is_mutable = false`) under the Metaplex Token Metadata standard, with the launch
authority PDA as update authority, so neither the creator nor Pop Launch can rename or re-image a coin
after it opens.

## 7. What Pop Launch, the company, holds

- Private keys: the devnet deployer key, the keeper fee wallet, and a seat on the mainnet multisig.
- Servers: the web app, `launchd` (metadata, images, discovery index, keeper) and its database. The
  database is a cache; taking it offline cannot block refunds or claims, which read the chain directly.
- Domain `poplaunch.fun`.

Pop Launch holds no backer SOL and no launch tokens at any point.
