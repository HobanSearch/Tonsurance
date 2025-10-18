import { useState } from 'react';
import { TerminalWindow, RetroButton, InfoPanel } from '../terminal';

type ReleaseCondition =
  | { type: 'oracle'; oracle_endpoint: string; expected_value: string; verified: boolean; last_check?: number }
  | { type: 'time_elapsed'; seconds: number; start_time: number }
  | { type: 'manual_approval'; approver: string; approved: boolean; approval_deadline?: number; signature?: string }
  | { type: 'chain_event'; chain: string; event_type: string; contract_address: string; occurred: boolean; verified_at?: number }
  | { type: 'multisig'; required_signatures: number; signers: string[]; signatures_received: Array<[string, string]> };

type TimeoutAction = 'release_to_payee' | 'return_to_payer' | { split: number };
type EscrowStatus = 'active' | 'conditions_met' | 'released' | 'disputed' | 'cancelled' | 'timed_out';
type EscrowType = 'freelance' | 'tradefin' | 'milestone' | 'real_estate' | 'multi_party';

interface PartyAllocation {
  party_address: string;
  allocation_percentage: number;
}

interface EscrowContract {
  escrow_id: number;
  payer: string;
  payee: string;
  amount: number;
  asset: string;
  created_at: number;
  release_conditions: ReleaseCondition[];
  timeout_action: TimeoutAction;
  timeout_seconds: number;
  additional_parties: PartyAllocation[];
  status: EscrowStatus;
  conditions_met: number;
  released_at?: number;
  protection_enabled: boolean;
  coverage_type?: 'smart_contract' | 'timeout' | 'comprehensive' | null;
  coverage_premium?: number;
  escrow_type: EscrowType;
}

interface EscrowDetailsProps {
  escrow: EscrowContract;
  userAddress: string;
  onClose: () => void;
  onRelease: (escrowId: number) => void;
  onCancel: (escrowId: number) => void;
  onDispute: (escrowId: number) => void;
  onApprove: (escrowId: number) => void;
  onSign: (escrowId: number, signature: string) => void;
}

