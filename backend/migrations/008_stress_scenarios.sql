-- Migration 008: Stress Test Scenarios
-- Purpose: Move hardcoded stress scenarios from source code to database
-- Created: 2025-10-15
-- Enables dynamic stress testing with configurable scenarios

-- =============================================================================
-- STRESS SCENARIOS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_scenarios (
  id SERIAL PRIMARY KEY,
  scenario_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  scenario_type VARCHAR(50) NOT NULL,  -- 'banking', 'crypto_crash', 'regulatory', 'black_swan'
  asset_impacts JSONB NOT NULL,  -- Map of asset -> price_multiplier
  btc_impact NUMERIC(5,2) NOT NULL,  -- BTC price change (e.g., -0.50 for 50% drop)
  correlation_shift NUMERIC(5,2) NOT NULL,  -- How correlations change during stress
  probability_annual NUMERIC(10,8),  -- Annual probability of scenario occurring
  severity_level VARCHAR(20) NOT NULL,  -- 'low', 'medium', 'high', 'extreme'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  enabled BOOLEAN DEFAULT TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stress_scenarios_type
  ON stress_scenarios(scenario_type);

CREATE INDEX IF NOT EXISTS idx_stress_scenarios_severity
  ON stress_scenarios(severity_level);

CREATE INDEX IF NOT EXISTS idx_stress_scenarios_enabled
  ON stress_scenarios(enabled) WHERE enabled = TRUE;

-- =============================================================================
-- STRESS TEST RESULTS TABLE (Historical Runs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_test_results (
  id BIGSERIAL PRIMARY KEY,
  scenario_id INT REFERENCES stress_scenarios(id),
  vault_snapshot JSONB NOT NULL,  -- State of vault at test time
  total_claims NUMERIC(20,2) NOT NULL,
  btc_float_change NUMERIC(20,2) NOT NULL,
  net_loss NUMERIC(20,2) NOT NULL,
  capital_adequacy_ratio NUMERIC(10,4) NOT NULL,
  would_survive BOOLEAN NOT NULL,
  tested_at TIMESTAMPTZ DEFAULT NOW(),
  tested_by VARCHAR(100)
);

-- Create indexes for historical analysis
CREATE INDEX IF NOT EXISTS idx_stress_test_results_scenario
  ON stress_test_results(scenario_id, tested_at DESC);

CREATE INDEX IF NOT EXISTS idx_stress_test_results_tested_at
  ON stress_test_results(tested_at DESC);

CREATE INDEX IF NOT EXISTS idx_stress_test_results_survival
  ON stress_test_results(would_survive, net_loss DESC);

-- =============================================================================
-- SEED DATA - STRESS SCENARIOS
-- =============================================================================

-- Scenario 1: Banking Crisis (SVB-style)
INSERT INTO stress_scenarios (
  scenario_name,
  description,
  scenario_type,
  asset_impacts,
  btc_impact,
  correlation_shift,
  probability_annual,
  severity_level
)
VALUES (
  'Banking Crisis (SVB)',
  'Regional banking crisis similar to SVB collapse in March 2023. Bank-backed stablecoins depeg severely, flight to safety causes BTC rally.',
  'banking',
  '{
    "USDC": 0.88,
    "USDT": 1.02,
    "DAI": 1.01,
    "USDP": 0.85,
    "BUSD": 0.90,
    "FRAX": 0.92,
    "USDe": 0.95,
    "sUSDe": 0.95,
    "USDY": 0.90,
    "PYUSD": 0.93,
    "GHO": 0.98,
    "LUSD": 0.99,
    "crvUSD": 0.97,
    "mkUSD": 0.96
  }'::jsonb,
  0.27,
  -0.3,
  0.02,
  'high'
)
ON CONFLICT (scenario_name) DO NOTHING;

-- Scenario 2: Crypto Crash
INSERT INTO stress_scenarios (
  scenario_name,
  description,
  scenario_type,
  asset_impacts,
  btc_impact,
  correlation_shift,
  probability_annual,
  severity_level
)
VALUES (
  'Crypto Crash',
  'Major crypto market crash. BTC drops 50%, all stablecoins experience stress due to liquidation cascades and redemption pressures.',
  'crypto_crash',
  '{
    "USDC": 0.98,
    "USDT": 0.97,
    "DAI": 0.96,
    "USDP": 0.98,
    "BUSD": 0.97,
    "FRAX": 0.93,
    "USDe": 0.90,
    "sUSDe": 0.88,
    "USDY": 0.97,
    "PYUSD": 0.97,
    "GHO": 0.94,
    "LUSD": 0.96,
    "crvUSD": 0.95,
    "mkUSD": 0.93
  }'::jsonb,
  -0.50,
  0.5,
  0.05,
  'high'
)
ON CONFLICT (scenario_name) DO NOTHING;

