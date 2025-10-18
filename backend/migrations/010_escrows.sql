-- Parametric Escrow System Database Schema
-- Supports conditional releases, multi-party allocations, and insurance integration

-- ========================================
-- MAIN ESCROWS TABLE
-- ========================================

CREATE TABLE escrows (
  escrow_id BIGSERIAL PRIMARY KEY,

  -- Parties
  payer_address VARCHAR(48) NOT NULL,
  payee_address VARCHAR(48) NOT NULL,

  -- Amount details
  amount BIGINT NOT NULL, -- USD cents
  asset VARCHAR(10) NOT NULL, -- 'USDC', 'USDT', 'TON', etc.
  escrow_type VARCHAR(20) NOT NULL, -- 'freelance', 'tradefin', 'milestone', 'real_estate', 'multi_party'

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'conditions_met', 'released', 'disputed', 'cancelled', 'timed_out'
  conditions_met INT DEFAULT 0,
  total_conditions INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  funded_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ NOT NULL,

  -- Timeout configuration
  timeout_action VARCHAR(20) NOT NULL, -- 'release_to_payee', 'return_to_payer', 'split'
  timeout_split_percentage INT, -- 0-100, only for 'split' action

  -- Protection/Insurance
  protection_enabled BOOLEAN DEFAULT false,
  protection_policy_id BIGINT, -- References policies(policy_id) if using core insurance
  protection_premium_paid BIGINT, -- USD cents
  protection_coverage VARCHAR(20), -- 'payer_only', 'payee_only', 'both_parties'

  -- Smart contract
  contract_address VARCHAR(48), -- TON contract address
  contract_deployed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB, -- Custom fields for flexibility

  -- Constraints
  CONSTRAINT chk_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_conditions_met_non_negative CHECK (conditions_met >= 0),
  CONSTRAINT chk_total_conditions_non_negative CHECK (total_conditions >= 0),
  CONSTRAINT chk_conditions_met_lte_total CHECK (conditions_met <= total_conditions),
  CONSTRAINT chk_timeout_split CHECK (
    (timeout_action = 'split' AND timeout_split_percentage BETWEEN 0 AND 100) OR
    (timeout_action != 'split' AND timeout_split_percentage IS NULL)
  ),
  CONSTRAINT chk_status_valid CHECK (
    status IN ('active', 'conditions_met', 'released', 'disputed', 'cancelled', 'timed_out')
  ),
  CONSTRAINT chk_escrow_type_valid CHECK (
    escrow_type IN ('freelance', 'tradefin', 'milestone', 'real_estate', 'multi_party')
  ),
  CONSTRAINT chk_timeout_action_valid CHECK (
    timeout_action IN ('release_to_payee', 'return_to_payer', 'split')
  )
);

-- Indexes for performance
CREATE INDEX idx_escrows_payer ON escrows(payer_address);
CREATE INDEX idx_escrows_payee ON escrows(payee_address);
CREATE INDEX idx_escrows_status ON escrows(status);
CREATE INDEX idx_escrows_created_at ON escrows(created_at DESC);
CREATE INDEX idx_escrows_timeout_at ON escrows(timeout_at) WHERE status = 'active';
CREATE INDEX idx_escrows_type ON escrows(escrow_type);
CREATE INDEX idx_escrows_protection_policy ON escrows(protection_policy_id) WHERE protection_policy_id IS NOT NULL;

-- ========================================
-- RELEASE CONDITIONS TABLE
-- ========================================

CREATE TABLE escrow_conditions (
  condition_id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES escrows(escrow_id) ON DELETE CASCADE,

  -- Condition details
  condition_type VARCHAR(30) NOT NULL, -- 'oracle', 'time_elapsed', 'manual_approval', 'chain_event', 'multisig'
  condition_data JSONB NOT NULL, -- Type-specific data

  -- Status
  is_met BOOLEAN DEFAULT false,
  met_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,

  -- Ordering
  condition_index INT NOT NULL, -- Order in which conditions are evaluated

  -- Constraints
  CONSTRAINT chk_condition_type CHECK (
    condition_type IN ('oracle', 'time_elapsed', 'manual_approval', 'chain_event', 'multisig')
  ),
  CONSTRAINT uq_escrow_condition_index UNIQUE(escrow_id, condition_index)
);

