//! POP / Proof of Pain market program.
//!
//! A discrete constant-price-bin AMM where trading fees fund nonwithdrawable "scar" liquidity at
//! the price bins where trading occurred. There is NO instruction that withdraws, relocates or
//! confiscates seed, scar or pending-fee custody. The only custody powers that remain are the
//! program upgrade authority (see docs/authority-model.md) and the fee claims to published
//! recipients.
#![allow(clippy::too_many_arguments)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, spl_token, Burn, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;
pub mod math;
pub mod state;
pub mod swap_core;

use errors::PopError;
use events::*;
use state::*;

declare_id!("6pTC8K5PtUKGpQdHZoEsu26qLEehFDh2m1BLKRndNggx");

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeProtocolArgs {
    pub authority: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub buyback_authority: Pubkey,
    pub settings: FactorySettings,
    pub buyback_min_interval_slots: u64,
    pub buyback_max_spend_per_execution: u64,
    pub launches_enabled: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub seed_base: u64,
    pub decimals: u8,
    pub is_pop_market: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateVestingArgs {
    pub index: u8,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub start_offset: i64,
    pub cliff_offset: i64,
    pub end_offset: i64,
    pub label: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct SwapArgs {
    pub is_buy: bool,
    pub gross_input: u64,
    pub min_output: u64,
    pub deadline_slot: u64,
    pub expected_config_version: u32,
}

fn validate_settings(s: &FactorySettings) -> Result<()> {
    require!(s.bin_min < 0 && s.bin_max > 0, PopError::InvalidConfig);
    require!(s.bin_min >= -(math::MAX_DOWN_EXPONENT) && s.bin_max <= math::MAX_UP_EXPONENT, PopError::InvalidConfig);
    require!(s.band_size > 0 && s.max_bins_per_swap > 0 && (s.max_bins_per_swap as usize) <= MAX_FILLS, PopError::InvalidConfig);
    let bands = math::floor_div(s.bin_max, s.band_size as i32) - math::floor_div(s.bin_min, s.band_size as i32) + 1;
    require!(bands > 0 && (bands as usize) <= MAX_BANDS, PopError::InvalidConfig);
    require!((s.scar_fee_bps as u32 + s.protocol_fee_bps as u32 + s.creator_fee_bps as u32) < 10_000, PopError::InvalidConfig);
    require!(s.buyback_share_bps <= 10_000 && s.max_genesis_allocation_bps <= 10_000, PopError::InvalidConfig);
    require!(s.seed_quote > 0 && s.bands_required > 0, PopError::InvalidConfig);
    Ok(())
}

fn validate_str(s: &str, max: usize) -> Result<()> {
    require!(!s.is_empty() && s.len() <= max, PopError::InvalidMetadata);
    require!(s.chars().all(|c| !c.is_control()), PopError::InvalidMetadata);
    Ok(())
}

#[program]
pub mod pop_market {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, args: InitializeProtocolArgs) -> Result<()> {
        validate_settings(&args.settings)?;
        let cfg = &mut ctx.accounts.protocol_config;
        cfg.version = 1;
        cfg.authority = args.authority;
        cfg.protocol_fee_recipient = args.protocol_fee_recipient;
        cfg.buyback_authority = args.buyback_authority;
        cfg.pop_mint = Pubkey::default();
        cfg.pop_market = Pubkey::default();
        cfg.launches_enabled = args.launches_enabled;
        cfg.settings = args.settings;
        cfg.market_count = 0;
        cfg.bump = ctx.bumps.protocol_config;
        let bb = &mut ctx.accounts.buyback_vault;
        bb.authority = args.buyback_authority;
        bb.quote_account = ctx.accounts.buyback_quote_account.key();
        bb.pop_account = Pubkey::default();
        bb.min_interval_slots = args.buyback_min_interval_slots;
        bb.max_spend_per_execution = args.buyback_max_spend_per_execution;
        bb.bump = ctx.bumps.buyback_vault;
        emit!(ProtocolInitialized { authority: args.authority, version: 1 });
        Ok(())
    }

    pub fn set_launches_enabled(ctx: Context<AdminOnly>, enabled: bool) -> Result<()> {
        ctx.accounts.protocol_config.launches_enabled = enabled;
        emit!(LaunchesToggled { enabled });
        Ok(())
    }

    /// Create a market and its fixed-supply mint. Mints exactly `seed_base` into the locked base
    /// vault. Mint authority stays with the market PDA until activation (to allow genesis
    /// vesting allocations) and is then revoked. No freeze authority is ever set.
    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        validate_str(&args.name, 32)?;
        validate_str(&args.symbol, 10)?;
        validate_str(&args.uri, 200)?;
        let cfg = &mut ctx.accounts.protocol_config;
        let s = cfg.settings;
        if args.is_pop_market {
            require_keys_eq!(ctx.accounts.creator.key(), cfg.authority, PopError::Unauthorized);
            require!(cfg.pop_mint == Pubkey::default(), PopError::GenesisExists);
        } else {
            require!(cfg.launches_enabled, PopError::LaunchesDisabled);
        }
        require!(args.seed_base > 0, PopError::InvalidConfig);
        let p0 = math::quantize_p0(s.seed_quote, args.seed_base).ok_or(PopError::PriceTooSmall)?;
        math::price_at_bin(p0, s.bin_min).ok_or(PopError::PriceRange)?;
        math::price_at_bin(p0, s.bin_max).ok_or(PopError::PriceRange)?;

        let m = &mut ctx.accounts.market;
        m.base_mint = ctx.accounts.base_mint.key();
        m.quote_mint = ctx.accounts.quote_mint.key();
        m.creator = ctx.accounts.creator.key();
        m.base_vault = ctx.accounts.base_vault.key();
        m.quote_vault = ctx.accounts.quote_vault.key();
        m.fee_vault_base = ctx.accounts.fee_vault_base.key();
        m.fee_vault_quote = ctx.accounts.fee_vault_quote.key();
        m.p0_x64 = p0;
        m.bin_min = s.bin_min;
        m.bin_max = s.bin_max;
        m.bins_per_page = BINS_PER_PAGE as u8;
        m.band_size = s.band_size;
        m.max_bins_per_swap = s.max_bins_per_swap;
        m.cursor = 0;
        m.status = STATUS_CREATED;
        m.is_pop_market = args.is_pop_market;
        m.config_version = cfg.version;
        m.scar_fee_bps = s.scar_fee_bps;
        m.protocol_fee_bps = s.protocol_fee_bps;
        m.creator_fee_bps = s.creator_fee_bps;
        m.buyback_share_bps = s.buyback_share_bps;
        m.maturity_quote_target = s.maturity_quote_target;
        m.band_quote_target = s.band_quote_target;
        m.bands_required = s.bands_required;
        m.min_quote_in = s.min_quote_in;
        m.min_base_in = s.min_base_in;
        m.base_decimals = args.decimals;
        m.seed_base_total = args.seed_base;
        m.seed_quote_total = s.seed_quote;
        m.unmaterialized_seed_base = args.seed_base;
        m.unmaterialized_seed_quote = s.seed_quote;
        m.created_at_slot = Clock::get()?.slot;
        m.name = args.name;
        m.symbol = args.symbol;
        m.uri = args.uri;
        m.bump = ctx.bumps.market;

        let mint_key = ctx.accounts.base_mint.key();
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[m.bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.base_mint.to_account_info(),
                    to: ctx.accounts.base_vault.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            args.seed_base,
        )?;

        if args.is_pop_market {
            cfg.pop_mint = mint_key;
            cfg.pop_market = ctx.accounts.market.key();
        }
        cfg.market_count += 1;
        emit!(MarketCreated {
            market: ctx.accounts.market.key(),
            base_mint: mint_key,
            creator: ctx.accounts.creator.key(),
            seed_base: args.seed_base,
            seed_quote: s.seed_quote,
            p0_x64: p0,
            is_pop_market: args.is_pop_market,
            config_version: cfg.version,
        });
        Ok(())
    }

    /// Genesis-only published vesting allocation (founder / ecosystem). Mints into an on-chain
    /// vesting vault before activation. Bounded by `max_genesis_allocation_bps` of total supply.
    pub fn create_vesting(ctx: Context<CreateVesting>, args: CreateVestingArgs) -> Result<()> {
        validate_str(&args.label, 32)?;
        let m = &mut ctx.accounts.market;
        require!(m.status == STATUS_CREATED, PopError::MarketNotCreated);
        require!(m.is_pop_market, PopError::VestingNotAllowed);
        require!(args.amount > 0, PopError::InvalidConfig);
        require!(
            args.start_offset >= 0 && args.cliff_offset >= args.start_offset && args.end_offset > args.start_offset && args.end_offset >= args.cliff_offset,
            PopError::InvalidVestingSchedule
        );
        let new_alloc = m.allocated_supply.checked_add(args.amount).ok_or(PopError::Overflow)?;
        let total_supply = (m.seed_base_total as u128) + (new_alloc as u128);
        let max_bps = ctx.accounts.protocol_config.settings.max_genesis_allocation_bps as u128;
        require!((new_alloc as u128) * 10_000 <= max_bps * total_supply, PopError::AllocationTooLarge);
        m.allocated_supply = new_alloc;
        m.vesting_count += 1;

        let v = &mut ctx.accounts.vesting;
        v.market = m.key();
        v.mint = m.base_mint;
        v.beneficiary = args.beneficiary;
        v.vault = ctx.accounts.vesting_vault.key();
        v.index = args.index;
        v.total = args.amount;
        v.claimed = 0;
        v.start_offset = args.start_offset;
        v.cliff_offset = args.cliff_offset;
        v.end_offset = args.end_offset;
        v.label = args.label;
        v.bump = ctx.bumps.vesting;

        let mint_key = m.base_mint;
        let bump = m.bump;
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.base_mint.to_account_info(),
                    to: ctx.accounts.vesting_vault.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            args.amount,
        )?;
        emit!(VestingCreated {
            market: ctx.accounts.market.key(),
            vesting: ctx.accounts.vesting.key(),
            beneficiary: args.beneficiary,
            amount: args.amount,
            start_offset: args.start_offset,
            cliff_offset: args.cliff_offset,
            end_offset: args.end_offset,
        });
        Ok(())
    }

    /// Permissionless lazy page creation: assigns the fixed seed schedule exactly once.
    pub fn initialize_bin_page(ctx: Context<InitializeBinPage>, page_index: i32) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(page_index >= m.min_page() && page_index <= m.max_page(), PopError::PageOutOfRange);
        let mut page = ctx.accounts.page.load_init()?;
        page.market = m.key();
        page.page_index = page_index;
        page.bump = ctx.bumps.page;
        let first = page_index * BINS_PER_PAGE as i32;
        let mut tot_b: u64 = 0;
        let mut tot_q: u64 = 0;
        for k in 0..BINS_PER_PAGE {
            let (sb, sq) = m.seed_allocation_for_bin(first + k as i32);
            page.bins[k] = Bin { seed_base: sb, seed_quote: sq, ..Default::default() };
            tot_b += sb;
            tot_q += sq;
        }
        m.unmaterialized_seed_base = m.unmaterialized_seed_base.checked_sub(tot_b).ok_or(PopError::SeedExceeded)?;
        m.unmaterialized_seed_quote = m.unmaterialized_seed_quote.checked_sub(tot_q).ok_or(PopError::SeedExceeded)?;
        emit!(PageInitialized { market: m.key(), page_index, seed_base: tot_b, seed_quote: tot_q, payer: ctx.accounts.payer.key() });
        Ok(())
    }

    /// Fund seed quote, verify supply and authorities, revoke mint authority, activate. All
    /// checks fail atomically.
    pub fn activate_market(ctx: Context<ActivateMarket>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(m.status == STATUS_CREATED, PopError::MarketAlreadyActive);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.creator_quote_account.to_account_info(),
                    to: ctx.accounts.quote_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            m.seed_quote_total,
        )?;
        ctx.accounts.quote_vault.reload()?;
        require!(ctx.accounts.quote_vault.amount >= m.seed_quote_total, PopError::SeedQuoteNotFunded);
        ctx.accounts.base_vault.reload()?;
        require!(ctx.accounts.base_vault.amount == m.seed_base_total, PopError::SupplyMismatch);
        let expected_supply = m.seed_base_total.checked_add(m.allocated_supply).ok_or(PopError::Overflow)?;
        require!(ctx.accounts.base_mint.supply == expected_supply, PopError::SupplyMismatch);
        require!(ctx.accounts.base_mint.freeze_authority.is_none(), PopError::MintAuthorityPresent);

        let mint_key = m.base_mint;
        let bump = m.bump;
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[bump]];
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                SetAuthority {
                    current_authority: ctx.accounts.market.to_account_info(),
                    account_or_mint: ctx.accounts.base_mint.to_account_info(),
                },
                &[seeds],
            ),
            spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;
        ctx.accounts.base_mint.reload()?;
        require!(ctx.accounts.base_mint.mint_authority.is_none(), PopError::MintAuthorityPresent);

        let clock = Clock::get()?;
        let m = &mut ctx.accounts.market;
        m.status = STATUS_ACTIVE;
        m.activated_at_slot = clock.slot;
        m.activated_at_ts = clock.unix_timestamp;
        emit!(MarketActivated { market: m.key(), slot: clock.slot, unix_ts: clock.unix_timestamp, supply: expected_supply });
        Ok(())
    }

    /// Exact-input, fill-or-kill swap. Remaining accounts: the bin pages the route may touch,
    /// in traversal order (cursor page first).
    pub fn swap_exact_in<'info>(ctx: Context<'info, SwapExactIn<'info>>, args: SwapArgs) -> Result<()> {
        let clock = Clock::get()?;
        require!(clock.slot <= args.deadline_slot, PopError::DeadlinePassed);
        let market_key = ctx.accounts.market.key();
        {
            let m = &ctx.accounts.market;
            require!(m.config_version == args.expected_config_version, PopError::ConfigVersionMismatch);
        }
        let pages = swap_core::load_pages(ctx.program_id, &market_key, &ctx.accounts.market, ctx.remaining_accounts)?;
        let r = swap_core::quote_swap(&ctx.accounts.market, &pages, args.is_buy, args.gross_input, args.min_output, false)?;

        // Token movements: input (tradable + scar fee) to the locked vault, revenue to the fee
        // vault, output from the locked vault to the user.
        let locked_in = r.tradable.checked_add(r.scar_fee).ok_or(PopError::Overflow)?;
        let revenue = r.protocol_fee.checked_add(r.creator_fee).ok_or(PopError::Overflow)?;
        let tp = ctx.accounts.token_program.key();
        let (user_in, vault_in, fee_vault, vault_out, user_out) = if args.is_buy {
            (
                ctx.accounts.user_quote.to_account_info(),
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.fee_vault_quote.to_account_info(),
                ctx.accounts.base_vault.to_account_info(),
                ctx.accounts.user_base.to_account_info(),
            )
        } else {
            (
                ctx.accounts.user_base.to_account_info(),
                ctx.accounts.base_vault.to_account_info(),
                ctx.accounts.fee_vault_base.to_account_info(),
                ctx.accounts.quote_vault.to_account_info(),
                ctx.accounts.user_quote.to_account_info(),
            )
        };
        token::transfer(
            CpiContext::new(tp, Transfer { from: user_in.clone(), to: vault_in, authority: ctx.accounts.user.to_account_info() }),
            locked_in,
        )?;
        if revenue > 0 {
            token::transfer(
                CpiContext::new(tp, Transfer { from: user_in, to: fee_vault, authority: ctx.accounts.user.to_account_info() }),
                revenue,
            )?;
        }
        let mint_key = ctx.accounts.market.base_mint;
        let bump = ctx.accounts.market.bump;
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(tp, Transfer { from: vault_out, to: user_out, authority: ctx.accounts.market.to_account_info() }, &[seeds]),
            r.output,
        )?;

        let start_bin = r.fills[0].bin;
        let m = &mut ctx.accounts.market;
        swap_core::commit_swap(m, &market_key, &pages, &r, args.is_buy, false, clock.slot)?;
        emit!(SwapExecuted {
            market: market_key,
            user: ctx.accounts.user.key(),
            is_buy: args.is_buy,
            gross_input: r.gross,
            output: r.output,
            scar_fee: r.scar_fee,
            protocol_fee: r.protocol_fee,
            creator_fee: r.creator_fee,
            bins_inspected: r.bins_inspected,
            start_bin,
            end_bin: r.new_cursor,
            internal_buyback: false,
            slot: clock.slot,
        });
        Ok(())
    }

    /// Permissionless, bounded: attempt matching on every bin of one page.
    pub fn match_bins(ctx: Context<MatchBins>) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        let slot = Clock::get()?.slot;
        let m = &mut ctx.accounts.market;
        require!(m.status != STATUS_CREATED, PopError::MarketNotActive);
        let mut page = ctx.accounts.page.load_mut()?;
        let first = page.first_bin();
        for k in 0..BINS_PER_PAGE {
            let bin_id = first + k as i32;
            if !m.in_range(bin_id) {
                continue;
            }
            let price = math::price_at_bin(m.p0_x64, bin_id).ok_or(PopError::PriceRange)?;
            swap_core::match_bin(m, &market_key, bin_id, &mut page.bins[k], price, slot)?;
        }
        Ok(())
    }

    /// Permissionless re-evaluation from stored counters (normally graduation happens inside matching).
    pub fn evaluate_graduation(ctx: Context<EvaluateGraduation>) -> Result<()> {
        let key = ctx.accounts.market.key();
        let slot = Clock::get()?.slot;
        swap_core::evaluate_graduation(&mut ctx.accounts.market, &key, slot);
        Ok(())
    }

    /// Claim protocol (kind 0) or creator (kind 1) revenue in the fee vault's mint to the
    /// published recipient. Permissionless crank; the destination owner is enforced.
    pub fn claim_fees(ctx: Context<ClaimFees>, kind: u8) -> Result<()> {
        let m = &mut ctx.accounts.market;
        let fee_vault = &ctx.accounts.fee_vault;
        let is_base = fee_vault.key() == m.fee_vault_base;
        let is_quote = fee_vault.key() == m.fee_vault_quote;
        require!(is_base || is_quote, PopError::InvalidVault);
        let recipient = match kind {
            FEE_KIND_PROTOCOL => ctx.accounts.protocol_config.protocol_fee_recipient,
            FEE_KIND_CREATOR => m.creator,
            _ => return Err(PopError::InvalidConfig.into()),
        };
        require_keys_eq!(ctx.accounts.destination.owner, recipient, PopError::InvalidClaimDestination);
        require_keys_eq!(ctx.accounts.destination.mint, fee_vault.mint, PopError::InvalidClaimDestination);
        let amount = match (kind, is_base) {
            (FEE_KIND_PROTOCOL, true) => core::mem::take(&mut m.protocol_claimable_base),
            (FEE_KIND_PROTOCOL, false) => core::mem::take(&mut m.protocol_claimable_quote),
            (FEE_KIND_CREATOR, true) => core::mem::take(&mut m.creator_claimable_base),
            _ => core::mem::take(&mut m.creator_claimable_quote),
        };
        require!(amount > 0, PopError::NothingToClaim);
        let mint_key = m.base_mint;
        let bump = m.bump;
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer { from: fee_vault.to_account_info(), to: ctx.accounts.destination.to_account_info(), authority: ctx.accounts.market.to_account_info() },
                &[seeds],
            ),
            amount,
        )?;
        emit!(FeesClaimed { market: ctx.accounts.market.key(), kind, mint: fee_vault.mint, amount, recipient });
        Ok(())
    }

    /// Permissionless: move the buyback earmark (non-POP markets only) to the buyback vault.
    pub fn sweep_buyback_funds(ctx: Context<SweepBuyback>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(!m.is_pop_market, PopError::BuybackSourceExcluded);
        let amount = core::mem::take(&mut m.buyback_accrued_quote);
        require!(amount > 0, PopError::NothingToClaim);
        let mint_key = m.base_mint;
        let bump = m.bump;
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer { from: ctx.accounts.fee_vault_quote.to_account_info(), to: ctx.accounts.buyback_quote_account.to_account_info(), authority: ctx.accounts.market.to_account_info() },
                &[seeds],
            ),
            amount,
        )?;
        let bb = &mut ctx.accounts.buyback_vault;
        bb.total_received = bb.total_received.checked_add(amount).ok_or(PopError::Overflow)?;
        emit!(BuybackSwept { market: ctx.accounts.market.key(), amount });
        Ok(())
    }

    /// Manual, authority-approved buyback with explicit bounds: spend realized WSOL on the POP
    /// market (scar fee charged into INELIGIBLE escrow, no protocol/creator fee) and burn the
    /// purchased POP atomically. Remaining accounts: bin pages.
    pub fn execute_pop_buyback<'info>(
        ctx: Context<'info, ExecutePopBuyback<'info>>,
        quote_spend: u64,
        min_pop_out: u64,
        max_price_x64: u128,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let market_key = ctx.accounts.market.key();
        {
            let bb = &ctx.accounts.buyback_vault;
            require!(quote_spend > 0 && quote_spend <= bb.max_spend_per_execution, PopError::BuybackSpendCap);
            require!(quote_spend <= ctx.accounts.buyback_quote_account.amount, PopError::BuybackSpendCap);
            require!(bb.last_execution_slot == 0 || clock.slot >= bb.last_execution_slot + bb.min_interval_slots, PopError::BuybackInterval);
            let m = &ctx.accounts.market;
            require!(m.is_pop_market, PopError::NotPopMarket);
            let cursor_price = math::price_at_bin(m.p0_x64, m.cursor).ok_or(PopError::PriceRange)?;
            require!(cursor_price <= max_price_x64, PopError::BuybackPriceGuard);
        }
        let pages = swap_core::load_pages(ctx.program_id, &market_key, &ctx.accounts.market, ctx.remaining_accounts)?;
        let r = swap_core::quote_swap(&ctx.accounts.market, &pages, true, quote_spend, min_pop_out, true)?;
        let locked_in = r.tradable.checked_add(r.scar_fee).ok_or(PopError::Overflow)?;
        require!(locked_in == quote_spend, PopError::Invariant);
        let tp = ctx.accounts.token_program.key();
        let bb_bump = ctx.accounts.buyback_vault.bump;
        let bb_seeds: &[&[u8]] = &[SEED_BUYBACK, &[bb_bump]];
        token::transfer(
            CpiContext::new_with_signer(
                tp,
                Transfer { from: ctx.accounts.buyback_quote_account.to_account_info(), to: ctx.accounts.quote_vault.to_account_info(), authority: ctx.accounts.buyback_vault.to_account_info() },
                &[bb_seeds],
            ),
            locked_in,
        )?;
        let mint_key = ctx.accounts.market.base_mint;
        let bump = ctx.accounts.market.bump;
        let seeds: &[&[u8]] = &[SEED_MARKET, mint_key.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                tp,
                Transfer { from: ctx.accounts.base_vault.to_account_info(), to: ctx.accounts.buyback_pop_account.to_account_info(), authority: ctx.accounts.market.to_account_info() },
                &[seeds],
            ),
            r.output,
        )?;
        token::burn(
            CpiContext::new_with_signer(
                tp,
                Burn { mint: ctx.accounts.base_mint.to_account_info(), from: ctx.accounts.buyback_pop_account.to_account_info(), authority: ctx.accounts.buyback_vault.to_account_info() },
                &[bb_seeds],
            ),
            r.output,
        )?;
        let start_bin = r.fills[0].bin;
        swap_core::commit_swap(&mut ctx.accounts.market, &market_key, &pages, &r, true, true, clock.slot)?;
        let bb = &mut ctx.accounts.buyback_vault;
        bb.total_spent = bb.total_spent.checked_add(quote_spend).ok_or(PopError::Overflow)?;
        bb.total_burned = bb.total_burned.checked_add(r.output).ok_or(PopError::Overflow)?;
        bb.last_execution_slot = clock.slot;
        bb.execution_count += 1;
        emit!(SwapExecuted {
            market: market_key,
            user: ctx.accounts.buyback_vault.key(),
            is_buy: true,
            gross_input: r.gross,
            output: r.output,
            scar_fee: r.scar_fee,
            protocol_fee: 0,
            creator_fee: 0,
            bins_inspected: r.bins_inspected,
            start_bin,
            end_bin: r.new_cursor,
            internal_buyback: true,
            slot: clock.slot,
        });
        emit!(BuybackExecuted { market: market_key, quote_spent: quote_spend, pop_bought: r.output, pop_burned: r.output, slot: clock.slot });
        Ok(())
    }

    pub fn claim_vested(ctx: Context<ClaimVested>) -> Result<()> {
        let m = &ctx.accounts.market;
        require!(m.status != STATUS_CREATED, PopError::MarketNotActive);
        let now = Clock::get()?.unix_timestamp;
        let v = &mut ctx.accounts.vesting;
        let vested = v.vested_at(m.activated_at_ts, now);
        let claimable = vested.saturating_sub(v.claimed);
        require!(claimable > 0, PopError::NothingToClaim);
        v.claimed += claimable;
        let vkey = ctx.accounts.vesting.key();
        let market_key = ctx.accounts.market.key();
        let idx = ctx.accounts.vesting.index;
        let bump = ctx.accounts.vesting.bump;
        let seeds: &[&[u8]] = &[SEED_VESTING, market_key.as_ref(), &[idx], &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.destination.to_account_info(), authority: ctx.accounts.vesting.to_account_info() },
                &[seeds],
            ),
            claimable,
        )?;
        emit!(VestingClaimed { vesting: vkey, beneficiary: ctx.accounts.beneficiary.key(), amount: claimable, claimed_total: ctx.accounts.vesting.claimed });
        Ok(())
    }
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + ProtocolConfig::INIT_SPACE, seeds = [SEED_PROTOCOL], bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(init, payer = payer, space = 8 + BuybackVault::INIT_SPACE, seeds = [SEED_BUYBACK], bump)]
    pub buyback_vault: Box<Account<'info, BuybackVault>>,
    #[account(init, payer = payer, seeds = [SEED_BUYBACK, b"quote"], bump, token::mint = quote_mint, token::authority = buyback_vault)]
    pub buyback_quote_account: Box<Account<'info, TokenAccount>>,
    #[account(address = spl_token::native_mint::ID @ PopError::InvalidQuoteMint)]
    pub quote_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol_config.bump, has_one = authority @ PopError::Unauthorized)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
}

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [SEED_PROTOCOL], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(init, payer = creator, mint::decimals = args.decimals, mint::authority = market)]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(address = spl_token::native_mint::ID @ PopError::InvalidQuoteMint)]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = creator, space = 8 + Market::INIT_SPACE, seeds = [SEED_MARKET, base_mint.key().as_ref()], bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(init, payer = creator, seeds = [SEED_VAULT_BASE, market.key().as_ref()], bump, token::mint = base_mint, token::authority = market)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = creator, seeds = [SEED_VAULT_QUOTE, market.key().as_ref()], bump, token::mint = quote_mint, token::authority = market)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = creator, seeds = [SEED_FEE_BASE, market.key().as_ref()], bump, token::mint = base_mint, token::authority = market)]
    pub fee_vault_base: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = creator, seeds = [SEED_FEE_QUOTE, market.key().as_ref()], bump, token::mint = quote_mint, token::authority = market)]
    pub fee_vault_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: CreateVestingArgs)]
