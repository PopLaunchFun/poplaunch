//! Minimal client for Metaplex Token Metadata `CreateMetadataAccountV3`, built by hand so this program
//! carries no dependency on the Metaplex crate (whose pinned Solana versions conflict with Anchor 1.x).
//! Layout follows the program's instruction set: discriminator 33, DataV2, is_mutable, collection_details.
//! Pop Launch always creates metadata immutable, with the launch authority PDA as update authority.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};

pub const ID: Pubkey = Pubkey::from_str_const("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
pub const SEED: &[u8] = b"metadata";
const CREATE_METADATA_ACCOUNT_V3: u8 = 33;

pub fn pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SEED, ID.as_ref(), mint.as_ref()], &ID)
}

fn put_str(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u32).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

/// `CreateMetadataAccountV3` with no creators, no collection, no uses, zero royalties and `is_mutable = false`.
pub fn create_immutable_metadata_instruction(metadata: Pubkey, mint: Pubkey, mint_authority: Pubkey, payer: Pubkey, update_authority: Pubkey, name: &str, symbol: &str, uri: &str) -> Instruction {
    let mut data = Vec::with_capacity(64 + name.len() + symbol.len() + uri.len());
    data.push(CREATE_METADATA_ACCOUNT_V3);
    put_str(&mut data, name);
    put_str(&mut data, symbol);
    put_str(&mut data, uri);
    data.extend_from_slice(&0u16.to_le_bytes()); // seller_fee_basis_points
    data.push(0); // creators: None
    data.push(0); // collection: None
    data.push(0); // uses: None
    data.push(0); // is_mutable: false
    data.push(0); // collection_details: None
    Instruction {
        program_id: ID,
        accounts: vec![
            AccountMeta::new(metadata, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(mint_authority, true),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(update_authority, true),
            AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            AccountMeta::new_readonly(Pubkey::from_str_const("SysvarRent111111111111111111111111111111111"), false),
        ],
        data,
    }
}
