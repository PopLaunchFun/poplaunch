//! Swap walker, fee distribution and matching over zero-copy bin pages. Mirrors
//! `packages/math/src/swap.ts` and `matching.ts` exactly.
use anchor_lang::prelude::*;

use crate::errors::PopError;
use crate::events::{BandHardened, Graduated, ScarFormed};
use crate::math::*;
use crate::state::*;

pub struct Fill {
    pub bin: i32,
    pub price: u128,
    pub input: u64,
    pub output: u64,
    pub seed_out: u64,
    pub scar_out: u64,
    pub seed_in: u64,
    pub scar_in: u64,
}

pub struct SwapResult {
    pub gross: u64,
    pub scar_fee: u64,
    pub protocol_fee: u64,
    pub creator_fee: u64,
    pub tradable: u64,
    pub fills: Vec<Fill>,
    pub scar_shares: Vec<u64>,
    pub output: u64,
    pub bins_inspected: u8,
    pub new_cursor: i32,
}

/// Access to bins by id. On-chain: zero-copy pages passed as remaining accounts. In tests: an
/// in-memory map. Both must report `PageNotProvided` for bins whose page is absent.
pub trait BinAccess {
    fn get_bin(&self, bins_per_page: i32, bin: i32) -> Result<Bin>;
    fn with_bin_mut(&self, bins_per_page: i32, bin: i32, f: &mut dyn FnMut(&mut Bin) -> Result<()>) -> Result<()>;
}

fn page_of(bins_per_page: i32, bin: i32) -> i32 {
    floor_div(bin, bins_per_page)
}

fn slot_of(bins_per_page: i32, bin: i32) -> usize {
    (bin - page_of(bins_per_page, bin) * bins_per_page) as usize
}

pub struct LoadedPage<'info> {
    pub index: i32,
    pub loader: AccountLoader<'info, BinPage>,
}

pub struct PageSet<'info>(pub Vec<LoadedPage<'info>>);

impl<'info> BinAccess for PageSet<'info> {
    fn get_bin(&self, bins_per_page: i32, bin: i32) -> Result<Bin> {
        let page = find_page(&self.0, page_of(bins_per_page, bin))?.load()?;
        Ok(page.bins[slot_of(bins_per_page, bin)])
    }
    fn with_bin_mut(&self, bins_per_page: i32, bin: i32, f: &mut dyn FnMut(&mut Bin) -> Result<()>) -> Result<()> {
        let mut page = find_page(&self.0, page_of(bins_per_page, bin))?.load_mut()?;
        f(&mut page.bins[slot_of(bins_per_page, bin)])
    }
}

/// In-memory bins for host-side tests and reference checks.
pub struct MemBins(pub std::cell::RefCell<std::collections::BTreeMap<i32, Bin>>);

impl BinAccess for MemBins {
    fn get_bin(&self, _bins_per_page: i32, bin: i32) -> Result<Bin> {
        self.0.borrow().get(&bin).copied().ok_or_else(|| error!(PopError::PageNotProvided))
    }
    fn with_bin_mut(&self, _bins_per_page: i32, bin: i32, f: &mut dyn FnMut(&mut Bin) -> Result<()>) -> Result<()> {
        let mut m = self.0.borrow_mut();
        let b = m.get_mut(&bin).ok_or_else(|| error!(PopError::PageNotProvided))?;
        f(b)
    }
}

/// Validate and load bin pages passed as remaining accounts.
pub fn load_pages<'info>(
    program_id: &Pubkey,
    market_key: &Pubkey,
    market: &Market,
    remaining: &'info [AccountInfo<'info>],
) -> Result<PageSet<'info>> {
    let mut out: Vec<LoadedPage<'info>> = Vec::with_capacity(remaining.len());
    for acc in remaining.iter() {
        let loader: AccountLoader<'info, BinPage> = AccountLoader::try_from(acc)?;
        let (index, bump) = {
            let page = loader.load()?;
            require_keys_eq!(page.market, *market_key, PopError::InvalidPage);
            (page.page_index, page.bump)
        };
        require!(index >= market.min_page() && index <= market.max_page(), PopError::PageOutOfRange);
        let expected = Pubkey::create_program_address(
            &[SEED_PAGE, market_key.as_ref(), &index.to_le_bytes(), &[bump]],
            program_id,
        )
        .map_err(|_| error!(PopError::InvalidPage))?;
        require_keys_eq!(expected, acc.key(), PopError::InvalidPage);
        if out.iter().any(|p| p.index == index) {
            continue;
        }
        out.push(LoadedPage { index, loader });
    }
    Ok(PageSet(out))
}

