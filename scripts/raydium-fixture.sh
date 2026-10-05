#!/usr/bin/env bash
# Build the real Raydium CP-Swap program (github.com/raydium-io/raydium-cp-swap) as a localnet fixture.
# It uses the same Anchor 1.0.2 / Solana 3.1.10 toolchain as this repo. Its `localnet` feature lets a
# test admin create AmmConfig accounts; the program id stays the mainnet id CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C.
# The admin key is derived deterministically in tests from sha256("poplaunch-cpswap-localnet-admin"); no keypair file is stored.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${RAYDIUM_SRC:-$HOME/ext/raydium-cp-swap}"
IMAGE="${POP_ANCHOR_IMAGE:-solanafoundation/anchor:v1.0.2}"
ADMIN="${CPSWAP_LOCALNET_ADMIN:-FYUEYom2oZYEj7Mp8ndYQww2Pr86uJ35pB4YSAB1RorR}"
[ -d "$SRC" ] || git clone --depth 1 https://github.com/raydium-io/raydium-cp-swap "$SRC"
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(--network host -e "HTTPS_PROXY=$HTTPS_PROXY" -e "https_proxy=$HTTPS_PROXY"); fi
if [ -n "${CARGO_HTTP_CAINFO:-}" ]; then EXTRA+=(-v "$(dirname "$CARGO_HTTP_CAINFO"):/ccr:ro" -e "CARGO_HTTP_CAINFO=/ccr/$(basename "$CARGO_HTTP_CAINFO")" -e "SSL_CERT_FILE=/ccr/$(basename "$CARGO_HTTP_CAINFO")"); fi
docker run --rm "${EXTRA[@]}" -e "CPSWAP_LOCALNET_ADMIN=$ADMIN" -v "$SRC:/work" -v "${POP_CARGO_CACHE:-$HOME/.cargo-docker-registry}:/root/.cargo/registry" -w /work "$IMAGE" \
  bash -lc 'anchor build --ignore-keys -- --features localnet'
mkdir -p "$ROOT/tests/fixtures"
cp "$SRC/target/deploy/raydium_cp_swap.so" "$ROOT/tests/fixtures/raydium_cp_swap.so"
cp "$SRC/target/idl/raydium_cp_swap.json" "$ROOT/tests/fixtures/raydium_cp_swap.json"
cp "$SRC/target/types/raydium_cp_swap.ts" "$ROOT/tests/fixtures/raydium_cp_swap.ts"
echo "fixture: $ROOT/tests/fixtures/raydium_cp_swap.so (localnet admin $ADMIN)"
