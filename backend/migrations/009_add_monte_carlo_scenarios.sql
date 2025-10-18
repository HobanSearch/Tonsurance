-- Migration 009: Monte Carlo Scenarios and Stress Tests
-- Stores scenario definitions for Monte Carlo simulations and stress testing
-- Replaces hardcoded scenarios with database-driven configuration

CREATE TABLE IF NOT EXISTS stress_scenarios (
  id SERIAL PRIMARY KEY,
  scenario_name VARCHAR(100) UNIQUE NOT NULL,
  scenario_type VARCHAR(50) NOT NULL, -- 'historical', 'synthetic', 'stress_test'
  description TEXT,
  probability DECIMAL(8,6), -- Annual probability (0.000001 to 1.0)
  severity_multiplier DECIMAL(6,4), -- How severe compared to normal (1.0 = normal)

  -- Asset-specific impacts
  btc_change DECIMAL(6,4), -- e.g., -0.5000 for 50% drop, 0.2700 for 27% gain
  usdc_price DECIMAL(10,8),
  usdt_price DECIMAL(10,8),
  dai_price DECIMAL(10,8),
  usdp_price DECIMAL(10,8),
  frax_price DECIMAL(10,8),
  busd_price DECIMAL(10,8),

  -- Market dynamics
  correlation_shift DECIMAL(6,4), -- Change in correlations (-1.0 to 1.0)
  volatility_multiplier DECIMAL(6,4), -- Volatility change (1.0 = no change)
  liquidity_impact DECIMAL(6,4), -- Impact on market depth (0.0 to 1.0, higher = worse)

  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  weight DECIMAL(8,6) DEFAULT 1.0, -- Weighting in Monte Carlo (relative importance)
  source VARCHAR(100), -- 'historical:2023-03-10' or 'synthetic'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_probability CHECK (probability IS NULL OR (probability >= 0.0 AND probability <= 1.0)),
  CONSTRAINT valid_severity CHECK (severity_multiplier > 0.0 AND severity_multiplier <= 10.0),
  CONSTRAINT valid_correlation_shift CHECK (correlation_shift >= -1.0 AND correlation_shift <= 1.0),
  CONSTRAINT valid_weight CHECK (weight >= 0.0 AND weight <= 100.0)
);

-- Historical scenario events (links scenarios to actual events)
CREATE TABLE IF NOT EXISTS scenario_events (
  id SERIAL PRIMARY KEY,
  scenario_id INT NOT NULL REFERENCES stress_scenarios(id) ON DELETE CASCADE,
  event_date TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'depeg', 'banking_crisis', 'exploit', 'regulatory'
  description TEXT,
  impact_usd BIGINT, -- USD cents
  affected_assets VARCHAR(10)[], -- Array of asset symbols
  duration_hours INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scenario performance tracking
CREATE TABLE IF NOT EXISTS scenario_backtest_results (
  id SERIAL PRIMARY KEY,
  scenario_id INT NOT NULL REFERENCES stress_scenarios(id) ON DELETE CASCADE,
  backtest_date TIMESTAMPTZ NOT NULL,
  predicted_loss_usd BIGINT, -- USD cents
  actual_loss_usd BIGINT, -- USD cents (if event occurred)
  prediction_error DECIMAL(10,4), -- Percentage error
  vault_state JSONB, -- Snapshot of vault at time of test
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scenarios_type ON stress_scenarios(scenario_type);
CREATE INDEX idx_scenarios_active ON stress_scenarios(is_active) WHERE is_active = true;
CREATE INDEX idx_scenarios_probability ON stress_scenarios(probability DESC);
CREATE INDEX idx_scenario_events_date ON scenario_events(event_date DESC);
CREATE INDEX idx_scenario_events_type ON scenario_events(event_type);
CREATE INDEX idx_backtest_results_scenario ON scenario_backtest_results(scenario_id);
CREATE INDEX idx_backtest_results_date ON scenario_backtest_results(backtest_date DESC);

-- Pre-populate with historical scenarios (migrated from risk_model.ml)
INSERT INTO stress_scenarios (
  scenario_name, scenario_type, description, probability, severity_multiplier,
  btc_change, usdc_price, usdt_price, dai_price, usdp_price, frax_price, busd_price,
  correlation_shift, volatility_multiplier, liquidity_impact, source, weight
) VALUES
  (
    'Banking Crisis (SVB)',
    'historical',
    'March 2023 Silicon Valley Bank collapse causing USDC depeg',
    0.20, -- 20% annual probability
    3.5,
    0.27, 1.00, 1.02, 1.01, 1.00, 1.00, 1.00,
    -0.3, 2.5, 0.7,
    'historical:2023-03-10',
    1.5
  ),
  (
    'Crypto Crash',
    'stress_test',
    'Severe crypto market downturn with 50% BTC decline',
    0.15,
    4.0,
    -0.50, 0.98, 0.97, 0.96, 0.98, 0.95, 0.98,
    0.5, 3.0, 0.5,
    'synthetic',
    1.0
  ),
  (
    'Regulatory Shutdown',
    'stress_test',
    'Regulatory crackdown on stablecoin issuers',
    0.10,
    5.0,
    -0.30, 0.80, 0.85, 0.90, 0.85, 0.88, 0.80,
    0.0, 2.0, 0.9,
    'synthetic',
    0.8
  ),
  (
    'Multiple Stablecoin Failure',
    'stress_test',
    'Cascading failures across multiple stablecoins',
    0.05,
    8.0,
    0.50, 0.75, 0.75, 0.80, 0.78, 0.75, 0.75,
    0.8, 4.0, 0.95,
    'synthetic',
    2.0
  ),
  (
    'Normal Market Conditions',
    'historical',
    'Baseline scenario with normal volatility',
    0.50,
    1.0,
    0.0, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    0.0, 1.0, 0.1,
    'baseline',
    1.0
  )
ON CONFLICT (scenario_name) DO NOTHING;

-- View for active scenarios with probabilities
CREATE OR REPLACE VIEW active_scenarios AS
SELECT
  id,
  scenario_name,
  scenario_type,
  probability,
  severity_multiplier,
  weight,
  probability * weight as weighted_probability
FROM stress_scenarios
WHERE is_active = true
ORDER BY weighted_probability DESC;

-- Function to normalize scenario weights (ensure sum = 1.0)
CREATE OR REPLACE FUNCTION normalize_scenario_weights()
RETURNS void AS $$
DECLARE
  v_total_weight DECIMAL(10,6);
BEGIN
  SELECT SUM(weight) INTO v_total_weight
  FROM stress_scenarios
  WHERE is_active = true;

  IF v_total_weight > 0 THEN
    UPDATE stress_scenarios
    SET weight = weight / v_total_weight
    WHERE is_active = true;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE stress_scenarios IS 'Monte Carlo scenarios and stress test definitions';
COMMENT ON TABLE scenario_events IS 'Historical events that match scenario definitions';
COMMENT ON TABLE scenario_backtest_results IS 'Backtest results for scenario accuracy';
COMMENT ON FUNCTION normalize_scenario_weights IS 'Normalize weights to sum to 1.0 for probability calculations';