pub fn find_page<'a, 'info>(pages: &'a [LoadedPage<'info>], index: i32) -> Result<&'a AccountLoader<'info, BinPage>> {
    pages
        .iter()
        .find(|p| p.index == index)
        .map(|p| &p.loader)
        .ok_or_else(|| error!(PopError::PageNotProvided))
}

/// Pure quote: computes the route over a snapshot of the pages. No state change.
pub fn quote_swap(
    market: &Market,
    pages: &dyn BinAccess,
    is_buy: bool,
    gross: u64,
    min_output: u64,
    internal_buyback: bool,
) -> Result<SwapResult> {
    require!(market.status == STATUS_ACTIVE || market.status == STATUS_GRADUATED, PopError::MarketNotActive);
    let min_in = if is_buy { market.min_quote_in } else { market.min_base_in };
    require!(gross >= min_in, PopError::InputBelowMinimum);

    let scar_fee = fee_of(gross, market.scar_fee_bps);
    let (protocol_fee, creator_fee) = if internal_buyback {
        (0, 0)
    } else {
        (fee_of(gross, market.protocol_fee_bps), fee_of(gross, market.creator_fee_bps))
    };
    let tradable = gross
        .checked_sub(scar_fee)
        .and_then(|x| x.checked_sub(protocol_fee))
        .and_then(|x| x.checked_sub(creator_fee))
        .ok_or(PopError::Overflow)?;
    require!(tradable > 0, PopError::ZeroTradable);

    let dir: i32 = if is_buy { 1 } else { -1 };
    let mut bin = market.cursor;
    let mut remaining = tradable;
    let mut inspected: u8 = 0;
    let mut fills: Vec<Fill> = Vec::with_capacity(market.max_bins_per_swap as usize);
    let mut last_fill_bin = market.cursor;
    let mut output: u64 = 0;

    while remaining > 0 {
        if !market.in_range(bin) {
            return Err(if is_buy { PopError::BuyInventoryExhausted.into() } else { PopError::SellInventoryExhausted.into() });
        }
        require!(inspected < market.max_bins_per_swap, PopError::TraversalLimit);
        inspected += 1;
        let b = pages.get_bin(market.bins_per_page as i32, bin)?;
        let (seed_avail, scar_avail) = if is_buy { (b.seed_base, b.scar_base) } else { (b.seed_quote, b.scar_quote) };
        let avail = seed_avail.checked_add(scar_avail).ok_or(PopError::Overflow)?;
        if avail == 0 {
            bin += dir;
            continue;
        }
        let price = price_at_bin(market.p0_x64, bin).ok_or(PopError::PriceRange)?;
        let (out, input): (u64, u64) = if is_buy {
            let need = quote_for_base_ceil(avail, price).ok_or(PopError::Overflow)?;
            if (remaining as u128) >= need {
                (avail, need as u64)
            } else {
                let o = base_for_quote_floor(remaining, price).ok_or(PopError::Overflow)?;
                (to_u64(o).ok_or(PopError::Overflow)?, remaining)
            }
        } else {
            let need = base_for_quote_ceil(avail, price).ok_or(PopError::Overflow)?;
            if (remaining as u128) >= need {
                (avail, need as u64)
            } else {
                let o = quote_for_base_floor(remaining, price).ok_or(PopError::Overflow)?;
                (to_u64(o).ok_or(PopError::Overflow)?, remaining)
            }
        };
        require!(out <= avail, PopError::Invariant);
        let (seed_out, scar_out) = split_by_output_inventory(out, seed_avail, scar_avail).ok_or(PopError::Invariant)?;
        let (seed_in, scar_in) = split_by_output_inventory(input, seed_avail, scar_avail).ok_or(PopError::Invariant)?;
        fills.push(Fill { bin, price, input, output: out, seed_out, scar_out, seed_in, scar_in });
        output = output.checked_add(out).ok_or(PopError::Overflow)?;
        remaining -= input;
        last_fill_bin = bin;
        if remaining == 0 {
            break;
        }
        bin += dir;
    }
    require!(!fills.is_empty(), PopError::NoExecutableFill);
    require!(output >= min_output, PopError::OutputBelowMinimum);

    // Largest-remainder distribution of the scar fee across visited bins by executed input.
    let bins: Vec<i32> = fills.iter().map(|f| f.bin).collect();
    let weights: Vec<u64> = fills.iter().map(|f| f.input).collect();
    let shares = largest_remainder::<MAX_FILLS>(scar_fee, &bins, &weights).ok_or(PopError::Overflow)?;
    let scar_shares: Vec<u64> = shares[..fills.len()].to_vec();

    Ok(SwapResult {
        gross,
        scar_fee,
        protocol_fee,
        creator_fee,
        tradable,
        fills,
        scar_shares,
        output,
        bins_inspected: inspected,
        new_cursor: last_fill_bin,
    })
}

