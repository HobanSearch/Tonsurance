-- Migration 004: Add evidence and arbiter tables for escrow dispute system
-- Dependencies: Assumes disputes table exists from previous migration

-- ============================================================================
-- ARBITER REGISTRY TABLE
-- ============================================================================
-- Stores registered arbiters who can vote on disputes
CREATE TABLE IF NOT EXISTS arbiters (
    arbiter_id BIGSERIAL PRIMARY KEY,
    arbiter_address VARCHAR(100) NOT NULL UNIQUE,
    reputation_score INT NOT NULL DEFAULT 1000,
    total_disputes_resolved INT NOT NULL DEFAULT 0,
    total_votes_cast INT NOT NULL DEFAULT 0,
    specialization VARCHAR(50),
    registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_active_at TIMESTAMP
);

CREATE INDEX idx_arbiters_address ON arbiters(arbiter_address);
CREATE INDEX idx_arbiters_active ON arbiters(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_arbiters_reputation ON arbiters(reputation_score DESC);

-- ============================================================================
-- DISPUTE EVIDENCE TABLE
-- ============================================================================
-- Stores evidence submitted by parties during dispute resolution
CREATE TABLE IF NOT EXISTS dispute_evidence (
    evidence_id BIGSERIAL PRIMARY KEY,
    dispute_id BIGINT NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,
    submitted_by VARCHAR(100) NOT NULL,
    evidence_type VARCHAR(50) NOT NULL CHECK (evidence_type IN (
        'transaction_proof',
        'oracle_data',
        'communication_log',
        'contract_state',
        'external_verification',
        'witness_statement',
        'technical_analysis',
        'other'
    )),
    content_hash VARCHAR(66) NOT NULL,
    ipfs_cid VARCHAR(100),
    description TEXT,
    metadata JSONB,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    verified_by VARCHAR(100)
);

CREATE INDEX idx_dispute_evidence_dispute_id ON dispute_evidence(dispute_id);
CREATE INDEX idx_dispute_evidence_submitted_by ON dispute_evidence(submitted_by);
CREATE INDEX idx_dispute_evidence_type ON dispute_evidence(evidence_type);
CREATE INDEX idx_dispute_evidence_submitted_at ON dispute_evidence(submitted_at DESC);
CREATE INDEX idx_dispute_evidence_content_hash ON dispute_evidence(content_hash);

-- ============================================================================
-- ARBITER VOTES TABLE
-- ============================================================================
-- Records votes cast by arbiters on disputes
CREATE TABLE IF NOT EXISTS arbiter_votes (
    vote_id BIGSERIAL PRIMARY KEY,
    dispute_id BIGINT NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,
    arbiter_id BIGINT NOT NULL REFERENCES arbiters(arbiter_id) ON DELETE CASCADE,
    arbiter_address VARCHAR(100) NOT NULL,
    vote_option VARCHAR(20) NOT NULL CHECK (vote_option IN (
        'approve',
        'deny',
        'partial_approve',
        'abstain'
    )),
    vote_amount BIGINT,
    reasoning TEXT,
    confidence_score INT CHECK (confidence_score >= 0 AND confidence_score <= 100),
    voted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(dispute_id, arbiter_id)
);

CREATE INDEX idx_arbiter_votes_dispute_id ON arbiter_votes(dispute_id);
CREATE INDEX idx_arbiter_votes_arbiter_id ON arbiter_votes(arbiter_id);
CREATE INDEX idx_arbiter_votes_option ON arbiter_votes(vote_option);
CREATE INDEX idx_arbiter_votes_voted_at ON arbiter_votes(voted_at DESC);

-- ============================================================================
-- ARBITER REPUTATION HISTORY TABLE
-- ============================================================================
-- Tracks reputation changes for transparency and auditability
CREATE TABLE IF NOT EXISTS arbiter_reputation_history (
    history_id BIGSERIAL PRIMARY KEY,
    arbiter_id BIGINT NOT NULL REFERENCES arbiters(arbiter_id) ON DELETE CASCADE,
    dispute_id BIGINT REFERENCES disputes(dispute_id) ON DELETE SET NULL,
    reputation_change INT NOT NULL,
    new_reputation INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_arbiter_reputation_arbiter_id ON arbiter_reputation_history(arbiter_id);
CREATE INDEX idx_arbiter_reputation_dispute_id ON arbiter_reputation_history(dispute_id);
CREATE INDEX idx_arbiter_reputation_changed_at ON arbiter_reputation_history(changed_at DESC);

-- ============================================================================
-- DISPUTE RESOLUTION TIMELINE TABLE
-- ============================================================================
-- Tracks all events in dispute lifecycle for audit trail
CREATE TABLE IF NOT EXISTS dispute_timeline (
    event_id BIGSERIAL PRIMARY KEY,
    dispute_id BIGINT NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'dispute_created',
        'evidence_submitted',
        'arbiter_assigned',
        'vote_cast',
        'dispute_resolved',
        'appeal_filed',
        'payout_executed',
        'dispute_cancelled'
    )),
    actor_address VARCHAR(100),
    event_data JSONB,
    event_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispute_timeline_dispute_id ON dispute_timeline(dispute_id);
CREATE INDEX idx_dispute_timeline_event_type ON dispute_timeline(event_type);
CREATE INDEX idx_dispute_timeline_event_at ON dispute_timeline(event_at DESC);
CREATE INDEX idx_dispute_timeline_actor ON dispute_timeline(actor_address);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update arbiter last_active_at timestamp
CREATE OR REPLACE FUNCTION update_arbiter_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE arbiters
    SET last_active_at = NOW()
    WHERE arbiter_id = NEW.arbiter_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_arbiter_last_active
AFTER INSERT ON arbiter_votes
FOR EACH ROW
EXECUTE FUNCTION update_arbiter_last_active();

-- Function to increment arbiter vote count
CREATE OR REPLACE FUNCTION increment_arbiter_vote_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE arbiters
    SET total_votes_cast = total_votes_cast + 1
    WHERE arbiter_id = NEW.arbiter_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_arbiter_vote_count
AFTER INSERT ON arbiter_votes
FOR EACH ROW
EXECUTE FUNCTION increment_arbiter_vote_count();

-- Function to log dispute timeline events automatically
CREATE OR REPLACE FUNCTION log_dispute_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'dispute_evidence' THEN
        INSERT INTO dispute_timeline (dispute_id, event_type, actor_address, event_data)
        VALUES (
            NEW.dispute_id,
            'evidence_submitted',
            NEW.submitted_by,
            jsonb_build_object(
                'evidence_id', NEW.evidence_id,
                'evidence_type', NEW.evidence_type,
                'content_hash', NEW.content_hash
            )
        );
    ELSIF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'arbiter_votes' THEN
        INSERT INTO dispute_timeline (dispute_id, event_type, actor_address, event_data)
        VALUES (
            NEW.dispute_id,
            'vote_cast',
            NEW.arbiter_address,
            jsonb_build_object(
                'vote_id', NEW.vote_id,
                'vote_option', NEW.vote_option,
                'confidence_score', NEW.confidence_score
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_evidence_event
AFTER INSERT ON dispute_evidence
FOR EACH ROW
EXECUTE FUNCTION log_dispute_event();

CREATE TRIGGER trigger_log_vote_event
AFTER INSERT ON arbiter_votes
FOR EACH ROW
EXECUTE FUNCTION log_dispute_event();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Active disputes with evidence counts
CREATE OR REPLACE VIEW dispute_evidence_summary AS
SELECT
    d.dispute_id,
    d.escrow_id,
    d.initiator_address,
    d.status,
    COUNT(DISTINCT de.evidence_id) as total_evidence,
    COUNT(DISTINCT CASE WHEN de.verified = TRUE THEN de.evidence_id END) as verified_evidence,
    COUNT(DISTINCT av.vote_id) as total_votes,
    d.created_at,
    d.resolved_at
FROM disputes d
LEFT JOIN dispute_evidence de ON d.dispute_id = de.dispute_id
LEFT JOIN arbiter_votes av ON d.dispute_id = av.dispute_id
GROUP BY d.dispute_id, d.escrow_id, d.initiator_address, d.status, d.created_at, d.resolved_at;

-- View: Arbiter performance metrics
CREATE OR REPLACE VIEW arbiter_performance AS
SELECT
    a.arbiter_id,
    a.arbiter_address,
    a.reputation_score,
    a.total_disputes_resolved,
    a.total_votes_cast,
    a.specialization,
    COALESCE(AVG(av.confidence_score), 0) as avg_confidence,
    COUNT(DISTINCT CASE
        WHEN d.status = 'resolved' AND d.resolved_at > NOW() - INTERVAL '30 days'
        THEN d.dispute_id
    END) as disputes_last_30_days,
    a.last_active_at
FROM arbiters a
LEFT JOIN arbiter_votes av ON a.arbiter_id = av.arbiter_id
LEFT JOIN disputes d ON av.dispute_id = d.dispute_id
WHERE a.is_active = TRUE
GROUP BY a.arbiter_id, a.arbiter_address, a.reputation_score, a.total_disputes_resolved,
         a.total_votes_cast, a.specialization, a.last_active_at;

-- ============================================================================
-- SEED DATA (Optional - for development/testing)
-- ============================================================================

-- Insert sample arbiters (commented out for production)
-- INSERT INTO arbiters (arbiter_address, reputation_score, specialization) VALUES
--     ('EQArbiter1_________________________________', 1500, 'smart_contract'),
--     ('EQArbiter2_________________________________', 1200, 'oracle_verification'),
--     ('EQArbiter3_________________________________', 1800, 'defi_protocols');

-- ============================================================================
-- ROLLBACK SCRIPT (for development)
-- ============================================================================
-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS trigger_log_vote_event ON arbiter_votes;
-- DROP TRIGGER IF EXISTS trigger_log_evidence_event ON dispute_evidence;
-- DROP TRIGGER IF EXISTS trigger_increment_arbiter_vote_count ON arbiter_votes;
-- DROP TRIGGER IF EXISTS trigger_update_arbiter_last_active ON arbiter_votes;
-- DROP FUNCTION IF EXISTS log_dispute_event();
-- DROP FUNCTION IF EXISTS increment_arbiter_vote_count();
-- DROP FUNCTION IF EXISTS update_arbiter_last_active();
-- DROP VIEW IF EXISTS arbiter_performance;
-- DROP VIEW IF EXISTS dispute_evidence_summary;
-- DROP TABLE IF EXISTS dispute_timeline CASCADE;
-- DROP TABLE IF EXISTS arbiter_reputation_history CASCADE;
-- DROP TABLE IF EXISTS arbiter_votes CASCADE;
-- DROP TABLE IF EXISTS dispute_evidence CASCADE;
-- DROP TABLE IF EXISTS arbiters CASCADE;
