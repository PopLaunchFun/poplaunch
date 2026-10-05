# POP — Proof of Pain
## Complete Fable implementation brief · v1 · October 4, 2026

## 0. Instruction to Fable

Build POP: a Solana market and eventual token launch platform where trading fees build nonwithdrawable liquidity at the price locations where trading occurred. POP is also the platform token, ticker **POP**, and the first market demonstrating the mechanism.

Read this entire document before implementation. Implement the mathematics, simulator, Solana program, SDK, indexer, wallet transactions, and polished frontend. This is a functional protocol project, not a landing page with simulated trading disguised as live trading. First ship a complete local-validator and devnet product. Keep real-money mainnet deployment disabled until the release gates in this document pass. Do not substitute a Pump.fun launch for the custom mechanism.

Work autonomously through the phases below. If your environment cannot compile or deploy Solana programs, still write the program, tests, client, and deployment instructions; clearly identify the unexecuted checks. A working simulator is useful but is not evidence that the deployed contract works. Do not claim audit, novelty, immutable custody, live revenue, or mainnet readiness without evidence.

Deliver a repository, reproducible commands, working preview, devnet transaction evidence if deployment is possible, and an implementation status report. Follow the concrete defaults here; label them experimental calibration choices rather than validated economics.

## 1. Product and scope

**Name:** POP / Proof of Pain. **Chain:** Solana. **First pair:** POP/WSOL. **Core line:** “The market remembers.” **Supporting line:** “Trading builds liquidity where the battle happened.”

The defining primitive is a price-bin market with two classes of inventory: launch seed inventory and fee-funded scar inventory. Fees collected from buyers arrive in quote tokens; fees collected from sellers arrive in base tokens. At each price bin, matched base and quote fee inventories activate as scar liquidity. The bin location never moves; its inventory changes when traders buy and sell against it.

V1 has one functioning POP market and the reusable market factory. Permissionless public launches follow only after the POP pilot passes testing. Include the launch UI and devnet factory flow now. All launched coins use the same rules. POP is a separate platform asset, not the mandatory quote currency for other markets.

### Critical corrections to the initial concept

1. Price impact is a change in execution price, not money magically available to deposit. Explicit fees supply the scars.
2. “Permanent” means liquidity cannot be withdrawn or relocated. Assets can leave a bin through ordinary swaps in exchange for the opposite asset. Quote reserves and dollar value do not monotonically increase.
3. Round trips can form scars. They demonstrate paid fee accumulation, not organic demand, independent holders, or survival. Do not market graduation as wash-trade proof.
4. Match only collected buy and sell fees in v1. Remove the earlier separate 20% token Scar Reserve: subsidizing the token side would muddy the two-sided rule and graduation accounting.
5. Use a fixed scar fee in v1. The prior impact integral was conceptual, not a dimensionally complete fee equation. Dynamic impact fees are a later research track.
6. Graduation is a status transition, not migration. Moving to a conventional pool would erase the promised stationary scar structure.
7. POP buybacks come from other markets’ quote-denominated protocol revenue. Exclude POP’s own market from buybacks to avoid a self-referential loop.

Do not use “every dump makes the coin stronger,” “liquidity cannot go backwards,” “guaranteed support,” or “you must pay $50k to fake $50k of scars” as factual claims. Use: “Every eligible trade contributes fees. Matched fees create nonwithdrawable inventory at fixed price bins.”

## 2. POP token and value flow

### Proposed token defaults

| Parameter | Default |
|---|---|
| Total minted supply | 1,000,000,000 POP |
| Decimals | 6 |
| Token program | Standard SPL Token; no transfer tax or transfer hook |
| Market allocation | 900,000,000 POP, permanently committed as seed inventory |
| Founder allocation | 50,000,000 POP; 12-month cliff, 24-month linear vesting thereafter |
| Ecosystem allocation | 50,000,000 POP; 36-month linear vesting from activation |
| Mint authority | Revoked after exact allocation |
| Freeze authority | Absent/revoked |
| Founder and ecosystem custody | On-chain vesting accounts with published beneficiaries |
| Mandatory POP ownership | None for trading or launching |

