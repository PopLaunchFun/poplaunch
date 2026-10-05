# Pop Launch deployment plan

Status: **deployed to mainnet on 5 October 2026** (record at the end of this document). Devnet remains up as
the test environment. Both authorities on both clusters are the owner's wallet.

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
- [x] `verify:addresses` passes on mainnet (5 Oct 2026, all checks): Raydium CP-Swap `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`, AmmConfig index 0 with its live fee tier recorded, fee receiver `DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8`, Token Metadata `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`.
- [x] ~~Multisig~~ Owner decision: no multisig; upgrade and protocol authority is the owner's wallet `jNdwn3…tnx`, disclosed on `/authority`.
- [x] Build hash published: `solana program dump` of the mainnet program is byte-identical to `target/deploy/pop_launch.so`, sha256 `4d92edda2af8d0241e59bdc1b9dbcc678e1c55f378f07d5f85dfd771f5dae387` (`solana-verify` against the Docker build is still worth running from a second machine).
- [x] Terms and Privacy reviewed by counsel (owner confirmation, October 2026); contact address hello@poplaunch.fun on both pages.
- [ ] Monitoring live: `/api/status` scraped, alerts routed to a phone (open: the owner has to point an uptime checker at it; see runbook).
- [x] Keeper wallet `A8xfbesTUdtTwfxdZrtNTs1J7iTzqDUxSQawrqGmdyPF` funded with 0.3 SOL; the low-balance alert raised while it was empty and cleared when funded (Railway logs, 20:29 and 20:35 UTC).
- [x] Devnet acceptance: the owner backed, settled and claimed a launch with a real wallet on 5 Oct 2026 ("ok it works").
- [x] Owner's release decision given in writing on 5 Oct 2026 ("carry on", "approved, go ahead and resume the deploy").

Steps:
1. Deploy from the release commit with a throwaway deployer key; immediately
   `solana program set-upgrade-authority <program> --new-upgrade-authority jNdwn3LU6TDj7ZSzhsG4c7WY99BNz1JNs5qxspdvtnx --skip-new-upgrade-authority-signer-check`; publish the signature.
2. `verify:addresses` (mainnet). The owner opens `/admin` with that wallet and initializes the protocol with the
   V1 settings, fee recipient = the same wallet, creation fee **0** for the opening 24 hours; 24 hours later the owner
   sets the fee to 0.1 SOL from `/admin`. `verify:addresses` again.
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

## Devnet deployment record (5 October 2026)

| Item | Value |
|---|---|
| Program | `Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy`, deployed in slot 507823557; upgraded in slot 507847099 with `transfer_authority` (586,016 bytes, account extended by 20 KB) |
| Upgrade and protocol authority | the owner's wallet `jNdwn3LU6TDj7ZSzhsG4c7WY99BNz1JNs5qxspdvtnx` (moved from the throwaway deployer `FyGT…uC23`; transfer signature `2F43deo2…i2fp`) |
| Protocol settings | version 1: target **1 SOL** (devnet test value; mainnet uses 50), 24 h window, 60 min timeout, 0.1 SOL fee, 0.2 SOL minimum reserve, Raydium devnet `DRaycp…`, AmmConfig 0 `5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy` |
| Keeper fee wallet | `78iGSuqLxgoart2gJJLmFTobVyctCJDFqKygbmd9b3oU` |
| Backend | Railway project `poplaunch-devnet`: `launchd` from this repo's `services/launchd/Dockerfile`, Postgres 16 with a volume; `https://launchd-production-6acc.up.railway.app` |
| Website | Vercel project `poplaunch` (root `apps/poplaunch`) served www.poplaunch.fun until the mainnet switch on 5 Oct 2026; devnet now lives on the spare project at **https://pop-launch-devnet.vercel.app**. Browser RPC: public devnet endpoint; backend RPC: Helius. Until the Vercel GitHub app is installed, deploys are pushed from the CLI (`vercel deploy --prod` from the repo root). |
| Sign domain | `poplaunch-devnet` (same string in the site and the backend) |

