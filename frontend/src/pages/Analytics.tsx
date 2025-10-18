import { useState, useEffect } from 'react';
import { fromNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TerminalWindow, TerminalOutput } from '../components/terminal';

const TRANCHE_NAMES = ['SURE-BTC', 'SURE-SNR', 'SURE-MEZZ', 'SURE-JNR', 'SURE-JNR+', 'SURE-EQT'];
const TRANCHE_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F97316', '#EF4444', '#A78BFA'];
const TRANCHE_APY_MIN = [4.0, 6.5, 9.0, 12.5, 16.0, 15.0];
const TRANCHE_RISK = ['SAFEST', 'VERY LOW', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST'];

export const Analytics = () => {
  const { contracts, isConfigured } = useContracts();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalTVL: 0,
    activePolicies: 0,
    totalCoverage: 0,
    claimsPaid: 0,
    trancheTVLs: [0, 0, 0, 0, 0, 0],
  });

  // Fetch analytics data from contracts
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!isConfigured || !contracts.multiTrancheVault) return;

      setIsLoading(true);
      try {
        const trancheIds = [1, 2, 3, 4, 5, 6]; // Tranche IDs are 1-6
        const tranchePromises = trancheIds.map(id =>
          contracts.multiTrancheVault!.getTrancheCapital(id).catch(() => 0n)
        );

        const [
          totalPolicies,
          ...trancheValues
        ] = await Promise.all([
          contracts.policyFactory?.getTotalPoliciesCreated().catch(() => 0n) || Promise.resolve(0n),
          ...tranchePromises
        ]);

        const trancheTVLs = trancheValues.map(val => parseFloat(fromNano(val)));
        const totalTVL = trancheTVLs.reduce((sum, current) => sum + current, 0);

        setStats({
          totalTVL,
          activePolicies: Number(totalPolicies),
          totalCoverage: totalTVL * 2.5, // Mocked assumption
          claimsPaid: 0, // Would need to query ClaimsProcessor
          trancheTVLs,
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

  const vaultAllocation = stats.trancheTVLs
    .map((tvl, i) => ({ name: TRANCHE_NAMES[i], value: tvl, color: TRANCHE_COLORS[i] }))
    .filter(item => item.value > 0);

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
              {isLoading ? '...' : `${(stats.totalTVL / 1e6).toFixed(2)}M`}
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
              {isLoading ? '...' : `${(stats.totalCoverage / 1e6).toFixed(2)}M`}
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
                label={({ name, value }) => `${name}: ${(value / stats.totalTVL * 100).toFixed(1)}%`}
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
                formatter={(value, name) => [`${(value as number / 1e6).toFixed(2)}M`, name]}
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
          {stats.trancheTVLs.map((tvl, i) => (
            <div key={i} className="space-y-2 p-3 bg-cream-300/30 border border-cream-400">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-semibold" style={{ color: TRANCHE_COLORS[i] }}>{TRANCHE_NAMES[i]}</span>
                <span className="text-terminal-green font-bold">{TRANCHE_APY_MIN[i]}% APY</span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-text-secondary">TVL:</span>
                  <span className="text-text-primary">${(tvl / 1e6).toFixed(2)}M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">RISK:</span>
                  <span className={TRANCHE_RISK[i] === 'MEDIUM' || TRANCHE_RISK[i] === 'HIGH' ? 'text-terminal-amber' : TRANCHE_RISK[i] === 'HIGHEST' ? 'text-terminal-red' : 'text-terminal-green'}>
                    {TRANCHE_RISK[i]}
                  </span>
                </div>
              </div>
            </div>
          ))}
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