These are recommended build defaults, not a claim that the owner has funded a launch. Show all allocations, unlocks, addresses, and supply definitions publicly. No owner mint override, hidden allocation, airdrop promises, or staking yield. Vesting starts at actual mainnet activation; devnet uses independently identifiable test timestamps.

Other market tokens default to 100% supply committed to seed inventory, zero creator allocation. Creators may buy through the ordinary market. POP’s published founder/ecosystem allocations are an explicit exception. No arbitrary token imports in v1; the factory creates standard fixed-supply mints itself.

### Fees: gross input asset on both sides

| Destination | Basis points of gross input |
|---|---:|
| Scar escrow for traversed bins | 150 bps |
| Protocol revenue | 25 bps |
| Creator revenue | 25 bps |
| Total | 200 bps / 2.00% |

Buy input is WSOL; sell input is the market’s base token. Creator and protocol claims are separate balances, never claims on scar or seed custody. POP market creator fees go to the disclosed operating treasury.

For non-POP markets only, **50% of collected WSOL protocol fees** is earmarked for POP buyback-and-burn; the other 50% funds operations. Do not count base-token protocol fees as buyback funds until actually converted into WSOL; v1 leaves them claimable by the operating treasury and reports them separately. Thus a 100 SOL gross buy in another market creates 0.25 SOL protocol revenue, of which 0.125 SOL is eligible for buybacks, before execution costs. There is no fee on external venues unless those venues invoke this program.

Implement buybacks as a segregated WSOL escrow and bounded keeper instruction. Spend only realized funds, no leverage or token issuance. Buy POP through the normal market, then SPL-burn purchased POP atomically. Exclude buyback executions from scar matching and graduation counters; charge the scar fee into ordinary scar escrow but flag it ineligible for maturity scoring, and do not charge protocol/creator fees to this internal instruction. Track eligible and ineligible escrow separately so accounting cannot mix them. Slippage protection, independent reference-price guard, spend cap, and time interval are mandatory. If no credible independent POP price reference exists, automatic buybacks stay disabled; show accrued funds, not fictional burns. Implement manual multisig-approved execution with explicit quote bounds as the initial alternative, with public transactions. Never permit the keeper to choose an arbitrary recipient or unrelated mint.

This supports fee-funded token demand if other markets get activity. It does not guarantee price appreciation or provide holders a redeemable revenue claim. No governance power to withdraw scars. Buyback shares are immutable for deployed markets or changed only for newly created markets under a disclosed config version.

## 3. Market initialization and seed inventory

Use a custom discrete constant-price-bin AMM for v1. Do not assume an existing Meteora pool can enforce mandatory custom fees: direct swaps can bypass a wrapper. Existing bin-market implementations are design references, not an integration dependency.

### Pilot defaults

| Parameter | Default |
|---|---|
| Price spacing | 100 bps: adjacent executable bins differ by 1% |
| Logical bin range | -64 through +511 inclusive, bounded |
| Initial cursor | Bin 0 |
| Seed WSOL | 20 SOL, externally funded and locked |
| Seed quote placement | Uniform across bins -64 through -1 |
| Seed base placement | Uniform across bins 0 through 511 |
| POP seed base | 900M POP |
| Reference price P0 | 20 SOL / 900M POP, in human units |
| Price at bin i | P_i = P0 × 1.01^i |
| Max bins inspected per swap | 32, including empty bins |
| Scar maturity target | 100 SOL of historical paired quote contribution |
| Territory target | 10 distinct 10-bin bands with ≥1 SOL paired quote contribution each |

P0 is an initialization convention, not a valuation appraisal. It does not mean every token can be redeemed at that price or that seed reserves collateralize total supply. WSOL funding and rent are real deployment requirements; do not synthesize reserves. Other markets use total seed token supply in the denominator, with the same default seed quote amount.

Compute price tables deterministically using checked fixed-point arithmetic; no float or log on-chain. Quantize P0 once, derive bounded prices with a documented error bound, and refuse markets whose extremes cannot represent a nonzero price or whose arithmetic overflows. Prices in contract math are quote atomic units per base atomic unit, including decimal scaling. A 10-bin territory is grouped by floor_div(i,10), with true floor division for negatives.

