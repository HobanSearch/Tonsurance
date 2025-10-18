-- ========================================
-- DISPUTE RESOLUTION SYSTEM
-- ========================================
-- Comprehensive dispute resolution with arbiter registry,
-- evidence submission, reputation tracking, and slashing

-- ========================================
-- ARBITERS REGISTRY
-- ========================================

CREATE TABLE arbiters (
  arbiter_address VARCHAR(48) PRIMARY KEY,

  -- Stake requirement
  staked_amount BIGINT NOT NULL, -- USD cents

  -- Reputation metrics
  reputation_score DECIMAL(3,2) NOT NULL DEFAULT 0.80, -- 0.00 - 1.00
  disputes_resolved INT NOT NULL DEFAULT 0,
  successful_resolutions INT NOT NULL DEFAULT 0, -- Both parties satisfied
  average_resolution_time BIGINT, -- Seconds

  -- Specializations (stored as array)
  specializations TEXT[] NOT NULL,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_stake_minimum CHECK (staked_amount >= 1000000), -- $10,000 minimum
  CONSTRAINT chk_reputation_range CHECK (reputation_score BETWEEN 0 AND 1),
  CONSTRAINT chk_successful_lte_total CHECK (successful_resolutions <= disputes_resolved),
  CONSTRAINT chk_specializations_not_empty CHECK (array_length(specializations, 1) > 0)
);

-- Indexes for arbiter queries
CREATE INDEX idx_arbiters_active ON arbiters(is_active, reputation_score DESC) WHERE is_active = true;
CREATE INDEX idx_arbiters_reputation ON arbiters(reputation_score DESC);
CREATE INDEX idx_arbiters_specializations ON arbiters USING GIN(specializations);
CREATE INDEX idx_arbiters_registered ON arbiters(registered_at DESC);

-- ========================================
-- DISPUTES TABLE (Enhanced)
-- ========================================

CREATE TABLE disputes (
  dispute_id BIGSERIAL PRIMARY KEY,
  escrow_id BIGINT NOT NULL,

  -- Initiation
  initiated_by VARCHAR(48) NOT NULL, -- payer or payee address
  reason_type VARCHAR(50) NOT NULL, -- 'work_not_completed', 'quality_issue', 'payment_dispute', etc.
  reason_data JSONB NOT NULL, -- Type-specific structured data

  -- Arbiter assignment
  assigned_arbiter VARCHAR(48),

  -- Dispute lifecycle
  status VARCHAR(30) NOT NULL DEFAULT 'evidence_collection', -- 'evidence_collection', 'under_review', 'resolved', 'appealed', 'closed'

  -- Resolution
  resolution_type VARCHAR(30), -- 'full_release', 'full_refund', 'partial_split', 'extended_deadline', 'require_arbitration'
  resolution_data JSONB, -- Type-specific resolution data (e.g., split percentages)
  resolution_reasoning TEXT, -- Arbiter's explanation

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  appeal_deadline TIMESTAMPTZ, -- 24h after resolution

  -- Constraints
  CONSTRAINT fk_escrow FOREIGN KEY (escrow_id) REFERENCES escrows(escrow_id) ON DELETE CASCADE,
  CONSTRAINT fk_arbiter FOREIGN KEY (assigned_arbiter) REFERENCES arbiters(arbiter_address),
  CONSTRAINT chk_status_valid CHECK (
    status IN ('evidence_collection', 'under_review', 'resolved', 'appealed', 'closed')
  ),
  CONSTRAINT chk_reason_type_valid CHECK (
    reason_type IN ('work_not_completed', 'work_quality_issue', 'payment_dispute',
                    'timeline_violation', 'fraud_suspicion', 'other')
  ),
  CONSTRAINT chk_resolution_type_valid CHECK (
    resolution_type IS NULL OR
    resolution_type IN ('full_release', 'full_refund', 'partial_split', 'extended_deadline', 'require_arbitration')
  ),
  CONSTRAINT chk_resolved_state CHECK (
    (status IN ('resolved', 'closed') AND resolved_at IS NOT NULL) OR
    (status NOT IN ('resolved', 'closed') AND resolved_at IS NULL)
  )
);

