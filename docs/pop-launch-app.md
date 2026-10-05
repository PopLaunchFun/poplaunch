# Pop Launch connected app — Stage 3

Status: **working end to end on localnet** through the real UI: create a coin (image upload, signed
metadata, on-chain creation), back it from two wallets, keeper settlement into the real Raydium
program, claim, missed-target refund. Not deployed to devnet or mainnet. Not audited.

## Pieces

| Piece | Path | Role |
|---|---|---|
| Web app | `apps/poplaunch` | Approved screens wired to wallet, chain and backend |
| Backend | `services/launchd` | Chain sync cache, metadata drafts and images, discovery API, settlement keeper |
| Program | `programs/pop_launch` | Escrow, receipts, atomic settlement (see `docs/pop-launch-mechanism.md`) |
| SDK | `packages/sdk/src/launch.ts` | PDAs, Raydium address derivation, transaction builders, integer entitlement |
| End-to-end run | `tests/e2e/poplaunch.mjs` | Drives the flow through the browser and saves screenshots |

## Modes (decided at build time, never mixed)

| Mode | Build env | What shows |
|---|---|---|
| Demo | `NEXT_PUBLIC_DEMO=1` | The three mockup coins from fixtures; no wallet, no chain, no backend. Yellow "Demo preview" strip. |
| Localnet | `NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_SOLANA_NETWORK=localnet` | Real program on the local validator, "Localnet · test SOL only" strip, Phantom/Solflare plus a localnet-only Dev wallet |
| Devnet / mainnet | `NEXT_PUBLIC_SOLANA_NETWORK=devnet` or `mainnet-beta` | Real program; Dev wallet not registered; mainnet shows no strip |

Fixtures are only imported when `DEMO` is on, so demo coins cannot appear in a live feed. Every page
labels its network, and explorer links carry the cluster.

## Running it locally

```
scripts/localnet.sh start                                   # validator + pop_launch + Raydium fixture
POP_FUNDING_SECS=240 POP_SETTLE_SECS=90 POP_TARGET_SOL=2 \
  pnpm --filter @pop/integration bootstrap:launch           # protocol settings (V1 defaults without the env vars)
docker exec pop-postgres psql -U pop -c "create database poplaunch"   # once
KEEPER_KEYPAIR=~/.config/poplaunch/keeper.json SIGN_DOMAIN=localhost pnpm --filter @pop/launchd start
NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_SOLANA_NETWORK=localnet NEXT_PUBLIC_SIGN_DOMAIN=localhost \
  pnpm --filter @pop/poplaunch build && pnpm --filter @pop/poplaunch start   # http://localhost:3100
node tests/e2e/poplaunch.mjs                                # full flow with screenshots
```

## What the app does

- **Wallet.** Phantom and Solflare through wallet-adapter. On localnet a "Dev wallet" keypair kept in
  the browser's localStorage lets the whole flow run without an extension; it is not registered for
  devnet or mainnet builds. The wallet menu shows balance, My pops and (localnet) a test airdrop.
- **Home.** Hero with the featured launch (top of the discovery sort), then Launches with Filling up /
  Just launched tabs and search. Server-rendered from `launchd`, polled every 5 s. If the index is older
  than 30 s or unreachable the feed says so instead of hiding it.
