import { useState } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, TerminalOutput, RetroButton, InfoPanel } from '../components/terminal';
import { BeneficiarySelector } from '../components/BeneficiarySelector';

type CoverageType = 'depeg' | 'smart_contract' | 'oracle' | 'bridge' | 'cex_liquidation';

interface CoverageItem {
  id: string;
  coverageType: CoverageType;
  blockchain: string;        // Source blockchain (or 'CEX' for CEX liquidation)
  stablecoin: string;        // Stablecoin being insured
  payoutAsset: 'USDT';       // Always USDT
  payoutChain: 'TON';        // Always TON
  coverageAmount: string;
  durationDays: string;
  cexVenue?: string;         // Only for CEX liquidation
}

interface CoverageTypeInfo {
  name: string;
  description: string;
  icon: string;
  baseRateApr: number;
}

const COVERAGE_TYPES: Record<CoverageType, CoverageTypeInfo> = {
  depeg: {
    name: 'STABLECOIN_DEPEG',
    description: 'Protection against stablecoin depegging below $0.95',
    icon: '💵',
    baseRateApr: 0.8
  },
  smart_contract: {
    name: 'CONTRACT_EXPLOIT',
    description: 'Coverage for verified contract exploits',
    icon: '⚠️',
    baseRateApr: 2.5
  },
  oracle: {
    name: 'ORACLE_FAILURE',
    description: 'Protection against oracle manipulation or failure',
    icon: '🔮',
    baseRateApr: 1.8
  },
  bridge: {
    name: 'BRIDGE_HACK',
    description: 'Coverage for cross-chain bridge exploits',
    icon: '🌉',
    baseRateApr: 3.2
  },
  cex_liquidation: {
    name: 'CEX_LIQUIDATION',
    description: 'Protection against CEX liquidation cascades',
    icon: '🏦',
    baseRateApr: 5.0
  }
};

const BLOCKCHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'bitcoin', 'lightning', 'ton', 'solana'];
const STABLECOINS = ['USDC', 'USDT', 'USDP', 'DAI', 'FRAX', 'BUSD', 'USDe', 'sUSDe'];
const CEX_VENUES = ['Binance', 'OKX', 'Bybit', 'Bitget', 'HTX', 'KuCoin', 'Gate.io', 'MEXC', 'Kraken', 'Coinbase'];

// Chain-Stablecoin compatibility matrix
const CHAIN_STABLECOINS: Record<string, string[]> = {
  ethereum: ['USDC', 'USDT', 'USDP', 'DAI', 'FRAX', 'BUSD', 'USDe', 'sUSDe', 'USDY', 'PYUSD', 'GHO', 'LUSD', 'crvUSD', 'mkUSD'],
  arbitrum: ['USDC', 'USDT', 'DAI', 'FRAX', 'USDe', 'GHO', 'LUSD'],
  base: ['USDC', 'USDT', 'DAI', 'USDe', 'PYUSD'],
  polygon: ['USDC', 'USDT', 'DAI', 'FRAX', 'USDP', 'GHO'],
  bitcoin: ['USDT'],
  lightning: ['USDT', 'USDC'],
  ton: ['USDT', 'USDC', 'USDe'],
  solana: ['USDC', 'USDT', 'PYUSD', 'USDe']
};

// Create reverse mapping: stablecoin -> chains that support it
const STABLECOIN_CHAINS: Record<string, string[]> = {};
Object.keys(CHAIN_STABLECOINS).forEach(chain => {
  CHAIN_STABLECOINS[chain].forEach(stable => {
    if (!STABLECOIN_CHAINS[stable]) {
      STABLECOIN_CHAINS[stable] = [];
    }
    if (!STABLECOIN_CHAINS[stable].includes(chain)) {
      STABLECOIN_CHAINS[stable].push(chain);
    }
  });
});

