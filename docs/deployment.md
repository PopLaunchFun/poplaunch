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
POP_MINT=<pump.fun mint> scripts/deploy/devnet.sh bootstrap   # initialize_protocol (PILOT settings) and publish the POP mint; add --demo for a labeled test coin
scripts/deploy/devnet.sh verify      # upgrade authority, per-market mint/freeze authority = none, vault reconciliation
```

Then run the indexer and web with `SOLANA_NETWORK=devnet`, `RPC_URL=https://api.devnet.solana.com`, `NEXT_PUBLIC_*` accordingly. Launch several coins from `/launch` with devnet wallets to demonstrate isolated scar formation and creator fee claims; `sweep_buyback_funds` is permissionless; `withdraw_buyback_funds` requires the buyback authority and is run through `services/keeper` (manual mode on devnet, where Jupiter does not exist).

Devnet keeps the deployer as upgrade authority. Label it as such on `/status` (it is read live).

## Performance (measured on localnet, `tests/integration/compute.json`)

| Case | Result |
|---|---|
| Worst-case buy: 32 bins inspected, 32 fills, 3 pages, one page created in the same tx | 213,290 CU |
| Worst swap during chop (fills + matching at every visited bin) | 241,167 CU |
| Requested compute budget in `buildSwapTransaction` | 400,000 CU + 30,000 per page created |
| Accounts per swap | 10 fixed + up to 4 pages (3 for a 32-bin route) |
| Serialized swap transaction (budget + 2 ATA idempotent + page init + wrap + sync + swap) | < 1,232 bytes (legacy transaction; fits) |
| Bin page rent | 1,328 bytes ≈ 0.0101 SOL each; 4 at launch, the rest lazily |
| Quote runtime (SDK, 36 pages fetched in one `getMultipleAccounts`) | one RPC round trip + sub-millisecond walk |

The traversal cap of 32 stays as specified; no reserve validation was dropped. Mobile wallet reliability has not been measured (no devnet in this environment).

## Mainnet release gates (all currently unmet)

- [ ] Independent review of custody, AMM math, fee accounting, vesting and buybacks; no unresolved critical/high findings.
- [ ] Simulator and validator evidence (this repository provides localnet evidence; devnet evidence pending).
- [ ] Real seed funding and published per-market mint/vault/creator-fee and protocol treasury addresses; factory allocation rules match the launch review screen.
- [ ] Authority state disclosed accurately; "immutable" only after `solana program set-upgrade-authority --final`.
- [ ] No automatic buybacks without an independently defensible price guard; manual policy labeled.
- [ ] Verified deployed program matches reviewed source; indexed data reconciles; bootstrap/boundary trade behavior documented (`docs/economic-findings.md` §3, §7).
- [ ] Mainnet deployment and token activation separately authorized by the owner; no tool-generated test key reused as treasury custody.

## Production config proposal (for the owner to decide, not applied)

Based on `docs/economic-findings.md` §9: single-swap capacity scales with the seed (0.075 SOL at the 1 SOL minimum, 1.5 SOL at 20 SOL). Either accept thin early trading on small seeds or ship a new config version with a denser base schedule near the cursor. Reconsider the 100 SOL maturity target against the ~6,700 SOL of matched two-sided volume it implies at 150 bps. Both are experimental calibration choices.