Initialize bin pages lazily with a fixed seed schedule. Store market-level funded seed totals and unmaterialized allocation counters; creating a page assigns inventory exactly once, without transferring funds from a creator. Bins are accounting records against market vaults, not each a separate SPL token account. A permissionless keeper can create required pages at its own rent cost; the UI pre-creates pages if needed. Prefer 16 bins per page, benchmark actual size and compute usage. Market activation follows verified funding, allocation, price bounds, and mint authority revocation; all fail atomically on mismatch.

When all sell-side quote inventory is exhausted, reject further sells lacking an executable fill. When all buy-side token inventory is exhausted, reject further buys. Empty-price regions can create gaps. The system provides no guaranteed exit or floor. Do not create virtual redeemable SOL or mint new inventory to rescue a market.

## 4. Exact swap behavior

### Supported entrypoint

`swap_exact_in(direction, gross_input, min_output, deadline_slot, expected_config_version, bin_page_accounts)`

Only exact input and fill-or-kill in v1. A trade must fill all usable input within traversal limits or revert. UI can offer separate smaller transactions, with new quotes and explicit user signatures. No partial-fill dust donations masquerading as swaps.

### Algorithm

1. Verify market active, signer, approved mint/program, vault addresses and owners, page order and PDAs, slot deadline, immutable config version, and input limits.
2. Calculate full-swap fees from gross input using checked integers: scar=floor(input×150/10000), protocol=floor(input×25/10000), creator=floor(input×25/10000). Tradable input is gross minus these fees. Reject dust below configured minimum atomic input. Network fee and rent are separate.
3. Walk bins deterministically. Buyers exhaust token inventory then advance upward. Sellers exhaust quote inventory then advance downward. At the cursor, either side can consume available opposite-asset inventory. Define exhausted/empty cursor behavior identically in SDK and program; stop with an error at range limits. Count all inspected bins toward the 32-bin cap.
4. Within each bin execute at P_i. A buy exchanges quote for base, a sell exchanges base for quote. Use floor output and ceil required input, with a documented maximum rounding surplus that remains in that bin. Require remaining dust to be below this bound; larger unconsumed amounts cause failure.
5. Both seed and activated scar inventories participate at that bin’s identical price. Allocate consumption and incoming counterasset proportionally to available output inventory, conserving each class. Use deterministic residual assignment to seed; if seed is zero, scar receives the residual. No class may become negative.
6. After the entire successful route is calculated, distribute scar input fees to visited bins proportional to each bin’s executed net input. Use largest-remainder allocation with bin-id tie-break so the sum equals the full scar fee. Buys add quote escrow; sells add base escrow. Do not count empty bins as volume or fee destinations.
7. Match opposing eligible escrow at visited bins as specified below. New scars are unavailable during the swap that created them; they become tradable for later transactions. This prevents a trade from consuming its own fee deposit in the same instruction.
8. Require aggregate output ≥ min_output; transfer assets, update all accounts, counters, fees, cursor, and events atomically. Any error reverts the entire swap.

Fee splitting trades may cause bounded integer differences and a different liquidity path after earlier swaps activate scars. **Do not claim exact splitting invariance.** Fixed percentage fees remove the earlier obvious trade-size-dependent discount. Publish simulator results for one large swap versus splits, including rounding and path-state differences.

### Matching at a fixed bin

Let B be eligible pending base escrow, Q eligible pending quote escrow, and P_i the atomic-unit price. Choose the largest integer b≤B for which q=ceil(b×P_i)≤Q. If b or q is zero, do nothing. Use audited multiply/divide helpers; recompute q rather than independently rounding both sides. Subtract b and q from pending inventories; add them to activated scar base and quote inventory. Add q to lifetime paired quote contributions for the bin and band. Emit `ScarFormed(bin_id,b,q)`.

Example in human units: P=0.000001 SOL/token, Q=0.46 SOL, B=315,000 tokens. Match 315,000 tokens with 0.315 SOL. The remaining 0.145 SOL waits. Do not report 0.46 SOL as activated paired quote.

