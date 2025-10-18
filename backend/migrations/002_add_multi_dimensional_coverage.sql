-- Multi-Dimensional Coverage Tracking Migration
-- Adds support for 560 product combinations (5 types × 8 chains × 14 stablecoins)

-- Add chain and stablecoin dimensions to policies table
ALTER TABLE IF EXISTS policies
  ADD COLUMN IF NOT EXISTS chain_id INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stablecoin_id INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_type INT NOT NULL DEFAULT 0;

-- Create index for fast product lookup
CREATE INDEX IF NOT EXISTS idx_policies_product
  ON policies(coverage_type, chain_id, stablecoin_id);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_policies_active
  ON policies(status, expiry_time)
  WHERE status = 'active';

-- Create product exposure aggregation table
CREATE TABLE IF NOT EXISTS product_exposure (
  coverage_type INT NOT NULL,
  chain_id INT NOT NULL,
  stablecoin_id INT NOT NULL,
  total_coverage BIGINT NOT NULL DEFAULT 0,
  policy_count INT NOT NULL DEFAULT 0,
  total_premium BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (coverage_type, chain_id, stablecoin_id)
);

-- Create index for fast aggregation queries
CREATE INDEX IF NOT EXISTS idx_product_exposure_type
  ON product_exposure(coverage_type);
CREATE INDEX IF NOT EXISTS idx_product_exposure_chain
  ON product_exposure(chain_id);
CREATE INDEX IF NOT EXISTS idx_product_exposure_stablecoin
  ON product_exposure(stablecoin_id);
CREATE INDEX IF NOT EXISTS idx_product_exposure_updated
  ON product_exposure(updated_at DESC);

-- Create hedge positions table for tracking external hedges
CREATE TABLE IF NOT EXISTS hedge_positions (
  hedge_id BIGSERIAL PRIMARY KEY,
  coverage_type INT NOT NULL,
  chain_id INT NOT NULL,
  stablecoin_id INT NOT NULL,
  venue VARCHAR(50) NOT NULL, -- 'polymarket', 'perpetuals', 'allianz'
  position_size BIGINT NOT NULL, -- in USD cents
  entry_price FLOAT NOT NULL,
  current_price FLOAT,
  external_order_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed', 'liquidated'
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  pnl BIGINT, -- in USD cents
  metadata JSONB
);

-- Index for active hedge positions
CREATE INDEX IF NOT EXISTS idx_hedge_positions_active
  ON hedge_positions(status, coverage_type, chain_id, stablecoin_id)
  WHERE status = 'open';

