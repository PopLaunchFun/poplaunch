# POP — Proof of Pain
## Launchpad build and redesign brief · v2 · October 4, 2026

## 0. Instruction to Fable

Build **POP / Proof of Pain as a Solana token launchpad**. The main experience is: **discover coins → launch a coin → trade → watch fee-funded liquidity scars form**. Every new coin launched here uses the Proof of Pain mechanism.

The separate **$POP token is launched externally on Pump.fun**. That external token launch is outside this project. This application neither launches nor hosts a special genesis POP market. Do not recreate its mint, supply, allocations, vesting, trading page, buybacks, or tokenomics. There is no requirement to hold $POP to use the launchpad. The product name can remain POP; it names the launchpad in the interface.

### Immediate correction for the existing Fable build

This v2 supersedes the previous brief wherever scope or design differs. Refactor the existing project; retain functioning launch, wallet, market and scar logic. Replace the token-centric homepage and visual system. Remove the /pop page, “Trade POP” calls to action, genesis-market pin, allocation/vesting widgets, buyback dashboards, and POP-specific contract dependencies introduced by v1. Remove navigation and internal links to those features. An old /pop route may redirect to / solely for compatibility.

Start by inspecting the existing routes and components, then implement the redesign. Do not stop at describing it. The homepage must immediately look like an active launchpad: searchable coin listings and a prominent **Launch coin** action. The market page must make the liquidity mechanism observable during actual trading. Keep protocol explanations short and contextual, with deeper documentation secondary.

Read this entire document before implementation. Implement the mathematics, simulator, Solana program, SDK, indexer, wallet transactions, and polished frontend. This is a functional protocol project, not a landing page with simulated trading disguised as live trading. First ship a complete local-validator and devnet product. Keep real-money mainnet deployment disabled until the release gates in this document pass. The external $POP launch on Pump.fun is separate; coins launched through this application still require the custom Proof of Pain mechanism.

Work autonomously through the phases below. If your environment cannot compile or deploy Solana programs, still write the program, tests, client, and deployment instructions; clearly identify the unexecuted checks. A working simulator is useful but is not evidence that the deployed contract works. Do not claim audit, novelty, immutable custody, live revenue, or mainnet readiness without evidence.

Deliver a repository, reproducible commands, working preview, devnet transaction evidence if deployment is possible, and an implementation status report. Follow the concrete defaults here; label them experimental calibration choices rather than validated economics.

## 1. Product and scope

**Name:** POP / Proof of Pain. **Product:** token launchpad. **Chain:** Solana. **Market pairs:** each newly created coin/WSOL. **Primary action:** “Launch coin.” **Compact headline:** “Launch a coin. Build its liquidity.” **Secondary line:** “The market remembers.”

The defining primitive is a price-bin market with two classes of inventory: launch seed inventory and fee-funded scar inventory. Fees collected from buyers arrive in quote tokens; fees collected from sellers arrive in base tokens. At each price bin, matched base and quote fee inventories activate as scar liquidity. The bin location never moves; its inventory changes when traders buy and sell against it.

V1 includes the reusable factory, coin discovery, wallet-connected creation, per-coin trading, and a live scar map. Test with multiple ordinary devnet coins; no privileged platform-token market. Public mainnet launches become available once the release gates pass. Every newly launched coin follows the same initialization, fees and scar rules.

### Critical corrections to the initial concept

1. Price impact is a change in execution price, not money magically available to deposit. Explicit fees supply the scars.
2. “Permanent” means liquidity cannot be withdrawn or relocated. Assets can leave a bin through ordinary swaps in exchange for the opposite asset. Quote reserves and dollar value do not monotonically increase.
3. Round trips can form scars. They demonstrate paid fee accumulation, not organic demand, independent holders, or survival. Do not market graduation as wash-trade proof.
4. Match only collected buy and sell fees in v1. Remove the earlier separate 20% token Scar Reserve: subsidizing the token side would muddy the two-sided rule and graduation accounting.
5. Use a fixed scar fee in v1. The prior impact integral was conceptual, not a dimensionally complete fee equation. Dynamic impact fees are a later research track.
6. Graduation is a status transition, not migration. Moving to a conventional pool would erase the promised stationary scar structure.
7. The launchpad has no dependency on the externally launched $POP token. Platform-token economics and integrations require a separate scope; do not implement the earlier buyback design.

