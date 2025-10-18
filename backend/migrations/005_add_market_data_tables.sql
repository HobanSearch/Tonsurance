-- Migration 005: Real-Time Market Data Tables
-- Purpose: Time-series storage for stablecoin prices, bridge health, CEX liquidations, and chain metrics
-- Created: 2025-10-15
-- Dependencies: TimescaleDB extension must be installed

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =============================================================================
-- STABLECOIN PRICE HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS stablecoin_prices (
  time TIMESTAMPTZ NOT NULL,
  stablecoin_id TEXT NOT NULL,
  price NUMERIC(18,6) NOT NULL,
  source TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  round_id BIGINT,
  chain TEXT,
  PRIMARY KEY (time, stablecoin_id, source)
);

-- Convert to hypertable (7-day chunks for high-frequency data)
SELECT create_hypertable('stablecoin_prices', 'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_stablecoin_prices_asset
  ON stablecoin_prices(stablecoin_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_stablecoin_prices_source
  ON stablecoin_prices(source, time DESC);

CREATE INDEX IF NOT EXISTS idx_stablecoin_prices_chain
  ON stablecoin_prices(chain, time DESC) WHERE chain IS NOT NULL;

-- Add compression policy (compress data older than 7 days)
SELECT add_compression_policy('stablecoin_prices', INTERVAL '7 days');

-- Add retention policy (keep raw data for 90 days)
SELECT add_retention_policy('stablecoin_prices', INTERVAL '90 days');

-- =============================================================================
-- BRIDGE HEALTH HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS bridge_health_history (
  time TIMESTAMPTZ NOT NULL,
  bridge_id TEXT NOT NULL,
  tvl_usd BIGINT NOT NULL,
  tvl_24h_change_pct NUMERIC(10,4),
  daily_volume_usd BIGINT,
  health_score NUMERIC(5,2) NOT NULL,
  security_score NUMERIC(5,2),
  failed_tx_count INT NOT NULL DEFAULT 0,
  total_tx_count INT NOT NULL DEFAULT 0,
  avg_transfer_time_seconds NUMERIC(10,2),
  source_chain TEXT,
  dest_chain TEXT,
  PRIMARY KEY (time, bridge_id)
);

-- Convert to hypertable (1-day chunks)
SELECT create_hypertable('bridge_health_history', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bridge_health_bridge
  ON bridge_health_history(bridge_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_health_score
  ON bridge_health_history(health_score, time DESC) WHERE health_score < 0.7;

CREATE INDEX IF NOT EXISTS idx_bridge_health_chains
  ON bridge_health_history(source_chain, dest_chain, time DESC);

-- Add compression policy (compress data older than 14 days)
SELECT add_compression_policy('bridge_health_history', INTERVAL '14 days');

-- Add retention policy (keep raw data for 90 days)
SELECT add_retention_policy('bridge_health_history', INTERVAL '90 days');

-- =============================================================================
-- CEX LIQUIDATION EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS cex_liquidations (
  time TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  asset TEXT NOT NULL,
  total_liquidated_usd BIGINT NOT NULL,
  long_liquidated_usd BIGINT NOT NULL,
  short_liquidated_usd BIGINT NOT NULL,
  liquidation_count INT NOT NULL DEFAULT 0,
  avg_liquidation_size_usd BIGINT,
  largest_liquidation_usd BIGINT,
  time_window_seconds INT NOT NULL,
  PRIMARY KEY (time, exchange, asset)
);

-- Convert to hypertable (1-day chunks)
SELECT create_hypertable('cex_liquidations', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cex_liquidations_asset
  ON cex_liquidations(asset, time DESC);

CREATE INDEX IF NOT EXISTS idx_cex_liquidations_exchange
  ON cex_liquidations(exchange, time DESC);

CREATE INDEX IF NOT EXISTS idx_cex_liquidations_volume
  ON cex_liquidations(total_liquidated_usd DESC, time DESC);

-- Add compression policy (compress data older than 14 days)
SELECT add_compression_policy('cex_liquidations', INTERVAL '14 days');

-- Add retention policy (keep raw data for 90 days)
SELECT add_retention_policy('cex_liquidations', INTERVAL '90 days');

-- =============================================================================
-- CHAIN CONGESTION METRICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS chain_metrics (
  time TIMESTAMPTZ NOT NULL,
  chain_id TEXT NOT NULL,
  avg_gas_price_gwei NUMERIC(12,4),
  avg_block_time_ms INT NOT NULL,
  mempool_size INT,
  pending_tx_count INT,
  congestion_score NUMERIC(5,2) NOT NULL,
  data_source TEXT,
  PRIMARY KEY (time, chain_id)
);

-- Convert to hypertable (1-day chunks)
SELECT create_hypertable('chain_metrics', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chain_metrics_chain
  ON chain_metrics(chain_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_chain_metrics_congestion
  ON chain_metrics(congestion_score DESC, time DESC);

CREATE INDEX IF NOT EXISTS idx_chain_metrics_gas
  ON chain_metrics(avg_gas_price_gwei DESC, time DESC) WHERE avg_gas_price_gwei IS NOT NULL;

-- Add compression policy (compress data older than 14 days)
SELECT add_compression_policy('chain_metrics', INTERVAL '14 days');

-- Add retention policy (keep raw data for 90 days)
SELECT add_retention_policy('chain_metrics', INTERVAL '90 days');

-- =============================================================================
-- CONTINUOUS AGGREGATES (Pre-computed Views)
-- =============================================================================

-- Hourly stablecoin price aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS stablecoin_prices_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  stablecoin_id,
  AVG(price) AS avg_price,
  MIN(price) AS min_price,
  MAX(price) AS max_price,
  STDDEV(price) AS price_volatility,
  COUNT(*) AS sample_count,
  AVG(confidence) AS avg_confidence
FROM stablecoin_prices
GROUP BY bucket, stablecoin_id
WITH NO DATA;

-- Refresh policy: Update every hour, look back 3 hours
SELECT add_continuous_aggregate_policy('stablecoin_prices_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- Daily stablecoin price aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS stablecoin_prices_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  stablecoin_id,
  AVG(price) AS avg_price,
  MIN(price) AS min_price,
  MAX(price) AS max_price,
  STDDEV(price) AS price_volatility,
  COUNT(*) AS sample_count
FROM stablecoin_prices
GROUP BY bucket, stablecoin_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('stablecoin_prices_daily',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day'
);

-- Hourly bridge health aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS bridge_health_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  bridge_id,
  AVG(health_score) AS avg_health_score,
  MIN(health_score) AS min_health_score,
  AVG(tvl_usd) AS avg_tvl_usd,
  SUM(failed_tx_count) AS total_failed_txs,
  SUM(total_tx_count) AS total_txs,
  AVG(avg_transfer_time_seconds) AS avg_transfer_time
FROM bridge_health_history
GROUP BY bucket, bridge_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('bridge_health_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- Hourly liquidation aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS cex_liquidations_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  asset,
  SUM(total_liquidated_usd) AS total_liquidated_usd,
  SUM(long_liquidated_usd) AS total_long_liquidated_usd,
  SUM(short_liquidated_usd) AS total_short_liquidated_usd,
  SUM(liquidation_count) AS total_liquidation_count,
  MAX(largest_liquidation_usd) AS largest_liquidation_usd
FROM cex_liquidations
GROUP BY bucket, asset
WITH NO DATA;

SELECT add_continuous_aggregate_policy('cex_liquidations_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- Hourly chain metrics aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS chain_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  chain_id,
  AVG(avg_gas_price_gwei) AS avg_gas_price_gwei,
  AVG(avg_block_time_ms) AS avg_block_time_ms,
  AVG(congestion_score) AS avg_congestion_score,
  MAX(congestion_score) AS max_congestion_score,
  AVG(pending_tx_count) AS avg_pending_txs
FROM chain_metrics
GROUP BY bucket, chain_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('chain_metrics_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- =============================================================================
-- HELPER VIEWS FOR ANALYTICS
-- =============================================================================

-- Latest stablecoin prices (for dashboard)
CREATE OR REPLACE VIEW latest_stablecoin_prices AS
SELECT DISTINCT ON (stablecoin_id)
  time,
  stablecoin_id,
  price,
  source,
  confidence,
  chain
FROM stablecoin_prices
ORDER BY stablecoin_id, time DESC;

-- Latest bridge health scores (for dashboard)
CREATE OR REPLACE VIEW latest_bridge_health AS
SELECT DISTINCT ON (bridge_id)
  time,
  bridge_id,
  tvl_usd,
  tvl_24h_change_pct,
  health_score,
  security_score,
  failed_tx_count,
  total_tx_count,
  source_chain,
  dest_chain
FROM bridge_health_history
ORDER BY bridge_id, time DESC;

-- Latest chain metrics (for dashboard)
CREATE OR REPLACE VIEW latest_chain_metrics AS
SELECT DISTINCT ON (chain_id)
  time,
  chain_id,
  avg_gas_price_gwei,
  avg_block_time_ms,
  congestion_score,
  pending_tx_count
FROM chain_metrics
ORDER BY chain_id, time DESC;

-- Market stress indicator (last 24h liquidations)
CREATE OR REPLACE VIEW market_stress_24h AS
SELECT
  SUM(total_liquidated_usd) AS total_liquidated_24h_usd,
  SUM(liquidation_count) AS total_liquidation_count_24h,
  CASE
    WHEN SUM(total_liquidated_usd) > 100000000000 THEN 'EXTREME'  -- >$1B
    WHEN SUM(total_liquidated_usd) > 50000000000 THEN 'HIGH'      -- >$500M
    WHEN SUM(total_liquidated_usd) > 10000000000 THEN 'ELEVATED'  -- >$100M
    ELSE 'NORMAL'
  END AS stress_level
FROM cex_liquidations
WHERE time > NOW() - INTERVAL '24 hours';

-- =============================================================================
-- ANALYTICS FUNCTIONS
-- =============================================================================

-- Calculate stablecoin volatility over a time window
CREATE OR REPLACE FUNCTION calculate_stablecoin_volatility(
  p_stablecoin_id TEXT,
  p_lookback_hours INT DEFAULT 168  -- 7 days
)
RETURNS NUMERIC AS $$
DECLARE
  v_volatility NUMERIC;
BEGIN
  SELECT STDDEV(price)
  INTO v_volatility
  FROM stablecoin_prices
  WHERE stablecoin_id = p_stablecoin_id
    AND time > NOW() - (p_lookback_hours || ' hours')::INTERVAL;

  RETURN COALESCE(v_volatility, 0.0);
END;
$$ LANGUAGE plpgsql;

-- Calculate bridge health trend (improving/declining)
CREATE OR REPLACE FUNCTION calculate_bridge_health_trend(
  p_bridge_id TEXT,
  p_lookback_hours INT DEFAULT 24
)
RETURNS TEXT AS $$
DECLARE
  v_recent_avg NUMERIC;
  v_older_avg NUMERIC;
BEGIN
  -- Average health score in last 6 hours
  SELECT AVG(health_score)
  INTO v_recent_avg
  FROM bridge_health_history
  WHERE bridge_id = p_bridge_id
    AND time > NOW() - INTERVAL '6 hours';

  -- Average health score 6-24 hours ago
  SELECT AVG(health_score)
  INTO v_older_avg
  FROM bridge_health_history
  WHERE bridge_id = p_bridge_id
    AND time BETWEEN NOW() - INTERVAL '24 hours' AND NOW() - INTERVAL '6 hours';

  IF v_recent_avg IS NULL OR v_older_avg IS NULL THEN
    RETURN 'UNKNOWN';
  ELSIF v_recent_avg > v_older_avg + 0.1 THEN
    RETURN 'IMPROVING';
  ELSIF v_recent_avg < v_older_avg - 0.1 THEN
    RETURN 'DECLINING';
  ELSE
    RETURN 'STABLE';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Detect price anomalies (>3 standard deviations from mean)
CREATE OR REPLACE FUNCTION detect_price_anomalies(
  p_stablecoin_id TEXT,
  p_sigma_threshold NUMERIC DEFAULT 3.0,
  p_lookback_hours INT DEFAULT 24
)
RETURNS TABLE(
  time TIMESTAMPTZ,
  price NUMERIC,
  z_score NUMERIC,
  is_anomaly BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      AVG(price) AS mean_price,
      STDDEV(price) AS std_price
    FROM stablecoin_prices
    WHERE stablecoin_id = p_stablecoin_id
      AND time > NOW() - (p_lookback_hours || ' hours')::INTERVAL
  )
  SELECT
    sp.time,
    sp.price,
    (sp.price - stats.mean_price) / NULLIF(stats.std_price, 0) AS z_score,
    ABS((sp.price - stats.mean_price) / NULLIF(stats.std_price, 0)) > p_sigma_threshold AS is_anomaly
  FROM stablecoin_prices sp, stats
  WHERE sp.stablecoin_id = p_stablecoin_id
    AND sp.time > NOW() - (p_lookback_hours || ' hours')::INTERVAL
  ORDER BY sp.time DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS & DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE stablecoin_prices IS 'Real-time stablecoin price data from Chainlink and CoinGecko';
COMMENT ON TABLE bridge_health_history IS 'Cross-chain bridge health metrics from DeFiLlama and L2Beat';
COMMENT ON TABLE cex_liquidations IS 'Centralized exchange liquidation data for market stress detection';
COMMENT ON TABLE chain_metrics IS 'Blockchain congestion metrics (gas prices, block times, mempool size)';

COMMENT ON MATERIALIZED VIEW stablecoin_prices_hourly IS 'Hourly aggregates for stablecoin price volatility analysis';
COMMENT ON MATERIALIZED VIEW bridge_health_hourly IS 'Hourly aggregates for bridge reliability monitoring';
COMMENT ON MATERIALIZED VIEW cex_liquidations_hourly IS 'Hourly aggregates for market stress assessment';
COMMENT ON MATERIALIZED VIEW chain_metrics_hourly IS 'Hourly aggregates for blockchain congestion forecasting';

-- =============================================================================
-- GRANTS (Adjust based on your security model)
-- =============================================================================

-- Grant read access to analytics role
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tonsurance_analytics;
GRANT SELECT ON ALL VIEWS IN SCHEMA public TO tonsurance_analytics;

-- Grant write access to integration services
GRANT INSERT, UPDATE ON stablecoin_prices TO tonsurance_integration;
GRANT INSERT, UPDATE ON bridge_health_history TO tonsurance_integration;
GRANT INSERT, UPDATE ON cex_liquidations TO tonsurance_integration;
GRANT INSERT, UPDATE ON chain_metrics TO tonsurance_integration;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration success
DO $$
BEGIN
  RAISE NOTICE 'Migration 005 completed successfully';
  RAISE NOTICE 'Created 4 hypertables with compression and retention policies';
  RAISE NOTICE 'Created 4 continuous aggregates with refresh policies';
  RAISE NOTICE 'Created 4 dashboard views and 3 analytics functions';
END $$;
