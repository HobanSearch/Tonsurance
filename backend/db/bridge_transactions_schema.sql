-- Bridge Transactions Database Schema
-- Tracks cross-chain bridge transactions for float capital deployment
-- Integrates with Phase 4 bridge infrastructure (Rubic aggregator)

-- ============================================
-- BRIDGE TRANSACTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS bridge_transactions (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- User/wallet linkage
  user_address VARCHAR(100),
  from_wallet_address VARCHAR(200) NOT NULL,
  to_wallet_address VARCHAR(200),

  -- Chain and asset details
  source_chain VARCHAR(50) NOT NULL, -- 'TON', 'Ethereum', 'Arbitrum', 'Polygon', 'Base', 'Optimism'
  dest_chain VARCHAR(50) NOT NULL,
  asset VARCHAR(20) NOT NULL, -- 'USDT', 'USDC', 'TON', 'WBTC', 'WETH', 'AAVE', 'COMP'

  -- Amount tracking
  source_amount DECIMAL(30, 8) NOT NULL,
  dest_amount DECIMAL(30, 8), -- Filled when tx completes
  dest_amount_min DECIMAL(30, 8), -- Minimum expected (after slippage)

  -- Fee breakdown
  gas_fee_usd DECIMAL(30, 8),
  bridge_fee_usd DECIMAL(30, 8),
  protocol_fee_usd DECIMAL(30, 8),
  total_fee_usd DECIMAL(30, 8),
  price_impact_percent DECIMAL(10, 6),
  slippage_tolerance_percent DECIMAL(10, 6),

  -- Bridge provider details
  bridge_provider VARCHAR(50) NOT NULL, -- 'Symbiosis', 'Retrobridge', 'Changelly', etc.
  bridge_type VARCHAR(20), -- 'token', 'liquidity', 'native'
  quote_id VARCHAR(100), -- Rubic quote ID

  -- Transaction hashes
  source_tx_hash VARCHAR(200), -- Source chain transaction
  dest_tx_hash VARCHAR(200), -- Destination chain transaction

  -- Status tracking
  transaction_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  failure_reason TEXT,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  estimated_arrival_time TIMESTAMPTZ,
  actual_duration_seconds INTEGER, -- completed_at - started_at
  estimated_duration_seconds INTEGER,

  -- Security and health
  security_score DECIMAL(5, 4), -- 0.0-1.0 from bridge health monitor
  tvl_usd DECIMAL(30, 2), -- Bridge TVL at time of transaction

  -- Route details (JSON)
  route_details JSONB, -- Full route quote from Rubic

  -- Use case tracking
  purpose VARCHAR(50), -- 'float_deployment', 'hedge_rebalance', 'user_withdrawal', 'liquidity_provision'
  related_policy_id VARCHAR(100), -- If related to a specific policy
  related_hedge_position_id INTEGER, -- Foreign key to hedge_positions

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,

  -- Indexes
  INDEX idx_user_address (user_address),
  INDEX idx_source_chain (source_chain),
  INDEX idx_dest_chain (dest_chain),
  INDEX idx_asset (asset),
  INDEX idx_bridge_provider (bridge_provider),
  INDEX idx_status (transaction_status),
  INDEX idx_source_tx_hash (source_tx_hash),
  INDEX idx_dest_tx_hash (dest_tx_hash),
  INDEX idx_started_at (started_at DESC),
  INDEX idx_purpose (purpose)
);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_bridge_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bridge_transaction_updated
  BEFORE UPDATE ON bridge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_bridge_transaction_timestamp();

-- ============================================
-- BRIDGE ROUTES TABLE (Route Discovery Cache)
-- ============================================