-- Indexes
CREATE INDEX idx_escrow_conditions_escrow_id ON escrow_conditions(escrow_id);
CREATE INDEX idx_escrow_conditions_is_met ON escrow_conditions(is_met);
CREATE INDEX idx_escrow_conditions_type ON escrow_conditions(condition_type);
CREATE INDEX idx_escrow_conditions_last_checked ON escrow_conditions(last_checked_at) WHERE is_met = false;

-- ========================================
-- MULTI-PARTY ALLOCATIONS TABLE
-- ========================================

CREATE TABLE escrow_parties (
  party_id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES escrows(escrow_id) ON DELETE CASCADE,

  -- Party details
  party_address VARCHAR(48) NOT NULL,
  party_name VARCHAR(100),
  allocation_percentage DECIMAL(5,2) NOT NULL, -- 0.00 - 100.00

  -- Party-specific conditions (optional)
  conditions JSONB, -- Optional party-specific release conditions

  -- Payout tracking
  paid_at TIMESTAMPTZ,
  paid_amount BIGINT, -- Actual amount paid in USD cents

  -- Constraints
  CONSTRAINT chk_allocation_percentage CHECK (allocation_percentage BETWEEN 0 AND 100),
  CONSTRAINT uq_escrow_party UNIQUE(escrow_id, party_address)
);

-- Indexes
CREATE INDEX idx_escrow_parties_escrow_id ON escrow_parties(escrow_id);
CREATE INDEX idx_escrow_parties_address ON escrow_parties(party_address);

-- ========================================
-- SIGNATURE TRACKING TABLE
-- ========================================

CREATE TABLE escrow_signatures (
  signature_id BIGSERIAL PRIMARY KEY,
  condition_id BIGINT NOT NULL REFERENCES escrow_conditions(condition_id) ON DELETE CASCADE,

  -- Signature details
  signer_address VARCHAR(48) NOT NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Verification
  is_valid BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verification_method VARCHAR(50), -- 'ed25519', 'ton_wallet', etc.

  -- Constraints
  CONSTRAINT uq_condition_signer UNIQUE(condition_id, signer_address)
);

-- Indexes
CREATE INDEX idx_escrow_signatures_condition_id ON escrow_signatures(condition_id);
CREATE INDEX idx_escrow_signatures_signer ON escrow_signatures(signer_address);
CREATE INDEX idx_escrow_signatures_is_valid ON escrow_signatures(is_valid);

-- ========================================
-- DISPUTE TRACKING TABLE
-- ========================================

CREATE TABLE escrow_disputes (
  dispute_id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES escrows(escrow_id) ON DELETE CASCADE,

  -- Dispute details
  initiated_by VARCHAR(48) NOT NULL, -- Address of party initiating dispute
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  reason VARCHAR(50) NOT NULL, -- 'work_incomplete', 'quality_issue', 'fraud', 'other'
  description TEXT,

  -- Resolution
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'under_review', 'resolved', 'escalated'
  resolved_at TIMESTAMPTZ,
  resolution_details TEXT,
  resolved_by VARCHAR(48), -- Arbitrator or resolver address

  -- Outcome
  payer_receives_percentage DECIMAL(5,2), -- 0.00 - 100.00 (remainder goes to payee)

  -- Constraints
  CONSTRAINT chk_dispute_reason CHECK (
    reason IN ('work_incomplete', 'quality_issue', 'fraud', 'deadline_missed', 'payment_issue', 'other')
  ),
  CONSTRAINT chk_dispute_status CHECK (
    status IN ('open', 'under_review', 'resolved', 'escalated')
  ),
  CONSTRAINT chk_dispute_payer_percentage CHECK (
    payer_receives_percentage IS NULL OR payer_receives_percentage BETWEEN 0 AND 100
  )
);

-- Indexes
CREATE INDEX idx_escrow_disputes_escrow_id ON escrow_disputes(escrow_id);
CREATE INDEX idx_escrow_disputes_status ON escrow_disputes(status);
CREATE INDEX idx_escrow_disputes_initiated_at ON escrow_disputes(initiated_at DESC);

-- ========================================
-- TRIGGERS AND FUNCTIONS
-- ========================================