Scar fees remain pending indefinitely if opposing flow never appears. No timeout refund or admin sweep. Do not match seed inventories against fees or count founder/ecosystem holdings as scar capital. Ineligible buyback escrow may be matched with separate ineligible opposing inventory only; it cannot create eligible graduation contributions. Simplest v1 implementation leaves these ineligible fees pending and discloses that behavior.

## 5. Graduation and honest metrics

Graduation marks **historical fee-funded maturity**, not a $50k vault balance or proof of market demand. Avoid an on-chain USD oracle in v1.

`paired_quote_lifetime = sum(eligible quote amounts activated by matching)`

`hardened_bands = count(band.paired_quote_lifetime >= 1 SOL)`

`progress = min(1, paired_quote_lifetime/100 SOL, hardened_bands/10)`

Graduation requires both thresholds. The transition is irreversible, emits an event, unlocks directory highlighting and an embeddable graduation badge, and leaves reserves, prices, fee rules, and trading unchanged. No external pool migration in v1. Graduation has no creator payout or POP reward, removing an obvious manufactured-volume reward.

Maintain three separate metrics:

| Metric | Meaning |
|---|---|
| Historical paired quote | Cumulative qualifying fees activated; monotonic milestone counter |
| Current scar inventory | Actual base and WSOL balances in each bin; changes with swaps |
| Executable depth | Quote simulation for buying/selling within ±5%, ±10%, ±20% of reference price |

Display pending escrow separately. Current estimated scar value may use live SOL/USD and a stated reference price, but is an indicative mark, not guaranteed liquidation proceeds. Show real current quote inventory prominently. Market cap uses outstanding supply × reference price; disclose total minted and burn-adjusted outstanding supply. External venues may have different prices. Prefer a 5-minute volume-weighted executed price in the UI alongside last execution price, with stale warnings; neither is an independent manipulation-resistant oracle.

Test whether old fee-funded bins currently provide sell depth or contain only tokens. Never equate historical scar contributions to present exit liquidity. “Hardened” means historical pairing threshold reached, not an indestructible floor.

## 6. Solana program and authority design

Rust + Anchor; exact compatible toolchain versions pinned in the repository after compilation. TypeScript SDK mirrors contract arithmetic using BigInt. Support only standard SPL base tokens created by this factory and canonical WSOL; reject extensions, delegates, freezes, arbitrary programs, and substituted vaults.

### Accounts

- ProtocolConfig: version, factory settings for new markets, POP mint, published fee recipients and launch enable flag.
- Market: base/quote mints, cursor, boundaries, price constants, immutable fee/threshold settings, allocated/unallocated seed balances, maturity counters, status, immutable creator address.
- BinPage: fixed bins with seed base/quote, scar base/quote, eligible pending base/quote, ineligible pending escrow, cumulative buy/sell volume, paired quote counters, last execution slot. Keep instrumentation bounded; do not store unbounded trade history on-chain.
- BandState: per-band cumulative paired quote and threshold-crossed bit; update the global hardened count once.
- Market vaults: segregated seed/scar trading and pending-fee custody from withdrawable protocol/creator accounts; exact physical layout can combine locked assets only with rigorous reconciliation.
- FeeClaim: protocol or creator claimable balances by mint; no recipient override at claim time.
- BuybackVault: realized quote funds, last execution slot, capped policy, excluded source markets.
- Vesting: immutable schedule, beneficiary, claimed amount and custody. No revoke/clawback of POP allocations.

### Instructions

`initialize_protocol`, `create_market`, `initialize_bin_page`, `activate_market`, `swap_exact_in`, `match_bins` (permissionless, bounded), `claim_creator_fees`, `claim_protocol_fees`, `execute_pop_buyback`, `claim_vested_pop`, and factory-only `disable_new_markets`.

Market graduation is evaluated automatically when eligible matching updates thresholds. Any standalone `evaluate_graduation` must be permissionless and derive results from stored counters, not caller assertions.