Do not use “every dump makes the coin stronger,” “liquidity cannot go backwards,” “guaranteed support,” or “you must pay $50k to fake $50k of scars” as factual claims. Use: “Every eligible trade contributes fees. Matched fees create nonwithdrawable inventory at fixed price bins.”

## 2. New coin defaults and launchpad fees

These defaults apply identically to coins created by the factory, not to the external $POP token.

| Parameter | Default |
|---|---|
| Total supply per new coin | 1,000,000,000 tokens |
| Decimals | 6 |
| Token program | Standard SPL Token; no transfer tax or transfer hook |
| Initial token allocation | 100% committed to nonwithdrawable seed inventory |
| Creator allocation | Zero; creator may buy through ordinary trading |
| Mint authority | Revoked after exact initial allocation |
| Freeze authority | Absent/revoked |
| Creator income | Published creator trading fee |
| Platform token required | No |

The factory creates standard fixed-supply mints; arbitrary token imports are out of scope for v1. Show seed funding, creation costs, creator fee address and supply rules on the creation review screen. Do not include platform-token allocation or vesting in this flow.

### Fees: gross input asset on both sides

| Destination | Basis points of gross input |
|---|---:|
| Scar escrow for traversed bins | 150 bps |
| Protocol revenue | 25 bps |
| Creator revenue | 25 bps |
| Total | 200 bps / 2.00% |

Buy input is WSOL; sell input is the coin's base token. Creator and protocol claims are separate balances, never claims on scar or seed custody. Protocol fees accrue to the configured disclosed treasury. Creator fees accrue to the creator address fixed at market creation. No POP buyback, burn, staking or token-gating module in this launchpad build. This brief makes no claim about the economics of the externally launched token.

## 3. Market initialization and seed inventory

Use a custom discrete constant-price-bin AMM for v1. Do not assume an existing Meteora pool can enforce mandatory custom fees: direct swaps can bypass a wrapper. Existing bin-market implementations are design references, not an integration dependency.

### Proposed factory defaults

| Parameter | Default |
|---|---|
| Price spacing | 100 bps: adjacent executable bins differ by 1% |
| Logical bin range | -64 through +511 inclusive, bounded |
| Initial cursor | Bin 0 |
| Seed WSOL | 20 SOL, externally funded and locked |
| Seed quote placement | Uniform across bins -64 through -1 |
| Seed base placement | Uniform across bins 0 through 511 |
| Seed base | 1 billion tokens of the newly launched coin |
| Reference price P0 | 20 SOL / 1 billion tokens, in human units |
| Price at bin i | P_i = P0 × 1.01^i |
| Max bins inspected per swap | 32, including empty bins |
| Scar maturity target | 100 SOL of historical paired quote contribution |
| Territory target | 10 distinct 10-bin bands with ≥1 SOL paired quote contribution each |

P0 is an initialization convention, not a valuation appraisal. It does not mean every token can be redeemed at that price or that seed reserves collateralize total supply. WSOL funding and rent are real deployment requirements; do not synthesize reserves. Every market uses its total seed token supply in the denominator. The existing 20 SOL seed requirement is an experimental economic parameter, not a platform charge. Show it clearly before wallet approval. It may impede easy public launches: benchmark smaller funded configurations before choosing mainnet defaults. Do not quietly substitute fake reserves or promise free launches. A simplified form does not remove real funding requirements.

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

Scar fees remain pending indefinitely if opposing flow never appears. No timeout refund or admin sweep. Do not match seed inventories against fees or count unrelated transfers as scar capital. Only recorded swap fees qualify for the matching counters.

## 5. Graduation and honest metrics