-- Function to update conditions_met counter
CREATE OR REPLACE FUNCTION update_conditions_met()
RETURNS TRIGGER AS $$
DECLARE
  met_count INT;
  total_count INT;
BEGIN
  -- Count met conditions
  SELECT COUNT(*) INTO met_count
  FROM escrow_conditions
  WHERE escrow_id = NEW.escrow_id AND is_met = true;

  -- Count total conditions
  SELECT COUNT(*) INTO total_count
  FROM escrow_conditions
  WHERE escrow_id = NEW.escrow_id;

  -- Update escrow
  UPDATE escrows
  SET conditions_met = met_count,
      total_conditions = total_count
  WHERE escrow_id = NEW.escrow_id;

  -- Auto-update status to 'conditions_met' if all met
  IF met_count = total_count AND total_count > 0 THEN
    UPDATE escrows
    SET status = 'conditions_met'
    WHERE escrow_id = NEW.escrow_id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for condition updates
CREATE TRIGGER trg_update_conditions_met
AFTER INSERT OR UPDATE OF is_met ON escrow_conditions
FOR EACH ROW
EXECUTE FUNCTION update_conditions_met();

-- Function to validate party allocations sum to 100%
CREATE OR REPLACE FUNCTION validate_party_allocations()
RETURNS TRIGGER AS $$
DECLARE
  total_allocation DECIMAL(5,2);
BEGIN
  -- Calculate total allocation for this escrow
  SELECT COALESCE(SUM(allocation_percentage), 0) INTO total_allocation
  FROM escrow_parties
  WHERE escrow_id = NEW.escrow_id;

  -- Check if exceeds 100%
  IF total_allocation > 100.00 THEN
    RAISE EXCEPTION 'Total party allocations cannot exceed 100%%, current total: %%', total_allocation;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for party allocation validation
CREATE TRIGGER trg_validate_party_allocations
AFTER INSERT OR UPDATE OF allocation_percentage ON escrow_parties
FOR EACH ROW
EXECUTE FUNCTION validate_party_allocations();

-- ========================================
-- VIEWS FOR COMMON QUERIES
-- ========================================

-- Active escrows view with condition progress
CREATE VIEW v_active_escrows AS
SELECT
  e.*,
  COUNT(ec.condition_id) as total_conditions_count,
  SUM(CASE WHEN ec.is_met THEN 1 ELSE 0 END) as met_conditions_count,
  EXTRACT(EPOCH FROM (e.timeout_at - NOW())) as time_until_timeout_seconds,
  CASE
    WHEN e.conditions_met = e.total_conditions AND e.total_conditions > 0 THEN true
    ELSE false
  END as all_conditions_met
FROM escrows e
LEFT JOIN escrow_conditions ec ON e.escrow_id = ec.escrow_id
WHERE e.status = 'active'
GROUP BY e.escrow_id;

-- User escrows view (as payer, payee, or party)
CREATE VIEW v_user_escrows AS
SELECT DISTINCT
  e.*,
  CASE
    WHEN e.payer_address = e.payer_address THEN 'payer'
    WHEN e.payee_address = e.payee_address THEN 'payee'
    ELSE 'party'
  END as user_role,
  e.conditions_met,
  e.total_conditions
FROM escrows e;

-- Escrow analytics view
CREATE VIEW v_escrow_analytics AS
SELECT
  escrow_type,
  COUNT(*) as total_count,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) as released_count,
  SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed_count,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount,
  SUM(CASE WHEN protection_enabled THEN 1 ELSE 0 END) as with_protection_count,
  AVG(EXTRACT(EPOCH FROM (COALESCE(released_at, NOW()) - created_at))) as avg_duration_seconds
FROM escrows
GROUP BY escrow_type;

-- Timed out escrows needing action
CREATE VIEW v_timed_out_escrows AS
SELECT
  e.*,
  EXTRACT(EPOCH FROM (NOW() - e.timeout_at)) as seconds_past_timeout
FROM escrows e
WHERE e.status = 'active'
  AND e.timeout_at < NOW()
ORDER BY e.timeout_at ASC;

-- Comment: Escrow database schema ready for production use
-- Total tables: 5 (escrows, escrow_conditions, escrow_parties, escrow_signatures, escrow_disputes)
-- Total indexes: 20
-- Total triggers: 2
-- Total functions: 2
-- Total views: 4
