# Pop Launch Stage 4 report: production readiness

Status after this stage: **reviewed internally and hardened, verified on localnet, not deployed.** The
brief's Stage 4 asks for an independent review, verified addresses and costs, monitoring, authority
disclosure, terms and privacy, and a deployment plan. Everything an engineer can do without a public
cluster or outside parties is done; the items that need them are listed at the end, and mainnet stays
behind an explicit release decision.

## 1. Security review and fixes

Two adversarial reviews were run against the whole codebase (one on the program and SDK, one on the
backend and web app). They are **internal** reviews, not the independent audit the brief requires; that
audit still has to be commissioned and is a mainnet gate. Every finding is listed with what was done.

### Program (`programs/pop_launch`)

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| P1 | Critical (availability) | Anyone could send the rent minimum (~0.0009 SOL) to the future pool address; the program required `lamports == 0`, so every settlement failed and the launch refunded after 60 min. A free "cancel" button for anyone. | Check `owner == system && data empty` instead; Raydium itself allocates a funded system account. | `launch-hardening`: stray lamports at the pool address |
| P2 | Critical (availability) | Anyone could pre-create and pre-fund the authority's wrapped-SOL account; the program required its balance to equal the target exactly, so settlement failed the same way. | Delta accounting: sync, record the balance, move the target, sync, require the delta equals the target; after the pool CPI require the balance is back to the recorded value. | same test, pre-funded WSOL ATA |
| P3 | Medium | The minimum contribution was read from the live protocol settings, so a settings change altered open launches (contradicting "terms frozen at opening"). | `min_contribution_lamports` copied into the Launch account at opening and read from there; the config account is no longer part of `contribute`. | `update_settings never alters an open launch` |
| P4 | Medium | The protocol authority could point future launches at an arbitrary "DEX" program, quote mint or fee receiver, and that program would receive the escrowed SOL. | Hard-coded allowlist of the verified Raydium CP-Swap program ids and fee receivers (mainnet and devnet); quote mint must be wrapped SOL; minimum reserve must be positive; `SettingsUpdated` event. | `settings are validated against the verified allowlist` |
| P5 | Medium | `initialize_protocol` could be front-run at deployment by anyone, taking the authority. | Restricted to the program's upgrade authority (checked against the loader's ProgramData account). Localnet loads the program as upgradeable with the test admin as authority. | bootstrap on a fresh validator; `verify:addresses` prints the authority |
| P6 | Low | `reclaim_unused_setup_reserve` could flip a launch to REFUNDABLE without emitting the event. | Emits `LaunchRefundable` on that transition. | covered by event ingestion |
| P7 | Low | LP burn was proven only on the launch's token account, not on the LP mint's supply. | `require!(lp_mint.supply == 0)` after the burn. | asserted in both suites |
| P8 | Low | Two token accounts created during settlement (~0.004 SOL rent) were never closed, so the creator could not reclaim that part of the reserve. | Both are closed into the authority PDA at the end of settlement; the creator's reclaim now returns their rent too. | hardening test asserts both accounts are gone and the reclaim empties the reserve to the rent minimum |
| P9 | Info | Stack frame of `finalize_launch` exceeded the limit after the changes. | Split into three non-inlined helpers; the build reports no stack warnings. | build log |

