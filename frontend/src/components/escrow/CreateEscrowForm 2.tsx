import { useState, useEffect } from 'react';
import { RetroButton, InfoPanel } from '../terminal';
import { ConditionBuilder } from './ConditionBuilder';

export type EscrowType = 'freelance' | 'tradefin' | 'milestone' | 'real_estate' | 'multi_party';
export type TimeoutAction = 'release_to_payee' | 'return_to_payer' | { split: number };

export type ReleaseCondition =
  | { type: 'oracle'; oracle_endpoint: string; expected_value: string; verified: boolean; last_check?: number }
  | { type: 'time_elapsed'; seconds: number; start_time: number }
  | { type: 'manual_approval'; approver: string; approved: boolean; approval_deadline?: number; signature?: string }
  | { type: 'chain_event'; chain: string; event_type: string; contract_address: string; occurred: boolean; verified_at?: number }
  | { type: 'multisig'; required_signatures: number; signers: string[]; signatures_received: Array<[string, string]> };

interface PartyAllocation {
  party_address: string;
  allocation_percentage: number;
}

interface CreateEscrowFormProps {
  onSubmit: (escrowData: any) => void;
  onCancel: () => void;
  userAddress: string;
}

const escrowTemplates = {
  freelance: {
    name: 'Freelance Work',
    icon: '💼',
    description: 'Payment for services with deliverable verification',
    defaultConditions: ['time_elapsed', 'manual_approval'] as const,
    defaultTimeout: 2592000, // 30 days
    defaultTimeoutAction: 'return_to_payer' as const
  },
  tradefin: {
    name: 'Trade Finance',
    icon: '🚢',
    description: 'International trade with shipping verification',
    defaultConditions: ['oracle', 'multisig'] as const,
    defaultTimeout: 5184000, // 60 days
    defaultTimeoutAction: { split: 0.5 } as const
  },
  milestone: {
    name: 'Milestone Payments',
    icon: '🎯',
    description: 'Release funds based on project milestones',
    defaultConditions: ['oracle', 'manual_approval'] as const,
    defaultTimeout: 1814400, // 21 days
    defaultTimeoutAction: 'release_to_payee' as const
  },
  real_estate: {
    name: 'Real Estate',
    icon: '🏠',
    description: 'Property transactions with chain event verification',
    defaultConditions: ['chain_event', 'multisig'] as const,
    defaultTimeout: 7776000, // 90 days
    defaultTimeoutAction: 'return_to_payer' as const
  },
  multi_party: {
    name: 'Multi-Party Agreement',
    icon: '👥',
    description: 'Complex agreements with multiple beneficiaries',
    defaultConditions: ['multisig', 'time_elapsed'] as const,
    defaultTimeout: 2592000, // 30 days
    defaultTimeoutAction: { split: 0.5 } as const
  }
};

