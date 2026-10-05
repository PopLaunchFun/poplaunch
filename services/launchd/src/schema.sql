-- Pop Launch backend schema. Everything here is a cache of chain state or creator-supplied metadata;
-- contributions, claims and refunds are always decided by the program, never by these rows.

CREATE TABLE IF NOT EXISTS launches (
  address            TEXT PRIMARY KEY,
  mint               TEXT NOT NULL UNIQUE,
  creator            TEXT NOT NULL,
  version            INTEGER NOT NULL,
  chain_state        SMALLINT NOT NULL,          -- 0 funding, 1 ready, 2 live, 3 refundable (as stored on chain)
  refund_reason      SMALLINT NOT NULL DEFAULT 0,
  name               TEXT NOT NULL,
  symbol             TEXT NOT NULL,
  uri                TEXT NOT NULL,
  metadata_hash      TEXT NOT NULL,              -- hex
  target_lamports    NUMERIC(20,0) NOT NULL,
  raised_lamports    NUMERIC(20,0) NOT NULL,
  backer_wallets     INTEGER NOT NULL,
  supply             NUMERIC(20,0) NOT NULL,
  decimals           SMALLINT NOT NULL,
  backer_allocation  NUMERIC(20,0) NOT NULL,
  pool_allocation    NUMERIC(20,0) NOT NULL,
  opened_at          BIGINT NOT NULL,
  funding_deadline   BIGINT NOT NULL,
  filled_at          BIGINT NOT NULL DEFAULT 0,
  settlement_deadline BIGINT NOT NULL DEFAULT 0,
  live_at            BIGINT NOT NULL DEFAULT 0,
  pool_state         TEXT,
  lp_mint            TEXT,
  lp_burned          NUMERIC(20,0) NOT NULL DEFAULT 0,
  settled_quote      NUMERIC(20,0) NOT NULL DEFAULT 0,
  settled_base       NUMERIC(20,0) NOT NULL DEFAULT 0,
  total_claimed      NUMERIC(20,0) NOT NULL DEFAULT 0,
  total_refunded     NUMERIC(20,0) NOT NULL DEFAULT 0,
  setup_reserve_funded    NUMERIC(20,0) NOT NULL DEFAULT 0,
  setup_reserve_reclaimed NUMERIC(20,0) NOT NULL DEFAULT 0,
  creation_fee_paid  NUMERIC(20,0) NOT NULL DEFAULT 0,
  cp_swap_program    TEXT NOT NULL,
  amm_config         TEXT NOT NULL,
  updated_slot       BIGINT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS launches_state_idx ON launches (chain_state, funding_deadline);
CREATE INDEX IF NOT EXISTS launches_creator_idx ON launches (creator);

CREATE TABLE IF NOT EXISTS receipts (
  launch             TEXT NOT NULL,
  owner              TEXT NOT NULL,
  contributed        NUMERIC(20,0) NOT NULL,
  claimed            NUMERIC(20,0) NOT NULL,
  refunded           NUMERIC(20,0) NOT NULL,
  updated_slot       BIGINT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (launch, owner)
);
CREATE INDEX IF NOT EXISTS receipts_owner_idx ON receipts (owner);

-- Program events keyed by signature + index: idempotent ingestion, deduplicated by construction.
CREATE TABLE IF NOT EXISTS events (
  signature          TEXT NOT NULL,
  event_index        INTEGER NOT NULL,
  name               TEXT NOT NULL,
  launch             TEXT,
  wallet             TEXT,
  data               JSONB NOT NULL,
  slot               BIGINT NOT NULL,
  block_time         BIGINT,
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX IF NOT EXISTS events_launch_idx ON events (launch, slot DESC);
CREATE INDEX IF NOT EXISTS events_wallet_idx ON events (wallet, slot DESC);

CREATE TABLE IF NOT EXISTS images (
  id                 TEXT PRIMARY KEY,           -- sha256 hex of the bytes
  mime               TEXT NOT NULL,
  bytes              BYTEA NOT NULL,
  size               INTEGER NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A draft is keyed by the mint the creator generated client-side. It costs nothing until the launch
-- exists on chain with the same metadata hash; then it is frozen (published_at set) and never edited.
CREATE TABLE IF NOT EXISTS drafts (
  mint               TEXT PRIMARY KEY,
  creator            TEXT NOT NULL,
  name               TEXT NOT NULL,
  symbol             TEXT NOT NULL,
  description        TEXT,
  website            TEXT,
  x                  TEXT,
  image_id           TEXT NOT NULL REFERENCES images(id),
  metadata_json      JSONB NOT NULL,
  metadata_hash      TEXT NOT NULL,              -- hex sha256 of the canonical metadata JSON
  signed_at          BIGINT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at       TIMESTAMPTZ,
  hidden             BOOLEAN NOT NULL DEFAULT false  -- operator takedown of the off-chain content only
);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS drafts_creator_idx ON drafts (creator);

CREATE TABLE IF NOT EXISTS settlement_attempts (
  id                 BIGSERIAL PRIMARY KEY,
  launch             TEXT NOT NULL,
  signature          TEXT,
  status             TEXT NOT NULL,              -- sent | confirmed | failed
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlement_attempts_launch_idx ON settlement_attempts (launch, created_at DESC);

CREATE TABLE IF NOT EXISTS sync (
  key                TEXT PRIMARY KEY,
  value              TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replay protection for signed draft uploads.
CREATE TABLE IF NOT EXISTS used_signatures (
  signature          TEXT PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
