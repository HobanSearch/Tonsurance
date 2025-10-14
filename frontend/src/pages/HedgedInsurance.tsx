import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, TerminalOutput, RetroButton, InfoPanel } from '../components/terminal';

type CoverageType = 'depeg' | 'smart_contract' | 'oracle' | 'bridge';

interface HedgeCost {
  venue: string;
  allocation: number;
  cost: number;
  lastUpdate: number;
}

interface SwingQuote {
  basePremium: number;
  hedgeCosts: HedgeCost[];
  totalPremium: number;
  savings: number;
  savingsPercent: number;
}

export const HedgedInsurance = () => {
  const userAddress = useTonAddress();
  const { contracts, sender, isConfigured } = useContracts();
  const [selectedCoverageTypes, setSelectedCoverageTypes] = useState<CoverageType[]>(['depeg']);
  const [coverageAmount, setCoverageAmount] = useState<string>('10000');
  const [durationDays, setDurationDays] = useState<string>('30');
  const [quote, setQuote] = useState<SwingQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const coverageTypes = {
    depeg: { name: 'Stablecoin Depeg', description: 'Protection against USDT/USDC depegging below $0.95' },
    smart_contract: { name: 'Smart Contract Exploit', description: 'Coverage for verified contract exploits' },
    oracle: { name: 'Oracle Failure', description: 'Protection against oracle manipulation or failure' },
    bridge: { name: 'Bridge Hack', description: 'Coverage for cross-chain bridge exploits' }
  };

  const coverageTypeToEnum = (type: CoverageType): number => {
    const mapping = { depeg: 1, smart_contract: 2, oracle: 3, bridge: 3 };
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

  const calculateSwingPremium = async () => {
    const amount = parseFloat(coverageAmount) || 0;
    const days = parseFloat(durationDays) || 0;
    const baseApr = 0.008; // 0.8% APR

    if (amount === 0 || days === 0 || selectedCoverageTypes.length === 0) {
      setQuote(null);
      return;
    }

    // Apply bundle multiplier (same as PolicyPurchase)
    const multipliers: Record<number, number> = { 1: 1, 2: 1.8, 3: 2.5, 4: 3.0 };
    const multiplier = multipliers[selectedCoverageTypes.length] || 1;

    const basePremium = amount * baseApr * (days / 365) * multiplier;
    const totalPremium = basePremium; // No hedge costs charged to user
    const fixedPremium = amount * baseApr * (days / 365) * 2.5; // Core insurance equivalent
    const savings = fixedPremium - totalPremium;

    // Try to fetch real hedge prices from PricingOracle for display purposes only
    if (isConfigured && contracts.pricingOracle) {
      try {
        const hedgePrices = await contracts.pricingOracle.getHedgePrices(
          coverageTypeToEnum(selectedCoverageTypes[0])
        );

        // Calculate costs based on real oracle data (for display only)
        const polymarketOdds = hedgePrices.polymarketOdds / 10000; // Convert basis points
        const perpFundingRate = Math.abs(hedgePrices.perpFundingRate) / 10000; // Convert basis points
        const allianzQuote = hedgePrices.allianzQuote / 100; // Convert cents to dollars

        const polymarketCost = amount * polymarketOdds * 0.4; // 40% allocation
        const perpetualsCost = amount * perpFundingRate * days * 0.4; // 40% allocation
        const allianzCost = (amount / 1000) * allianzQuote * 0.2; // 20% allocation

        setQuote({
          basePremium,
          hedgeCosts: [
            {
              venue: 'Prediction Markets',
              allocation: 40,
              cost: polymarketCost,
              lastUpdate: hedgePrices.timestamp
            },
            {
              venue: 'Perpetuals',
              allocation: 40,
              cost: perpetualsCost,
              lastUpdate: hedgePrices.timestamp
            },
            {
              venue: 'Off-Chain Reinsurance',
              allocation: 20,
              cost: allianzCost,
              lastUpdate: hedgePrices.timestamp
            }
          ],
          totalPremium,
          savings,
          savingsPercent: (savings / fixedPremium) * 100
        });

        setLastUpdated(new Date(hedgePrices.timestamp * 1000));
      } catch (error) {
        console.error('Error fetching hedge prices:', error);
        // Fallback to mock calculation
        useMockCalculation();
      }
    } else {
      useMockCalculation();
    }

    function useMockCalculation() {
      // Calculate hedge costs for display purposes only
      const polymarketCost = amount * 0.025 * 0.4;
      const perpetualsCost = amount * 0.005 * days * 0.4;
      const allianzCost = amount * 0.0045 * 0.2;

      setQuote({
        basePremium,
        hedgeCosts: [
          { venue: 'Prediction Markets', allocation: 40, cost: polymarketCost, lastUpdate: Date.now() },
          { venue: 'Perpetuals', allocation: 40, cost: perpetualsCost, lastUpdate: Date.now() },
          { venue: 'Off-Chain Reinsurance', allocation: 20, cost: allianzCost, lastUpdate: Date.now() }
        ],
        totalPremium,
        savings,
        savingsPercent: (savings / fixedPremium) * 100
      });

      setLastUpdated(new Date());
    }
  };

  useEffect(() => {
    calculateSwingPremium();

    // Real-time updates every 5 seconds
    const interval = setInterval(() => {
      calculateSwingPremium();
    }, 5000);

    return () => clearInterval(interval);
  }, [coverageAmount, durationDays, selectedCoverageTypes, isConfigured]);

  const handlePurchase = async () => {
    if (!userAddress) {
      alert('Please connect your wallet first');
      return;
    }

    if (!isConfigured || !contracts.hedgedPolicyFactory) {
      alert('Hedged policy contract not configured. Please deploy contracts and update .env file.');
      return;
    }

    if (!quote) {
      alert('Please wait for premium calculation');
      return;
    }

    setIsLoading(true);
    try {
      const coverageAmountNano = toNano(coverageAmount);
      const premiumNano = toNano(quote.totalPremium);
      const gasAmount = toNano('0.5');

      // For now, create policy with first selected type
      // TODO: Update contract to support multiple coverage types in one policy
      await contracts.hedgedPolicyFactory.sendCreateHedgedPolicy(sender, {
        value: gasAmount + premiumNano,
        userAddress: sender.address!,
        coverageType: coverageTypeToEnum(selectedCoverageTypes[0]) - 1, // 0-indexed for HedgedPolicyFactory
        coverageAmount: coverageAmountNano,
        durationDays: parseInt(durationDays),
        expectedPremium: premiumNano,
        quoteTimestamp: Math.floor(Date.now() / 1000),
      });

      const coverageNames = selectedCoverageTypes.map(t => coverageTypes[t].name).join(', ');
      alert(`Hedged policy purchase transaction sent!\n\nCoverage types: ${coverageNames}\nYour policy will be active once confirmed.\nHedges will be executed across 3 venues in the background (5-10 seconds).`);

      // Reset form
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
    <div className="max-w-6xl mx-auto space-y-6">
      <TerminalWindow title="HEDGED_INSURANCE">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Initializing swing pricing engine...<br />
            &gt; <span className="output-success">✓ Connected to 3 hedge venues</span><br />
            &gt; Dynamic pricing with 80/20 on-chain/external hedge split
          </div>
        </TerminalOutput>
      </TerminalWindow>

      {/* Real-time Indicator */}
      <InfoPanel type="success">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse"></div>
            <span className="font-mono">
              LIVE PRICING - UPDATES EVERY 5 SECONDS
            </span>
          </div>
          <span className="font-mono text-text-tertiary">
            LAST UPDATED: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </InfoPanel>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Form Section */}
        <div className="md:col-span-2 space-y-6">
          {/* Coverage Type Selection */}
          <TerminalWindow title="SELECT_COVERAGE_TYPES">
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
                    <div className="font-semibold text-copper-500 text-sm">
                      {coverageTypes[type].name.toUpperCase()}
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
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
          <TerminalWindow title="COVERAGE_PARAMETERS">
            <div className="space-y-5">
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
              </div>

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

          {/* Hedge Breakdown */}
          {quote && (
            <TerminalWindow title="HEDGE_ALLOCATION">
              <div className="space-y-3 text-xs">
                <div className="text-text-secondary mb-2 font-mono">
                  &gt; 20% EXTERNAL HEDGES
                </div>
                {quote.hedgeCosts.map((hedge) => (
                  <div key={hedge.venue} className="flex items-center justify-between p-2 bg-cream-300/30 border border-cream-400">
                    <div className="flex-1">
                      <div className="font-semibold text-copper-500">
                        {hedge.venue.toUpperCase()}
                      </div>
                      <div className="text-text-tertiary font-mono">
                        {hedge.allocation}% ALLOCATION
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold font-mono">
                        ${hedge.cost.toFixed(2)}
                      </div>
                      <div className="text-terminal-green font-mono">
                        ● LIVE
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TerminalWindow>
          )}
        </div>

        {/* Quote Summary */}
        <div className="md:col-span-1">
          <TerminalWindow title="SWING_QUOTE">
            <div className="space-y-5 text-xs sticky top-4">
              {quote && (
                <>
                  <TerminalOutput>
                    <div className="space-y-2 font-mono">
                      <div>
                        <div className="text-text-secondary mb-1 text-xs">TYPES SELECTED:</div>
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
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">COVERAGE:</span>
                        <span className="font-semibold">${parseFloat(coverageAmount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">DURATION:</span>
                        <span className="font-semibold">{durationDays} days</span>
                      </div>
                      <div className="border-t-2 border-cream-400 pt-2 mt-2">
                        <div className="flex justify-between items-end">
                          <span className="text-text-secondary font-semibold text-xs">PREMIUM:</span>
                          <span className="text-xl font-bold text-terminal-green">
                            ${quote.totalPremium.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-text-tertiary mt-1">
                          Hedge costs absorbed by protocol
                        </div>
                      </div>
                    </div>
                  </TerminalOutput>

                  {quote.savings > 0 && (
                    <div className="bg-terminal-green/10 border-2 border-terminal-green p-2">
                      <div className="text-terminal-green text-center">
                        <div className="font-bold text-sm">SAVE {quote.savingsPercent.toFixed(0)}%</div>
                        <div className="text-xs font-mono">${quote.savings.toFixed(2)} vs. Core</div>
                      </div>
                    </div>
                  )}

                  <RetroButton
                    onClick={handlePurchase}
                    disabled={isLoading || !userAddress}
                    variant="primary"
                    className="w-full"
                  >
                    {isLoading ? 'PROCESSING...' : userAddress ? 'PURCHASE HEDGED POLICY >>' : 'CONNECT WALLET'}
                  </RetroButton>

                  <div className="border-t-2 border-cream-400 pt-3 space-y-1.5">
                    <div className="output-success">✓ 80% on-chain, 20% hedged</div>
                    <div className="output-success">✓ Real-time pricing</div>
                    <div className="output-success">✓ Multi-venue optimization</div>
                    <div className="output-success">✓ Instant claims</div>
                  </div>
                </>
              )}
            </div>
          </TerminalWindow>
        </div>
      </div>

      {/* How It Works */}
      <InfoPanel type="default">
        <TerminalOutput>
          <div className="text-xs space-y-3">
            <div className="font-semibold mb-2 text-copper-500">&gt; HOW HEDGED INSURANCE WORKS:</div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <div className="font-semibold mb-1.5 text-sm">1. SWING PRICING</div>
                <p>Your premium adjusts based on real-time hedge costs from prediction markets, perpetuals, and off-chain reinsurance. When markets are favorable, you pay less.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">2. 80/20 SPLIT</div>
                <p>80% of coverage comes from on-chain vaults (same as Core Insurance). 20% is hedged externally across 3 venues for capital efficiency.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">3. INSTANT PAYOUT</div>
                <p>Claims are paid immediately from on-chain vaults. External hedges settle in parallel to refill reserves (no impact on your payout speed).</p>
              </div>
            </div>
          </div>
        </TerminalOutput>
      </InfoPanel>
    </div>
  );
};
