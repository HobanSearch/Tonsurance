import { useState } from 'react';
import { RetroButton, InfoPanel } from '../terminal';
import type { ReleaseCondition, EscrowType } from './CreateEscrowForm';

interface ConditionBuilderProps {
  conditions: ReleaseCondition[];
  onChange: (conditions: ReleaseCondition[]) => void;
  templateType: EscrowType;
}

export const ConditionBuilder = ({ conditions, onChange, templateType }: ConditionBuilderProps) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [selectedConditionType, setSelectedConditionType] = useState<string | null>(null);

  // Form states for each condition type
  const [oracleEndpoint, setOracleEndpoint] = useState('');
  const [oracleExpectedValue, setOracleExpectedValue] = useState('');
  const [timeElapsedSeconds, setTimeElapsedSeconds] = useState('604800'); // 7 days default
  const [approverAddress, setApproverAddress] = useState('');
  const [approvalDeadlineDays, setApprovalDeadlineDays] = useState('');
  const [chainEventChain, setChainEventChain] = useState('ethereum');
  const [chainEventType, setChainEventType] = useState('');
  const [chainEventContract, setChainEventContract] = useState('');
  const [multisigRequired, setMultisigRequired] = useState('2');
  const [multisigSigners, setMultisigSigners] = useState<string[]>(['', '', '']);

  const conditionTypes = {
    oracle: {
      name: 'Oracle Verification',
      icon: '🔮',
      description: 'External API endpoint verification',
      recommended: ['tradefin', 'milestone']
    },
    time_elapsed: {
      name: 'Time Lock',
      icon: '⏰',
      description: 'Release after specified time period',
      recommended: ['freelance', 'milestone', 'multi_party']
    },
    manual_approval: {
      name: 'Manual Approval',
      icon: '✍️',
      description: 'Requires approver signature',
      recommended: ['freelance', 'milestone']
    },
    chain_event: {
      name: 'Chain Event',
      icon: '⛓️',
      description: 'Blockchain event verification',
      recommended: ['real_estate']
    },
    multisig: {
      name: 'Multisig Approval',
      icon: '👥',
      description: 'Multiple signature requirement',
      recommended: ['tradefin', 'real_estate', 'multi_party']
    }
  };

  const handleAddCondition = () => {
    if (!selectedConditionType) return;

    let newCondition: ReleaseCondition | null = null;

    switch (selectedConditionType) {
      case 'oracle':
        if (oracleEndpoint && oracleExpectedValue) {
          newCondition = {
            type: 'oracle',
            oracle_endpoint: oracleEndpoint,
            expected_value: oracleExpectedValue,
            verified: false
          };
          setOracleEndpoint('');
          setOracleExpectedValue('');
        }
        break;

      case 'time_elapsed':
        if (timeElapsedSeconds) {
          newCondition = {
            type: 'time_elapsed',
            seconds: parseInt(timeElapsedSeconds),
            start_time: Date.now()
          };
          setTimeElapsedSeconds('604800');
        }
        break;

      case 'manual_approval':
        if (approverAddress) {
          const deadline = approvalDeadlineDays
            ? Date.now() + parseInt(approvalDeadlineDays) * 86400000
            : undefined;
          newCondition = {
            type: 'manual_approval',
            approver: approverAddress,
            approved: false,
            approval_deadline: deadline
          };
          setApproverAddress('');
          setApprovalDeadlineDays('');
        }
        break;

      case 'chain_event':
        if (chainEventType && chainEventContract) {
          newCondition = {
            type: 'chain_event',
            chain: chainEventChain,
            event_type: chainEventType,
            contract_address: chainEventContract,
            occurred: false
          };
          setChainEventType('');
          setChainEventContract('');
        }
        break;

      case 'multisig':
        const validSigners = multisigSigners.filter(s => s.trim() !== '');
        if (validSigners.length >= parseInt(multisigRequired)) {
          newCondition = {
            type: 'multisig',
            required_signatures: parseInt(multisigRequired),
            signers: validSigners,
            signatures_received: []
          };
          setMultisigSigners(['', '', '']);
        }
        break;
    }

    if (newCondition) {
      onChange([...conditions, newCondition]);
      setSelectedConditionType(null);
      setShowAddMenu(false);
    }
  };

  const handleRemoveCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const formatConditionDisplay = (condition: ReleaseCondition) => {
    switch (condition.type) {
      case 'oracle':
        return (
          <div>
            <div className="font-semibold">Oracle: {condition.oracle_endpoint}</div>
            <div className="text-xs text-text-tertiary">
              Expecting: "{condition.expected_value}"
            </div>
          </div>
        );

      case 'time_elapsed':
        const days = Math.floor(condition.seconds / 86400);
        const hours = Math.floor((condition.seconds % 86400) / 3600);
        return (
          <div>
            <div className="font-semibold">Time Lock: {days > 0 ? `${days}d ` : ''}{hours}h</div>
            <div className="text-xs text-text-tertiary">
              Must wait {condition.seconds / 86400} days from creation
            </div>
          </div>
        );

      case 'manual_approval':
        return (
          <div>
            <div className="font-semibold">Manual Approval Required</div>
            <div className="text-xs text-text-tertiary">
              Approver: {condition.approver.slice(0, 12)}...
              {condition.approval_deadline && ` (Deadline: ${new Date(condition.approval_deadline).toLocaleDateString()})`}
            </div>
          </div>
        );

      case 'chain_event':
        return (
          <div>
            <div className="font-semibold">Chain Event: {condition.event_type}</div>
            <div className="text-xs text-text-tertiary">
              {condition.chain} • {condition.contract_address.slice(0, 12)}...
            </div>
          </div>
        );

      case 'multisig':
        return (
          <div>
            <div className="font-semibold">
              Multisig: {condition.required_signatures} of {condition.signers.length}
            </div>
            <div className="text-xs text-text-tertiary">
              {condition.signers.length} signers required
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing Conditions */}
      {conditions.length > 0 ? (
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 border-2 border-cream-400 bg-cream-300/30"
            >
              <span className="text-2xl">
                {conditionTypes[condition.type].icon}
              </span>
              <div className="flex-1 font-mono text-sm text-text-primary">
                {formatConditionDisplay(condition)}
              </div>
              <RetroButton
                onClick={() => handleRemoveCondition(index)}
                variant="secondary"
              >
                ✕
              </RetroButton>
            </div>
          ))}
        </div>
      ) : (
        <InfoPanel variant="warning">
          <div className="font-mono text-xs">
            &gt; No conditions added yet. Add at least one release condition.
          </div>
        </InfoPanel>
      )}

      {/* Add Condition */}
      {!showAddMenu ? (
        <RetroButton
          onClick={() => setShowAddMenu(true)}
          variant="primary"
          className="w-full"
        >
          + ADD CONDITION
        </RetroButton>
      ) : (
        <div className="border-3 border-copper-500 p-4 space-y-4">
          {/* Condition Type Selection */}
          {!selectedConditionType ? (
            <>
              <h4 className="font-mono text-sm font-semibold text-text-secondary uppercase">
                Select Condition Type
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(conditionTypes).map(([key, type]) => {
                  const isRecommended = type.recommended.includes(templateType);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedConditionType(key)}
                      className="p-3 border-2 border-cream-400 hover:bg-cream-300 hover:border-copper-300 transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{type.icon}</span>
                        <div className="flex-1">
                          <div className="font-mono font-semibold text-sm text-text-primary">
                            {type.name}
                          </div>
                          <div className="text-xs text-text-tertiary">{type.description}</div>
                        </div>
                        {isRecommended && (
                          <span className="text-[9px] text-copper-500 border border-copper-500 px-2 py-0.5 font-mono font-bold">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Oracle Configuration */}
              {selectedConditionType === 'oracle' && (
                <div className="space-y-3">
                  <h4 className="font-mono text-sm font-semibold text-text-secondary uppercase">
                    🔮 Oracle Verification
                  </h4>
                  <input
                    type="text"
                    value={oracleEndpoint}
                    onChange={(e) => setOracleEndpoint(e.target.value)}
                    placeholder="https://api.example.com/status"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={oracleExpectedValue}
                    onChange={(e) => setOracleExpectedValue(e.target.value)}
                    placeholder="Expected value (e.g., 'completed')"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Time Elapsed Configuration */}
              {selectedConditionType === 'time_elapsed' && (
                <div className="space-y-3">
                  <h4 className="font-mono text-sm font-semibold text-text-secondary uppercase">
                    ⏰ Time Lock
                  </h4>
                  <input
                    type="number"
                    value={timeElapsedSeconds}
                    onChange={(e) => setTimeElapsedSeconds(e.target.value)}
                    placeholder="Seconds (e.g., 604800 = 7 days)"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    {['86400', '604800', '2592000'].map(preset => {
                      const label = preset === '86400' ? '1d' : preset === '604800' ? '7d' : '30d';
                      return (
                        <RetroButton
                          key={preset}
                          onClick={() => setTimeElapsedSeconds(preset)}
                          variant={timeElapsedSeconds === preset ? 'primary' : 'secondary'}
                        >
                          {label}
                        </RetroButton>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manual Approval Configuration */}
              {selectedConditionType === 'manual_approval' && (
                <div className="space-y-3">
                  <h4 className="font-mono text-sm font-semibold text-text-secondary uppercase">
                    ✍️ Manual Approval
                  </h4>
                  <input
                    type="text"
                    value={approverAddress}
                    onChange={(e) => setApproverAddress(e.target.value)}
                    placeholder="Approver Address (EQD...)"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={approvalDeadlineDays}
                    onChange={(e) => setApprovalDeadlineDays(e.target.value)}
                    placeholder="Approval Deadline (days, optional)"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Chain Event Configuration */}
              {selectedConditionType === 'chain_event' && (
                <div className="space-y-3">
                  <h4 className="font-mono text-sm font-semibold text-text-secondary uppercase">
                    ⛓️ Chain Event
                  </h4>
                  <select
                    value={chainEventChain}
                    onChange={(e) => setChainEventChain(e.target.value)}
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  >
                    <option value="ethereum">Ethereum</option>
                    <option value="ton">TON</option>
                    <option value="arbitrum">Arbitrum</option>
                    <option value="base">Base</option>
                  </select>
                  <input
                    type="text"
                    value={chainEventType}
                    onChange={(e) => setChainEventType(e.target.value)}
                    placeholder="Event Type (e.g., 'Transfer', 'Approval')"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={chainEventContract}
                    onChange={(e) => setChainEventContract(e.target.value)}
                    placeholder="Contract Address"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Multisig Configuration */}
              {selectedConditionType === 'multisig' && (
                <div className="space-y-3">
                  <h4 className="font-mono text-sm font-semibold text-text-secondary uppercase">
                    👥 Multisig Approval
                  </h4>
                  <input
                    type="number"
                    value={multisigRequired}
                    onChange={(e) => setMultisigRequired(e.target.value)}
                    placeholder="Required Signatures"
                    className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  {multisigSigners.map((signer, index) => (
                    <input
                      key={index}
                      type="text"
                      value={signer}
                      onChange={(e) => {
                        const updated = [...multisigSigners];
                        updated[index] = e.target.value;
                        setMultisigSigners(updated);
                      }}
                      placeholder={`Signer ${index + 1} Address`}
                      className="w-full bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                    />
                  ))}
                  <RetroButton
                    onClick={() => setMultisigSigners([...multisigSigners, ''])}
                    variant="secondary"
                    className="w-full"
                  >
                    + ADD SIGNER
                  </RetroButton>
                </div>
              )}

              <div className="flex gap-2">
                <RetroButton
                  onClick={() => {
                    setSelectedConditionType(null);
                    setShowAddMenu(false);
                  }}
                  variant="secondary"
                  className="flex-1"
                >
                  CANCEL
                </RetroButton>
                <RetroButton
                  onClick={handleAddCondition}
                  variant="primary"
                  className="flex-1"
                >
                  ADD
                </RetroButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
