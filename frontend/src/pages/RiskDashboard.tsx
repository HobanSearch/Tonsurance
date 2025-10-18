import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TerminalWindow, TerminalOutput } from '../components/terminal';

interface ProductExposure {
  coverage_type: string;
  chain: string;
  stablecoin: string;
  total_exposure_usd: number;
  policy_count: number;
  avg_premium_apr: number;
}

interface AssetConcentration {
  stablecoin: string;
  exposure_usd: number;
  percentage: number;
}

interface ChainDistribution {
  chain: string;
  exposure_usd: number;
  security_multiplier: number;
  policy_count: number;
}

interface RiskAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  timestamp: number;
  details?: string;
}

export const RiskDashboard = () => {
  const [topProducts, setTopProducts] = useState<ProductExposure[]>([]);
  const [assetConcentration, setAssetConcentration] = useState<AssetConcentration[]>([]);
  const [chainDistribution, setChainDistribution] = useState<ChainDistribution[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [totalExposure, setTotalExposure] = useState(0);

  useEffect(() => {
    fetchRiskData();

    // Setup WebSocket connection for real-time updates
    // const ws = new WebSocket('ws://localhost:8080/ws');
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   if (data.type === 'risk_update') {
    //     fetchRiskData();
    //   }
    // };

    const interval = setInterval(fetchRiskData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchRiskData = async () => {
    try {
      // In production: Fetch from Agent 5's API
      // GET /api/v2/risk/exposure
      // GET /api/v2/risk/alerts

      // Mock data for now
      const mockTopProducts: ProductExposure[] = [
        { coverage_type: 'DEPEG', chain: 'Ethereum', stablecoin: 'USDC', total_exposure_usd: 2_500_000, policy_count: 42, avg_premium_apr: 0.72 },
        { coverage_type: 'BRIDGE_HACK', chain: 'Arbitrum', stablecoin: 'USDT', total_exposure_usd: 1_800_000, policy_count: 28, avg_premium_apr: 3.36 },
        { coverage_type: 'DEPEG', chain: 'Polygon', stablecoin: 'USDC', total_exposure_usd: 1_500_000, policy_count: 35, avg_premium_apr: 0.88 },
        { coverage_type: 'CONTRACT_EXPLOIT', chain: 'Base', stablecoin: 'USDe', total_exposure_usd: 1_200_000, policy_count: 18, avg_premium_apr: 2.83 },
        { coverage_type: 'ORACLE_FAILURE', chain: 'Ethereum', stablecoin: 'DAI', total_exposure_usd: 950_000, policy_count: 22, avg_premium_apr: 1.98 },
        { coverage_type: 'DEPEG', chain: 'TON', stablecoin: 'USDT', total_exposure_usd: 850_000, policy_count: 31, avg_premium_apr: 0.80 },
        { coverage_type: 'BRIDGE_HACK', chain: 'Solana', stablecoin: 'USDC', total_exposure_usd: 720_000, policy_count: 14, avg_premium_apr: 4.48 },
        { coverage_type: 'CEX_LIQUIDATION', chain: 'Ethereum', stablecoin: 'USDC', total_exposure_usd: 680_000, policy_count: 9, avg_premium_apr: 4.50 },
        { coverage_type: 'DEPEG', chain: 'Arbitrum', stablecoin: 'FRAX', total_exposure_usd: 620_000, policy_count: 16, avg_premium_apr: 1.30 },
        { coverage_type: 'ORACLE_FAILURE', chain: 'Base', stablecoin: 'PYUSD', total_exposure_usd: 580_000, policy_count: 12, avg_premium_apr: 2.14 },
      ];

      const mockAssetConcentration: AssetConcentration[] = [
        { stablecoin: 'USDC', exposure_usd: 5_430_000, percentage: 45.8 },
        { stablecoin: 'USDT', exposure_usd: 3_370_000, percentage: 28.4 },
        { stablecoin: 'USDe', exposure_usd: 1_200_000, percentage: 10.1 },
        { stablecoin: 'DAI', exposure_usd: 950_000, percentage: 8.0 },
        { stablecoin: 'FRAX', exposure_usd: 620_000, percentage: 5.2 },
        { stablecoin: 'PYUSD', exposure_usd: 300_000, percentage: 2.5 },
      ];

      const mockChainDistribution: ChainDistribution[] = [
        { chain: 'Ethereum', exposure_usd: 4_130_000, security_multiplier: 0.9, policy_count: 73 },
        { chain: 'Arbitrum', exposure_usd: 2_420_000, security_multiplier: 1.0, policy_count: 44 },
        { chain: 'Polygon', exposure_usd: 1_500_000, security_multiplier: 1.1, policy_count: 35 },
        { chain: 'Base', exposure_usd: 1_780_000, security_multiplier: 1.05, policy_count: 30 },
        { chain: 'Solana', exposure_usd: 720_000, security_multiplier: 1.4, policy_count: 14 },
        { chain: 'TON', exposure_usd: 850_000, security_multiplier: 1.0, policy_count: 31 },
        { chain: 'Bitcoin', exposure_usd: 200_000, security_multiplier: 1.2, policy_count: 5 },
        { chain: 'Lightning', exposure_usd: 270_000, security_multiplier: 1.15, policy_count: 8 },
      ];

      const mockAlerts: RiskAlert[] = [
        {
          id: 'alert_1',
          severity: 'high',
          type: 'CONCENTRATION_RISK',
          message: 'USDC concentration exceeds 40% threshold',
          timestamp: Date.now() / 1000 - 300,
          details: 'USDC represents 45.8% of total exposure. Consider diversifying across stablecoins.'
        },
        {
          id: 'alert_2',
          severity: 'medium',
          type: 'BRIDGE_HEALTH',
          message: 'Wormhole Base→TON bridge health degraded',
          timestamp: Date.now() / 1000 - 1200,
          details: 'Health score dropped to 0.68. Risk multiplier increased to 1.3x.'
        },
        {
          id: 'alert_3',
          severity: 'critical',
          type: 'UTILIZATION',
          message: 'SURE-EQT tranche utilization at 92%',
          timestamp: Date.now() / 1000 - 180,
          details: 'Equity tranche nearing capacity. New high-risk policies may be restricted.'
        },
        {
          id: 'alert_4',
          severity: 'low',
          type: 'MARKET_VOLATILITY',
          message: 'USDe depeg probability increased to 2.8%',
          timestamp: Date.now() / 1000 - 3600,
          details: 'Prediction market odds shifted. Monitoring closely.'
        },
        {
          id: 'alert_5',
          severity: 'medium',
          type: 'CHAIN_RISK',
          message: 'Solana exposure exceeds recommended threshold',
          timestamp: Date.now() / 1000 - 900,
          details: 'Solana policies represent 6.1% of total with 1.4x multiplier.'
        },
      ];

      setTopProducts(mockTopProducts);
      setAssetConcentration(mockAssetConcentration);
      setChainDistribution(mockChainDistribution);
      setAlerts(mockAlerts);
      setTotalExposure(mockAssetConcentration.reduce((sum, asset) => sum + asset.exposure_usd, 0));
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching risk data:', error);
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-terminal-red';
      case 'high': return 'text-copper-600';
      case 'medium': return 'text-copper-500';
      case 'low': return 'text-terminal-green';
      default: return 'text-text-tertiary';
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-terminal-red/10 border-terminal-red';
      case 'high': return 'bg-copper-100/50 border-copper-600';
      case 'medium': return 'bg-copper-50/50 border-copper-500';
      case 'low': return 'bg-terminal-green/10 border-terminal-green';
      default: return 'bg-cream-300/30 border-cream-400';
    }
  };

  const filteredAlerts = selectedSeverity === 'all'
    ? alerts
    : alerts.filter(a => a.severity === selectedSeverity);

  const COLORS = ['#D87665', '#E59780', '#F0B8A8', '#C66555', '#AD5447', '#8B4439', '#6B3329', '#4A221A'];

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <TerminalWindow title="LOADING_RISK_DASHBOARD">
          <TerminalOutput type="info">
            <div className="text-sm animate-pulse">
              &gt; Loading risk analytics...<br />
              &gt; Fetching exposure data...<br />
              &gt; Connecting to monitoring systems...
            </div>
          </TerminalOutput>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TerminalWindow title="RISK_MANAGEMENT_DASHBOARD">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Multi-dimensional risk monitoring system initialized<br />
            &gt; <span className="output-success">✓ Tracking 560 product combinations</span><br />
            &gt; Real-time exposure analysis across 8 blockchains, 5 coverage types, 14 stablecoins
          </div>
        </TerminalOutput>
      </TerminalWindow>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <TerminalWindow title="TOTAL_EXPOSURE">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">AGGREGATE RISK</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              {formatCurrency(totalExposure)}
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              ACROSS {topProducts.reduce((sum, p) => sum + p.policy_count, 0)} POLICIES
            </div>
          </TerminalOutput>
        </TerminalWindow>

        <TerminalWindow title="ACTIVE_PRODUCTS">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">UNIQUE COMBINATIONS</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              {topProducts.length}
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              OUT OF 560 POSSIBLE
            </div>
          </TerminalOutput>
        </TerminalWindow>

        <TerminalWindow title="ALERTS">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">ACTIVE ALERTS</div>
            <div className="text-2xl font-bold text-copper-500 font-mono">
              {alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length}
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              HIGH/CRITICAL
            </div>
          </TerminalOutput>
        </TerminalWindow>

        <TerminalWindow title="AVG_PREMIUM">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">WEIGHTED APR</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              {topProducts.length > 0
                ? (topProducts.reduce((sum, p) => sum + p.avg_premium_apr * p.total_exposure_usd, 0) / totalExposure).toFixed(2)
                : '0.00'}%
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              BLENDED RATE
            </div>
          </TerminalOutput>
        </TerminalWindow>
      </div>

      {/* Top 10 Products by Exposure */}
      <TerminalWindow title="TOP_10_PRODUCTS_BY_EXPOSURE">
        <div className="mb-3 text-xs text-text-secondary font-mono">&gt; HIGHEST RISK CONCENTRATIONS</div>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b-2 border-cream-400">
                <th className="text-left py-2 px-3 text-text-secondary font-semibold">RANK</th>
                <th className="text-left py-2 px-3 text-text-secondary font-semibold">COVERAGE TYPE</th>
                <th className="text-left py-2 px-3 text-text-secondary font-semibold">CHAIN</th>
                <th className="text-left py-2 px-3 text-text-secondary font-semibold">STABLECOIN</th>
                <th className="text-right py-2 px-3 text-text-secondary font-semibold">EXPOSURE</th>
                <th className="text-right py-2 px-3 text-text-secondary font-semibold">POLICIES</th>
                <th className="text-right py-2 px-3 text-text-secondary font-semibold">AVG APR</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product, index) => (
                <tr
                  key={index}
                  className="border-b border-cream-400 hover:bg-copper-50/30 transition-colors"
                >
                  <td className="py-2 px-3 text-copper-500 font-bold">#{index + 1}</td>
                  <td className="py-2 px-3 text-text-primary font-semibold">{product.coverage_type}</td>
                  <td className="py-2 px-3 text-text-primary">{product.chain}</td>
                  <td className="py-2 px-3 text-text-primary">{product.stablecoin}</td>
                  <td className="py-2 px-3 text-right text-terminal-green font-bold">
                    {formatCurrency(product.total_exposure_usd)}
                  </td>
                  <td className="py-2 px-3 text-right text-text-primary">{product.policy_count}</td>
                  <td className="py-2 px-3 text-right text-copper-500 font-semibold">
                    {product.avg_premium_apr.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TerminalWindow>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Asset Concentration Chart */}
        <TerminalWindow title="ASSET_CONCENTRATION">
          <div className="mb-3 text-xs text-text-secondary font-mono">&gt; STABLECOIN DISTRIBUTION</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={assetConcentration}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ stablecoin, percentage }) => `${stablecoin} ${percentage.toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="exposure_usd"
              >
                {assetConcentration.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Concentration Warning */}
          {assetConcentration.some(a => a.percentage > 30) && (
            <div className="mt-3 p-3 bg-copper-100/50 border-2 border-copper-500">
              <div className="text-xs text-copper-600 font-mono font-bold">
                ⚠️ CONCENTRATION RISK: {assetConcentration.filter(a => a.percentage > 30).map(a => a.stablecoin).join(', ')} exceed 30% threshold
              </div>
            </div>
          )}
        </TerminalWindow>

        {/* Chain Distribution Chart */}
        <TerminalWindow title="CHAIN_DISTRIBUTION">
          <div className="mb-3 text-xs text-text-secondary font-mono">&gt; BLOCKCHAIN EXPOSURE</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chainDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="chain" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend />
              <Bar dataKey="exposure_usd" fill="#D87665" name="Exposure ($)" />
            </BarChart>
          </ResponsiveContainer>

          {/* Chain risk legend */}
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-mono">
            {chainDistribution.map((chain, index) => (
              <div key={index} className="text-center p-2 bg-cream-300/30 border border-cream-400">
                <div className="text-text-primary font-semibold">{chain.chain}</div>
                <div className={`text-[10px] font-bold ${
                  chain.security_multiplier < 1 ? 'text-terminal-green' :
                  chain.security_multiplier === 1 ? 'text-copper-400' :
                  chain.security_multiplier < 1.2 ? 'text-copper-500' : 'text-terminal-red'
                }`}>
                  {chain.security_multiplier.toFixed(2)}x
                </div>
              </div>
            ))}
          </div>
        </TerminalWindow>
      </div>

      {/* Active Alerts Panel */}
      <TerminalWindow title="ACTIVE_ALERTS">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-text-secondary font-mono">&gt; REAL-TIME RISK ALERTS</div>
          <div className="flex gap-2">
            {['all', 'critical', 'high', 'medium', 'low'].map(severity => (
              <button
                key={severity}
                onClick={() => setSelectedSeverity(severity)}
                className={`px-2 py-1 text-xs font-mono font-semibold transition-all ${
                  selectedSeverity === severity
                    ? 'bg-copper-500 text-white'
                    : 'bg-cream-300 text-text-primary hover:bg-copper-300'
                }`}
              >
                {severity.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-xs text-text-tertiary font-mono text-center py-4">
              No alerts for selected severity level
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <div
                key={alert.id}
                className={`border-2 p-4 ${getSeverityBg(alert.severity)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold font-mono ${getSeverityColor(alert.severity)}`}>
                      {alert.severity === 'critical' && '🚨'}
                      {alert.severity === 'high' && '⚠️'}
                      {alert.severity === 'medium' && '⚡'}
                      {alert.severity === 'low' && 'ℹ️'}
                    </div>
                    <div>
                      <div className="text-xs text-text-tertiary font-mono uppercase">{alert.type}</div>
                      <div className="text-sm text-text-primary font-mono font-semibold">{alert.message}</div>
                    </div>
                  </div>
                  <div className="text-xs text-text-tertiary font-mono">
                    {formatTimeAgo(alert.timestamp)}
                  </div>
                </div>
                {alert.details && (
                  <div className="text-xs text-text-secondary font-mono mt-2 pl-9">
                    {alert.details}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </TerminalWindow>
    </div>
  );
};
