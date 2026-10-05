use anchor_lang::prelude::*;

#[event]
pub struct LaunchCreated {
    pub launch: Pubkey,
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub version: u16,
    pub target_lamports: u64,
    pub opened_at: i64,
    pub funding_deadline: i64,
    pub creation_fee: u64,
    pub setup_reserve: u64,
}

#[event]
pub struct Contributed {
    pub launch: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub wallet_total: u64,
    pub raised: u64,
    pub backer_wallets: u32,
}

#[event]
pub struct TargetReached {
    pub launch: Pubkey,
    pub filled_at: i64,
    pub settlement_deadline: i64,
}

#[event]
pub struct LaunchLive {
    pub launch: Pubkey,
    pub pool_state: Pubkey,
    pub lp_mint: Pubkey,
    pub lp_burned: u64,
    pub quote_seeded: u64,
    pub base_seeded: u64,
    pub live_at: i64,
}

#[event]
pub struct LaunchRefundable {
    pub launch: Pubkey,
    pub reason: u8,
    pub at: i64,
}

#[event]
pub struct Claimed {
    pub launch: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub wallet_claimed_total: u64,
}

#[event]
pub struct Refunded {
    pub launch: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SetupReserveToppedUp {
    pub launch: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SetupReserveReclaimed {
    pub launch: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SettingsUpdated {
    pub authority: Pubkey,
    pub version: u16,
}

#[event]
pub struct PauseChanged {
    pub authority: Pubkey,
    pub paused: bool,
}

#[event]
pub struct AuthorityTransferred {
    pub previous: Pubkey,
    pub new_authority: Pubkey,
}
