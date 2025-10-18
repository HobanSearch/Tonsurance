import { useState, useEffect } from 'react';

export type CoverageType = 'depeg' | 'smart_contract' | 'oracle' | 'bridge' | 'cex_liquidation';

export type Blockchain =
  | 'ethereum'
  | 'arbitrum'
  | 'base'
  | 'polygon'
  | 'bitcoin'
  | 'lightning'
  | 'ton'
  | 'solana';

export type Stablecoin =
  | 'USDC'
  | 'USDT'
  | 'USDP'
  | 'DAI'
  | 'FRAX'
  | 'BUSD'
  | 'USDe'
  | 'sUSDe'
  | 'USDY'
  | 'PYUSD'
  | 'GHO'
  | 'LUSD'
  | 'crvUSD'
  | 'mkUSD';

export interface ProductSelection {
  coverageType: CoverageType;
  blockchain: Blockchain;
  stablecoin: Stablecoin;
  baseRateApr: number; // 0.8% - 5%
  chainMultiplier: number; // 0.9x - 1.4x
  stablecoinAdjustmentBps: number; // +0 to +150 bps
  effectiveApr: number; // Final APR after all adjustments
}

interface CoverageTypeInfo {
  name: string;
  description: string;
  icon: string;
  baseRateApr: number; // Base APR for this coverage type
}

interface ChainInfo {
  name: string;
  icon: string;
  color: string;
  multiplier: number; // Risk multiplier
  supportedStablecoins: Stablecoin[];
}