Graduation marks **historical fee-funded maturity**, not a $50k vault balance or proof of market demand. Avoid an on-chain USD oracle in v1.

`paired_quote_lifetime = sum(eligible quote amounts activated by matching)`

`hardened_bands = count(band.paired_quote_lifetime >= 1 SOL)`

`progress = min(1, paired_quote_lifetime/100 SOL, hardened_bands/10)`

Graduation requires both thresholds. The transition is irreversible, emits an event, unlocks directory highlighting and an embeddable graduation badge, and leaves reserves, prices, fee rules, and trading unchanged. No external pool migration in v1. Graduation has no creator payout or platform-token reward, removing an obvious manufactured-volume reward.

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

- ProtocolConfig: version, factory settings for new markets, published fee recipients and launch enable flag.
- Market: base/quote mints, cursor, boundaries, price constants, immutable fee/threshold settings, allocated/unallocated seed balances, maturity counters, status, immutable creator address.
- BinPage: fixed bins with seed base/quote, scar base/quote, pending base/quote, cumulative buy/sell volume, paired quote counters, last execution slot. Keep instrumentation bounded; do not store unbounded trade history on-chain.
- BandState: per-band cumulative paired quote and threshold-crossed bit; update the global hardened count once.
- Market vaults: segregated seed/scar trading and pending-fee custody from withdrawable protocol/creator accounts; exact physical layout can combine locked assets only with rigorous reconciliation.
- FeeClaim: protocol or creator claimable balances by mint; no recipient override at claim time.

### Instructions

`initialize_protocol`, `create_market`, `initialize_bin_page`, `activate_market`, `swap_exact_in`, `match_bins` (permissionless, bounded), `claim_creator_fees`, `claim_protocol_fees`, and factory-only `disable_new_markets`.

Market graduation is evaluated automatically when eligible matching updates thresholds. Any standalone `evaluate_graduation` must be permissionless and derive results from stored counters, not caller assertions.

No instructions for scar withdrawal, seed withdrawal, relocation, arbitrary vault CPI, post-activation fee changes, reserve recovery, or market-level administrator confiscation. Fee claims cannot touch locked balances. Pause controls may disable new markets; avoid a permanent admin trading veto on mature markets. Document the incident response limitations of immutable code.

Upgrade authority is a material custody power: an upgradeable program could add withdrawals. Devnet may be upgradeable. Mainnet remains labeled “upgradeable / multisig-controlled” until independent review and explicit authority revocation. Only then describe custody as immutable. Do not imply a PDA alone makes funds permanently locked. Token mint-authority revocation is separate from program upgrade-authority revocation.

## 7. Launchpad interface and visual redesign

### Visual direction: dark grey × Matrix green

Build a sleek, futuristic exchange interface with restrained neon details. Dark grey surfaces must remain visibly distinct; avoid flattening everything into pure black. Green is the signature accent for actions, active controls and newly formed scars. Use whitespace, fine borders and clean typography rather than glow-heavy decoration.

| Design token | Value / application |
|---|---|
| Page background | #141719 — dark charcoal grey |
| Primary panel | #1B2023 |
| Raised/hover surface | #232A2E |
| Fine border | #303A3F |
| Matrix green | #00FF85 — primary buttons, active tabs, scar highlights |
| Green hover | #5CFFAF |
| Muted green surface | #153329 — selected controls and understated badges |
| Main text | #F0F4F2 |
| Secondary text | #A1ACA7 |
| Negative/error | #F07886 — reserved for loss/direction/error semantics |
| Main font | Inter or a comparable clean sans-serif |
| Numerals and small labels | JetBrains Mono or a comparable monospace |
| Panel/button rounding | 8–12px, consistent |

Primary green buttons use near-black text. Check contrast for actual small text and controls; never use dim green as essential text. Thin grid lines or a faint static coordinate pattern can add atmosphere behind a small header region. No Matrix rain, full-screen terminal, large animated background, excessive bloom, coral/violet theme, giant marketing hero, or bulky stacks of unrelated cards. Neon edge highlights should occupy little of the screen.

