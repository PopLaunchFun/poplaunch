//! Checked integer math mirroring `packages/math` exactly. Prices are Q64.64 in u128
//! (quote atomic units per base atomic unit). Amounts are u64.

pub const MASK64: u128 = (1u128 << 64) - 1;
pub const MIN_P0_X64: u128 = 1u128 << 32;

/// round(1.01^(2^k) * 2^64), k = 0..8
pub const UP_X64: [u128; 9] = [
    18631211514446647132,
    18817523629591113603,
    19195755854545894987,
    19975180517221435052,
    21630258169204612293,
    25363178813395704310,
    34872866287395834719,
    65925823995780828431,
    235608747655198994952,
];

/// round((100/101)^(2^k) * 2^64), k = 0..6
pub const DOWN_X64: [u128; 7] = [
    18264103043276783778,
    18083270339878003741,
    17726958474539754672,
    17035258661495792883,
    15731775564537856108,
    13416392693695651194,
    9757797484055027497,
];

pub const MAX_UP_EXPONENT: i32 = (1 << 9) - 1;
pub const MAX_DOWN_EXPONENT: i32 = (1 << 7) - 1;

/// floor((a * b) / 2^64) with a 256-bit intermediate. None on overflow of the u128 result.
pub fn mul_shr64(a: u128, b: u128) -> Option<u128> {
    let a_hi = a >> 64;
    let a_lo = a & MASK64;
    let b_hi = b >> 64;
    let b_lo = b & MASK64;
    let ll = a_lo * b_lo; // < 2^128
    let lh = a_lo * b_hi;
    let hl = a_hi * b_lo;
    let hh = a_hi * b_hi;
    let mid = (ll >> 64).checked_add(lh)?.checked_add(hl)?;
    if hh > MASK64 {
        return None;
    }
    (hh << 64).checked_add(mid)
}

/// Low 64 bits of (a * b), used to detect a nonzero fractional part.
fn mul_low64(a: u128, b: u128) -> u128 {
    a.wrapping_mul(b) & MASK64
}

/// floor(q * 2^64 / p)
pub fn base_for_quote_floor(q: u64, p: u128) -> Option<u128> {
    if p == 0 {
        return None;
    }
    Some(((q as u128) << 64) / p)
}

/// ceil(q * 2^64 / p)
pub fn base_for_quote_ceil(q: u64, p: u128) -> Option<u128> {
    if p == 0 {
        return None;
    }
    let num = (q as u128) << 64;
    let d = num / p;
    Some(if num % p == 0 { d } else { d + 1 })
}

/// floor(b * p / 2^64)
pub fn quote_for_base_floor(b: u64, p: u128) -> Option<u128> {
    mul_shr64(b as u128, p)
}

/// ceil(b * p / 2^64)
pub fn quote_for_base_ceil(b: u64, p: u128) -> Option<u128> {
    let f = mul_shr64(b as u128, p)?;
    if mul_low64(b as u128, p) == 0 {
        Some(f)
    } else {
        f.checked_add(1)
    }
}

pub fn to_u64(x: u128) -> Option<u64> {
    u64::try_from(x).ok()
}

/// p0_x64 = floor(seed_quote * 2^64 / seed_base); must be >= 2^32.
pub fn quantize_p0(seed_quote: u64, seed_base: u64) -> Option<u128> {
    if seed_base == 0 || seed_quote == 0 {
        return None;
    }
    let p0 = ((seed_quote as u128) << 64) / (seed_base as u128);
    if p0 < MIN_P0_X64 {
        return None;
    }
    Some(p0)
}

/// P_i = P0 * 1.01^i via binary exponentiation with floor at each multiplication.
pub fn price_at_bin(p0_x64: u128, i: i32) -> Option<u128> {
    let mut price = p0_x64;
    if i > 0 {
        if i > MAX_UP_EXPONENT {
            return None;
        }
        for (k, c) in UP_X64.iter().enumerate() {
            if (i >> k) & 1 == 1 {
                price = mul_shr64(price, *c)?;
            }
        }
    } else if i < 0 {
        let e = -i;
        if e > MAX_DOWN_EXPONENT {
            return None;
        }
        for (k, c) in DOWN_X64.iter().enumerate() {
            if (e >> k) & 1 == 1 {
                price = mul_shr64(price, *c)?;
            }
        }
    }
    if price == 0 {
        None
    } else {
        Some(price)
    }
}

/// True floor division for i32 (Rust `/` truncates toward zero).
pub fn floor_div(a: i32, b: i32) -> i32 {
    let q = a / b;
    if a % b != 0 && ((a < 0) != (b < 0)) {
        q - 1
    } else {
        q
    }
}

pub fn fee_of(gross: u64, bps: u16) -> u64 {
    ((gross as u128 * bps as u128) / 10_000) as u64
}

/// Split `amount` between seed and scar proportionally to the available OUTPUT inventory of each
/// class. Scar share is floored; the residual goes to seed; if seed inventory is zero the scar
/// class takes everything.
pub fn split_by_output_inventory(amount: u64, seed_avail: u64, scar_avail: u64) -> Option<(u64, u64)> {
    let avail = (seed_avail as u128) + (scar_avail as u128);
    if avail == 0 {
        return None;
    }
    if seed_avail == 0 {
        return Some((0, amount));
    }
    let scar = ((amount as u128) * (scar_avail as u128) / avail) as u64;
    Some((amount - scar, scar))
}

