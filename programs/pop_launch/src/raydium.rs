//! Minimal client for Raydium CP-Swap's `initialize` instruction (github.com/raydium-io/raydium-cp-swap).
//! Built by hand so this program carries no dependency on Raydium's crate; account order and the Anchor
//! discriminator (sha256("global:initialize")[..8]) follow the program's IDL, which the integration tests
//! assert against the fixture built from source.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};

pub const AUTH_SEED: &[u8] = b"vault_and_lp_mint_auth_seed";
pub const POOL_SEED: &[u8] = b"pool";
pub const POOL_LP_MINT_SEED: &[u8] = b"pool_lp_mint";
pub const POOL_VAULT_SEED: &[u8] = b"pool_vault";
pub const OBSERVATION_SEED: &[u8] = b"observation";

pub const INITIALIZE_DISCRIMINATOR: [u8; 8] = [175, 175, 109, 31, 13, 152, 155, 237];

pub struct InitializeKeys {
    pub creator: Pubkey,
    pub amm_config: Pubkey,
    pub authority: Pubkey,
    pub pool_state: Pubkey,
    pub token_0_mint: Pubkey,
    pub token_1_mint: Pubkey,
    pub lp_mint: Pubkey,
    pub creator_token_0: Pubkey,
    pub creator_token_1: Pubkey,
    pub creator_lp_token: Pubkey,
    pub token_0_vault: Pubkey,
    pub token_1_vault: Pubkey,
    pub create_pool_fee: Pubkey,
    pub observation_state: Pubkey,
    pub token_program: Pubkey,
    pub token_0_program: Pubkey,
    pub token_1_program: Pubkey,
    pub associated_token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}

pub fn initialize_instruction(program_id: Pubkey, k: &InitializeKeys, init_amount_0: u64, init_amount_1: u64, open_time: u64) -> Instruction {
    let mut data = Vec::with_capacity(32);
    data.extend_from_slice(&INITIALIZE_DISCRIMINATOR);
    data.extend_from_slice(&init_amount_0.to_le_bytes());
    data.extend_from_slice(&init_amount_1.to_le_bytes());
    data.extend_from_slice(&open_time.to_le_bytes());
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(k.creator, true),
            AccountMeta::new_readonly(k.amm_config, false),
            AccountMeta::new_readonly(k.authority, false),
            AccountMeta::new(k.pool_state, false),
            AccountMeta::new_readonly(k.token_0_mint, false),
            AccountMeta::new_readonly(k.token_1_mint, false),
            AccountMeta::new(k.lp_mint, false),
            AccountMeta::new(k.creator_token_0, false),
            AccountMeta::new(k.creator_token_1, false),
            AccountMeta::new(k.creator_lp_token, false),
            AccountMeta::new(k.token_0_vault, false),
            AccountMeta::new(k.token_1_vault, false),
            AccountMeta::new(k.create_pool_fee, false),
            AccountMeta::new(k.observation_state, false),
            AccountMeta::new_readonly(k.token_program, false),
            AccountMeta::new_readonly(k.token_0_program, false),
            AccountMeta::new_readonly(k.token_1_program, false),
            AccountMeta::new_readonly(k.associated_token_program, false),
            AccountMeta::new_readonly(k.system_program, false),
            AccountMeta::new_readonly(k.rent, false),
        ],
        data,
    }
}

/// Deterministic Raydium addresses for a (config, token_0, token_1) pool. token_0 must sort below token_1.
pub struct PoolAddresses {
    pub authority: Pubkey,
    pub pool_state: Pubkey,
    pub lp_mint: Pubkey,
    pub token_0_vault: Pubkey,
    pub token_1_vault: Pubkey,
    pub observation_state: Pubkey,
}

pub fn pool_addresses(program_id: &Pubkey, amm_config: &Pubkey, token_0: &Pubkey, token_1: &Pubkey) -> PoolAddresses {
    let (authority, _) = Pubkey::find_program_address(&[AUTH_SEED], program_id);
    let (pool_state, _) = Pubkey::find_program_address(&[POOL_SEED, amm_config.as_ref(), token_0.as_ref(), token_1.as_ref()], program_id);
    let (lp_mint, _) = Pubkey::find_program_address(&[POOL_LP_MINT_SEED, pool_state.as_ref()], program_id);
    let (token_0_vault, _) = Pubkey::find_program_address(&[POOL_VAULT_SEED, pool_state.as_ref(), token_0.as_ref()], program_id);
    let (token_1_vault, _) = Pubkey::find_program_address(&[POOL_VAULT_SEED, pool_state.as_ref(), token_1.as_ref()], program_id);
    let (observation_state, _) = Pubkey::find_program_address(&[OBSERVATION_SEED, pool_state.as_ref()], program_id);
    PoolAddresses { authority, pool_state, lp_mint, token_0_vault, token_1_vault, observation_state }
}
