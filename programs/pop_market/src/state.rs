use anchor_lang::prelude::*;

pub const BINS_PER_PAGE: usize = 16;
pub const MAX_BANDS: usize = 64;
pub const MAX_PAGES_PER_SWAP: usize = 4;
pub const MAX_FILLS: usize = 64;

pub const STATUS_CREATED: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_GRADUATED: u8 = 2;

pub const FEE_KIND_PROTOCOL: u8 = 0;
pub const FEE_KIND_CREATOR: u8 = 1;

pub const SEED_PROTOCOL: &[u8] = b"protocol";
pub const SEED_MARKET: &[u8] = b"market";
pub const SEED_PAGE: &[u8] = b"page";
pub const SEED_BUYBACK: &[u8] = b"buyback";
pub const SEED_VAULT_BASE: &[u8] = b"vault_base";
pub const SEED_VAULT_QUOTE: &[u8] = b"vault_quote";
pub const SEED_FEE_BASE: &[u8] = b"fee_base";
pub const SEED_FEE_QUOTE: &[u8] = b"fee_quote";

/// Factory defaults applied to markets created under this config version.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub struct FactorySettings {
    /// Minimum seed quote (WSOL atomic) a creator must lock per coin. The creator chooses the amount.
    pub min_seed_quote: u64,
    pub scar_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub creator_fee_bps: u16,
    pub buyback_share_bps: u16,
    pub maturity_quote_target: u64,
    pub band_quote_target: u64,
    pub bands_required: u16,
    pub min_quote_in: u64,
    pub min_base_in: u64,
    pub bin_min: i32,
    pub bin_max: i32,
    pub max_bins_per_swap: u8,
    pub band_size: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub version: u32,
    pub authority: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub buyback_authority: Pubkey,
    /// External $POP mint (launched outside this program). Settable once; buyback withdrawals
    /// are blocked until it is published.
    pub pop_mint: Pubkey,
    pub launches_enabled: bool,
    pub settings: FactorySettings,
    pub market_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub creator: Pubkey,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub fee_vault_base: Pubkey,
    pub fee_vault_quote: Pubkey,
    pub p0_x64: u128,
    pub bin_min: i32,
    pub bin_max: i32,
    pub bins_per_page: u8,
    pub band_size: u8,
    pub max_bins_per_swap: u8,
    pub cursor: i32,
    pub status: u8,
    pub config_version: u32,
    pub scar_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub creator_fee_bps: u16,
    pub buyback_share_bps: u16,
    pub maturity_quote_target: u64,
    pub band_quote_target: u64,
    pub bands_required: u16,
    pub min_quote_in: u64,
    pub min_base_in: u64,
    pub base_decimals: u8,
    pub seed_base_total: u64,
    pub seed_quote_total: u64,
    pub unmaterialized_seed_base: u64,
    pub unmaterialized_seed_quote: u64,
    pub paired_quote_lifetime: u64,
    pub hardened_bands: u16,
    pub band_paired_quote: [u64; MAX_BANDS],
    /// Bit i set when band (min_band + i) has crossed the band target.
    pub band_hardened_bits: u64,
    pub protocol_claimable_base: u64,
    pub protocol_claimable_quote: u64,
    pub creator_claimable_base: u64,
    pub creator_claimable_quote: u64,
    pub buyback_accrued_quote: u64,
    pub total_buy_volume_quote: u64,
    pub total_sell_volume_base: u64,
    pub swap_count: u64,
    pub created_at_slot: u64,
    pub activated_at_slot: u64,
    pub activated_at_ts: i64,
    pub graduated_at_slot: u64,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    pub bump: u8,
}

impl Market {
    pub fn min_band(&self) -> i32 {
        crate::math::floor_div(self.bin_min, self.band_size as i32)
    }
    pub fn band_slot(&self, bin: i32) -> usize {
        (crate::math::floor_div(bin, self.band_size as i32) - self.min_band()) as usize
    }
    pub fn band_index(&self, bin: i32) -> i32 {
        crate::math::floor_div(bin, self.band_size as i32)
    }
    pub fn page_index(&self, bin: i32) -> i32 {
        crate::math::floor_div(bin, self.bins_per_page as i32)
    }
    pub fn min_page(&self) -> i32 {
        self.page_index(self.bin_min)
    }
    pub fn max_page(&self) -> i32 {
        self.page_index(self.bin_max)
    }
    pub fn in_range(&self, bin: i32) -> bool {
        bin >= self.bin_min && bin <= self.bin_max
    }

    /// Fixed seed schedule (identical to packages/math `seedAllocationForBin`).
    pub fn seed_allocation_for_bin(&self, bin: i32) -> (u64, u64) {
        if !self.in_range(bin) {
            return (0, 0);
        }
        if bin < 0 {
            let n = (-self.bin_min) as u64;
            let per = self.seed_quote_total / n;
            let rem = self.seed_quote_total % n;
            let pos = (bin - self.bin_min) as u64;
            (0, per + if pos < rem { 1 } else { 0 })
        } else {
            let n = (self.bin_max as u64) + 1;
            let per = self.seed_base_total / n;
            let rem = self.seed_base_total % n;
            let pos = bin as u64;
            (per + if pos < rem { 1 } else { 0 }, 0)
        }
    }
}

#[zero_copy]
#[repr(C)]
#[derive(Default, Debug)]
pub struct Bin {
    pub seed_base: u64,
    pub seed_quote: u64,
    pub scar_base: u64,
    pub scar_quote: u64,
    pub pending_base_eligible: u64,
    pub pending_quote_eligible: u64,
    pub buy_volume_quote: u64,
    pub sell_volume_base: u64,
    pub paired_quote_lifetime: u64,
    pub last_execution_slot: u64,
}

impl Bin {
    pub fn available_base(&self) -> u64 {
        self.seed_base + self.scar_base
    }
    pub fn available_quote(&self) -> u64 {
        self.seed_quote + self.scar_quote
    }
}

#[account(zero_copy)]
#[repr(C)]
pub struct BinPage {
    pub market: Pubkey,
    pub page_index: i32,
    pub bump: u8,
    pub _pad: [u8; 3],
    pub bins: [Bin; BINS_PER_PAGE],
}

impl BinPage {
    pub const LEN: usize = 8 + 32 + 4 + 1 + 3 + 80 * BINS_PER_PAGE;
    pub fn first_bin(&self) -> i32 {
        self.page_index * BINS_PER_PAGE as i32
    }
}

#[account]
#[derive(InitSpace)]
pub struct BuybackVault {
    /// Keeper/multisig allowed to withdraw bounded amounts to its own WSOL ATA for off-program execution.
    pub authority: Pubkey,
    pub quote_account: Pubkey,
    pub total_received: u64,
    pub total_withdrawn: u64,
    pub last_withdrawal_slot: u64,
    pub min_interval_slots: u64,
    pub max_withdraw_per_execution: u64,
    pub withdrawal_count: u64,
    pub bump: u8,
}
