#!/usr/bin/env bash
# Deploy (or upgrade) pop_launch on a public cluster with the pinned Solana CLI from the Anchor image.
#   RPC_URL=https://... DEPLOYER_KEYPAIR=~/.config/poplaunch/devnet-deployer.json scripts/deploy-program.sh
# The program keypair (scripts/deploy/keys/pop_launch-keypair.json, gitignored) fixes the program id
# Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy. First deployment makes the deployer the upgrade authority;
# on mainnet transfer it to the multisig right after (docs/authority-disclosure.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${POP_ANCHOR_IMAGE:-solanafoundation/anchor:v1.0.2}"
: "${RPC_URL:?RPC_URL required}"
: "${DEPLOYER_KEYPAIR:?DEPLOYER_KEYPAIR required}"
DEPLOYER_KEYPAIR="${DEPLOYER_KEYPAIR/#\~/$HOME}"
[ -f "$ROOT/target/deploy/pop_launch.so" ] || { echo "build first: scripts/build-program.sh"; exit 1; }
[ -f "$ROOT/scripts/deploy/keys/pop_launch-keypair.json" ] || { echo "missing program keypair"; exit 1; }
EXTRA=(--network host)
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(-e "HTTPS_PROXY=$HTTPS_PROXY" -e "https_proxy=$HTTPS_PROXY"); fi
# Inside an egress proxy the Rust clients (HTTP and websocket) must trust the proxy's CA: rustls honours SSL_CERT_FILE.
CA="${CARGO_HTTP_CAINFO:-${SSL_CERT_FILE:-/root/.ccr/ca-bundle.crt}}"
if [ -f "$CA" ]; then EXTRA+=(-v "$(dirname "$CA"):/ccr:ro" -e "SSL_CERT_FILE=/ccr/$(basename "$CA")" -e "SSL_CERT_DIR=/ccr"); fi
docker run --rm "${EXTRA[@]}" -v "$ROOT:/work" -v "$DEPLOYER_KEYPAIR:/keys/deployer.json:ro" -w /work "$IMAGE" bash -lc "
  set -e
  solana config set --url '$RPC_URL' --keypair /keys/deployer.json >/dev/null
  echo deployer \$(solana address) balance \$(solana balance)
  solana program deploy --use-rpc --program-id scripts/deploy/keys/pop_launch-keypair.json --upgrade-authority /keys/deployer.json ${DEPLOY_EXTRA:-} target/deploy/pop_launch.so
  solana program show Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy
  echo balance after \$(solana balance)
"