-- Scenario 3: Regulatory Shutdown
INSERT INTO stress_scenarios (
  scenario_name,
  description,
  scenario_type,
  asset_impacts,
  btc_impact,
  correlation_shift,
  probability_annual,
  severity_level
)
VALUES (
  'Regulatory Shutdown',
  'Government crackdown on centralized stablecoins. USDC, USDT, BUSD forced to halt redemptions. Decentralized stablecoins survive but stressed.',
  'regulatory',
  '{
    "USDC": 0.80,
    "USDT": 0.85,
    "DAI": 0.90,
    "USDP": 0.78,
    "BUSD": 0.75,
    "FRAX": 0.88,
    "USDe": 0.92,
    "sUSDe": 0.90,
    "USDY": 0.82,
    "PYUSD": 0.80,
    "GHO": 0.93,
    "LUSD": 0.95,
    "crvUSD": 0.92,
    "mkUSD": 0.91
  }'::jsonb,
  -0.30,
  0.0,
  0.01,
  'extreme'
)
ON CONFLICT (scenario_name) DO NOTHING;

-- Scenario 4: Multiple Stablecoin Failure
INSERT INTO stress_scenarios (
  scenario_name,
  description,
  scenario_type,
  asset_impacts,
  btc_impact,
  correlation_shift,
  probability_annual,
  severity_level
)
VALUES (
  'Multiple Stablecoin Failure',
  'Contagion event where multiple major stablecoins fail simultaneously. Flight to BTC and gold. High correlation in crisis.',
  'black_swan',
  '{
    "USDC": 0.75,
    "USDT": 0.75,
    "DAI": 0.80,
    "USDP": 0.70,
    "BUSD": 0.72,
    "FRAX": 0.65,
    "USDe": 0.78,
    "sUSDe": 0.75,
    "USDY": 0.82,
    "PYUSD": 0.73,
    "GHO": 0.77,
    "LUSD": 0.85,
    "crvUSD": 0.80,
    "mkUSD": 0.76
  }'::jsonb,
  0.50,
  0.8,
  0.005,
  'extreme'
)
ON CONFLICT (scenario_name) DO NOTHING;

-- =============================================================================
-- ANALYTICS VIEWS
-- =============================================================================

-- View: Scenario summary
CREATE OR REPLACE VIEW v_stress_scenario_summary AS
SELECT
  id,
  scenario_name,
  scenario_type,
  severity_level,
  btc_impact,
  correlation_shift,
  probability_annual,
  ROUND((probability_annual * 100)::NUMERIC, 4) AS probability_annual_pct,
  enabled,
  -- Extract min/max asset impacts
  (
    SELECT MIN((value->>'')::NUMERIC)
    FROM jsonb_each(asset_impacts)
  ) AS min_stablecoin_price,
  (
    SELECT MAX((value->>'')::NUMERIC)
    FROM jsonb_each(asset_impacts)
  ) AS max_stablecoin_price
FROM stress_scenarios
ORDER BY severity_level DESC, probability_annual DESC;

