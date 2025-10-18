-- Dynamic Pricing Infrastructure Migration
-- Adds support for real-time hedge pricing and oracle updates
-- Phase 4: Hedged Insurance

-- ============================================================================
-- PRICING ORACLE UPDATES TABLE
-- ============================================================================
-- Stores every pricing oracle update (5 second intervals)
-- Enables historical analysis and pricing transparency

CREATE TABLE IF NOT EXISTS pricing_oracle_updates (
  update_id BIGSERIAL PRIMARY KEY,
  coverage_type INT NOT NULL, -- 1=DEPEG, 2=EXPLOIT, 3=BRIDGE
  chain_id INT NOT NULL DEFAULT 0,
  stablecoin_id INT NOT NULL DEFAULT 0,

  -- Hedge venue pricing (basis points or cents)
  polymarket_odds INT NOT NULL, -- Basis points (250 = 2.5%)
  perp_funding_rate INT NOT NULL, -- Basis points per day (-50 = -0.5%)
  allianz_quote INT NOT NULL, -- Cents per $1000 (450 = $4.50)

  -- Calculated costs
  total_hedge_cost BIGINT NOT NULL, -- Total cost in nanoTON for $10k/30d policy
  base_premium BIGINT NOT NULL, -- Base premium (0.8% APR)
  final_premium BIGINT NOT NULL, -- base + hedge cost

  -- Metadata
  on_chain_tx_hash VARCHAR(64), -- TON transaction hash
  keeper_address VARCHAR(48), -- Keeper that submitted update
  block_height BIGINT,
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Data quality
  data_source VARCHAR(50), -- 'live' or 'fallback'
  confidence_score FLOAT DEFAULT 1.0 -- 0.0-1.0
);

-- Index for latest price queries
CREATE INDEX idx_pricing_oracle_updates_latest
  ON pricing_oracle_updates(coverage_type, chain_id, stablecoin_id, timestamp DESC);

-- Index for time-series analysis
CREATE INDEX idx_pricing_oracle_updates_time
  ON pricing_oracle_updates(timestamp DESC);

-- Index for keeper performance monitoring
CREATE INDEX idx_pricing_oracle_updates_keeper
  ON pricing_oracle_updates(keeper_address, timestamp DESC);

-- Partition by month for performance (TimescaleDB)
-- Uncomment if using TimescaleDB extension
-- SELECT create_hypertable('pricing_oracle_updates', 'timestamp', if_not_exists => TRUE);

-- ============================================================================
-- PRICE HISTORY AGGREGATES
-- ============================================================================
-- Pre-aggregated pricing stats for analytics dashboard

CREATE TABLE IF NOT EXISTS price_history_hourly (
  hour_start TIMESTAMP NOT NULL,
  coverage_type INT NOT NULL,
  chain_id INT NOT NULL,
  stablecoin_id INT NOT NULL,

  -- Aggregated metrics
  avg_polymarket_odds FLOAT,
  min_polymarket_odds INT,
  max_polymarket_odds INT,

  avg_perp_funding_rate FLOAT,
  min_perp_funding_rate INT,
  max_perp_funding_rate INT,

  avg_allianz_quote FLOAT,
  min_allianz_quote INT,
  max_allianz_quote INT,

  avg_final_premium BIGINT,
  min_final_premium BIGINT,
  max_final_premium BIGINT,

  update_count INT, -- Number of updates in this hour

  PRIMARY KEY (hour_start, coverage_type, chain_id, stablecoin_id)
);

-- Index for time-range queries
CREATE INDEX idx_price_history_hourly_time
  ON price_history_hourly(hour_start DESC);

-- ============================================================================
-- PREMIUM QUOTES CACHE
-- ============================================================================
-- Redis-backed cache table for fast premium lookups
-- 30-second TTL, falls back to DB on cache miss

CREATE TABLE IF NOT EXISTS premium_quotes_cache (
  cache_key VARCHAR(100) PRIMARY KEY, -- "coverage_type:chain:coin:amount:duration"

  coverage_type INT NOT NULL,
  chain_id INT NOT NULL,
  stablecoin_id INT NOT NULL,
  coverage_amount BIGINT NOT NULL,
  duration_days INT NOT NULL,

  base_premium BIGINT NOT NULL,
  hedge_cost BIGINT NOT NULL,
  total_premium BIGINT NOT NULL,

  -- Venue breakdown
  polymarket_cost BIGINT,
  perpetuals_cost BIGINT,
  allianz_cost BIGINT,

  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL, -- 30 seconds from creation

  -- Source data
  oracle_update_id BIGINT REFERENCES pricing_oracle_updates(update_id)
);