No instructions for scar withdrawal, seed withdrawal, relocation, arbitrary vault CPI, post-activation fee changes, reserve recovery, or market-level administrator confiscation. Fee claims cannot touch locked balances. Pause controls may disable new markets; avoid a permanent admin trading veto on mature markets. Document the incident response limitations of immutable code.

Upgrade authority is a material custody power: an upgradeable program could add withdrawals. Devnet may be upgradeable. Mainnet remains labeled “upgradeable / multisig-controlled” until independent review and explicit authority revocation. Only then describe custody as immutable. Do not imply a PDA alone makes funds permanently locked. Token mint-authority revocation is separate from program upgrade-authority revocation.

## 7. Frontend design

Create a distinctive market interface, not a dashboard of generic cards. Ink-black background, off-white type, electric coral/red for fee-funded scars, restrained lime for confirmed success, subtle violet for pending inventory. Bold POP wordmark; use a clean geometric sans and monospace numerals. No fake hacker terminals, excessive gradients, generic AI imagery, skull imagery, or confetti. Financial controls must remain legible on a phone.

Desktop: left navigation; central price chart and scar map; right trade ticket. Mobile: top price/maturity summary, chart/map toggle, sticky trade button opening a bottom sheet. Clearly separate market direction colors from scar state colors. Respect reduced-motion and accessibility contrast.

### Routes

**/** — Landing and market entry. Hero “The market remembers.” One sentence explanation, “Trade POP” and “Explore markets.” Three-step explanation: trade pays fees; opposing fees pair; fixed bins gain nonwithdrawable inventory. Live verified totals only; otherwise show unavailable, never invented popularity. Link token allocation and mechanism docs.

**/markets** — POP pinned as genesis market; directory with price, current quote depth, historical paired quote, graduation progress, volume and network labels. Filters: all, forming, graduated. No default “safest” ranking based on scar metrics. Sort labels state their actual metric.

**/market/[mint]** — Name, verified mint and explorer links, last/reference prices, current quote reserves, graduation badge. Main chart includes optional stationary scar overlay. Adjacent scar map: logarithmic price ladder, current cursor, active base/quote composition, pending buy/sell fees, historical matched amounts. Click a band for breakdown. Tooltips explain historic counters versus current inventory.

Trade ticket: buy/sell, SOL amount or base amount, wallet balance, quoted output, explicit 2% fee breakdown, price impact, minimum received, slippage control, network fee and rent estimate, deadline and stale state. Slippage tolerance excludes known protocol fees; quote after fees and explain that convention. Failure states: insufficient depth, traversal limit, disconnected wallet, wrong network, simulation failure, rejection, expired blockhash. Never silently raise slippage. Include transaction simulation before wallet approval.

Recent trades show real signatures, direction, executed amount, fees, time and program source. Founder vesting and large ownership concentration appear in a compact transparent panel. Do not fabricate unique trader counts without methodology.

**/launch** — Name, symbol, description, image, published seed funding requirement and fees. Explain zero creator allocation and fee address. Preview exact seed schedule and token supply. Require wallet signatures; no server custody. Devnet fully functional; mainnet launches disabled until release gates pass. Validate metadata, sanitize rich text, restrict uploaded content size/types, and disclose metadata mutability.

**/pop** — Token page: supply allocation table, mint, vesting addresses and schedule, treasury addresses, buyback-eligible realized funds, actually burned supply, execution history and public policy. Distinguish funded buyback escrow from executed purchases. No APY, price forecasts or guaranteed revenue.

**/mechanism** — Short plain-language guide and equations with definitions, examples, fee policy, graduation, limits, authority status, external-venue bypass, and exhaustion risk.

**/lab** — Clearly labeled simulator, no wallet transfers. Presets: straight pump, dump, chop, round-trip actor, split trades, thin-bin gap, and exhausted bid inventory. Charts: price, historical contributions, current quote inventory and scar composition. Seed and scar money tracked separately. Users can inspect every simulated swap and download a run. Real dashboards never use lab data as a fallback.

**/status** — Network, program IDs, git commit, verified releases, upgrade authorities, RPC/indexer freshness, and missing launch prerequisites.

