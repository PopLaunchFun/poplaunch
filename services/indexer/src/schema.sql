-- Idempotent schema for the POP indexer. The chain is the authority; this is a cache.
CREATE TABLE IF NOT EXISTS indexer_cursor (
  program_id TEXT PRIMARY KEY,
  last_signature TEXT,
  last_slot BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  signature TEXT NOT NULL,
  event_index INT NOT NULL,
  slot BIGINT NOT NULL,
  block_time BIGINT,
  name TEXT NOT NULL,
  market TEXT,
  data JSONB NOT NULL,
  finalized BOOLEAN NOT NULL DEFAULT false,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX IF NOT EXISTS events_market_slot ON events (market, slot DESC);
CREATE INDEX IF NOT EXISTS events_name ON events (name);
CREATE INDEX IF NOT EXISTS events_unfinalized ON events (finalized) WHERE finalized = false;

CREATE TABLE IF NOT EXISTS trades (
  signature TEXT NOT NULL,
  event_index INT NOT NULL,
  market TEXT NOT NULL,
  trader TEXT NOT NULL,
  is_buy BOOLEAN NOT NULL,
  gross_input NUMERIC(40,0) NOT NULL,
  output NUMERIC(40,0) NOT NULL,
  scar_fee NUMERIC(40,0) NOT NULL,
  protocol_fee NUMERIC(40,0) NOT NULL,
  creator_fee NUMERIC(40,0) NOT NULL,
  bins_inspected INT NOT NULL,
  start_bin INT NOT NULL,
  end_bin INT NOT NULL,
  internal_buyback BOOLEAN NOT NULL,
  -- executed average price in quote atomic per base atomic (double, display only)
  avg_price DOUBLE PRECISION,
  slot BIGINT NOT NULL,
  block_time BIGINT,
  finalized BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX IF NOT EXISTS trades_market_slot ON trades (market, slot DESC);
CREATE INDEX IF NOT EXISTS trades_market_time ON trades (market, block_time);

CREATE TABLE IF NOT EXISTS scars (
  signature TEXT NOT NULL,
  event_index INT NOT NULL,
  market TEXT NOT NULL,
  bin_id INT NOT NULL,
  base NUMERIC(40,0) NOT NULL,
  quote NUMERIC(40,0) NOT NULL,
  bin_paired_lifetime NUMERIC(40,0) NOT NULL,
  market_paired_lifetime NUMERIC(40,0) NOT NULL,
  slot BIGINT NOT NULL,
  block_time BIGINT,
  finalized BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX IF NOT EXISTS scars_market_bin ON scars (market, bin_id);

CREATE TABLE IF NOT EXISTS markets (
  address TEXT PRIMARY KEY,
  base_mint TEXT NOT NULL,
  creator TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  uri TEXT NOT NULL,
  is_pop BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  config_version INT NOT NULL,
  created_slot BIGINT NOT NULL,
  -- full decoded Market account plus derived metrics, refreshed by the snapshot loop
  state JSONB NOT NULL,
  -- bounded bin snapshot: every initialized bin with any inventory or history
  bins JSONB NOT NULL DEFAULT '[]',
  snapshot_slot BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS protocol (
  id INT PRIMARY KEY DEFAULT 1,
  state JSONB NOT NULL,
  buyback JSONB NOT NULL,
  vestings JSONB NOT NULL DEFAULT '[]',
  snapshot_slot BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