/// Apply a computed route to the pages and market: fills, scar escrow, revenue, cursor, then
/// matching at visited bins (scars formed here are only usable by later transactions).
pub fn commit_swap(
    market: &mut Market,
    market_key: &Pubkey,
    pages: &dyn BinAccess,
    r: &SwapResult,
    is_buy: bool,
    internal_buyback: bool,
    slot: u64,
) -> Result<()> {
    for (j, f) in r.fills.iter().enumerate() {
        let share = r.scar_shares[j];
        let bpp = market.bins_per_page as i32;
        pages.with_bin_mut(bpp, f.bin, &mut |b: &mut Bin| {
            if is_buy {
                b.seed_base = b.seed_base.checked_sub(f.seed_out).ok_or(PopError::Invariant)?;
                b.scar_base = b.scar_base.checked_sub(f.scar_out).ok_or(PopError::Invariant)?;
                b.seed_quote = b.seed_quote.checked_add(f.seed_in).ok_or(PopError::Overflow)?;
                b.scar_quote = b.scar_quote.checked_add(f.scar_in).ok_or(PopError::Overflow)?;
                b.buy_volume_quote = b.buy_volume_quote.checked_add(f.input).ok_or(PopError::Overflow)?;
                if internal_buyback {
                    b.pending_quote_ineligible = b.pending_quote_ineligible.checked_add(share).ok_or(PopError::Overflow)?;
                } else {
                    b.pending_quote_eligible = b.pending_quote_eligible.checked_add(share).ok_or(PopError::Overflow)?;
                }
            } else {
                b.seed_quote = b.seed_quote.checked_sub(f.seed_out).ok_or(PopError::Invariant)?;
                b.scar_quote = b.scar_quote.checked_sub(f.scar_out).ok_or(PopError::Invariant)?;
                b.seed_base = b.seed_base.checked_add(f.seed_in).ok_or(PopError::Overflow)?;
                b.scar_base = b.scar_base.checked_add(f.scar_in).ok_or(PopError::Overflow)?;
                b.sell_volume_base = b.sell_volume_base.checked_add(f.input).ok_or(PopError::Overflow)?;
                if internal_buyback {
                    b.pending_base_ineligible = b.pending_base_ineligible.checked_add(share).ok_or(PopError::Overflow)?;
                } else {
                    b.pending_base_eligible = b.pending_base_eligible.checked_add(share).ok_or(PopError::Overflow)?;
                }
            }
            b.last_execution_slot = slot;
            Ok(())
        })?;
    }

    if is_buy {
        let (buyback, operating) = if market.is_pop_market {
            (0u64, r.protocol_fee)
        } else {
            let bb = ((r.protocol_fee as u128) * (market.buyback_share_bps as u128) / 10_000) as u64;
            (bb, r.protocol_fee - bb)
        };
        market.protocol_claimable_quote = market.protocol_claimable_quote.checked_add(operating).ok_or(PopError::Overflow)?;
        market.buyback_accrued_quote = market.buyback_accrued_quote.checked_add(buyback).ok_or(PopError::Overflow)?;
        market.creator_claimable_quote = market.creator_claimable_quote.checked_add(r.creator_fee).ok_or(PopError::Overflow)?;
        market.total_buy_volume_quote = market.total_buy_volume_quote.checked_add(r.gross).ok_or(PopError::Overflow)?;
    } else {
        market.protocol_claimable_base = market.protocol_claimable_base.checked_add(r.protocol_fee).ok_or(PopError::Overflow)?;
        market.creator_claimable_base = market.creator_claimable_base.checked_add(r.creator_fee).ok_or(PopError::Overflow)?;
        market.total_sell_volume_base = market.total_sell_volume_base.checked_add(r.gross).ok_or(PopError::Overflow)?;
    }
    market.cursor = r.new_cursor;
    market.swap_count = market.swap_count.checked_add(1).ok_or(PopError::Overflow)?;

    let bpp = market.bins_per_page as i32;
    for f in r.fills.iter() {
        let price = f.price;
        let bin_id = f.bin;
        pages.with_bin_mut(bpp, bin_id, &mut |b: &mut Bin| {
            match_bin(market, market_key, bin_id, b, price, slot)?;
            Ok(())
        })?;
    }
    Ok(())
}