## 8. Backend, SDK and transaction flow

Recommended stack: Next.js/TypeScript/Tailwind; wallet-standard-compatible Solana connector (Phantom and Solflare); Rust/Anchor program; PostgreSQL indexer; background worker. Use existing lightweight charting for candles and custom SVG/canvas for the scar map. Avoid adding Redis or complex orchestration until needed. Keep package versions pinned and verify current compatibility instead of assuming familiar versions work.

Repository structure:

```text
apps/web/
services/indexer/
programs/pop_market/
packages/math/
packages/sdk/
packages/simulator/
tests/integration/
scripts/deploy/
docs/
```

Chain is authority for custody, swaps and graduation. The database caches only. Wallet signs swaps, launch and claims. Backend never asks for or stores seed phrases/private wallet keys. Local devnet deployment keys are separate test credentials and excluded from git.

Endpoints: markets listing/detail, bounded bin snapshots, indexed trades/candles, token allocations, buyback history, status. Quote endpoint optional: return block/slot, market state fingerprint, fee breakdown and instruction params. Local SDK quotes use identical math; on-chain min_output is final protection. Frontend can read vaults and quote from RPC if indexing is stale; do not synthesize a successful fill from cached state.

Indexer records events idempotently keyed by signature plus instruction/event index, tracks commitment, reconciles finalized state, catches up after downtime and handles transaction rollback. Keep confirmed events labeled pending until finalized. Database trade volume must not double-count replayed events, buybacks, or simulation runs. Chart history must survive reload.

Persist metadata with a documented durable provider and size limits. Do not log secrets or signed transaction payloads indiscriminately. Rate-limit unauthenticated APIs; sanitize metadata and uploads; no arbitrary URL fetch proxy. Configure env examples for network, RPC, program IDs, database and optional price feed. USD displays degrade to SOL when unavailable.

## 9. Reference simulator and required tests

Implement a deterministic event-based simulator with the same integer math as the program. Every run reports starting inventory, deposits, withdrawals to authorized fee recipients, trades, fees by destination, pending inventory, matched contributions, burned tokens and ending inventory. This brief does not claim simulations have already validated the mechanism.

### Required scenarios

| Scenario | What to verify |
|---|---|
| Straight pumping | Buy fee quote waits; no fake two-sided matching |
| Pump then sell | Exact opposing-fee match, current inventory composition |
| Repeated chop | Fees accumulate without creating unbacked assets |
| One controlled actor round-tripping | Maturity can be manufactured; report actor P/L and capital recycled |
| Pump before valuation snapshot | SOL metrics cannot be inflated with the token’s marked USD price |
| One trade versus 100/1,000 splits | Rounding bound and state-dependent differences, not assumed invariance |
| Sandwich and back-run | Measure attack P/L, victim output and slippage enforcement |
| Scar formed in a distant bin | Historical bin stays fixed; active depth may remain low |
| Complete sell depletion | Revert cleanly; no fabricated SOL or redemption guarantee |
| Complete buy depletion / boundary | Revert or quote unavailable consistently |
| Maturity threshold | Both conditions needed; exactly one graduation event |
| Buyback from POP’s own fees | Rejected; no self-funded circular loop |
| Unauthorized claims/upgrades | Locked vault withdrawal absent; report actual upgrade authority |
| Wrong page/mint/token program | Constraint failure, no transferred funds |
| Keeper/indexer outage | Swaps remain chain-valid, pending matches recover idempotently |

Property tests: base and quote conservation independently; account sums reconcile vaults; nonnegative reserves; no mint after activation; fixed bin prices; paired fee use never exceeds eligible escrow; fee totals equal charged inputs; SDK and Rust outputs match; graduation counters do not reuse paired assets; no rounding-profit cycle beyond documented dust bound; fee claims cannot spend locked money. Test extreme inputs, decimals, negative bin grouping, empty bins, repeated page initialization, overflow and all boundary prices. Fuzz swap histories and compare against independent bookkeeping, not only duplicated implementation.

