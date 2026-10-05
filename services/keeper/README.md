# POP buyback keeper

The on-chain program only escrows: every coin's market earmarks 50% of its SOL protocol fee, anyone can sweep it into the protocol buyback vault, and the buyback authority can withdraw bounded amounts to **its own** wrapped-SOL account (cap per execution, minimum interval, POP mint published first). Buying and burning the externally launched POP token happens here, off-program.

## Atomic mode (mainnet, Jupiter available)

One versioned transaction:

1. compute budget
2. idempotent ATAs for WSOL and POP owned by the authority
3. `withdraw_buyback_funds(amount)` (program instruction, authority signs)
4. Jupiter swap instructions (`/quote` + `/swap-instructions`, input WSOL, output the published POP mint, `wrapAndUnwrapSol=false`, destination = the authority's POP ATA, address lookup tables resolved)
5. SPL `burn(priorPopBalance + quote.otherAmountThreshold)` from the POP ATA

If the swap or the burn fails, the withdrawal never lands. The burn amount is the previous POP balance plus the quote's minimum-out; any surplus above min-out stays in the keeper's POP ATA and is burned on the next run (carry-forward). The indexer watches that ATA for SPL burns and shows, per withdrawal, whether a burn happened in the same transaction.

```sh
cp .env.example .env            # fill KEEPER_KEYPAIR, RPC_URL
pnpm --filter @pop/keeper start -- status
pnpm --filter @pop/keeper start -- atomic --amount 500000000 --dry-run   # prints instructions + simulation
pnpm --filter @pop/keeper start -- atomic --amount 500000000
```

## Manual mode (devnet/localnet, no Jupiter)

Non-atomic and clearly labeled: `manual-withdraw --amount N` moves funds to the authority's WSOL ATA; the operator buys POP on whatever venue exists and runs `manual-burn --amount M` to burn from the authority's POP ATA. The indexer shows the withdrawal as "burn pending" until a burn on that ATA is observed. Use this only where Jupiter does not exist.

## Policy

The keeper never chooses a recipient or a mint: the destination is constrained on-chain to `ATA(WSOL, authority)` and the burn targets `ProtocolConfig.pop_mint`. There is no reference-price oracle on-chain; slippage protection is Jupiter's `otherAmountThreshold` with `SLIPPAGE_BPS`. Automatic scheduling stays disabled; runs are operator-initiated and public.