pub struct CreateVesting<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [SEED_PROTOCOL], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(mut, has_one = creator @ PopError::Unauthorized, has_one = base_mint)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut)]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = creator, space = 8 + Vesting::INIT_SPACE, seeds = [SEED_VESTING, market.key().as_ref(), &[args.index]], bump)]
    pub vesting: Box<Account<'info, Vesting>>,
    #[account(init, payer = creator, seeds = [SEED_VESTING, b"vault", vesting.key().as_ref()], bump, token::mint = base_mint, token::authority = vesting)]
    pub vesting_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(page_index: i32)]
pub struct InitializeBinPage<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    #[account(init, payer = payer, space = BinPage::LEN, seeds = [SEED_PAGE, market.key().as_ref(), &page_index.to_le_bytes()], bump)]
    pub page: AccountLoader<'info, BinPage>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ActivateMarket<'info> {
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator @ PopError::Unauthorized, has_one = base_mint, has_one = base_vault, has_one = quote_vault)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut)]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = market.quote_mint, token::authority = creator)]
    pub creator_quote_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapExactIn<'info> {
    pub user: Signer<'info>,
    #[account(mut, has_one = base_vault @ PopError::InvalidVault, has_one = quote_vault @ PopError::InvalidVault, has_one = fee_vault_base @ PopError::InvalidVault, has_one = fee_vault_quote @ PopError::InvalidVault)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_vault_base: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_vault_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = market.base_mint, token::authority = user)]
    pub user_base: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = market.quote_mint, token::authority = user)]
    pub user_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MatchBins<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market @ PopError::InvalidPage)]
    pub page: AccountLoader<'info, BinPage>,
}

