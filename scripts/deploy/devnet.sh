#!/usr/bin/env bash
# Deploy pop_market to devnet and bootstrap the protocol + genesis POP market with PILOT settings.
# Runs entirely inside the pinned Anchor Docker image. Requires network access to api.devnet.solana.com.
#
#   scripts/deploy/devnet.sh keygen     # create deployer + treasury keys (gitignored)
#   scripts/deploy/devnet.sh airdrop    # fund deployer from the devnet faucet (rate limited; repeat)
#   scripts/deploy/devnet.sh deploy     # anchor deploy (upgradeable, authority = deployer)
#   scripts/deploy/devnet.sh bootstrap  # initialize protocol, create + activate POP market (20 SOL seed), vesting, pages
#   scripts/deploy/devnet.sh verify     # print program/upgrade authority, mint authorities, vault balances
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${POP_ANCHOR_IMAGE:-solanafoundation/anchor:v1.0.2}"
KEYS="$ROOT/scripts/deploy/keys"
RPC="${DEVNET_RPC_URL:-https://api.devnet.solana.com}"
mkdir -p "$KEYS"
run() { docker run --rm --network host -v "$ROOT:/work" -w /work -e ANCHOR_PROVIDER_URL="$RPC" -e ANCHOR_WALLET=/work/scripts/deploy/keys/deployer.json "$IMAGE" bash -lc "$*"; }
case "${1:-}" in
  keygen)
    [ -f "$KEYS/deployer.json" ] || run "solana-keygen new --no-bip39-passphrase -s -o scripts/deploy/keys/deployer.json"
    [ -f "$KEYS/treasury.json" ] || run "solana-keygen new --no-bip39-passphrase -s -o scripts/deploy/keys/treasury.json"
    run "echo deployer \$(solana-keygen pubkey scripts/deploy/keys/deployer.json); echo treasury \$(solana-keygen pubkey scripts/deploy/keys/treasury.json)" ;;
  airdrop) run "solana airdrop 5 \$(solana-keygen pubkey scripts/deploy/keys/deployer.json) -u $RPC || true; solana balance \$(solana-keygen pubkey scripts/deploy/keys/deployer.json) -u $RPC" ;;
  deploy) run "anchor deploy --provider.cluster $RPC --provider.wallet /work/scripts/deploy/keys/deployer.json && solana program show \$(grep -oE 'pop_market = \"[^\"]+\"' Anchor.toml | head -1 | cut -d'\"' -f2) -u $RPC" ;;
  bootstrap) POP_RPC_URL="$RPC" POP_DEPLOYER="$KEYS/deployer.json" POP_TREASURY="$KEYS/treasury.json" pnpm --filter @pop/integration exec tsx src/bootstrap.ts ;;
  verify) POP_RPC_URL="$RPC" pnpm --filter @pop/integration exec tsx src/verify.ts ;;
  *) echo "usage: $0 keygen|airdrop|deploy|bootstrap|verify"; exit 1 ;;
esac
