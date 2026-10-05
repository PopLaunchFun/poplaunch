#!/usr/bin/env bash
# Build the pop_market program and IDL inside the pinned Anchor Docker image.
# Requires: docker. Honors HTTPS_PROXY / CARGO_HTTP_CAINFO if set (CI proxies).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${POP_ANCHOR_IMAGE:-solanafoundation/anchor:v1.0.2}"
mkdir -p "$ROOT/target/deploy"
if [ -f "$ROOT/scripts/deploy/keys/pop_market-keypair.json" ] && [ ! -f "$ROOT/target/deploy/pop_market-keypair.json" ]; then
  cp "$ROOT/scripts/deploy/keys/pop_market-keypair.json" "$ROOT/target/deploy/pop_market-keypair.json"
fi
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(--network host -e "HTTPS_PROXY=$HTTPS_PROXY" -e "https_proxy=$HTTPS_PROXY"); fi
if [ -n "${CARGO_HTTP_CAINFO:-}" ]; then EXTRA+=(-v "$(dirname "$CARGO_HTTP_CAINFO"):/ccr:ro" -e "CARGO_HTTP_CAINFO=/ccr/$(basename "$CARGO_HTTP_CAINFO")" -e "SSL_CERT_FILE=/ccr/$(basename "$CARGO_HTTP_CAINFO")"); fi
docker run --rm "${EXTRA[@]}" -v "$ROOT:/work" -v "${POP_CARGO_CACHE:-$HOME/.cargo-docker-registry}:/root/.cargo/registry" -w /work "$IMAGE" \
  bash -lc 'anchor build && anchor keys list'
cp "$ROOT/target/idl/pop_market.json" "$ROOT/packages/sdk/src/idl/pop_market.json"
cp "$ROOT/target/types/pop_market.ts" "$ROOT/packages/sdk/src/idl/pop_market.ts"
echo "program: $ROOT/target/deploy/pop_market.so"