-- Indexes for dispute queries
CREATE INDEX idx_disputes_escrow ON disputes(escrow_id);
CREATE INDEX idx_disputes_arbiter ON disputes(assigned_arbiter) WHERE assigned_arbiter IS NOT NULL;
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_created ON disputes(created_at DESC);
CREATE INDEX idx_disputes_appeal_deadline ON disputes(appeal_deadline) WHERE status = 'resolved';

-- ========================================
-- DISPUTE EVIDENCE TABLE
-- ========================================

CREATE TABLE dispute_evidence (
  evidence_id BIGSERIAL PRIMARY KEY,
  dispute_id BIGINT NOT NULL,

  -- Submitter
  submitted_by VARCHAR(48) NOT NULL, -- payer or payee address

  -- Evidence details
  evidence_type VARCHAR(30) NOT NULL, -- 'document', 'image', 'video', 'screen_recording', etc.
  content_url TEXT NOT NULL, -- IPFS/Arweave URL
  content_hash VARCHAR(128), -- SHA-256 hash for verification
  description TEXT NOT NULL,

  -- Timestamp
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_dispute FOREIGN KEY (dispute_id) REFERENCES disputes(dispute_id) ON DELETE CASCADE,
  CONSTRAINT chk_evidence_type_valid CHECK (
    evidence_type IN ('document', 'image', 'video', 'screen_recording',
                     'github_commit', 'chat_log', 'contract_agreement', 'other')
  )
);

-- Indexes for evidence queries
CREATE INDEX idx_evidence_dispute ON dispute_evidence(dispute_id);
CREATE INDEX idx_evidence_submitted_by ON dispute_evidence(submitted_by);
CREATE INDEX idx_evidence_submitted_at ON dispute_evidence(submitted_at DESC);

-- ========================================
-- ARBITER SLASHING EVENTS
-- ========================================

CREATE TABLE arbiter_slashing_events (
  slashing_id BIGSERIAL PRIMARY KEY,
  arbiter_address VARCHAR(48) NOT NULL,

  -- Slashing details
  reason VARCHAR(50) NOT NULL, -- 'biased_decision', 'missed_deadline', 'poor_reasoning', 'ethics_violation'
  slashed_amount BIGINT NOT NULL, -- USD cents

  -- Related dispute (if applicable)
  related_dispute_id BIGINT,

  -- Execution
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_by VARCHAR(48), -- Admin or governance address

  -- Constraints
  CONSTRAINT fk_arbiter_slash FOREIGN KEY (arbiter_address) REFERENCES arbiters(arbiter_address),
  CONSTRAINT fk_dispute_slash FOREIGN KEY (related_dispute_id) REFERENCES disputes(dispute_id),
  CONSTRAINT chk_slashing_reason CHECK (
    reason IN ('biased_decision', 'missed_deadline', 'poor_reasoning',
               'ethics_violation', 'inactive_status')
  ),
  CONSTRAINT chk_slashed_amount_positive CHECK (slashed_amount > 0)
);

-- Indexes for slashing events
CREATE INDEX idx_slashing_arbiter ON arbiter_slashing_events(arbiter_address);
CREATE INDEX idx_slashing_executed ON arbiter_slashing_events(executed_at DESC);

-- ========================================
-- ARBITER REWARDS TABLE
-- ========================================

