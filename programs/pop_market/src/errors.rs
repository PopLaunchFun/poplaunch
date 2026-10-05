use anchor_lang::prelude::*;

#[error_code]
pub enum PopError {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid market configuration")]
    InvalidConfig,
    #[msg("Reference price too small to represent (p0_x64 < 2^32)")]
    PriceTooSmall,
    #[msg("Price table overflow or zero price at range extreme")]
    PriceRange,
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market is not in the created state")]
    MarketNotCreated,
    #[msg("Market is already active")]
    MarketAlreadyActive,
    #[msg("Gross input below configured minimum")]
    InputBelowMinimum,
    #[msg("Tradable input is zero after fees")]
    ZeroTradable,
    #[msg("Traversal limit reached before input was filled")]
    TraversalLimit,
    #[msg("Buy-side token inventory exhausted at the range limit")]
    BuyInventoryExhausted,
    #[msg("Sell-side quote inventory exhausted at the range limit")]
    SellInventoryExhausted,
    #[msg("Required bin page account was not provided")]
    PageNotProvided,
    #[msg("Bin page is not initialized")]
    PageNotInitialized,
    #[msg("Bin page does not belong to this market or has an invalid address")]
    InvalidPage,
    #[msg("Page index out of range")]
    PageOutOfRange,
    #[msg("Output below min_output")]
    OutputBelowMinimum,
    #[msg("Deadline slot passed")]
    DeadlinePassed,
    #[msg("Config version mismatch")]
    ConfigVersionMismatch,
    #[msg("No executable fill")]
    NoExecutableFill,
    #[msg("Seed schedule exceeds unmaterialized balance")]
    SeedExceeded,
    #[msg("Quote mint must be canonical wrapped SOL")]
    InvalidQuoteMint,
    #[msg("Invalid vault account")]
    InvalidVault,
    #[msg("Invalid token account owner or mint")]
    InvalidTokenAccount,
    #[msg("Token account has a delegate or close authority; rejected")]
    TokenAccountDelegated,
    #[msg("Mint has an authority that must be absent")]
    MintAuthorityPresent,
    #[msg("Mint supply does not equal the committed allocation")]
    SupplyMismatch,
    #[msg("Seed quote not funded")]
    SeedQuoteNotFunded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("New market creation is disabled")]
    LaunchesDisabled,
    #[msg("Nothing claimable")]
    NothingToClaim,
    #[msg("Buyback withdrawal exceeds cap or realized funds")]
    BuybackWithdrawCap,
    #[msg("Seed quote below the factory minimum")]
    SeedQuoteBelowMinimum,
    #[msg("POP mint already published")]
    PopMintAlreadySet,
    #[msg("POP mint not published yet")]
    PopMintNotSet,
    #[msg("Buyback interval not elapsed")]
    BuybackInterval,
    #[msg("Invalid metadata string")]
    InvalidMetadata,
    #[msg("Invalid fee claim destination")]
    InvalidClaimDestination,
    #[msg("Bin inventory invariant violated")]
    Invariant,
}
