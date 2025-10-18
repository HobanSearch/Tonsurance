-- Escrow Insurance Integration Migration
-- Adds insurance tracking and event logging for escrow protection policies

-- ========================================
-- ESCROW INSURANCE EVENTS LOG
-- ========================================

-- Track insurance events (policy creation, claims, payouts)
CREATE TABLE escrow_insurance_events (
  event_id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES escrows(escrow_id) ON DELETE CASCADE,
  policy_id BIGINT, -- May be NULL before policy created

  -- Event details
  event_type VARCHAR(30) NOT NULL, -- 'policy_created', 'claim_triggered', 'claim_paid', 'policy_cancelled'
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Event-specific data
  event_data JSONB NOT NULL, -- Flexible storage for event details

  -- Actors
  triggered_by VARCHAR(48), -- Address that triggered the event
  affected_party VARCHAR(48), -- Address affected by the event

  -- Financial details
  amount BIGINT, -- Amount in USD cents (premium, payout, etc.)
  transaction_hash VARCHAR(64), -- On-chain transaction hash if applicable

  -- Metadata
  notes TEXT,

  -- Constraints
  CONSTRAINT chk_event_type CHECK (
    event_type IN (
      'policy_created',
      'policy_linked',
      'claim_triggered',
      'claim_approved',
      'claim_paid',
      'claim_denied',
      'policy_cancelled',
      'policy_expired'
    )
  )
);

-- Indexes for insurance events
CREATE INDEX idx_escrow_insurance_events_escrow ON escrow_insurance_events(escrow_id);
CREATE INDEX idx_escrow_insurance_events_policy ON escrow_insurance_events(policy_id) WHERE policy_id IS NOT NULL;
CREATE INDEX idx_escrow_insurance_events_type ON escrow_insurance_events(event_type);
CREATE INDEX idx_escrow_insurance_events_timestamp ON escrow_insurance_events(event_timestamp DESC);
CREATE INDEX idx_escrow_insurance_events_triggered_by ON escrow_insurance_events(triggered_by) WHERE triggered_by IS NOT NULL;

-- ========================================
-- UPDATE EXISTING ESCROWS TABLE
-- ========================================

-- Ensure protection columns exist (may already be there from 010_escrows.sql)
DO $$
BEGIN
  -- Add protection_enabled if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'escrows' AND column_name = 'protection_enabled'
  ) THEN
    ALTER TABLE escrows ADD COLUMN protection_enabled BOOLEAN DEFAULT false;
  END IF;

  -- Add protection_policy_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'escrows' AND column_name = 'protection_policy_id'
  ) THEN
    ALTER TABLE escrows ADD COLUMN protection_policy_id BIGINT;
  END IF;

  -- Add protection_premium_paid if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'escrows' AND column_name = 'protection_premium_paid'
  ) THEN
    ALTER TABLE escrows ADD COLUMN protection_premium_paid BIGINT;
  END IF;

  -- Add protection_coverage if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'escrows' AND column_name = 'protection_coverage'
  ) THEN
    ALTER TABLE escrows ADD COLUMN protection_coverage VARCHAR(20);
  END IF;
END $$;

-- Add check constraint for protection_coverage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_protection_coverage'
  ) THEN
    ALTER TABLE escrows ADD CONSTRAINT chk_protection_coverage CHECK (
      protection_coverage IS NULL OR
      protection_coverage IN ('payer_only', 'payee_only', 'both_parties')
    );
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN escrows.protection_enabled IS 'Whether escrow has insurance protection';
COMMENT ON COLUMN escrows.protection_policy_id IS 'Link to policies table';
COMMENT ON COLUMN escrows.protection_premium_paid IS 'Premium paid in USD cents';
COMMENT ON COLUMN escrows.protection_coverage IS 'Who is protected: payer_only, payee_only, or both_parties';

-- ========================================
-- VIEWS FOR ANALYTICS
-- ========================================

-- Protected escrows view
CREATE VIEW v_protected_escrows AS
SELECT
  e.*,
  e.protection_premium_paid,
  e.protection_coverage,
  COUNT(eie.event_id) as insurance_event_count,
  MAX(eie.event_timestamp) as last_insurance_event
FROM escrows e
LEFT JOIN escrow_insurance_events eie ON e.escrow_id = eie.escrow_id
WHERE e.protection_enabled = true
GROUP BY e.escrow_id;