-- Create chain risk metrics table
CREATE TABLE IF NOT EXISTS chain_risk_metrics (
  chain_id INT PRIMARY KEY,
  chain_name VARCHAR(50) NOT NULL,
  security_multiplier FLOAT NOT NULL DEFAULT 1.0,
  validator_centralization_score FLOAT NOT NULL DEFAULT 0.5,
  bridge_exploit_count INT NOT NULL DEFAULT 0,
  total_tvl_usd BIGINT NOT NULL DEFAULT 0,
  last_incident_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default chain risk metrics
INSERT INTO chain_risk_metrics (chain_id, chain_name, security_multiplier, validator_centralization_score)
VALUES
  (0, 'Ethereum', 1.0, 0.2),
  (1, 'Arbitrum', 1.1, 0.3),
  (2, 'Base', 1.1, 0.35),
  (3, 'Polygon', 1.2, 0.4),
  (4, 'Optimism', 1.1, 0.3),
  (5, 'Bitcoin', 0.9, 0.15),
  (6, 'Lightning', 1.3, 0.5),
  (7, 'Solana', 1.4, 0.6),
  (8, 'TON', 1.15, 0.4)
ON CONFLICT (chain_id) DO NOTHING;

-- Create view for real-time product exposure
CREATE OR REPLACE VIEW v_product_exposure_realtime AS
SELECT
  p.coverage_type,
  p.chain_id,
  p.stablecoin_id,
  crm.chain_name,
  COUNT(*) as policy_count,
  SUM(p.coverage_amount) as total_coverage,
  SUM(p.premium_paid) as total_premium,
  AVG(p.coverage_amount) as avg_coverage,
  MIN(p.expiry_time) as earliest_expiry,
  MAX(p.expiry_time) as latest_expiry
FROM policies p
LEFT JOIN chain_risk_metrics crm ON p.chain_id = crm.chain_id
WHERE p.status = 'active'
GROUP BY p.coverage_type, p.chain_id, p.stablecoin_id, crm.chain_name;

-- Create function to update product exposure cache
CREATE OR REPLACE FUNCTION update_product_exposure_cache()
RETURNS VOID AS $$
BEGIN
  -- Truncate and rebuild exposure cache
  TRUNCATE product_exposure;

  INSERT INTO product_exposure (
    coverage_type,
    chain_id,
    stablecoin_id,
    total_coverage,
    policy_count,
    total_premium,
    updated_at
  )
  SELECT
    coverage_type,
    chain_id,
    stablecoin_id,
    SUM(coverage_amount),
    COUNT(*),
    SUM(premium_paid),
    NOW()
  FROM policies
  WHERE status = 'active'
  GROUP BY coverage_type, chain_id, stablecoin_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update exposure cache on policy changes
CREATE OR REPLACE FUNCTION trigger_update_product_exposure()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert exposure record
  INSERT INTO product_exposure (
    coverage_type,
    chain_id,
    stablecoin_id,
    total_coverage,
    policy_count,
    total_premium,
    updated_at
  )
  SELECT
    NEW.coverage_type,
    NEW.chain_id,
    NEW.stablecoin_id,
    SUM(coverage_amount),
    COUNT(*),
    SUM(premium_paid),
    NOW()
  FROM policies
  WHERE coverage_type = NEW.coverage_type
    AND chain_id = NEW.chain_id
    AND stablecoin_id = NEW.stablecoin_id
    AND status = 'active'
  GROUP BY coverage_type, chain_id, stablecoin_id
  ON CONFLICT (coverage_type, chain_id, stablecoin_id)
  DO UPDATE SET
    total_coverage = EXCLUDED.total_coverage,
    policy_count = EXCLUDED.policy_count,
    total_premium = EXCLUDED.total_premium,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to policies table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policies') THEN
    DROP TRIGGER IF EXISTS trg_update_product_exposure ON policies;
    CREATE TRIGGER trg_update_product_exposure
    AFTER INSERT OR UPDATE OF status, coverage_amount, premium_paid
    ON policies
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_product_exposure();
  END IF;
END $$;

-- Create coverage type enumeration mapping
CREATE TABLE IF NOT EXISTS coverage_types (
  type_id INT PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  base_risk_multiplier FLOAT NOT NULL DEFAULT 1.0
);

INSERT INTO coverage_types (type_id, type_name, description, base_risk_multiplier)
VALUES
  (0, 'depeg', 'Stablecoin depeg protection', 1.0),
  (1, 'bridge_exploit', 'Cross-chain bridge exploit coverage', 1.5),
  (2, 'smart_contract', 'Smart contract vulnerability protection', 1.3),
  (3, 'oracle_failure', 'Oracle manipulation/failure coverage', 1.2),
  (4, 'cex_liquidation', 'CEX liquidation cascade protection', 1.4)
ON CONFLICT (type_id) DO NOTHING;

-- Create stablecoin enumeration mapping
CREATE TABLE IF NOT EXISTS stablecoins (
  coin_id INT PRIMARY KEY,
  coin_symbol VARCHAR(10) NOT NULL UNIQUE,
  coin_name VARCHAR(100) NOT NULL,
  depeg_risk_score FLOAT NOT NULL DEFAULT 0.5,
  market_cap_usd BIGINT,
  last_depeg_event TIMESTAMP
);

INSERT INTO stablecoins (coin_id, coin_symbol, coin_name, depeg_risk_score)
VALUES
  (0, 'USDC', 'USD Coin', 0.15),
  (1, 'USDT', 'Tether', 0.25),
  (2, 'USDP', 'Pax Dollar', 0.20),
  (3, 'DAI', 'Dai', 0.30),
  (4, 'FRAX', 'Frax', 0.40),
  (5, 'BUSD', 'Binance USD', 0.35),
  (6, 'USDe', 'Ethena USD', 0.50),
  (7, 'sUSDe', 'Staked Ethena USD', 0.55),
  (8, 'USDY', 'Ondo USDY', 0.30),
  (9, 'PYUSD', 'PayPal USD', 0.25),
  (10, 'GHO', 'Aave GHO', 0.35),
  (11, 'LUSD', 'Liquity USD', 0.30),
  (12, 'crvUSD', 'Curve USD', 0.40),
  (13, 'mkUSD', 'Prisma mkUSD', 0.45)
ON CONFLICT (coin_id) DO NOTHING;

-- Create materialized view for hedge requirements
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hedge_requirements AS
SELECT
  pe.coverage_type,
  pe.chain_id,
  pe.stablecoin_id,
  ct.type_name,
  crm.chain_name,
  sc.coin_symbol,
  pe.total_coverage,
  pe.policy_count,
  -- Calculate required hedge size (20% of exposure)
  (pe.total_coverage * 0.20)::BIGINT as required_hedge_size,
  -- Get current hedge positions
  COALESCE(SUM(hp.position_size), 0) as current_hedge_size,
  -- Calculate drift
  ((pe.total_coverage * 0.20) - COALESCE(SUM(hp.position_size), 0))::BIGINT as hedge_drift,
  -- Calculate drift percentage
  CASE
    WHEN pe.total_coverage > 0 THEN
      ((pe.total_coverage * 0.20 - COALESCE(SUM(hp.position_size), 0))::FLOAT / (pe.total_coverage * 0.20)) * 100
    ELSE 0
  END as drift_percentage,
  pe.updated_at
FROM product_exposure pe
LEFT JOIN coverage_types ct ON pe.coverage_type = ct.type_id
LEFT JOIN chain_risk_metrics crm ON pe.chain_id = crm.chain_id
LEFT JOIN stablecoins sc ON pe.stablecoin_id = sc.coin_id
LEFT JOIN hedge_positions hp ON
  pe.coverage_type = hp.coverage_type AND
  pe.chain_id = hp.chain_id AND
  pe.stablecoin_id = hp.stablecoin_id AND
  hp.status = 'open'
GROUP BY
  pe.coverage_type, pe.chain_id, pe.stablecoin_id,
  ct.type_name, crm.chain_name, sc.coin_symbol,
  pe.total_coverage, pe.policy_count, pe.updated_at;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_hedge_requirements_drift
  ON mv_hedge_requirements(ABS(drift_percentage) DESC);

-- Function to refresh hedge requirements
CREATE OR REPLACE FUNCTION refresh_hedge_requirements()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_hedge_requirements;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE product_exposure IS 'Cached aggregation of exposure by (coverage_type, chain, stablecoin) - updated via triggers';
COMMENT ON TABLE hedge_positions IS 'External hedge positions across Polymarket, Perpetuals, and Allianz';
COMMENT ON TABLE chain_risk_metrics IS 'Risk multipliers and metrics for each supported blockchain';
COMMENT ON VIEW v_product_exposure_realtime IS 'Real-time view of policy exposure without caching';
COMMENT ON MATERIALIZED VIEW mv_hedge_requirements IS 'Pre-calculated hedge drift for 560 product combinations';