-- View: Recent stress test results
CREATE OR REPLACE VIEW v_recent_stress_tests AS
SELECT
  str.id,
  ss.scenario_name,
  ss.severity_level,
  str.net_loss,
  str.capital_adequacy_ratio,
  str.would_survive,
  str.tested_at,
  str.tested_by
FROM stress_test_results str
JOIN stress_scenarios ss ON str.scenario_id = ss.id
ORDER BY str.tested_at DESC
LIMIT 100;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function: Get asset price under scenario
CREATE OR REPLACE FUNCTION get_stressed_asset_price(
  p_scenario_id INT,
  p_asset VARCHAR(10)
)
RETURNS NUMERIC AS $$
DECLARE
  v_impact_map JSONB;
  v_price NUMERIC;
BEGIN
  SELECT asset_impacts INTO v_impact_map
  FROM stress_scenarios
  WHERE id = p_scenario_id;

  IF v_impact_map ? p_asset THEN
    v_price := (v_impact_map->>p_asset)::NUMERIC;
  ELSE
    v_price := 1.0;  -- No impact
  END IF;

  RETURN v_price;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate policy payout under scenario
CREATE OR REPLACE FUNCTION calculate_stress_payout(
  p_policy_id BIGINT,
  p_scenario_id INT
)
RETURNS NUMERIC AS $$
DECLARE
  v_policy RECORD;
  v_stressed_price NUMERIC;
  v_payout_ratio NUMERIC;
  v_payout NUMERIC;
BEGIN
  -- Get policy details (assuming policies table exists)
  SELECT coverage_amount, asset, trigger_price, floor_price
  INTO v_policy
  FROM policies
  WHERE policy_id = p_policy_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get stressed price for asset
  v_stressed_price := get_stressed_asset_price(p_scenario_id, v_policy.asset);

  -- Calculate payout
  IF v_stressed_price >= v_policy.trigger_price THEN
    RETURN 0;  -- No payout
  ELSE
    v_payout_ratio := (v_policy.trigger_price - v_stressed_price) /
                      (v_policy.trigger_price - v_policy.floor_price);
    v_payout_ratio := GREATEST(0, LEAST(1, v_payout_ratio));
    v_payout := v_policy.coverage_amount * v_payout_ratio / 100.0;  -- Convert from cents
    RETURN v_payout;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Run stress test on current portfolio
