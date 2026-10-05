//! Pop Launch: community-funded coin launches.
//!
//! Backers commit SOL into a launch-specific program-controlled escrow. When the target is reached the
//! launch becomes READY; a permissionless `finalize_launch` wraps exactly the target SOL, seeds the
//! approved Raydium CP-Swap pool with exactly the pool allocation, burns every LP token the pool issued,
//! and enables claims, all in one transaction. If the target is missed, or settlement does not land
//! before its deadline, every backer reclaims their full principal. There is no instruction that moves
//! backer principal anywhere else, no creator or platform allocation, and no admin withdrawal.
#![allow(clippy::too_many_arguments)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::system_program;
use anchor_spl::associated_token::{self, AssociatedToken};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Burn, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;
pub mod raydium;
pub mod state;

use errors::LaunchError;
use events::*;
use state::*;

declare_id!("Gj6B3nfzze1aZyYkmrk21LymU4oo1BFDEpa1s6NG2MXy");

pub const CONFIG_SEED: &[u8] = b"config";
pub const LAUNCH_SEED: &[u8] = b"launch";
pub const AUTH_SEED: &[u8] = b"auth";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const BACKER_VAULT_SEED: &[u8] = b"backer_vault";
pub const POOL_VAULT_SEED: &[u8] = b"pool_vault";
pub const RECEIPT_SEED: &[u8] = b"receipt";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateLaunchArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub metadata_hash: [u8; 32],
    /// Creator-funded reserve for pool and account costs (quoted client-side; must be >= the protocol minimum).
    pub setup_reserve_lamports: u64,
}

fn validate_settings(s: &LaunchSettings) -> Result<()> {
    require!(s.target_lamports > 0 && s.funding_window_secs > 0 && s.settlement_timeout_secs > 0, LaunchError::InvalidSettings);
    require!(s.supply > 0 && s.backer_allocation > 0 && s.pool_allocation > 0, LaunchError::InvalidSettings);
    require!(s.backer_allocation.checked_add(s.pool_allocation) == Some(s.supply), LaunchError::InvalidSettings);
    require!(s.min_contribution_lamports > 0 && s.min_contribution_lamports <= s.target_lamports, LaunchError::InvalidSettings);
    Ok(())
}

fn validate_str(s: &str, max: usize) -> Result<()> {
    require!(!s.is_empty() && s.len() <= max, LaunchError::InvalidMetadata);
    require!(s.chars().all(|c| !c.is_control()), LaunchError::InvalidMetadata);
    Ok(())
}

fn transfer_lamports_signed<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, system_program: &AccountInfo<'info>, seeds: &[&[u8]], amount: u64) -> Result<()> {
    system_program::transfer(
        CpiContext::new_with_signer(system_program.key(), system_program::Transfer { from: from.clone(), to: to.clone() }, &[seeds]),
        amount,
    )
}

/// Amount of an SPL token account read straight from its layout (u64 LE at offset 64); owner and size are checked.
fn token_amount(info: &AccountInfo) -> Result<u64> {
    require_keys_eq!(*info.owner, anchor_spl::token::ID, LaunchError::WrongAta);
    let data = info.try_borrow_data()?;
    require!(data.len() >= 72, LaunchError::WrongAta);
    let mut b = [0u8; 8];
    b.copy_from_slice(&data[64..72]);
    Ok(u64::from_le_bytes(b))
}

#[program]
pub mod pop_launch {
    use super::*;

