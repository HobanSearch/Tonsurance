/**
 * Escrow Components for Tonsurance
 * React components for parametric escrow features
 */

import React, { useState, useEffect } from 'react';
import {
  TonsuranceClient,
  EscrowCreateRequest,
  EscrowContract,
  ReleaseCondition,
  PartyAllocation,
  Blockchain,
} from './api-client';

const client = new TonsuranceClient('http://localhost:8080');

/**
 * Escrow Creator Component
 */
export const EscrowCreator: React.FC = () => {
  const [formData, setFormData] = useState<EscrowCreateRequest>({
    payer: '',
    payee: '',
    amount_usd: 1000,
    release_conditions: [],
    timeout_action: 'RefundPayer',
    timeout_seconds: 30 * 86400, // 30 days
    additional_parties: [],
    protection_enabled: true,
  });

  const [conditions, setConditions] = useState<ReleaseCondition[]>([]);
  const [loading, setLoading] = useState(false);
  const [createdEscrow, setCreatedEscrow] = useState<EscrowContract | null>(null);

  const addOracleCondition = () => {
    setConditions([
      ...conditions,
      {
        type: 'OracleVerification',
        oracle_endpoint: '',
        expected_value: 'DELIVERED',
      },
    ]);
  };

  const addTimeCondition = () => {
    setConditions([
      ...conditions,
      {
        type: 'TimeElapsed',
        seconds: 7 * 86400, // 7 days
        start_time: Math.floor(Date.now() / 1000),
      },
    ]);
  };

  const addApprovalCondition = () => {
    setConditions([
      ...conditions,
      {
        type: 'ManualApproval',
        approver: '',
        approval_deadline: Math.floor(Date.now() / 1000) + 30 * 86400,
      },
    ]);
  };

  const addMultisigCondition = () => {
    setConditions([
      ...conditions,
      {
        type: 'MultisigApproval',
        required_signatures: 2,
        signers: [],
      },
    ]);
  };

  const handleCreateEscrow = async () => {
    setLoading(true);
    try {
      const request = { ...formData, release_conditions: conditions };
      const escrow = await client.createEscrow(request);
      setCreatedEscrow(escrow);
    } catch (err) {
      console.error('Failed to create escrow:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="escrow-creator">
      <h2>Create Parametric Escrow</h2>

      <div className="form-section">
        <h3>Basic Information</h3>

        <div className="form-group">
          <label>Payer Address</label>
          <input
            type="text"
            value={formData.payer}
            onChange={(e) => setFormData({ ...formData, payer: e.target.value })}
            placeholder="EQBv..."
          />
        </div>

        <div className="form-group">
          <label>Payee Address</label>
          <input
            type="text"
            value={formData.payee}
            onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
            placeholder="EQCx..."
          />
        </div>

        <div className="form-group">
          <label>Amount (USD)</label>
          <input
            type="number"
            value={formData.amount_usd}
            onChange={(e) => setFormData({ ...formData, amount_usd: Number(e.target.value) })}
            min="100"
          />
        </div>

        <div className="form-group">
          <label>Timeout Action</label>
          <select
            value={formData.timeout_action}
            onChange={(e) =>
              setFormData({ ...formData, timeout_action: e.target.value as any })
            }
          >
            <option value="RefundPayer">Refund Payer</option>
            <option value="ReleaseFunds">Release to Payee</option>
            <option value="ExtendTimeout">Extend Timeout</option>
          </select>
        </div>

        <div className="form-group">
          <label>Timeout (Days)</label>
          <input
            type="number"
            value={formData.timeout_seconds / 86400}
            onChange={(e) =>
              setFormData({
                ...formData,
                timeout_seconds: Number(e.target.value) * 86400,
              })
            }
            min="1"
          />
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.protection_enabled}
              onChange={(e) =>
                setFormData({ ...formData, protection_enabled: e.target.checked })
              }
            />
            Enable Depeg Protection
          </label>
        </div>
      </div>

      <div className="form-section">
        <h3>Release Conditions</h3>

        <div className="condition-buttons">
          <button onClick={addOracleCondition}>+ Oracle Verification</button>
          <button onClick={addTimeCondition}>+ Time Elapsed</button>
          <button onClick={addApprovalCondition}>+ Manual Approval</button>
          <button onClick={addMultisigCondition}>+ Multisig</button>
        </div>

        <div className="conditions-list">
          {conditions.map((condition, index) => (
            <div key={index} className="condition-card">
              <ConditionEditor
                condition={condition}
                onChange={(updated) => {
                  const newConditions = [...conditions];
                  newConditions[index] = updated;
                  setConditions(newConditions);
                }}
                onRemove={() => {
                  setConditions(conditions.filter((_, i) => i !== index));
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleCreateEscrow} disabled={loading || conditions.length === 0}>
        {loading ? 'Creating...' : 'Create Escrow'}
      </button>

      {createdEscrow && (
        <div className="success-message">
          <h3>✅ Escrow Created!</h3>
          <p>Escrow ID: {createdEscrow.escrow_id}</p>
          <p>Status: {createdEscrow.status}</p>
          <p>
            Timeout: {new Date(createdEscrow.timeout_at * 1000).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Condition Editor Sub-Component
 */
const ConditionEditor: React.FC<{
  condition: ReleaseCondition;
  onChange: (updated: ReleaseCondition) => void;
  onRemove: () => void;
}> = ({ condition, onChange, onRemove }) => {
  return (
    <div className="condition-editor">
      <div className="condition-header">
        <h4>{condition.type}</h4>
        <button onClick={onRemove}>Remove</button>
      </div>

      {condition.type === 'OracleVerification' && (
        <>
          <input
            type="text"
            placeholder="Oracle Endpoint URL"
            value={condition.oracle_endpoint}
            onChange={(e) =>
              onChange({ ...condition, oracle_endpoint: e.target.value })
            }
          />
          <input
            type="text"
            placeholder="Expected Value"
            value={condition.expected_value}
            onChange={(e) => onChange({ ...condition, expected_value: e.target.value })}
          />
        </>
      )}

      {condition.type === 'TimeElapsed' && (
        <div>
          <label>Duration (Days)</label>
          <input
            type="number"
            value={condition.seconds / 86400}
            onChange={(e) =>
              onChange({ ...condition, seconds: Number(e.target.value) * 86400 })
            }
          />
        </div>
      )}

      {condition.type === 'ManualApproval' && (
        <>
          <input
            type="text"
            placeholder="Approver Address"
            value={condition.approver}
            onChange={(e) => onChange({ ...condition, approver: e.target.value })}
          />
          <input
            type="datetime-local"
            value={
              condition.approval_deadline
                ? new Date(condition.approval_deadline * 1000).toISOString().slice(0, 16)
                : ''
            }
            onChange={(e) =>
              onChange({
                ...condition,
                approval_deadline: Math.floor(new Date(e.target.value).getTime() / 1000),
              })
            }
          />
        </>
      )}

      {condition.type === 'MultisigApproval' && (
        <>
          <input
            type="number"
            placeholder="Required Signatures"
            value={condition.required_signatures}
            onChange={(e) =>
              onChange({ ...condition, required_signatures: Number(e.target.value) })
            }
          />
          <textarea
            placeholder="Signer Addresses (one per line)"
            value={condition.signers.join('\n')}
            onChange={(e) =>
              onChange({ ...condition, signers: e.target.value.split('\n') })
            }
          />
        </>
      )}

      {condition.type === 'ChainEvent' && (
        <>
          <select
            value={condition.chain}
            onChange={(e) => onChange({ ...condition, chain: e.target.value as Blockchain })}
          >
            <option value="Ethereum">Ethereum</option>
            <option value="Arbitrum">Arbitrum</option>
            <option value="Base">Base</option>
            <option value="Polygon">Polygon</option>
            <option value="TON">TON</option>
          </select>
          <input
            type="text"
            placeholder="Event Type"
            value={condition.event_type}
            onChange={(e) => onChange({ ...condition, event_type: e.target.value })}
          />
          <input
            type="text"
            placeholder="Contract Address"
            value={condition.contract_address}
            onChange={(e) => onChange({ ...condition, contract_address: e.target.value })}
          />
        </>
      )}
    </div>
  );
};

/**
 * Escrow Dashboard Component
 */
export const EscrowDashboard: React.FC<{ userAddress: string }> = ({ userAddress }) => {
  const [escrows, setEscrows] = useState<EscrowContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, fetch user's escrows from API
    // const fetchEscrows = async () => {
    //   const data = await client.getUserEscrows(userAddress);
    //   setEscrows(data);
    //   setLoading(false);
    // };
    // fetchEscrows();

    // Mock data for demo
    setLoading(false);
  }, [userAddress]);

  if (loading) return <div>Loading escrows...</div>;

  return (
    <div className="escrow-dashboard">
      <h2>My Escrows</h2>

      <div className="escrow-stats">
        <div className="stat-card">
          <div className="stat-label">Active Escrows</div>
          <div className="stat-value">
            {escrows.filter((e) => e.status === 'Active').length}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Value Locked</div>
          <div className="stat-value">
            $
            {escrows
              .filter((e) => e.status === 'Active')
              .reduce((sum, e) => sum + e.amount, 0)
              .toLocaleString()}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value">
            {escrows.filter((e) => e.status === 'Released').length}
          </div>
        </div>
      </div>

      <div className="escrows-list">
        {escrows.map((escrow) => (
          <EscrowCard key={escrow.escrow_id} escrow={escrow} />
        ))}
      </div>
    </div>
  );
};

/**
 * Escrow Card Component
 */
const EscrowCard: React.FC<{ escrow: EscrowContract }> = ({ escrow }) => {
  const [expanded, setExpanded] = useState(false);

  const daysUntilTimeout = (escrow.timeout_at - Date.now() / 1000) / 86400;

  return (
    <div className={`escrow-card status-${escrow.status.toLowerCase()}`}>
      <div className="escrow-header" onClick={() => setExpanded(!expanded)}>
        <div>
          <h3>Escrow #{escrow.escrow_id}</h3>
          <p className="escrow-amount">${escrow.amount.toLocaleString()}</p>
        </div>
        <div className={`status-badge ${escrow.status.toLowerCase()}`}>
          {escrow.status}
        </div>
      </div>

      {expanded && (
        <div className="escrow-details">
          <div className="detail-row">
            <span>Payer:</span>
            <code>{escrow.payer}</code>
          </div>
          <div className="detail-row">
            <span>Payee:</span>
            <code>{escrow.payee}</code>
          </div>
          <div className="detail-row">
            <span>Created:</span>
            <span>{new Date(escrow.created_at * 1000).toLocaleDateString()}</span>
          </div>
          <div className="detail-row">
            <span>Timeout:</span>
            <span>
              {daysUntilTimeout > 0
                ? `${daysUntilTimeout.toFixed(1)} days`
                : 'Expired'}
            </span>
          </div>

          <h4>Release Conditions ({escrow.release_conditions.length})</h4>
          <ul className="conditions-list">
            {escrow.release_conditions.map((condition, i) => (
              <li key={i}>
                <ConditionStatus condition={condition} />
              </li>
            ))}
          </ul>

          {escrow.status === 'Active' && (
            <div className="escrow-actions">
              <button className="btn-primary">Approve Release</button>
              <button className="btn-secondary">Cancel Escrow</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Condition Status Display
 */
const ConditionStatus: React.FC<{ condition: ReleaseCondition }> = ({ condition }) => {
  let status = '⏳ Pending';
  let details = '';

  if (condition.type === 'OracleVerification') {
    status = condition.verified ? '✅ Verified' : '⏳ Awaiting Oracle';
    details = condition.oracle_endpoint;
  } else if (condition.type === 'TimeElapsed') {
    const elapsed = Date.now() / 1000 - condition.start_time;
    const met = elapsed >= condition.seconds;
    status = met ? '✅ Complete' : '⏳ In Progress';
    details = `${(condition.seconds / 86400).toFixed(0)} days`;
  } else if (condition.type === 'ManualApproval') {
    status = condition.approved ? '✅ Approved' : '⏳ Awaiting Approval';
    details = condition.approver;
  } else if (condition.type === 'ChainEvent') {
    status = condition.occurred ? '✅ Occurred' : '⏳ Monitoring';
    details = `${condition.chain}: ${condition.event_type}`;
  } else if (condition.type === 'MultisigApproval') {
    const received = condition.signatures_received?.length || 0;
    status =
      received >= condition.required_signatures
        ? '✅ Signed'
        : `⏳ ${received}/${condition.required_signatures}`;
    details = `${condition.required_signatures} signatures required`;
  }

  return (
    <div className="condition-status">
      <span className="status-icon">{status}</span>
      <span className="condition-type">{condition.type}</span>
      <span className="condition-details">{details}</span>
    </div>
  );
};