CREATE OR REPLACE FUNCTION run_stress_test(
  p_scenario_id INT,
  p_vault_snapshot JSONB,
  p_tested_by VARCHAR(100) DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
  v_scenario RECORD;
  v_total_claims NUMERIC := 0;
  v_btc_float_change NUMERIC;
  v_net_loss NUMERIC;
  v_capital NUMERIC;
  v_capital_adequacy_ratio NUMERIC;
  v_would_survive BOOLEAN;
  v_result_id BIGINT;
BEGIN
  -- Get scenario details
  SELECT * INTO v_scenario
  FROM stress_scenarios
  WHERE id = p_scenario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scenario % not found', p_scenario_id;
  END IF;

  -- Calculate total claims from all active policies
  SELECT COALESCE(SUM(calculate_stress_payout(policy_id, p_scenario_id)), 0)
  INTO v_total_claims
  FROM policies
  WHERE status = 'active';

  -- Calculate BTC float change
  v_btc_float_change := (p_vault_snapshot->>'btc_float_value_usd')::NUMERIC * v_scenario.btc_impact;

  -- Net loss (positive = loss, negative = gain)
  v_net_loss := v_total_claims - v_btc_float_change;

  -- Calculate capital adequacy
  v_capital := (p_vault_snapshot->>'total_capital_usd')::NUMERIC;
  v_capital_adequacy_ratio := (v_capital - v_net_loss) / v_capital;

  -- Would vault survive?
  v_would_survive := (v_capital > v_net_loss);

  -- Store result
  INSERT INTO stress_test_results (
    scenario_id,
    vault_snapshot,
    total_claims,
    btc_float_change,
    net_loss,
    capital_adequacy_ratio,
    would_survive,
    tested_by
  )
  VALUES (
    p_scenario_id,
    p_vault_snapshot,
    v_total_claims,
    v_btc_float_change,
    v_net_loss,
    v_capital_adequacy_ratio,
    v_would_survive,
    p_tested_by
  )
  RETURNING id INTO v_result_id;

  -- Return result as JSON
  RETURN jsonb_build_object(
    'result_id', v_result_id,
    'scenario_name', v_scenario.scenario_name,
    'total_claims', v_total_claims,
    'btc_float_change', v_btc_float_change,
    'net_loss', v_net_loss,
    'capital_adequacy_ratio', v_capital_adequacy_ratio,
    'would_survive', v_would_survive
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Run all stress tests
CREATE OR REPLACE FUNCTION run_all_stress_tests(
  p_vault_snapshot JSONB,
  p_tested_by VARCHAR(100) DEFAULT 'system'
)
RETURNS JSONB AS $$
DECLARE
  v_scenario RECORD;
  v_results JSONB := '[]'::jsonb;
  v_test_result JSONB;
  v_worst_loss NUMERIC := 0;
  v_worst_scenario VARCHAR(100);
BEGIN
  -- Run stress test for each enabled scenario
  FOR v_scenario IN
    SELECT id, scenario_name
    FROM stress_scenarios
    WHERE enabled = TRUE
    ORDER BY severity_level DESC
  LOOP
    v_test_result := run_stress_test(v_scenario.id, p_vault_snapshot, p_tested_by);
    v_results := v_results || v_test_result;

    -- Track worst case
    IF (v_test_result->>'net_loss')::NUMERIC > v_worst_loss THEN
      v_worst_loss := (v_test_result->>'net_loss')::NUMERIC;
      v_worst_scenario := v_scenario.scenario_name;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'test_count', jsonb_array_length(v_results),
    'worst_case_loss', v_worst_loss,
    'worst_case_scenario', v_worst_scenario,
    'results', v_results
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGER FOR UPDATED_AT
-- =============================================================================

DROP TRIGGER IF EXISTS trg_stress_scenarios_updated_at ON stress_scenarios;
CREATE TRIGGER trg_stress_scenarios_updated_at
  BEFORE UPDATE ON stress_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS & DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE stress_scenarios IS 'Configurable stress test scenarios for portfolio risk assessment';
COMMENT ON TABLE stress_test_results IS 'Historical stress test results for trend analysis';
COMMENT ON VIEW v_stress_scenario_summary IS 'Summary of all stress scenarios with key metrics';
COMMENT ON VIEW v_recent_stress_tests IS 'Most recent 100 stress test executions';
COMMENT ON FUNCTION get_stressed_asset_price IS 'Get stressed price for an asset under a scenario';
COMMENT ON FUNCTION calculate_stress_payout IS 'Calculate policy payout under stress scenario';
COMMENT ON FUNCTION run_stress_test IS 'Execute stress test for a single scenario';
COMMENT ON FUNCTION run_all_stress_tests IS 'Execute all enabled stress tests and return aggregate results';

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT SELECT ON stress_scenarios TO tonsurance_integration;
GRANT SELECT ON stress_test_results TO tonsurance_analytics;
GRANT SELECT ON v_stress_scenario_summary TO tonsurance_analytics;
GRANT SELECT ON v_recent_stress_tests TO tonsurance_analytics;
GRANT INSERT, UPDATE ON stress_scenarios TO tonsurance_admin;
GRANT INSERT ON stress_test_results TO tonsurance_integration;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
DECLARE
  v_scenario_count INT;
BEGIN
  SELECT COUNT(*) INTO v_scenario_count
  FROM stress_scenarios;

  RAISE NOTICE 'Migration 008 completed successfully';
  RAISE NOTICE 'Loaded % stress test scenarios', v_scenario_count;
  RAISE NOTICE 'Created 2 analytics views and 4 helper functions';
  RAISE NOTICE 'Stress testing system ready for production';
END $$;
