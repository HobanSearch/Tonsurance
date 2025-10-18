import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano, fromNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, TerminalOutput, RetroButton, InfoPanel } from '../components/terminal';
import { BeneficiarySelector } from '../components/BeneficiarySelector';

type CoverageType = 'depeg' | 'smart_contract' | 'oracle' | 'bridge';

interface PremiumQuote {
  coverageAmount: number;
  durationDays: number;
  premium: number;
  apr: number;
  isGift?: boolean;
  giftFee?: number;
}

export const PolicyPurchase = () => {
  const userAddress = useTonAddress();
  const { contracts, sender, isConfigured } = useContracts();
  const [selectedCoverageTypes, setSelectedCoverageTypes] = useState<CoverageType[]>(['depeg']);
  const [coverageAmount, setCoverageAmount] = useState<string>('10000');
  const [durationDays, setDurationDays] = useState<string>('30');
  const [quote, setQuote] = useState<PremiumQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string | null>(null);
  const [beneficiaryMode, setBeneficiaryMode] = useState<'self' | 'other'>('self');
  const [giftMessage, setGiftMessage] = useState<string>('');

  const coverageTypes = {
    depeg: { name: 'STABLECOIN_DEPEG', description: 'Protection against USDT/USDC depegging below $0.95', icon: '💵' },
    smart_contract: { name: 'CONTRACT_EXPLOIT', description: 'Coverage for verified contract exploits', icon: '⚠️' },
    oracle: { name: 'ORACLE_FAILURE', description: 'Protection against oracle manipulation or failure', icon: '🔮' },
    bridge: { name: 'BRIDGE_HACK', description: 'Coverage for cross-chain bridge exploits', icon: '🌉' }
  };

  const coverageTypeToInt = (type: CoverageType): number => {
    const mapping = { depeg: 0, smart_contract: 1, oracle: 2, bridge: 3 };
    return mapping[type];
  };

  const toggleCoverageType = (type: CoverageType) => {
    setSelectedCoverageTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const calculatePremium = async () => {
    const amount = parseFloat(coverageAmount) || 0;
    const days = parseFloat(durationDays) || 0;

    if (amount === 0 || days === 0 || selectedCoverageTypes.length === 0) {
      setQuote(null);
      return;
    }

    // Calculate premium for multiple coverage types
    // For simplicity, using a base multiplier approach:
    // 1 type = 1x, 2 types = 1.8x, 3 types = 2.5x, 4 types = 3x (volume discount)
    const multipliers: Record<number, number> = { 1: 1, 2: 1.8, 3: 2.5, 4: 3.0 };
    const multiplier = multipliers[selectedCoverageTypes.length] || 1;

    if (isConfigured && contracts.policyFactory) {
      setIsCalculating(true);
      try {
        // Calculate for first type and apply multiplier
        const premiumWei = await contracts.policyFactory.getCalculatePremium(
          coverageTypeToInt(selectedCoverageTypes[0]),
          toNano(amount),
          days
        );
        const basePremium = parseFloat(fromNano(premiumWei));
        const premium = basePremium * multiplier;

        setQuote({
          coverageAmount: amount,
          durationDays: days,
          premium,
          apr: 0.8
        });
      } catch (error) {
        console.error('Error fetching premium from contract:', error);
        const apr = 0.008;
        const premium = amount * apr * (days / 365) * multiplier;
        setQuote({
          coverageAmount: amount,
          durationDays: days,
          premium,
          apr: apr * 100
        });
      } finally {
        setIsCalculating(false);
      }
    } else {
      const apr = 0.008;
      const premium = amount * apr * (days / 365) * multiplier;
      setQuote({
        coverageAmount: amount,
        durationDays: days,
        premium,
        apr: apr * 100
      });
    }
  };

  useEffect(() => {
    calculatePremium();
  }, [coverageAmount, durationDays, selectedCoverageTypes, isConfigured]);

  const handlePurchase = async () => {
    if (!userAddress) {
      alert('Please connect your wallet first');
      return;
    }

    if (!isConfigured || !contracts.policyFactory) {
      alert('Contracts not configured. Please deploy contracts and update .env file.');
      return;
    }

    if (!quote) {
      alert('Please wait for premium calculation');
      return;
    }

    setIsLoading(true);
    try {
      const coverageAmountNano = toNano(coverageAmount);
      const premiumNano = toNano(quote.premium);
      const gasAmount = toNano('0.5');

      // For now, create policy with first selected type
      // TODO: Update contract to support multiple coverage types in one policy
      await contracts.policyFactory.sendCreatePolicy(sender, {
        value: gasAmount + premiumNano,
        coverageType: coverageTypeToInt(selectedCoverageTypes[0]),
        coverageAmount: coverageAmountNano,
        duration: parseInt(durationDays),
      });

      const coverageNames = selectedCoverageTypes.map(t => coverageTypes[t].name).join(', ');
      alert(`Policy purchase transaction sent!\n\nCoverage types: ${coverageNames}\nYour policy will be active once the transaction is confirmed.`);

      setCoverageAmount('10000');
      setDurationDays('30');
    } catch (error: any) {
      console.error('Error purchasing policy:', error);

      if (error.message?.includes('User rejected')) {
        alert('Transaction was rejected');
      } else if (error.message?.includes('Insufficient balance')) {
        alert('Insufficient balance for transaction');
      } else {
        alert(`Failed to purchase policy: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <TerminalWindow title="BUY_PARAMETRIC_COVERAGE.EXE">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Initializing coverage purchase wizard...<br />
            &gt; <span className="output-success">✓ Contract configured</span><br />
            &gt; Fixed APR pricing with 100% on-chain vault collateral
          </div>
        </TerminalOutput>
      </TerminalWindow>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Form Section */}
        <div className="md:col-span-2 space-y-6">
          {/* Coverage Type Selection */}
          <TerminalWindow title="STEP 1/3: SELECT COVERAGE TYPES">
            <div className="mb-3 text-xs text-text-secondary">
              &gt; Select one or more coverage types (volume discounts apply)
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(coverageTypes) as CoverageType[]).map((type) => {
                const isSelected = selectedCoverageTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleCoverageType(type)}
                    className={`p-4 border-3 transition-all text-left relative ${
                      isSelected
                        ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665] scale-[1.02]'
                        : 'border-cream-400 hover:bg-cream-300 hover:border-copper-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-copper-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span>{coverageTypes[type].icon}</span>
                      <div className="font-semibold text-sm">
                        {coverageTypes[type].name}
                      </div>
                    </div>
                    <div className="text-xs text-text-secondary">
                      {coverageTypes[type].description}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedCoverageTypes.length > 1 && (
              <div className="mt-3 p-2 bg-terminal-green/10 border border-terminal-green">
                <div className="text-xs text-terminal-green font-mono">
                  ✓ BUNDLE DISCOUNT: {selectedCoverageTypes.length} types selected ({selectedCoverageTypes.length === 2 ? '10%' : selectedCoverageTypes.length === 3 ? '17%' : '25%'} savings)
                </div>
              </div>
            )}
          </TerminalWindow>

          {/* Coverage Details */}
          <TerminalWindow title="STEP 2/3: COVERAGE PARAMETERS">
            <div className="space-y-5">
              {/* Coverage Amount */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
                  Coverage Amount (USDT)
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-cream-300/50 border border-cream-400">
                  <span className="text-copper-500 font-bold">$</span>
                  <input
                    type="number"
                    value={coverageAmount}
                    onChange={(e) => setCoverageAmount(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none font-mono text-sm"
                    placeholder="10000"
                    min="1000"
                    step="1000"
                  />
                </div>
                <p className="text-xs text-text-tertiary mt-1">
                  &gt; Minimum: 1,000 USDT
                </p>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
                  Duration (Days)
                </label>
                <div className="flex gap-2 mb-2">
                  {[30, 60, 90, 180].map((days) => (
                    <button
                      key={days}
                      onClick={() => setDurationDays(days.toString())}
                      className={`px-3 py-1 border-2 text-xs font-semibold transition-all ${
                        durationDays === days.toString()
                          ? 'border-copper-500 bg-copper-500 text-white'
                          : 'border-cream-400 hover:bg-cream-300'
                      }`}
                    >
                      {days}D
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="w-full px-3 py-2 bg-cream-300/50 border border-cream-400 font-mono text-sm"
                  placeholder="30"
                  min="7"
                  max="365"
                />
              </div>
            </div>
          </TerminalWindow>
        </div>

        {/* Quote Summary */}
        <div className="md:col-span-1">
          <TerminalWindow title="PREMIUM_QUOTE.TXT">
            <div className="space-y-4 sticky top-4">
              {quote ? (
                <>
                  <TerminalOutput>
                    <div className="space-y-2 text-xs font-mono">
                      <div>
                        <div className="text-text-secondary mb-1">TYPES SELECTED:</div>
                        <div className="text-xs space-y-0.5">
                          {selectedCoverageTypes.map(type => (
                            <div key={type} className="flex items-center gap-1">
                              <span className="text-copper-500">•</span>
                              <span className="font-semibold">{coverageTypes[type].name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="border-t-2 border-cream-400 pt-2"></div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">COVERAGE:</span>
                        <span className="font-semibold">${quote.coverageAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">DURATION:</span>
                        <span className="font-semibold">{quote.durationDays} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">APR RATE:</span>
                        <span className="font-semibold">{quote.apr}%</span>
                      </div>
                      <div className="border-t-2 border-cream-400 pt-2 mt-2">
                        <div className="flex justify-between items-end">
                          <span className="text-text-secondary font-semibold">TOTAL:</span>
                          <span className="text-xl font-bold text-terminal-green">
                            ${quote.premium.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TerminalOutput>

                  <RetroButton
                    variant="primary"
                    onClick={handlePurchase}
                    disabled={isLoading || !userAddress}
                    className="w-full"
                  >
                    {isLoading ? 'PROCESSING...' : userAddress ? 'PURCHASE POLICY >>' : 'CONNECT WALLET'}
                  </RetroButton>

                  <div className="text-xs text-text-tertiary space-y-1 pt-2 border-t-2 border-cream-400">
                    <div className="output-success">✓ Instant claims processing</div>
                    <div className="output-success">✓ 100% on-chain collateral</div>
                    <div className="output-success">✓ No hidden fees</div>
                  </div>
                </>
              ) : (
                <TerminalOutput type="info">
                  <div className="text-xs">
                    &gt; Waiting for parameters...<br />
                    &gt; Enter coverage amount and duration
                  </div>
                </TerminalOutput>
              )}
            </div>
          </TerminalWindow>
        </div>
      </div>

      {/* Info Panel */}
      <InfoPanel type="default">
        <TerminalOutput>
          <div className="text-xs space-y-1">
            <div className="font-semibold mb-2">&gt; POLICY INFORMATION:</div>
            <div>• Fixed 0.8% APR pricing across all coverage types</div>
            <div>• Three-tier vault system provides 250% capital efficiency</div>
            <div>• Claims processed automatically via oracle network (5-10 min)</div>
            <div>• Policies are minted as NFTs on TON blockchain</div>
          </div>
        </TerminalOutput>
      </InfoPanel>
    </div>
  );
};