    /// One-time protocol configuration. The authority can only change settings for NEW launches and pause NEW launches.
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, settings: LaunchSettings) -> Result<()> {
        validate_settings(&settings)?;
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.paused = false;
        c.version = 1;
        c.settings = settings;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Versioned settings for launches created from now on. Never alters an existing launch.
    pub fn update_settings(ctx: Context<AdminConfig>, settings: LaunchSettings) -> Result<()> {
        validate_settings(&settings)?;
        let c = &mut ctx.accounts.config;
        c.settings = settings;
        c.version = c.version.checked_add(1).ok_or(LaunchError::Overflow)?;
        Ok(())
    }

    /// A global pause blocks NEW launches only; it cannot disable settlement, claims or refunds.
    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Create the mint, mint the fixed supply into program vaults, revoke the mint authority, freeze the
    /// terms, fund the escrow's rent and the creator's setup reserve, pay the creation fee, and open funding.
    pub fn create_launch(ctx: Context<CreateLaunch>, args: CreateLaunchArgs) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, LaunchError::Paused);
        validate_str(&args.name, 32)?;
        validate_str(&args.symbol, 10)?;
        validate_str(&args.uri, 200)?;
        let s = config.settings;
        require!(args.setup_reserve_lamports >= s.min_setup_reserve_lamports, LaunchError::SetupReserveTooLow);

        let launch_key = ctx.accounts.launch.key();
        let auth_bump = ctx.bumps.auth;
        let auth_seeds: &[&[u8]] = &[AUTH_SEED, launch_key.as_ref(), &[auth_bump]];

        // Fixed supply: backer allocation and pool allocation into program-controlled vaults, nothing to anyone else.
        token::mint_to(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(),
                MintTo { mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.backer_vault.to_account_info(), authority: ctx.accounts.auth.to_account_info() },
                &[auth_seeds],
            ),
            s.backer_allocation,
        )?;
        token::mint_to(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(),
                MintTo { mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.pool_vault.to_account_info(), authority: ctx.accounts.auth.to_account_info() },
                &[auth_seeds],
            ),
            s.pool_allocation,
        )?;
        // Revoke the mint authority permanently. The mint was created with no freeze authority.
        token::set_authority(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(),
                SetAuthority { account_or_mint: ctx.accounts.mint.to_account_info(), current_authority: ctx.accounts.auth.to_account_info() },
                &[auth_seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        // Creation fee: separate from backing, paid only because this instruction succeeded.
        if s.creation_fee_lamports > 0 {
            system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.key(), system_program::Transfer { from: ctx.accounts.creator.to_account_info(), to: ctx.accounts.fee_recipient.to_account_info() }),
                s.creation_fee_lamports,
            )?;
        }
        // Escrow rent (kept forever, never counted as principal) and the setup reserve held by the launch authority.
        let rent_min = Rent::get()?.minimum_balance(0);
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.key(), system_program::Transfer { from: ctx.accounts.creator.to_account_info(), to: ctx.accounts.escrow.to_account_info() }),
            rent_min,
        )?;
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.key(), system_program::Transfer { from: ctx.accounts.creator.to_account_info(), to: ctx.accounts.auth.to_account_info() }),
            rent_min.checked_add(args.setup_reserve_lamports).ok_or(LaunchError::Overflow)?,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let l = &mut ctx.accounts.launch;
        l.version = config.version;
        l.creator = ctx.accounts.creator.key();
        l.mint = ctx.accounts.mint.key();
        l.state = LaunchState::Funding as u8;
        l.refund_reason = RefundReason::None as u8;
        l.target_lamports = s.target_lamports;
        l.supply = s.supply;
        l.decimals = s.decimals;
        l.backer_allocation = s.backer_allocation;
        l.pool_allocation = s.pool_allocation;
        l.settlement_timeout_secs = s.settlement_timeout_secs;
        l.cp_swap_program = s.cp_swap_program;
        l.amm_config = s.amm_config;
        l.create_pool_fee_receiver = s.create_pool_fee_receiver;
        l.quote_mint = s.quote_mint;
        l.creation_fee_paid = s.creation_fee_lamports;
        l.name = args.name;
        l.symbol = args.symbol;
        l.uri = args.uri;
        l.metadata_hash = args.metadata_hash;
        l.opened_at = now;
        l.funding_deadline = now.checked_add(s.funding_window_secs).ok_or(LaunchError::Overflow)?;
        l.setup_reserve_funded = args.setup_reserve_lamports;
        l.bump = ctx.bumps.launch;
        l.auth_bump = auth_bump;
        l.escrow_bump = ctx.bumps.escrow;
        l.backer_vault_bump = ctx.bumps.backer_vault;
        l.pool_vault_bump = ctx.bumps.pool_vault;

        emit!(LaunchCreated { launch: launch_key, mint: l.mint, creator: l.creator, version: l.version, target_lamports: l.target_lamports, opened_at: now, funding_deadline: l.funding_deadline, creation_fee: s.creation_fee_lamports, setup_reserve: args.setup_reserve_lamports });
        Ok(())
    }

    /// Commit SOL. Rejected whole if it exceeds the remaining target; the exact remainder may be below the minimum.
    /// Reaching the target flips the launch to READY in the same transaction.
    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &mut ctx.accounts.launch;
        require!(l.state() == LaunchState::Funding, LaunchError::NotFunding);
        require!(now < l.funding_deadline, LaunchError::FundingClosed);
        require!(amount > 0, LaunchError::ZeroAmount);
        let remaining = l.target_lamports.checked_sub(l.raised_lamports).ok_or(LaunchError::Overflow)?;
        require!(remaining > 0, LaunchError::NotFunding);
        require!(amount <= remaining, LaunchError::ExceedsRemaining);
        require!(amount >= ctx.accounts.config.settings.min_contribution_lamports || amount == remaining, LaunchError::BelowMinimum);

        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.key(), system_program::Transfer { from: ctx.accounts.backer.to_account_info(), to: ctx.accounts.escrow.to_account_info() }),
            amount,
        )?;

        let r = &mut ctx.accounts.receipt;
        if r.owner == Pubkey::default() {
            r.launch = l.key();
            r.owner = ctx.accounts.backer.key();
            r.bump = ctx.bumps.receipt;
        }
        if r.contributed_lamports == 0 {
            l.backer_wallets = l.backer_wallets.checked_add(1).ok_or(LaunchError::Overflow)?;
        }
        r.contributed_lamports = r.contributed_lamports.checked_add(amount).ok_or(LaunchError::Overflow)?;
        l.raised_lamports = l.raised_lamports.checked_add(amount).ok_or(LaunchError::Overflow)?;
        emit!(Contributed { launch: l.key(), wallet: r.owner, amount, wallet_total: r.contributed_lamports, raised: l.raised_lamports, backer_wallets: l.backer_wallets });

        if l.raised_lamports == l.target_lamports {
            l.state = LaunchState::Ready as u8;
            l.filled_at = now;
            l.settlement_deadline = now.checked_add(l.settlement_timeout_secs).ok_or(LaunchError::Overflow)?;
            emit!(TargetReached { launch: l.key(), filled_at: now, settlement_deadline: l.settlement_deadline });
        }
        Ok(())
    }

    /// Permissionless settlement, strictly before the settlement deadline: wrap exactly the target SOL,
    /// create the Raydium CP-Swap pool with exactly the pool allocation, burn every LP token issued to the
    /// launch, verify the pool reserves, and mark LIVE. All or nothing.
    pub fn finalize_launch(ctx: Context<FinalizeLaunch>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        {
            let l = &ctx.accounts.launch;
            require!(l.state() == LaunchState::Ready, LaunchError::NotReady);
            require!(now < l.settlement_deadline, LaunchError::SettlementExpired);
            require!(ctx.accounts.pool_vault.amount == l.pool_allocation, LaunchError::PoolVaultShort);
            let rent_min = Rent::get()?.minimum_balance(0);
            require!(ctx.accounts.escrow.lamports() >= rent_min.checked_add(l.target_lamports).ok_or(LaunchError::Overflow)?, LaunchError::EscrowShort);
        }
        let launch_key = ctx.accounts.launch.key();
        let target = ctx.accounts.launch.target_lamports;
        let pool_allocation = ctx.accounts.launch.pool_allocation;
        let auth_bump = ctx.accounts.launch.auth_bump;
        let escrow_bump = ctx.accounts.launch.escrow_bump;
        let auth_seeds: &[&[u8]] = &[AUTH_SEED, launch_key.as_ref(), &[auth_bump]];
        let escrow_seeds: &[&[u8]] = &[ESCROW_SEED, launch_key.as_ref(), &[escrow_bump]];

        // Verify every DEX-side address against the approved program and config; never adopt an arbitrary pool.
        let cp = ctx.accounts.cp_swap_program.key();
        let quote = ctx.accounts.quote_mint.key();
        let base = ctx.accounts.mint.key();
        let quote_is_0 = quote < base;
        let (t0, t1) = if quote_is_0 { (quote, base) } else { (base, quote) };
        let pa = raydium::pool_addresses(&cp, &ctx.accounts.amm_config.key(), &t0, &t1);
        require_keys_eq!(ctx.accounts.cp_authority.key(), pa.authority, LaunchError::WrongDexAccount);
        require_keys_eq!(ctx.accounts.pool_state.key(), pa.pool_state, LaunchError::WrongDexAccount);
        require_keys_eq!(ctx.accounts.lp_mint.key(), pa.lp_mint, LaunchError::WrongDexAccount);
        require_keys_eq!(ctx.accounts.token_0_vault.key(), pa.token_0_vault, LaunchError::WrongDexAccount);
        require_keys_eq!(ctx.accounts.token_1_vault.key(), pa.token_1_vault, LaunchError::WrongDexAccount);
        require_keys_eq!(ctx.accounts.observation_state.key(), pa.observation_state, LaunchError::WrongDexAccount);
        // The pool must not exist yet: a precreated pool is never adopted.
        require!(ctx.accounts.pool_state.owner == &system_program::ID && ctx.accounts.pool_state.lamports() == 0, LaunchError::WrongDexAccount);
        let auth_key = ctx.accounts.auth.key();
        require_keys_eq!(ctx.accounts.auth_quote.key(), associated_token::get_associated_token_address(&auth_key, &quote), LaunchError::WrongAta);
        require_keys_eq!(ctx.accounts.auth_lp.key(), associated_token::get_associated_token_address(&auth_key, &pa.lp_mint), LaunchError::WrongAta);

        // 1. Wrap exactly the target: create the authority's WSOL ATA (rent from the setup reserve), move principal, sync.
        associated_token::create_idempotent(CpiContext::new_with_signer(ctx.accounts.associated_token_program.key(),
            associated_token::Create {
                payer: ctx.accounts.auth.to_account_info(),
                associated_token: ctx.accounts.auth_quote.to_account_info(),
                authority: ctx.accounts.auth.to_account_info(),
                mint: ctx.accounts.quote_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            &[auth_seeds],
        ))?;
        transfer_lamports_signed(&ctx.accounts.escrow.to_account_info(), &ctx.accounts.auth_quote.to_account_info(), &ctx.accounts.system_program.to_account_info(), escrow_seeds, target)?;
        token::sync_native(CpiContext::new(ctx.accounts.token_program.key(), token::SyncNative { account: ctx.accounts.auth_quote.to_account_info() }))?;
        require!(token_amount(&ctx.accounts.auth_quote.to_account_info())? == target, LaunchError::ReserveMismatch);

        // 2. Create the pool with exactly target quote and exactly the pool allocation; the authority PDA is Raydium's creator.
        let (c0, c1, a0, a1) = if quote_is_0 {
            (ctx.accounts.auth_quote.key(), ctx.accounts.pool_vault.key(), target, pool_allocation)
        } else {
            (ctx.accounts.pool_vault.key(), ctx.accounts.auth_quote.key(), pool_allocation, target)
        };
        let keys = raydium::InitializeKeys {
            creator: auth_key,
            amm_config: ctx.accounts.amm_config.key(),
            authority: pa.authority,
            pool_state: pa.pool_state,
            token_0_mint: t0,
            token_1_mint: t1,
            lp_mint: pa.lp_mint,
            creator_token_0: c0,
            creator_token_1: c1,
            creator_lp_token: ctx.accounts.auth_lp.key(),
            token_0_vault: pa.token_0_vault,
            token_1_vault: pa.token_1_vault,
            create_pool_fee: ctx.accounts.create_pool_fee.key(),
            observation_state: pa.observation_state,
            token_program: ctx.accounts.token_program.key(),
            token_0_program: ctx.accounts.token_program.key(),
            token_1_program: ctx.accounts.token_program.key(),
            associated_token_program: ctx.accounts.associated_token_program.key(),
            system_program: ctx.accounts.system_program.key(),
            rent: ctx.accounts.rent.key(),
        };
        let ix = raydium::initialize_instruction(cp, &keys, a0, a1, 0);
        let (m0, m1) = if quote_is_0 {
            (ctx.accounts.quote_mint.to_account_info(), ctx.accounts.mint.to_account_info())
        } else {
            (ctx.accounts.mint.to_account_info(), ctx.accounts.quote_mint.to_account_info())
        };
        let (ct0, ct1) = if quote_is_0 {
            (ctx.accounts.auth_quote.to_account_info(), ctx.accounts.pool_vault.to_account_info())
        } else {
            (ctx.accounts.pool_vault.to_account_info(), ctx.accounts.auth_quote.to_account_info())
        };
        invoke_signed(
            &ix,
            &[
                ctx.accounts.auth.to_account_info(),
                ctx.accounts.amm_config.to_account_info(),
                ctx.accounts.cp_authority.to_account_info(),
                ctx.accounts.pool_state.to_account_info(),
                m0,
                m1,
                ctx.accounts.lp_mint.to_account_info(),
                ct0,
                ct1,
                ctx.accounts.auth_lp.to_account_info(),
                ctx.accounts.token_0_vault.to_account_info(),
                ctx.accounts.token_1_vault.to_account_info(),
                ctx.accounts.create_pool_fee.to_account_info(),
                ctx.accounts.observation_state.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.associated_token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
                ctx.accounts.cp_swap_program.to_account_info(),
            ],
            &[auth_seeds],
        )?;

        // 3. Validate the deposited reserves against the launch terms, then burn every LP token the pool issued.
        let (qv, bv) = if quote_is_0 { (&ctx.accounts.token_0_vault, &ctx.accounts.token_1_vault) } else { (&ctx.accounts.token_1_vault, &ctx.accounts.token_0_vault) };
        require!(token_amount(&qv.to_account_info())? == target, LaunchError::ReserveMismatch);
        require!(token_amount(&bv.to_account_info())? == pool_allocation, LaunchError::ReserveMismatch);
        require!(token_amount(&ctx.accounts.auth_quote.to_account_info())? == 0, LaunchError::ReserveMismatch);
        let lp_amount = token_amount(&ctx.accounts.auth_lp.to_account_info())?;
        require!(lp_amount > 0, LaunchError::LpNotBurned);
        token::burn(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(),
                Burn { mint: ctx.accounts.lp_mint.to_account_info(), from: ctx.accounts.auth_lp.to_account_info(), authority: ctx.accounts.auth.to_account_info() },
                &[auth_seeds],
            ),
            lp_amount,
        )?;
        require!(token_amount(&ctx.accounts.auth_lp.to_account_info())? == 0, LaunchError::LpNotBurned);

        // 4. Commit: LIVE, claims enabled.
        let l = &mut ctx.accounts.launch;
        l.state = LaunchState::Live as u8;
        l.live_at = now;
        l.pool_state = pa.pool_state;
        l.lp_mint = pa.lp_mint;
        l.lp_burned = lp_amount;
        l.settled_quote = target;
        l.settled_base = pool_allocation;
        emit!(LaunchLive { launch: launch_key, pool_state: pa.pool_state, lp_mint: pa.lp_mint, lp_burned: lp_amount, quote_seeded: target, base_seeded: pool_allocation, live_at: now });
        Ok(())
    }

    /// Transfer a wallet's remaining entitlement to that wallet's associated token account. Anyone may pay for it;
    /// nobody can redirect it. Claims never expire. Cumulative claimed amount is recorded before the transfer.
    pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
        let l = &mut ctx.accounts.launch;
        require!(l.state() == LaunchState::Live, LaunchError::NotLive);
        let r = &mut ctx.accounts.receipt;
        let entitled = l.entitlement(r.contributed_lamports);
        let due = entitled.checked_sub(r.claimed_base_units).ok_or(LaunchError::Overflow)?;
        require!(due > 0, LaunchError::NothingToClaim);
        r.claimed_base_units = entitled;
        l.total_claimed = l.total_claimed.checked_add(due).ok_or(LaunchError::Overflow)?;
        require!(l.total_claimed <= l.backer_allocation, LaunchError::Overflow);
        let launch_key = l.key();
        let auth_seeds: &[&[u8]] = &[AUTH_SEED, launch_key.as_ref(), &[l.auth_bump]];
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(),
                Transfer { from: ctx.accounts.backer_vault.to_account_info(), to: ctx.accounts.owner_ata.to_account_info(), authority: ctx.accounts.auth.to_account_info() },
                &[auth_seeds],
            ),
            due,
        )?;
        emit!(Claimed { launch: launch_key, wallet: r.owner, amount: due, wallet_claimed_total: r.claimed_base_units });
        Ok(())
    }

    /// Reclaim a wallet's entire accepted principal once the launch is refundable. Refundability is derived from
    /// chain time inside this call; no keeper is needed. Only the receipt owner can receive the lamports.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &mut ctx.accounts.launch;
        let was_refundable = l.state() == LaunchState::Refundable;
        require!(l.derive_refundable(now), LaunchError::NotRefundable);
        if !was_refundable {
            emit!(LaunchRefundable { launch: l.key(), reason: l.refund_reason, at: now });
        }
        let r = &mut ctx.accounts.receipt;
        let due = r.contributed_lamports.checked_sub(r.refunded_lamports).ok_or(LaunchError::Overflow)?;
        require!(due > 0, LaunchError::NothingToRefund);
        r.refunded_lamports = r.contributed_lamports;
        l.total_refunded = l.total_refunded.checked_add(due).ok_or(LaunchError::Overflow)?;
        let launch_key = l.key();
        let escrow_seeds: &[&[u8]] = &[ESCROW_SEED, launch_key.as_ref(), &[l.escrow_bump]];
        transfer_lamports_signed(&ctx.accounts.escrow.to_account_info(), &ctx.accounts.owner.to_account_info(), &ctx.accounts.system_program.to_account_info(), escrow_seeds, due)?;
        emit!(Refunded { launch: launch_key, wallet: r.owner, amount: due });
        Ok(())
    }

    /// Convenience only: persist the derived REFUNDABLE state so indexers and UIs can read it. Not required for refunds.
    pub fn expire_launch(ctx: Context<ExpireLaunch>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &mut ctx.accounts.launch;
        let was = l.state() == LaunchState::Refundable;
        require!(l.derive_refundable(now), LaunchError::NotRefundable);
        if !was {
            emit!(LaunchRefundable { launch: l.key(), reason: l.refund_reason, at: now });
        }
        Ok(())
    }

    /// Anyone may add to the setup reserve without gaining any privilege.
    pub fn top_up_setup_reserve(ctx: Context<TopUpSetupReserve>, amount: u64) -> Result<()> {
        require!(amount > 0, LaunchError::ZeroAmount);
        system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.key(), system_program::Transfer { from: ctx.accounts.funder.to_account_info(), to: ctx.accounts.auth.to_account_info() }),
            amount,
        )?;
        let l = &mut ctx.accounts.launch;
        l.setup_reserve_funded = l.setup_reserve_funded.checked_add(amount).ok_or(LaunchError::Overflow)?;
        emit!(SetupReserveToppedUp { launch: l.key(), from: ctx.accounts.funder.key(), amount });
        Ok(())
    }

    /// After LIVE or REFUNDABLE the creator takes back whatever setup reserve was not consumed. Consumed pool and
    /// network costs, and the creation fee, are not returned. The authority keeps its own rent minimum.
    pub fn reclaim_unused_setup_reserve(ctx: Context<ReclaimSetupReserve>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &mut ctx.accounts.launch;
        require_keys_eq!(l.creator, ctx.accounts.creator.key(), LaunchError::NotCreator);
        let settled = l.state() == LaunchState::Live || l.derive_refundable(now);
        require!(settled, LaunchError::ReserveLocked);
        let rent_min = Rent::get()?.minimum_balance(0);
        let available = ctx.accounts.auth.lamports().saturating_sub(rent_min);
        require!(available > 0, LaunchError::NothingToRefund);
        l.setup_reserve_reclaimed = l.setup_reserve_reclaimed.checked_add(available).ok_or(LaunchError::Overflow)?;
        let launch_key = l.key();
        let auth_seeds: &[&[u8]] = &[AUTH_SEED, launch_key.as_ref(), &[l.auth_bump]];
        transfer_lamports_signed(&ctx.accounts.auth.to_account_info(), &ctx.accounts.creator.to_account_info(), &ctx.accounts.system_program.to_account_info(), auth_seeds, available)?;
        emit!(SetupReserveReclaimed { launch: launch_key, creator: l.creator, amount: available });
        Ok(())
    }
}

