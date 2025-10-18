-- Migration 007: Asset Correlation Matrix
-- Stores correlation coefficients between asset pairs for risk modeling
-- Updated daily to capture changing market dynamics

CREATE TABLE IF NOT EXISTS asset_correlations (
  id SERIAL PRIMARY KEY,
  asset_1 VARCHAR(10) NOT NULL,
  asset_2 VARCHAR(10) NOT NULL,
  correlation DECIMAL(7,6) NOT NULL, -- -1.000000 to 1.000000
  window_days INT NOT NULL, -- 30, 90, 365
  data_points INT NOT NULL, -- How many price samples used
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure asset_1 < asset_2 alphabetically to avoid duplicates
  CONSTRAINT valid_correlation CHECK (correlation >= -1.0 AND correlation <= 1.0),
  CONSTRAINT valid_window CHECK (window_days IN (30, 90, 365)),
  CONSTRAINT valid_data_points CHECK (data_points >= 20),
  CONSTRAINT ordered_assets CHECK (asset_1 < asset_2),
  UNIQUE(asset_1, asset_2, window_days)
);

-- Indexes for efficient lookups
CREATE INDEX idx_correlations_assets ON asset_correlations(asset_1, asset_2);
CREATE INDEX idx_correlations_window ON asset_correlations(window_days);
CREATE INDEX idx_correlations_date ON asset_correlations(calculated_at DESC);
CREATE INDEX idx_correlations_high ON asset_correlations(correlation DESC) WHERE correlation > 0.8;

-- Function to get correlation (handles order independence)
CREATE OR REPLACE FUNCTION get_correlation(
  p_asset_1 VARCHAR(10),
  p_asset_2 VARCHAR(10),
  p_window_days INT
) RETURNS DECIMAL(7,6) AS $$
DECLARE
  v_correlation DECIMAL(7,6);
  v_asset_a VARCHAR(10);
  v_asset_b VARCHAR(10);
BEGIN
  -- Sort assets alphabetically
  IF p_asset_1 < p_asset_2 THEN
    v_asset_a := p_asset_1;
    v_asset_b := p_asset_2;
  ELSE
    v_asset_a := p_asset_2;
    v_asset_b := p_asset_1;
  END IF;

  -- Get most recent correlation
  SELECT correlation INTO v_correlation
  FROM asset_correlations
  WHERE asset_1 = v_asset_a
    AND asset_2 = v_asset_b
    AND window_days = p_window_days
  ORDER BY calculated_at DESC
  LIMIT 1;

  RETURN COALESCE(v_correlation, 0.0);
END;
$$ LANGUAGE plpgsql;

-- View for latest correlation matrix (90-day window)
CREATE OR REPLACE VIEW latest_correlations AS
SELECT DISTINCT ON (asset_1, asset_2)
  asset_1,
  asset_2,
  correlation,
  window_days,
  calculated_at
FROM asset_correlations
WHERE window_days = 90
ORDER BY asset_1, asset_2, calculated_at DESC;

-- View for contagion risk detection (high correlations)
CREATE OR REPLACE VIEW contagion_risk AS
SELECT
  asset_1,
  asset_2,
  correlation,
  calculated_at,
  CASE
    WHEN correlation >= 0.9 THEN 'CRITICAL'
    WHEN correlation >= 0.8 THEN 'HIGH'
    WHEN correlation >= 0.7 THEN 'ELEVATED'
    ELSE 'NORMAL'
  END as risk_level
FROM latest_correlations
WHERE correlation >= 0.7
ORDER BY correlation DESC;

COMMENT ON TABLE asset_correlations IS 'Pearson correlation coefficients between asset price movements';
COMMENT ON FUNCTION get_correlation IS 'Get correlation between two assets (order-independent)';
COMMENT ON VIEW contagion_risk IS 'Assets with high correlation indicating contagion risk';
