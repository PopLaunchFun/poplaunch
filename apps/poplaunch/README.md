# Pop Launch — Stage 1 visual slice

Bright, playful Solana coin launchpad: **Back a coin. Fill the balloon. Launch together.**
This app is the Stage 1 deliverable from the Pop Launch handoff: the homepage and one
launch-detail screen, built on the **Pop Daylight** direction, running on clearly labeled demo
fixtures. There is no wallet, no chain, no indexer and no real SOL anywhere in this app.

It is isolated from the earlier Proof of Pain work in `apps/web`, which is untouched and superseded.

## Run

```
pnpm install
pnpm --filter @pop/poplaunch build
pnpm --filter @pop/poplaunch start      # http://localhost:3100
pnpm --filter @pop/poplaunch typecheck
```

Demo fixtures and the dev-only state selector are on by default for Stage 1 (`NEXT_PUBLIC_DEMO` defaults to `1` in `next.config.ts`).
Build with `NEXT_PUBLIC_DEMO=0` and the feed is empty and launch pages return 404: nothing invented can leak into a real feed.

## Routes

| Route | What it shows |
|---|---|
| `/` | Hero ("Big ideas. Ready to pop."), featured launch with balloon, Back it → Fill it → Pop strip, launch feed (Filling up / Just launched, search), Create a coin callout |
| `/launch/[id]` | Coin identity, large balloon, exact total/target, progress, countdown, backing panel (desktop) / sticky action + sheet (mobile), expandable Launch details, disclosures |
| `/launch/[id]?state=funding\|ready\|live\|refundable` | Dev-only preview of the four on-chain states for the same launch |

Demo launch ids: `demo-moonberry`, `demo-pixel-pup`, `demo-sunny-side`, `demo-orbit-owl`,
`demo-mango-mode`, `demo-cloud-nine` (Getting ready), `demo-lemon-drop` and `demo-tidal` (Live),
`demo-night-fox` (Refund available).

## What is real in this slice

- Layout, typography (self-hosted Nunito Variable for display, Inter Variable for body; both OFL via Fontsource), tokens, components, responsive behaviour (390px, 360px, 1440px checked for horizontal overflow).
- Integer accounting helpers in `src/lib/launch.ts`: entitlement = floor(contribution × backer allocation / target), launch price = target / pool allocation, percentage in basis points, exact SOL formatting. No floating point in any amount shown.
- V1 protocol settings as versioned constants (50 SOL target, 24h window, 60-minute settlement timeout, 1B supply, 500M/500M split, 0 creator allocation, 0.1 SOL creation fee, 0.01 SOL minimum contribution).
- Discovery sort: highest percentage funded, then soonest deadline, then id. Expired/failed launches are excluded from Filling up.
- Balloon: SVG/CSS, avatar inside, shell scales on a bounded curve (0.62 + 0.38·√p) with the exact number always printed; idle float is a 5s transform-only animation; the Live state shows the coin intact above "POP! [NAME] is live." with a one-shot confetti burst under 1.5s. All motion is disabled under `prefers-reduced-motion`.
- Backing panel: SOL entry with 0.1 / 0.5 / 1 presets, minimum and remaining-capacity validation, estimated allocation, review step, the required lock text, and the "Back with [amount] SOL" button.
- Accessibility: visible focus rings, 44px touch targets on actions, roles/labels on tabs, progress bars, dialogs and menus, AA contrast (primary buttons use #D23A2A for white text, 4.8:1).

## What is deliberately not real

- Every launch, number, wallet and backer count is a fixture (`src/demo/fixtures.ts`), labeled "Demo" in the UI.
- "Connect wallet" explains that connection arrives in Stage 3; nothing prompts a wallet.
- "Back with … SOL", "Claim …", "Reclaim SOL", and "Trade" perform no transaction; the final backing step shows a demo notice. "Trade" links to the DEX homepage, not a pool.
- Settlement progress steps in the Getting-ready state are labeled example steps, not transactions.
- Terms and Privacy are placeholders in the footer.
- Create a coin, My pops and How it works pages are out of Stage 1 scope; header links anchor to homepage sections.

## Screenshots

See `screenshots/` (desktop 1440×900, mobile 390×844, plus 360px and the four launch states).

## Next (not started)

Stage 2: Anchor program (create_launch, contribute, finalize_launch, claim_tokens, refund,
top_up_setup_reserve, reclaim_unused_setup_reserve), Raydium CPMM adapter proof with atomic
seed + LP burn + claim enablement, deadline/refund boundary tests. Stage 3: wiring this UI to it.
