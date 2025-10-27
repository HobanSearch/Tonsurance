-- Hedge Positions Database Schema
-- Tracks all hedge positions across 4 venues
-- Enables position recovery, P&L tracking, and historical analysis

-- ============================================
-- HEDGE POSITIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS hedge_positions (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Policy linkage
  policy_id VARCHAR(100) NOT NULL,
  user_address VARCHAR(100) NOT NULL,

  -- Coverage details
  coverage_type VARCHAR(50) NOT NULL, -- 'depeg', 'bridge', 'smart_contract', 'oracle', 'cex_liquidation'
  chain VARCHAR(50) NOT NULL,
  stablecoin VARCHAR(20) NOT NULL,
  coverage_amount DECIMAL(30, 8) NOT NULL,
  hedge_ratio DECIMAL(5, 4) NOT NULL DEFAULT 0.20, -- Typically 20%

  -- Venue allocation
  venue VARCHAR(50) NOT NULL, -- 'polymarket', 'hyperliquid', 'binance', 'allianz'
  venue_allocation DECIMAL(5, 4) NOT NULL, -- e.g., 0.30 for 30%
  hedge_amount DECIMAL(30, 8) NOT NULL, -- coverage_amount * hedge_ratio * venue_allocation

  -- Position details
  position_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'open', 'closed', 'failed'
  entry_price DECIMAL(30, 8),
  entry_timestamp TIMESTAMPTZ,
  exit_price DECIMAL(30, 8),
  exit_timestamp TIMESTAMPTZ,

  -- Venue-specific data (JSON)
  venue_order_id VARCHAR(200), -- External order ID from venue
  venue_position_data JSONB, -- Venue-specific position details

  -- P&L tracking
  entry_cost DECIMAL(30, 8), -- Total cost to enter position
  exit_proceeds DECIMAL(30, 8), -- Total proceeds from exit
  realized_pnl DECIMAL(30, 8), -- exit_proceeds - entry_cost
  unrealized_pnl DECIMAL(30, 8), -- Current mark-to-market P&L

  -- Risk management
  liquidation_price DECIMAL(30, 8), -- For leveraged positions
  leverage DECIMAL(5, 2), -- e.g., 5.00 for 5x
  margin_ratio DECIMAL(5, 4), -- Current margin/maintenance

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,

  -- Indexes
  CONSTRAINT fk_policy FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  INDEX idx_policy_id (policy_id),
  INDEX idx_user_address (user_address),
  INDEX idx_coverage_type (coverage_type),
  INDEX idx_venue (venue),
  INDEX idx_status (position_status),
  INDEX idx_created_at (created_at DESC)
);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_hedge_position_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hedge_position_updated
  BEFORE UPDATE ON hedge_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_hedge_position_timestamp();

-- ============================================
-- HEDGE COST SNAPSHOTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS hedge_cost_snapshots (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Product identifiers
  coverage_type VARCHAR(50) NOT NULL,
  chain VARCHAR(50) NOT NULL,
  stablecoin VARCHAR(20) NOT NULL,
  reference_coverage_amount DECIMAL(30, 8) NOT NULL,

  -- Venue costs
  polymarket_cost DECIMAL(30, 8),
  polymarket_market_odds DECIMAL(10, 6),
  hyperliquid_cost DECIMAL(30, 8),
  hyperliquid_funding_rate DECIMAL(10, 6),
  binance_cost DECIMAL(30, 8),
  binance_funding_rate DECIMAL(10, 6),
  allianz_cost DECIMAL(30, 8),
  allianz_rate DECIMAL(10, 6),

  -- Totals
  total_hedge_cost DECIMAL(30, 8) NOT NULL,
  effective_premium_addition DECIMAL(10, 6) NOT NULL,
  hedge_ratio DECIMAL(5, 4) NOT NULL DEFAULT 0.20,

  -- Market conditions
  volatility_index DECIMAL(5, 4),
  risk_multiplier DECIMAL(5, 4),

  -- Metadata
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  INDEX idx_product (coverage_type, chain, stablecoin),
  INDEX idx_timestamp (timestamp DESC)
);

-- ============================================
-- HEDGE EXECUTIONS TABLE (Audit Log)
-- ============================================

