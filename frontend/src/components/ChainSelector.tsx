import { useState } from 'react';
import { RetroButton } from './terminal';

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

interface ChainInfo {
  name: string;
  icon: string;
  color: string;
  supportedStablecoins: Stablecoin[];
}

const CHAINS: Record<Blockchain, ChainInfo> = {
  ethereum: {
    name: 'Ethereum',
    icon: 'Ξ',
    color: 'text-purple-400',
    supportedStablecoins: ['USDC', 'USDT', 'USDP', 'DAI', 'FRAX', 'BUSD', 'USDe', 'sUSDe', 'USDY', 'PYUSD', 'GHO', 'LUSD', 'crvUSD', 'mkUSD']
  },
  arbitrum: {
    name: 'Arbitrum',
    icon: '◆',
    color: 'text-blue-400',
    supportedStablecoins: ['USDC', 'USDT', 'DAI', 'FRAX', 'USDe', 'GHO', 'LUSD']
  },
  base: {
    name: 'Base',
    icon: '▲',
    color: 'text-blue-300',
    supportedStablecoins: ['USDC', 'USDT', 'DAI', 'USDe', 'PYUSD']
  },
  polygon: {
    name: 'Polygon',
    icon: '⬡',
    color: 'text-purple-300',
    supportedStablecoins: ['USDC', 'USDT', 'DAI', 'FRAX', 'USDP', 'GHO']
  },
  bitcoin: {
    name: 'Bitcoin',
    icon: '₿',
    color: 'text-orange-400',
    supportedStablecoins: ['USDT']
  },
  lightning: {
    name: 'Lightning',
    icon: '⚡',
    color: 'text-yellow-400',
    supportedStablecoins: ['USDT', 'USDC']
  },
  ton: {
    name: 'TON',
    icon: '◈',
    color: 'text-cyan-400',
    supportedStablecoins: ['USDT', 'USDC', 'USDe']
  },
  solana: {
    name: 'Solana',
    icon: '◎',
    color: 'text-purple-500',
    supportedStablecoins: ['USDC', 'USDT', 'PYUSD', 'USDe']
  }
};

const STABLECOIN_INFO: Record<Stablecoin, { name: string; issuer: string; type: string }> = {
  USDC: { name: 'USD Coin', issuer: 'Circle', type: 'Fiat-backed' },
  USDT: { name: 'Tether', issuer: 'Tether', type: 'Fiat-backed' },
  USDP: { name: 'Pax Dollar', issuer: 'Paxos', type: 'Fiat-backed' },
  DAI: { name: 'Dai', issuer: 'MakerDAO', type: 'Crypto-collateralized' },
  FRAX: { name: 'Frax', issuer: 'Frax Finance', type: 'Fractional-algorithmic' },
  BUSD: { name: 'Binance USD', issuer: 'Binance/Paxos', type: 'Fiat-backed' },
  USDe: { name: 'Ethena USDe', issuer: 'Ethena Labs', type: 'Delta-neutral' },
  sUSDe: { name: 'Staked USDe', issuer: 'Ethena Labs', type: 'Yield-bearing' },
  USDY: { name: 'Ondo US Dollar Yield', issuer: 'Ondo Finance', type: 'Yield-bearing' },
  PYUSD: { name: 'PayPal USD', issuer: 'PayPal', type: 'Fiat-backed' },
  GHO: { name: 'GHO', issuer: 'Aave', type: 'Crypto-collateralized' },
  LUSD: { name: 'Liquity USD', issuer: 'Liquity', type: 'Crypto-collateralized' },
  crvUSD: { name: 'Curve USD', issuer: 'Curve Finance', type: 'Crypto-collateralized' },
  mkUSD: { name: 'Prisma mkUSD', issuer: 'Prisma Finance', type: 'Crypto-collateralized' }
};

interface ChainSelectorProps {
  selectedChain: Blockchain;
  selectedStablecoin: Stablecoin;
  onChainChange: (chain: Blockchain) => void;
  onStablecoinChange: (stablecoin: Stablecoin) => void;
}

export const ChainSelector = ({
  selectedChain,
  selectedStablecoin,
  onChainChange,
  onStablecoinChange
}: ChainSelectorProps) => {
  const [showStablecoinDetails, setShowStablecoinDetails] = useState(false);

  const currentChainStablecoins = CHAINS[selectedChain].supportedStablecoins;

  return (
    <div className="space-y-6">
      {/* Chain Selection */}
      <div>
        <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
          Select Blockchain Network
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(CHAINS).map(([chain, info]) => {
            const isSelected = chain === selectedChain;
            return (
              <button
                key={chain}
                onClick={() => {
                  onChainChange(chain as Blockchain);
                  // Auto-select first supported stablecoin on chain change
                  if (!info.supportedStablecoins.includes(selectedStablecoin)) {
                    onStablecoinChange(info.supportedStablecoins[0]);
                  }
                }}
                className={`
                  relative p-4 border-3 transition-all font-mono text-sm
                  ${isSelected
                    ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665]'
                    : 'border-cream-400 hover:bg-cream-300 hover:border-copper-300'}
                `}
              >
                <div className={`text-2xl mb-2 ${info.color}`}>{info.icon}</div>
                <div className="text-xs text-text-primary font-semibold">{info.name}</div>
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

      {/* Stablecoin Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-text-secondary font-mono text-xs font-semibold uppercase">
            Select Stablecoin ({currentChainStablecoins.length} Available)
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
            const isSelected = coin === selectedStablecoin;
            const info = STABLECOIN_INFO[coin];

            return (
              <div key={coin} className="relative group">
                <button
                  onClick={() => onStablecoinChange(coin)}
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
                </button>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-cream-200 border-2 border-cream-400 p-2 text-xs font-mono whitespace-nowrap shadow-lg">
                    <div className="text-copper-500 font-semibold">{info.name}</div>
                    <div className="text-text-secondary text-[10px]">{info.issuer}</div>
                    <div className="text-text-tertiary text-[10px]">{info.type}</div>
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
                const info = STABLECOIN_INFO[coin];
                return (
                  <div
                    key={coin}
                    className={`p-3 border-2 transition-all ${
                      coin === selectedStablecoin
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
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selection Summary */}
      <div className="border-2 border-copper-500/30 bg-copper-50/20 p-4">
        <div className="font-mono text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Network:</span>
            <span className="text-copper-500 font-semibold">
              {CHAINS[selectedChain].icon} {CHAINS[selectedChain].name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Asset:</span>
            <span className="text-copper-500 font-semibold">
              {selectedStablecoin} ({STABLECOIN_INFO[selectedStablecoin].name})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Type:</span>
            <span className="text-text-primary">
              {STABLECOIN_INFO[selectedStablecoin].type}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
