import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { TerminalWindow, RetroButton, InfoPanel } from '../components/terminal';
import { CreateEscrowForm } from '../components/escrow/CreateEscrowForm';
import { EscrowDetails } from '../components/escrow/EscrowDetails';

// Types matching backend escrow_engine.ml
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
  amount: number; // USD cents
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

// Mock data for development
const mockEscrows: EscrowContract[] = [
  {
    escrow_id: 1001,
    payer: 'EQD...abc123',
    payee: 'EQD...xyz789',
    amount: 500000, // $5,000.00
    asset: 'TON',
    created_at: Date.now() - 86400000 * 2, // 2 days ago
    release_conditions: [
      { type: 'time_elapsed', seconds: 604800, start_time: Date.now() - 86400000 * 2 }, // 7 days
      { type: 'manual_approval', approver: 'EQD...xyz789', approved: false }
    ],
    timeout_action: 'return_to_payer',
    timeout_seconds: 2592000, // 30 days
    additional_parties: [],
    status: 'active',
    conditions_met: 0,
    protection_enabled: true,
    coverage_type: 'smart_contract',
    coverage_premium: 32.88, // $5000 * 0.008 * (30/365)
    escrow_type: 'freelance'
  },
  {
    escrow_id: 1002,
    payer: 'EQD...def456',
    payee: 'EQD...uvw321',
    amount: 2500000, // $25,000.00
    asset: 'USDT',
    created_at: Date.now() - 86400000 * 10, // 10 days ago
    release_conditions: [
      { type: 'multisig', required_signatures: 2, signers: ['EQD...sig1', 'EQD...sig2', 'EQD...sig3'], signatures_received: [['EQD...sig1', '0xabc...']] }
    ],
    timeout_action: { split: 0.5 },
    timeout_seconds: 5184000, // 60 days
    additional_parties: [
      { party_address: 'EQD...party1', allocation_percentage: 10 }
    ],
    status: 'active',
    conditions_met: 0,
    protection_enabled: false,
    escrow_type: 'tradefin'
  },
  {
    escrow_id: 1003,
    payer: 'EQD...ghi789',
    payee: 'EQD...rst654',
    amount: 1000000, // $10,000.00
    asset: 'TON',
    created_at: Date.now() - 86400000 * 15, // 15 days ago
    release_conditions: [
      { type: 'oracle', oracle_endpoint: 'https://api.example.com/delivery', expected_value: 'completed', verified: true, last_check: Date.now() - 3600000 }
    ],
    timeout_action: 'release_to_payee',
    timeout_seconds: 1814400, // 21 days
    additional_parties: [],
    status: 'conditions_met',
    conditions_met: 1,
    protection_enabled: false,
    escrow_type: 'milestone'
  }
];