export const CreateEscrowForm = ({ onSubmit, onCancel, userAddress }: CreateEscrowFormProps) => {
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<EscrowType | null>(null);

  // Form data
  const [payeeAddress, setPayeeAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('TON');
  const [releaseConditions, setReleaseConditions] = useState<ReleaseCondition[]>([]);
  const [timeoutDays, setTimeoutDays] = useState('30');
  const [timeoutAction, setTimeoutAction] = useState<TimeoutAction>('return_to_payer');
  const [additionalParties, setAdditionalParties] = useState<PartyAllocation[]>([]);
  const [protectionEnabled, setProtectionEnabled] = useState(false);
  const [coverageType, setCoverageType] = useState<'smart_contract' | 'timeout' | 'comprehensive'>('smart_contract');
  const [coveragePremium, setCoveragePremium] = useState(0);

  const handleTemplateSelect = (template: EscrowType) => {
    setSelectedTemplate(template);
    const templateData = escrowTemplates[template];

    // Set default timeout
    setTimeoutDays(Math.floor(templateData.defaultTimeout / 86400).toString());
    setTimeoutAction(templateData.defaultTimeoutAction);

    setStep(2);
  };

  const handleAddParty = () => {
    setAdditionalParties([...additionalParties, { party_address: '', allocation_percentage: 0 }]);
  };

  const handleRemoveParty = (index: number) => {
    setAdditionalParties(additionalParties.filter((_, i) => i !== index));
  };

  const handleUpdateParty = (index: number, field: 'party_address' | 'allocation_percentage', value: string | number) => {
    const updated = [...additionalParties];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalParties(updated);
  };

  const getTotalAllocation = () => {
    const additionalAllocation = additionalParties.reduce((sum, p) => sum + p.allocation_percentage, 0);
    return 100 - additionalAllocation;
  };

  // Calculate coverage premium based on escrow amount and coverage type
  useEffect(() => {
    if (!amount || parseFloat(amount) === 0) {
      setCoveragePremium(0);
      return;
    }

    const escrowAmount = parseFloat(amount);
    const days = parseInt(timeoutDays) || 30;

    // Base rates (APR)
    const rates = {
      smart_contract: 0.008, // 0.8% APR - covers contract exploits
      timeout: 0.005,        // 0.5% APR - covers timeout disputes
      comprehensive: 0.012   // 1.2% APR - covers both + oracle failures
    };

    const baseRate = rates[coverageType];
    const premium = escrowAmount * baseRate * (days / 365);

    setCoveragePremium(premium);
  }, [amount, timeoutDays, coverageType]);

  const handleSubmit = () => {
    const escrowData = {
      escrow_type: selectedTemplate,
      payer: userAddress,
      payee: payeeAddress,
      amount: parseFloat(amount) * 100, // Convert to cents
      asset,
      release_conditions: releaseConditions,
      timeout_seconds: parseInt(timeoutDays) * 86400,
      timeout_action: timeoutAction,
      additional_parties: additionalParties,
      protection_enabled: protectionEnabled,
      coverage_type: protectionEnabled ? coverageType : null,
      coverage_premium: protectionEnabled ? coveragePremium : 0,
      created_at: Date.now()
    };

    onSubmit(escrowData);
  };

  const canProceedToStep2 = selectedTemplate !== null;
  const canProceedToStep3 = payeeAddress && amount && parseFloat(amount) > 0;
  const canProceedToStep4 = releaseConditions.length > 0;
  const canSubmit = getTotalAllocation() >= 0 && getTotalAllocation() <= 100;

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center gap-2 font-mono text-xs">
        <div className={`px-3 py-1 border-2 ${step >= 1 ? 'border-copper-500 bg-copper-50 text-copper-500' : 'border-cream-400 text-text-tertiary'}`}>
          STEP 1
        </div>
        <div className="flex-1 border-t-2 border-cream-400" />
        <div className={`px-3 py-1 border-2 ${step >= 2 ? 'border-copper-500 bg-copper-50 text-copper-500' : 'border-cream-400 text-text-tertiary'}`}>
          STEP 2
        </div>
        <div className="flex-1 border-t-2 border-cream-400" />
        <div className={`px-3 py-1 border-2 ${step >= 3 ? 'border-copper-500 bg-copper-50 text-copper-500' : 'border-cream-400 text-text-tertiary'}`}>
          STEP 3
        </div>
        <div className="flex-1 border-t-2 border-cream-400" />
        <div className={`px-3 py-1 border-2 ${step >= 4 ? 'border-copper-500 bg-copper-50 text-copper-500' : 'border-cream-400 text-text-tertiary'}`}>
          STEP 4
        </div>
      </div>

      {/* Step 1: Template Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-text-secondary font-mono text-sm font-semibold uppercase">
            Select Escrow Template
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(escrowTemplates).map(([key, template]) => (
              <button
                key={key}
                onClick={() => handleTemplateSelect(key as EscrowType)}
                className={`p-4 border-3 text-left transition-all ${
                  selectedTemplate === key
                    ? 'border-copper-500 bg-copper-50'
                    : 'border-cream-400 hover:bg-cream-300 hover:border-copper-300'
                }`}
              >
                <div className="flex items-start gap-3 mb-2">
                  <span className="text-2xl">{template.icon}</span>
                  <div>
                    <div className="font-mono font-semibold text-text-primary">{template.name}</div>
                    <div className="text-xs text-text-tertiary mt-1">{template.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <RetroButton onClick={onCancel} variant="secondary" className="flex-1">
              CANCEL
            </RetroButton>
            <RetroButton
              onClick={() => setStep(2)}
              variant="primary"
              className="flex-1"
              disabled={!canProceedToStep2}
            >
              NEXT →
            </RetroButton>
          </div>
        </div>
      )}

      {/* Step 2: Basic Details */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-text-secondary font-mono text-sm font-semibold uppercase">
            Escrow Details
          </h3>

          <div>
            <label className="text-text-secondary font-mono text-xs font-semibold mb-2 block uppercase">
              Payee Address
            </label>
            <input
              type="text"
              value={payeeAddress}
              onChange={(e) => setPayeeAddress(e.target.value)}
              placeholder="EQD..."
              className="w-full bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-secondary font-mono text-xs font-semibold mb-2 block uppercase">
              Amount (USD)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
              className="w-full bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-secondary font-mono text-xs font-semibold mb-2 block uppercase">
              Asset
            </label>
            <div className="flex gap-2">
              {['TON', 'USDT', 'USDC'].map((assetOption) => (
                <RetroButton
                  key={assetOption}
                  onClick={() => setAsset(assetOption)}
                  variant={asset === assetOption ? 'primary' : 'secondary'}
                >
                  {assetOption}
                </RetroButton>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <RetroButton onClick={() => setStep(1)} variant="secondary" className="flex-1">
              ← BACK
            </RetroButton>
            <RetroButton
              onClick={() => setStep(3)}
              variant="primary"
              className="flex-1"
              disabled={!canProceedToStep3}
            >
              NEXT →
            </RetroButton>
          </div>
        </div>
      )}

      {/* Step 3: Release Conditions */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-text-secondary font-mono text-sm font-semibold uppercase">
            Release Conditions
          </h3>

          <ConditionBuilder
            conditions={releaseConditions}
            onChange={setReleaseConditions}
            templateType={selectedTemplate!}
          />

          <InfoPanel variant="info">
            <div className="font-mono text-xs">
              &gt; All conditions must be met for escrow to be released
            </div>
          </InfoPanel>

          <div className="flex gap-3">
            <RetroButton onClick={() => setStep(2)} variant="secondary" className="flex-1">
              ← BACK
            </RetroButton>
            <RetroButton
              onClick={() => setStep(4)}
              variant="primary"
              className="flex-1"
              disabled={!canProceedToStep4}
            >
              NEXT →
            </RetroButton>
          </div>
        </div>
      )}

      {/* Step 4: Timeout & Additional Settings */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-text-secondary font-mono text-sm font-semibold uppercase">
            Timeout & Additional Settings
          </h3>

          <div>
            <label className="text-text-secondary font-mono text-xs font-semibold mb-2 block uppercase">
              Timeout (Days)
            </label>
            <input
              type="number"
              value={timeoutDays}
              onChange={(e) => setTimeoutDays(e.target.value)}
              className="w-full bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-secondary font-mono text-xs font-semibold mb-2 block uppercase">
              Timeout Action
            </label>
            <div className="flex gap-2 flex-wrap">
              <RetroButton
                onClick={() => setTimeoutAction('return_to_payer')}
                variant={timeoutAction === 'return_to_payer' ? 'primary' : 'secondary'}
              >
                RETURN TO PAYER
              </RetroButton>
              <RetroButton
                onClick={() => setTimeoutAction('release_to_payee')}
                variant={timeoutAction === 'release_to_payee' ? 'primary' : 'secondary'}
              >
                RELEASE TO PAYEE
              </RetroButton>
              <RetroButton
                onClick={() => setTimeoutAction({ split: 0.5 })}
                variant={typeof timeoutAction === 'object' ? 'primary' : 'secondary'}
              >
                SPLIT 50/50
              </RetroButton>
            </div>
          </div>

          {/* Additional Parties */}
          {selectedTemplate === 'multi_party' && (
            <div>
              <label className="text-text-secondary font-mono text-xs font-semibold mb-2 block uppercase">
                Additional Parties
              </label>
              {additionalParties.map((party, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={party.party_address}
                    onChange={(e) => handleUpdateParty(index, 'party_address', e.target.value)}
                    placeholder="Party Address"
                    className="flex-1 bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={party.allocation_percentage}
                    onChange={(e) => handleUpdateParty(index, 'allocation_percentage', parseFloat(e.target.value) || 0)}
                    placeholder="%"
                    className="w-20 bg-cream-300/50 border border-cream-400 px-3 py-2 text-text-primary font-mono text-sm focus:border-copper-500 focus:outline-none"
                  />
                  <RetroButton onClick={() => handleRemoveParty(index)} variant="secondary">
                    ✕
                  </RetroButton>
                </div>
              ))}
              <RetroButton onClick={handleAddParty} variant="secondary" className="w-full">
                + ADD PARTY
              </RetroButton>
              <div className="text-xs font-mono text-text-tertiary mt-2">
                Payee receives: {getTotalAllocation()}%
              </div>
            </div>
          )}

          {/* Protection Coverage */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={protectionEnabled}
                onChange={(e) => setProtectionEnabled(e.target.checked)}
                className="w-5 h-5 border-2 border-cream-400"
              />
              <div>
                <div className="text-text-secondary font-mono text-sm font-semibold">
                  🛡️ Enable Protection Coverage
                </div>
                <div className="text-xs text-text-tertiary">
                  Insure escrow value against smart contract exploits
                </div>
              </div>
            </label>
          </div>

          <div className="flex gap-3">
            <RetroButton onClick={() => setStep(3)} variant="secondary" className="flex-1">
              ← BACK
            </RetroButton>
            <RetroButton
              onClick={handleSubmit}
              variant="primary"
              className="flex-1"
              disabled={!canSubmit}
            >
              CREATE ESCROW
            </RetroButton>
          </div>
        </div>
      )}
    </div>
  );
};
