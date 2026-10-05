# POP — Proof of Pain launchpad

Launch a coin. Build its liquidity. Every coin launched here trades on a price-bin market where matched buy and sell fees become nonwithdrawable liquidity at the exact price bins where trading happened. *The market remembers.*

**Status: local-validator product complete (v2 launchpad); devnet deployment not yet performed from this environment (Solana RPC hosts blocked by the build sandbox); mainnet disabled.** See `docs/status-report.md` for the candid per-component table and `docs/economic-findings.md` for what the simulator actually shows. The $POP token itself launches externally (Pump.fun) and is not hosted here; the protocol only escrows a buyback earmark for it.

## Repository

```
apps/web/            Next.js 16 launchpad: explore, launch, coin page with live scar map, my launches, status, lab
services/indexer/    PostgreSQL indexer + read API (idempotent, commitment-aware, signed coin metadata, burn watcher)
services/keeper/     Buyback keeper: bounded escrow withdrawal + Jupiter buy + burn in one transaction
programs/pop_market/ Rust/Anchor program
packages/math/       Executable integer specification (TypeScript, BigInt) + property tests
packages/sdk/        Typed client: PDAs, account views, exact quotes (virtual pages), tx builders
packages/simulator/  Deterministic simulator + required scenarios
tests/integration/   End-to-end tests against a local validator
tests/vectors/       Golden vectors shared by TypeScript and Rust
scripts/             build-program.sh, localnet.sh, reset-localnet.sh, deploy/
docs/                launch-rules, mechanism, authority model, deployment, findings, status, sim results, screenshots
```

## Pinned toolchain

| Component | Version | Where |
|---|---|---|
| Node / pnpm | 22.x / 10.28.0 | host |
| TypeScript | 5.9.3 | workspace |
| Anchor CLI | 1.0.2 | Docker image `solanafoundation/anchor:v1.0.2` |
| anchor-lang / anchor-spl | =1.2.0 | `programs/pop_market/Cargo.toml` |
| Solana CLI / test validator | 3.1.10 (Agave) | same image |
| platform-tools (SBF) | v1.52 | cached in the image |
| Rust (host unit tests) | 1.89+ | host; the program itself is built in Docker |
| PostgreSQL | 16 | Docker `postgres:16-alpine` or any 16.x |

Docker is the only host requirement for building and running the program.

## Quick start (fresh developer, local validator)

```sh
pnpm install
pnpm --filter @pop/math build && pnpm --filter @pop/sdk build && pnpm --filter @pop/simulator build

# 1. Unit, property and simulator checks (no chain)
pnpm test                             # math (27), sdk (4), simulator (19)
pnpm sim                              # docs/sim-results/*.json + SUMMARY.md
cargo test -p pop_market              # Rust math + golden replay of the TypeScript vectors

# 2. Build the program (Docker)
scripts/build-program.sh              # -> target/deploy/pop_market.so, IDL copied into packages/sdk

# 3. Local validator (program preloaded) and database
docker run -d --name pop-postgres --network host -e POSTGRES_PASSWORD=pop -e POSTGRES_USER=pop -e POSTGRES_DB=pop postgres:16-alpine
scripts/reset-localnet.sh             # fresh ledger (io_uring needs --security-opt seccomp=unconfined; the script sets it) + empty indexer DB

# 4. End-to-end: protocol init, POP mint published, two coins by two creators, lazy pages inside a
#    trade, isolation, resumed creation, claims, graduation (TEST thresholds), buyback withdrawal
pnpm --filter @pop/integration test   # writes tests/integration/compute.json

# 5. Indexer API and web
cp services/indexer/.env.example services/indexer/.env
pnpm indexer                          # http://127.0.0.1:8787/api/status
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @pop/web build && pnpm --filter @pop/web start   # http://127.0.0.1:3000
```

To trade or launch from a browser on localnet, point Phantom/Solflare at `http://127.0.0.1:8899` and airdrop with `docker exec pop-localnet solana airdrop 10 <pubkey> -u http://127.0.0.1:8899`. The integration suite expects a fresh validator (`scripts/reset-localnet.sh`).

## Funding and rent (per coin, see `docs/launch-rules.md`)

| Item | Amount |
|---|---|
| Seed SOL (creator-chosen, minimum 1 SOL) | ≥ 1 SOL, locked forever |
| Rent at launch (mint, market, 4 vaults, 4 pages) | ≈ 0.06 SOL, non-refundable |
| Further price pages | ≈ 0.01 SOL each, paid by whoever trades into them |
| Creation fee | none |
| Program deployment | ≈ 4.4 SOL (620 KB, upgradeable loader) |
| Swap transaction | 5,000 lamports + optional priority fee; 213k CU measured for a 32-bin route that also creates one page |

## Commands

| Command | What |
|---|---|
| `pnpm test` / `pnpm sim` / `cargo test -p pop_market` | TypeScript tests, scenarios, Rust tests |
| `scripts/build-program.sh` | SBF build + IDL (Docker) |
| `scripts/localnet.sh start\|stop\|logs`, `scripts/reset-localnet.sh` | local validator |
| `pnpm --filter @pop/integration test` | end-to-end suite |
| `scripts/deploy/devnet.sh keygen\|airdrop\|deploy\|bootstrap\|verify` | devnet (see docs/deployment.md) |
| `pnpm --filter @pop/keeper start -- status\|atomic\|manual-withdraw\|manual-burn` | buyback keeper (see services/keeper/README.md) |

## What is and is not claimed

- No audit. No novelty, immutable custody, live revenue or mainnet readiness is claimed.
- The simulator is an executable specification; the local-validator suite is the evidence for localnet only.
- Graduation ("Pain proven") marks fees paid on both sides; one actor can manufacture it. It is not a safety rating.
- Reserves can go down. There is no floor, no guaranteed exit, no rescue minting.

## Pop Launch (current direction)

The product has pivoted to **Pop Launch**: community-funded coin launches (back a coin, fill the balloon,
launch together). The earlier Proof of Pain market under `apps/web`, `programs/pop_market` and the
indexer is superseded and kept only for reference.

- `apps/poplaunch` — the approved homepage and launch-detail screens on labeled demo fixtures.
- `programs/pop_launch` — escrow, receipts, atomic Raydium pool seeding with LP burn, claims, refunds.
- `docs/pop-launch-mechanism.md` — Stage 2 proof: what is implemented, what the tests show, limits.
- `scripts/raydium-fixture.sh`, `scripts/localnet.sh` — real Raydium CP-Swap program as a localnet fixture.