CREATE TABLE IF NOT EXISTS hedge_executions (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Position linkage
  hedge_position_id INTEGER NOT NULL,
  policy_id VARCHAR(100) NOT NULL,

  -- Execution details
  execution_type VARCHAR(20) NOT NULL, -- 'open', 'close', 'partial_close', 'liquidation'
  venue VARCHAR(50) NOT NULL,
  execution_price DECIMAL(30, 8) NOT NULL,
  execution_amount DECIMAL(30, 8) NOT NULL,
  execution_cost DECIMAL(30, 8) NOT NULL,

  -- Venue response
  venue_order_id VARCHAR(200),
  venue_transaction_id VARCHAR(200),
  venue_response JSONB,

  -- Status
  execution_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
  error_message TEXT,

  -- Metadata
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT fk_hedge_position FOREIGN KEY (hedge_position_id) REFERENCES hedge_positions(id) ON DELETE CASCADE,
  INDEX idx_hedge_position_id (hedge_position_id),
  INDEX idx_policy_id (policy_id),
  INDEX idx_venue (venue),
  INDEX idx_executed_at (executed_at DESC)
);

-- ============================================
-- HEDGE PNL HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS hedge_pnl_history (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Position linkage
  hedge_position_id INTEGER NOT NULL,

  -- P&L snapshot
  mark_price DECIMAL(30, 8) NOT NULL,
  unrealized_pnl DECIMAL(30, 8) NOT NULL,
  margin_ratio DECIMAL(5, 4),
  liquidation_distance DECIMAL(5, 4), -- % away from liquidation

  -- Metadata
  snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT fk_hedge_position_pnl FOREIGN KEY (hedge_position_id) REFERENCES hedge_positions(id) ON DELETE CASCADE,
  INDEX idx_hedge_position_id (hedge_position_id),
  INDEX idx_snapshot_timestamp (snapshot_timestamp DESC)
);

-- ============================================
-- VIEWS
-- ============================================

-- Active positions summary
CREATE OR REPLACE VIEW active_hedge_positions AS
SELECT
  hp.id,
  hp.policy_id,
  hp.user_address,
  hp.coverage_type,
  hp.chain,
  hp.stablecoin,
  hp.venue,
  hp.hedge_amount,
  hp.entry_price,
  hp.unrealized_pnl,
  hp.liquidation_price,
  hp.leverage,
  hp.margin_ratio,
  hp.created_at
FROM hedge_positions hp
WHERE hp.position_status = 'open'
ORDER BY hp.created_at DESC;

-- Per-venue P&L summary
CREATE OR REPLACE VIEW venue_pnl_summary AS
SELECT
  venue,
  position_status,
  COUNT(*) as position_count,
  SUM(hedge_amount) as total_hedge_amount,
  SUM(COALESCE(realized_pnl, 0)) as total_realized_pnl,
  SUM(COALESCE(unrealized_pnl, 0)) as total_unrealized_pnl,
  AVG(COALESCE(realized_pnl, 0)) as avg_pnl_per_position
FROM hedge_positions
GROUP BY venue, position_status
ORDER BY venue, position_status;

-- Per-coverage-type P&L summary
CREATE OR REPLACE VIEW coverage_type_pnl_summary AS
SELECT
  coverage_type,
  COUNT(*) as position_count,
  SUM(hedge_amount) as total_hedge_amount,
  SUM(COALESCE(realized_pnl, 0)) as total_realized_pnl,
  SUM(COALESCE(unrealized_pnl, 0)) as total_unrealized_pnl,
  AVG(COALESCE(realized_pnl, 0)) as avg_pnl_per_position
FROM hedge_positions
WHERE position_status IN ('open', 'closed')
GROUP BY coverage_type
ORDER BY total_hedge_amount DESC;

-- Recent hedge cost trends
CREATE OR REPLACE VIEW hedge_cost_trends AS
SELECT
  coverage_type,
  chain,
  stablecoin,
  DATE_TRUNC('hour', timestamp) as hour,
  AVG(total_hedge_cost) as avg_hedge_cost,
  MIN(total_hedge_cost) as min_hedge_cost,
  MAX(total_hedge_cost) as max_hedge_cost,
  AVG(effective_premium_addition) as avg_premium_addition
FROM hedge_cost_snapshots
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY coverage_type, chain, stablecoin, DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC;

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Find all open positions for a policy
-- SELECT * FROM hedge_positions WHERE policy_id = 'policy_123' AND position_status = 'open';

-- Calculate total unrealized P&L across all venues
-- SELECT venue, SUM(unrealized_pnl) FROM hedge_positions WHERE position_status = 'open' GROUP BY venue;

-- Get recent hedge cost trend for USDC depeg on Ethereum
-- SELECT * FROM hedge_cost_snapshots
-- WHERE coverage_type = 'depeg' AND chain = 'Ethereum' AND stablecoin = 'USDC'
-- ORDER BY timestamp DESC LIMIT 100;

-- Find positions at risk of liquidation
-- SELECT * FROM active_hedge_positions WHERE margin_ratio < 0.20 ORDER BY margin_ratio ASC;

-- Get execution history for a position
-- SELECT * FROM hedge_executions WHERE hedge_position_id = 42 ORDER BY executed_at DESC;
