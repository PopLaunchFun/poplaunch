# Pop Launch operations runbook

## Services

| Service | Process | Health |
|---|---|---|
| Web app | `apps/poplaunch` (Next.js) | `GET /` returns 200 |
| launchd | `services/launchd` (Hono + pg) | `GET /api/status` (see below) |
| Postgres | managed instance | `pg_isready` |
| RPC | provider URL in `RPC_URL` | `getSlot` under 2 s |

`GET /api/status` returns, among other fields:

| Field | Meaning | Alert when |
|---|---|---|
| `rpcOk` | the RPC answered `getSlot` | false for 2 minutes |
| `lagSlots` | chain slot minus last scanned slot | > 150 (about 1 minute) for 5 minutes |
| `scanUpdatedAt` | last successful scan | older than 60 s |
| `keeper.balanceSol` | keeper fee wallet balance | < `keeper.minBalanceSol` (default 0.2) |
| `keeper.readyLaunches` | launches filled and not yet settled | any entry older than 5 minutes |
| `keeper.failedAttempts15m` | failed `finalize_launch` sends in the last 15 minutes | ≥ 3 |
| `keeper.lastSuccessAt` | last confirmed settlement | informational |
| `alerts` | list of the conditions above that currently hold | non-empty |

launchd also logs one line per alert transition (`ALERT raised …` / `ALERT cleared …`) so a log-based
monitor (Grafana Loki, Datadog, Papertrail) can page on the word `ALERT`.

## Standard responses

**Keeper balance low.** Send SOL to the keeper address shown in `/api/status`. Nothing is at risk while
it is empty: backers can settle from the launch page, and unsettled launches refund after 60 minutes.

**A launch is READY and not settling.** Read its attempts at `/api/launches/:mint` → `settlementAttempts`.
- `insufficient setup reserve`: anyone can call `top_up_setup_reserve`; the UI shows the shortfall. The
  creator is expected to top up; the operator may choose to.
- Raydium error (pool creation disabled, config changed): verify addresses (`verify:addresses`). If Raydium
  has disabled pool creation on the config, the launch will time out and refund; announce it. Nothing can
  or should force it.
- RPC errors: switch `RPC_URL` to the fallback provider and restart launchd.

**Index lag or RPC down.** The web app shows "index behind" / "index unreachable" and reads launch pages
from the chain directly. Backing is disabled while the remaining amount cannot be refreshed; refunds and
claims keep working. Fix the RPC or database, restart launchd; the scanner rebuilds from the chain.

**Database lost.** Create a new database, run `schema.sql`, start launchd. Launches and receipts are
re-scanned from the chain within one scan; events are re-walked from the program's signature history.
Only uploaded images and draft metadata are not on chain: restore them from the object-store backup
(`images` table is backed up nightly in production).

**Abuse (illegal image, impersonation).** `DELETE` the row from `images` and set `drafts.hidden = true`
(both administrative SQL; there is no API for this on purpose). The on-chain launch continues; the page
renders a placeholder image and the on-chain name/symbol.

**Pause new launches.** `set_paused(true)` from the protocol authority multisig. Existing launches are not
affected. Use for an active incident only, and announce it.

## Release

See `docs/deployment-poplaunch.md`, section "Release checklist".