CREATE TABLE arbiter_rewards (
  reward_id BIGSERIAL PRIMARY KEY,
  arbiter_address VARCHAR(48) NOT NULL,
  dispute_id BIGINT NOT NULL,

  -- Reward breakdown
  base_fee BIGINT NOT NULL, -- 1% of escrow amount
  speed_bonus BIGINT DEFAULT 0, -- 50% bonus if <24h
  complexity_bonus BIGINT DEFAULT 0, -- 10-20% for complex disputes
  satisfaction_bonus BIGINT DEFAULT 0, -- 10% if both parties satisfied
  total_reward BIGINT NOT NULL,

  -- Resolution metrics
  resolution_time_seconds BIGINT NOT NULL,
  evidence_count INT NOT NULL,
  both_parties_satisfied BOOLEAN DEFAULT false,

  -- Payment
  paid_at TIMESTAMPTZ,
  payment_tx_hash VARCHAR(100),

  -- Timestamps
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_arbiter_reward FOREIGN KEY (arbiter_address) REFERENCES arbiters(arbiter_address),
  CONSTRAINT fk_dispute_reward FOREIGN KEY (dispute_id) REFERENCES disputes(dispute_id),
  CONSTRAINT chk_total_reward CHECK (total_reward = base_fee + speed_bonus + complexity_bonus + satisfaction_bonus),
  CONSTRAINT chk_resolution_time_positive CHECK (resolution_time_seconds > 0),
  CONSTRAINT uq_dispute_reward UNIQUE(dispute_id) -- One reward per dispute
);

-- Indexes for reward queries
CREATE INDEX idx_rewards_arbiter ON arbiter_rewards(arbiter_address);
CREATE INDEX idx_rewards_dispute ON arbiter_rewards(dispute_id);
CREATE INDEX idx_rewards_earned ON arbiter_rewards(earned_at DESC);
CREATE INDEX idx_rewards_unpaid ON arbiter_rewards(paid_at) WHERE paid_at IS NULL;

-- ========================================
-- TRIGGERS AND FUNCTIONS
-- ========================================

-- Function: Update escrow status when dispute is initiated
CREATE OR REPLACE FUNCTION update_escrow_on_dispute()
RETURNS TRIGGER AS $$
BEGIN
  -- Set escrow to disputed status
  UPDATE escrows
  SET status = 'disputed'
  WHERE escrow_id = NEW.escrow_id
    AND status = 'active';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update escrow status on dispute creation
CREATE TRIGGER trg_update_escrow_on_dispute
AFTER INSERT ON disputes
FOR EACH ROW
EXECUTE FUNCTION update_escrow_on_dispute();

-- Function: Update arbiter reputation after resolution
CREATE OR REPLACE FUNCTION update_arbiter_reputation()
RETURNS TRIGGER AS $$
DECLARE
  success_rate DECIMAL(3,2);
  speed_factor DECIMAL(3,2);
  volume_factor DECIMAL(3,2);
  new_reputation DECIMAL(3,2);
  resolution_time BIGINT;
  is_successful BOOLEAN;
BEGIN
  -- Only proceed if status changed to 'resolved' or 'closed'
  IF NEW.status NOT IN ('resolved', 'closed') OR NEW.assigned_arbiter IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get resolution metrics from arbiter_rewards (if exists)
  SELECT
    both_parties_satisfied,
    resolution_time_seconds
  INTO is_successful, resolution_time
  FROM arbiter_rewards
  WHERE dispute_id = NEW.dispute_id;

  -- Update arbiter statistics
  UPDATE arbiters
  SET
    disputes_resolved = disputes_resolved + 1,
    successful_resolutions = CASE
      WHEN COALESCE(is_successful, false) THEN successful_resolutions + 1
      ELSE successful_resolutions
    END,
    average_resolution_time = CASE
      WHEN disputes_resolved = 0 THEN resolution_time
      ELSE ((average_resolution_time * disputes_resolved + COALESCE(resolution_time, 0)) / (disputes_resolved + 1))
    END
  WHERE arbiter_address = NEW.assigned_arbiter;

  -- Recalculate reputation score
  SELECT
    (CASE
      WHEN a.disputes_resolved > 0
      THEN (a.successful_resolutions::DECIMAL / a.disputes_resolved::DECIMAL) * 0.7
      ELSE 0.56 -- 0.8 * 0.7
    END) +
    (LEAST(1.0, a.disputes_resolved::DECIMAL / 100.0) * 0.2) +
    (CASE
      WHEN a.average_resolution_time < 86400 THEN 0.1
      ELSE 0.0
    END) INTO new_reputation
  FROM arbiters a
  WHERE a.arbiter_address = NEW.assigned_arbiter;

  -- Update reputation (clamped to 0.30 - 1.00)
  UPDATE arbiters
  SET reputation_score = GREATEST(0.30, LEAST(1.00, new_reputation))
  WHERE arbiter_address = NEW.assigned_arbiter;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update arbiter reputation on dispute resolution
