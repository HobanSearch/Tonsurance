-- Blockchain Event Log Migration
-- Creates audit trail for all blockchain events

-- Create blockchain events table
CREATE TABLE IF NOT EXISTS blockchain_events (
  event_id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL, -- 'policy_created', 'payout_executed', 'deposit_made', etc.
  policy_id BIGINT, -- NULL for non-policy events
  contract_address VARCHAR(100),
  transaction_hash VARCHAR(100),
  logical_time BIGINT, -- TON logical time
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_blockchain_events_type
  ON blockchain_events(event_type);

CREATE INDEX IF NOT EXISTS idx_blockchain_events_policy
  ON blockchain_events(policy_id)
  WHERE policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blockchain_events_created
  ON blockchain_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blockchain_events_tx_hash
  ON blockchain_events(transaction_hash)
  WHERE transaction_hash IS NOT NULL;

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_blockchain_events_metadata
  ON blockchain_events USING GIN (metadata);

-- Create sync state table to track event subscription cursors
CREATE TABLE IF NOT EXISTS blockchain_sync_state (
  contract_address VARCHAR(100) PRIMARY KEY,
  contract_type VARCHAR(50) NOT NULL, -- 'PolicyFactory', 'MultiTrancheVault', etc.
  last_synced_lt BIGINT NOT NULL DEFAULT 0, -- Last logical time synced
  last_sync_timestamp TIMESTAMP DEFAULT NOW(),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'error'
  error_message TEXT,
  total_events_synced BIGINT NOT NULL DEFAULT 0
);

-- Index for active sync states
CREATE INDEX IF NOT EXISTS idx_blockchain_sync_active
  ON blockchain_sync_state(sync_status)
  WHERE sync_status = 'active';

-- Create view for recent events
CREATE OR REPLACE VIEW v_recent_blockchain_events AS
SELECT
  e.event_id,
  e.event_type,
  e.policy_id,
  e.contract_address,
  e.transaction_hash,
  e.metadata,
  e.created_at,
  p.buyer_address,
  p.coverage_amount,
  p.premium_amount_cents,
  p.asset
FROM blockchain_events e
LEFT JOIN policies p ON e.policy_id = p.policy_id
WHERE e.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY e.created_at DESC;

-- Function to update sync state
CREATE OR REPLACE FUNCTION update_sync_state(
  p_contract_address VARCHAR(100),
  p_last_lt BIGINT,
  p_events_count BIGINT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO blockchain_sync_state (
    contract_address,
    contract_type,
    last_synced_lt,
    last_sync_timestamp,
    total_events_synced
  ) VALUES (
    p_contract_address,
    'Unknown', -- Will be updated by application
    p_last_lt,
    NOW(),
    p_events_count
  )
  ON CONFLICT (contract_address) DO UPDATE SET
    last_synced_lt = EXCLUDED.last_synced_lt,
    last_sync_timestamp = NOW(),
    total_events_synced = blockchain_sync_state.total_events_synced + p_events_count,
    sync_status = 'active',
    error_message = NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to record sync error
CREATE OR REPLACE FUNCTION record_sync_error(
  p_contract_address VARCHAR(100),
  p_error_message TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE blockchain_sync_state
  SET
    sync_status = 'error',
    error_message = p_error_message,
    last_sync_timestamp = NOW()
  WHERE contract_address = p_contract_address;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for event statistics by product
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_event_stats_by_product AS
SELECT
  (e.metadata->>'coverage_type')::INT as coverage_type,
  (e.metadata->>'chain_id')::INT as chain_id,
  (e.metadata->>'stablecoin_id')::INT as stablecoin_id,
  ct.type_name,
  crm.chain_name,
  sc.coin_symbol,
  COUNT(*) FILTER (WHERE e.event_type = 'policy_created') as policies_created,
  COUNT(*) FILTER (WHERE e.event_type = 'payout_executed') as payouts_executed,
  SUM((e.metadata->>'coverage_amount')::BIGINT) FILTER (WHERE e.event_type = 'policy_created') as total_coverage,
  SUM((e.metadata->>'premium')::BIGINT) FILTER (WHERE e.event_type = 'policy_created') as total_premiums,
  SUM((e.metadata->>'amount')::BIGINT) FILTER (WHERE e.event_type = 'payout_executed') as total_payouts,
  MIN(e.created_at) as first_event,
  MAX(e.created_at) as last_event
FROM blockchain_events e
LEFT JOIN coverage_types ct ON (e.metadata->>'coverage_type')::INT = ct.type_id
LEFT JOIN chain_risk_metrics crm ON (e.metadata->>'chain_id')::INT = crm.chain_id
LEFT JOIN stablecoins sc ON (e.metadata->>'stablecoin_id')::INT = sc.coin_id
WHERE e.event_type IN ('policy_created', 'payout_executed')
  AND e.metadata ? 'coverage_type'
  AND e.metadata ? 'chain_id'
  AND e.metadata ? 'stablecoin_id'
GROUP BY
  (e.metadata->>'coverage_type')::INT,
  (e.metadata->>'chain_id')::INT,
  (e.metadata->>'stablecoin_id')::INT,
  ct.type_name,
  crm.chain_name,
  sc.coin_symbol;

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_event_stats_product
  ON mv_event_stats_by_product(coverage_type, chain_id, stablecoin_id);

-- Function to refresh event stats
CREATE OR REPLACE FUNCTION refresh_event_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_event_stats_by_product;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to alert on high-value events
CREATE OR REPLACE FUNCTION trigger_high_value_event_alert()
RETURNS TRIGGER AS $$
BEGIN
  -- Alert if policy > $100,000 or payout > $50,000
  IF NEW.event_type = 'policy_created' AND (NEW.metadata->>'coverage_amount')::BIGINT > 10000000000 THEN
    -- Would send alert to monitoring system
    -- For now, just log
    RAISE NOTICE 'HIGH VALUE POLICY: % with coverage %',
      NEW.policy_id,
      (NEW.metadata->>'coverage_amount')::BIGINT;
  END IF;

  IF NEW.event_type = 'payout_executed' AND (NEW.metadata->>'amount')::BIGINT > 5000000000 THEN
    RAISE NOTICE 'HIGH VALUE PAYOUT: % with amount %',
      NEW.policy_id,
      (NEW.metadata->>'amount')::BIGINT;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_high_value_event_alert ON blockchain_events;
CREATE TRIGGER trg_high_value_event_alert
AFTER INSERT ON blockchain_events
FOR EACH ROW
EXECUTE FUNCTION trigger_high_value_event_alert();

-- Comments for documentation
COMMENT ON TABLE blockchain_events IS 'Audit log of all blockchain events from TON contracts';
COMMENT ON TABLE blockchain_sync_state IS 'Tracks synchronization state for each monitored contract';
COMMENT ON VIEW v_recent_blockchain_events IS 'Recent events (last 24 hours) with policy details';
COMMENT ON MATERIALIZED VIEW mv_event_stats_by_product IS 'Aggregated event statistics by product combination';
