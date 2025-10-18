-- Migration 006: Historical Depeg Events
-- Creates table for storing historical depeg events detected from price data
-- Used for continuous learning and model improvement

CREATE TABLE IF NOT EXISTS historical_depegs (
  id SERIAL PRIMARY KEY,
  asset VARCHAR(10) NOT NULL,
  min_price DECIMAL(10,8) NOT NULL,
  duration_seconds INT NOT NULL,
  recovery_time_seconds INT NOT NULL,
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,
  recovery_timestamp TIMESTAMPTZ,
  source VARCHAR(50) NOT NULL DEFAULT 'coingecko',
  validated BOOLEAN NOT NULL DEFAULT false,
  severity_score DECIMAL(5,4), -- 0.0000 to 1.0000 (how severe the depeg was)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_price CHECK (min_price >= 0.0 AND min_price <= 2.0),
  CONSTRAINT valid_duration CHECK (duration_seconds >= 3600), -- Minimum 1 hour
  CONSTRAINT valid_recovery CHECK (recovery_time_seconds >= duration_seconds),
  CONSTRAINT valid_timestamps CHECK (end_timestamp >= start_timestamp)
);

-- Indexes for efficient querying
CREATE INDEX idx_historical_depegs_asset ON historical_depegs(asset);
CREATE INDEX idx_historical_depegs_start_time ON historical_depegs(start_timestamp DESC);
CREATE INDEX idx_historical_depegs_severity ON historical_depegs(severity_score DESC);
CREATE INDEX idx_historical_depegs_validated ON historical_depegs(validated);

-- View for quick depeg statistics by asset
CREATE OR REPLACE VIEW depeg_statistics AS
SELECT
  asset,
  COUNT(*) as total_depegs,
  AVG(min_price) as avg_min_price,
  MIN(min_price) as worst_depeg,
  AVG(duration_seconds) as avg_duration_seconds,
  MAX(duration_seconds) as max_duration_seconds,
  AVG(recovery_time_seconds) as avg_recovery_seconds,
  AVG(severity_score) as avg_severity,
  MAX(start_timestamp) as most_recent_depeg
FROM historical_depegs
WHERE validated = true
GROUP BY asset;

COMMENT ON TABLE historical_depegs IS 'Historical stablecoin depeg events detected from price data';
COMMENT ON COLUMN historical_depegs.severity_score IS 'Calculated as (1.0 - min_price), higher = worse';
COMMENT ON COLUMN historical_depegs.validated IS 'Whether event has been manually validated or meets quality thresholds';