interface StablecoinInfo {
  name: string;
  issuer: string;
  type: string;
  adjustmentBps: number; // Additional basis points
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

const CHAINS: Record<Blockchain, ChainInfo> = {
  ethereum: {
    name: 'Ethereum',
    icon: 'Ξ',
    color: 'text-purple-400',
    multiplier: 0.9, // Most secure
    supportedStablecoins: ['USDC', 'USDT', 'USDP', 'DAI', 'FRAX', 'BUSD', 'USDe', 'sUSDe', 'USDY', 'PYUSD', 'GHO', 'LUSD', 'crvUSD', 'mkUSD']
  },
  arbitrum: {
    name: 'Arbitrum',
    icon: '◆',
    color: 'text-blue-400',
    multiplier: 1.0,
    supportedStablecoins: ['USDC', 'USDT', 'DAI', 'FRAX', 'USDe', 'GHO', 'LUSD']
  },
  base: {
    name: 'Base',
    icon: '▲',
    color: 'text-blue-300',
    multiplier: 1.05,
    supportedStablecoins: ['USDC', 'USDT', 'DAI', 'USDe', 'PYUSD']
  },
  polygon: {
    name: 'Polygon',
    icon: '⬡',
    color: 'text-purple-300',
    multiplier: 1.1,
    supportedStablecoins: ['USDC', 'USDT', 'DAI', 'FRAX', 'USDP', 'GHO']
  },
  bitcoin: {
    name: 'Bitcoin',
    icon: '₿',
    color: 'text-orange-400',
    multiplier: 1.2, // Higher due to bridge complexity
    supportedStablecoins: ['USDT']
  },
  lightning: {
    name: 'Lightning',
    icon: '⚡',
    color: 'text-yellow-400',
    multiplier: 1.15,
    supportedStablecoins: ['USDT', 'USDC']
  },
  ton: {
    name: 'TON',
    icon: '◈',
    color: 'text-cyan-400',
    multiplier: 1.0,
    supportedStablecoins: ['USDT', 'USDC', 'USDe']
  },
  solana: {
    name: 'Solana',
    icon: '◎',
    color: 'text-purple-500',
    multiplier: 1.4, // Highest risk (network outages)
    supportedStablecoins: ['USDC', 'USDT', 'PYUSD', 'USDe']
  }
};

const STABLECOINS: Record<Stablecoin, StablecoinInfo> = {
  USDC: { name: 'USD Coin', issuer: 'Circle', type: 'Fiat-backed', adjustmentBps: 0 },
  USDT: { name: 'Tether', issuer: 'Tether', type: 'Fiat-backed', adjustmentBps: 10 },
  USDP: { name: 'Pax Dollar', issuer: 'Paxos', type: 'Fiat-backed', adjustmentBps: 5 },
  DAI: { name: 'Dai', issuer: 'MakerDAO', type: 'Crypto-collateralized', adjustmentBps: 20 },
  FRAX: { name: 'Frax', issuer: 'Frax Finance', type: 'Fractional-algorithmic', adjustmentBps: 50 },
  BUSD: { name: 'Binance USD', issuer: 'Binance/Paxos', type: 'Fiat-backed', adjustmentBps: 15 },
  USDe: { name: 'Ethena USDe', issuer: 'Ethena Labs', type: 'Delta-neutral', adjustmentBps: 80 },
  sUSDe: { name: 'Staked USDe', issuer: 'Ethena Labs', type: 'Yield-bearing', adjustmentBps: 120 },
  USDY: { name: 'Ondo US Dollar Yield', issuer: 'Ondo Finance', type: 'Yield-bearing', adjustmentBps: 100 },
  PYUSD: { name: 'PayPal USD', issuer: 'PayPal', type: 'Fiat-backed', adjustmentBps: 25 },
  GHO: { name: 'GHO', issuer: 'Aave', type: 'Crypto-collateralized', adjustmentBps: 40 },
  LUSD: { name: 'Liquity USD', issuer: 'Liquity', type: 'Crypto-collateralized', adjustmentBps: 60 },
  crvUSD: { name: 'Curve USD', issuer: 'Curve Finance', type: 'Crypto-collateralized', adjustmentBps: 70 },
  mkUSD: { name: 'Prisma mkUSD', issuer: 'Prisma Finance', type: 'Crypto-collateralized', adjustmentBps: 150 }
};

interface ProductSelectorProps {
  onSelect: (selection: ProductSelection) => void;
  initialCoverageType?: CoverageType;
  initialBlockchain?: Blockchain;
  initialStablecoin?: Stablecoin;
}

export const ProductSelector = ({
  onSelect,
  initialCoverageType = 'depeg',
  initialBlockchain = 'ethereum',
  initialStablecoin = 'USDC'
}: ProductSelectorProps) => {
  const [coverageType, setCoverageType] = useState<CoverageType>(initialCoverageType);
  const [blockchain, setBlockchain] = useState<Blockchain>(initialBlockchain);
  const [stablecoin, setStablecoin] = useState<Stablecoin>(initialStablecoin);
  const [showStablecoinDetails, setShowStablecoinDetails] = useState(false);

  // Calculate effective APR based on selection
  const calculateEffectiveApr = (
    coverage: CoverageType,
    chain: Blockchain,
    stable: Stablecoin
  ): ProductSelection => {
    const baseRateApr = COVERAGE_TYPES[coverage].baseRateApr;
    const chainMultiplier = CHAINS[chain].multiplier;
    const stablecoinAdjustmentBps = STABLECOINS[stable].adjustmentBps;

    // effectiveApr = baseRate * chainMultiplier + (adjustmentBps / 10000)
    const effectiveApr = (baseRateApr * chainMultiplier) + (stablecoinAdjustmentBps / 10000);

    return {
      coverageType: coverage,
      blockchain: chain,
      stablecoin: stable,
      baseRateApr,
      chainMultiplier,
      stablecoinAdjustmentBps,
      effectiveApr
    };
  };

  // Update parent when selection changes
  useEffect(() => {
    const selection = calculateEffectiveApr(coverageType, blockchain, stablecoin);
    onSelect(selection);
  }, [coverageType, blockchain, stablecoin, onSelect]);

  // Handle blockchain change and auto-select valid stablecoin
  const handleBlockchainChange = (chain: Blockchain) => {
    setBlockchain(chain);
    const supportedStablecoins = CHAINS[chain].supportedStablecoins;
    if (!supportedStablecoins.includes(stablecoin)) {
      setStablecoin(supportedStablecoins[0]);
    }
  };

  const currentChainStablecoins = CHAINS[blockchain].supportedStablecoins;
  const currentSelection = calculateEffectiveApr(coverageType, blockchain, stablecoin);

  return (
    <div className="space-y-6">
      {/* Coverage Type Selection */}
      <div>
        <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
          1. Select Coverage Type
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {(Object.keys(COVERAGE_TYPES) as CoverageType[]).map((type) => {
            const isSelected = type === coverageType;
            const info = COVERAGE_TYPES[type];
            return (
              <button
                key={type}
                onClick={() => setCoverageType(type)}
                className={`
                  relative p-4 border-3 transition-all text-left h-full flex flex-col
                  ${isSelected
                    ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665] scale-[1.02]'
                    : 'border-cream-400 hover:bg-cream-300 hover:border-copper-300'}
                `}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-copper-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{info.icon}</span>
                </div>
                <div className="font-semibold text-xs mb-1 break-words">
                  {info.name}
                </div>
                <div className="text-[10px] text-terminal-green font-mono font-bold">
                  {info.baseRateApr}% APR
                </div>
                <div className="text-[10px] text-text-tertiary mt-1 break-words leading-tight">
                  {info.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Blockchain Selection */}
      <div>
        <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
          2. Select Blockchain
        </h3>
        <div className="grid grid-cols-8 gap-3">
          {(Object.keys(CHAINS) as Blockchain[]).map((chain) => {
            const isSelected = chain === blockchain;
            const info = CHAINS[chain];
            return (
              <button
                key={chain}
                onClick={() => handleBlockchainChange(chain)}
                className={`
                  relative p-3 border-3 transition-all font-mono text-sm
                  ${isSelected
                    ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665]'
                    : 'border-cream-400 hover:bg-cream-300 hover:border-copper-300'}
                `}
              >
                <div className={`text-2xl mb-1 ${info.color}`}>{info.icon}</div>
                <div className="text-[10px] text-text-primary font-semibold mb-1">{info.name}</div>
                <div className={`text-[10px] font-mono font-bold ${
                  info.multiplier < 1 ? 'text-terminal-green' :
                  info.multiplier === 1 ? 'text-copper-400' :
                  info.multiplier < 1.2 ? 'text-copper-500' : 'text-terminal-red'
                }`}>
                  {info.multiplier.toFixed(2)}x
                </div>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-copper-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stablecoin Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-text-secondary font-mono text-xs font-semibold uppercase">
            3. Select Stablecoin ({currentChainStablecoins.length} Available on {CHAINS[blockchain].name})
          </h3>
          <button
            onClick={() => setShowStablecoinDetails(!showStablecoinDetails)}
            className="text-xs text-text-tertiary hover:text-copper-500 font-mono transition-colors"
          >
            {showStablecoinDetails ? 'HIDE DETAILS' : 'SHOW DETAILS'}
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {currentChainStablecoins.map(coin => {
            const isSelected = coin === stablecoin;
            const info = STABLECOINS[coin];

            return (
              <div key={coin} className="relative group">
                <button
                  onClick={() => setStablecoin(coin)}
                  className={`
                    w-full p-3 border-2 transition-all font-mono text-xs font-semibold
                    ${isSelected
                      ? 'border-copper-500 bg-copper-50 text-copper-500'
                      : 'border-cream-400 hover:border-copper-300 hover:bg-cream-300 text-text-primary'}
                  `}
                >
                  {coin}
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-copper-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </div>
                  )}
                  <div className={`text-[9px] mt-1 ${
                    info.adjustmentBps === 0 ? 'text-terminal-green' :
                    info.adjustmentBps < 50 ? 'text-copper-400' :
                    info.adjustmentBps < 100 ? 'text-copper-500' : 'text-terminal-red'
                  }`}>
                    +{info.adjustmentBps}bp
                  </div>
                </button>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-cream-200 border-2 border-cream-400 p-2 text-xs font-mono whitespace-nowrap shadow-lg">
                    <div className="text-copper-500 font-semibold">{info.name}</div>
                    <div className="text-text-secondary text-[10px]">{info.issuer}</div>
                    <div className="text-text-tertiary text-[10px]">{info.type}</div>
                    <div className="text-copper-500 text-[10px] font-bold mt-1">+{info.adjustmentBps} bps</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded stablecoin details */}
        {showStablecoinDetails && (
          <div className="mt-4 border-2 border-cream-400 bg-cream-300/50 p-4">
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              {currentChainStablecoins.map(coin => {
                const info = STABLECOINS[coin];
                return (
                  <div
                    key={coin}
                    className={`p-3 border-2 transition-all ${
                      coin === stablecoin
                        ? 'border-copper-500 bg-copper-50'
                        : 'border-cream-400 bg-cream-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-copper-500 font-bold">{coin}</span>
                      <span className="text-text-tertiary text-[10px]">{info.type}</span>
                    </div>
                    <div className="text-text-primary font-semibold">{info.name}</div>
                    <div className="text-text-tertiary text-[10px] mt-1">Issuer: {info.issuer}</div>
                    <div className="text-copper-500 text-[10px] font-bold mt-1">
                      Premium adjustment: +{info.adjustmentBps} bps
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Premium Breakdown Summary */}
      <div className="border-3 border-copper-500/30 bg-copper-50/20 p-4">
        <div className="font-mono text-xs space-y-3">
          <div className="text-text-secondary font-semibold mb-3 uppercase">Premium Calculation Breakdown</div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">Base Rate ({COVERAGE_TYPES[coverageType].name}):</span>
              <span className="text-text-primary font-semibold">
                {currentSelection.baseRateApr.toFixed(2)}% APR
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">Chain Multiplier ({CHAINS[blockchain].name}):</span>
              <span className={`font-semibold ${
                currentSelection.chainMultiplier < 1 ? 'text-terminal-green' :
                currentSelection.chainMultiplier === 1 ? 'text-copper-400' : 'text-copper-500'
              }`}>
                {currentSelection.chainMultiplier.toFixed(2)}x
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">Stablecoin Adjustment ({stablecoin}):</span>
              <span className={`font-semibold ${
                currentSelection.stablecoinAdjustmentBps === 0 ? 'text-terminal-green' : 'text-copper-500'
              }`}>
                +{currentSelection.stablecoinAdjustmentBps} bps
              </span>
            </div>

            <div className="border-t-2 border-cream-400 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary font-semibold">EFFECTIVE APR:</span>
                <span className="text-xl font-bold text-terminal-green">
                  {currentSelection.effectiveApr.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Example calculation */}
          <div className="border-t-2 border-cream-400 pt-3 mt-3">
            <div className="text-text-tertiary text-[10px] mb-2 uppercase">Example:</div>
            <div className="text-text-primary text-[11px]">
              Insuring <span className="text-copper-500 font-bold">$10,000 {stablecoin}</span> on{' '}
              <span className="text-copper-500 font-bold">{CHAINS[blockchain].name}</span> for{' '}
              <span className="text-copper-500 font-bold">90 days</span> costs{' '}
              <span className="text-terminal-green font-bold">
                ${(10000 * currentSelection.effectiveApr / 100 * (90 / 365)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Invalid combination warning */}
      {!currentChainStablecoins.includes(stablecoin) && (
        <div className="border-2 border-terminal-red bg-terminal-red/10 p-3">
          <div className="text-xs text-terminal-red font-mono font-bold">
            ⚠️ Invalid combination: {stablecoin} is not available on {CHAINS[blockchain].name}
          </div>
        </div>
      )}
    </div>
  );
};
