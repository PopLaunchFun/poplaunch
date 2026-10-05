use anchor_lang::prelude::*;

/// Launch state machine. Stored as u8 in `Launch.state`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum LaunchState {
    /// Accept contributions while chain time < funding_deadline and raised < target.
    Funding = 0,
    /// Target reached atomically by the final contribution; no more deposits; settle before settlement_deadline.
    Ready = 1,
    /// Pool created, LP burned, claims enabled, all in one transaction.
    Live = 2,
    /// Funding deadline passed below target, or settlement deadline passed without settlement. Refunds open.
    Refundable = 3,
}

impl LaunchState {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::Funding),
            1 => Some(Self::Ready),
            2 => Some(Self::Live),
            3 => Some(Self::Refundable),
            _ => None,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum RefundReason {
    None = 0,
    MissedTarget = 1,
    SettlementTimeout = 2,
}

/// Versioned protocol settings. Copied into every launch at creation; changing them never alters an existing launch.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct LaunchSettings {
    /// Funding target in lamports (V1: 50 SOL).
    pub target_lamports: u64,
    /// Funding window in seconds from on-chain opening (V1: 24h).
    pub funding_window_secs: i64,
    /// Settlement timeout in seconds after the target is reached (V1: 60 minutes).
    pub settlement_timeout_secs: i64,
    /// Fixed total supply in base units (V1: 1,000,000,000 × 10^6).
    pub supply: u64,
    pub decimals: u8,
    /// Backer allocation in base units (V1: 500,000,000 tokens).
    pub backer_allocation: u64,
    /// Pool allocation in base units (V1: 500,000,000 tokens), paired with all target SOL.
    pub pool_allocation: u64,
    /// Platform creation fee in lamports, paid by the creator only when creation succeeds (V1: 0.1 SOL).
    pub creation_fee_lamports: u64,
    /// Minimum contribution in lamports (V1: 0.01 SOL); the exact final remainder may be smaller.
    pub min_contribution_lamports: u64,
    /// Minimum creator-funded setup reserve for pool/account costs.
    pub min_setup_reserve_lamports: u64,
    /// Receives the creation fee.
    pub fee_recipient: Pubkey,
    /// Approved external AMM program (Raydium CP-Swap) and its config; verified on every settlement.
    pub cp_swap_program: Pubkey,
    pub amm_config: Pubkey,
    /// Raydium's hardcoded pool-creation fee receiver token account.
    pub create_pool_fee_receiver: Pubkey,
    /// Quote mint (wrapped SOL).
    pub quote_mint: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    /// Blocks NEW launches only. Existing settlement, claims and refunds are never affected.
    pub paused: bool,
    /// Bumped on every settings change; launches record the version they were created under.
    pub version: u16,
    pub settings: LaunchSettings,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Launch {
    pub version: u16,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub state: u8,
    pub refund_reason: u8,
    // Immutable terms (copied from settings at opening)
    pub target_lamports: u64,
    pub supply: u64,
    pub decimals: u8,
    pub backer_allocation: u64,
    pub pool_allocation: u64,
    pub settlement_timeout_secs: i64,
    pub cp_swap_program: Pubkey,
    pub amm_config: Pubkey,
    pub create_pool_fee_receiver: Pubkey,
    pub quote_mint: Pubkey,
    pub creation_fee_paid: u64,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    /// Hash of the finalized off-chain metadata (image, description, links). Frozen at opening.
    pub metadata_hash: [u8; 32],
    // Timeline (unix seconds, chain time)
    pub opened_at: i64,
    pub funding_deadline: i64,
    pub filled_at: i64,
    pub settlement_deadline: i64,
    pub live_at: i64,
    // Accounting (recorded contributions decide everything; stray lamports never do)
    pub raised_lamports: u64,
    pub backer_wallets: u32,
    pub total_claimed: u64,
    pub total_refunded: u64,
    pub setup_reserve_funded: u64,
    pub setup_reserve_reclaimed: u64,
    // Settlement record
    pub pool_state: Pubkey,
    pub lp_mint: Pubkey,
    pub lp_burned: u64,
    pub settled_quote: u64,
    pub settled_base: u64,
    // Bumps
    pub bump: u8,
    pub auth_bump: u8,
    pub escrow_bump: u8,
    pub backer_vault_bump: u8,
    pub pool_vault_bump: u8,
}

/// Nontransferable accounting account keyed by launch and wallet. Multiple contributions update one receipt.
#[account]
#[derive(InitSpace)]
pub struct ContributionReceipt {
    pub launch: Pubkey,
    pub owner: Pubkey,
    pub contributed_lamports: u64,
    pub claimed_base_units: u64,
    pub refunded_lamports: u64,
    pub bump: u8,
}

impl Launch {
    pub fn state(&self) -> LaunchState {
        LaunchState::from_u8(self.state).unwrap_or(LaunchState::Refundable)
    }

    /// Entitlement = floor(contribution × backer_allocation / target), computed in u128. No float, no dust awarded.
    pub fn entitlement(&self, contributed_lamports: u64) -> u64 {
        if self.target_lamports == 0 {
            return 0;
        }
        let n = (contributed_lamports as u128) * (self.backer_allocation as u128);
        (n / (self.target_lamports as u128)) as u64
    }

    /// Lazily derived refundability: no keeper has to mark a launch expired.
    pub fn derive_refundable(&mut self, now: i64) -> bool {
        match self.state() {
            LaunchState::Funding if now >= self.funding_deadline && self.raised_lamports < self.target_lamports => {
                self.state = LaunchState::Refundable as u8;
                self.refund_reason = RefundReason::MissedTarget as u8;
                true
            }
            LaunchState::Ready if now >= self.settlement_deadline => {
                self.state = LaunchState::Refundable as u8;
                self.refund_reason = RefundReason::SettlementTimeout as u8;
                true
            }
            LaunchState::Refundable => true,
            _ => false,
        }
    }
}
