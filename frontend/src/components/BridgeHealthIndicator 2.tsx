import { useState, useEffect } from 'react';
import { InfoPanel } from './terminal';

export interface BridgeHealth {
  bridge_id: string;
  source_chain: string;
  dest_chain: string;
  current_tvl_usd: number;
  previous_tvl_usd: number;
  health_score: number; // 0.0 - 1.0
  risk_multiplier: number; // 1.0x - 2.0x
  last_updated: number;
  exploit_detected: boolean;
  status: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
}

interface BridgeHealthIndicatorProps {
  sourceChain?: string;
  destChain?: string;
  showAllBridges?: boolean;
}

export const BridgeHealthIndicator = ({
  sourceChain,
  destChain,
  showAllBridges = false
}: BridgeHealthIndicatorProps) => {
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    fetchBridgeHealth();
    const interval = setInterval(fetchBridgeHealth, 60000); // Update every 60 seconds
    return () => clearInterval(interval);
  }, [sourceChain, destChain]);

  const fetchBridgeHealth = async () => {
    try {
      // In production: Fetch from OCaml backend API
      // GET /api/v1/bridge/health/all

      // Mock data for now
      const mockBridges: BridgeHealth[] = [
        {
          bridge_id: 'wormhole_eth_ton',
          source_chain: 'Ethereum',
          dest_chain: 'TON',
          current_tvl_usd: 45_000_000,
          previous_tvl_usd: 50_000_000,
          health_score: 0.92,
          risk_multiplier: 1.0,
          last_updated: Date.now() / 1000,
          exploit_detected: false,
          status: 'excellent'
        },
        {
          bridge_id: 'axelar_arb_ton',
          source_chain: 'Arbitrum',
          dest_chain: 'TON',
          current_tvl_usd: 28_000_000,
          previous_tvl_usd: 30_000_000,
          health_score: 0.88,
          risk_multiplier: 1.1,
          last_updated: Date.now() / 1000,
          exploit_detected: false,
          status: 'good'
        },
        {
          bridge_id: 'layerzero_base_ton',
          source_chain: 'Base',
          dest_chain: 'TON',
          current_tvl_usd: 15_000_000,
          previous_tvl_usd: 20_000_000,
          health_score: 0.68,
          risk_multiplier: 1.3,
          last_updated: Date.now() / 1000,
          exploit_detected: false,
          status: 'moderate'
        },
        {
          bridge_id: 'stargate_poly_ton',
          source_chain: 'Polygon',
          dest_chain: 'TON',
          current_tvl_usd: 12_000_000,
          previous_tvl_usd: 18_000_000,
          health_score: 0.54,
          risk_multiplier: 1.6,
          last_updated: Date.now() / 1000,
          exploit_detected: false,
          status: 'poor'
        }
      ];

      // Filter by source/dest chain if specified
      let filtered = mockBridges;
      if (sourceChain && !showAllBridges) {
        filtered = filtered.filter(b =>
          b.source_chain.toLowerCase() === sourceChain.toLowerCase() ||
          b.dest_chain.toLowerCase() === sourceChain.toLowerCase()
        );
      }

      setBridgeHealth(filtered);
      setLastUpdate(new Date());
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch bridge health:', error);
      setIsLoading(false);
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-green-300';
      case 'moderate': return 'text-yellow-400';
      case 'poor': return 'text-orange-400';
      case 'critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getHealthEmoji = (status: string) => {
    switch (status) {
      case 'excellent': return '✅';
      case 'good': return '✅';
      case 'moderate': return '⚠️';
      case 'poor': return '⚠️';
      case 'critical': return '🚨';
      default: return '❓';
    }
  };

  const formatTVL = (tvl: number) => {
    if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`;
    if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(0)}K`;
    return `$${tvl}`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  if (isLoading) {
    return (
      <div className="border-2 border-cream-400 bg-cream-300/30 p-4">
        <div className="font-mono text-sm text-text-secondary animate-pulse">
          Loading bridge health data...
        </div>
      </div>
    );
  }

  if (bridgeHealth.length === 0) {
    return (
      <div className="border-2 border-cream-400 bg-cream-300/30 p-4">
        <div className="font-mono text-sm text-text-secondary">
          No bridge data available
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-text-secondary font-mono text-xs font-semibold uppercase">
          Bridge Health Monitor
        </h3>
        <div className="text-xs text-text-tertiary font-mono">
          Updated: {formatTimeAgo(lastUpdate.getTime() / 1000)}
        </div>
      </div>

      {/* Bridge Health Cards */}
      <div className="space-y-3">
        {bridgeHealth.map(bridge => {
          const tvlChange = bridge.current_tvl_usd - bridge.previous_tvl_usd;
          const tvlChangePercent = (tvlChange / bridge.previous_tvl_usd) * 100;

          return (
            <div
              key={bridge.bridge_id}
              className={`
                border-3 p-4 transition-all
                ${bridge.status === 'excellent' ? 'border-terminal-green/40 bg-terminal-green/5' :
                  bridge.status === 'good' ? 'border-terminal-green/30 bg-terminal-green/3' :
                  bridge.status === 'moderate' ? 'border-copper-400/40 bg-copper-50/30' :
                  bridge.status === 'poor' ? 'border-copper-600/50 bg-copper-100/30' :
                  'border-terminal-red/50 bg-terminal-red/10'}
              `}
            >
              {/* Bridge Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getHealthEmoji(bridge.status)}</span>
                  <div className="font-mono">
                    <div className="text-sm text-text-primary font-semibold">
                      {bridge.source_chain} → {bridge.dest_chain}
                    </div>
                    <div className="text-xs text-text-tertiary">{bridge.bridge_id}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold font-mono ${getHealthColor(bridge.status)}`}>
                    {(bridge.health_score * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-400 font-mono uppercase">
                    {bridge.status}
                  </div>
                </div>
              </div>

              {/* Bridge Metrics */}
              <div className="grid grid-cols-3 gap-4 font-mono text-xs">
                <div>
                  <div className="text-gray-500 mb-1">TVL</div>
                  <div className="text-gray-300">{formatTVL(bridge.current_tvl_usd)}</div>
                  <div className={`text-[10px] ${tvlChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {tvlChange >= 0 ? '+' : ''}{tvlChangePercent.toFixed(1)}%
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 mb-1">Risk Multiplier</div>
                  <div className={`${getHealthColor(bridge.status)}`}>
                    {bridge.risk_multiplier.toFixed(1)}x
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {bridge.risk_multiplier > 1.5 ? 'High risk' :
                     bridge.risk_multiplier > 1.2 ? 'Moderate risk' : 'Low risk'}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 mb-1">Status</div>
                  <div className="text-gray-300">
                    {bridge.exploit_detected ? (
                      <span className="text-red-400">⚠️ Alert</span>
                    ) : (
                      <span className="text-green-400">✓ Normal</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {formatTimeAgo(bridge.last_updated)}
                  </div>
                </div>
              </div>

              {/* Warning for high risk */}
              {bridge.risk_multiplier > 1.5 && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs text-orange-400 font-mono">
                    ⚠️ Bridge showing elevated risk - premiums increased by {((bridge.risk_multiplier - 1) * 100).toFixed(0)}%
                  </div>
                </div>
              )}

              {/* Critical alert */}
              {bridge.exploit_detected && (
                <div className="mt-3 pt-3 border-t border-red-400">
                  <div className="text-xs text-red-400 font-mono font-bold">
                    🚨 SECURITY ALERT: Potential exploit detected. New policies temporarily suspended.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall summary */}
      <div className="border border-gray-700 bg-black/50 p-4">
        <div className="font-mono text-xs space-y-2">
          <div className="text-gray-400 mb-2">NETWORK SUMMARY</div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-gray-500">Total Bridges</div>
              <div className="text-green-400 text-lg">{bridgeHealth.length}</div>
            </div>
            <div>
              <div className="text-gray-500">Healthy</div>
              <div className="text-green-400 text-lg">
                {bridgeHealth.filter(b => b.status === 'excellent' || b.status === 'good').length}
              </div>
            </div>
            <div>
              <div className="text-gray-500">At Risk</div>
              <div className="text-yellow-400 text-lg">
                {bridgeHealth.filter(b => b.status === 'moderate' || b.status === 'poor').length}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Critical</div>
              <div className="text-red-400 text-lg">
                {bridgeHealth.filter(b => b.status === 'critical').length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