export const Escrow = () => {
  const userAddress = useTonAddress();
  const [escrows, setEscrows] = useState<EscrowContract[]>(mockEscrows);
  const [selectedView, setSelectedView] = useState<'all' | 'as_payer' | 'as_payee'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | EscrowStatus>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowContract | null>(null);

  // Filter escrows based on user role and status
  const filteredEscrows = escrows.filter(escrow => {
    const roleMatch = selectedView === 'all' ||
      (selectedView === 'as_payer' && escrow.payer === userAddress) ||
      (selectedView === 'as_payee' && escrow.payee === userAddress);

    const statusMatch = selectedStatus === 'all' || escrow.status === selectedStatus;

    return roleMatch && statusMatch;
  });

  // Calculate stats
  const totalValueLocked = escrows
    .filter(e => e.status === 'active' || e.status === 'conditions_met')
    .reduce((sum, e) => sum + e.amount, 0) / 100;

  const activeCount = escrows.filter(e => e.status === 'active').length;
  const completedCount = escrows.filter(e => e.status === 'released').length;

  const getStatusBadge = (status: EscrowStatus) => {
    const styles = {
      active: 'bg-terminal-green/10 text-terminal-green border-terminal-green',
      conditions_met: 'bg-copper-500/10 text-copper-500 border-copper-500',
      released: 'bg-terminal-green/20 text-terminal-green border-terminal-green',
      disputed: 'bg-terminal-red/10 text-terminal-red border-terminal-red',
      cancelled: 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary',
      timed_out: 'bg-terminal-red/10 text-terminal-red border-terminal-red'
    };

    const labels = {
      active: 'ACTIVE',
      conditions_met: 'READY',
      released: 'RELEASED',
      disputed: 'DISPUTED',
      cancelled: 'CANCELLED',
      timed_out: 'TIMED OUT'
    };

    return (
      <span className={`px-2 py-1 border-2 text-[10px] font-mono font-bold ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getEscrowTypeLabel = (type: EscrowType) => {
    const labels = {
      freelance: 'FREELANCE',
      tradefin: 'TRADE FINANCE',
      milestone: 'MILESTONE',
      real_estate: 'REAL ESTATE',
      multi_party: 'MULTI-PARTY'
    };
    return labels[type];
  };

  const formatTimeRemaining = (createdAt: number, timeoutSeconds: number) => {
    const timeoutAt = createdAt + timeoutSeconds * 1000;
    const remaining = timeoutAt - Date.now();

    if (remaining <= 0) return 'EXPIRED';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getConditionProgress = (escrow: EscrowContract) => {
    const total = escrow.release_conditions.length;
    let met = 0;

    escrow.release_conditions.forEach(condition => {
      if (condition.type === 'oracle' && condition.verified) met++;
      else if (condition.type === 'time_elapsed' && Date.now() >= condition.start_time + condition.seconds * 1000) met++;
      else if (condition.type === 'manual_approval' && condition.approved) met++;
      else if (condition.type === 'chain_event' && condition.occurred) met++;
      else if (condition.type === 'multisig' && condition.signatures_received.length >= condition.required_signatures) met++;
    });

    return { met, total };
  };

  // Escrow action handlers
  const handleCreateEscrow = (escrowData: any) => {
    const newEscrow: EscrowContract = {
      escrow_id: Math.max(...escrows.map(e => e.escrow_id)) + 1,
      ...escrowData,
      status: 'active' as EscrowStatus,
      conditions_met: 0
    };

    setEscrows([...escrows, newEscrow]);
    setShowCreateForm(false);
    alert(`Escrow #${newEscrow.escrow_id} created successfully!\n\nIn production, this will call the smart contract.`);
  };

  const handleReleaseEscrow = (escrowId: number) => {
    setEscrows(escrows.map(e =>
      e.escrow_id === escrowId
        ? { ...e, status: 'released' as EscrowStatus, released_at: Date.now() }
        : e
    ));
    setSelectedEscrow(null);
    alert(`Escrow #${escrowId} released! Funds transferred to payee.`);
  };

  const handleCancelEscrow = (escrowId: number) => {
    if (confirm('Are you sure you want to cancel this escrow? Funds will be returned to payer.')) {
      setEscrows(escrows.map(e =>
        e.escrow_id === escrowId
          ? { ...e, status: 'cancelled' as EscrowStatus }
          : e
      ));
      setSelectedEscrow(null);
      alert(`Escrow #${escrowId} cancelled. Funds returned to payer.`);
    }
  };

  const handleDisputeEscrow = (escrowId: number) => {
    if (confirm('Opening a dispute will freeze the escrow and notify arbitrators. Continue?')) {
      setEscrows(escrows.map(e =>
        e.escrow_id === escrowId
          ? { ...e, status: 'disputed' as EscrowStatus }
          : e
      ));
      setSelectedEscrow(null);
      alert(`Dispute opened for Escrow #${escrowId}. Arbitrators have been notified.`);
    }
  };

  const handleApproveEscrow = (escrowId: number) => {
    setEscrows(escrows.map(e => {
      if (e.escrow_id === escrowId) {
        const updatedConditions = e.release_conditions.map(c => {
          if (c.type === 'manual_approval' && c.approver === userAddress) {
            return { ...c, approved: true, signature: '0x' + Math.random().toString(16).slice(2, 18) };
          }
          return c;
        });

        const progress = getConditionProgress({ ...e, release_conditions: updatedConditions });
        const newStatus = progress.met === progress.total ? 'conditions_met' as EscrowStatus : e.status;

        return {
          ...e,
          release_conditions: updatedConditions,
          status: newStatus,
          conditions_met: progress.met
        };
      }
      return e;
    }));

    if (selectedEscrow && selectedEscrow.escrow_id === escrowId) {
      const updated = escrows.find(e => e.escrow_id === escrowId);
      if (updated) setSelectedEscrow(updated);
    }

    alert('Approval signature submitted successfully!');
  };

  const handleSignEscrow = (escrowId: number, signature: string) => {
    setEscrows(escrows.map(e => {
      if (e.escrow_id === escrowId) {
        const updatedConditions = e.release_conditions.map(c => {
          if (c.type === 'multisig' && c.signers.includes(userAddress)) {
            const hasAlreadySigned = c.signatures_received.some(([addr]) => addr === userAddress);
            if (!hasAlreadySigned) {
              return {
                ...c,
                signatures_received: [...c.signatures_received, [userAddress, signature] as [string, string]]
              };
            }
          }
          return c;
        });

        const progress = getConditionProgress({ ...e, release_conditions: updatedConditions });
        const newStatus = progress.met === progress.total ? 'conditions_met' as EscrowStatus : e.status;

        return {
          ...e,
          release_conditions: updatedConditions,
          status: newStatus,
          conditions_met: progress.met
        };
      }
      return e;
    }));

    if (selectedEscrow && selectedEscrow.escrow_id === escrowId) {
      const updated = escrows.find(e => e.escrow_id === escrowId);
      if (updated) setSelectedEscrow(updated);
    }

    alert('Multisig signature submitted successfully!');
  };

  // Show detailed view if escrow is selected
  if (selectedEscrow) {
    return (
      <EscrowDetails
        escrow={selectedEscrow}
        userAddress={userAddress || ''}
        onClose={() => setSelectedEscrow(null)}
        onRelease={handleReleaseEscrow}
        onCancel={handleCancelEscrow}
        onDispute={handleDisputeEscrow}
        onApprove={handleApproveEscrow}
        onSign={handleSignEscrow}
      />
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <TerminalWindow title="ESCROW_MANAGER.EXE">
        <div className="font-mono text-sm text-text-secondary">
          &gt; Trustless escrow with programmable release conditions
          <div className="mt-2 text-xs">
            Create escrows with oracle verification, time locks, manual approvals, chain events, and multisig releases.
          </div>
        </div>
      </TerminalWindow>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TerminalWindow title="TOTAL_VALUE_LOCKED">
          <div className="font-mono">
            <div className="text-3xl font-bold text-terminal-green">
              ${totalValueLocked.toLocaleString()}
            </div>
            <div className="text-xs text-text-tertiary mt-1">Across all active escrows</div>
          </div>
        </TerminalWindow>

        <TerminalWindow title="ACTIVE_ESCROWS">
          <div className="font-mono">
            <div className="text-3xl font-bold text-copper-500">{activeCount}</div>
            <div className="text-xs text-text-tertiary mt-1">Awaiting conditions</div>
          </div>
        </TerminalWindow>

        <TerminalWindow title="COMPLETED">
          <div className="font-mono">
            <div className="text-3xl font-bold text-text-primary">{completedCount}</div>
            <div className="text-xs text-text-tertiary mt-1">Successfully released</div>
          </div>
        </TerminalWindow>
      </div>

      {/* Filters */}
      <TerminalWindow title="FILTERS">
        <div className="space-y-4">
          <div>
            <h3 className="text-text-secondary font-mono text-xs font-semibold mb-2 uppercase">View As</h3>
            <div className="flex gap-2">
              <RetroButton
                onClick={() => setSelectedView('all')}
                variant={selectedView === 'all' ? 'primary' : 'secondary'}
              >
                ALL
              </RetroButton>
              <RetroButton
                onClick={() => setSelectedView('as_payer')}
                variant={selectedView === 'as_payer' ? 'primary' : 'secondary'}
              >
                AS PAYER
              </RetroButton>
              <RetroButton
                onClick={() => setSelectedView('as_payee')}
                variant={selectedView === 'as_payee' ? 'primary' : 'secondary'}
              >
                AS PAYEE
              </RetroButton>
            </div>
          </div>

          <div>
            <h3 className="text-text-secondary font-mono text-xs font-semibold mb-2 uppercase">Status</h3>
            <div className="flex gap-2 flex-wrap">
              <RetroButton
                onClick={() => setSelectedStatus('all')}
                variant={selectedStatus === 'all' ? 'primary' : 'secondary'}
              >
                ALL
              </RetroButton>
              <RetroButton
                onClick={() => setSelectedStatus('active')}
                variant={selectedStatus === 'active' ? 'primary' : 'secondary'}
              >
                ACTIVE
              </RetroButton>
              <RetroButton
                onClick={() => setSelectedStatus('conditions_met')}
                variant={selectedStatus === 'conditions_met' ? 'primary' : 'secondary'}
              >
                READY
              </RetroButton>
              <RetroButton
                onClick={() => setSelectedStatus('released')}
                variant={selectedStatus === 'released' ? 'primary' : 'secondary'}
              >
                RELEASED
              </RetroButton>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Create Button */}
      <RetroButton
        onClick={() => setShowCreateForm(!showCreateForm)}
        variant="primary"
        className="w-full py-4 text-lg"
      >
        {showCreateForm ? 'CANCEL' : '+ CREATE NEW ESCROW'}
      </RetroButton>

      {/* Create Form */}
      {showCreateForm && (
        <TerminalWindow title="CREATE_ESCROW">
          <CreateEscrowForm
            onSubmit={handleCreateEscrow}
            onCancel={() => setShowCreateForm(false)}
            userAddress={userAddress || ''}
          />
        </TerminalWindow>
      )}

      {/* Escrow List */}
      <TerminalWindow title={`ESCROWS (${filteredEscrows.length})`}>
        {filteredEscrows.length === 0 ? (
          <InfoPanel variant="info">
            <div className="font-mono text-sm">
              &gt; No escrows found matching your filters
            </div>
          </InfoPanel>
        ) : (
          <div className="space-y-4">
            {filteredEscrows.map(escrow => {
              const progress = getConditionProgress(escrow);
              const progressPercent = (progress.met / progress.total) * 100;

              return (
                <div
                  key={escrow.escrow_id}
                  onClick={() => setSelectedEscrow(escrow)}
                  className="border-3 border-cream-400 bg-cream-300/30 p-4 hover:bg-cream-300/50 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {escrow.escrow_type === 'freelance' && '💼'}
                        {escrow.escrow_type === 'tradefin' && '🚢'}
                        {escrow.escrow_type === 'milestone' && '🎯'}
                        {escrow.escrow_type === 'real_estate' && '🏠'}
                        {escrow.escrow_type === 'multi_party' && '👥'}
                      </span>
                      <div>
                        <div className="font-mono font-semibold text-text-primary">
                          Escrow #{escrow.escrow_id}
                        </div>
                        <div className="text-xs text-text-tertiary font-mono">
                          {getEscrowTypeLabel(escrow.escrow_type)}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(escrow.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3 text-xs font-mono">
                    <div>
                      <div className="text-text-tertiary">Amount</div>
                      <div className="text-terminal-green font-semibold text-lg">
                        ${(escrow.amount / 100).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-text-tertiary">Timeout</div>
                      <div className="text-text-primary font-semibold">
                        {formatTimeRemaining(escrow.created_at, escrow.timeout_seconds)}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-text-tertiary">Conditions Met</span>
                      <span className="text-text-secondary font-semibold">
                        {progress.met}/{progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-cream-400 h-2">
                      <div
                        className="bg-copper-500 h-2 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary">
                    <span>Payer: {escrow.payer.slice(0, 8)}...</span>
                    <span>→</span>
                    <span>Payee: {escrow.payee.slice(0, 8)}...</span>
                    {escrow.protection_enabled && (
                      <span className="ml-auto text-copper-500 font-semibold">🛡️ PROTECTED</span>
                    )}
                  </div>

                  {escrow.status === 'conditions_met' && (
                    <RetroButton
                      variant="primary"
                      className="w-full mt-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEscrow(escrow);
                      }}
                    >
                      VIEW & RELEASE →
                    </RetroButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </TerminalWindow>

      {!userAddress && (
        <InfoPanel variant="warning">
          Please connect your TON wallet to create and manage escrows
        </InfoPanel>
      )}
    </div>
  );
};