Performance checks on validator: worst-case 32 inspected bins, account count, compute budget, serialized transaction size, lazy page rent, quote runtime and mobile wallet reliability. Reduce traversal cap if necessary, document it, and require identical SDK behavior. Never solve limits by dropping reserve validation.

## 10. Build order and acceptance

**Phase A — executable math specification.** Implement integer price tables, swap walker, matching, allocation, fee arithmetic and simulator. Produce scenario outputs and a written economic findings report, including round-trip attacks. If fee matching requires impractically high turnover, say so and calibrate parameters in new config versions before mainnet.

**Phase B — local Solana program.** Implement all relevant accounts/instructions, mint initialization and vesting, factory, tests and typed SDK. Demonstrate real local-validator swaps, scar formation, fee claims and graduation with small test thresholds in a separately labeled test config.

**Phase C — devnet full product.** Deploy if supported, connect real wallets, index real transactions, build the polished UI, test mobile, launch a second test market and demonstrate non-POP fee eligibility. Verify authorities and vault reconciliation. No fake activity on live views.

**Phase D — mainnet candidate.** Deliver production config proposal, funding requirements, audit package, release checklist, authority plan and deployment scripts. Keep production actions disabled unless explicitly authorized and prerequisites satisfied. Do not declare mainnet deployability merely because the website builds.

Acceptance: a fresh developer can install, run validator, initialize funded test markets, buy/sell via browser, inspect scar formation, trigger graduation with test config, reconcile balances, claim only allowed fees, see vesting and replay simulation runs using documented commands. Automated program and SDK checks pass; frontend production build passes; wallet failure paths are usable; no sensitive keys committed.

### Mainnet release gates

- Independent smart-contract review of custody, AMM math, fee accounting, vesting and buybacks; unresolved critical/high findings block launch.
- Simulator and validator evidence covering the above cases, documented parameter calibration and economic limitations.
- Real funding and published POP allocation/vesting/treasury addresses; no undisclosed founder purchase or allocation.
- Chosen authority state disclosed accurately; immutable custody claims only after program upgrade authority is revoked.
- No automatic buybacks without an independently defensible price guard and bounded execution policy; manual policy clearly labeled if used.
- Verified deployed program matches reviewed source, indexed data reconciles, and bootstrap/boundary trade behavior is documented.
- Mainnet deployment and token activation separately authorized by the owner; no tool-generated test key reused as treasury custody.

## 11. What Fable must return

1. Full repository and commit identifier; working UI preview.
2. README with exact pinned install/build/test/local-validator/devnet commands, environment template and realistic funding/rent estimates.
3. `docs/mechanism.md`, `docs/tokenomics.md`, `docs/authority-model.md`, `docs/deployment.md`, `docs/economic-findings.md` and tested math/rounding definitions.
4. Simulator outputs for every required scenario; no invented pass results.
5. Tests and actual command results; explain any unavailable compiler, RPC, wallet or deployment capability.
6. Devnet program/mint/vault/vesting addresses and real transaction signatures if deployed.
7. A candid status table: implemented and tested / implemented but untested / blocked / deliberately out of scope.

Do not finish after producing only mockups. Do not invent deployments or replace custom contracts with a wallet-connected demo. Build as much of the full stack as your environment supports and make remaining steps explicit.

## 12. Sources and design status

This is an original proposed specification, not an audited protocol, verified economic result, or proven novelty claim. All economics and implementation defaults above are proposals to test.

- Solana, Set Authority: https://solana.com/docs/tokens/basics/set-authority — mint and freeze authorities are distinct; setting an authority to None removes that role.
- Anchor documentation: https://www.anchor-lang.com/docs — framework reference for Solana program development and testing.
- Meteora official pool-creation documentation source: https://github.com/MeteoraAg/docs/blob/main/user-guides/creating-a-liquidity-pool.mdx — reference for bin spacing, initial prices and liquidity placement. POP v1 is its own proposed program and does not claim Meteora implements scar rules.

Verify current SDKs, program APIs and toolchain versions during implementation. Do not use the earlier hypothetical impact-fee equation, wash-trading argument or migration architecture as an alternative source of truth. This document supersedes those sketches.