-- Index for expiration cleanup
CREATE INDEX idx_premium_quotes_cache_expires
  ON premium_quotes_cache(expires_at);

-- Automatically delete expired quotes
CREATE OR REPLACE FUNCTION cleanup_expired_quotes()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM premium_quotes_cache WHERE expires_at < NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Run cleanup every minute
CREATE TRIGGER trg_cleanup_expired_quotes
  AFTER INSERT ON premium_quotes_cache
  EXECUTE FUNCTION cleanup_expired_quotes();

-- ============================================================================
-- ORACLE HEALTH MONITORING
-- ============================================================================
-- Tracks oracle keeper health and update frequency

CREATE TABLE IF NOT EXISTS oracle_health_log (
  log_id BIGSERIAL PRIMARY KEY,
  keeper_address VARCHAR(48) NOT NULL,

  -- Health metrics
  last_update_at TIMESTAMP,
  updates_last_hour INT DEFAULT 0,
  updates_last_day INT DEFAULT 0,

  -- Error tracking
  consecutive_failures INT DEFAULT 0,
  last_failure_at TIMESTAMP,
  last_failure_reason TEXT,

  -- Performance
  avg_update_latency_ms INT, -- Time from off-chain calculation to on-chain confirmation
  max_update_latency_ms INT,

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'degraded', 'failed'

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint on keeper
CREATE UNIQUE INDEX idx_oracle_health_log_keeper
  ON oracle_health_log(keeper_address);

-- ============================================================================
-- HEDGE EXECUTION TRACKING
-- ============================================================================
-- Enhanced hedge_positions table with execution details

ALTER TABLE IF EXISTS hedge_positions
  ADD COLUMN IF NOT EXISTS execution_latency_ms INT, -- Time from policy creation to hedge execution
  ADD COLUMN IF NOT EXISTS execution_price FLOAT, -- Actual execution price
  ADD COLUMN IF NOT EXISTS slippage_bps INT, -- Slippage in basis points
  ADD COLUMN IF NOT EXISTS venue_fee BIGINT, -- Fee paid to venue
  ADD COLUMN IF NOT EXISTS keeper_address VARCHAR(48); -- Keeper that executed hedge

-- Index for execution performance analysis
CREATE INDEX IF NOT EXISTS idx_hedge_positions_execution
  ON hedge_positions(opened_at, execution_latency_ms)
  WHERE status = 'open';

-- ============================================================================
-- POLICY PRICING AUDIT LOG
-- ============================================================================
-- Immutable log of all premium calculations for transparency

CREATE TABLE IF NOT EXISTS policy_pricing_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT, -- References policies table (if exists)

  -- Input parameters
  coverage_type INT NOT NULL,
  chain_id INT NOT NULL,
  stablecoin_id INT NOT NULL,
  coverage_amount BIGINT NOT NULL,
  duration_days INT NOT NULL,

  -- Pricing breakdown
  base_premium BIGINT NOT NULL,
  chain_risk_multiplier FLOAT NOT NULL,
  stablecoin_risk_multiplier FLOAT NOT NULL,

  -- Hedge costs
  polymarket_odds INT NOT NULL,
  polymarket_cost BIGINT NOT NULL,
  perp_funding_rate INT NOT NULL,
  perpetuals_cost BIGINT NOT NULL,
  allianz_quote INT NOT NULL,
  allianz_cost BIGINT NOT NULL,
  total_hedge_cost BIGINT NOT NULL,

  -- Final pricing
  gross_premium BIGINT NOT NULL, -- base + hedge
  protocol_fee BIGINT NOT NULL, -- 5% protocol fee
  net_premium BIGINT NOT NULL, -- gross - fee

  -- Metadata
  quoted_at TIMESTAMP DEFAULT NOW(),
  quote_valid_until TIMESTAMP, -- 30 seconds from quoted_at
  accepted BOOLEAN DEFAULT FALSE,
  accepted_at TIMESTAMP,

  -- Source
  oracle_update_id BIGINT REFERENCES pricing_oracle_updates(update_id),
  user_address VARCHAR(48)
);

-- Index for policy lookup
CREATE INDEX idx_policy_pricing_audit_policy
  ON policy_pricing_audit(policy_id)
  WHERE policy_id IS NOT NULL;

-- Index for user pricing history
CREATE INDEX idx_policy_pricing_audit_user
  ON policy_pricing_audit(user_address, quoted_at DESC);