CREATE TRIGGER trg_update_arbiter_reputation
AFTER UPDATE OF status ON disputes
FOR EACH ROW
WHEN (NEW.status IN ('resolved', 'closed'))
EXECUTE FUNCTION update_arbiter_reputation();

-- Function: Validate arbiter eligibility
CREATE OR REPLACE FUNCTION validate_arbiter_eligibility()
RETURNS TRIGGER AS $$
DECLARE
  arbiter_rec RECORD;
BEGIN
  -- Get arbiter record
  SELECT * INTO arbiter_rec
  FROM arbiters
  WHERE arbiter_address = NEW.assigned_arbiter;

  -- Check if arbiter exists and is active
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arbiter % not found in registry', NEW.assigned_arbiter;
  END IF;

  IF NOT arbiter_rec.is_active THEN
    RAISE EXCEPTION 'Arbiter % is not active', NEW.assigned_arbiter;
  END IF;

  -- Check minimum stake
  IF arbiter_rec.staked_amount < 1000000 THEN
    RAISE EXCEPTION 'Arbiter % has insufficient stake (minimum $10,000)', NEW.assigned_arbiter;
  END IF;

  -- Check minimum reputation
  IF arbiter_rec.reputation_score < 0.70 THEN
    RAISE EXCEPTION 'Arbiter % has insufficient reputation (minimum 0.70)', NEW.assigned_arbiter;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Validate arbiter before assignment
CREATE TRIGGER trg_validate_arbiter_eligibility
BEFORE UPDATE OF assigned_arbiter ON disputes
FOR EACH ROW
WHEN (NEW.assigned_arbiter IS NOT NULL AND OLD.assigned_arbiter IS NULL)
EXECUTE FUNCTION validate_arbiter_eligibility();

-- ========================================
-- VIEWS FOR ANALYTICS
-- ========================================

-- View: Active disputes requiring attention
CREATE VIEW v_active_disputes AS
SELECT
  d.*,
  e.escrow_type,
  e.amount as escrow_amount,
  e.payer_address,
  e.payee_address,
  COUNT(de.evidence_id) as evidence_count,
  EXTRACT(EPOCH FROM (NOW() - d.created_at)) as dispute_age_seconds,
  a.reputation_score as arbiter_reputation,
  a.average_resolution_time as arbiter_avg_time
FROM disputes d
JOIN escrows e ON d.escrow_id = e.escrow_id
LEFT JOIN dispute_evidence de ON d.dispute_id = de.dispute_id
LEFT JOIN arbiters a ON d.assigned_arbiter = a.arbiter_address
WHERE d.status IN ('evidence_collection', 'under_review')
GROUP BY d.dispute_id, e.escrow_id, a.arbiter_address;

-- View: Arbiter leaderboard
CREATE VIEW v_arbiter_leaderboard AS
SELECT
  a.arbiter_address,
  a.reputation_score,
  a.disputes_resolved,
  a.successful_resolutions,
  CASE
    WHEN a.disputes_resolved > 0
    THEN (a.successful_resolutions::DECIMAL / a.disputes_resolved::DECIMAL * 100)::DECIMAL(5,2)
    ELSE 0.00
  END as success_rate_pct,
  a.average_resolution_time,
  a.staked_amount,
  COALESCE(SUM(ar.total_reward), 0) as total_earnings,
  a.specializations,
  a.is_active