/// Match eligible pending escrow at one bin and update maturity counters. Idempotent when
/// nothing is matchable. Emits ScarFormed / BandHardened / Graduated.
pub fn match_bin(market: &mut Market, market_key: &Pubkey, bin_id: i32, b: &mut Bin, price: u128, slot: u64) -> Result<bool> {
    let Some((base, quote)) = match_amounts(b.pending_base_eligible, b.pending_quote_eligible, price) else {
        return Ok(false);
    };
    b.pending_base_eligible -= base;
    b.pending_quote_eligible -= quote;
    b.scar_base = b.scar_base.checked_add(base).ok_or(PopError::Overflow)?;
    b.scar_quote = b.scar_quote.checked_add(quote).ok_or(PopError::Overflow)?;
    b.paired_quote_lifetime = b.paired_quote_lifetime.checked_add(quote).ok_or(PopError::Overflow)?;

    let slot_idx = market.band_slot(bin_id);
    market.band_paired_quote[slot_idx] = market.band_paired_quote[slot_idx].checked_add(quote).ok_or(PopError::Overflow)?;
    market.paired_quote_lifetime = market.paired_quote_lifetime.checked_add(quote).ok_or(PopError::Overflow)?;
    emit!(ScarFormed {
        market: *market_key,
        bin_id,
        base,
        quote,
        bin_paired_quote_lifetime: b.paired_quote_lifetime,
        market_paired_quote_lifetime: market.paired_quote_lifetime,
    });
    let bit = 1u64 << slot_idx;
    if market.band_hardened_bits & bit == 0 && market.band_paired_quote[slot_idx] >= market.band_quote_target {
        market.band_hardened_bits |= bit;
        market.hardened_bands += 1;
        emit!(BandHardened {
            market: *market_key,
            band: market.band_index(bin_id),
            paired_quote: market.band_paired_quote[slot_idx],
            hardened_bands: market.hardened_bands,
        });
    }
    evaluate_graduation(market, market_key, slot);
    Ok(true)
}

/// Irreversible status transition derived from stored counters only.
pub fn evaluate_graduation(market: &mut Market, market_key: &Pubkey, slot: u64) -> bool {
    if market.status == STATUS_ACTIVE
        && market.paired_quote_lifetime >= market.maturity_quote_target
        && market.hardened_bands >= market.bands_required
    {
        market.status = STATUS_GRADUATED;
        market.graduated_at_slot = slot;
        emit!(Graduated {
            market: *market_key,
            paired_quote_lifetime: market.paired_quote_lifetime,
            hardened_bands: market.hardened_bands,
            slot,
        });
        return true;
    }
    false
}