### Product hierarchy

Main navigation: **Explore · Launch coin · My launches**, plus wallet connection. Use the POP wordmark as a home link, with “Proof of Pain” as a small descriptor if space permits. “How it works” and technical status belong in the footer or help menu. No platform-token navigation. Show the network accurately and visibly without turning the page into a developer console.

Above the fold on a 1440×900 desktop: navigation, compact headline, search/filter controls, and actual coin listings. On a 390px-wide phone: header, search, launch action, and the first coin listings without scrolling past promotional sections. Use a consistent spacing scale and aligned numeric columns.

### Routes and behavior

**/ — Explore launchpad.** Make this the working coin directory, not a token landing page. Compact heading “Launch a coin. Build its liquidity.” Supporting copy: “Every launch uses Proof of Pain. Trade and watch its liquidity scars form.” Primary **Launch coin** button. Search by name, symbol or mint. Filters **New · Active · Graduated**; explicit sort options for newest, volume and paired-fee contributions. Use a crisp responsive row/grid system: coin image/name/ticker, age, price or market cap, volume, scar progress and a tiny sparkline. One subtle green progress strip per coin. No featured external $POP chart or pinned genesis token. Use real data. An empty directory says “Be the first to launch” with a creation CTA, not fake coins. Dev fixtures appear only in clearly labeled development/test mode. /markets can redirect to / to avoid two competing discovery pages.

**/launch — Create a coin.** One compact form: name, ticker, image, description, optional social links. Default economic settings are fixed by the factory; do not expose bin spacing and advanced AMM controls in the normal flow. Show the wallet balance and an upfront cost summary: seed SOL locked into the market, network/rent costs, and any actual creation fee (do not invent one). A review step shows supply, zero creator allocation, creator fee address and 2% trading fee breakdown. Button **Launch coin**. Submit real on-chain creation/funding/activation instructions. If several signatures are required, explain progress and resume from the last confirmed step; do not create duplicates on retry. A market appears in the public active list only after activation succeeds. After confirmation navigate directly to /coin/[mint] with “Your coin is live” and **Copy link / Trade** actions. Distinguish rejected signatures, inadequate seed funds, creation pending, activation pending, and failures. No mandatory $POP purchase. Mainnet availability follows release readiness, not a POP-token launch prerequisite.

**/coin/[mint] — Trade and watch the mechanism.** The user-created coin is the subject. Desktop: token header and standard price chart at left/center, a stable trade ticket at right, an integrated scar map immediately below or beside the chart, then activity. Mobile: header, chart, clearly labeled **Price / Liquidity scars** toggle, compact progress summary, sticky **Trade** control with bottom sheet. The scar view must be discoverable in one tap, not buried in documentation. Existing /market/[mint] routes may redirect here.

Keep a familiar chart and trade ticket so people can trade immediately. Buy/sell, SOL or base-token amount, wallet balance, estimated output, fee breakdown, slippage, minimum received and network cost are clear. Keep advanced information collapsed unless it affects approval. Never silently increase slippage. Quote and simulate before requesting a signature. Handle depleted reserves, traversal limits, stale quotes, wallet rejection and wrong network plainly.

The **Liquidity scars** panel is the differentiating feature. Show a price ladder with scar intensity, active cursor, and pending opposing fee balances. A confirmed swap highlights the bins it touched; a real ScarFormed event gives the corresponding band a brief green pulse and a compact “Scar formed” event. No pulse, progress increase or completion notification based solely on clicking Trade or receiving a wallet signature. Respect reduced-motion; update data without animation. Show a simple caption: “Buy and sell fees pair here to add locked liquidity.”

Progress label **Pain proven** has a tooltip: “Historical paired-fee milestone; not a safety rating.” Keep current scar quote inventory separately labeled **SOL currently in scars**, and pending fees labeled **Waiting to pair**. Band details can expand to show token/quote composition and historical matched contributions. Graduation is a milestone badge with a small celebration; trading stays in the same market. Keep full formulas in help, not in the main trade flow.

