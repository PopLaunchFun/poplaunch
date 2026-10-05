#!/usr/bin/env bash
# Build Metaplex Token Metadata (github.com/metaplex-foundation/mpl-token-metadata, program crate pinned to
# solana-program < 1.17) as a localnet fixture with the same Anchor/Solana Docker image this repo uses.
# Three crates in its lockfile predate the current Rust toolchain and are bumped to their fixed patch
# releases; nothing else changes. The program id stays metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${METAPLEX_SRC:-$HOME/ext/mpl-token-metadata}"
IMAGE="${POP_ANCHOR_IMAGE:-solanafoundation/anchor:v1.0.2}"
[ -d "$SRC" ] || git clone --depth 1 https://github.com/metaplex-foundation/mpl-token-metadata "$SRC"
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(--network host -e "HTTPS_PROXY=$HTTPS_PROXY" -e "https_proxy=$HTTPS_PROXY"); fi
if [ -n "${CARGO_HTTP_CAINFO:-}" ]; then EXTRA+=(-v "$(dirname "$CARGO_HTTP_CAINFO"):/ccr:ro" -e "CARGO_HTTP_CAINFO=/ccr/$(basename "$CARGO_HTTP_CAINFO")" -e "SSL_CERT_FILE=/ccr/$(basename "$CARGO_HTTP_CAINFO")"); fi
docker run --rm "${EXTRA[@]}" -v "$SRC:/work" -v "${POP_CARGO_CACHE:-$HOME/.cargo-docker-registry}:/root/.cargo/registry" -w /work/programs/token-metadata/program "$IMAGE" \
  bash -lc 'cargo update -p ahash@0.8.3 --precise 0.8.11 || true; cargo update -p ahash@0.7.6 --precise 0.7.8 || true; cargo update -p syn@2.0.31 --precise 2.0.60 || true; cargo update -p wasm-bindgen --precise 0.2.92 || true; cargo build-sbf'
mkdir -p "$ROOT/tests/fixtures"
cp "$SRC/programs/token-metadata/target/deploy/token_metadata.so" "$ROOT/tests/fixtures/mpl_token_metadata.so"
echo "fixture: $ROOT/tests/fixtures/mpl_token_metadata.so"