/// Largest-remainder allocation of `total` across up to N weights; ties by ascending bin id.
/// Returns amounts aligned with `weights`. Zero-weight entries receive 0.
pub fn largest_remainder<const N: usize>(total: u64, bins: &[i32], weights: &[u64]) -> Option<[u64; N]> {
    let n = weights.len();
    let mut out = [0u64; N];
    if total == 0 || n == 0 {
        return Some(out);
    }
    let sum: u128 = weights.iter().map(|w| *w as u128).sum();
    if sum == 0 {
        return Some(out);
    }
    let mut rems = [0u128; N];
    let mut assigned: u128 = 0;
    for j in 0..n {
        if weights[j] == 0 {
            continue;
        }
        let prod = (total as u128) * (weights[j] as u128);
        out[j] = (prod / sum) as u64;
        rems[j] = prod % sum;
        assigned += out[j] as u128;
    }
    let mut leftover = (total as u128).checked_sub(assigned)?;
    let mut used = [false; N];
    while leftover > 0 {
        // pick (max remainder, then lowest bin id) among unused positive-weight entries
        let mut best: Option<usize> = None;
        for j in 0..n {
            if used[j] || weights[j] == 0 {
                continue;
            }
            match best {
                None => best = Some(j),
                Some(b) => {
                    if rems[j] > rems[b] || (rems[j] == rems[b] && bins[j] < bins[b]) {
                        best = Some(j);
                    }
                }
            }
        }
        let b = best?;
        used[b] = true;
        out[b] += 1;
        leftover -= 1;
    }
    Some(out)
}

/// Matching at a fixed bin: largest b <= B with q = ceil(b * P) <= Q. Returns (b, q) or None.
pub fn match_amounts(pending_base: u64, pending_quote: u64, price_x64: u128) -> Option<(u64, u64)> {
    if pending_base == 0 || pending_quote == 0 {
        return None;
    }
    let b_max = base_for_quote_floor(pending_quote, price_x64)?;
    let b = core::cmp::min(pending_base as u128, b_max) as u64;
    if b == 0 {
        return None;
    }
    let q = to_u64(quote_for_base_ceil(b, price_x64)?)?;
    if q == 0 || q > pending_quote {
        return None;
    }
    Some((b, q))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn p0_matches_typescript() {
        let p0 = quantize_p0(20_000_000_000, 900_000_000_000_000).unwrap();
        assert_eq!(p0, 409927646082434);
    }

    #[test]
    fn prices_monotonic_and_in_range() {
        let p0 = quantize_p0(20_000_000_000, 900_000_000_000_000).unwrap();
        let mut prev = 0u128;
        for i in -64..=511 {
            let p = price_at_bin(p0, i).unwrap();
            assert!(p > prev);
            prev = p;
        }
        assert!(price_at_bin(p0, 512).is_none());
        assert!(price_at_bin(p0, -128).is_none());
    }

    #[test]
    fn mul_shr64_matches_wide_multiplication() {
        // compare against a simple reference using u128 halves on values that fit
        let cases: [(u128, u128); 5] = [
            (409927646082434, UP_X64[8]),
            (1 << 100, 1 << 27),
            (u64::MAX as u128, u64::MAX as u128),
            (12345678901234567890123, 98765432109876543210),
            (0, 1),
        ];
        for (a, b) in cases {
            let r = mul_shr64(a, b).unwrap();
            // reference via 4 limbs of 32 bits is complex; instead check (r << 64) <= a*b < (r+1) << 64 using
            // the identity with checked ops where representable
            if let Some(prod) = a.checked_mul(b) {
                assert_eq!(r, prod >> 64);
            }
        }
        assert!(mul_shr64(1 << 127, 1 << 70).is_none());
    }

    #[test]
    fn floor_div_negatives() {
        assert_eq!(floor_div(-1, 10), -1);
        assert_eq!(floor_div(-10, 10), -1);
        assert_eq!(floor_div(-11, 10), -2);
        assert_eq!(floor_div(9, 10), 0);
        assert_eq!(floor_div(-1, 16), -1);
        assert_eq!(floor_div(-64, 16), -4);
    }

    #[test]
    fn fees_and_remainder() {
        assert_eq!(fee_of(100_000_000_000, 150), 1_500_000_000);
        let out = largest_remainder::<4>(10, &[3, 1, 2], &[1, 1, 1]).unwrap();
        assert_eq!(out, [3, 4, 3, 0]);
    }

    #[test]
    fn matching_example() {
        let price = (1u128 << 64) / 1000; // 1e-3 lamports per atomic
        let (b, q) = match_amounts(315_000 * 1_000_000, 460_000_000, price).unwrap();
        assert_eq!(b, 315_000 * 1_000_000);
        assert!(q <= 315_000_000 && q >= 315_000_000 - 1);
    }
}
