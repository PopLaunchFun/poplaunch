# POP tokenomics (proposed defaults)

These are recommended build defaults, not a claim that anyone has funded a launch. Everything below is published on-chain and on `/pop` once a market exists.

| Parameter | Default |
|---|---|
| Total minted supply | 1,000,000,000 POP |
| Decimals | 6 |
| Token program | SPL Token (no Token-2022, no transfer tax, no hook) |
| Market allocation | 900,000,000 POP, minted into the locked base vault at creation and committed to bins 0..511 |
| Founder allocation | 50,000,000 POP, 12-month cliff then 24-month linear (vesting index 0) |
| Ecosystem allocation | 50,000,000 POP, 36-month linear from activation (vesting index 1) |
| Max genesis allocations | 10% of total supply (`max_genesis_allocation_bps = 1000`), enforced on-chain |
| Mint authority | held by the market PDA only until activation, then set to None (verified in `activate_market`) |
| Freeze authority | never set |
| Vesting custody | on-chain `Vesting` accounts with token vaults owned by the vesting PDA; beneficiary published; no revoke, no clawback |
| Vesting clock | offsets relative to `activated_at_ts` of the POP market; on devnet/localnet these are test timestamps |
| Mandatory POP ownership | none for trading or launching |

Other factory markets: 100% of supply to seed inventory, zero creator allocation (`create_vesting` is rejected for non-genesis markets). Creators buy through the market like everyone else. No arbitrary token imports.

## Value flow

Fees on every swap: 150 bps scar escrow, 25 bps protocol, 25 bps creator, of gross input, both directions.

- POP market: protocol and creator quote fees both go to the disclosed operating treasury (the creator of the genesis market is the protocol authority). No buyback funding from POP's own market (`BuybackSourceExcluded`).
- Other markets: 50% of WSOL protocol fees is earmarked (`buyback_accrued_quote`) and swept permissionlessly into the buyback vault; the other 50% and all base-token protocol fees are claimable by the treasury and reported separately.

Example: a 100 SOL gross buy in another market → 0.25 SOL protocol revenue → 0.125 SOL eligible for buybacks before execution costs.

## Buybacks

- Realized WSOL only; no leverage, no issuance.
- `execute_pop_buyback(quote_spend, min_pop_out, max_price_x64)` signed by the buyback authority (intended: a multisig). Checks: spend ≤ per-execution cap and ≤ escrow balance; minimum interval in slots; cursor price ≤ `max_price_x64` (explicit quote bound). Buys through the normal POP market as an internal swap (scar fee charged into ineligible escrow; no protocol/creator fee) and burns the output atomically. Excluded from matching and graduation counters.
- Automatic execution stays disabled until an independently defensible reference price exists. The UI shows accrued funds and executed burns separately.
- The keeper can never choose a recipient or a different mint: accounts are constrained to the POP market and the buyback PDA's own token accounts.

What this is not: a redeemable revenue claim, an APY, a price guarantee, or governance over scars.

## Market cap and supply display

Market cap = outstanding supply × cursor price, where outstanding = minted − burned. Total minted and burned are shown. External venues may quote different prices.