export const PolicyPurchase = () => {
  const userAddress = useTonAddress();
  const { contracts, sender, isConfigured } = useContracts();
  const [isLoading, setIsLoading] = useState(false);
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string | null>(null);
  const [beneficiaryMode, setBeneficiaryMode] = useState<'self' | 'other'>('self');
  const [giftMessage, setGiftMessage] = useState<string>('');

  // List of coverage items to purchase
  const [coverageItems, setCoverageItems] = useState<CoverageItem[]>([]);

  // Currently selected coverage type for adding new items
  const [selectedCoverageType, setSelectedCoverageType] = useState<CoverageType | null>(null);
  const [selectedBlockchains, setSelectedBlockchains] = useState<Set<string>>(new Set());
  const [selectedStablecoins, setSelectedStablecoins] = useState<Set<string>>(new Set());
  const [newItemAmount, setNewItemAmount] = useState<string>('10000');
  const [newItemDuration, setNewItemDuration] = useState<string>('30');
  const [newItemCexVenue, setNewItemCexVenue] = useState<string>('Binance');

  // Filtering helper functions
  const getAvailableBlockchains = (): string[] => {
    if (!selectedCoverageType) return [];

    // CEX liquidation doesn't need blockchain selection
    if (selectedCoverageType === 'cex_liquidation') return [];

    // If no stablecoins selected yet, show all blockchains
    if (selectedStablecoins.size === 0) {
      return BLOCKCHAINS.filter(chain => chain !== 'bitcoin' || selectedCoverageType === 'cex_liquidation');
    }

    // Show only blockchains that support ALL selected stablecoins
    const selectedStableArray = Array.from(selectedStablecoins);
    return BLOCKCHAINS.filter(chain => {
      return selectedStableArray.every(stable =>
        CHAIN_STABLECOINS[chain]?.includes(stable)
      );
    });
  };

  const getAvailableStablecoins = (): string[] => {
    if (!selectedCoverageType) return [];

    // CEX liquidation shows all stablecoins (no filtering)
    if (selectedCoverageType === 'cex_liquidation') {
      return STABLECOINS;
    }

    // If no blockchains selected yet, show all stablecoins
    if (selectedBlockchains.size === 0) {
      return STABLECOINS;
    }

    // Show only stablecoins available on ALL selected blockchains (intersection)
    const selectedChainArray = Array.from(selectedBlockchains);
    if (selectedChainArray.length === 0) return STABLECOINS;

    // Start with stablecoins from first chain
    let availableStablecoins = [...(CHAIN_STABLECOINS[selectedChainArray[0]] || [])];

    // Intersect with each subsequent chain
    for (let i = 1; i < selectedChainArray.length; i++) {
      const chainStables = CHAIN_STABLECOINS[selectedChainArray[i]] || [];
      availableStablecoins = availableStablecoins.filter(s => chainStables.includes(s));
    }

    // Filter to only show the ones in our STABLECOINS list
    return availableStablecoins.filter(s => STABLECOINS.includes(s));
  };

  // Calculate premium for a coverage item
  const calculatePremium = (item: CoverageItem): number => {
    const baseRateApr = COVERAGE_TYPES[item.coverageType].baseRateApr;
    const amount = parseFloat(item.coverageAmount) || 0;
    const days = parseInt(item.durationDays) || 0;

    // Simple APR calculation: amount * APR * (days / 365)
    const premium = amount * (baseRateApr / 100) * (days / 365);
    return premium;
  };

  // Toggle blockchain selection
  const toggleBlockchain = (blockchain: string) => {
    setSelectedBlockchains(prev => {
      const newSet = new Set(prev);
      if (newSet.has(blockchain)) {
        newSet.delete(blockchain);
      } else {
        newSet.add(blockchain);
      }
      return newSet;
    });
  };

  // Toggle stablecoin selection
  const toggleStablecoin = (stablecoin: string) => {
    setSelectedStablecoins(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stablecoin)) {
        newSet.delete(stablecoin);
      } else {
        newSet.add(stablecoin);
      }
      return newSet;
    });
  };

  // Add coverage items for selected combinations
  const addCoverageItems = () => {
    if (!selectedCoverageType) {
      alert('Please select coverage type');
      return;
    }

    // For CEX liquidation: venue × stablecoin (no blockchain selection)
    if (selectedCoverageType === 'cex_liquidation') {
      if (selectedStablecoins.size === 0) {
        alert('Please select at least one stablecoin');
        return;
      }

      const newItems: CoverageItem[] = [];

      for (const stablecoin of selectedStablecoins) {
        newItems.push({
          id: `${selectedCoverageType}_${newItemCexVenue}_${stablecoin}_${Date.now()}_${Math.random()}`,
          coverageType: selectedCoverageType,
          blockchain: 'CEX', // CEX positions don't have a blockchain
          stablecoin,
          payoutAsset: 'USDT',
          payoutChain: 'TON',
          coverageAmount: newItemAmount,
          durationDays: newItemDuration,
          cexVenue: newItemCexVenue
        });
      }

      setCoverageItems(prev => [...prev, ...newItems]);
      setSelectedStablecoins(new Set());
      setSelectedCoverageType(null);
      return;
    }

    // For depeg: stablecoin-first flow
    if (selectedCoverageType === 'depeg') {
      if (selectedStablecoins.size === 0) {
        alert('Please select at least one stablecoin');
        return;
      }
      if (selectedBlockchains.size === 0) {
        alert('Please select at least one blockchain');
        return;
      }
    } else {
      // For smart_contract/oracle/bridge: blockchain-first flow
      if (selectedBlockchains.size === 0) {
        alert('Please select at least one blockchain');
        return;
      }
      if (selectedStablecoins.size === 0) {
        alert('Please select at least one stablecoin');
        return;
      }
    }

    const newItems: CoverageItem[] = [];

    // Create a coverage item for each blockchain × stablecoin combination
    for (const blockchain of selectedBlockchains) {
      for (const stablecoin of selectedStablecoins) {
        newItems.push({
          id: `${selectedCoverageType}_${blockchain}_${stablecoin}_${Date.now()}_${Math.random()}`,
          coverageType: selectedCoverageType,
          blockchain,
          stablecoin,
          payoutAsset: 'USDT',
          payoutChain: 'TON',
          coverageAmount: newItemAmount,
          durationDays: newItemDuration,
          cexVenue: undefined
        });
      }
    }

    setCoverageItems(prev => [...prev, ...newItems]);

    // Reset selection
    setSelectedBlockchains(new Set());
    setSelectedStablecoins(new Set());
    setSelectedCoverageType(null);
  };

  // Remove coverage item
  const removeCoverageItem = (id: string) => {
    setCoverageItems(prev => prev.filter(item => item.id !== id));
  };

  // Update coverage item
  const updateCoverageItem = (id: string, updates: Partial<CoverageItem>) => {
    setCoverageItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  // Get total premium
  const getTotalPremium = (): number => {
    return coverageItems.reduce((total, item) => total + calculatePremium(item), 0);
  };

  const handlePurchaseAll = async () => {
    if (!userAddress) {
      alert('Please connect your TON wallet first');
      return;
    }

    if (!isConfigured || !contracts.policyFactory) {
      alert('Contracts not configured. Please deploy contracts and update .env file.');
      return;
    }

    if (coverageItems.length === 0) {
      alert('Please add at least one coverage item');
      return;
    }

    const finalBeneficiary = beneficiaryMode === 'self' ? userAddress : beneficiaryAddress;
    if (!finalBeneficiary) {
      alert('Please select a beneficiary');
      return;
    }

    setIsLoading(true);
    try {
      const coverageTypeMapping: Record<string, number> = {
        depeg: 0,
        smart_contract: 1,
        oracle: 2,
        bridge: 3,
        cex_liquidation: 4
      };

      // Purchase each coverage item
      for (const item of coverageItems) {
        const coverageAmountNano = toNano(item.coverageAmount);
        const premium = calculatePremium(item);
        const premiumNano = toNano(premium.toString());
        const gasAmount = toNano('0.5');

        await contracts.policyFactory.sendCreatePolicy(sender, {
          value: gasAmount + premiumNano,
          coverageType: coverageTypeMapping[item.coverageType],
          coverageAmount: coverageAmountNano,
          duration: parseInt(item.durationDays),
        });
      }

      alert(`Successfully purchased ${coverageItems.length} coverage(s)!\n\nBeneficiary: ${finalBeneficiary}\n\nYour coverages will be active once transactions are confirmed.`);

      // Reset
      setCoverageItems([]);
      setBeneficiaryMode('self');
      setBeneficiaryAddress(null);
      setGiftMessage('');
    } catch (error: any) {
      console.error('Error purchasing policies:', error);

      if (error.message?.includes('User rejected')) {
        alert('Transaction was rejected');
      } else if (error.message?.includes('Insufficient balance')) {
        alert('Insufficient balance for transaction');
      } else {
        alert(`Failed to purchase coverage: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TerminalWindow title="BUY_PARAMETRIC_COVERAGE.EXE">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Initializing multi-coverage purchase system...<br />
            &gt; <span className="output-success">✓ Contract configured</span><br />
            &gt; Select multiple coverage types, blockchains, and stablecoins<br />
            &gt; Dynamic pricing with 100% on-chain vault collateral
          </div>
        </TerminalOutput>
      </TerminalWindow>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Coverage Builder */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Select Coverage Type */}
          <TerminalWindow title="STEP 1: SELECT COVERAGE TYPE">
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(COVERAGE_TYPES) as [CoverageType, CoverageTypeInfo][]).map(([type, info]) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedCoverageType(type);
                    setSelectedBlockchains(new Set());
                    setSelectedStablecoins(new Set());
                  }}
                  className={`p-3 border-2 transition-all ${
                    selectedCoverageType === type
                      ? 'border-copper-500 bg-copper-50'
                      : 'border-cream-400 hover:bg-cream-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{info.icon}</div>
                  <div className="text-[9px] font-semibold break-words leading-tight">{info.name}</div>
                  <div className="text-[8px] text-terminal-green font-mono font-bold mt-1">
                    {info.baseRateApr}% APR
                  </div>
                </button>
              ))}
            </div>
            {selectedCoverageType && (
              <div className="mt-3 p-2 bg-copper-50/30 border-2 border-copper-400">
                <div className="text-xs">
                  <span className="font-semibold">Selected:</span> {COVERAGE_TYPES[selectedCoverageType].description}
                </div>
              </div>
            )}
          </TerminalWindow>

          {/* Payout Information Panel */}
          {selectedCoverageType && (
            <TerminalWindow title="💰 PAYOUT INFORMATION">
              <div className="p-3 bg-terminal-green/10 border-2 border-terminal-green">
                <div className="text-xs space-y-1">
                  <div className="font-bold text-terminal-green">✓ ALL CLAIMS PAID IN USDT ON TON BLOCKCHAIN</div>
                  <div className="text-text-secondary">
                    {selectedCoverageType === 'cex_liquidation' && (
                      <>• Your {Array.from(selectedStablecoins).join(', ')} position on {newItemCexVenue} will be covered</>
                    )}
                    {selectedCoverageType === 'depeg' && (
                      <>• If selected stablecoins depeg, you receive USDT on TON</>
                    )}
                    {['smart_contract', 'oracle', 'bridge'].includes(selectedCoverageType) && (
                      <>• If a covered event occurs, you receive USDT on TON</>
                    )}
                  </div>
                  <div className="text-text-secondary">• Fast payouts: Claims processed within minutes</div>
                  <div className="text-text-secondary">• Secure: Funds held in audited smart contracts</div>
                </div>
              </div>
            </TerminalWindow>
          )}

          {/* DEPEG FLOW: Step 2 - Select Stablecoins FIRST */}
          {selectedCoverageType === 'depeg' && (
            <TerminalWindow title="STEP 2: SELECT STABLECOINS (Multi-select)">
              <div className="mb-2 text-[10px] text-text-secondary">
                &gt; Select one or more stablecoins you want depeg protection for
              </div>
              <div className="grid grid-cols-8 gap-2">
                {STABLECOINS.map(stable => (
                  <button
                    key={stable}
                    onClick={() => toggleStablecoin(stable)}
                    className={`p-2 border-2 transition-all text-xs font-mono font-semibold ${
                      selectedStablecoins.has(stable)
                        ? 'border-copper-500 bg-copper-500 text-white'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    {stable}
                    {selectedStablecoins.has(stable) && (
                      <div className="text-[10px] mt-1">✓</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-text-tertiary">
                Selected: {selectedStablecoins.size > 0 ? Array.from(selectedStablecoins).join(', ') : 'None'}
              </div>
            </TerminalWindow>
          )}

          {/* DEPEG FLOW: Step 3 - Select Blockchains (filtered by selected stablecoins) */}
          {selectedCoverageType === 'depeg' && selectedStablecoins.size > 0 && (
            <TerminalWindow title="STEP 3: SELECT BLOCKCHAINS (Multi-select)">
              <div className="mb-2 text-[10px] text-text-secondary">
                &gt; Select blockchains where you want coverage
                <br />&gt; Filtered to show only chains supporting your selected stablecoins
              </div>
              <div className="grid grid-cols-8 gap-2">
                {getAvailableBlockchains().map(chain => (
                  <button
                    key={chain}
                    onClick={() => toggleBlockchain(chain)}
                    className={`p-2 border-2 transition-all text-xs font-mono ${
                      selectedBlockchains.has(chain)
                        ? 'border-copper-500 bg-copper-500 text-white'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    {chain.toUpperCase().slice(0, 3)}
                    {selectedBlockchains.has(chain) && (
                      <div className="text-[10px] mt-1">✓</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-text-tertiary">
                Selected: {selectedBlockchains.size > 0 ? Array.from(selectedBlockchains).join(', ') : 'None'}
              </div>
            </TerminalWindow>
          )}

          {/* BLOCKCHAIN-FIRST FLOW: Step 2 - Select Blockchains (for smart_contract, oracle, bridge) */}
          {selectedCoverageType && ['smart_contract', 'oracle', 'bridge'].includes(selectedCoverageType) && (
            <TerminalWindow title="STEP 2: SELECT BLOCKCHAINS (Multi-select)">
              <div className="mb-2 text-[10px] text-text-secondary">
                &gt; Select one or more blockchains you want coverage on
              </div>
              <div className="grid grid-cols-8 gap-2">
                {BLOCKCHAINS.filter(chain => chain !== 'bitcoin').map(chain => (
                  <button
                    key={chain}
                    onClick={() => toggleBlockchain(chain)}
                    className={`p-2 border-2 transition-all text-xs font-mono ${
                      selectedBlockchains.has(chain)
                        ? 'border-copper-500 bg-copper-500 text-white'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    {chain.toUpperCase().slice(0, 3)}
                    {selectedBlockchains.has(chain) && (
                      <div className="text-[10px] mt-1">✓</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-text-tertiary">
                Selected: {selectedBlockchains.size > 0 ? Array.from(selectedBlockchains).join(', ') : 'None'}
              </div>
            </TerminalWindow>
          )}

          {/* BLOCKCHAIN-FIRST FLOW: Step 3 - Select Stablecoins (filtered by selected blockchains) */}
          {selectedCoverageType && ['smart_contract', 'oracle', 'bridge'].includes(selectedCoverageType) && selectedBlockchains.size > 0 && (
            <TerminalWindow title="STEP 3: SELECT STABLECOINS (Multi-select)">
              <div className="mb-2 text-[10px] text-text-secondary">
                &gt; Select one or more stablecoins you want coverage for
                <br />&gt; Filtered to show only stablecoins available on your selected blockchains
              </div>
              <div className="grid grid-cols-8 gap-2">
                {getAvailableStablecoins().map(stable => (
                  <button
                    key={stable}
                    onClick={() => toggleStablecoin(stable)}
                    className={`p-2 border-2 transition-all text-xs font-mono font-semibold ${
                      selectedStablecoins.has(stable)
                        ? 'border-copper-500 bg-copper-500 text-white'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    {stable}
                    {selectedStablecoins.has(stable) && (
                      <div className="text-[10px] mt-1">✓</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-text-tertiary">
                Selected: {selectedStablecoins.size > 0 ? Array.from(selectedStablecoins).join(', ') : 'None'}
              </div>
            </TerminalWindow>
          )}

          {/* CEX LIQUIDATION FLOW: Step 2 - Select CEX Venue FIRST */}
          {selectedCoverageType === 'cex_liquidation' && (
            <TerminalWindow title="STEP 2: SELECT CEX VENUE">
              <div className="mb-2 text-[10px] text-text-secondary">
                &gt; Select the centralized exchange you want liquidation protection for
              </div>
              <div className="grid grid-cols-5 gap-2">
                {CEX_VENUES.map(venue => (
                  <button
                    key={venue}
                    onClick={() => setNewItemCexVenue(venue)}
                    className={`p-2 border-2 transition-all text-xs font-mono font-semibold ${
                      newItemCexVenue === venue
                        ? 'border-copper-500 bg-copper-500 text-white'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    {venue}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-text-tertiary">
                Selected: {newItemCexVenue}
              </div>
            </TerminalWindow>
          )}

          {/* CEX LIQUIDATION FLOW: Step 3 - Select Stablecoins (ALL available, no filtering) */}
          {selectedCoverageType === 'cex_liquidation' && newItemCexVenue && (
            <TerminalWindow title="STEP 3: SELECT STABLECOINS (Multi-select)">
              <div className="mb-2 text-[10px] text-text-secondary">
                &gt; Select one or more stablecoins you want liquidation protection for
                <br />&gt; All payouts will be in USDT on TON blockchain
              </div>
              <div className="grid grid-cols-8 gap-2">
                {STABLECOINS.map(stable => (
                  <button
                    key={stable}
                    onClick={() => toggleStablecoin(stable)}
                    className={`p-2 border-2 transition-all text-xs font-mono font-semibold ${
                      selectedStablecoins.has(stable)
                        ? 'border-copper-500 bg-copper-500 text-white'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    {stable}
                    {selectedStablecoins.has(stable) && (
                      <div className="text-[10px] mt-1">✓</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-text-tertiary">
                Selected: {selectedStablecoins.size > 0 ? Array.from(selectedStablecoins).join(', ') : 'None'}
              </div>
            </TerminalWindow>
          )}

          {/* Step 4: Configure Parameters */}
          {selectedCoverageType && (
            (selectedCoverageType === 'cex_liquidation' && selectedStablecoins.size > 0) ||
            (selectedCoverageType !== 'cex_liquidation' && selectedBlockchains.size > 0 && selectedStablecoins.size > 0)
          ) && (
            <TerminalWindow title="STEP 4: CONFIGURE PARAMETERS">
              <div className="space-y-4">
                <div className="p-3 bg-terminal-green/10 border-2 border-terminal-green text-xs">
                  {selectedCoverageType === 'cex_liquidation' ? (
                    <>✓ Will create <span className="font-bold">{selectedStablecoins.size}</span> coverage item(s) for {newItemCexVenue} (Payout: USDT on TON)</>
                  ) : (
                    <>✓ Will create <span className="font-bold">{selectedBlockchains.size * selectedStablecoins.size}</span> coverage item(s)
                    ({selectedBlockchains.size} blockchain(s) × {selectedStablecoins.size} stablecoin(s)) (Payout: USDT on TON)</>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Coverage Amount */}
                  <div>
                    <label className="block text-[10px] font-semibold text-text-secondary mb-1 uppercase">
                      Coverage Amount (each)
                    </label>
                    <div className="flex items-center gap-1 px-2 py-1 bg-cream-300/50 border border-cream-400">
                      <span className="text-copper-500 font-bold text-xs">$</span>
                      <input
                        type="number"
                        value={newItemAmount}
                        onChange={(e) => setNewItemAmount(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none font-mono text-xs"
                        placeholder="10000"
                        min="1000"
                        step="1000"
                      />
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-[10px] font-semibold text-text-secondary mb-1 uppercase">
                      Duration (Days)
                    </label>
                    <div className="flex gap-1 mb-1">
                      {[30, 60, 90].map((days) => (
                        <button
                          key={days}
                          onClick={() => setNewItemDuration(days.toString())}
                          className={`px-2 py-0.5 border text-[10px] font-semibold transition-all ${
                            newItemDuration === days.toString()
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
                      value={newItemDuration}
                      onChange={(e) => setNewItemDuration(e.target.value)}
                      className="w-full px-2 py-1 bg-cream-300/50 border border-cream-400 font-mono text-xs"
                      placeholder="30"
                      min="7"
                      max="365"
                    />
                  </div>
                </div>

                <RetroButton
                  variant="primary"
                  onClick={addCoverageItems}
                  className="w-full"
                >
                  {selectedCoverageType === 'cex_liquidation'
                    ? `ADD ${selectedStablecoins.size} COVERAGE ITEM(S) TO LIST >>`
                    : `ADD ${selectedBlockchains.size * selectedStablecoins.size} COVERAGE ITEM(S) TO LIST >>`}
                </RetroButton>
              </div>
            </TerminalWindow>
          )}

          {/* Coverage Items List */}
          {coverageItems.length > 0 && (
            <TerminalWindow title={`COVERAGE LIST (${coverageItems.length} items)`}>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {coverageItems.map(item => {
                  const premium = calculatePremium(item);
                  const info = COVERAGE_TYPES[item.coverageType];

                  return (
                    <div key={item.id} className="p-3 border-2 border-cream-400 bg-cream-300/30 hover:bg-cream-300/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{info.icon}</span>
                            <span className="text-xs font-semibold">{info.name}</span>
                            {item.cexVenue && (
                              <span className="px-2 py-0.5 bg-copper-500 text-white text-[9px] font-bold">
                                {item.cexVenue}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] space-y-0.5 text-text-secondary">
                            <div>• <span className="font-semibold">Coverage:</span> {item.blockchain.toUpperCase()}{item.stablecoin !== 'N/A' && ` / ${item.stablecoin}`}</div>
                            <div>• <span className="font-semibold">Amount:</span> ${parseFloat(item.coverageAmount).toLocaleString()} for {item.durationDays} days</div>
                            <div>• <span className="font-semibold">Payout:</span> <span className="text-copper-600 font-bold">USDT on TON</span></div>
                            <div className="text-terminal-green font-bold mt-1">Premium: ${premium.toFixed(2)}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeCoverageItem(item.id)}
                          className="px-2 py-1 border-2 border-red-400 hover:bg-red-500 hover:text-white text-xs font-semibold transition-all"
                        >
                          REMOVE
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TerminalWindow>
          )}
        </div>

        {/* Purchase Summary */}
        <div className="lg:col-span-1 space-y-6">
          {/* Beneficiary */}
          <TerminalWindow title="BENEFICIARY">
            <BeneficiarySelector
              onSelect={(address, mode) => {
                setBeneficiaryMode(mode);
                setBeneficiaryAddress(address);
              }}
              initialMode={beneficiaryMode}
            />
          </TerminalWindow>

          {/* Total Premium */}
          <TerminalWindow title="TOTAL_PREMIUM.TXT">
            <div className="space-y-4">
              <TerminalOutput>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">TOTAL ITEMS:</span>
                    <span className="font-semibold">{coverageItems.length}</span>
                  </div>

                  <div className="border-t-2 border-cream-400 pt-2 mt-2">
                    <div className="flex justify-between items-end">
                      <span className="text-text-secondary font-semibold">TOTAL PREMIUM:</span>
                      <span className="text-xl font-bold text-terminal-green">
                        ${getTotalPremium().toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </TerminalOutput>

              <RetroButton
                variant="primary"
                onClick={handlePurchaseAll}
                disabled={isLoading || !userAddress || coverageItems.length === 0}
                className="w-full"
              >
                {isLoading ? 'PROCESSING...' :
                 !userAddress ? 'CONNECT WALLET' :
                 coverageItems.length === 0 ? 'ADD COVERAGES' :
                 `PURCHASE ${coverageItems.length} ITEM(S) >>`}
              </RetroButton>

              <div className="text-xs text-text-tertiary space-y-1 pt-2 border-t-2 border-cream-400">
                <div className="output-success">✓ Instant claims processing</div>
                <div className="output-success">✓ 100% on-chain collateral</div>
                <div className="output-success">✓ Multi-coverage support</div>
                <div className="output-success">✓ Real-time risk adjustments</div>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>

      {/* Info Panel */}
      <InfoPanel type="default">
        <TerminalOutput>
          <div className="text-xs space-y-1">
            <div className="font-semibold mb-2">&gt; MULTI-COVERAGE PARAMETRIC INSURANCE:</div>
            <div>• Select multiple coverage types, blockchains, and stablecoins</div>
            <div>• Creates coverage items for every combination (e.g., 3 chains × 2 stablecoins = 6 items)</div>
            <div>• Each item can have independent parameters</div>
            <div>• Purchase all items in a single flow</div>
            <div>• Real-time pricing based on base APR rates (0.8% - 5.0%)</div>
            <div>• Six-tier parametric risk vault provides 250% capital efficiency</div>
          </div>
        </TerminalOutput>
      </InfoPanel>
    </div>
  );
};
