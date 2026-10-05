use anchor_lang::prelude::*;

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub version: u32,
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub base_mint: Pubkey,
    pub creator: Pubkey,
    pub seed_base: u64,
    pub seed_quote: u64,
    pub p0_x64: u128,
    pub config_version: u32,
}

#[event]
pub struct MarketActivated {
    pub market: Pubkey,
    pub slot: u64,
    pub unix_ts: i64,
    pub supply: u64,
}

#[event]
pub struct PageInitialized {
    pub market: Pubkey,
    pub page_index: i32,
    pub seed_base: u64,
    pub seed_quote: u64,
    pub payer: Pubkey,
}

#[event]
pub struct SwapExecuted {
    pub market: Pubkey,
    pub user: Pubkey,
    pub is_buy: bool,
    pub gross_input: u64,
    pub output: u64,
    pub scar_fee: u64,
    pub protocol_fee: u64,
    pub creator_fee: u64,
    pub bins_inspected: u8,
    pub start_bin: i32,
    pub end_bin: i32,
    pub slot: u64,
}

#[event]
pub struct ScarFormed {
    pub market: Pubkey,
    pub bin_id: i32,
    pub base: u64,
    pub quote: u64,
    pub bin_paired_quote_lifetime: u64,
    pub market_paired_quote_lifetime: u64,
}

#[event]
pub struct BandHardened {
    pub market: Pubkey,
    pub band: i32,
    pub paired_quote: u64,
    pub hardened_bands: u16,
}

#[event]
pub struct Graduated {
    pub market: Pubkey,
    pub paired_quote_lifetime: u64,
    pub hardened_bands: u16,
    pub slot: u64,
}

#[event]
pub struct FeesClaimed {
    pub market: Pubkey,
    pub kind: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub recipient: Pubkey,
}

#[event]
pub struct BuybackSwept {
    pub market: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BuybackWithdrawn {
    pub amount: u64,
    pub destination: Pubkey,
    pub pop_mint: Pubkey,
    pub authority: Pubkey,
    pub slot: u64,
}

#[event]
pub struct PopMintSet {
    pub pop_mint: Pubkey,
}

#[event]
pub struct LaunchesToggled {
    pub enabled: bool,
}
