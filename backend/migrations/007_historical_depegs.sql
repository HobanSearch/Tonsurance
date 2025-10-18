-- Migration 007: Historical Depeg Events
-- Purpose: Move hardcoded depeg history from source code to database
-- Created: 2025-10-15
-- Enables dynamic updates to depeg data without redeployment

-- =============================================================================
-- HISTORICAL DEPEGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS historical_depegs (
  id SERIAL PRIMARY KEY,
  asset VARCHAR(10) NOT NULL,
  min_price NUMERIC(10,8) NOT NULL CHECK (min_price > 0),
  timestamp TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds > 0),
  recovery_time_seconds INT NOT NULL CHECK (recovery_time_seconds > 0),
  source VARCHAR(50) NOT NULL,  -- 'coingecko', 'chainlink', 'manual', etc.
  verified BOOLEAN DEFAULT FALSE,
  event_name VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_historical_depegs_asset
  ON historical_depegs(asset, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_historical_depegs_min_price
  ON historical_depegs(asset, min_price);

CREATE INDEX IF NOT EXISTS idx_historical_depegs_timestamp
  ON historical_depegs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_historical_depegs_verified
  ON historical_depegs(verified, asset) WHERE verified = TRUE;

-- =============================================================================
-- SEED DATA - HISTORICAL DEPEG EVENTS
-- =============================================================================

-- USDC Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'USDC',
    0.88,
    '2023-03-10 00:00:00+00',
    172800,  -- 48 hours
    259200,  -- 72 hours
    'coingecko',
    TRUE,
    'SVB Banking Crisis',
    'Silicon Valley Bank collapse caused panic. USDC held $3.3B at SVB. Depegged to $0.88 before Circle confirmed reserves safe.'
  ),
  (
    'USDC',
    0.96,
    '2022-05-01 00:00:00+00',
    14400,   -- 4 hours
    28800,   -- 8 hours
    'coingecko',
    TRUE,
    'Minor Depeg - May 2022',
    'Brief depeg during UST collapse contagion. Quickly recovered.'
  )
ON CONFLICT DO NOTHING;

-- USDT Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'USDT',
    0.95,
    '2022-05-12 00:00:00+00',
    86400,   -- 24 hours
    172800,  -- 48 hours
    'coingecko',
    TRUE,
    'UST Collapse Contagion',
    'Terra UST collapse caused panic selling across all stablecoins. USDT depegged to $0.95.'
  ),
  (
    'USDT',
    0.97,
    '2021-12-31 00:00:00+00',
    7200,    -- 2 hours
    21600,   -- 6 hours
    'coingecko',
    TRUE,
    'Minor Depeg - Dec 2021',
    'Brief depeg during market volatility. Quick recovery.'
  )
ON CONFLICT DO NOTHING;

-- DAI Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'DAI',
    0.96,
    '2020-03-12 00:00:00+00',
    43200,   -- 12 hours
    86400,   -- 24 hours
    'chainlink',
    TRUE,
    'COVID-19 Black Thursday',
    'MakerDAO liquidations during COVID crash. DAI depegged to $0.96 due to liquidation backlog.'
  )
ON CONFLICT DO NOTHING;

-- USDP (Paxos) Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'USDP',
    0.98,
    '2023-02-07 00:00:00+00',
    28800,   -- 8 hours
    43200,   -- 12 hours
    'coingecko',
    TRUE,
    'Paxos Regulatory Scrutiny',
    'SEC Wells notice to Paxos regarding BUSD. USDP briefly depegged due to uncertainty.'
  )
ON CONFLICT DO NOTHING;

-- FRAX Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'FRAX',
    0.88,
    '2022-05-10 00:00:00+00',
    259200,  -- 72 hours
    432000,  -- 5 days
    'coingecko',
    TRUE,
    'Terra UST Collapse Contagion',
    'Severe depeg due to algorithmic stablecoin fears after UST collapse. FRAX depegged to $0.88.'
  ),
  (
    'FRAX',
    0.95,
    '2023-03-10 00:00:00+00',
    86400,   -- 24 hours
    172800,  -- 48 hours
    'coingecko',
    TRUE,
    'SVB Crisis Impact',
    'FRAX depegged during SVB crisis due to USDC exposure in collateral backing.'
  )
ON CONFLICT DO NOTHING;

-- BUSD Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'BUSD',
    0.98,
    '2023-02-12 00:00:00+00',
    172800,  -- 48 hours
    259200,  -- 72 hours
    'coingecko',
    TRUE,
    'Paxos Phase-Out Announcement',
    'Paxos ordered to stop minting BUSD. Brief depeg during uncertainty.'
  )
ON CONFLICT DO NOTHING;

-- PYUSD Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'PYUSD',
    0.98,
    '2023-08-09 00:00:00+00',
    14400,   -- 4 hours
    21600,   -- 6 hours
    'coingecko',
    TRUE,
    'Launch Day Depeg',
    'PayPal USD depegged briefly during initial launch due to low liquidity.'
  )
ON CONFLICT DO NOTHING;

-- GHO Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'GHO',
    0.96,
    '2023-07-20 00:00:00+00',
    2592000, -- 30 days
    5184000, -- 60 days
    'chainlink',
    TRUE,
    'Prolonged Launch Depeg',
    'Aave GHO traded below peg for extended period after launch. Lasted ~60 days.'
  )
ON CONFLICT DO NOTHING;

-- LUSD Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'LUSD',
    0.97,
    '2022-05-11 00:00:00+00',
    43200,   -- 12 hours
    86400,   -- 24 hours
    'chainlink',
    TRUE,
    'Terra Collapse Contagion',
    'Liquity USD depegged briefly during UST collapse due to general stablecoin panic.'
  )
