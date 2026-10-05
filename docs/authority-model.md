# Authority model

## What the program can never do

There is no instruction that withdraws, relocates or confiscates seed, scar or pending-fee custody. The only outflows from the locked vaults are swap outputs priced by the bin table. Fee claims move only `protocol_claimable_*` / `creator_claimable_*` from the segregated fee vaults to the published recipient; the destination token account's owner is enforced on-chain, so the cranker cannot redirect funds. No post-activation fee changes exist. No reserve recovery. No market-level administrator veto on trading.

## Remaining powers

| Power | Holder | Scope |
|---|---|---|
| Program upgrade authority | deployer key (devnet) / multisig (mainnet candidate) | can replace the program and therefore add withdrawals; this is the material custody risk until revoked |
| Factory authority (`ProtocolConfig.authority`) | operator | create the genesis POP market, toggle `launches_enabled` for new markets; nothing on existing markets |
| Buyback authority | operator / multisig | execute bounded buybacks within policy; cannot change recipients or mints |
| Protocol fee recipient | fixed at init | receives protocol claims; immutable in v1 |
| Creator | per market, immutable | receives creator claims |
| Vesting beneficiary | per schedule, immutable | claims vested POP only |

`ProtocolConfig.version` is copied into each market at creation; swaps carry `expected_config_version`. Changing factory settings for future markets requires a new config version (not implemented in v1: settings are fixed at init; a new deployment or an added instruction would be a disclosed change).

## Custody labels

- Devnet: upgradeable program. Label: **upgradeable / single-key**.
- Mainnet candidate: label **upgradeable / multisig-controlled** until (1) independent review, (2) verified build matches source, (3) explicit `solana program set-upgrade-authority --final`. Only after that may custody be described as immutable.
- A PDA alone does not make funds permanently locked. Token mint-authority revocation (done per market at activation) is separate from program upgrade-authority revocation.

`/status` reads the program account on every load and shows the actual upgrade authority.

## Incident response limits

Once the upgrade authority is revoked, bugs cannot be patched: funds in locked vaults follow the deployed code forever. Before revocation the operator can upgrade, which is also the risk. Pause controls exist only for new market creation. Users should treat markets on an upgradeable program as trusting the authority holder.
