import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, RetroButton, InfoPanel } from '../components/terminal';
import { BeneficiarySelector } from '../components/BeneficiarySelector';
import type { Blockchain, Stablecoin } from '../components/ChainSelector';
import { ChainSelector } from '../components/ChainSelector';
import { BridgeHealthIndicator } from '../components/BridgeHealthIndicator';

type CoverageType = 'depeg' | 'smart_contract' | 'oracle' | 'bridge';

interface PremiumQuote {
  baseAmount: number;
  bridgeRiskAdjustment: number;
  hedgeCosts: {
    polymarket: number;
    perpetuals: number;
    allianz: number;
  };
  totalPremium: number;
  apr: number;
  bridgeRiskMultiplier: number;
  estimatedSavings: number;
}

export const MultiChainInsurance = () => {
  const userAddress = useTonAddress();
  const { contracts, sender } = useContracts();

  // Chain and asset selection
  const [selectedChain, setSelectedChain] = useState<Blockchain>('ethereum');
  const [selectedStablecoin, setSelectedStablecoin] = useState<Stablecoin>('USDC');

  // Coverage configuration
  const [selectedCoverageTypes, setSelectedCoverageTypes] = useState<CoverageType[]>(['depeg', 'bridge']);
  const [coverageAmount, setCoverageAmount] = useState<string>('10000');
  const [durationDays, setDurationDays] = useState<string>('30');

  // Premium quote
  const [quote, setQuote] = useState<PremiumQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  // Beneficiary
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string | null>(null);
  const [beneficiaryMode, setBeneficiaryMode] = useState<'self' | 'other'>('self');
  const [giftMessage, setGiftMessage] = useState<string>('');

  const coverageTypes = {
    depeg: {
      name: 'STABLECOIN_DEPEG',
      description: `Protection against ${selectedStablecoin} depegging below $0.95`,
      icon: '💵',
      recommended: true
    },
    smart_contract: {
      name: 'CONTRACT_EXPLOIT',
      description: 'Coverage for verified contract exploits',
      icon: '⚠️',
      recommended: false
    },
    oracle: {
      name: 'ORACLE_FAILURE',
      description: 'Protection against oracle manipulation',
      icon: '🔮',
      recommended: false
    },
    bridge: {
      name: 'BRIDGE_HACK',
      description: `Coverage for ${selectedChain}→TON bridge exploits`,
      icon: '🌉',
      recommended: selectedChain !== 'ton'
    }
  };

  const toggleCoverageType = (type: CoverageType) => {
    setSelectedCoverageTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  // Auto-select bridge coverage when chain changes (except TON)
  useEffect(() => {
    if (selectedChain !== 'ton' && !selectedCoverageTypes.includes('bridge')) {
      setSelectedCoverageTypes(prev => [...prev, 'bridge']);
    }
  }, [selectedChain]);

  const calculatePremium = async () => {
    const amount = parseFloat(coverageAmount) || 0;
    const days = parseFloat(durationDays) || 0;

    if (amount === 0 || days === 0 || selectedCoverageTypes.length === 0) {
      setQuote(null);
      return;
    }

    setIsCalculating(true);

    try {
      // In production: Fetch from OCaml backend
      // GET /api/v1/premium/multi-chain-quote

      // Mock calculation for now
      const baseAPR = 0.008; // 0.8% APR
      const basePremium = amount * baseAPR * (days / 365);

      // Bridge risk multiplier (from BridgeHealthKeeper)
      const bridgeRiskMultiplier = selectedChain === 'ton' ? 1.0 :
        selectedChain === 'ethereum' ? 1.0 :
        selectedChain === 'arbitrum' ? 1.1 :
        selectedChain === 'base' ? 1.3 : 1.2;

      const bridgeRiskAdjustment = basePremium * (bridgeRiskMultiplier - 1);

      // Hedge costs (from PricingOracleKeeper)
      const hedgeCosts = {
        polymarket: amount * 0.025 * 0.4, // 2.5% odds, 40% allocation
        perpetuals: amount * 0.005 * (days / 365) * 0.4, // 0.5% daily, 40% allocation
        allianz: amount * 0.0045 * 0.2 // $4.50 per $1000, 20% allocation
      };

      const totalHedgeCost = Object.values(hedgeCosts).reduce((a, b) => a + b, 0);
      const totalPremium = basePremium + bridgeRiskAdjustment + totalHedgeCost;

      // Compare with Core Insurance (no hedges)
      const coreInsurancePremium = amount * 0.035 * (days / 365); // 3.5% APR for core
      const estimatedSavings = Math.max(0, coreInsurancePremium - totalPremium);

      setQuote({
        baseAmount: basePremium,
        bridgeRiskAdjustment,
        hedgeCosts,
        totalPremium,
        apr: (totalPremium / amount) * (365 / days),
        bridgeRiskMultiplier,
        estimatedSavings
      });
    } catch (error) {
      console.error('Failed to calculate premium:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    calculatePremium();
  }, [coverageAmount, durationDays, selectedCoverageTypes, selectedChain, selectedStablecoin]);

  const handlePurchase = async () => {
    if (!userAddress || !contracts.hedgedPolicyFactory || !quote) {
      return;
    }

    setIsLoading(true);

    try {
      const finalBeneficiary = beneficiaryMode === 'self' ? userAddress : beneficiaryAddress;

      if (!finalBeneficiary) {
        alert('Please select a beneficiary');
        setIsLoading(false);
        return;
      }

      // In production: Call HedgedPolicyFactory contract
      // await contracts.hedgedPolicyFactory.sendCreatePolicy(...)

      alert(`Multi-chain policy created successfully!\n\nChain: ${selectedChain}\nAsset: ${selectedStablecoin}\nCoverage: $${coverageAmount}\nPremium: $${quote.totalPremium.toFixed(2)}`);
    } catch (error) {
      console.error('Failed to purchase policy:', error);
      alert('Purchase failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <TerminalWindow title="MULTI-CHAIN_INSURANCE">
        <div className="font-mono text-sm text-text-secondary">
          &gt; 14 Stablecoins • 8 Blockchains • Real-Time Bridge Monitoring
          <div className="mt-2 text-xs">
            Insure your stablecoins across any supported blockchain with dynamic pricing
            based on real-time bridge health and external hedge costs.
          </div>
        </div>
      </TerminalWindow>

      {/* Step 1: Chain and Asset Selection */}
      <TerminalWindow title="STEP 1: SELECT BLOCKCHAIN & ASSET">
        <ChainSelector
          selectedChain={selectedChain}
          selectedStablecoin={selectedStablecoin}
          onChainChange={setSelectedChain}
          onStablecoinChange={setSelectedStablecoin}
        />
      </TerminalWindow>

      {/* Step 2: Bridge Health Monitor */}
      {selectedChain !== 'ton' && (
        <TerminalWindow title="STEP 2: BRIDGE SECURITY STATUS">
          <BridgeHealthIndicator sourceChain={selectedChain} />
        </TerminalWindow>
      )}

      {/* Step 3: Coverage Configuration */}
      <TerminalWindow title={selectedChain === 'ton' ? 'STEP 2: CONFIGURE COVERAGE' : 'STEP 3: CONFIGURE COVERAGE'}>
        <div className="space-y-6">
          {/* Coverage Types */}
          <div>
            <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
              Select Coverage Types
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(coverageTypes).map(([type, info]) => {
                const isSelected = selectedCoverageTypes.includes(type as CoverageType);
                const isRecommended = info.recommended;

                return (
                  <button
                    key={type}
                    onClick={() => toggleCoverageType(type as CoverageType)}
                    className={`
                      relative p-4 border-3 transition-all text-left
                      ${isSelected
                        ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665]'
                        : 'border-cream-400 hover:bg-cream-300 hover:border-copper-300'}
                    `}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-2xl">{info.icon}</span>
                      {isRecommended && (
                        <span className="text-[10px] text-copper-500 border-2 border-copper-500 px-2 py-0.5 font-mono font-bold">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <div className="font-mono">
                      <div className="text-sm font-semibold text-copper-500 mb-1">{info.name}</div>
                      <div className="text-xs text-text-secondary">{info.description}</div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-copper-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coverage Amount */}
          <div>
            <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
              Coverage Amount ({selectedStablecoin})
            </h3>
            <div className="flex gap-3">
              <input
                type="number"
                value={coverageAmount}
                onChange={e => setCoverageAmount(e.target.value)}
                className="flex-1 bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none outline-none"
                placeholder="10000"
              />
              <div className="grid grid-cols-4 gap-2">
                {['1000', '5000', '10000', '50000'].map(preset => (
                  <RetroButton
                    key={preset}
                    onClick={() => setCoverageAmount(preset)}
                    variant={coverageAmount === preset ? 'primary' : 'secondary'}
                  >
                    ${preset}
                  </RetroButton>
                ))}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
              Duration (Days)
            </h3>
            <div className="flex gap-3">
              <input
                type="number"
                value={durationDays}
                onChange={e => setDurationDays(e.target.value)}
                className="flex-1 bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none outline-none"
                placeholder="30"
              />
              <div className="grid grid-cols-4 gap-2">
                {['7', '30', '90', '365'].map(preset => (
                  <RetroButton
                    key={preset}
                    onClick={() => setDurationDays(preset)}
                    variant={durationDays === preset ? 'primary' : 'secondary'}
                  >
                    {preset}d
                  </RetroButton>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Premium Quote */}
      {quote && (
        <TerminalWindow title="PREMIUM QUOTE">
          <div className="space-y-4 font-mono text-sm">
            {/* Breakdown */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Base Premium:</span>
                <span className="text-text-primary font-semibold">${quote.baseAmount.toFixed(2)}</span>
              </div>
              {quote.bridgeRiskAdjustment > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">
                    Bridge Risk ({quote.bridgeRiskMultiplier.toFixed(1)}x):
                  </span>
                  <span className="text-copper-500 font-semibold">+${quote.bridgeRiskAdjustment.toFixed(2)}</span>
                </div>
              )}
              <div className="text-xs text-text-tertiary pl-4 space-y-1">
                <div className="flex justify-between">
                  <span>Prediction Markets (40%):</span>
                  <span>${quote.hedgeCosts.polymarket.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Perpetuals (40%):</span>
                  <span>${quote.hedgeCosts.perpetuals.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Off-Chain Reinsurance (20%):</span>
                  <span>${quote.hedgeCosts.allianz.toFixed(2)}</span>
                </div>
              </div>
              <div className="border-t-2 border-cream-400 pt-2"></div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-semibold">Total Premium:</span>
                <span className="text-terminal-green font-bold text-lg">${quote.totalPremium.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-tertiary">Effective APR:</span>
                <span className="text-text-secondary">{(quote.apr * 100).toFixed(2)}%</span>
              </div>
              {quote.estimatedSavings > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-tertiary">Savings vs Core Insurance:</span>
                  <span className="text-terminal-green font-semibold">-${quote.estimatedSavings.toFixed(2)} ({((quote.estimatedSavings / (quote.totalPremium + quote.estimatedSavings)) * 100).toFixed(0)}%)</span>
                </div>
              )}
            </div>
          </div>
        </TerminalWindow>
      )}

      {/* Beneficiary Selection */}
      <TerminalWindow title="BENEFICIARY">
        <BeneficiarySelector
          mode={beneficiaryMode}
          onModeChange={setBeneficiaryMode}
          beneficiaryAddress={beneficiaryAddress}
          onBeneficiaryChange={setBeneficiaryAddress}
          giftMessage={giftMessage}
          onGiftMessageChange={setGiftMessage}
          userAddress={userAddress}
        />
      </TerminalWindow>

      {/* Purchase Button */}
      <div className="flex gap-4">
        <RetroButton
          onClick={handlePurchase}
          disabled={!userAddress || !quote || isLoading}
          variant="primary"
          className="flex-1 py-4 text-lg"
        >
          {isLoading ? 'PROCESSING...' : `PURCHASE POLICY ($${quote?.totalPremium.toFixed(2) || '0.00'})`}
        </RetroButton>
      </div>

      {!userAddress && (
        <InfoPanel variant="warning">
          Please connect your TON wallet to purchase parametric coverage
        </InfoPanel>
      )}
    </div>
  );
};
