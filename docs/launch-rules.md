# Launch rules (every coin created through the factory)

All numbers are factory defaults from the v2 brief plus owner decisions, labeled experimental calibration. They are enforced on-chain by `create_market` / `activate_market` and shown on the launch review screen.

| Rule | Value |
|---|---|
| Supply per coin | 1,000,000,000 tokens, 6 decimals, standard SPL Token (no transfer tax, no hook) |
| Initial allocation | 100% minted into the locked base vault as seed inventory across bins 0..511 |
| Creator allocation | none; the creator buys through the market like anyone else |
| Mint authority | revoked inside `create_market` right after the seed mint; verified again at activation |
| Freeze authority | never set |
| Seed SOL | creator-chosen, minimum **1 SOL** (`min_seed_quote`, owner decision); locked forever in the quote vault across bins −64..−1 |
| P0 | seed SOL ÷ supply (initialization convention, not a valuation) |
| Trading fee | 2.00% of gross input: 1.50% scar escrow, 0.25% protocol, 0.25% creator |
| Creator income | the creator fee, claimable at any time to the creator's own token accounts only |
| Buyback earmark | 50% of the protocol's SOL fee from every coin accrues for the POP buyback escrow (see `docs/authority-model.md`) |
| Creation fee | none |
| Platform token required | no |
| Graduation | 100 SOL lifetime paired quote and 10 hardened bands (1 SOL each); irreversible status flag, no payout |

## Costs (localnet measurements; mainnet rent is identical per byte)

| Item | Bytes | Rent |
|---|---|---|
| Mint | 82 | ≈ 0.0015 SOL |
| Market account | 1,224 | ≈ 0.0094 SOL |
| 4 token vaults | 165 each | ≈ 0.0082 SOL |
| 4 launch pages (−1, 0, 1, 2) | 1,328 each | ≈ 0.040 SOL |
| **Total rent at launch** | | **≈ 0.06 SOL** + 3 network fees |

Plus the seed (≥ 1 SOL). The remaining 32 price pages are created lazily: a trade whose route crosses a page that does not exist yet creates it in the same transaction and the trader pays ≈ 0.01 SOL rent for it (shown as a line in the trade ticket). Creators can also pre-create pages from My launches.

## Single-swap capacity by seed (fresh market, 32-bin cap; `docs/sim-results/seed-sweep-*.json`)

| Seed | Token value per bin at P0 | Largest single buy | Largest single sell | Effect of a 0.01 SOL buy |
|---|---|---|---|---|
| 1 SOL | 0.00195 SOL | 0.075 SOL | 0.50 SOL worth | 5 bins, +4.1% |
| 5 SOL | 0.0098 SOL | 0.37 SOL | 2.5 SOL worth | 2 bins, +1.0% |
| 20 SOL | 0.039 SOL | 1.49 SOL | 10 SOL worth | 1 bin, 0% |

Larger orders must be split into separately signed transactions; the UI says so and the launch review shows the limit for the chosen seed.

## Launch flow and resume

1. `create_market` (1 signature): mint + market + 4 vaults, seed mint, mint authority revoked. Name, ticker and URI are on-chain and immutable.
2. `initialize_bin_page` ×4 (1 signature).
3. wrap seed SOL + `activate_market` (1 signature): funds the quote vault, checks supply == seed and both authorities are `None`, flips the status to active.
4. Signed message (no transaction): image URL, description and links are stored off-chain by the indexer under the creator's ed25519 signature (`services/indexer/src/metadata.ts`); editable later from My launches; https URLs only, description ≤ 500 chars; no server-side fetching.

Every step checks on-chain state first. A retry after a wallet rejection, an expired blockhash or a closed tab resumes from the confirmed step (the pending mint is kept in the browser until creation is confirmed; afterwards the market is rediscovered on-chain by creator). Re-running `create_market` for the same mint fails because the mint account already exists; re-initializing a page fails because the page account already exists; a second `activate_market` fails with `MarketAlreadyActive`. A market appears in the public directory only after activation.

## What the market never does

No scar/seed withdrawal, no relocation, no fee changes after activation, no rescue minting, no floor. Reserves move with trading. Graduation can be manufactured by one actor paying fees on both sides (`docs/economic-findings.md`).