Recent trades and scar events use actual signatures and timestamps with explorer links. A copyable mint, creator address and available ownership concentration data belong in a compact details drawer. Do not show founder vesting or platform-token allocations. Do not equate historical fee contributions with present sell-side depth.

**/my-launches — Creator workspace.** Connected wallet sees its created coins, real activation status, links to each market and claimable creator fees by asset. Claiming can only access creator fee accounts. Include a retry/resume action for unfinished creation where supported. No token staking or platform-token holdings panel.

**/mechanism — Secondary help.** Brief explanation of buy fees, sell fees, matching and fixed bins, followed by precise limitations and optional formulas. Keep accessible from help, not a required onboarding step. **/status** contains operational/authority details. **/lab** remains an internal/developer simulation tool, omitted from primary navigation and never used as live trading data.

### Design and experience acceptance checks

- Homepage reads as a coin launchpad in five seconds; the main action is Launch coin.
- A new visitor can create a coin, reach its trading screen, make trades and see real matching events without opening protocol documentation.
- Multiple user-created coins receive equal treatment; no mandatory flagship $POP market.
- No $POP price, allocation, vesting, burn, buyback or Pump.fun token-sales content anywhere in the customer flow.
- Dark grey backgrounds and Matrix green accents match the palette consistently across all routes.
- Verify rendered desktop and phone screenshots, chart/ticket alignment, long names, empty/error states, keyboard navigation, contrast and reduced-motion behavior. Fix overflow and clipped controls before delivery.

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

Endpoints: markets listing/detail, bounded bin snapshots, indexed trades/candles, creator markets/claims, launch activation status, status. Quote endpoint optional: return block/slot, market state fingerprint, fee breakdown and instruction params. Local SDK quotes use identical math; on-chain min_output is final protection. Frontend can read vaults and quote from RPC if indexing is stale; do not synthesize a successful fill from cached state.

Indexer records events idempotently keyed by signature plus instruction/event index, tracks commitment, reconciles finalized state, catches up after downtime and handles transaction rollback. Keep confirmed events labeled pending until finalized. Database trade volume must not double-count replayed events or simulation runs. Chart history must survive reload.

Persist metadata with a documented durable provider and size limits. Do not log secrets or signed transaction payloads indiscriminately. Rate-limit unauthenticated APIs; sanitize metadata and uploads; no arbitrary URL fetch proxy. Configure env examples for network, RPC, program IDs, database and optional price feed. USD displays degrade to SOL when unavailable.

## 9. Reference simulator and required tests

Implement a deterministic event-based simulator with the same integer math as the program. Every run reports starting inventory, deposits, withdrawals to authorized fee recipients, trades, fees by destination, pending inventory, matched contributions and ending inventory. This brief does not claim simulations have already validated the mechanism.

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
| Multiple independent launches | Scar, reserve and creator-fee state isolated per market |
| Interrupted creation | Resume without duplicate mint, funding or page allocation |
| Unauthorized claims/upgrades | Locked vault withdrawal absent; report actual upgrade authority |
| Wrong page/mint/token program | Constraint failure, no transferred funds |
| Keeper/indexer outage | Swaps remain chain-valid, pending matches recover idempotently |

Property tests: base and quote conservation independently; account sums reconcile vaults; nonnegative reserves; no mint after activation; fixed bin prices; paired fee use never exceeds eligible escrow; fee totals equal charged inputs; SDK and Rust outputs match; graduation counters do not reuse paired assets; no rounding-profit cycle beyond documented dust bound; fee claims cannot spend locked money. Test extreme inputs, decimals, negative bin grouping, empty bins, repeated page initialization, overflow and all boundary prices. Fuzz swap histories and compare against independent bookkeeping, not only duplicated implementation.

Performance checks on validator: worst-case 32 inspected bins, account count, compute budget, serialized transaction size, lazy page rent, quote runtime and mobile wallet reliability. Reduce traversal cap if necessary, document it, and require identical SDK behavior. Never solve limits by dropping reserve validation.