export const EscrowDetails = ({
  escrow,
  userAddress,
  onClose,
  onRelease,
  onCancel,
  onDispute,
  onApprove,
  onSign
}: EscrowDetailsProps) => {
  const [signatureInput, setSignatureInput] = useState('');
  const [showSignModal, setShowSignModal] = useState(false);

  const isPayer = escrow.payer === userAddress;
  const isPayee = escrow.payee === userAddress;
  const isAdditionalParty = escrow.additional_parties.some(p => p.party_address === userAddress);

  // Check if user is an approver for any manual approval condition
  const isApprover = escrow.release_conditions.some(
    c => c.type === 'manual_approval' && c.approver === userAddress
  );

  // Check if user is a signer for any multisig condition
  const isMultisigSigner = escrow.release_conditions.some(
    c => c.type === 'multisig' && c.signers.includes(userAddress)
  );

  const formatTimeRemaining = (createdAt: number, timeoutSeconds: number) => {
    const timeoutAt = createdAt + timeoutSeconds * 1000;
    const remaining = timeoutAt - Date.now();

    if (remaining <= 0) return 'EXPIRED';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getConditionStatus = (condition: ReleaseCondition): 'met' | 'pending' | 'expired' => {
    switch (condition.type) {
      case 'oracle':
        return condition.verified ? 'met' : 'pending';

      case 'time_elapsed':
        const elapsed = Date.now() >= condition.start_time + condition.seconds * 1000;
        return elapsed ? 'met' : 'pending';

      case 'manual_approval':
        if (condition.approved) return 'met';
        if (condition.approval_deadline && Date.now() > condition.approval_deadline) return 'expired';
        return 'pending';

      case 'chain_event':
        return condition.occurred ? 'met' : 'pending';

      case 'multisig':
        return condition.signatures_received.length >= condition.required_signatures ? 'met' : 'pending';

      default:
        return 'pending';
    }
  };

  const renderCondition = (condition: ReleaseCondition, index: number) => {
    const status = getConditionStatus(condition);
    const statusColors = {
      met: 'text-terminal-green border-terminal-green bg-terminal-green/10',
      pending: 'text-copper-500 border-copper-500 bg-copper-50',
      expired: 'text-terminal-red border-terminal-red bg-terminal-red/10'
    };

    return (
      <div key={index} className="border-2 border-cream-400 p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {condition.type === 'oracle' && (
              <>
                <div className="font-mono font-semibold text-sm text-text-primary">
                  🔮 Oracle Verification
                </div>
                <div className="text-xs text-text-tertiary mt-1">
                  Endpoint: {condition.oracle_endpoint}
                </div>
                <div className="text-xs text-text-tertiary">
                  Expected: "{condition.expected_value}"
                </div>
                {condition.last_check && (
                  <div className="text-xs text-text-tertiary">
                    Last checked: {new Date(condition.last_check).toLocaleString()}
                  </div>
                )}
              </>
            )}

            {condition.type === 'time_elapsed' && (
              <>
                <div className="font-mono font-semibold text-sm text-text-primary">
                  ⏰ Time Lock
                </div>
                <div className="text-xs text-text-tertiary mt-1">
                  Duration: {Math.floor(condition.seconds / 86400)} days
                </div>
                <div className="text-xs text-text-tertiary">
                  Unlocks: {new Date(condition.start_time + condition.seconds * 1000).toLocaleString()}
                </div>
              </>
            )}

            {condition.type === 'manual_approval' && (
              <>
                <div className="font-mono font-semibold text-sm text-text-primary">
                  ✍️ Manual Approval Required
                </div>
                <div className="text-xs text-text-tertiary mt-1">
                  Approver: {condition.approver}
                </div>
                {condition.approval_deadline && (
                  <div className="text-xs text-text-tertiary">
                    Deadline: {new Date(condition.approval_deadline).toLocaleString()}
                  </div>
                )}
                {condition.approved && condition.signature && (
                  <div className="text-xs text-terminal-green mt-1">
                    Signed: {condition.signature.slice(0, 16)}...
                  </div>
                )}
                {isApprover && !condition.approved && status === 'pending' && (
                  <RetroButton
                    onClick={() => onApprove(escrow.escrow_id)}
                    variant="primary"
                    className="mt-2"
                  >
                    APPROVE NOW
                  </RetroButton>
                )}
              </>
            )}

            {condition.type === 'chain_event' && (
              <>
                <div className="font-mono font-semibold text-sm text-text-primary">
                  ⛓️ Chain Event
                </div>
                <div className="text-xs text-text-tertiary mt-1">
                  Chain: {condition.chain}
                </div>
                <div className="text-xs text-text-tertiary">
                  Event: {condition.event_type}
                </div>
                <div className="text-xs text-text-tertiary">
                  Contract: {condition.contract_address}
                </div>
                {condition.verified_at && (
                  <div className="text-xs text-terminal-green mt-1">
                    Verified: {new Date(condition.verified_at).toLocaleString()}
                  </div>
                )}
              </>
            )}

            {condition.type === 'multisig' && (
              <>
                <div className="font-mono font-semibold text-sm text-text-primary">
                  👥 Multisig Approval ({condition.signatures_received.length}/{condition.required_signatures})
                </div>
                <div className="text-xs text-text-tertiary mt-1">
                  Required: {condition.required_signatures} signatures
                </div>
                <div className="text-xs text-text-tertiary mt-2">Signers:</div>
                {condition.signers.map((signer, idx) => {
                  const hasSigned = condition.signatures_received.some(([s]) => s === signer);
                  return (
                    <div key={idx} className="text-xs text-text-tertiary flex items-center gap-2">
                      {hasSigned ? '✓' : '○'} {signer}
                    </div>
                  );
                })}
                {isMultisigSigner && !condition.signatures_received.some(([s]) => s === userAddress) && (
                  <RetroButton
                    onClick={() => setShowSignModal(true)}
                    variant="primary"
                    className="mt-2"
                  >
                    SIGN NOW
                  </RetroButton>
                )}
              </>
            )}
          </div>

          <span className={`px-2 py-1 border-2 text-[10px] font-mono font-bold ${statusColors[status]}`}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>
    );
  };

  const getTimeoutActionLabel = (action: TimeoutAction) => {
    if (action === 'release_to_payee') return 'Release to Payee';
    if (action === 'return_to_payer') return 'Return to Payer';
    return `Split ${(action.split * 100).toFixed(0)}/${((1 - action.split) * 100).toFixed(0)}`;
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <TerminalWindow title={`ESCROW_#${escrow.escrow_id}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-2xl font-bold text-terminal-green">
                ${(escrow.amount / 100).toLocaleString()}
              </div>
              <div className="text-xs text-text-tertiary font-mono mt-1">
                {escrow.asset} • Created {new Date(escrow.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 border-2 text-xs font-mono font-bold ${
                escrow.status === 'active' ? 'border-terminal-green text-terminal-green bg-terminal-green/10' :
                escrow.status === 'conditions_met' ? 'border-copper-500 text-copper-500 bg-copper-50' :
                escrow.status === 'released' ? 'border-terminal-green text-terminal-green bg-terminal-green/20' :
                'border-terminal-red text-terminal-red bg-terminal-red/10'
              }`}>
                {escrow.status.toUpperCase().replace('_', ' ')}
              </span>
              {escrow.protection_enabled && (
                <div className="text-xs text-copper-500 font-mono font-semibold mt-2">
                  🛡️ PROTECTED
                </div>
              )}
            </div>
          </div>
        </TerminalWindow>

        {/* Parties */}
        <TerminalWindow title="PARTIES">
          <div className="space-y-3 font-mono text-sm">
            <div>
              <div className="text-text-tertiary text-xs mb-1">PAYER {isPayer && '(YOU)'}</div>
              <div className="text-text-primary">{escrow.payer}</div>
            </div>
            <div>
              <div className="text-text-tertiary text-xs mb-1">PAYEE {isPayee && '(YOU)'}</div>
              <div className="text-text-primary">{escrow.payee}</div>
            </div>
            {escrow.additional_parties.length > 0 && (
              <div>
                <div className="text-text-tertiary text-xs mb-2">ADDITIONAL PARTIES</div>
                {escrow.additional_parties.map((party, idx) => (
                  <div key={idx} className="text-xs text-text-primary flex justify-between">
                    <span>{party.party_address}</span>
                    <span>{party.allocation_percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TerminalWindow>

        {/* Release Conditions */}
        <TerminalWindow title="RELEASE_CONDITIONS">
          <div className="space-y-3">
            {escrow.release_conditions.map((condition, index) => renderCondition(condition, index))}
          </div>
        </TerminalWindow>

        {/* Coverage Info */}
        {escrow.protection_enabled && escrow.coverage_type && (
          <TerminalWindow title="PARAMETRIC_COVERAGE">
            <div className="font-mono text-sm space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🛡️</span>
                <div>
                  <div className="text-text-primary font-semibold">
                    {escrow.coverage_type === 'smart_contract' && 'Smart Contract Exploit Coverage'}
                    {escrow.coverage_type === 'timeout' && 'Timeout Dispute Coverage'}
                    {escrow.coverage_type === 'comprehensive' && 'Comprehensive Coverage'}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {escrow.coverage_type === 'smart_contract' && 'Protection against verified contract exploits'}
                    {escrow.coverage_type === 'timeout' && 'Protection for timeout disputes and arbitration'}
                    {escrow.coverage_type === 'comprehensive' && 'Full protection: Exploits, timeouts, and oracle failures'}
                  </div>
                </div>
              </div>

              <div className="border-2 border-copper-500 bg-copper-50/20 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Coverage Amount:</span>
                  <span className="text-text-primary font-semibold">
                    ${(escrow.amount / 100).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Premium Paid:</span>
                  <span className="text-terminal-green font-semibold">
                    ${escrow.coverage_premium?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Coverage Status:</span>
                  <span className="text-terminal-green font-semibold">
                    ✓ ACTIVE
                  </span>
                </div>
              </div>

              <InfoPanel variant="info">
                <div className="font-mono text-xs">
                  &gt; Coverage remains active until escrow is released or cancelled
                  <div className="mt-1">
                  &gt; Automated payout if covered events are verified on-chain
                  </div>
                </div>
              </InfoPanel>
            </div>
          </TerminalWindow>
        )}

        {/* Timeout Info */}
        <TerminalWindow title="TIMEOUT_SETTINGS">
          <div className="font-mono text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-text-tertiary">Time Remaining:</span>
              <span className="text-text-primary font-semibold">
                {formatTimeRemaining(escrow.created_at, escrow.timeout_seconds)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-tertiary">Timeout Action:</span>
              <span className="text-text-primary">{getTimeoutActionLabel(escrow.timeout_action)}</span>
            </div>
          </div>
        </TerminalWindow>

        {/* Actions */}
        <div className="space-y-3">
          {escrow.status === 'conditions_met' && (isPayer || isPayee) && (
            <RetroButton
              onClick={() => onRelease(escrow.escrow_id)}
              variant="primary"
              className="w-full py-4 text-lg"
            >
              🚀 RELEASE FUNDS
            </RetroButton>
          )}

          {escrow.status === 'active' && (
            <div className="grid grid-cols-2 gap-3">
              {isPayer && (
                <RetroButton
                  onClick={() => onCancel(escrow.escrow_id)}
                  variant="secondary"
                >
                  CANCEL ESCROW
                </RetroButton>
              )}
              {(isPayer || isPayee) && (
                <RetroButton
                  onClick={() => onDispute(escrow.escrow_id)}
                  variant="secondary"
                >
                  OPEN DISPUTE
                </RetroButton>
              )}
            </div>
          )}

          <RetroButton onClick={onClose} variant="secondary" className="w-full">
            ← BACK TO LIST
          </RetroButton>
        </div>

        {/* User Role Info */}
        <InfoPanel variant="info">
          <div className="font-mono text-xs">
            &gt; YOUR ROLE: {isPayer ? 'PAYER' : isPayee ? 'PAYEE' : isAdditionalParty ? 'ADDITIONAL PARTY' : 'OBSERVER'}
            {(isApprover || isMultisigSigner) && (
              <div className="mt-1">
                {isApprover && '• You are an approver for this escrow'}
                {isMultisigSigner && '• You are a multisig signer for this escrow'}
              </div>
            )}
          </div>
        </InfoPanel>
      </div>

      {/* Sign Modal */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-cream-200 border-4 border-copper-500 max-w-md w-full p-6 space-y-4">
            <h3 className="font-mono text-lg font-bold text-text-primary">SIGN MULTISIG</h3>
            <input
              type="text"
              value={signatureInput}
              onChange={(e) => setSignatureInput(e.target.value)}
              placeholder="Enter your signature"
              className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <RetroButton
                onClick={() => {
                  setShowSignModal(false);
                  setSignatureInput('');
                }}
                variant="secondary"
                className="flex-1"
              >
                CANCEL
              </RetroButton>
              <RetroButton
                onClick={() => {
                  onSign(escrow.escrow_id, signatureInput);
                  setShowSignModal(false);
                  setSignatureInput('');
                }}
                variant="primary"
                className="flex-1"
                disabled={!signatureInput}
              >
                SIGN
              </RetroButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