`verify:addresses` passed on devnet after `initialize_protocol`. Raydium's devnet configs all carry a 0.25%
creator fee (mainnet config 0 carries 0.05%); it accrues to the launch authority and is harmless for testing.

## Mainnet deployment record (5 October 2026)

| Item | Value |
|---|---|
| Program | `Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy`, deployed in slot 453691238, 568,768 bytes, sha256 `4d92edda…dae387` (identical to the devnet build); deploy signature `3STZ1cGx…bVVV` |
| Upgrade authority | the owner's wallet `jNdwn3LU6TDj7ZSzhsG4c7WY99BNz1JNs5qxspdvtnx` (set-upgrade-authority `2kjKMqAr…vDoC`, from the throwaway deployer `F2GQY2ae…iDUQ`, which was then emptied back to the owner: `5B2aLCoE…pf7Jo`) |
| Protocol authority | the same wallet (`transfer_authority` `4ygdrDac…v3os`) |
| Protocol settings | version 2: target **50 SOL**, 24 h window, 60 min settlement timeout, creation fee **0** (opening 24 hours; the owner raises it to 0.1 SOL from `/admin`), fee recipient `jNdwn3…tnx`, 0.2 SOL minimum reserve, Raydium `CPMMoo8L…KP1C`, AmmConfig 0 `D4FPEruK…BvC2` (0.25% trade fee + 0.05% creator fee, see authority disclosure §5), fee receiver `DNXgeM9E…dNC8`. `initialize_protocol` `41qzemaW…dF13`, `update_settings` `2waGrwuD…Wbf3` |
| Dry run (real SOL) | launch `FQVMZyRi6bfDu2VQfEHVqcozkW1KnrauXVGRxwjhh7Uf`, mint `7C12E7hVBZ5aTNUysixPoKAPFWr5BomPqAWJsKjraFpF`, metadata `https://www.poplaunch.fun/dry-run/metadata.json`. Created under a temporary 10-minute window (`create_launch` `2nSbBCr5…4JhT`), backed with 0.01 SOL (`3EyYJZuC…aiuy`), expired (`5fdnKpi8…XzvZ`), refunded in full (`4enHrcgE…UUCF`), 0.2 SOL reserve reclaimed (`5X1uGF2h…zj5`). Permanent cost: about 0.025 SOL of account rent plus fees. The window was then set to 24 h before the authority transfer. |
| Keeper fee wallet | `A8xfbesTUdtTwfxdZrtNTs1J7iTzqDUxSQawrqGmdyPF`, 0.3 SOL |
| Backend | Railway project `poplaunch-mainnet`: `launchd` (Dockerfile build, `SOLANA_NETWORK=mainnet-beta`, Helius RPC, `SIGN_DOMAIN=poplaunch.fun`), Postgres 16 with a volume; `https://launchd-production-aff6.up.railway.app`. Indexed the dry run within one sync tick. |
| Website | Vercel project `poplaunch` at **https://www.poplaunch.fun** (mainnet env: `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta`, Helius browser RPC, backend above, `NEXT_PUBLIC_SIGN_DOMAIN=poplaunch.fun`, `NEXT_PUBLIC_FEELESS_UNTIL` = opening time + 24 h). Opened 21:10 UTC; `NEXT_PUBLIC_FEELESS_UNTIL=2026-10-06T21:25:00Z`. The spare project `pop-launch-devnet` (`pop-launch-devnet.vercel.app`) was used as a mainnet staging copy for the switch and then put back on devnet, so devnet stays testable there. |
| Deployment cost | 6.1 SOL funded by the owner: 2.89 SOL now sits in the program account as rent, 0.3 SOL went to the keeper, ~0.03 SOL to the dry run and fees, 2.87 SOL returned to the owner. |

Notes from the run: the program upload needed three attempts over Helius RPC (write-transaction retry limits and one
"internal error during preflight"); each resume continued from the same buffer, so nothing was paid twice.
Websocket subscriptions are not available from the build sandbox, so the cluster scripts confirm by polling
`getSignatureStatuses`. The dry-run token's immutable metadata URI points at the website; every coin created
through the site points at the backend's metadata endpoint instead, and nothing else on chain names the site.