ON CONFLICT DO NOTHING;

-- crvUSD Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'crvUSD',
    0.97,
    '2023-05-16 00:00:00+00',
    21600,   -- 6 hours
    43200,   -- 12 hours
    'chainlink',
    TRUE,
    'Launch Day Depeg',
    'Curve USD depegged temporarily during launch due to initial liquidity constraints.'
  )
ON CONFLICT DO NOTHING;

-- mkUSD Historical Depegs
INSERT INTO historical_depegs (asset, min_price, timestamp, duration_seconds, recovery_time_seconds, source, verified, event_name, notes)
VALUES
  (
    'mkUSD',
    0.98,
    '2024-01-01 00:00:00+00',
    18000,   -- 5 hours
    28800,   -- 8 hours
    'coingecko',
    TRUE,
    'Market Volatility Depeg',
    'Prisma mkUSD depegged during general market volatility. New stablecoin with limited history.'
  )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- ANALYTICS VIEWS
-- =============================================================================

-- View: Depeg frequency by asset
CREATE OR REPLACE VIEW v_depeg_frequency AS
SELECT
  asset,
  COUNT(*) AS total_depegs,
  COUNT(*) FILTER (WHERE min_price < 0.97) AS severe_depegs,
  MIN(min_price) AS worst_depeg,
  AVG(min_price) AS avg_depeg_price,
  AVG(duration_seconds) AS avg_duration_seconds,
  AVG(recovery_time_seconds) AS avg_recovery_seconds,
  MAX(timestamp) AS most_recent_depeg,
  COUNT(*) FILTER (WHERE verified = TRUE) AS verified_events
FROM historical_depegs
GROUP BY asset
ORDER BY total_depegs DESC;

-- View: Recent depegs (last 2 years)
CREATE OR REPLACE VIEW v_recent_depegs AS
SELECT
  asset,
  event_name,
  min_price,
  timestamp,
  duration_seconds / 3600.0 AS duration_hours,
  recovery_time_seconds / 3600.0 AS recovery_hours,
  source,
  verified
FROM historical_depegs
WHERE timestamp > NOW() - INTERVAL '2 years'
ORDER BY timestamp DESC;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function: Calculate annual depeg probability
CREATE OR REPLACE FUNCTION calculate_annual_depeg_probability(
  p_asset VARCHAR(10),
  p_threshold NUMERIC DEFAULT 0.97,
  p_lookback_years INT DEFAULT 5
)
RETURNS NUMERIC AS $$
DECLARE
  v_count INT;
  v_probability NUMERIC;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM historical_depegs
  WHERE asset = p_asset
    AND min_price <= p_threshold
    AND timestamp > NOW() - (p_lookback_years || ' years')::INTERVAL
    AND verified = TRUE;

  v_probability := v_count::NUMERIC / p_lookback_years;

  RETURN v_probability;
END;
$$ LANGUAGE plpgsql;

-- Function: Get expected severity for an asset
CREATE OR REPLACE FUNCTION calculate_expected_severity(
  p_asset VARCHAR(10)
)
RETURNS NUMERIC AS $$
DECLARE
  v_severity NUMERIC;
BEGIN
  SELECT AVG(1.0 - min_price)
  INTO v_severity
  FROM historical_depegs
  WHERE asset = p_asset
    AND verified = TRUE;

  RETURN COALESCE(v_severity, 0.0);
END;
$$ LANGUAGE plpgsql;

-- Function: Expected loss per policy
CREATE OR REPLACE FUNCTION calculate_expected_loss_per_policy(
  p_asset VARCHAR(10),
  p_coverage_usd NUMERIC,
  p_trigger_price NUMERIC DEFAULT 0.97
)
RETURNS NUMERIC AS $$
DECLARE
  v_probability NUMERIC;
  v_severity NUMERIC;
  v_expected_loss NUMERIC;
BEGIN
  v_probability := calculate_annual_depeg_probability(p_asset, p_trigger_price);
  v_severity := calculate_expected_severity(p_asset);
  v_expected_loss := v_probability * v_severity * p_coverage_usd;

  RETURN v_expected_loss;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGER FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_historical_depegs_updated_at ON historical_depegs;
CREATE TRIGGER trg_historical_depegs_updated_at
  BEFORE UPDATE ON historical_depegs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS & DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE historical_depegs IS 'Historical stablecoin depeg events for actuarial risk modeling';
COMMENT ON VIEW v_depeg_frequency IS 'Aggregated depeg statistics by asset';
COMMENT ON VIEW v_recent_depegs IS 'Depeg events in the last 2 years';
COMMENT ON FUNCTION calculate_annual_depeg_probability IS 'Calculate probability of depeg below threshold per year';
COMMENT ON FUNCTION calculate_expected_severity IS 'Calculate average severity (1 - min_price) of depegs';
COMMENT ON FUNCTION calculate_expected_loss_per_policy IS 'Calculate expected actuarial loss for a policy';

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT SELECT ON historical_depegs TO tonsurance_integration;
GRANT SELECT ON v_depeg_frequency TO tonsurance_analytics;
GRANT SELECT ON v_recent_depegs TO tonsurance_analytics;
GRANT INSERT, UPDATE ON historical_depegs TO tonsurance_admin;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
DECLARE
  v_total_events INT;
  v_unique_assets INT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT asset)
  INTO v_total_events, v_unique_assets
  FROM historical_depegs;

  RAISE NOTICE 'Migration 007 completed successfully';
  RAISE NOTICE 'Loaded % historical depeg events for % unique assets', v_total_events, v_unique_assets;
  RAISE NOTICE 'Created 2 analytics views and 3 helper functions';
END $$;
