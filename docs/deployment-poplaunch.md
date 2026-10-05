# Pop Launch deployment plan

Status: localnet verified end to end. **Not deployed to devnet or mainnet.** Mainnet requires an explicit
production release decision by the owner after the gates below.

## Components and hosting

| Component | Hosting | Notes |
|---|---|---|
| `programs/pop_launch` | Solana cluster | verifiable build; upgrade authority per `docs/authority-disclosure.md` |
| `services/launchd` | one small VM or container (Fly.io / Railway / Render), 1 vCPU, 1 GB | needs `DATABASE_URL`, `RPC_URL`, `SOLANA_NETWORK`, `PUBLIC_URL`, `SIGN_DOMAIN`, `KEEPER_KEYPAIR` (file mounted as a secret), `GIT_COMMIT` |
| Postgres | managed (Neon / Supabase / RDS), nightly backup | schema in `services/launchd/src/schema.sql` |
| `apps/poplaunch` | Vercel or any Node host | build-time env: `NEXT_PUBLIC_DEMO=0`, `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SIGN_DOMAIN=poplaunch.fun` |
| RPC | Helius / Triton / QuickNode, plus a fallback | the browser uses a rate-limited public endpoint through `NEXT_PUBLIC_RPC_URL`; launchd uses an authenticated one |
| DNS | `poplaunch.fun` → web; `api.poplaunch.fun` → launchd | HTTPS everywhere; launchd behind a reverse proxy that sets `X-Forwarded-For` |

## Devnet (first real cluster)

1. `pnpm -r build && scripts/build-program.sh` on the release commit; record the program hash.
2. Deployer key (devnet only): `solana-keygen new -o ~/.config/poplaunch/devnet-deployer.json`; airdrop.
3. `anchor deploy --provider.cluster devnet` with `programs/pop_launch`. Program id stays
   `Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy` (keypair in `scripts/deploy/keys`, gitignored, backed up offline).
4. `RPC_URL=https://api.devnet.solana.com CLUSTER=devnet pnpm --filter @pop/integration verify:addresses`
   must pass (Raydium devnet program, AmmConfig 0 fee tier, fee receiver, Token Metadata program).
5. `initialize_protocol` with the V1 settings pointing at the devnet addresses from `packages/sdk/src/networks.ts`:
   `CLUSTER=devnet RPC_URL=… POP_ADMIN_KEYPAIR=… pnpm --filter @pop/integration bootstrap:launch`.
   Re-run `verify:addresses` (it now also checks the on-chain settings).
6. Deploy launchd (`SOLANA_NETWORK=devnet`) and the web app (`NEXT_PUBLIC_SOLANA_NETWORK=devnet`).
7. Run the acceptance list below with Phantom on desktop and Phantom mobile (deep link), with real devnet SOL.
8. Keep devnet up for the review period; it is the environment reviewers test against.

## Mainnet

Gates, all required:
- [x] Independent security review completed with no blocking findings (owner confirmation, October 2026; report held privately by the owner).
- [ ] `verify:addresses` passes on mainnet: Raydium CP-Swap `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`, AmmConfig index 0 with its live fee tier recorded, fee receiver `DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8`, Token Metadata `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`.
- [ ] Multisig created (Squads), members and threshold published in `docs/authority-disclosure.md`, timelock configured.
- [ ] Verifiable build hash published; `solana-verify` passes against the deployed program.
- [x] Terms and Privacy reviewed by counsel (owner confirmation, October 2026); contact address still to be added to both pages.
- [ ] Monitoring live: `/api/status` scraped, alerts routed to a phone.
- [ ] Keeper wallet funded with a disclosed amount; low-balance alert tested.
- [ ] Devnet acceptance list passed within the last 7 days on the release commit.
- [ ] Owner's written production release decision.

Steps:
1. Deploy from the release commit with the deployer key; immediately
   `solana program set-upgrade-authority <program> --new-upgrade-authority <multisig>`; publish the signature.
2. `verify:addresses` (mainnet). `initialize_protocol` from the multisig with V1 settings (fee recipient = treasury).
   `verify:addresses` again.
3. Deploy launchd and the web app with mainnet env. The web app shows no network strip on mainnet and
   explorer links carry no cluster parameter.
4. Smoke test with a tiny internal launch is **not possible** without a real 50 SOL fill; instead run
   `create_launch` for one internal coin, let it miss its target, and confirm refund and reserve reclaim on mainnet.
5. Point `poplaunch.fun` at the web app. Announce the authority disclosure page.

## Acceptance list (devnet, real wallets)

At 390 px and 1440 px: empty feed; create (image upload, rejected signature, insufficient SOL incl. fees,
successful create); back (minimum, below minimum rejected, exact remainder, over-remainder rejected whole,
capacity race between two wallets); keeper settlement and the manual "Finish launch now" path; claim; a
second claim shows nothing to claim; missed-target refund; reserve reclaim; stale RPC and launchd down
(launch page still loads from chain, refund still works); keyboard navigation and focus; reduced motion.

## Rollback

The web app and launchd roll back by redeploying the previous image. The program never rolls back: a
flawed deployment is fixed by a reviewed upgrade through the multisig, or, if the flaw is in settlement,
by pausing new launches and letting open launches refund.
