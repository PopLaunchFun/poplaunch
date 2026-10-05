//! Cross-implementation check: replay the TypeScript golden vectors (tests/vectors/golden.json)
//! through the Rust swap core on an in-memory bin store and require identical integers.
use std::cell::RefCell;
use std::collections::BTreeMap;

use anchor_lang::prelude::Pubkey;
use pop_market::math::*;
use pop_market::state::*;
use pop_market::swap_core::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct Golden {
    config: Cfg,
    p0: String,
    prices: BTreeMap<String, String>,
    pilot: Run,
    test: Run,
}

#[derive(Deserialize)]
struct Cfg {
    #[serde(rename = "seedBase")]
    seed_base: String,
    #[serde(rename = "seedQuote")]
    seed_quote: String,
    #[serde(rename = "binMin")]
    bin_min: i32,
    #[serde(rename = "binMax")]
    bin_max: i32,
    #[serde(rename = "maxBinsPerSwap")]
    max_bins_per_swap: u8,
    #[serde(rename = "scarFeeBps")]
    scar_fee_bps: u16,
    #[serde(rename = "protocolFeeBps")]
    protocol_fee_bps: u16,
    #[serde(rename = "creatorFeeBps")]
    creator_fee_bps: u16,
    #[serde(rename = "maturityQuoteTarget")]
    maturity_quote_target: String,
    #[serde(rename = "bandQuoteTarget")]
    band_quote_target: String,
    #[serde(rename = "bandsRequired")]
    bands_required: u16,
    #[serde(rename = "minQuoteIn")]
    min_quote_in: String,
    #[serde(rename = "minBaseIn")]
    min_base_in: String,
}

#[derive(Deserialize)]
struct Run {
    results: Vec<Res>,
    bins: BTreeMap<String, BTreeMap<String, String>>,
    cursor: i32,
}