Added after the review (and after the owner's audit): `transfer_authority`, a six-line authority-only instruction that hands the protocol authority (settings and pause, never funds) to another key, with an event; covered by `launch-hardening`. The owner should tell the auditor about it if the engagement allows.

Not changed, by decision: receipts are not closed on refund (backers keep ~0.0016 SOL of rent locked;
closing would need a terminal-state guarantee that is better reviewed independently); there is no
authority-transfer instruction (changing the protocol authority needs an upgrade; documented in the
disclosure); the keeper transaction carries no priority fee (operational setting, see runbook).

### Backend (`services/launchd`)

| # | Severity | Finding | Fix |
|---|---|---|---|
| B1 | High | A launch's displayed metadata came from any draft with the same mint, even after the chain pinned a different hash, so a creator could swap the website link after backers committed. | Only the draft whose hash equals the on-chain hash is ever shown; uploads for a mint that already has an on-chain launch are rejected regardless of hash. |
| B2 | High | No request body limit; a multi-GB upload was buffered before the size check. | `bodyLimit` on the upload route (image limit + 64 KB) returning 413. |
| B3 | High | Rate limiter keyed on the client-supplied `X-Forwarded-For` header, with an unbounded map. | Keyed on the socket address; the header is honoured only when `TRUSTED_PROXY=1` (rightmost hop); entries expire; map capped. |
| B4 | High | Unlimited permanent storage of images and drafts by throwaway keys. | At most 3 open drafts per wallet; unpublished drafts and their images expire after 48 h; replay table pruned hourly. |
| B5 | Medium | Status endpoint returned the RPC URL (which often carries an API key). | Returns the host only. |
| B6 | Medium | Event ingestion could skip history after downtime and could storm the RPC after a dropped block. | Reads at `finalized`; keeps a backfill cursor so a long gap is walked over several ticks and never skipped. |
| B7 | Low | Upload signatures were burned before validation, so a rejected form needed a new signature. | Verified first, burned only when the draft is stored. |
| B8 | Low | Names and descriptions allowed bidirectional and zero-width Unicode (display spoofing). | Stripped and NFC-normalised. |
| B9 | Low | Missing `nosniff`, `no-store` and a tighter image CSP; invalid mint on one route returned 500. | Added; returns 400. |
| B10 | Ops | No keeper safeguards or health. | Balance floor below which it stands down, alert threshold, per-launch error isolation, health in `/api/status`, `ALERT raised/cleared` log lines, housekeeping loop. |

### Web app (`apps/poplaunch`)

| # | Severity | Finding | Fix |
|---|---|---|---|
| W1 | Medium | The browser pinned the server's metadata uri and hash on chain without checking them. | After upload the browser fetches the document, re-derives the hash, and checks name, ticker, mint and network match what the wallet signed; otherwise it refuses to publish. |
| W2 | Medium | A pending draft in the browser was not bound to a cluster; resuming on another network could create a real launch pointing at the wrong backend. | Drafts record network, backend and program; anything else is discarded on load. |
| W3 | Medium | The network defaulted to localnet, so a mainnet build missing one variable would ship the localStorage Dev wallet and airdrop button. | No default: a live build fails to compile unless the cluster is named; mainnet requires https RPC and API; the Dev wallet is loaded dynamically only on localnet and is absent from other bundles. |
| W4 | Medium | A transaction error after broadcast was reported as "nothing was executed", inviting a double contribution. | The signature is kept; the app polls its status for up to 30 s before classifying, and never claims nothing happened unless the chain says so. |
| W5 | Low | Localnet showed a Raydium link to the mainnet site; the mint had no explorer link. | Link hidden on localnet; mint, creator and pool link to the explorer with the right cluster. |
| W6 | Low | Route ids reached the backend unencoded. | Validated as base58 keys and encoded. |

## 2. Immutable token metadata

Every coin now gets Metaplex Token Metadata written inside `create_launch`, before the mint authority
is revoked, with `is_mutable = false` and the launch authority PDA as update authority. Wallets and
explorers show the name, ticker and image. The Metaplex program was built from source for localnet
(`scripts/metaplex-fixture.sh`); the hardening suite decodes the on-chain metadata account and checks
owner, authority, name, symbol and the immutable flag.

## 3. Verified addresses and costs

`packages/sdk/src/networks.ts` holds the per-cluster addresses with their provenance (Raydium's own
source for program ids, admins and fee receivers; the Token Metadata program id). The program itself
only accepts those DEX program ids and fee receivers. `pnpm --filter @pop/integration verify:addresses`
checks a live cluster: programs executable, upgrade authorities printed, AmmConfig decoded with its real
fee tier and "pool creation enabled" flag, fee receiver is a wrapped-SOL account, and the on-chain
protocol settings match the registry. It passes on localnet; it must be run on devnet and mainnet before
`initialize_protocol` there (no public RPC is reachable from this sandbox).

Measured costs on the rebuilt program (`pnpm --filter @pop/integration measure:costs`, details in
`docs/costs.json`):

| Instruction | Compute units | Base fee |
|---|---|---|
| `create_launch` | 121,752 | 0.000010 SOL |
| `contribute (new receipt)` | 17,983 | 0.000005 SOL |
| `contribute (existing receipt)` | 15,343 | 0.000005 SOL |
| `contribute (fills target)` | 18,322 | 0.000005 SOL |
| `finalize_launch` | 245,771 | 0.000005 SOL |
| `claim_tokens (creates ATA)` | 52,500 | 0.000005 SOL |
| `reclaim_unused_setup_reserve` | 12,031 | 0.000005 SOL |
| `refund (lazy expiry)` | 14,962 | 0.000005 SOL |

| Account rent (paid once) | SOL |
|---|---|
| Launch account | 0.00418 |
| Mint | 0.00146 |
| Backer vault + pool vault (token accounts) | 0.00408 |
| Token metadata (Metaplex, 679 bytes) | 0.00562 |
| Escrow + authority PDAs (system accounts) | 0.00178 |
| Contribution receipt (per backer, paid by backer) | 0.00157 |
| Backer token account on claim (paid by claimer) | 0.00204 |

Creator setup reserve quoted at 0.2042 SOL (Raydium's 0.15 SOL pool-creation fee plus the rent of the pool accounts and a margin); settlement consumed 0.1901 SOL and the rest is reclaimable. A creator therefore pays about 0.1 SOL fee + 0.190 SOL pool costs + 0.017 SOL rent for a successful launch; a backer pays about 0.0016 SOL receipt rent plus 0.002 SOL for the token account on claim, plus network fees. Fees above are at the base rate; priority fees on mainnet come on top.

## 4. Operations

- `GET /api/status` now reports index lag and age, RPC health, keeper address, balance, stuck READY
  launches, failed attempts in the last 15 minutes, last success, and a list of active alert conditions.
- launchd logs `ALERT raised <name>` / `ALERT cleared <name>` once per transition for log-based paging.
- The keeper stands down below a balance floor (anyone can still settle from the launch page) and alerts
  earlier; drafts, orphaned images and used signatures are garbage-collected.
- `docs/runbook.md` lists thresholds and the response to each condition.

## 5. Disclosure, terms, privacy, deployment plan

- `/authority` page ("Who controls what") and `docs/authority-disclosure.md`: every key, what it can
  and cannot do, the mainnet multisig plan, and the verified addresses with explorer links.
- `/terms` and `/privacy` rewritten in full plain language. Both are labelled "pending counsel review";
  that review is a mainnet gate, not something this stage can do.
- `docs/deployment-poplaunch.md`: hosting, environment, devnet steps, mainnet gates (independent review,
  address verification, multisig, verifiable build, counsel, monitoring, owner decision), rollback.

## 6. Test evidence (localnet, real Raydium and Metaplex programs)

| Suite | Result |
|---|---|
| `launch.test.ts` (Stage 2 mechanism proof) | 10 passed |
| `launch-hardening.test.ts` (this stage) | 6 passed |
| `launchpad.test.ts` (older pop_market program) | 14 passed |
| Browser end-to-end (`tests/e2e/poplaunch.mjs`) | passed: create with immutable metadata, two wallets back, keeper settles (LP burned 999,999,999,900), claim, My pops, missed-target refund; screenshots in `apps/poplaunch/screenshots/e2e/` |

## 7. What still needs other people or a public cluster

1. ~~Independent security review~~ Done per the owner (October 2026), no blocking findings; the report is
   held privately by the owner.
2. **Devnet deployment** and a Phantom / Solflare desktop and mobile test with real wallets. The sandbox
   has no public RPC access and no browser extensions.
3. **Mainnet multisig** (Squads) with members, threshold and timelock chosen by the owner.
4. ~~Counsel review~~ Done per the owner (October 2026); contact hello@poplaunch.fun on both pages.
5. **Production hosting** accounts (RPC provider, database, web host) and the `poplaunch.fun` DNS.
6. **Owner's production release decision**, after the gates in the deployment plan.
