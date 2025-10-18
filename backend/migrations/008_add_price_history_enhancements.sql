-- Migration 008: Price History Enhancements
-- Adds additional fields and indexes to price_history table for ETL
-- Assumes price_history table exists from earlier migration

-- Add new columns if they don't exist
ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS data_quality_score DECIMAL(3,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_outlier BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS volatility_1h DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS volume_usd DECIMAL(20,2);

-- Add constraints
ALTER TABLE price_history
  ADD CONSTRAINT IF NOT EXISTS valid_quality_score
    CHECK (data_quality_score >= 0.0 AND data_quality_score <= 1.0);

-- Additional indexes for ETL queries
CREATE INDEX IF NOT EXISTS idx_price_history_source
  ON price_history(source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_outliers
  ON price_history(asset, timestamp DESC)
  WHERE is_outlier = true;
CREATE INDEX IF NOT EXISTS idx_price_history_quality
  ON price_history(asset, timestamp DESC)
  WHERE data_quality_score >= 0.8;

-- Materialized view for daily price statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_price_stats AS
SELECT
  asset,
  DATE(timestamp) as date,
  MIN(price) as low,
  MAX(price) as high,
  AVG(price) as avg,
  STDDEV(price) as stddev,
  COUNT(*) as samples,
  MIN(CASE WHEN is_outlier = false THEN price END) as low_filtered,
  MAX(CASE WHEN is_outlier = false THEN price END) as high_filtered
FROM price_history
WHERE timestamp >= NOW() - INTERVAL '2 years'
GROUP BY asset, DATE(timestamp);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_price_stats_unique
  ON daily_price_stats(asset, date);

-- Function to refresh daily stats (called by ETL)
CREATE OR REPLACE FUNCTION refresh_daily_price_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_price_stats;
END;
$$ LANGUAGE plpgsql;

-- View for recent price anomalies
CREATE OR REPLACE VIEW recent_price_anomalies AS
SELECT
  asset,
  price,
  timestamp,
  source,
  data_quality_score,
  volatility_1h
FROM price_history
WHERE timestamp >= NOW() - INTERVAL '7 days'
  AND (is_outlier = true OR data_quality_score < 0.7)
ORDER BY timestamp DESC;

COMMENT ON COLUMN price_history.data_quality_score IS 'Quality score 0.0-1.0 based on deviation from other sources';
COMMENT ON COLUMN price_history.is_outlier IS 'Statistical outlier (>5σ from mean)';
COMMENT ON COLUMN price_history.volatility_1h IS 'Rolling 1-hour price volatility';
COMMENT ON MATERIALIZED VIEW daily_price_stats IS 'Daily aggregate price statistics for all assets';
