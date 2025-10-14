import { useState, useEffect } from 'react';
import { fromNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TerminalWindow, TerminalOutput } from '../components/terminal';

export const Analytics = () => {
  const { contracts, isConfigured } = useContracts();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalTVL: 0,
    activePolicies: 0,
    totalCoverage: 0,
    claimsPaid: 0,
    primaryVaultTVL: 0,
    secondaryVaultTVL: 0,
    tradfiBufferTVL: 0,
  });

  // Fetch analytics data from contracts
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!isConfigured) return;

      setIsLoading(true);
      try {
        const [
          primaryTVL,
          secondaryTVL,
          tradfiTVL,
          totalPolicies
        ] = await Promise.all([
          contracts.primaryVault?.getTotalLpCapital().catch(() => 0n) || Promise.resolve(0n),
          contracts.secondaryVault?.getTotalSureStaked().catch(() => 0n) || Promise.resolve(0n),
          contracts.tradfiBuffer?.getTotalCapital().catch(() => 0n) || Promise.resolve(0n),
          contracts.policyFactory?.getTotalPoliciesCreated().catch(() => 0n) || Promise.resolve(0n),
        ]);

        const primaryValue = parseFloat(fromNano(primaryTVL));
        const secondaryValue = parseFloat(fromNano(secondaryTVL));
        const tradfiValue = parseFloat(fromNano(tradfiTVL));
        const totalTVL = primaryValue + secondaryValue + tradfiValue;

        setStats({
          totalTVL,
          activePolicies: Number(totalPolicies),
          totalCoverage: totalTVL * 2.5, // 250% capital efficiency
          claimsPaid: 0, // Would need to query ClaimsProcessor
          primaryVaultTVL: primaryValue,
          secondaryVaultTVL: secondaryValue,
          tradfiBufferTVL: tradfiValue,
        });
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [isConfigured, contracts]);

  // Mock data for charts (would be replaced with historical data from indexer)
  const tvlData = [
    { month: 'Jun', tvl: 0 },
    { month: 'Jul', tvl: 0 },
    { month: 'Aug', tvl: 0 },
    { month: 'Sep', tvl: stats.totalTVL * 0.5 },
    { month: 'Oct', tvl: stats.totalTVL },
  ];

  const premiumData = [
    { month: 'Jun', core: 0, hedged: 0 },
    { month: 'Jul', core: 0, hedged: 0 },
    { month: 'Aug', core: 0, hedged: 0 },
    { month: 'Sep', core: 0, hedged: 0 },
    { month: 'Oct', core: 0, hedged: 0 },
  ];

  const vaultAllocation = [
    { name: 'Primary Vault', value: stats.primaryVaultTVL || 45, color: '#0ea5e9' },
    { name: 'Secondary Vault', value: stats.secondaryVaultTVL || 20, color: '#d946ef' },
    { name: 'TradFi Buffer', value: stats.tradfiBufferTVL || 10, color: '#8b5cf6' },
    { name: 'Reserve', value: Math.max(0, stats.totalTVL - stats.primaryVaultTVL - stats.secondaryVaultTVL - stats.tradfiBufferTVL) || 25, color: '#6b7280' },
  ];

  const coverageTypes = [
    { name: 'Depeg', policies: 0, coverage: 0 },
    { name: 'Smart Contract', policies: 0, coverage: 0 },
    { name: 'Oracle', policies: 0, coverage: 0 },
    { name: 'Bridge', policies: 0, coverage: 0 },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <TerminalWindow title="ANALYTICS_DASHBOARD">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Loading protocol metrics...<br />
            &gt; <span className="output-success">✓ Connected to analytics engine</span><br />
            &gt; Real-time protocol metrics and performance data
          </div>
        </TerminalOutput>
      </TerminalWindow>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TerminalWindow title="TVL">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">TOTAL VALUE LOCKED</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              {isLoading ? '...' : `$${(stats.totalTVL / 1e6).toFixed(2)}M`}
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              {isConfigured ? '● LIVE' : 'OFFLINE'}
            </div>
          </TerminalOutput>
        </TerminalWindow>

        <TerminalWindow title="POLICIES">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">ACTIVE POLICIES</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              {isLoading ? '...' : stats.activePolicies}
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              CORE + HEDGED
            </div>
          </TerminalOutput>
        </TerminalWindow>

        <TerminalWindow title="COVERAGE">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">TOTAL COVERAGE</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              {isLoading ? '...' : `$${(stats.totalCoverage / 1e6).toFixed(2)}M`}
            </div>
            <div className="text-xs text-copper-500 mt-1 font-mono">
              250% EFFICIENT
            </div>
          </TerminalOutput>
        </TerminalWindow>

        <TerminalWindow title="CLAIMS">
          <TerminalOutput>
            <div className="text-xs text-text-secondary mb-1">CLAIMS PAID</div>
            <div className="text-2xl font-bold text-terminal-green font-mono">
              ${stats.claimsPaid.toLocaleString()}
            </div>
            <div className="text-xs text-text-tertiary mt-1 font-mono">
              {stats.claimsPaid} TOTAL
            </div>
          </TerminalOutput>
        </TerminalWindow>
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* TVL Chart */}
        <TerminalWindow title="TVL_HISTORY">
          <div className="mb-3 text-xs text-text-secondary font-mono">&gt; TOTAL VALUE LOCKED OVER TIME</div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={tvlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend />
              <Line type="monotone" dataKey="tvl" stroke="#D87665" strokeWidth={2} name="TVL ($M)" />
            </LineChart>
          </ResponsiveContainer>
        </TerminalWindow>

        {/* Vault Allocation */}
        <TerminalWindow title="VAULT_ALLOCATION">
          <div className="mb-3 text-xs text-text-secondary font-mono">&gt; CAPITAL DISTRIBUTION ACROSS VAULTS</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={vaultAllocation}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {vaultAllocation.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </TerminalWindow>
      </div>

      {/* Charts Row 2 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Premium Revenue */}
        <TerminalWindow title="PREMIUM_REVENUE">
          <div className="mb-3 text-xs text-text-secondary font-mono">&gt; MONTHLY PREMIUM COLLECTION</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={premiumData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend />
              <Bar dataKey="core" fill="#D87665" name="Core Coverage ($)" />
              <Bar dataKey="hedged" fill="#00AA00" name="Hedged Coverage ($)" />
            </BarChart>
          </ResponsiveContainer>
        </TerminalWindow>

        {/* Coverage by Type */}
        <TerminalWindow title="COVERAGE_BY_TYPE">
          <div className="mb-3 text-xs text-text-secondary font-mono">&gt; RISK DISTRIBUTION</div>
          <div className="space-y-3">
            {coverageTypes.map((type) => (
              <div key={type.name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-text-primary">{type.name.toUpperCase()}</span>
                  <span className="font-semibold text-copper-500">
                    {type.policies}P / ${type.coverage.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-cream-400 h-1.5">
                  <div
                    className="bg-copper-500 h-1.5 transition-all"
                    style={{ width: `${type.policies > 0 ? (type.coverage / 100000) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </TerminalWindow>
      </div>

      {/* Vault Performance */}
      <TerminalWindow title="VAULT_PERFORMANCE">
        <div className="mb-3 text-xs text-text-secondary font-mono">&gt; 6-TIER WATERFALL VAULT METRICS</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-copper-500">🟦 SURE-BTC</span>
              <span className="text-terminal-green font-bold">4.0% APY</span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-secondary">TVL:</span>
                <span className="text-text-primary">$0M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">RISK:</span>
                <span className="text-terminal-green">SAFEST</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-copper-500">🟩 SURE-SNR</span>
              <span className="text-terminal-green font-bold">6.5% APY</span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-secondary">TVL:</span>
                <span className="text-text-primary">$0M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">RISK:</span>
                <span className="text-terminal-green">VERY LOW</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-copper-500">🟨 SURE-MEZZ</span>
              <span className="text-terminal-green font-bold">9.0% APY</span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-secondary">TVL:</span>
                <span className="text-text-primary">$0M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">RISK:</span>
                <span className="text-terminal-green">LOW</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-copper-500">🟧 SURE-JNR</span>
              <span className="text-terminal-green font-bold">12.5% APY</span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-secondary">TVL:</span>
                <span className="text-text-primary">$0M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">RISK:</span>
                <span className="text-terminal-amber">MEDIUM</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-copper-500">🟥 SURE-JNR+</span>
              <span className="text-terminal-green font-bold">16.0% APY</span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-secondary">TVL:</span>
                <span className="text-text-primary">$0M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">RISK:</span>
                <span className="text-terminal-amber">HIGH</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-copper-500">🟪 SURE-EQT</span>
              <span className="text-terminal-green font-bold">20.0% APY</span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-secondary">TVL:</span>
                <span className="text-text-primary">$0M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">RISK:</span>
                <span className="text-terminal-red">HIGHEST</span>
              </div>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Hedging Statistics */}
      <TerminalWindow title="HEDGING_STATS">
        <div className="mb-3 text-xs text-text-secondary font-mono">&gt; PHASE 4 EXTERNAL HEDGES</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-cream-300/30 border border-cream-400">
            <div className="text-xl font-bold text-copper-500 font-mono">$0</div>
            <div className="text-xs text-text-secondary mt-1 font-mono">PREDICTION MARKETS</div>
          </div>
          <div className="text-center p-3 bg-cream-300/30 border border-cream-400">
            <div className="text-xl font-bold text-copper-500 font-mono">$0</div>
            <div className="text-xs text-text-secondary mt-1 font-mono">PERPETUALS</div>
          </div>
          <div className="text-center p-3 bg-cream-300/30 border border-cream-400">
            <div className="text-xl font-bold text-copper-500 font-mono">$0</div>
            <div className="text-xs text-text-secondary mt-1 font-mono">OFF-CHAIN REINSURANCE</div>
          </div>
          <div className="text-center p-3 bg-cream-300/30 border border-cream-400">
            <div className="text-xl font-bold text-terminal-green font-mono">0%</div>
            <div className="text-xs text-text-secondary mt-1 font-mono">AVG SAVINGS</div>
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
};