CREATE TABLE IF NOT EXISTS bridge_routes (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Route identifiers
  source_chain VARCHAR(50) NOT NULL,
  dest_chain VARCHAR(50) NOT NULL,
  asset VARCHAR(20) NOT NULL,

  -- Route details
  bridge_provider VARCHAR(50) NOT NULL,
  security_score DECIMAL(5, 4) NOT NULL,
  estimated_time_seconds INTEGER NOT NULL,
  cost_percent_of_amount DECIMAL(10, 6) NOT NULL,
  recommended BOOLEAN NOT NULL DEFAULT false,

  -- Capacity and limits
  min_amount DECIMAL(30, 8),
  max_amount DECIMAL(30, 8),
  daily_volume DECIMAL(30, 2),
  tvl_usd DECIMAL(30, 2),

  -- Performance metrics
  success_rate_24h DECIMAL(5, 4), -- 0.0-1.0
  average_completion_time_seconds INTEGER,
  failure_count_24h INTEGER DEFAULT 0,

  -- Route data (JSON)
  full_route_data JSONB, -- Complete route quote from Rubic

  -- Metadata
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,

  -- Indexes
  INDEX idx_route_lookup (source_chain, dest_chain, asset),
  INDEX idx_recommended (recommended, security_score DESC),
  INDEX idx_discovered_at (discovered_at DESC),
  INDEX idx_success_rate (success_rate_24h DESC)
);

-- ============================================
-- BRIDGE HEALTH SNAPSHOTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS bridge_health_snapshots (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Bridge identifiers
  bridge_name VARCHAR(100) NOT NULL,
  source_chain VARCHAR(50) NOT NULL,
  dest_chain VARCHAR(50) NOT NULL,

  -- Health metrics
  tvl_usd DECIMAL(30, 2) NOT NULL,
  tvl_24h_change_percent DECIMAL(10, 6),
  security_score DECIMAL(5, 4) NOT NULL,
  failure_rate_24h DECIMAL(5, 4) NOT NULL,
  transaction_count_24h INTEGER,
  avg_completion_time_seconds INTEGER,

  -- Security factors
  audit_score DECIMAL(5, 4),
  exploit_history_penalty DECIMAL(5, 4),
  governance_score DECIMAL(5, 4),
  uptime_score DECIMAL(5, 4),
  insurance_coverage DECIMAL(30, 2),
  bug_bounty_amount DECIMAL(30, 2),

  -- Health status
  health_status VARCHAR(20) NOT NULL, -- 'healthy', 'warning', 'critical', 'exploited'

  -- Alerts (JSON array)
  active_alerts JSONB,

  -- Metadata
  snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  INDEX idx_bridge_name (bridge_name),
  INDEX idx_chains (source_chain, dest_chain),
  INDEX idx_health_status (health_status),
  INDEX idx_snapshot_timestamp (snapshot_timestamp DESC),
  INDEX idx_security_score (security_score DESC)
);

-- ============================================
-- BRIDGE FEES HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS bridge_fees_history (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Route identifiers
  source_chain VARCHAR(50) NOT NULL,
  dest_chain VARCHAR(50) NOT NULL,
  asset VARCHAR(20) NOT NULL,
  bridge_provider VARCHAR(50) NOT NULL,

  -- Fee snapshot
  reference_amount DECIMAL(30, 8) NOT NULL, -- e.g., 10,000 USDT
  gas_fee_usd DECIMAL(30, 8) NOT NULL,
  bridge_fee_usd DECIMAL(30, 8) NOT NULL,
  protocol_fee_usd DECIMAL(30, 8) NOT NULL,
  total_fee_usd DECIMAL(30, 8) NOT NULL,
  fee_percent_of_amount DECIMAL(10, 6) NOT NULL,

  -- Market conditions
  gas_price_gwei DECIMAL(30, 8), -- For EVM chains
  source_token_price_usd DECIMAL(30, 8),
  dest_token_price_usd DECIMAL(30, 8),

  -- Metadata
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  INDEX idx_route (source_chain, dest_chain, asset, bridge_provider),
  INDEX idx_recorded_at (recorded_at DESC)
);

-- ============================================
-- VIEWS
-- ============================================

-- Active bridge transactions
CREATE OR REPLACE VIEW active_bridge_transactions AS
SELECT
  bt.id,
  bt.user_address,
  bt.source_chain,
  bt.dest_chain,
  bt.asset,
  bt.source_amount,
  bt.bridge_provider,
  bt.source_tx_hash,
  bt.transaction_status,
  bt.started_at,
  bt.estimated_arrival_time,
  EXTRACT(EPOCH FROM (NOW() - bt.started_at))::INTEGER as elapsed_seconds
FROM bridge_transactions bt
WHERE bt.transaction_status = 'pending'
ORDER BY bt.started_at DESC;

