#!/usr/bin/env bash
# Start a local Solana test validator with the pop_market program preloaded, using the pinned
# Anchor/Solana Docker image so no host toolchain is required.
#   scripts/localnet.sh start   # starts (or restarts) the validator in the background
#   scripts/localnet.sh stop
#   scripts/localnet.sh logs
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${POP_ANCHOR_IMAGE:-solanafoundation/anchor:v1.0.2}"
NAME="pop-localnet"
PROGRAM_ID="$(grep -oE 'pop_market = "[^"]+"' "$ROOT/Anchor.toml" | head -1 | cut -d'"' -f2)"
case "${1:-start}" in
  start)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    [ -f "$ROOT/target/deploy/pop_market.so" ] || { echo "build first: scripts/build-program.sh"; exit 1; }
    # Agave 3.x accounts-db requires io_uring, which Docker's default seccomp profile blocks.
    mkdir -p "$ROOT/.anchor/test-ledger"
    docker run -d --name "$NAME" --network host --security-opt seccomp=unconfined \
      -v "$ROOT:/work" -v "$ROOT/.anchor/test-ledger:/ledger" -w /work "$IMAGE" \
      solana-test-validator --reset --bind-address 127.0.0.1 --rpc-port 8899 --limit-ledger-size 100000000 \
      --ledger /ledger --bpf-program "$PROGRAM_ID" /work/target/deploy/pop_market.so >/dev/null
    echo "waiting for validator on http://127.0.0.1:8899 ..."
    for i in $(seq 1 60); do
      if curl -sS -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:8899 2>/dev/null | grep -q ok; then
        echo "validator ready (program $PROGRAM_ID)"; exit 0; fi
      sleep 1
    done
    echo "validator did not become healthy"; docker logs "$NAME" | tail -20; exit 1 ;;
  stop) docker rm -f "$NAME" >/dev/null 2>&1 && echo stopped ;;
  logs) docker logs -f "$NAME" ;;
  *) echo "usage: $0 start|stop|logs"; exit 1 ;;
esac
