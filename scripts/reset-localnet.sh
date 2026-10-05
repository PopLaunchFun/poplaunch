#!/usr/bin/env bash
# Fresh local environment: restart the validator with an empty ledger and clear the indexer DB
# (signatures from an old ledger are meaningless after a reset).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/localnet.sh" start
DB="${DATABASE_URL:-postgres://pop:pop@127.0.0.1:5432/pop}"
if command -v psql >/dev/null 2>&1; then
  psql "$DB" -q -c "DROP TABLE IF EXISTS indexer_cursor, events, trades, scars, markets, protocol CASCADE;" && echo "indexer database cleared"
else
  echo "psql not found; clear the indexer database manually (drop tables) before restarting the indexer"
fi
