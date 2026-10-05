use anchor_lang::prelude::*;

#[error_code]
pub enum LaunchError {
    #[msg("Invalid protocol settings")]
    InvalidSettings,
    #[msg("New launches are paused")]
    Paused,
    #[msg("Invalid name, symbol or uri")]
    InvalidMetadata,
    #[msg("Setup reserve below the required minimum")]
    SetupReserveTooLow,
    #[msg("Fee recipient does not match protocol settings")]
    InvalidFeeRecipient,
    #[msg("Launch is not accepting contributions")]
    NotFunding,
    #[msg("Funding window has closed")]
    FundingClosed,
    #[msg("Contribution must be positive")]
    ZeroAmount,
    #[msg("Contribution exceeds the remaining target; nothing was taken")]
    ExceedsRemaining,
    #[msg("Contribution below the minimum (unless it is the exact remainder)")]
    BelowMinimum,
    #[msg("Launch is not ready for settlement")]
    NotReady,
    #[msg("Settlement deadline has passed; the launch is refundable")]
    SettlementExpired,
    #[msg("Launch is not live")]
    NotLive,
    #[msg("Launch is not refundable")]
    NotRefundable,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Nothing to refund")]
    NothingToRefund,
    #[msg("Wrong DEX program or configuration")]
    WrongDex,
    #[msg("Derived DEX account does not match")]
    WrongDexAccount,
    #[msg("Wrong associated token account")]
    WrongAta,
    #[msg("Escrow balance below recorded obligations")]
    EscrowShort,
    #[msg("Pool vault does not hold the full pool allocation")]
    PoolVaultShort,
    #[msg("Pool reserves after seeding do not match the launch terms")]
    ReserveMismatch,
    #[msg("LP tokens were not fully burned")]
    LpNotBurned,
    #[msg("Only the creator may do this")]
    NotCreator,
    #[msg("Setup reserve can only be reclaimed after the launch is live or refundable")]
    ReserveLocked,
    #[msg("Arithmetic overflow")]
    Overflow,
}
