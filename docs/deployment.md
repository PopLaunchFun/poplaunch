# Deployment

## Environments

| Environment | Program | Status |
|---|---|---|
| localnet (Docker test validator) | `6pTC8K5PtUKGpQdHZoEsu26qLEehFDh2m1BLKRndNggx` | working; full suite passes |
| devnet | same ID (keypair in `scripts/deploy/keys`, gitignored) | **not deployed from this environment**: outbound connections to `api.devnet.solana.com` (and other Solana RPC hosts) were blocked by the build sandbox's egress policy. The scripts are written and exercise the same code paths as the localnet suite; run them from a machine with devnet access. |
| mainnet-beta | — | disabled; release gates below |

## Build

```sh
scripts/build-program.sh       # Docker: anchor build + IDL + types -> target/, packages/sdk/src/idl
sha256sum target/deploy/pop_market.so
```

The build runs inside `solanafoundation/anchor:v1.0.2` (Anchor CLI 1.0.2, Solana 3.1.10, platform-tools v1.52, Rust 1.95). `Cargo.lock` is committed. For a verifiable build, use the same image and compare the `.so` hash with `solana program dump`.

## Devnet procedure

```sh
scripts/deploy/devnet.sh keygen      # deployer + treasury keys in scripts/deploy/keys (never commit)
scripts/deploy/devnet.sh airdrop     # repeat until the deployer holds ~30 SOL (program rent ~4.4 SOL, seed 20 SOL, pages ~0.5 SOL)
scripts/deploy/devnet.sh deploy      # anchor deploy; prints the program account and upgrade authority
scripts/deploy/devnet.sh bootstrap   # initialize_protocol (PILOT settings), create POP market, founder/ecosystem vesting, 36 pages, wrap+activate
scripts/deploy/devnet.sh verify      # upgrade authority, mint/freeze authority = none, vault reconciliation
```

Then run the indexer and web with `SOLANA_NETWORK=devnet`, `RPC_URL=https://api.devnet.solana.com`, `NEXT_PUBLIC_*` accordingly. Launch a second market from `/launch` with a devnet wallet to demonstrate non-POP fee eligibility and buyback sweeping (`sweep_buyback_funds` is permissionless; `execute_pop_buyback` requires the buyback authority).

Devnet keeps the deployer as upgrade authority. Label it as such on `/status` (it is read live).

## Performance (measured on localnet, `tests/integration/compute.json`)

| Case | Result |
|---|---|
| Worst-case buy: 32 bins inspected, 32 fills, 3 pages | 186,703 CU |
| Worst swap during chop (fills + matching at every visited bin) | 225,728 CU |
| Requested compute budget in `buildSwapTransaction` | 400,000 CU |
| Accounts per swap | 10 fixed + up to 4 pages (3 for a 32-bin route) |
| Serialized swap transaction (budget + 2 ATA idempotent + wrap + sync + swap) | < 1,232 bytes (legacy transaction; fits) |
| Bin page rent | 1,584 bytes ≈ 0.0119 SOL each, 36 pages ≈ 0.43 SOL |
| Quote runtime (SDK, 36 pages fetched in one `getMultipleAccounts`) | one RPC round trip + sub-millisecond walk |

The traversal cap of 32 stays as specified; no reserve validation was dropped. Mobile wallet reliability has not been measured (no devnet in this environment).

## Mainnet release gates (all currently unmet)

- [ ] Independent review of custody, AMM math, fee accounting, vesting and buybacks; no unresolved critical/high findings.
- [ ] Simulator and validator evidence (this repository provides localnet evidence; devnet evidence pending).
- [ ] Real funding and published POP allocation/vesting/treasury addresses; no undisclosed founder purchases or allocations.
- [ ] Authority state disclosed accurately; "immutable" only after `solana program set-upgrade-authority --final`.
- [ ] No automatic buybacks without an independently defensible price guard; manual policy labeled.
- [ ] Verified deployed program matches reviewed source; indexed data reconciles; bootstrap/boundary trade behavior documented (`docs/economic-findings.md` §3, §7).
- [ ] Mainnet deployment and token activation separately authorized by the owner; no tool-generated test key reused as treasury custody.

## Production config proposal (for the owner to decide, not applied)

Based on `docs/economic-findings.md`: either accept that a 1 SOL buy moves the price ~25% at launch and that single buys are capped near 1.5 SOL, or ship a new config version with a denser base schedule near the cursor (for example 60% of seed base in bins 0..63) or a smaller `bin_max`. Reconsider the 100 SOL maturity target against the ~6,700 SOL of matched two-sided volume it implies at 150 bps. Both are experimental calibration choices.
