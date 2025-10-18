-- Migration 004: Market Data Tables for Production
--
-- Creates TimescaleDB hypertables for real-time market data ingestion:
-- 1. CEX liquidation events (Binance, Bybit, OKX, Deribit)
-- 2. Bridge health metrics (9 bridges)
-- 3. Chain congestion metrics (6 chains)
--
-- All tables optimized for high-frequency writes and time-series queries
-- Retention: 90 days for raw data, 1 year for aggregates

-- =====================================================
-- CEX Liquidation Events
-- =====================================================

CREATE TABLE IF NOT EXISTS cex_liquidations (
  id BIGSERIAL,
  exchange VARCHAR(20) NOT NULL,          -- binance, bybit, okx, deribit
  symbol VARCHAR(20) NOT NULL,            -- BTCUSDT, ETHUSDT, etc.
  side VARCHAR(10) NOT NULL,              -- long, short
  quantity DECIMAL(18, 8) NOT NULL,       -- Liquidated quantity
  price DECIMAL(18, 2) NOT NULL,          -- Liquidation price
  value_usd_cents BIGINT NOT NULL,        -- Total value in USD cents
  liquidation_time TIMESTAMPTZ NOT NULL,  -- Exchange-reported time
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  raw_data JSONB                          -- Store raw exchange response
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable(
  'cex_liquidations',
  'liquidation_time',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_cex_liquidations_exchange_time
  ON cex_liquidations (exchange, liquidation_time DESC);

CREATE INDEX IF NOT EXISTS idx_cex_liquidations_symbol_time
  ON cex_liquidations (symbol, liquidation_time DESC);

CREATE INDEX IF NOT EXISTS idx_cex_liquidations_value
  ON cex_liquidations (value_usd_cents DESC, liquidation_time DESC);

-- Compression policy (compress after 7 days)
SELECT add_compression_policy('cex_liquidations', INTERVAL '7 days');

-- Retention policy (drop after 90 days)
SELECT add_retention_policy('cex_liquidations', INTERVAL '90 days');


-- =====================================================
-- CEX Liquidation Aggregates (1-hour rollup)
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS cex_liquidations_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', liquidation_time) AS hour,
  exchange,
  symbol,
  side,
  COUNT(*) AS liquidation_count,
  SUM(quantity) AS total_quantity,
  SUM(value_usd_cents) AS total_value_usd_cents,
  AVG(value_usd_cents) AS avg_liquidation_size_usd_cents,
  MAX(value_usd_cents) AS largest_liquidation_usd_cents,
  MIN(price) AS min_price,
  MAX(price) AS max_price
FROM cex_liquidations
GROUP BY hour, exchange, symbol, side;

-- Refresh policy (update every 15 minutes)
SELECT add_continuous_aggregate_policy('cex_liquidations_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes');


-- =====================================================
-- Bridge Health Metrics
-- =====================================================

CREATE TABLE IF NOT EXISTS bridge_health_metrics (
  id BIGSERIAL,
  bridge_id VARCHAR(50) NOT NULL,         -- wormhole, layerzero, axelar, etc.

  -- TVL metrics
  tvl_usd_cents BIGINT NOT NULL,
  tvl_24h_change_pct DECIMAL(10, 4),

  -- Volume metrics
  daily_volume_usd_cents BIGINT,

  -- Transaction metrics
  total_tx_count INTEGER NOT NULL,
  failed_tx_count INTEGER NOT NULL,
  failed_tx_rate DECIMAL(10, 6),          -- Calculated: failed / total
  avg_transfer_time_seconds INTEGER,

  -- Security metrics
  security_score DECIMAL(5, 4) NOT NULL,  -- 0.0000 - 1.0000 from L2Beat
  recent_exploits BOOLEAN NOT NULL DEFAULT FALSE,

  -- Composite health
  health_score DECIMAL(5, 4) NOT NULL,    -- 0.0000 - 1.0000 composite
  risk_multiplier DECIMAL(5, 2) NOT NULL, -- 1.00 - 2.50 for pricing

  -- Metadata
  data_sources TEXT[],                    -- ['defillama', 'l2beat']
  timestamp TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  raw_data JSONB
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable(
  'bridge_health_metrics',
  'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bridge_health_bridge_time
  ON bridge_health_metrics (bridge_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_health_score
  ON bridge_health_metrics (health_score, timestamp DESC);

-- Compression after 14 days
SELECT add_compression_policy('bridge_health_metrics', INTERVAL '14 days');

-- Retention: 1 year
SELECT add_retention_policy('bridge_health_metrics', INTERVAL '1 year');


-- =====================================================
-- Bridge Health Aggregates (1-hour rollup)
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS bridge_health_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS hour,
  bridge_id,
  AVG(tvl_usd_cents) AS avg_tvl_usd_cents,
  AVG(health_score) AS avg_health_score,
  AVG(risk_multiplier) AS avg_risk_multiplier,
  AVG(failed_tx_rate) AS avg_failed_tx_rate,
  MAX(recent_exploits::int) AS had_exploit  -- 1 if any exploit in hour
FROM bridge_health_metrics
GROUP BY hour, bridge_id;

SELECT add_continuous_aggregate_policy('bridge_health_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes');


-- =====================================================
-- Chain Congestion Metrics
-- =====================================================

CREATE TABLE IF NOT EXISTS chain_metrics (
  id BIGSERIAL,
  chain VARCHAR(50) NOT NULL,             -- ethereum, arbitrum, base, polygon, solana, ton

  -- Gas metrics (EVM chains)
  avg_gas_price_gwei DECIMAL(18, 8),

  -- Block metrics
  avg_block_time_ms INTEGER NOT NULL,

  -- Mempool metrics
  mempool_size INTEGER,
  pending_tx_count INTEGER NOT NULL,

  -- Congestion score
  congestion_score DECIMAL(5, 4) NOT NULL, -- 0.0000 - 1.0000
  risk_multiplier DECIMAL(5, 2) NOT NULL,  -- 1.00 - 1.30 for pricing

  -- Metadata
  data_source VARCHAR(50) NOT NULL,        -- etherscan, arbiscan, solana_rpc, etc.
  timestamp TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  raw_data JSONB
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable(
  'chain_metrics',
  'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chain_metrics_chain_time
  ON chain_metrics (chain, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_chain_metrics_congestion
  ON chain_metrics (congestion_score DESC, timestamp DESC);

-- Compression after 14 days
SELECT add_compression_policy('chain_metrics', INTERVAL '14 days');

-- Retention: 1 year
SELECT add_retention_policy('chain_metrics', INTERVAL '1 year');


-- =====================================================
-- Chain Metrics Aggregates (5-minute rollup)
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS chain_metrics_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', timestamp) AS bucket,
  chain,
  AVG(avg_gas_price_gwei) AS avg_gas_price_gwei,
  AVG(avg_block_time_ms) AS avg_block_time_ms,
  AVG(pending_tx_count) AS avg_pending_tx_count,
  AVG(congestion_score) AS avg_congestion_score,
  AVG(risk_multiplier) AS avg_risk_multiplier,
  MAX(congestion_score) AS max_congestion_score
FROM chain_metrics
GROUP BY bucket, chain;

SELECT add_continuous_aggregate_policy('chain_metrics_5min',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes');


-- =====================================================
-- Market Stress Indicators
-- =====================================================

CREATE TABLE IF NOT EXISTS market_stress_indicators (
  id BIGSERIAL,

  -- Liquidation stress
  total_liquidations_1h_usd_cents BIGINT,
  total_liquidations_24h_usd_cents BIGINT,
  liquidation_stress_level VARCHAR(20),   -- normal, elevated, high, extreme

  -- Bridge stress
  unhealthy_bridge_count INTEGER,
  critical_bridge_count INTEGER,
  avg_bridge_health DECIMAL(5, 4),

  -- Chain stress
  congested_chain_count INTEGER,
  avg_chain_congestion DECIMAL(5, 4),

  -- Composite stress score
  market_stress_score DECIMAL(5, 4) NOT NULL,
  stress_level VARCHAR(20) NOT NULL,      -- normal, elevated, high, extreme

  timestamp TIMESTAMPTZ NOT NULL,

  -- Risk adjustments
  recommended_global_multiplier DECIMAL(5, 2), -- Apply to all pricing

  metadata JSONB
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable(
  'market_stress_indicators',
  'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

CREATE INDEX IF NOT EXISTS idx_market_stress_time
  ON market_stress_indicators (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_market_stress_level
  ON market_stress_indicators (stress_level, timestamp DESC);


-- =====================================================
-- Helper Views for Risk Model Integration
-- =====================================================

-- Latest liquidation summary (last 24h)
CREATE OR REPLACE VIEW latest_liquidation_summary AS
SELECT
  exchange,
  symbol,
  SUM(value_usd_cents) AS total_liquidated_24h_cents,
  COUNT(*) AS liquidation_count_24h,
  AVG(value_usd_cents) AS avg_liquidation_size_cents
FROM cex_liquidations
WHERE liquidation_time >= NOW() - INTERVAL '24 hours'
GROUP BY exchange, symbol
ORDER BY total_liquidated_24h_cents DESC;

-- Latest bridge health summary
CREATE OR REPLACE VIEW latest_bridge_health AS
SELECT DISTINCT ON (bridge_id)
  bridge_id,
  tvl_usd_cents,
  health_score,
  risk_multiplier,
  failed_tx_rate,
  recent_exploits,
  timestamp
FROM bridge_health_metrics
ORDER BY bridge_id, timestamp DESC;

-- Latest chain metrics summary
CREATE OR REPLACE VIEW latest_chain_metrics AS
SELECT DISTINCT ON (chain)
  chain,
  avg_gas_price_gwei,
  avg_block_time_ms,
  congestion_score,
  risk_multiplier,
  timestamp
FROM chain_metrics
ORDER BY chain, timestamp DESC;

-- Latest market stress
CREATE OR REPLACE VIEW latest_market_stress AS
SELECT *
FROM market_stress_indicators
ORDER BY timestamp DESC
LIMIT 1;


-- =====================================================
-- Data Freshness Monitoring
-- =====================================================

CREATE TABLE IF NOT EXISTS data_source_health (
  id BIGSERIAL PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,      -- 'binance_liquidations', 'defillama_bridges', etc.
  source_type VARCHAR(50) NOT NULL,       -- 'cex', 'bridge', 'chain'
  last_successful_fetch TIMESTAMPTZ,
  last_failed_fetch TIMESTAMPTZ,
  failure_count_1h INTEGER DEFAULT 0,
  is_healthy BOOLEAN DEFAULT TRUE,
  staleness_threshold_minutes INTEGER NOT NULL,
  alert_sent BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_source_health_name
  ON data_source_health (source_name);


-- =====================================================
-- Grant Permissions
-- =====================================================

-- Grant read access to application user
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tonsurance_app;
GRANT SELECT ON ALL VIEWS IN SCHEMA public TO tonsurance_app;

-- Grant write access to ingestion service
GRANT INSERT, UPDATE ON cex_liquidations TO tonsurance_ingestion;
GRANT INSERT, UPDATE ON bridge_health_metrics TO tonsurance_ingestion;
GRANT INSERT, UPDATE ON chain_metrics TO tonsurance_ingestion;
GRANT INSERT, UPDATE ON market_stress_indicators TO tonsurance_ingestion;
GRANT ALL ON data_source_health TO tonsurance_ingestion;


-- =====================================================
-- Sample Queries for Testing
-- =====================================================

-- Query 1: Total liquidations by exchange (last 24h)
COMMENT ON TABLE cex_liquidations IS
'Example query:
SELECT exchange, SUM(value_usd_cents)/100 AS total_usd, COUNT(*)
FROM cex_liquidations
WHERE liquidation_time >= NOW() - INTERVAL ''24 hours''
GROUP BY exchange ORDER BY total_usd DESC;';

-- Query 2: Bridge health scores
COMMENT ON TABLE bridge_health_metrics IS
'Example query:
SELECT bridge_id, health_score, risk_multiplier, recent_exploits
FROM latest_bridge_health
ORDER BY health_score ASC;';

-- Query 3: Chain congestion
COMMENT ON TABLE chain_metrics IS
'Example query:
SELECT chain, congestion_score, avg_gas_price_gwei, avg_block_time_ms
FROM latest_chain_metrics
ORDER BY congestion_score DESC;';
