import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano, fromNano, Address } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, TerminalOutput, RetroButton, InfoPanel } from '../components/terminal';

type VaultType = 'btc' | 'snr' | 'mezz' | 'jnr' | 'jnr_plus' | 'eqt';
type CollateralType = 'stablecoin' | 'ton' | 'wbtc';

interface VaultStats {
  tvl: number;
  apy: number;
  userBalance: number;
  userStaked: number;
  allocation: number;
  utilization: number; // Percentage of capacity used
  availableCapacity: number; // In USD
  riskLevel: string;
  name: string;
  description: string;
}

interface CollateralOption {
  name: string;
  symbol: string;
  icon: string;
  description: string;
}

export const VaultStaking = () => {
  const userAddress = useTonAddress();
  const { contracts, sender, isConfigured } = useContracts();
  const [selectedVault, setSelectedVault] = useState<VaultType>('btc');
  const [selectedCollateral, setSelectedCollateral] = useState<CollateralType>('ton');
  const [amount, setAmount] = useState<string>('');
  const [action, setAction] = useState<'stake' | 'unstake'>('stake');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const collateralOptions: Record<CollateralType, CollateralOption> = {
    stablecoin: {
      name: 'Stablecoin',
      symbol: 'USDT/USDC',
      icon: '💵',
      description: 'Stake with USDT or USDC'
    },
    ton: {
      name: 'TON',
      symbol: 'TON',
      icon: '⚡',
      description: 'Stake with native TON'
    },
    wbtc: {
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      icon: '₿',
      description: 'Stake with Wrapped Bitcoin on TON'
    }
  };

  const [vaults, setVaults] = useState<Record<VaultType, VaultStats>>({
    btc: {
      tvl: 0,
      apy: 4.0,
      userBalance: 0,
      userStaked: 0,
      allocation: 25,
      utilization: 0,
      availableCapacity: 0,
      riskLevel: 'Safest',
      name: 'SURE-BTC',
      description: 'Bitcoin-focused, safest tranche with lowest risk'
    },
    snr: {
      tvl: 0,
      apy: 6.5,
      userBalance: 0,
      userStaked: 0,
      allocation: 20,
      utilization: 0,
      availableCapacity: 0,
      riskLevel: 'Very Low',
      name: 'SURE-SNR',
      description: 'Senior tranche, institutional-grade capital'
    },
    mezz: {
      tvl: 0,
      apy: 9.0,
      userBalance: 0,
      userStaked: 0,
      allocation: 18,
      utilization: 0,
      availableCapacity: 0,
      riskLevel: 'Low',
      name: 'SURE-MEZZ',
      description: 'Mezzanine tranche, balanced risk-reward'
    },
    jnr: {
      tvl: 0,
      apy: 12.5,
      userBalance: 0,
      userStaked: 0,
      allocation: 15,
      utilization: 0,
      availableCapacity: 0,
      riskLevel: 'Medium',
      name: 'SURE-JNR',
      description: 'Junior tranche, higher yield for DeFi natives'
    },
    jnr_plus: {
      tvl: 0,
      apy: 16.0,
      userBalance: 0,
      userStaked: 0,
      allocation: 12,
      utilization: 0,
      availableCapacity: 0,
      riskLevel: 'High',
      name: 'SURE-JNR+',
      description: 'Junior Plus tranche, aggressive yield seekers'
    },
    eqt: {
      tvl: 0,
      apy: 20.0,
      userBalance: 0,
      userStaked: 0,
      allocation: 10,
      utilization: 0,
      availableCapacity: 0,
      riskLevel: 'Highest',
      name: 'SURE-EQT',
      description: 'Equity tranche, maximum risk and reward'
    }
  });

  // Auto-switch collateral if wBTC selected but vault changed away from BTC
  useEffect(() => {
    if (selectedCollateral === 'wbtc' && selectedVault !== 'btc') {
      setSelectedCollateral('ton'); // Switch to TON as default
    }
  }, [selectedVault, selectedCollateral]);

  // Fetch vault data from contracts and API
  const fetchVaultData = async () => {
    setIsFetching(true);
    try {
      // In production: Fetch from Agent 5's API
      // GET /api/v2/tranches/apy
      // Response: { btc: { apy: 4.2, tvl: 1000000, utilization: 45, available_capacity: 550000 }, ... }

      // Mock real-time APY data (would come from WebSocket in production)
      const mockApyData = {
        btc: { apy: 4.2, tvl: 1_250_000, utilization: 45, availableCapacity: 550_000 },
        snr: { apy: 6.8, tvl: 950_000, utilization: 52, availableCapacity: 480_000 },
        mezz: { apy: 9.3, tvl: 720_000, utilization: 60, availableCapacity: 320_000 },
        jnr: { apy: 12.7, tvl: 580_000, utilization: 68, availableCapacity: 220_000 },
        jnr_plus: { apy: 16.4, tvl: 430_000, utilization: 78, availableCapacity: 120_000 },
        eqt: { apy: 20.2, tvl: 320_000, utilization: 92, availableCapacity: 28_000 }
      };

      setVaults(prev => ({
        btc: { ...prev.btc, ...mockApyData.btc },
        snr: { ...prev.snr, ...mockApyData.snr },
        mezz: { ...prev.mezz, ...mockApyData.mezz },
        jnr: { ...prev.jnr, ...mockApyData.jnr },
        jnr_plus: { ...prev.jnr_plus, ...mockApyData.jnr_plus },
        eqt: { ...prev.eqt, ...mockApyData.eqt }
      }));

      // If user connected, fetch user-specific data from contracts
      if (isConfigured && userAddress) {
        const userAddr = Address.parse(userAddress);
        // TODO: Implement contract calls for user balances when deployed
      }

    } catch (error) {
      console.error('Error fetching vault data:', error);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchVaultData();

    // Setup WebSocket for real-time APY updates
    // const ws = new WebSocket('ws://localhost:8080/ws');
    // ws.onopen = () => {
    //   ws.send(JSON.stringify({ type: 'subscribe', channel: 'tranche_apy' }));
    // };
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   if (data.type === 'tranche_apy_update') {
    //     setVaults(prev => ({
    //       ...prev,
    //       [data.tranche]: { ...prev[data.tranche], apy: data.apy, utilization: data.utilization }
    //     }));
    //   }
    // };

    const interval = setInterval(fetchVaultData, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [isConfigured, userAddress]);

  const handleStake = async () => {
    if (!userAddress) {
      alert('Please connect your wallet first');
      return;
    }

    if (!contracts.multiTrancheVault) {
      alert('MultiTrancheVault not configured. Please deploy and update .env');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    try {
      const amountNano = toNano(amount);
      const gasAmount = toNano('0.15'); // Increased for new security fixes

      // Map vault type to tranche ID
      const trancheIdMap: Record<VaultType, number> = {
        btc: 1,        // TRANCHE_BTC
        snr: 2,        // TRANCHE_SNR
        mezz: 3,       // TRANCHE_MEZZ
        jnr: 4,        // TRANCHE_JNR
        jnr_plus: 5,   // TRANCHE_JNR_PLUS
        eqt: 6,        // TRANCHE_EQT
      };

      const trancheId = trancheIdMap[selectedVault];

      if (action === 'stake') {
        // Deposit to MultiTrancheVault
        await contracts.multiTrancheVault.sendDeposit(sender, {
          value: amountNano + gasAmount,
          trancheId: trancheId
        });
        alert(`Successfully deposited ${amount} TON to ${vaults[selectedVault].name}!`);
      } else {
        // Withdraw from MultiTrancheVault
        await contracts.multiTrancheVault.sendWithdraw(sender, {
          value: gasAmount,
          trancheId: trancheId,
          amount: amountNano
        });
        alert(`Successfully withdrew ${amount} tokens from ${vaults[selectedVault].name}!`);
      }

      setAmount('');
      // Refresh vault data
      fetchVaultData();
    } catch (error: any) {
      console.error(`Error ${action}ing:`, error);
      if (error.message?.includes('User rejected')) {
        alert('Transaction was rejected');
      } else if (error.message?.includes('Insufficient')) {
        alert('Insufficient balance for transaction');
      } else {
        alert(`Failed to ${action}: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <TerminalWindow title="VAULT_STAKING">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Initializing vault staking interface...<br />
            &gt; <span className="output-success">✓ Connected to 6-tier vault system</span><br />
            &gt; Earn yield by providing liquidity to insurance vaults
          </div>
        </TerminalOutput>
      </TerminalWindow>

      {/* Collateral Selection */}
      <TerminalWindow title="STEP_1: SELECT_COLLATERAL">
        <div className="mb-3 text-xs text-text-secondary">
          &gt; Choose your deposit asset
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {(Object.keys(collateralOptions) as CollateralType[]).map((type) => {
            const collateral = collateralOptions[type];
            const isSelected = selectedCollateral === type;
            // wBTC can only be used with BTC vault
            const isDisabled = type === 'wbtc' && selectedVault !== 'btc';
            return (
              <button
                key={type}
                onClick={() => !isDisabled && setSelectedCollateral(type)}
                disabled={isDisabled}
                className={`p-3 border-2 transition-all text-left ${
                  isSelected
                    ? 'border-copper-500 bg-copper-50'
                    : isDisabled
                    ? 'border-cream-400 bg-cream-200 opacity-50 cursor-not-allowed'
                    : 'border-cream-400 hover:bg-cream-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{collateral.icon}</span>
                  <div>
                    <div className="font-semibold text-sm text-copper-500">
                      {collateral.name}
                    </div>
                    <div className="text-xs text-text-tertiary font-mono">
                      {collateral.symbol}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-text-secondary">
                  {isDisabled ? '⚠️ Only available for SURE-BTC vault' : collateral.description}
                </div>
              </button>
            );
          })}
        </div>
      </TerminalWindow>

      {/* Vault Selection */}
      <TerminalWindow title="STEP_2: SELECT_VAULT">
        <div className="mb-3 text-xs text-text-secondary">
          &gt; Choose your risk/reward tier
        </div>
        <div className="grid md:grid-cols-3 gap-4">
        {(Object.keys(vaults) as VaultType[]).map((vaultType) => {
          const vault = vaults[vaultType];
          const isSelected = selectedVault === vaultType;

          const vaultIcons: Record<VaultType, string> = {
            btc: '🟦',
            snr: '🟩',
            mezz: '🟨',
            jnr: '🟧',
            jnr_plus: '🟥',
            eqt: '🟪'
          };

          return (
            <button
              key={vaultType}
              onClick={() => setSelectedVault(vaultType)}
              className={`p-3 border-2 transition-all text-left ${
                isSelected
                  ? 'border-copper-500 bg-copper-50'
                  : 'border-cream-400 hover:bg-cream-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 pb-2 border-b-2 border-cream-400">
                  <span className="text-lg">{vaultIcons[vaultType]}</span>
                  <h3 className="text-sm font-bold text-copper-500 uppercase">
                    {vault.name}
                  </h3>
                </div>

                <div className="text-xs text-text-secondary">
                  {vault.description}
                </div>

                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">APY:</span>
                    <span className="text-lg font-bold text-terminal-green">
                      {vault.apy.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">TVL:</span>
                    <span className="font-semibold text-copper-500">
                      ${(vault.tvl / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">UTILIZATION:</span>
                    <span className={`font-semibold ${
                      vault.utilization > 85 ? 'text-terminal-red' :
                      vault.utilization > 70 ? 'text-copper-500' : 'text-terminal-green'
                    }`}>
                      {vault.utilization}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">CAPACITY:</span>
                    <span className="font-semibold text-text-primary">
                      ${(vault.availableCapacity / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">RISK:</span>
                    <span className="font-semibold">
                      {vault.riskLevel}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      </TerminalWindow>

      {/* Staking Interface */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <TerminalWindow title="STEP_3: STAKE_AMOUNT">
            <div className="space-y-5">
              <div className="flex gap-2">
                <RetroButton
                  onClick={() => setAction('stake')}
                  variant={action === 'stake' ? 'primary' : 'default'}
                  className="flex-1"
                >
                  &gt; STAKE
                </RetroButton>
                <RetroButton
                  onClick={() => setAction('unstake')}
                  variant={action === 'unstake' ? 'primary' : 'default'}
                  className="flex-1"
                >
                  &gt; UNSTAKE
                </RetroButton>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
                  Amount ({collateralOptions[selectedCollateral].symbol})
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-cream-300/50 border border-cream-400">
                  <span className="text-copper-500 font-bold text-lg">{collateralOptions[selectedCollateral].icon}</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none font-mono text-sm"
                    placeholder="0.00"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-xs text-text-tertiary font-mono">{collateralOptions[selectedCollateral].symbol}</span>
                </div>
                <div className="flex justify-between items-center mt-1.5 text-xs">
                  <span className="text-text-tertiary">
                    {action === 'stake' ? 'Available' : 'Staked'}: {vaults[selectedVault][action === 'stake' ? 'userBalance' : 'userStaked']} {collateralOptions[selectedCollateral].symbol}
                  </span>
                  <button
                    onClick={() => setAmount(vaults[selectedVault][action === 'stake' ? 'userBalance' : 'userStaked'].toString())}
                    className="text-copper-500 font-semibold hover:text-copper-600"
                  >
                    [MAX]
                  </button>
                </div>
              </div>

              <RetroButton
                onClick={handleStake}
                disabled={isLoading || !userAddress || !amount}
                variant="primary"
                className="w-full"
              >
                {isLoading ? 'PROCESSING...' : userAddress ? `${action === 'stake' ? 'STAKE' : 'UNSTAKE'} ${collateralOptions[selectedCollateral].symbol} >>` : 'CONNECT TON WALLET'}
              </RetroButton>
            </div>
          </TerminalWindow>
        </div>

        {/* User Stats */}
        <div className="md:col-span-1">
          <TerminalWindow title="YOUR_POSITION">
            <div className="space-y-4">
              <div className="p-2 bg-cream-300/30 border border-cream-400">
                <div className="text-xs text-text-secondary mb-1">SELECTED VAULT:</div>
                <div className="font-bold text-sm text-copper-500">{vaults[selectedVault].name}</div>
                <div className="text-xs text-text-tertiary mt-1">{vaults[selectedVault].description}</div>
              </div>

              <div className="p-2 bg-cream-300/30 border border-cream-400">
                <div className="text-xs text-text-secondary mb-1">COLLATERAL:</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{collateralOptions[selectedCollateral].icon}</span>
                  <div className="font-bold text-sm text-copper-500">{collateralOptions[selectedCollateral].name}</div>
                </div>
              </div>

              <TerminalOutput>
                <div className="space-y-3 text-xs font-mono">
                  <div>
                    <div className="text-text-secondary mb-1">TOTAL STAKED:</div>
                    <div className="text-xl font-bold text-terminal-green">
                      {vaults[selectedVault].userStaked.toLocaleString()} {collateralOptions[selectedCollateral].symbol}
                    </div>
                  </div>

                  <div>
                    <div className="text-text-secondary mb-1">ESTIMATED APY:</div>
                    <div className="text-xl font-bold text-terminal-green">
                      {vaults[selectedVault].apy}%
                    </div>
                  </div>

                  <div>
                    <div className="text-text-secondary mb-1">EARNINGS (30D):</div>
                    <div className="text-lg font-bold">
                      ~0 {collateralOptions[selectedCollateral].symbol}
                    </div>
                  </div>
                </div>
              </TerminalOutput>

              <div className="border-t-2 border-cream-400 pt-3">
                <div className="text-xs space-y-1.5">
                  <div className="output-success">✓ Rewards distributed daily</div>
                  <div className="output-success">✓ No lock-up period</div>
                  <div className="output-success">✓ Automatic compounding</div>
                  {selectedVault === 'tradfi' as any && (
                    <div className="output-error">
                      ⚠ Requires KYC verification
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>

      {/* Vault Info */}
      <InfoPanel type="default">
        <TerminalOutput>
          <div className="text-xs space-y-3">
            <div className="font-semibold mb-2 text-copper-500">&gt; 6-TIER WATERFALL STRUCTURE:</div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <div className="font-semibold mb-1.5 text-sm">🟦 SURE-BTC (4% APY)</div>
                <p>Safest tranche. Bitcoin-focused capital with lowest risk exposure. First to receive returns, last to absorb losses.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">🟩 SURE-SNR (6.5% APY)</div>
                <p>Senior tranche. Institutional-grade capital with very low risk. Second priority in waterfall structure.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">🟨 SURE-MEZZ (9% APY)</div>
                <p>Mezzanine tranche. Balanced risk-reward profile. Middle tier in loss absorption waterfall.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">🟧 SURE-JNR (12.5% APY)</div>
                <p>Junior tranche. Higher yields for DeFi natives. Fourth in line for loss absorption.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">🟥 SURE-JNR+ (16% APY)</div>
                <p>Junior Plus tranche. Aggressive yield seekers. Fifth tier with higher risk and rewards.</p>
              </div>
              <div>
                <div className="font-semibold mb-1.5 text-sm">🟪 SURE-EQT (20% APY)</div>
                <p>Equity tranche. Maximum risk and reward. First-loss capital, highest APY, most volatile returns.</p>
              </div>
            </div>
          </div>
        </TerminalOutput>
      </InfoPanel>
    </div>
  );
};
