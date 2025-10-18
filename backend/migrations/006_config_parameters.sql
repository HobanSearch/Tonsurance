-- Migration 006: Configuration Parameters System
-- Purpose: Database-backed configuration for all business logic parameters
-- Created: 2025-10-15
-- Enables hot-reloading of pricing, risk, and tranche parameters without redeployment

-- =============================================================================
-- CONFIG PARAMETERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS config_parameters (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,  -- 'pricing', 'risk', 'tranche', 'stress'
  key VARCHAR(100) NOT NULL,
  value_type VARCHAR(20) NOT NULL,  -- 'float', 'int', 'string', 'json'
  value_data JSONB NOT NULL,
  description TEXT,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT config_parameters_category_key_unique UNIQUE (category, key)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_config_parameters_category
  ON config_parameters(category);

CREATE INDEX IF NOT EXISTS idx_config_parameters_key
  ON config_parameters(key);

CREATE INDEX IF NOT EXISTS idx_config_parameters_updated
  ON config_parameters(last_updated_at DESC);

-- =============================================================================
-- CONFIG AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS config_audit_log (
  id BIGSERIAL PRIMARY KEY,
  config_id INT REFERENCES config_parameters(id),
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_reason TEXT,
  client_ip VARCHAR(45),
  dry_run BOOLEAN DEFAULT FALSE
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_config_audit_log_config_id
  ON config_audit_log(config_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_audit_log_category
  ON config_audit_log(category, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_audit_log_user
  ON config_audit_log(changed_by, changed_at DESC);

-- =============================================================================
-- TRIGGER FOR AUTOMATIC AUDIT LOGGING
-- =============================================================================

CREATE OR REPLACE FUNCTION log_config_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log actual changes, not initial inserts
  IF TG_OP = 'UPDATE' AND OLD.value_data IS DISTINCT FROM NEW.value_data THEN
    INSERT INTO config_audit_log (
      config_id,
      category,
      key,
      old_value,
      new_value,
      changed_by,
      changed_at
    ) VALUES (
      NEW.id,
      NEW.category,
      NEW.key,
      OLD.value_data,
      NEW.value_data,
      NEW.updated_by,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_config_change_audit ON config_parameters;
CREATE TRIGGER trg_config_change_audit
  AFTER UPDATE ON config_parameters
  FOR EACH ROW
  EXECUTE FUNCTION log_config_change();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get config value as JSON
CREATE OR REPLACE FUNCTION get_config_value(
  p_category VARCHAR(50),
  p_key VARCHAR(100)
)
RETURNS JSONB AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value_data INTO v_value
  FROM config_parameters
  WHERE category = p_category AND key = p_key;

  RETURN v_value;
END;
$$ LANGUAGE plpgsql;

-- Function to update config value with audit trail
CREATE OR REPLACE FUNCTION update_config_value(
  p_category VARCHAR(50),
  p_key VARCHAR(100),
  p_value JSONB,
  p_updated_by VARCHAR(100),
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_config_id INT;
BEGIN
  -- Update the value
  UPDATE config_parameters
  SET value_data = p_value,
      last_updated_at = NOW(),
      updated_by = p_updated_by
  WHERE category = p_category AND key = p_key
  RETURNING id INTO v_config_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Config parameter not found: %.%', p_category, p_key;
  END IF;

  -- Manual audit log entry with reason
  IF p_reason IS NOT NULL THEN
    UPDATE config_audit_log
    SET change_reason = p_reason
    WHERE config_id = v_config_id
      AND changed_at = (
        SELECT MAX(changed_at)
        FROM config_audit_log
        WHERE config_id = v_config_id
      );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SEED DATA - PRICING PARAMETERS
-- =============================================================================

-- Base rates for each asset (annual premium rate)
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'base_rate_USDC', 'float', '0.04', 'Base annual rate for USDC (4%)', 'system'),
  ('pricing', 'base_rate_USDT', 'float', '0.06', 'Base annual rate for USDT (6%)', 'system'),
  ('pricing', 'base_rate_DAI', 'float', '0.05', 'Base annual rate for DAI (5%)', 'system'),
  ('pricing', 'base_rate_FRAX', 'float', '0.08', 'Base annual rate for FRAX (8%)', 'system'),
  ('pricing', 'base_rate_BUSD', 'float', '0.045', 'Base annual rate for BUSD (4.5%)', 'system'),
  ('pricing', 'base_rate_USDP', 'float', '0.05', 'Base annual rate for USDP (5%)', 'system'),
  ('pricing', 'base_rate_USDe', 'float', '0.07', 'Base annual rate for USDe (7%)', 'system'),
  ('pricing', 'base_rate_sUSDe', 'float', '0.075', 'Base annual rate for sUSDe (7.5%)', 'system'),
  ('pricing', 'base_rate_USDY', 'float', '0.055', 'Base annual rate for USDY (5.5%)', 'system'),
  ('pricing', 'base_rate_PYUSD', 'float', '0.05', 'Base annual rate for PYUSD (5%)', 'system'),
  ('pricing', 'base_rate_GHO', 'float', '0.065', 'Base annual rate for GHO (6.5%)', 'system'),
  ('pricing', 'base_rate_LUSD', 'float', '0.055', 'Base annual rate for LUSD (5.5%)', 'system'),
  ('pricing', 'base_rate_crvUSD', 'float', '0.07', 'Base annual rate for crvUSD (7%)', 'system'),
  ('pricing', 'base_rate_mkUSD', 'float', '0.075', 'Base annual rate for mkUSD (7.5%)', 'system'),
  ('pricing', 'base_rate_default', 'float', '0.10', 'Default rate for unknown assets (10%)', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- Risk adjustment weights
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'risk_weight_reserve_quality', 'float', '0.30', 'Weight for reserve quality risk factor', 'system'),
  ('pricing', 'risk_weight_banking_exposure', 'float', '0.25', 'Weight for banking exposure risk factor', 'system'),
  ('pricing', 'risk_weight_redemption_velocity', 'float', '0.20', 'Weight for redemption velocity risk factor', 'system'),
  ('pricing', 'risk_weight_market_depth', 'float', '0.15', 'Weight for market depth risk factor', 'system'),
  ('pricing', 'risk_weight_regulatory_clarity', 'float', '-0.10', 'Weight for regulatory clarity (negative = reduces premium)', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- Size discount thresholds
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'size_discount_tier1_threshold', 'float', '10000000.0', 'Tier 1 discount threshold ($10M)', 'system'),
  ('pricing', 'size_discount_tier1_multiplier', 'float', '0.80', 'Tier 1 discount multiplier (20% off)', 'system'),
  ('pricing', 'size_discount_tier2_threshold', 'float', '1000000.0', 'Tier 2 discount threshold ($1M)', 'system'),
  ('pricing', 'size_discount_tier2_multiplier', 'float', '0.90', 'Tier 2 discount multiplier (10% off)', 'system'),
  ('pricing', 'size_discount_tier3_threshold', 'float', '100000.0', 'Tier 3 discount threshold ($100K)', 'system'),
  ('pricing', 'size_discount_tier3_multiplier', 'float', '0.95', 'Tier 3 discount multiplier (5% off)', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- Duration adjustments
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'duration_base_days', 'float', '90.0', 'Base duration in days for square root adjustment', 'system'),
  ('pricing', 'trigger_base_price', 'float', '0.97', 'Base trigger price for adjustment calculations', 'system'),
  ('pricing', 'trigger_adjustment_factor', 'float', '0.5', 'Factor for trigger price premium adjustment', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- Utilization thresholds
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'utilization_tier1_threshold', 'float', '0.90', 'Utilization tier 1 threshold (90%)', 'system'),
  ('pricing', 'utilization_tier1_multiplier', 'float', '1.50', 'Utilization tier 1 multiplier (50% increase)', 'system'),
  ('pricing', 'utilization_tier2_threshold', 'float', '0.75', 'Utilization tier 2 threshold (75%)', 'system'),
  ('pricing', 'utilization_tier2_multiplier', 'float', '1.25', 'Utilization tier 2 multiplier (25% increase)', 'system'),
  ('pricing', 'utilization_tier3_threshold', 'float', '0.50', 'Utilization tier 3 threshold (50%)', 'system'),
  ('pricing', 'utilization_tier3_multiplier', 'float', '1.10', 'Utilization tier 3 multiplier (10% increase)', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- Claims experience
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'target_loss_ratio', 'float', '0.40', 'Target loss ratio (40%)', 'system'),
  ('pricing', 'claims_adjustment_dampener', 'float', '0.5', 'Dampener for downward claims adjustment', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- Minimum premium
INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('pricing', 'min_premium_absolute', 'float', '100.0', 'Minimum absolute premium in USD', 'system'),
  ('pricing', 'min_premium_rate', 'float', '0.01', 'Minimum premium rate (1% of coverage)', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- SEED DATA - RISK PARAMETERS
-- =============================================================================

INSERT INTO config_parameters (category, key, value_type, value_data, description, updated_by)
VALUES
  ('risk', 'var_confidence_95', 'float', '0.95', 'VaR confidence level 95%', 'system'),
  ('risk', 'var_confidence_99', 'float', '0.99', 'VaR confidence level 99%', 'system'),
  ('risk', 'monte_carlo_simulations', 'int', '10000', 'Number of Monte Carlo simulations for VaR', 'system'),
  ('risk', 'historical_data_years', 'float', '5.0', 'Years of historical data for depeg analysis', 'system'),
  ('risk', 'risk_free_rate', 'float', '0.05', 'Risk-free rate for Sharpe ratio (5%)', 'system'),
  ('risk', 'reserve_multiplier', 'float', '1.5', 'Reserve multiplier (150% of expected loss)', 'system'),
  ('risk', 'stress_buffer_multiplier', 'float', '0.5', 'Stress buffer (50% of worst-case loss)', 'system')
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- COMMENTS & DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE config_parameters IS 'Central configuration store for all business logic parameters with hot-reload support';
COMMENT ON TABLE config_audit_log IS 'Audit trail for all configuration changes with user attribution';
COMMENT ON FUNCTION get_config_value IS 'Retrieve configuration value as JSONB';
COMMENT ON FUNCTION update_config_value IS 'Update configuration value with automatic audit logging';

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Read access for all services
GRANT SELECT ON config_parameters TO tonsurance_integration;
GRANT SELECT ON config_audit_log TO tonsurance_analytics;

-- Write access only for admin API
GRANT INSERT, UPDATE ON config_parameters TO tonsurance_admin;
GRANT INSERT ON config_audit_log TO tonsurance_admin;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 006 completed successfully';
  RAISE NOTICE 'Created config_parameters table with % rows', (SELECT COUNT(*) FROM config_parameters);
  RAISE NOTICE 'Audit logging enabled for all configuration changes';
  RAISE NOTICE 'Configuration hot-reload ready for production';
END $$;