#[derive(Deserialize)]
struct Res {
    #[serde(rename = "isBuy")]
    is_buy: bool,
    gross: String,
    error: Option<String>,
    output: Option<String>,
    #[serde(rename = "scarFee")]
    scar_fee: Option<String>,
    #[serde(rename = "binsInspected")]
    bins_inspected: Option<u8>,
    #[serde(rename = "newCursor")]
    new_cursor: Option<i32>,
    fills: Option<Vec<FillJ>>,
    #[serde(rename = "scarShares")]
    scar_shares: Option<Vec<ShareJ>>,
    #[serde(rename = "scarsFormed")]
    scars_formed: Option<Vec<ScarJ>>,
    #[serde(rename = "pairedQuoteLifetime")]
    paired: Option<String>,
    #[serde(rename = "hardenedBands")]
    hardened: Option<u16>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct FillJ {
    bin: i32,
    input: String,
    output: String,
    #[serde(rename = "seedOut")]
    seed_out: String,
    #[serde(rename = "scarOut")]
    scar_out: String,
    #[serde(rename = "seedIn")]
    seed_in: String,
    #[serde(rename = "scarIn")]
    scar_in: String,
}

#[derive(Deserialize)]
struct ShareJ {
    bin: i32,
    amount: String,
}

#[derive(Deserialize)]
struct ScarJ {
    bin: i32,
    base: String,
    quote: String,
}

fn u(s: &str) -> u64 {
    s.parse().unwrap()
}

fn market_from(cfg: &Cfg, test_thresholds: bool) -> Market {
    let seed_base = u(&cfg.seed_base);
    let seed_quote = u(&cfg.seed_quote);
    let mut m = Market {
        base_mint: Pubkey::default(),
        quote_mint: Pubkey::default(),
        creator: Pubkey::default(),
        base_vault: Pubkey::default(),
        quote_vault: Pubkey::default(),
        fee_vault_base: Pubkey::default(),
        fee_vault_quote: Pubkey::default(),
        p0_x64: quantize_p0(seed_quote, seed_base).unwrap(),
        bin_min: cfg.bin_min,
        bin_max: cfg.bin_max,
        bins_per_page: 16,
        band_size: 10,
        max_bins_per_swap: cfg.max_bins_per_swap,
        cursor: 0,
        status: STATUS_ACTIVE,
        is_pop_market: true,
        config_version: 1,
        scar_fee_bps: cfg.scar_fee_bps,
        protocol_fee_bps: cfg.protocol_fee_bps,
        creator_fee_bps: cfg.creator_fee_bps,
        buyback_share_bps: 5000,
        maturity_quote_target: u(&cfg.maturity_quote_target),
        band_quote_target: u(&cfg.band_quote_target),
        bands_required: cfg.bands_required,
        min_quote_in: u(&cfg.min_quote_in),
        min_base_in: u(&cfg.min_base_in),
        base_decimals: 6,
        seed_base_total: seed_base,
        seed_quote_total: seed_quote,
        unmaterialized_seed_base: seed_base,
        unmaterialized_seed_quote: seed_quote,
        allocated_supply: 0,
        vesting_count: 0,
        paired_quote_lifetime: 0,
        hardened_bands: 0,
        band_paired_quote: [0; MAX_BANDS],
        band_hardened_bits: 0,
        protocol_claimable_base: 0,
        protocol_claimable_quote: 0,
        creator_claimable_base: 0,
        creator_claimable_quote: 0,
        buyback_accrued_quote: 0,
        total_buy_volume_quote: 0,
        total_sell_volume_base: 0,
        swap_count: 0,
        created_at_slot: 0,
        activated_at_slot: 0,
        activated_at_ts: 0,
        graduated_at_slot: 0,
        name: String::new(),
        symbol: String::new(),
        uri: String::new(),
        bump: 0,
    };
    if test_thresholds {
        // packages/math testThresholds(): 1 SOL paired, 0.01 SOL per band, 2 bands
        m.maturity_quote_target = 1_000_000_000;
        m.band_quote_target = 10_000_000;
        m.bands_required = 2;
    }
    m
}

fn seeded_bins(m: &Market) -> MemBins {
    let mut map = BTreeMap::new();
    for bin in m.bin_min..=m.bin_max {
        let (sb, sq) = m.seed_allocation_for_bin(bin);
        map.insert(bin, Bin { seed_base: sb, seed_quote: sq, ..Default::default() });
    }
    MemBins(RefCell::new(map))
}

fn replay(cfg: &Cfg, run: &Run, test_thresholds: bool) {
    let mut m = market_from(cfg, test_thresholds);
    let key = Pubkey::new_unique();
    let bins = seeded_bins(&m);
    let mut held: u64 = 0;
    let mut slot: u64 = 1;
    for (i, r) in run.results.iter().enumerate() {
        let gross = u(&r.gross);
        let res = quote_swap(&m, &bins, r.is_buy, gross, 0, false);
        match (&r.error, res) {
            (Some(e), Err(err)) => {
                let s = format!("{err:?}");
                assert!(s.contains(e), "op {i}: expected error {e}, got {s}");
                continue;
            }
            (Some(e), Ok(_)) => panic!("op {i}: expected error {e} but swap succeeded"),
            (None, Err(err)) => panic!("op {i}: unexpected error {err:?}"),
            (None, Ok(q)) => {
                assert_eq!(q.output, u(r.output.as_ref().unwrap()), "op {i} output");
                assert_eq!(q.scar_fee, u(r.scar_fee.as_ref().unwrap()), "op {i} scar fee");
                assert_eq!(q.bins_inspected, r.bins_inspected.unwrap(), "op {i} bins inspected");
                assert_eq!(q.new_cursor, r.new_cursor.unwrap(), "op {i} cursor");
                let fills = r.fills.as_ref().unwrap();
                assert_eq!(q.fills.len(), fills.len(), "op {i} fill count");
                for (f, g) in q.fills.iter().zip(fills.iter()) {
                    assert_eq!(f.bin, g.bin, "op {i} fill bin");
                    assert_eq!(f.input, u(&g.input), "op {i} fill input bin {}", g.bin);
                    assert_eq!(f.output, u(&g.output), "op {i} fill output bin {}", g.bin);
                    assert_eq!(f.seed_out, u(&g.seed_out), "op {i} seed_out");
                    assert_eq!(f.scar_out, u(&g.scar_out), "op {i} scar_out");
                    assert_eq!(f.seed_in, u(&g.seed_in), "op {i} seed_in");
                    assert_eq!(f.scar_in, u(&g.scar_in), "op {i} scar_in");
                }
                let shares = r.scar_shares.as_ref().unwrap();
                assert_eq!(q.scar_shares.len(), shares.len());
                for (a, b) in q.scar_shares.iter().zip(shares.iter()) {
                    assert_eq!(*a, u(&b.amount), "op {i} scar share bin {}", b.bin);
                }
                let paired_before = m.paired_quote_lifetime;
                commit_swap(&mut m, &key, &bins, &q, r.is_buy, false, slot).unwrap();
                // scars formed: compare total paired delta and per-bin via bin state later
                let formed = r.scars_formed.as_ref().unwrap();
                let delta: u64 = formed.iter().map(|s| u(&s.quote)).sum();
                assert_eq!(m.paired_quote_lifetime - paired_before, delta, "op {i} paired delta");
                assert_eq!(m.paired_quote_lifetime, u(r.paired.as_ref().unwrap()), "op {i} paired");
                assert_eq!(m.hardened_bands, r.hardened.unwrap(), "op {i} hardened");
                let st = match m.status {
                    STATUS_ACTIVE => "active",
                    STATUS_GRADUATED => "graduated",
                    _ => "created",
                };
                assert_eq!(st, r.status.as_ref().unwrap(), "op {i} status");
                if r.is_buy {
                    held += q.output;
                } else {
                    held -= gross;
                }
                slot += 1;
            }
        }
    }
    assert_eq!(m.cursor, run.cursor);
    let map = bins.0.borrow();
    for (id, fields) in run.bins.iter() {
        let b = map.get(&id.parse::<i32>().unwrap()).unwrap();
        let get = |k: &str| u(fields.get(k).unwrap());
        assert_eq!(b.seed_base, get("seedBase"), "bin {id} seed_base");
        assert_eq!(b.seed_quote, get("seedQuote"), "bin {id} seed_quote");
        assert_eq!(b.scar_base, get("scarBase"), "bin {id} scar_base");
        assert_eq!(b.scar_quote, get("scarQuote"), "bin {id} scar_quote");
        assert_eq!(b.pending_base_eligible, get("pendingBaseEligible"), "bin {id} pending base");
        assert_eq!(b.pending_quote_eligible, get("pendingQuoteEligible"), "bin {id} pending quote");
        assert_eq!(b.paired_quote_lifetime, get("pairedQuoteLifetime"), "bin {id} paired");
        assert_eq!(b.buy_volume_quote, get("buyVolumeQuote"), "bin {id} buy vol");
        assert_eq!(b.sell_volume_base, get("sellVolumeBase"), "bin {id} sell vol");
    }
    let _ = held;
}

fn load() -> Golden {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/vectors/golden.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("golden.json; run tests/vectors/generate.ts")).unwrap()
}

#[test]
fn price_table_matches_typescript() {
    let g = load();
    let p0: u128 = g.p0.parse().unwrap();
    assert_eq!(p0, quantize_p0(u(&g.config.seed_quote), u(&g.config.seed_base)).unwrap());
    for (k, v) in g.prices.iter() {
        let i: i32 = k.parse().unwrap();
        let expected: u128 = v.parse().unwrap();
        assert_eq!(price_at_bin(p0, i).unwrap(), expected, "bin {i}");
    }
}

#[test]
fn pilot_history_matches_typescript() {
    let g = load();
    replay(&g.config, &g.pilot, false);
}

#[test]
fn test_config_history_graduates_identically() {
    let g = load();
    replay(&g.config, &g.test, true);
    assert_eq!(g.test.results.last().unwrap().status.as_deref(), Some("graduated"));
}