#[derive(Accounts)]
pub struct EvaluateGraduation<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
}

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(seeds = [SEED_PROTOCOL], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut)]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SweepBuyback<'info> {
    #[account(mut, has_one = fee_vault_quote @ PopError::InvalidVault)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut)]
    pub fee_vault_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [SEED_BUYBACK], bump = buyback_vault.bump)]
    pub buyback_vault: Box<Account<'info, BuybackVault>>,
    #[account(mut, address = buyback_vault.quote_account @ PopError::InvalidVault)]
    pub buyback_quote_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecutePopBuyback<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [SEED_PROTOCOL], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(mut, seeds = [SEED_BUYBACK], bump = buyback_vault.bump, has_one = authority @ PopError::Unauthorized)]
    pub buyback_vault: Box<Account<'info, BuybackVault>>,
    #[account(mut, address = protocol_config.pop_market @ PopError::NotPopMarket, has_one = base_vault @ PopError::InvalidVault, has_one = quote_vault @ PopError::InvalidVault, has_one = base_mint)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut)]
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = buyback_vault.quote_account @ PopError::InvalidVault)]
    pub buyback_quote_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = base_mint, token::authority = buyback_vault)]
    pub buyback_pop_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimVested<'info> {
    pub beneficiary: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = beneficiary @ PopError::Unauthorized, has_one = market, has_one = vault @ PopError::InvalidVault)]
    pub vesting: Box<Account<'info, Vesting>>,
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vesting.mint, token::authority = beneficiary)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}