## 10. Build order and acceptance

**Phase A — executable math specification.** Implement integer price tables, swap walker, matching, allocation, fee arithmetic and simulator. Produce scenario outputs and a written economic findings report, including round-trip attacks. If fee matching requires impractically high turnover, say so and calibrate parameters in new config versions before mainnet.

**Phase B — local Solana program.** Implement all relevant accounts/instructions, mint initialization, factory, tests and typed SDK. Demonstrate real local-validator swaps, scar formation, fee claims and graduation with small test thresholds in a separately labeled test config.

**Phase C — devnet full product.** Deploy if supported, connect real wallets, index real transactions, build the polished UI, test mobile, create multiple coins through the public launch form and demonstrate isolated scar formation and creator fee claims. Verify authorities and vault reconciliation. No fake activity on live views.

**Phase D — mainnet candidate.** Deliver production config proposal, funding requirements, audit package, release checklist, authority plan and deployment scripts. Keep production actions disabled unless explicitly authorized and prerequisites satisfied. Do not declare mainnet deployability merely because the website builds.

Acceptance: a fresh developer can install, run validator, initialize funded test markets, buy/sell via browser, inspect scar formation, trigger graduation with test config, reconcile balances, claim only allowed fees, complete discovery/creation/creator-fee flows and replay simulation runs using documented commands. Automated program and SDK checks pass; frontend production build passes; wallet failure paths are usable; no sensitive keys committed.

### Mainnet release gates

- Independent smart-contract review of custody, AMM math, fee accounting and factory initialization; unresolved critical/high findings block launch.
- Simulator and validator evidence covering the above cases, documented parameter calibration and economic limitations.
- Real seed funding and published per-market mint/vault/creator-fee and protocol treasury addresses; factory allocation rules match the launch review screen.
- Chosen authority state disclosed accurately; immutable custody claims only after program upgrade authority is revoked.
- Verified deployed program matches reviewed source, indexed data reconciles, and bootstrap/boundary trade behavior is documented.
- Mainnet deployment and token activation separately authorized by the owner; no tool-generated test key reused as treasury custody.

## 11. What Fable must return

1. Full repository and commit identifier; working UI preview.
2. README with exact pinned install/build/test/local-validator/devnet commands, environment template and realistic funding/rent estimates.
3. `docs/mechanism.md`, `docs/launch-rules.md`, `docs/authority-model.md`, `docs/deployment.md`, `docs/economic-findings.md` and tested math/rounding definitions.
4. Simulator outputs for every required scenario; no invented pass results.
5. Tests and actual command results; explain any unavailable compiler, RPC, wallet or deployment capability.
6. Devnet program and per-market mint/vault addresses and real transaction signatures if deployed.
7. A candid status table: implemented and tested / implemented but untested / blocked / deliberately out of scope.

Do not finish after producing only mockups. Do not invent deployments or replace custom contracts with a wallet-connected demo. Build as much of the full stack as your environment supports and make remaining steps explicit.

## 12. Sources and design status

This is an original proposed specification, not an audited protocol, verified economic result, or proven novelty claim. All economics and implementation defaults above are proposals to test.

- Solana, Set Authority: https://solana.com/docs/tokens/basics/set-authority — mint and freeze authorities are distinct; setting an authority to None removes that role.
- Anchor documentation: https://www.anchor-lang.com/docs — framework reference for Solana program development and testing.
- Meteora official pool-creation documentation source: https://github.com/MeteoraAg/docs/blob/main/user-guides/creating-a-liquidity-pool.mdx — reference for bin spacing, initial prices and liquidity placement. POP v1 is its own proposed program and does not claim Meteora implements scar rules.

Verify current SDKs, program APIs and toolchain versions during implementation. Do not use the earlier hypothetical impact-fee equation, wash-trading argument or migration architecture as an alternative source of truth. This document supersedes those sketches and all v1 platform-token launch, allocation, vesting and buyback requirements. The separate external $POP token does not change the mechanism for coins created on this launchpad.