FROM arbiters a
LEFT JOIN arbiter_rewards ar ON a.arbiter_address = ar.arbiter_address
GROUP BY a.arbiter_address
ORDER BY a.reputation_score DESC, a.disputes_resolved DESC;

-- View: Dispute resolution statistics
CREATE VIEW v_dispute_stats AS
SELECT
  reason_type,
  COUNT(*) as total_disputes,
  SUM(CASE WHEN status = 'resolved' OR status = 'closed' THEN 1 ELSE 0 END) as resolved_count,
  SUM(CASE WHEN status = 'appealed' THEN 1 ELSE 0 END) as appealed_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_time_seconds,
  SUM(CASE WHEN resolution_type = 'full_release' THEN 1 ELSE 0 END) as full_release_count,
  SUM(CASE WHEN resolution_type = 'full_refund' THEN 1 ELSE 0 END) as full_refund_count,
  SUM(CASE WHEN resolution_type = 'partial_split' THEN 1 ELSE 0 END) as partial_split_count
FROM disputes
WHERE status IN ('resolved', 'closed')
GROUP BY reason_type;

-- View: Disputes pending appeal deadline
CREATE VIEW v_disputes_pending_appeal AS
SELECT
  d.*,
  EXTRACT(EPOCH FROM (d.appeal_deadline - NOW())) as seconds_until_appeal_expires
FROM disputes d
WHERE d.status = 'resolved'
  AND d.appeal_deadline > NOW()
ORDER BY d.appeal_deadline ASC;

-- ========================================
-- SEED DATA
-- ========================================

-- Sample arbiters for testing
INSERT INTO arbiters (arbiter_address, staked_amount, specializations, reputation_score) VALUES
  ('EQArbiter1FreelanceTech...', 1000000, ARRAY['freelance', 'technical'], 0.85),
  ('EQArbiter2TradeFinLegal...', 1500000, ARRAY['trade_fin', 'legal'], 0.92),
  ('EQArbiter3RealEstateLegal...', 2000000, ARRAY['real_estate', 'legal'], 0.88),
  ('EQArbiter4MilestoneDisputes...', 1200000, ARRAY['milestone', 'technical', 'freelance'], 0.80),
  ('EQArbiter5AllRounder...', 3000000, ARRAY['freelance', 'trade_fin', 'milestone', 'technical', 'legal'], 0.95)
ON CONFLICT (arbiter_address) DO NOTHING;

-- ========================================
-- COMMENTS AND DOCUMENTATION
-- ========================================

COMMENT ON TABLE arbiters IS 'Registry of staked arbiters with reputation tracking';
COMMENT ON TABLE disputes IS 'Formal dispute records with lifecycle tracking';
COMMENT ON TABLE dispute_evidence IS 'Evidence submissions from both parties';
COMMENT ON TABLE arbiter_slashing_events IS 'Record of arbiter penalties for misconduct';
COMMENT ON TABLE arbiter_rewards IS 'Arbiter compensation with bonus breakdown';

COMMENT ON COLUMN arbiters.staked_amount IS 'Required $10,000 minimum stake in USD cents';
COMMENT ON COLUMN arbiters.reputation_score IS 'Calculated score (0.00-1.00) based on success rate, volume, and speed';
COMMENT ON COLUMN disputes.reason_data IS 'Structured JSON with type-specific fields';
COMMENT ON COLUMN disputes.resolution_data IS 'Structured JSON with resolution-specific data (e.g., split percentages)';
COMMENT ON COLUMN dispute_evidence.content_url IS 'Decentralized storage URL (IPFS/Arweave)';

-- Migration complete
-- Tables created: 5 (arbiters, disputes, dispute_evidence, arbiter_slashing_events, arbiter_rewards)
-- Indexes created: 24
-- Triggers created: 3
-- Functions created: 3
-- Views created: 4
-- Seed arbiters: 5