-- Bridge performance summary (per provider)
CREATE OR REPLACE VIEW bridge_provider_performance AS
SELECT
  bridge_provider,
  source_chain,
  dest_chain,
  COUNT(*) as total_transactions,
  SUM(CASE WHEN transaction_status = 'success' THEN 1 ELSE 0 END) as successful_transactions,
  SUM(CASE WHEN transaction_status = 'failed' THEN 1 ELSE 0 END) as failed_transactions,
  ROUND(AVG(CASE WHEN transaction_status = 'success' THEN actual_duration_seconds END), 2) as avg_completion_seconds,
  SUM(source_amount) as total_volume,
  SUM(total_fee_usd) as total_fees_collected,
  AVG(security_score) as avg_security_score
FROM bridge_transactions
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY bridge_provider, source_chain, dest_chain
ORDER BY successful_transactions DESC;

-- Recent bridge fee trends (24h)
CREATE OR REPLACE VIEW bridge_fee_trends_24h AS
SELECT
  source_chain,
  dest_chain,
  asset,
  bridge_provider,
  DATE_TRUNC('hour', recorded_at) as hour,
  AVG(total_fee_usd) as avg_total_fee_usd,
  AVG(fee_percent_of_amount) as avg_fee_percent,
  MIN(total_fee_usd) as min_fee_usd,
  MAX(total_fee_usd) as max_fee_usd
FROM bridge_fees_history
WHERE recorded_at > NOW() - INTERVAL '24 hours'
GROUP BY source_chain, dest_chain, asset, bridge_provider, DATE_TRUNC('hour', recorded_at)
ORDER BY hour DESC;

-- Best bridge routes (by security and cost)
CREATE OR REPLACE VIEW best_bridge_routes AS
SELECT
  source_chain,
  dest_chain,
  asset,
  bridge_provider,
  security_score,
  cost_percent_of_amount,
  estimated_time_seconds,
  success_rate_24h,
  recommended,
  last_used_at
FROM bridge_routes
WHERE success_rate_24h > 0.95 AND security_score > 0.80
ORDER BY source_chain, dest_chain, asset, security_score DESC, cost_percent_of_amount ASC;

-- Failed transactions analysis
CREATE OR REPLACE VIEW failed_bridge_transactions AS
SELECT
  bt.id,
  bt.bridge_provider,
  bt.source_chain,
  bt.dest_chain,
  bt.asset,
  bt.source_amount,
  bt.total_fee_usd,
  bt.failure_reason,
  bt.started_at,
  bt.security_score
FROM bridge_transactions bt
WHERE bt.transaction_status = 'failed'
  AND bt.started_at > NOW() - INTERVAL '7 days'
ORDER BY bt.started_at DESC;

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Find all pending transactions for a user
-- SELECT * FROM bridge_transactions WHERE user_address = '0x...' AND transaction_status = 'pending';

-- Calculate total bridged volume by asset (last 7 days)
-- SELECT asset, SUM(source_amount) as total_volume FROM bridge_transactions
-- WHERE transaction_status = 'success' AND started_at > NOW() - INTERVAL '7 days'
-- GROUP BY asset ORDER BY total_volume DESC;

-- Find cheapest bridge route for USDT (TON → Ethereum)
-- SELECT * FROM best_bridge_routes
-- WHERE source_chain = 'TON' AND dest_chain = 'Ethereum' AND asset = 'USDT'
-- ORDER BY cost_percent_of_amount ASC LIMIT 5;

-- Get current bridge health status
-- SELECT bridge_name, health_status, security_score, tvl_usd
-- FROM bridge_health_snapshots
-- WHERE snapshot_timestamp > NOW() - INTERVAL '10 minutes'
-- ORDER BY snapshot_timestamp DESC;

-- Analyze failed transactions by provider
-- SELECT bridge_provider, COUNT(*) as failure_count, failure_reason
-- FROM failed_bridge_transactions
-- GROUP BY bridge_provider, failure_reason
-- ORDER BY failure_count DESC;

-- Track bridge fees over time for specific route
-- SELECT * FROM bridge_fee_trends_24h
-- WHERE source_chain = 'TON' AND dest_chain = 'Ethereum' AND asset = 'USDT'
-- ORDER BY hour DESC LIMIT 24;
