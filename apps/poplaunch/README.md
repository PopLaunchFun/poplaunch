# Pop Launch — homepage (POP PRESS mockup)

Bright, playful Solana coin launchpad: **Back it. Fill it. Pop it.**
This app implements the approved "03 / POP PRESS" mockup as real, responsive components:
selectable text, working links and buttons, data-driven progress bars, and the mockup's
illustrations as separate image assets. It runs on clearly labeled demo fixtures (the three
sample coins from the mockup). There is no wallet, no chain, no indexer and no real SOL in it.

It is isolated from the earlier Proof of Pain work in `apps/web`, which is untouched and superseded.

## Run

```
pnpm install
pnpm --filter @pop/poplaunch build
pnpm --filter @pop/poplaunch start      # http://localhost:3100
pnpm --filter @pop/poplaunch typecheck
```

Demo fixtures are on by default (`NEXT_PUBLIC_DEMO` defaults to `1` in `next.config.ts`).
Build with `NEXT_PUBLIC_DEMO=0` and the feed is empty and launch pages return 404, so nothing
invented can leak into a real feed.

## Routes

| Route | What it shows |
|---|---|
| `/` | The mockup homepage: header, stacked headline, yellow featured panel, "Demo launches" rows |
| `/launch/[id]` | Launch detail (not yet redesigned to the mockup; it inherits the new tokens so it stays usable). Ids: `cat-exe`, `froggo`, `goodboy` |
| `/launch/[id]?state=funding\|ready\|live\|refundable` | Dev-only preview of the four on-chain states |

## Artwork

`public/art/` holds the balloons cut out of the mockup as transparent PNGs:
`balloon-cat-featured.png` (323×361), `balloon-cat.png`, `balloon-frog.png`, `balloon-dog.png`.
They were extracted by flood-filling the background and masking to the balloon shape; no
emojis, stock icons or generated artwork were substituted. Clouds, sparkles, chevrons, the
wordmark burst, the squiggle, the balloon string and the wallet/clock/arrow icons are
recreated as small SVGs in `src/components/art.tsx`. The "Community funded coins on Solana"
note card is real HTML text.

Production launches use the creator's uploaded image inside the same balloon frame
(`SvgBalloon` in `src/components/balloon-frame.tsx`: red, green or yellow shell, black outline,
gloss, knot), so every coin keeps the mockup's balloon framing.

## Fonts (self-hosted, OFL via Fontsource)

- Headline, wordmark, coin names, "Demo launches": Rubik Variable at weight 900 with a thin
  text stroke to match the mockup's very heavy rounded lettering.
- "84%" and "CAT.EXE" in the featured panel: Anton (heavy condensed).
- Mono: Space Mono (note card, captions, SOL amounts).
- UI: Inter Variable (nav, buttons, times).

Font loading is verified in the browser (`document.fonts` reports Rubik Variable, Anton,
Space Mono and Inter Variable loaded; computed styles resolve to them, not to fallbacks).
The mockup's exact typefaces are not identified; these are the closest licensed matches
checked against the rendered letter shapes.

## Checks run

- Production build and typecheck pass; no console errors.
- 1536×1024 (the mockup's size), 390×844 and 360px screenshots show no horizontal overflow.
- `screenshots/mockup-vs-build.png` stacks the mockup above the build at the same size.

## Demo-only behaviour

- Every launch, number and backer count is invented; the list is headed "Demo launches".
- "Connect wallet" explains that connection arrives with the connected app.
- "Help it pop" opens the launch detail; backing, claims and refunds perform no transaction.

## Stage 2 (done): on-chain mechanism

The escrow program `programs/pop_launch` and its proof against the real Raydium CP-Swap program are
documented in `docs/pop-launch-mechanism.md`.

## Stage 3 (done): connected app

Wallets (Phantom, Solflare, localnet Dev wallet), live feed and launch pages from `services/launchd`
with chain fallback, backing / finish launch / claim / reclaim transactions with explicit states, the
two-step Create a coin flow with signed metadata upload, My pops, How it works, Terms and Privacy
drafts, share cards. Modes (demo / localnet / devnet) are fixed at build time and never mixed. See
`docs/pop-launch-app.md` for how to run it and what the end-to-end run verified.

```
NEXT_PUBLIC_DEMO=0 NEXT_PUBLIC_SOLANA_NETWORK=localnet NEXT_PUBLIC_SIGN_DOMAIN=localhost pnpm --filter @pop/poplaunch build
```

## Next (not started)

Stage 4: production readiness (security review, verified program addresses, Metaplex metadata,
monitoring, authority disclosure, final terms, devnet then mainnet deployment).