-- ============================================================================
-- MATERIALIZED VIEW: CURRENT PRICES
-- ============================================================================
-- Fast lookup for latest prices across all product combinations

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_current_prices AS
SELECT DISTINCT ON (coverage_type, chain_id, stablecoin_id)
  coverage_type,
  chain_id,
  stablecoin_id,
  polymarket_odds,
  perp_funding_rate,
  allianz_quote,
  total_hedge_cost,
  base_premium,
  final_premium,
  timestamp,
  keeper_address
FROM pricing_oracle_updates
ORDER BY coverage_type, chain_id, stablecoin_id, timestamp DESC;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_current_prices_product
  ON mv_current_prices(coverage_type, chain_id, stablecoin_id);

-- Auto-refresh every 10 seconds (requires pg_cron extension)
-- SELECT cron.schedule('refresh-current-prices', '*/10 * * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_current_prices$$);

-- ============================================================================
-- FUNCTIONS: PREMIUM CALCULATION
-- ============================================================================

-- Calculate base premium (APR-based)
CREATE OR REPLACE FUNCTION calculate_base_premium(
  coverage_amount BIGINT,
  duration_days INT,
  apr_bps INT DEFAULT 80 -- 0.8% APR
)
RETURNS BIGINT AS $$
BEGIN
  RETURN (coverage_amount * apr_bps * duration_days) / (10000 * 365);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate hedge cost based on latest prices
CREATE OR REPLACE FUNCTION calculate_hedge_cost(
  p_coverage_type INT,
  p_chain_id INT,
  p_stablecoin_id INT,
  p_coverage_amount BIGINT,
  p_duration_days INT
)
RETURNS BIGINT AS $$
DECLARE
  v_polymarket_odds INT;
  v_perp_funding_rate INT;
  v_allianz_quote INT;
  v_polymarket_cost BIGINT;
  v_perpetuals_cost BIGINT;
  v_allianz_cost BIGINT;
BEGIN
  -- Get latest hedge prices
  SELECT polymarket_odds, perp_funding_rate, allianz_quote
  INTO v_polymarket_odds, v_perp_funding_rate, v_allianz_quote
  FROM mv_current_prices
  WHERE coverage_type = p_coverage_type
    AND chain_id = p_chain_id
    AND stablecoin_id = p_stablecoin_id;

  -- Calculate costs per venue (40%, 40%, 20% allocation)
  v_polymarket_cost := (p_coverage_amount * v_polymarket_odds * 40) / (10000 * 100);
  v_perpetuals_cost := (p_coverage_amount * ABS(v_perp_funding_rate) * p_duration_days * 40) / (10000 * 100);
  v_allianz_cost := (p_coverage_amount * v_allianz_quote * 20) / (100000 * 100);

  RETURN v_polymarket_cost + v_perpetuals_cost + v_allianz_cost;
END;
$$ LANGUAGE plpgsql STABLE;

-- Calculate final premium (base + hedge + protocol fee)
CREATE OR REPLACE FUNCTION calculate_final_premium(
  p_coverage_type INT,
  p_chain_id INT,
  p_stablecoin_id INT,
  p_coverage_amount BIGINT,
  p_duration_days INT
)
RETURNS TABLE(
  base_premium BIGINT,
  hedge_cost BIGINT,
  gross_premium BIGINT,
  protocol_fee BIGINT,
  net_premium BIGINT
) AS $$
DECLARE
  v_base BIGINT;
  v_hedge BIGINT;
  v_gross BIGINT;
  v_fee BIGINT;
  v_net BIGINT;
BEGIN
  -- Calculate components
  v_base := calculate_base_premium(p_coverage_amount, p_duration_days);
  v_hedge := calculate_hedge_cost(p_coverage_type, p_chain_id, p_stablecoin_id, p_coverage_amount, p_duration_days);
  v_gross := v_base + v_hedge;
  v_fee := (v_gross * 5) / 100; -- 5% protocol fee
  v_net := v_gross + v_fee;

  RETURN QUERY SELECT v_base, v_hedge, v_gross, v_fee, v_net;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- AGGREGATE FUNCTIONS: HOURLY PRICE ROLLUPS
-- ============================================================================

CREATE OR REPLACE FUNCTION aggregate_hourly_prices()
RETURNS VOID AS $$
BEGIN
  INSERT INTO price_history_hourly (
    hour_start,
    coverage_type,
    chain_id,
    stablecoin_id,
    avg_polymarket_odds,
    min_polymarket_odds,
    max_polymarket_odds,
    avg_perp_funding_rate,
    min_perp_funding_rate,
    max_perp_funding_rate,
    avg_allianz_quote,
    min_allianz_quote,
    max_allianz_quote,
    avg_final_premium,
    min_final_premium,
    max_final_premium,
    update_count
  )
  SELECT
    DATE_TRUNC('hour', timestamp) AS hour_start,
    coverage_type,
    chain_id,
    stablecoin_id,
    AVG(polymarket_odds)::FLOAT,
    MIN(polymarket_odds),
    MAX(polymarket_odds),
    AVG(perp_funding_rate)::FLOAT,
    MIN(perp_funding_rate),
    MAX(perp_funding_rate),
    AVG(allianz_quote)::FLOAT,
    MIN(allianz_quote),
    MAX(allianz_quote),
    AVG(final_premium),
    MIN(final_premium),
    MAX(final_premium),
    COUNT(*)
  FROM pricing_oracle_updates
  WHERE timestamp >= DATE_TRUNC('hour', NOW()) - INTERVAL '1 hour'
    AND timestamp < DATE_TRUNC('hour', NOW())
  GROUP BY DATE_TRUNC('hour', timestamp), coverage_type, chain_id, stablecoin_id
  ON CONFLICT (hour_start, coverage_type, chain_id, stablecoin_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Schedule hourly aggregation (requires pg_cron)
-- SELECT cron.schedule('aggregate-hourly-prices', '5 * * * *', $$SELECT aggregate_hourly_prices()$$);

-- ============================================================================
-- VIEWS: ANALYTICS & MONITORING
-- ============================================================================

-- Latest prices with human-readable names
CREATE OR REPLACE VIEW v_latest_prices_readable AS
SELECT
  ct.type_name,
  crm.chain_name,
  sc.coin_symbol,
  cp.polymarket_odds::FLOAT / 100 AS polymarket_odds_pct,
  cp.perp_funding_rate::FLOAT / 100 AS perp_funding_rate_pct,
  cp.allianz_quote::FLOAT / 100 AS allianz_quote_dollars,
  cp.final_premium,
  cp.timestamp,
  cp.keeper_address
FROM mv_current_prices cp
LEFT JOIN coverage_types ct ON cp.coverage_type = ct.type_id
LEFT JOIN chain_risk_metrics crm ON cp.chain_id = crm.chain_id
LEFT JOIN stablecoins sc ON cp.stablecoin_id = sc.coin_id
ORDER BY cp.timestamp DESC;

-- Oracle keeper performance
CREATE OR REPLACE VIEW v_oracle_keeper_performance AS
SELECT
  keeper_address,
  COUNT(*) AS total_updates,
  COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 hour') AS updates_last_hour,
  COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 day') AS updates_last_day,
  AVG(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (PARTITION BY keeper_address ORDER BY timestamp))))::INT AS avg_interval_seconds,
  MAX(timestamp) AS last_update_at,
  CASE
    WHEN MAX(timestamp) < NOW() - INTERVAL '10 minutes' THEN 'CRITICAL'
    WHEN MAX(timestamp) < NOW() - INTERVAL '2 minutes' THEN 'WARNING'
    ELSE 'OK'
  END AS health_status
FROM pricing_oracle_updates
GROUP BY keeper_address
ORDER BY updates_last_hour DESC;

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE pricing_oracle_updates IS 'Complete history of all pricing oracle updates (5s interval)';
COMMENT ON TABLE price_history_hourly IS 'Hourly aggregated pricing stats for analytics';
COMMENT ON TABLE premium_quotes_cache IS 'Redis-backed cache for fast premium lookups (30s TTL)';
COMMENT ON TABLE oracle_health_log IS 'Oracle keeper health monitoring and alerting';
COMMENT ON TABLE policy_pricing_audit IS 'Immutable audit log of all premium calculations';
COMMENT ON MATERIALIZED VIEW mv_current_prices IS 'Latest prices for all product combinations (refreshed every 10s)';

COMMENT ON FUNCTION calculate_base_premium IS 'Calculate base premium using APR formula';
COMMENT ON FUNCTION calculate_hedge_cost IS 'Calculate hedge cost from latest oracle prices';
COMMENT ON FUNCTION calculate_final_premium IS 'Calculate final premium with all components';
COMMENT ON FUNCTION aggregate_hourly_prices IS 'Roll up pricing updates into hourly aggregates';
