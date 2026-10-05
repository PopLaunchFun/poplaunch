# POP — Proof of Pain

A Solana price-bin market where trading fees build nonwithdrawable liquidity at the price bins where trading occurred. POP is also the platform token and the first market demonstrating the mechanism.

**Status: local-validator product complete; devnet deployment not yet performed from this environment (outbound access to Solana RPC endpoints was blocked); mainnet deployment disabled.** See `docs/status-report.md` for the candid per-component table and `docs/economic-findings.md` for what the simulator actually shows.

Core line: *The market remembers.* Every eligible trade contributes fees. Matched fees create nonwithdrawable inventory at fixed price bins.

## Repository

```
apps/web/            Next.js 16 frontend (all routes, wallet trading, scar map, lab, status)
services/indexer/    PostgreSQL indexer + read API (idempotent, commitment-aware)
programs/pop_market/ Rust/Anchor program
packages/math/       Executable integer specification (TypeScript, BigInt) + property tests
packages/sdk/        Typed client: PDAs, account views, exact quotes, tx builders
packages/simulator/  Deterministic simulator + required scenarios
tests/integration/   End-to-end tests against a local validator
tests/vectors/       Golden vectors shared by TypeScript and Rust
scripts/             build-program.sh, localnet.sh, reset-localnet.sh, deploy/
docs/                mechanism, tokenomics, authority model, deployment, findings, status, sim results
```

## Pinned toolchain

| Component | Version | Where |
|---|---|---|
| Node | 22.x | host |
| pnpm | 10.28.0 | host (`packageManager` in package.json) |
| TypeScript | 5.9.3 | workspace |
| Anchor CLI | 1.0.2 | Docker image `solanafoundation/anchor:v1.0.2` |
| anchor-lang / anchor-spl | =1.2.0 | `programs/pop_market/Cargo.toml` |
| Solana CLI / test validator | 3.1.10 (Agave) | same Docker image |
| platform-tools (SBF) | v1.52 | cached in the image |
| Rust (host unit tests) | 1.89+ | host; program built in Docker |
| PostgreSQL | 16 | Docker `postgres:16-alpine` or any 16.x |

Docker is the only host requirement for building and running the program. The host toolchain never needs the Solana CLI.

## Quick start (fresh developer, local validator)

```sh
pnpm install
pnpm --filter @pop/math build && pnpm --filter @pop/sdk build && pnpm --filter @pop/simulator build

# 1. Unit, property and simulator checks (no chain)
pnpm --filter @pop/math test
pnpm --filter @pop/simulator test
pnpm sim                              # writes docs/sim-results/*.json + SUMMARY.md
cargo test -p pop_market              # Rust math + golden replay of the TypeScript vectors

# 2. Build the program (Docker)
scripts/build-program.sh              # -> target/deploy/pop_market.so, IDL copied into packages/sdk

# 3. Local validator with the program preloaded, and a database
scripts/localnet.sh start             # solana-test-validator on 127.0.0.1:8899 (needs --security-opt seccomp=unconfined for io_uring; the script sets it)
docker run -d --name pop-postgres --network host -e POSTGRES_PASSWORD=pop -e POSTGRES_USER=pop -e POSTGRES_DB=pop postgres:16-alpine

# 4. End-to-end: protocol init, genesis market with vesting, pages, activation, swaps, scars,
#    fee claims, graduation (TEST thresholds), second market, buyback, vesting claims
pnpm --filter @pop/integration test   # writes tests/integration/compute.json

# 5. Indexer API and web
cp services/indexer/.env.example services/indexer/.env   # defaults target localnet
pnpm indexer                          # http://127.0.0.1:8787/api/status
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @pop/web build && pnpm --filter @pop/web start   # http://127.0.0.1:3000
```

`scripts/reset-localnet.sh` restarts the validator with an empty ledger and clears the indexer database together (signatures from an old ledger are meaningless after a reset). The integration suite expects a fresh validator.

To trade from a browser on localnet, point Phantom/Solflare at `http://127.0.0.1:8899` and airdrop with `docker exec pop-localnet solana airdrop 10 <pubkey> -u http://127.0.0.1:8899`.

## Funding and rent (realistic estimates)

| Item | Amount | Notes |
|---|---|---|
| Seed quote per market (pilot default) | 20 SOL | locked forever in the quote vault; TEST config uses 2 SOL |
| Market account | ~0.0075 SOL | ~1,020 bytes |
| 4 token vaults | ~0.0082 SOL | 165 bytes each |
| 36 bin pages | ~0.42 SOL | 1,584 bytes each, 16 bins per page, rent-exempt, payer = whoever initializes |
| Vesting (2 schedules, genesis only) | ~0.006 SOL | |
| Program deployment | ~4.4 SOL on devnet/mainnet | 620 KB `.so` (rent for program data); upgradeable loader |
| Swap transaction | 5,000 lamports + priority fee | 400k CU budget requested; measured usage in `docs/status-report.md` |

## Commands reference

| Command | What |
|---|---|
| `pnpm test` | all TypeScript unit/property/simulator tests |
| `pnpm sim` | run every required scenario, write `docs/sim-results` |
| `cargo test -p pop_market` | Rust unit tests and golden replay |
| `scripts/build-program.sh` | SBF build + IDL (Docker) |
| `scripts/localnet.sh start\|stop\|logs` | local validator |
| `scripts/reset-localnet.sh` | fresh ledger + empty indexer DB |
| `pnpm --filter @pop/integration test` | end-to-end suite |
| `scripts/deploy/devnet.sh` | devnet deploy + bootstrap (see docs/deployment.md) |

## What is and is not claimed

- No audit has been performed. No novelty, immutable custody, live revenue or mainnet readiness is claimed.
- The simulator is an executable specification, not evidence the deployed contract works; the local-validator suite is that evidence for localnet only.
- Graduation marks historical fee-funded maturity. It can be manufactured by one actor and must not be marketed as proof of demand.
- Reserves can go down. There is no floor, no guaranteed exit, and no rescue minting.

License: see `LICENSE` (to be chosen by the owner; none committed yet).