-- Insurance statistics view
CREATE VIEW v_escrow_insurance_stats AS
SELECT
  COUNT(DISTINCT e.escrow_id) as total_protected_escrows,
  SUM(e.protection_premium_paid) as total_premiums_collected,
  COUNT(DISTINCT CASE WHEN eie.event_type = 'claim_triggered' THEN e.escrow_id END) as total_claims_filed,
  SUM(CASE WHEN eie.event_type = 'claim_paid' THEN eie.amount END) as total_claims_paid,
  AVG(e.protection_premium_paid) as avg_premium_per_escrow,

  -- Coverage type distribution
  COUNT(CASE WHEN e.protection_coverage = 'payer_only' THEN 1 END) as payer_only_count,
  COUNT(CASE WHEN e.protection_coverage = 'payee_only' THEN 1 END) as payee_only_count,
  COUNT(CASE WHEN e.protection_coverage = 'both_parties' THEN 1 END) as both_parties_count,

  -- Loss ratio (claims paid / premiums collected)
  CASE
    WHEN SUM(e.protection_premium_paid) > 0 THEN
      COALESCE(SUM(CASE WHEN eie.event_type = 'claim_paid' THEN eie.amount END), 0)::FLOAT /
      SUM(e.protection_premium_paid)::FLOAT
    ELSE 0
  END as loss_ratio

FROM escrows e
LEFT JOIN escrow_insurance_events eie ON e.escrow_id = eie.escrow_id
WHERE e.protection_enabled = true;

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to log insurance event
CREATE OR REPLACE FUNCTION log_escrow_insurance_event(
  p_escrow_id BIGINT,
  p_policy_id BIGINT,
  p_event_type VARCHAR,
  p_event_data JSONB,
  p_triggered_by VARCHAR DEFAULT NULL,
  p_affected_party VARCHAR DEFAULT NULL,
  p_amount BIGINT DEFAULT NULL,
  p_tx_hash VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  INSERT INTO escrow_insurance_events (
    escrow_id,
    policy_id,
    event_type,
    event_data,
    triggered_by,
    affected_party,
    amount,
    transaction_hash,
    notes
  ) VALUES (
    p_escrow_id,
    p_policy_id,
    p_event_type,
    p_event_data,
    p_triggered_by,
    p_affected_party,
    p_amount,
    p_tx_hash,
    p_notes
  ) RETURNING event_id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get escrow insurance summary
CREATE OR REPLACE FUNCTION get_escrow_insurance_summary(p_escrow_id BIGINT)
RETURNS TABLE (
  escrow_id BIGINT,
  protection_enabled BOOLEAN,
  policy_id BIGINT,
  premium_paid BIGINT,
  coverage_type VARCHAR,
  events_count BIGINT,
  has_claim BOOLEAN,
  claim_status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.escrow_id,
    e.protection_enabled,
    e.protection_policy_id,
    e.protection_premium_paid,
    e.protection_coverage,
    COUNT(eie.event_id) as events_count,
    EXISTS(
      SELECT 1 FROM escrow_insurance_events
      WHERE escrow_id = p_escrow_id
      AND event_type = 'claim_triggered'
    ) as has_claim,
    COALESCE(
      (SELECT event_type FROM escrow_insurance_events
       WHERE escrow_id = p_escrow_id
       AND event_type IN ('claim_approved', 'claim_paid', 'claim_denied')
       ORDER BY event_timestamp DESC
       LIMIT 1),
      'no_claim'
    )::VARCHAR as claim_status
  FROM escrows e
  LEFT JOIN escrow_insurance_events eie ON e.escrow_id = eie.escrow_id
  WHERE e.escrow_id = p_escrow_id
  GROUP BY e.escrow_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- SAMPLE DATA (for testing)
-- ========================================

-- Sample protected escrow with insurance event
DO $$
DECLARE
  v_escrow_id BIGINT;
BEGIN
  -- This is just example data, comment out in production
  -- INSERT INTO escrows (
  --   payer_address, payee_address, amount, asset, escrow_type,
  --   status, timeout_at, timeout_action, protection_enabled,
  --   protection_coverage, protection_premium_paid, protection_policy_id
  -- ) VALUES (
  --   'UQABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr',
  --   'UQXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN',
  --   100000_00, -- $100,000
  --   'USDC',
  --   'freelance',
  --   'active',
  --   NOW() + INTERVAL '30 days',
  --   'release_to_payee',
  --   true,
  --   'payee_only',
  --   80_00, -- $80 premium
  --   123456789
  -- ) RETURNING escrow_id INTO v_escrow_id;

  -- Log policy creation event
  -- PERFORM log_escrow_insurance_event(
  --   v_escrow_id,
  --   123456789,
  --   'policy_created',
  --   '{"premium_breakdown": {"base": 100, "discount": 20, "final": 80}}'::JSONB,
  --   'UQABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr',
  --   'UQXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN',
  --   80_00,
  --   NULL,
  --   'Automatic policy creation on escrow funding'
  -- );
END $$;

-- Migration complete
COMMENT ON TABLE escrow_insurance_events IS 'Tracks all insurance-related events for escrows';
COMMENT ON VIEW v_protected_escrows IS 'Escrows with insurance protection enabled';
COMMENT ON VIEW v_escrow_insurance_stats IS 'Aggregate statistics for escrow insurance program';
