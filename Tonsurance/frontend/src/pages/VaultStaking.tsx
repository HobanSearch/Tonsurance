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

  // Fetch vault data from contracts
  useEffect(() => {
    const fetchVaultData = async () => {
      if (!isConfigured || !userAddress) return;

      setIsFetching(true);
      try {
        const userAddr = Address.parse(userAddress);

        // TODO: Implement contract calls for 6-tier vaults when available
        // For now, vaults will show mock data (0 TVL)

        // Example structure for when contracts are deployed:
        // if (contracts.btcVault) {
        //   const [tvl, userStaked] = await Promise.all([
        //     contracts.btcVault.getTotalCapital(),
        //     contracts.btcVault.getUserBalance(userAddr),
        //   ]);
        //   setVaults((prev) => ({
        //     ...prev,
        //     btc: { ...prev.btc, tvl: parseFloat(fromNano(tvl)), userStaked: parseFloat(fromNano(userStaked)) }
        //   }));
        // }

      } catch (error) {
        console.error('Error fetching vault data:', error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchVaultData();
    const interval = setInterval(fetchVaultData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [isConfigured, userAddress, contracts]);

  const handleStake = async () => {
    if (!userAddress) {
      alert('Please connect your wallet first');
      return;
    }

    if (!isConfigured) {
      alert('Contracts not configured. Please deploy contracts and update .env file.');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    try {
      const amountNano = toNano(amount);
      const gasAmount = toNano('0.1');

      // TODO: Implement contract calls for 6-tier vaults when available
      const collateral = collateralOptions[selectedCollateral];
      alert(`${action === 'stake' ? 'Staking' : 'Unstaking'} ${amount} ${collateral.symbol} to ${vaults[selectedVault].name}.\n\nContracts for 6-tier vault system will be deployed soon.`);

      // Example structure for when contracts are deployed:
      // if (action === 'stake') {
      //   if (selectedVault === 'btc' && contracts.btcVault) {
      //     await contracts.btcVault.sendDeposit(sender, { value: amountNano + gasAmount, amount: amountNano });
      //   }
      //   // ... similar for other vaults
      // } else {
      //   if (selectedVault === 'btc' && contracts.btcVault) {
      //     await contracts.btcVault.sendWithdraw(sender, { value: gasAmount, amount: amountNano });
      //   }
      //   // ... similar for other vaults
      // }

      setAmount('');
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
                      {vault.apy}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">RISK:</span>
                    <span className="font-semibold">
                      {vault.riskLevel}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">ALLOC:</span>
                    <span className="font-semibold">
                      {vault.allocation}%
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
                {isLoading ? 'PROCESSING...' : userAddress ? `${action === 'stake' ? 'STAKE' : 'UNSTAKE'} ${collateralOptions[selectedCollateral].symbol} >>` : 'CONNECT WALLET'}
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
                  {selectedVault === 'tradfi' && (
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