- **Launch page.** Reads `launchd`; when the index is behind or down it reads the Launch account from
  the chain directly and says so. The connected wallet's position always comes from its on-chain
  receipt. Actions: back (amount, presets, exact remainder, balance check, review step with the required
  lock text, states Approve → Confirming your backing… → "You're in. Let's make it pop." with the
  signature; rejected returns to the unchanged form; failed shows a retry), Finish launch (permissionless
  settlement if the keeper is late, with the keeper's attempt log), Claim (exact entitlement to the
  owner's token account), Trade (Raydium swap link for the mint), Reclaim SOL (full principal), and for
  the creator Reclaim unused setup reserve.
- **Create a coin.** Two steps. Step 1 validates name (≤32), ticker (1–10 A–Z0–9), image (png/jpeg/gif/
  webp ≤ 1 MB, checked by magic bytes server-side), description (≤500), https website and X handle.
  Step 2 shows the fixed terms read from the protocol config and the exact costs: creation fee, quoted
  setup reserve (Raydium's configured creation fee + rent of the accounts settlement creates), account
  rent, network fees. Publishing = one message signature (domain-bound, expiring, replay-protected
  upload of the metadata; moves nothing) + one `create_launch` transaction. The mint keypair and draft
  are kept in the browser until the launch exists, so a failed transaction is retried without a second
  draft or fee.
- **Metadata.** `launchd` stores the image and a canonical metadata JSON, serves it at
  `/api/launches/:mint/metadata.json`, and the launch stores its sha256. Once the chain shows a launch
  with that hash the draft is frozen. Metaplex on-chain metadata is still not created (its program is
  not available in this sandbox); the uri and hash are in place for it.
- **My pops.** Active / Claimable / Refundable / Created with one action each, plus the wallet's
  transaction history with explorer links. Falls back to reading receipts from the chain when the index
  is down.
- **How it works**, **Terms** and **Privacy** pages (the last two are marked as drafts).
- **Share.** Copy link on every launch and an Open Graph card per launch with a timestamped snapshot.

## Backend (`services/launchd`)

- Every 2.5 s scans all Launch and receipt accounts (`getProgramAccounts`) and upserts them, then walks
  new program signatures and stores events keyed by signature + index. The database is a cache: refunds,
  claims and backing never depend on it.
- Effective state (REFUNDABLE after a missed deadline) is derived from chain time exactly like the
  program, so the UI never waits for a keeper to "expire" a launch.
- Keeper: every 4 s submits `finalize_launch` for READY launches with its own fee wallet, records every
  attempt (sent / confirmed / failed with the error) for the launch page. It has no authority over
  escrow; the UI's "Finish launch" sends the same instruction from the user's wallet.
- Draft uploads require an ed25519 signature over `Pop Launch draft / Domain / sha256(payload) /
  Signed at`; signatures older than 10 minutes or already used are rejected. Images are size- and
  type-checked and served with an immutable cache header and a no-script CSP.
- Rate limit per IP on every endpoint.

## Verified in this run (localnet, real Raydium program)

`tests/e2e/poplaunch.mjs` with screenshots in `apps/poplaunch/screenshots/e2e/`:

1. Wallet A connects (Dev wallet), airdrops, creates "E2E Cat" with an uploaded image: metadata signed
   and uploaded, `create_launch` confirmed, redirected to the launch page (chain fallback while the index
   catches up).
2. A backs 1.5 SOL: review step, confirmation, "You're in. Let's make it pop." with the signature;
   receipt shows 1.5 SOL and 375,000,000 E2ECAT entitlement.
3. Wallet B backs the exact remainder (0.5 SOL): launch flips to READY; the keeper settles within
   seconds (confirmed signature logged; pool created, 999,999,999,900 LP burned).
4. Page shows "POP! E2E Cat is live." B claims 125,000,000 E2ECAT; receipt updates; a second claim shows
   "Nothing to claim".
5. My pops lists the claimable position for A.
6. A creates a second coin, backs 0.1 SOL, the funding window lapses, the page shows "This one didn't
   launch", Reclaim SOL returns the 0.1 SOL with its signature.

## Not done / blockers

- Metaplex token metadata on chain (program not obtainable here). Uri + hash are in place.
- Devnet deployment and a real-extension wallet test (Phantom/Solflare): the sandbox has no browser
  extension and no public RPC access. The adapters are wired; the Dev wallet exercises the same code
  path.
- Mobile deep-link wallet flow untested for the same reason.
- Terms and Privacy are drafts. No analytics, no email.
- Image moderation is limited to type/size checks.
