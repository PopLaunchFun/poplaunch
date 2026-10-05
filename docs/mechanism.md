# Mechanism specification (v1)

This is the normative description. The executable form is `packages/math` (TypeScript) and `programs/pop_market/src/{math,swap_core}.rs` (Rust); the two are checked against each other by `tests/vectors/golden.json` (`cargo test -p pop_market --test golden`).

## 1. Units and representation

- Amounts are u64 token atomic units. Quote is canonical wrapped SOL (9 decimals). Base tokens created by the factory have 6 decimals.
- Prices are **quote atomic units per base atomic unit** in Q64.64 fixed point stored in u128: `price_x64 = floor(P × 2^64)`.
- All arithmetic is checked. Overflow aborts the instruction.

## 2. Price table

- `p0_x64 = floor(seed_quote × 2^64 / seed_base)` with the creator-chosen `seed_quote ≥ min_seed_quote` (1 SOL); markets with `p0_x64 < 2^32` are refused (precision floor).
- `P_i = P0 × 1.01^i` for `i ∈ [bin_min, bin_max]` (pilot: `[-64, 511]`). Computed by binary exponentiation with the constants `UP_X64[k] = round(1.01^(2^k) × 2^64)`, `k = 0..8`, and `DOWN_X64[k] = round((100/101)^(2^k) × 2^64)`, `k = 0..6`, flooring after each multiplication.
- Error bound: each constant has relative error < 4e-20; at most 9 multiplications each lose < 1 ulp = 2^-64 absolute, i.e. ≤ 2^-32 relative given the precision floor. Total relative error < 2.1e-9. Verified by test for every bin of the pilot table.
- Range validation at market creation: price at `bin_min` must be nonzero and price at `bin_max` must not overflow u128. Because all UP constants are ≥ 1 and DOWN constants ≤ 1, checking the extremes bounds every intermediate product.

## 3. Layout

- Pages hold 16 bins: `page_index = floor_div(bin, 16)` with true floor division (bin −1 is on page −1). The range uses 36 pages (−4..31). A launch creates pages −1..2; any other page is created by whoever first needs it (`initialize_bin_page` is permissionless, the payer funds the rent). Client quotes treat a missing page as its seed schedule and the swap transaction creates it first.
- Bands hold 10 bins: `band = floor_div(bin, 10)`; 59 bands for the pilot range; band state lives in the Market account (64 slots).
- Seed schedule: quote uniform over bins `[bin_min, −1]`, base uniform over `[0, bin_max]`; division remainders go one unit each to the lowest-id bins of that side. Pages are materialized lazily and exactly once, debiting the market's unmaterialized counters; no funds move at page creation.

## 4. Fees

For gross input `g` (quote for buys, base for sells):

```
scar     = floor(g × 150 / 10000)
protocol = floor(g × 25 / 10000)
creator  = floor(g × 25 / 10000)
tradable = g − scar − protocol − creator
```

Inputs below `min_quote_in` / `min_base_in` are rejected. On every market 50% (`buyback_share_bps`) of the quote protocol fee is earmarked for the POP buyback escrow; base-token protocol fees are never earmarked.

## 5. Swap walker (`swap_exact_in`)

Inputs: direction, `gross_input`, `min_output`, `deadline_slot`, `expected_config_version`, bin pages as remaining accounts.

1. Checks: market active or graduated; `slot ≤ deadline_slot`; `config_version` matches; pages belong to the market and have the expected PDA; vaults match the market; user token accounts match mints and owner.
2. `remaining = tradable`, `bin = cursor`, `inspected = 0`.
3. Loop while `remaining > 0`:
   - if `bin` outside range → `BuyInventoryExhausted` / `SellInventoryExhausted`;
   - if `inspected == max_bins_per_swap` (32) → `TraversalLimit`; `inspected += 1`;
   - page missing → `PageNotProvided` (not initialized → account does not exist);
   - `avail = seed + scar` of the output asset; if 0, step to the next bin;
   - buy: `need = ceil(avail × P)`; if `remaining ≥ need` take all (`out = avail`, `in = need`) else `out = floor(remaining / P)`, `in = remaining`;
   - sell: `need = ceil(avail / P)`; symmetric with `out = floor(remaining × P)`;
   - split `out` and `in` between classes: `scar_part = floor(x × scar_avail / avail)`, `seed_part = x − scar_part`; if `seed_avail = 0` the scar class takes all;
   - record the fill, `remaining −= in`, `last_fill = bin`, step.
4. No fill → `NoExecutableFill`; `output < min_output` → `OutputBelowMinimum`.
5. Scar fee distribution: largest remainder over visited bins weighted by executed `in`, ties to the lower bin id; the shares sum exactly to `scar`.
6. Commit: apply fills, add shares to pending escrow, credit protocol/creator claimables (and the buyback earmark), set `cursor = last_fill`, increment counters.
7. Match at each visited bin (section 6). Scars formed here are tradable only by later transactions because the fills were computed first.
8. Token transfers: `tradable + scar` to the locked vault, `protocol + creator` to the fee vault, `output` from the locked vault to the user. Everything is atomic.

Rounding surplus: in the final bin `in − ceil(out × P) < P/2^64 + 1` quote units for buys (symmetric for sells). It stays in that bin's inventory (assigned to the seed class by the residual rule, or scar if seed is empty). Splitting a trade is therefore bounded, not invariant; see `docs/economic-findings.md` §4.

## 6. Matching

At bin `i` with eligible pending base `B` and quote `Q`:

```
b = min(B, floor(Q × 2^64 / P_i))
q = ceil(b × P_i / 2^64)      // recomputed from b, never rounded independently
if b = 0 or q = 0: nothing
assert q ≤ Q                  // holds because floor(Q/P)·P ≤ Q and Q is an integer
pending −= (b, q); scar += (b, q); paired_quote_lifetime(bin, band, market) += q
emit ScarFormed(bin, b, q)
```

Only recorded swap fees enter escrow. There is no timeout, refund or sweep. `match_bins(page)` is permissionless and idempotent.

## 7. Graduation

```
hardened(band) ⇔ band.paired_quote_lifetime ≥ band_quote_target      (1 SOL)
graduated ⇔ market.paired_quote_lifetime ≥ maturity_quote_target (100 SOL) ∧ hardened_bands ≥ 10
```

Evaluated after every match and by the permissionless `evaluate_graduation`. One-way; emits `Graduated` once; changes nothing else.

## 8. Invariants (tested)

- Base and quote conserve independently: vault balance = Σ bins (seed + scar + pending) + unmaterialized seed; fee vault = Σ claimables (+ buyback earmark until swept).
- No negative inventory; fee totals equal charged inputs; paired quote never exceeds eligible escrow; prices fixed per bin; no mint after activation; claims cannot touch locked vaults; SDK and Rust produce identical integers for identical histories.

## 9. Known limits

- 32 inspected bins per swap (empty bins count). Large orders must be split into separately signed transactions.
- Exhaustion at either range end reverts; there is no floor.
- External venues bypass these fees; only program swaps build scars.
- Upgrade authority remains a custody power until revoked (`docs/authority-model.md`).