// ------------------------------------------------------------------------------------------------ accounts

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + ProtocolConfig::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
pub struct CreateLaunch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(init, payer = creator, space = 8 + Launch::INIT_SPACE, seeds = [LAUNCH_SEED, mint.key().as_ref()], bump)]
    pub launch: Box<Account<'info, Launch>>,
    /// The coin mint: created here, fully minted into program vaults, mint authority revoked, no freeze authority.
    #[account(init, payer = creator, mint::decimals = config.settings.decimals, mint::authority = auth)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: PDA system account. Raydium "creator", vault authority and holder of the setup reserve.
    #[account(mut, seeds = [AUTH_SEED, launch.key().as_ref()], bump)]
    pub auth: UncheckedAccount<'info>,
    /// CHECK: PDA system account holding backer principal only.
    #[account(mut, seeds = [ESCROW_SEED, launch.key().as_ref()], bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(init, payer = creator, seeds = [BACKER_VAULT_SEED, launch.key().as_ref()], bump, token::mint = mint, token::authority = auth)]
    pub backer_vault: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = creator, seeds = [POOL_VAULT_SEED, launch.key().as_ref()], bump, token::mint = mint, token::authority = auth)]
    pub pool_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: must equal the configured fee recipient.
    #[account(mut, address = config.settings.fee_recipient @ LaunchError::InvalidFeeRecipient)]
    pub fee_recipient: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: escrow PDA
    #[account(mut, seeds = [ESCROW_SEED, launch.key().as_ref()], bump = launch.escrow_bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = backer, space = 8 + ContributionReceipt::INIT_SPACE, seeds = [RECEIPT_SEED, launch.key().as_ref(), backer.key().as_ref()], bump)]
    pub receipt: Box<Account<'info, ContributionReceipt>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeLaunch<'info> {
    /// Anyone: the operated keeper normally, or any backer if the keeper is late. Pays only the network fee.
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump, has_one = mint)]
    pub launch: Box<Account<'info, Launch>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: launch authority PDA (Raydium creator, pays pool costs from the setup reserve)
    #[account(mut, seeds = [AUTH_SEED, launch.key().as_ref()], bump = launch.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    /// CHECK: escrow PDA
    #[account(mut, seeds = [ESCROW_SEED, launch.key().as_ref()], bump = launch.escrow_bump)]
    pub escrow: UncheckedAccount<'info>,
    #[account(mut, seeds = [POOL_VAULT_SEED, launch.key().as_ref()], bump = launch.pool_vault_bump)]
    pub pool_vault: Box<Account<'info, TokenAccount>>,
    #[account(address = launch.quote_mint @ LaunchError::WrongDex)]
    pub quote_mint: Box<Account<'info, Mint>>,
    /// CHECK: ATA(auth, quote mint); created here
    #[account(mut)]
    pub auth_quote: UncheckedAccount<'info>,
    /// CHECK: ATA(auth, lp mint); created by Raydium, emptied by the burn
    #[account(mut)]
    pub auth_lp: UncheckedAccount<'info>,
    /// CHECK: the approved DEX program
    #[account(address = launch.cp_swap_program @ LaunchError::WrongDex)]
    pub cp_swap_program: UncheckedAccount<'info>,
    /// CHECK: the approved AMM config
    #[account(address = launch.amm_config @ LaunchError::WrongDex)]
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK: Raydium vault/LP authority PDA, verified in the handler
    pub cp_authority: UncheckedAccount<'info>,
    /// CHECK: Raydium pool PDA, verified in the handler; must not exist yet
    #[account(mut)]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK: Raydium LP mint PDA, verified in the handler
    #[account(mut)]
    pub lp_mint: UncheckedAccount<'info>,
    /// CHECK: Raydium vault PDA, verified in the handler
    #[account(mut)]
    pub token_0_vault: UncheckedAccount<'info>,
    /// CHECK: Raydium vault PDA, verified in the handler
    #[account(mut)]
    pub token_1_vault: UncheckedAccount<'info>,
    /// CHECK: Raydium's hardcoded fee receiver token account
    #[account(mut, address = launch.create_pool_fee_receiver @ LaunchError::WrongDex)]
    pub create_pool_fee: UncheckedAccount<'info>,
    /// CHECK: Raydium observation PDA, verified in the handler
    #[account(mut)]
    pub observation_state: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    /// Anyone may sponsor a claim; tokens only ever go to the receipt owner's ATA.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump, has_one = mint)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(mut, seeds = [RECEIPT_SEED, launch.key().as_ref(), owner.key().as_ref()], bump = receipt.bump, has_one = owner, has_one = launch)]
    pub receipt: Box<Account<'info, ContributionReceipt>>,
    /// CHECK: receipt owner; need not sign
    pub owner: UncheckedAccount<'info>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: launch authority PDA
    #[account(seeds = [AUTH_SEED, launch.key().as_ref()], bump = launch.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, seeds = [BACKER_VAULT_SEED, launch.key().as_ref()], bump = launch.backer_vault_bump)]
    pub backer_vault: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = owner)]
    pub owner_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    /// Anyone may trigger a refund; lamports only ever go to the receipt owner.
    pub caller: Signer<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    #[account(mut, seeds = [RECEIPT_SEED, launch.key().as_ref(), owner.key().as_ref()], bump = receipt.bump, has_one = owner, has_one = launch)]
    pub receipt: Box<Account<'info, ContributionReceipt>>,
    /// CHECK: receipt owner receives the lamports
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    /// CHECK: escrow PDA
    #[account(mut, seeds = [ESCROW_SEED, launch.key().as_ref()], bump = launch.escrow_bump)]
    pub escrow: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireLaunch<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
}

#[derive(Accounts)]
pub struct TopUpSetupReserve<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: launch authority PDA
    #[account(mut, seeds = [AUTH_SEED, launch.key().as_ref()], bump = launch.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReclaimSetupReserve<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [LAUNCH_SEED, launch.mint.as_ref()], bump = launch.bump)]
    pub launch: Box<Account<'info, Launch>>,
    /// CHECK: launch authority PDA
    #[account(mut, seeds = [AUTH_SEED, launch.key().as_ref()], bump = launch.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
