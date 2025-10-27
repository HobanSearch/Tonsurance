import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TerminalWindow, TerminalOutput } from '../components/terminal';

// Mock data interfaces - to be replaced with real API calls
interface RiskMetrics {
  var_95: number;
  var_99: number;
  ltv: number;
  reserve_ratio: number;
  max_concentration: number;
}

interface TrancheData {
  id: string;
  name: string;
  capital: number;
  coverage: number;
  losses: number;
  yield: number;
  utilization: number;
  apy: number;
}

interface HedgePosition {
  id: string;
  venue: string;
  product: string;
  amount: number;
  pnl: number;
  status: string;
}

interface Claim {
  id: string;
  policyId: string;
  claimant: string;
  coverageType: string;
  claimAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  submittedAt: string;
  approvedAt?: string;
  paidAt?: string;
  evidence: string[];
}

interface NFTMint {
  id: string;
  type: 'policy' | 'vault_position' | 'claim_receipt';
  tokenId: string;
  owner: string;
  metadata: {
    name: string;
    description: string;
    image: string;
    attributes: { trait_type: string; value: string | number }[];
  };
  mintedAt: string;
  txHash: string;
}

const TRANCHE_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F97316', '#EF4444', '#A78BFA'];

export const AdminDashboard = () => {
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    var_95: 450000,
    var_99: 780000,
    ltv: 0.65,
    reserve_ratio: 0.22,
    max_concentration: 0.28
  });

  const [tranches, setTranches] = useState<TrancheData[]>([
    { id: 'SURE-BTC', name: 'Bitcoin Senior', capital: 5000000, coverage: 2500000, losses: 0, yield: 250000, utilization: 0.50, apy: 5.2 },
    { id: 'SURE-SNR', name: 'Senior', capital: 3000000, coverage: 1800000, losses: 0, yield: 210000, utilization: 0.60, apy: 7.1 },
    { id: 'SURE-MEZZ', name: 'Mezzanine', capital: 2000000, coverage: 1400000, losses: 0, yield: 240000, utilization: 0.70, apy: 12.3 },
    { id: 'SURE-JNR', name: 'Junior', capital: 1500000, coverage: 1200000, losses: 0, yield: 300000, utilization: 0.80, apy: 20.5 },
    { id: 'SURE-JNR+', name: 'Junior Plus', capital: 1000000, coverage: 900000, losses: 0, yield: 300000, utilization: 0.90, apy: 30.8 },
    { id: 'SURE-EQT', name: 'Equity', capital: 500000, coverage: 500000, losses: 0, yield: 250000, utilization: 1.00, apy: 51.2 }
  ]);

  const [hedgePositions, setHedgePositions] = useState<HedgePosition[]>([
    { id: 'H001', venue: 'Polymarket', product: 'USDC Depeg', amount: 100000, pnl: 5200, status: 'Open' },
    { id: 'H002', venue: 'Binance Futures', product: 'USDT Depeg', amount: 150000, pnl: -2100, status: 'Open' },
    { id: 'H003', venue: 'Polymarket', product: 'Bridge Hack (Wormhole)', amount: 80000, pnl: 1800, status: 'Open' },
    { id: 'H004', venue: 'Perpetuals', product: 'Protocol Short (AAVE)', amount: 120000, pnl: 8500, status: 'Open' }
  ]);

  const [claims, setClaims] = useState<Claim[]>([
    {
      id: 'CLM-001',
      policyId: 'POL-2847',
      claimant: 'EQCj8k...xYZ',
      coverageType: 'USDC Depeg',
      claimAmount: 50000,
      status: 'approved',
      submittedAt: '2025-10-20 14:30:00',
      approvedAt: '2025-10-20 16:45:00',
      paidAt: '2025-10-20 16:47:12',
      evidence: ['Chainlink price feed', 'DEX price snapshots', 'Bridge transaction']
    },
    {
      id: 'CLM-002',
      policyId: 'POL-2891',
      claimant: 'UQAABc...ABC',
      coverageType: 'Bridge Hack',
      claimAmount: 125000,
      status: 'pending',
      submittedAt: '2025-10-22 09:15:00',
      evidence: ['Bridge exploit transaction', 'Security report', 'Loss calculation']
    },
    {
      id: 'CLM-003',
      policyId: 'POL-2765',
      claimant: 'EQDx7y...DEF',
      coverageType: 'Protocol Insolvency',
      claimAmount: 75000,
      status: 'approved',
      submittedAt: '2025-10-21 11:20:00',
      approvedAt: '2025-10-21 18:30:00',
      evidence: ['Protocol TVL snapshot', 'Governance proposal', 'Oracle data']
    },
    {
      id: 'CLM-004',
      policyId: 'POL-2912',
      claimant: 'EQFa1b...GHI',
      coverageType: 'USDT Depeg',
      claimAmount: 30000,
      status: 'rejected',
      submittedAt: '2025-10-19 08:45:00',
      approvedAt: '2025-10-19 12:00:00',
      evidence: ['Price feed (insufficient depeg duration)']
    }
  ]);

  const [nftMints, setNftMints] = useState<NFTMint[]>([
    {
      id: 'NFT-001',
      type: 'policy',
      tokenId: '1247',
      owner: 'EQCj8k...xYZ',
      metadata: {
        name: 'USDC Depeg Insurance #1247',
        description: '$50K coverage against USDC depeg for 30 days',
        image: 'ipfs://QmX...abc/1247.png',
        attributes: [
          { trait_type: 'Coverage Type', value: 'USDC Depeg' },
          { trait_type: 'Coverage Amount', value: 50000 },
          { trait_type: 'Duration', value: '30 days' },
          { trait_type: 'APR', value: 0.8 },
          { trait_type: 'Premium Paid', value: 328.77 }
        ]
      },
      mintedAt: '2025-10-15 14:22:00',
      txHash: '0xabc123...def'
    },
    {
      id: 'NFT-002',
      type: 'vault_position',
      tokenId: '589',
      owner: 'UQAABc...ABC',
      metadata: {
        name: 'SURE Senior Tranche LP #589',
        description: 'Liquidity Provider position in Senior Tranche (SURE-SNR)',
        image: 'ipfs://QmY...xyz/589.png',
        attributes: [
          { trait_type: 'Tranche', value: 'Senior' },
          { trait_type: 'Capital Deposited', value: 25000 },
          { trait_type: 'Current APY', value: 7.1 },
          { trait_type: 'Risk Level', value: 'Low' },
          { trait_type: 'Lock Period', value: '90 days' }
        ]
      },
      mintedAt: '2025-10-12 09:45:00',
      txHash: '0x123abc...xyz'
    },
    {
      id: 'NFT-003',
      type: 'vault_position',
      tokenId: '592',
      owner: 'EQDx7y...DEF',
      metadata: {
        name: 'SURE Junior Tranche LP #592',
        description: 'Liquidity Provider position in Junior Tranche (SURE-JNR)',
        image: 'ipfs://QmZ...uvw/592.png',
        attributes: [
          { trait_type: 'Tranche', value: 'Junior' },
          { trait_type: 'Capital Deposited', value: 50000 },
          { trait_type: 'Current APY', value: 20.5 },
          { trait_type: 'Risk Level', value: 'Medium-High' },
          { trait_type: 'Lock Period', value: '180 days' }
        ]
      },
      mintedAt: '2025-10-18 16:30:00',
      txHash: '0x456def...uvw'
    },
    {
      id: 'NFT-004',
      type: 'claim_receipt',
      tokenId: '84',
      owner: 'EQCj8k...xYZ',
      metadata: {
        name: 'Claim Receipt #84',
        description: 'Proof of successful claim payout for CLM-001',
        image: 'ipfs://QmW...rst/84.png',
        attributes: [
          { trait_type: 'Claim ID', value: 'CLM-001' },
          { trait_type: 'Payout Amount', value: 50000 },
          { trait_type: 'Coverage Type', value: 'USDC Depeg' },
          { trait_type: 'Payout Date', value: '2025-10-20' }
        ]
      },
      mintedAt: '2025-10-20 16:47:20',
      txHash: '0x789ghi...rst'
    }
  ]);

  const [selectedView, setSelectedView] = useState<'risk' | 'tranches' | 'hedges' | 'system' | 'tonny' | 'oracles' | 'claims' | 'nfts'>('risk');

  const totalHedgePnL = hedgePositions.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalCapital = tranches.reduce((sum, t) => sum + t.capital, 0);
  const totalCoverage = tranches.reduce((sum, t) => sum + t.coverage, 0);

  // Format currency
  const fmt = (num: number) => `$${(num / 1000).toFixed(0)}K`;
  const fmtM = (num: number) => `$${(num / 1000000).toFixed(2)}M`;

  return (
    <TerminalWindow title="ADMIN_CONTROL_PANEL">
      <div className="space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-cream-300 border-2 border-cream-400 p-4">
            <div className="text-xs text-text-secondary font-mono">&gt; TOTAL_TVL</div>
            <div className="text-2xl font-bold font-mono text-copper-600">{fmtM(totalCapital)}</div>
          </div>
          <div className="bg-cream-300 border-2 border-cream-400 p-4">
            <div className="text-xs text-text-secondary font-mono">&gt; COVERAGE_SOLD</div>
            <div className="text-2xl font-bold font-mono text-copper-600">{fmtM(totalCoverage)}</div>
          </div>
          <div className="bg-cream-300 border-2 border-cream-400 p-4">
            <div className="text-xs text-text-secondary font-mono">&gt; LTV_RATIO</div>
            <div className={`text-2xl font-bold font-mono ${riskMetrics.ltv < 0.70 ? 'text-green-600' : riskMetrics.ltv < 0.85 ? 'text-yellow-600' : 'text-red-600'}`}>
              {(riskMetrics.ltv * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-cream-300 border-2 border-cream-400 p-4">
            <div className="text-xs text-text-secondary font-mono">&gt; HEDGE_PNL</div>
            <div className={`text-2xl font-bold font-mono ${totalHedgePnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalHedgePnL >= 0 ? '+' : ''}{fmt(totalHedgePnL)}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b-2 border-cream-400 pb-2 flex-wrap">
          {[
            { key: 'risk', label: 'RISK_MONITOR' },
            { key: 'tranches', label: 'TRANCHE_HEALTH' },
            { key: 'hedges', label: 'HEDGE_POSITIONS' },
            { key: 'claims', label: 'CLAIMS' },
            { key: 'oracles', label: 'ORACLE_HEALTH' },
            { key: 'tonny', label: 'TONNY_BOT' },
            { key: 'nfts', label: 'NFT_TRACKER' },
            { key: 'system', label: 'SYSTEM_STATUS' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSelectedView(tab.key as any)}
              className={`px-4 py-2 font-mono text-sm border-2 transition-colors ${
                selectedView === tab.key
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'bg-cream-300 border-cream-400 hover:bg-cream-200'
              }`}
            >
              &gt; {tab.label}
            </button>
          ))}
        </div>

        {/* Risk Monitor View */}
        {selectedView === 'risk' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm space-y-2">
                <div>&gt; RISK_ASSESSMENT_SUMMARY</div>
                <div className="pl-4">
                  <div>VaR (95%): <span className="text-copper-600">${(riskMetrics.var_95 / 1000).toFixed(0)}K</span></div>
                  <div>VaR (99%): <span className="text-copper-600">${(riskMetrics.var_99 / 1000).toFixed(0)}K</span></div>
                  <div>Max Asset Concentration: <span className="text-copper-600">{(riskMetrics.max_concentration * 100).toFixed(1)}%</span></div>
                  <div>Reserve Ratio: <span className="text-copper-600">{(riskMetrics.reserve_ratio * 100).toFixed(1)}%</span></div>
                </div>
              </div>
            </TerminalOutput>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-4">&gt; LTV_GAUGE</div>
                <div className="relative h-32 flex items-end justify-center">
                  <div className="w-full bg-gray-200 h-4 relative">
                    <div
                      className={`h-full absolute left-0 ${riskMetrics.ltv < 0.70 ? 'bg-green-500' : riskMetrics.ltv < 0.85 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${riskMetrics.ltv * 100}%` }}
                    />
                  </div>
                  <div className="absolute bottom-8 text-3xl font-bold font-mono">
                    {(riskMetrics.ltv * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-4">&gt; ASSET_CONCENTRATION</div>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'USDC', value: 35 },
                        { name: 'USDT', value: 28 },
                        { name: 'DAI', value: 18 },
                        { name: 'Other', value: 19 }
                      ]}
                      cx="50%"
                      cy="50%"
                      outerRadius={50}
                      dataKey="value"
                      label={(entry) => `${entry.name} ${entry.value}%`}
                    >
                      {[0, 1, 2, 3].map((_, index) => (
                        <Cell key={`cell-${index}`} fill={TRANCHE_COLORS[index]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Tranche Health View */}
        {selectedView === 'tranches' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm">&gt; 6-TIER_WATERFALL_STRUCTURE</div>
            </TerminalOutput>

            <div className="grid grid-cols-3 gap-4">
              {tranches.map((tranche, idx) => (
                <div key={tranche.id} className="bg-cream-300 border-2 border-cream-400 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-4 h-4 border-2 border-cream-400"
                      style={{ backgroundColor: TRANCHE_COLORS[idx] }}
                    />
                    <div className="font-mono text-sm font-bold">{tranche.id}</div>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span>Capital:</span>
                      <span className="font-bold">{fmt(tranche.capital)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Coverage:</span>
                      <span>{fmt(tranche.coverage)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>APY:</span>
                      <span className="text-green-600 font-bold">{tranche.apy.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Utilization:</span>
                      <span>{(tranche.utilization * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-cream-300 border-2 border-cream-400 p-4">
              <div className="font-mono text-sm mb-4">&gt; CAPITAL_ALLOCATION</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tranches}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="id" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="capital" name="Capital" fill="#60A5FA" />
                  <Bar dataKey="coverage" name="Coverage" fill="#F97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Hedge Positions View */}
        {selectedView === 'hedges' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm space-y-1">
                <div>&gt; ACTIVE_HEDGE_POSITIONS: {hedgePositions.length}</div>
                <div>&gt; TOTAL_HEDGE_AMOUNT: {fmt(hedgePositions.reduce((sum, p) => sum + p.amount, 0))}</div>
                <div>&gt; CUMULATIVE_PNL: <span className={totalHedgePnL >= 0 ? 'text-green-600' : 'text-red-600'}>{totalHedgePnL >= 0 ? '+' : ''}{fmt(totalHedgePnL)}</span></div>
              </div>
            </TerminalOutput>

            <div className="bg-cream-300 border-2 border-cream-400 overflow-hidden">
              <table className="w-full font-mono text-sm">
                <thead className="bg-copper-500 text-cream-50">
                  <tr>
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">VENUE</th>
                    <th className="text-left p-3">PRODUCT</th>
                    <th className="text-right p-3">AMOUNT</th>
                    <th className="text-right p-3">PNL</th>
                    <th className="text-center p-3">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {hedgePositions.map((pos, idx) => (
                    <tr key={pos.id} className={idx % 2 === 0 ? 'bg-cream-200' : 'bg-cream-300'}>
                      <td className="p-3">{pos.id}</td>
                      <td className="p-3">{pos.venue}</td>
                      <td className="p-3">{pos.product}</td>
                      <td className="p-3 text-right">{fmt(pos.amount)}</td>
                      <td className={`p-3 text-right font-bold ${pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {pos.pnl >= 0 ? '+' : ''}{fmt(pos.pnl)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-1 bg-green-500 text-white text-xs rounded">{pos.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-2">&gt; POLYMARKET</div>
                <div className="text-2xl font-bold font-mono text-green-600">HEALTHY</div>
                <div className="text-xs font-mono text-text-secondary mt-1">2 positions | +$7.0K PnL</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-2">&gt; BINANCE_FUTURES</div>
                <div className="text-2xl font-bold font-mono text-green-600">HEALTHY</div>
                <div className="text-xs font-mono text-text-secondary mt-1">1 position | -$2.1K PnL</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-2">&gt; PERPETUALS</div>
                <div className="text-2xl font-bold font-mono text-green-600">HEALTHY</div>
                <div className="text-xs font-mono text-text-secondary mt-1">1 position | +$8.5K PnL</div>
              </div>
            </div>
          </div>
        )}

        {/* Claims Monitor View */}
        {selectedView === 'claims' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm space-y-1">
                <div>&gt; CLAIMS_PROCESSING_DASHBOARD</div>
                <div>&gt; TOTAL_CLAIMS: {claims.length} | PENDING: {claims.filter(c => c.status === 'pending').length} | APPROVED: {claims.filter(c => c.status === 'approved').length} | PAID: {claims.filter(c => c.status === 'paid').length}</div>
              </div>
            </TerminalOutput>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; PENDING_CLAIMS</div>
                <div className="text-2xl font-bold font-mono text-yellow-600">{claims.filter(c => c.status === 'pending').length}</div>
                <div className="text-xs text-text-secondary font-mono mt-1">${(claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.claimAmount, 0) / 1000).toFixed(0)}K total</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; APPROVED_CLAIMS</div>
                <div className="text-2xl font-bold font-mono text-green-600">{claims.filter(c => c.status === 'approved' || c.status === 'paid').length}</div>
                <div className="text-xs text-text-secondary font-mono mt-1">${(claims.filter(c => c.status === 'approved' || c.status === 'paid').reduce((sum, c) => sum + c.claimAmount, 0) / 1000).toFixed(0)}K total</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; REJECTED_CLAIMS</div>
                <div className="text-2xl font-bold font-mono text-red-600">{claims.filter(c => c.status === 'rejected').length}</div>
                <div className="text-xs text-text-secondary font-mono mt-1">${(claims.filter(c => c.status === 'rejected').reduce((sum, c) => sum + c.claimAmount, 0) / 1000).toFixed(0)}K total</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; AVG_PAYOUT_TIME</div>
                <div className="text-2xl font-bold font-mono text-copper-600">2.3h</div>
                <div className="text-xs text-green-600 font-mono mt-1">-15min ↓</div>
              </div>
            </div>

            <div className="bg-cream-300 border-2 border-cream-400 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-sm">
                  <thead className="bg-copper-500 text-cream-50">
                    <tr>
                      <th className="text-left p-3">CLAIM_ID</th>
                      <th className="text-left p-3">POLICY_ID</th>
                      <th className="text-left p-3">CLAIMANT</th>
                      <th className="text-left p-3">TYPE</th>
                      <th className="text-right p-3">AMOUNT</th>
                      <th className="text-center p-3">STATUS</th>
                      <th className="text-left p-3">SUBMITTED</th>
                      <th className="text-left p-3">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim, idx) => (
                      <tr key={claim.id} className={idx % 2 === 0 ? 'bg-cream-200' : 'bg-cream-300'}>
                        <td className="p-3 font-bold">{claim.id}</td>
                        <td className="p-3">{claim.policyId}</td>
                        <td className="p-3 text-xs">{claim.claimant}</td>
                        <td className="p-3">{claim.coverageType}</td>
                        <td className="p-3 text-right font-bold">${(claim.claimAmount / 1000).toFixed(0)}K</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 text-xs rounded ${
                            claim.status === 'paid' ? 'bg-green-500 text-white' :
                            claim.status === 'approved' ? 'bg-blue-500 text-white' :
                            claim.status === 'pending' ? 'bg-yellow-500 text-white' :
                            'bg-red-500 text-white'
                          }`}>{claim.status.toUpperCase()}</span>
                        </td>
                        <td className="p-3 text-xs">{claim.submittedAt}</td>
                        <td className="p-3">
                          <button className="px-2 py-1 bg-copper-500 text-cream-50 text-xs rounded hover:bg-copper-600">
                            VIEW
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {claims.slice(0, 2).map(claim => (
                <div key={claim.id} className="bg-cream-300 border-2 border-cream-400 p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="font-mono text-sm font-bold">{claim.id}</div>
                    <div className={`px-2 py-1 text-xs font-mono rounded ${
                      claim.status === 'paid' ? 'bg-green-500 text-white' :
                      claim.status === 'approved' ? 'bg-blue-500 text-white' :
                      claim.status === 'pending' ? 'bg-yellow-500 text-white' :
                      'bg-red-500 text-white'
                    }`}>{claim.status.toUpperCase()}</div>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span>Policy:</span>
                      <span className="font-bold">{claim.policyId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span>{claim.coverageType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span className="text-copper-600 font-bold">${(claim.claimAmount / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Submitted:</span>
                      <span>{claim.submittedAt.split(' ')[0]}</span>
                    </div>
                    {claim.approvedAt && (
                      <div className="flex justify-between">
                        <span>Approved:</span>
                        <span>{claim.approvedAt.split(' ')[0]}</span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-cream-400">
                      <div className="text-text-secondary mb-1">Evidence ({claim.evidence.length}):</div>
                      {claim.evidence.map((ev, i) => (
                        <div key={i} className="pl-2 text-xs">• {ev}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Oracle Health View */}
        {selectedView === 'oracles' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm space-y-1">
                <div>&gt; ORACLE_MONITORING_DASHBOARD</div>
                <div>&gt; ACTIVE_ORACLES: 12 | HEALTHY: 11 | DEGRADED: 1</div>
              </div>
            </TerminalOutput>

            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'Chainlink Price Feed', category: 'PRICE', status: 'healthy', lastUpdate: '5s ago', accuracy: '99.97%', latency: '2.1s' },
                { name: 'Pyth Network', category: 'PRICE', status: 'healthy', lastUpdate: '3s ago', accuracy: '99.95%', latency: '1.8s' },
                { name: 'DIA Oracle', category: 'PRICE', status: 'healthy', lastUpdate: '8s ago', accuracy: '99.89%', latency: '3.2s' },
                { name: 'Tellor', category: 'PRICE', status: 'degraded', lastUpdate: '45s ago', accuracy: '98.12%', latency: '12.5s' },
                { name: 'Band Protocol', category: 'PRICE', status: 'healthy', lastUpdate: '6s ago', accuracy: '99.92%', latency: '2.4s' },
                { name: 'TON DNS Oracle', category: 'CHAIN', status: 'healthy', lastUpdate: '2s ago', accuracy: '100%', latency: '1.2s' },
                { name: 'Bridge Monitor (Wormhole)', category: 'BRIDGE', status: 'healthy', lastUpdate: '4s ago', accuracy: '100%', latency: '1.5s' },
                { name: 'Bridge Monitor (Layer0)', category: 'BRIDGE', status: 'healthy', lastUpdate: '7s ago', accuracy: '100%', latency: '2.8s' },
                { name: 'Stablecoin Peg Monitor', category: 'DEPEG', status: 'healthy', lastUpdate: '3s ago', accuracy: '99.99%', latency: '1.1s' },
                { name: 'Protocol Risk Oracle', category: 'RISK', status: 'healthy', lastUpdate: '15s ago', accuracy: '99.45%', latency: '5.2s' },
                { name: 'Volatility Index Oracle', category: 'VOL', status: 'healthy', lastUpdate: '10s ago', accuracy: '99.78%', latency: '3.8s' },
                { name: 'Cross-Chain Validator', category: 'CHAIN', status: 'healthy', lastUpdate: '5s ago', accuracy: '100%', latency: '2.2s' }
              ].map(oracle => (
                <div key={oracle.name} className="bg-cream-300 border-2 border-cream-400 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm font-bold">{oracle.name}</div>
                      <div className="text-xs font-mono text-copper-600 mt-1">[{oracle.category}]</div>
                    </div>
                    <div className={`w-3 h-3 rounded-full border-2 ${
                      oracle.status === 'healthy' ? 'bg-green-500 border-green-700' :
                      oracle.status === 'degraded' ? 'bg-yellow-500 border-yellow-700' :
                      'bg-red-500 border-red-700'
                    }`} />
                  </div>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`uppercase font-bold ${
                        oracle.status === 'healthy' ? 'text-green-600' :
                        oracle.status === 'degraded' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>{oracle.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Update:</span>
                      <span>{oracle.lastUpdate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Accuracy:</span>
                      <span className="text-copper-600 font-bold">{oracle.accuracy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latency:</span>
                      <span>{oracle.latency}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tonny Bot Monitor View */}
        {selectedView === 'tonny' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm space-y-1">
                <div>&gt; TONNY_AI_TELEGRAM_BOT_MONITOR</div>
                <div>&gt; STATUS: ACTIVE | UPTIME: 48h 12m | MODEL: Mistral-7B-Fine-Tuned</div>
              </div>
            </TerminalOutput>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; TOTAL_USERS</div>
                <div className="text-2xl font-bold font-mono text-copper-600">1,247</div>
                <div className="text-xs text-green-600 font-mono mt-1">+18 today</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; MESSAGES_24H</div>
                <div className="text-2xl font-bold font-mono text-copper-600">3,892</div>
                <div className="text-xs text-text-secondary font-mono mt-1">avg 162/hr</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; QUOTES_GEN</div>
                <div className="text-2xl font-bold font-mono text-copper-600">147</div>
                <div className="text-xs text-green-600 font-mono mt-1">+12 today</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; AVG_RESPONSE</div>
                <div className="text-2xl font-bold font-mono text-copper-600">1.8s</div>
                <div className="text-xs text-green-600 font-mono mt-1">-0.2s ↓</div>
              </div>
            </div>

            <div className="bg-cream-300 border-2 border-cream-400 p-4">
              <div className="font-mono text-sm mb-4">&gt; RECENT_INTERACTIONS (LP_VAULT_TOKENS_HIGHLIGHTED)</div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {[
                  { time: '18:45:32', user: '@crypto_hodler', command: '/quote', response: 'Generated USDC depeg quote: $175.58 for $10K coverage', status: 'success', hasVaultToken: false },
                  { time: '18:44:58', user: '@defi_trader', command: '/stake_senior', response: 'Deposited $25K to Senior Tranche. Minted SURE-SNR LP NFT #589 with 7.1% APY', status: 'success', hasVaultToken: true },
                  { time: '18:44:20', user: '@whale_investor', command: '/stake_junior', response: 'Deposited $50K to Junior Tranche. Minted SURE-JNR LP NFT #592 with 20.5% APY', status: 'success', hasVaultToken: true },
                  { time: '18:43:55', user: '@newbie123', command: '/help', response: 'Provided Tonsurance product overview', status: 'success', hasVaultToken: false },
                  { time: '18:43:30', user: '@risk_manager', command: '/my_positions', response: 'You have 2 active LP positions: SURE-SNR (#412, $15K, 7.1% APY) and SURE-MEZZ (#387, $8K, 12.3% APY)', status: 'success', hasVaultToken: true },
                  { time: '18:43:15', user: '@protocol_dev', command: '/api_docs', response: 'Shared API documentation link', status: 'success', hasVaultToken: false },
                  { time: '18:42:58', user: '@yield_farmer', command: '/apy', response: 'Current vault APYs: Senior 7.1%, Junior 20.5%, Equity 51.2%', status: 'success', hasVaultToken: false },
                  { time: '18:42:30', user: '@lp_provider', command: '/withdraw', response: 'Initiated withdrawal from SURE-SNR LP position #412. Burning NFT, releasing $15.2K + $347 yield', status: 'success', hasVaultToken: true }
                ].map((interaction, idx) => (
                  <div key={idx} className={`p-3 ${interaction.hasVaultToken ? 'bg-blue-100 border-l-4 border-blue-500' : 'bg-cream-200 border-l-4 border-copper-500'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-mono text-xs text-text-secondary">
                        [{interaction.time}] {interaction.user}
                        {interaction.hasVaultToken && <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded">LP_TOKEN</span>}
                      </div>
                      <div className={`px-2 py-1 text-xs font-mono rounded ${
                        interaction.status === 'success' ? 'bg-green-500 text-white' :
                        interaction.status === 'pending' ? 'bg-yellow-500 text-white' :
                        'bg-red-500 text-white'
                      }`}>{interaction.status.toUpperCase()}</div>
                    </div>
                    <div className="font-mono text-sm text-copper-600 mb-1">&gt; {interaction.command}</div>
                    <div className={`font-mono text-xs pl-4 ${interaction.hasVaultToken ? 'text-blue-800 font-semibold' : 'text-text-secondary'}`}>
                      {interaction.response}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-4">&gt; COMMAND_DISTRIBUTION</div>
                <div className="space-y-2 text-xs font-mono">
                  {[
                    { cmd: '/quote', count: 523, pct: 34 },
                    { cmd: '/help', count: 412, pct: 27 },
                    { cmd: '/buy', count: 287, pct: 18 },
                    { cmd: '/hedged_quote', count: 198, pct: 13 },
                    { cmd: '/apy', count: 132, pct: 8 }
                  ].map(cmd => (
                    <div key={cmd.cmd} className="flex items-center gap-2">
                      <div className="w-24">{cmd.cmd}</div>
                      <div className="flex-1 bg-gray-200 h-4 relative">
                        <div
                          className="h-full bg-copper-500 absolute left-0"
                          style={{ width: `${cmd.pct}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">{cmd.count} ({cmd.pct}%)</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="font-mono text-sm mb-4">&gt; MODEL_PERFORMANCE</div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span>Response Accuracy:</span>
                    <span className="text-green-600 font-bold">98.7%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Tokens/Response:</span>
                    <span className="font-bold">142</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Context Window Used:</span>
                    <span className="font-bold">45%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inference Time:</span>
                    <span className="font-bold">1.2s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>MLX Server Status:</span>
                    <span className="text-green-600 font-bold uppercase">Healthy</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Telegram API Status:</span>
                    <span className="text-green-600 font-bold uppercase">Connected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NFT Tracker View */}
        {selectedView === 'nfts' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm space-y-1">
                <div>&gt; NFT_GENERATION_TRACKER</div>
                <div>&gt; TOTAL_MINTED: {nftMints.length} | POLICIES: {nftMints.filter(n => n.type === 'policy').length} | VAULT_POSITIONS: {nftMints.filter(n => n.type === 'vault_position').length} | CLAIM_RECEIPTS: {nftMints.filter(n => n.type === 'claim_receipt').length}</div>
              </div>
            </TerminalOutput>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; POLICY_NFTS</div>
                <div className="text-2xl font-bold font-mono text-copper-600">{nftMints.filter(n => n.type === 'policy').length}</div>
                <div className="text-xs text-green-600 font-mono mt-1">+3 today</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; VAULT_LP_NFTS</div>
                <div className="text-2xl font-bold font-mono text-copper-600">{nftMints.filter(n => n.type === 'vault_position').length}</div>
                <div className="text-xs text-green-600 font-mono mt-1">+5 today</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; CLAIM_RECEIPTS</div>
                <div className="text-2xl font-bold font-mono text-copper-600">{nftMints.filter(n => n.type === 'claim_receipt').length}</div>
                <div className="text-xs text-green-600 font-mono mt-1">+1 today</div>
              </div>
              <div className="bg-cream-300 border-2 border-cream-400 p-4">
                <div className="text-xs text-text-secondary font-mono">&gt; AVG_MINT_TIME</div>
                <div className="text-2xl font-bold font-mono text-copper-600">3.2s</div>
                <div className="text-xs text-text-secondary font-mono mt-1">per NFT</div>
              </div>
            </div>

            <div className="bg-cream-300 border-2 border-cream-400 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-sm">
                  <thead className="bg-copper-500 text-cream-50">
                    <tr>
                      <th className="text-left p-3">NFT_ID</th>
                      <th className="text-left p-3">TYPE</th>
                      <th className="text-left p-3">TOKEN_ID</th>
                      <th className="text-left p-3">NAME</th>
                      <th className="text-left p-3">OWNER</th>
                      <th className="text-left p-3">MINTED</th>
                      <th className="text-left p-3">TX_HASH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nftMints.map((nft, idx) => (
                      <tr key={nft.id} className={idx % 2 === 0 ? 'bg-cream-200' : 'bg-cream-300'}>
                        <td className="p-3 font-bold">{nft.id}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            nft.type === 'policy' ? 'bg-purple-500 text-white' :
                            nft.type === 'vault_position' ? 'bg-blue-500 text-white' :
                            'bg-green-500 text-white'
                          }`}>{nft.type.toUpperCase().replace('_', ' ')}</span>
                        </td>
                        <td className="p-3">#{nft.tokenId}</td>
                        <td className="p-3 text-xs">{nft.metadata.name}</td>
                        <td className="p-3 text-xs">{nft.owner}</td>
                        <td className="p-3 text-xs">{nft.mintedAt.split(' ')[0]}</td>
                        <td className="p-3 text-xs">{nft.txHash.slice(0, 10)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {nftMints.map(nft => (
                <div key={nft.id} className="bg-cream-300 border-2 border-cream-400 p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-mono text-sm font-bold">{nft.metadata.name}</div>
                      <div className="text-xs font-mono text-copper-600 mt-1">Token #{nft.tokenId}</div>
                    </div>
                    <div className={`px-2 py-1 text-xs font-mono rounded ${
                      nft.type === 'policy' ? 'bg-purple-500 text-white' :
                      nft.type === 'vault_position' ? 'bg-blue-500 text-white' :
                      'bg-green-500 text-white'
                    }`}>{nft.type.toUpperCase().replace('_', ' ')}</div>
                  </div>

                  <div className="text-xs font-mono text-text-secondary mb-3">
                    {nft.metadata.description}
                  </div>

                  <div className="bg-cream-200 border border-cream-400 p-3 rounded mb-3">
                    <div className="font-mono text-xs font-bold mb-2">Attributes:</div>
                    <div className="space-y-1 text-xs font-mono">
                      {nft.metadata.attributes.map((attr, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-text-secondary">{attr.trait_type}:</span>
                          <span className="font-bold text-copper-600">
                            {typeof attr.value === 'number'
                              ? (attr.trait_type.includes('Amount') || attr.trait_type.includes('Deposited')
                                  ? `$${(attr.value / 1000).toFixed(0)}K`
                                  : attr.value)
                              : attr.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span>Owner:</span>
                      <span className="text-xs">{nft.owner}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Minted:</span>
                      <span>{nft.mintedAt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>TX Hash:</span>
                      <span className="text-xs">{nft.txHash.slice(0, 16)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IPFS:</span>
                      <span className="text-xs">{nft.metadata.image.slice(0, 20)}...</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Status View */}
        {selectedView === 'system' && (
          <div className="space-y-6">
            <TerminalOutput>
              <div className="font-mono text-sm">&gt; SYSTEM_HEALTH_CHECK</div>
            </TerminalOutput>

            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'PostgreSQL', status: 'healthy', uptime: '48h 12m' },
                { name: 'Redis', status: 'healthy', uptime: '48h 12m' },
                { name: 'RabbitMQ', status: 'healthy', uptime: '48h 12m' },
                { name: 'API Server', status: 'healthy', uptime: '48h 12m' },
                { name: 'Risk Monitor Daemon', status: 'healthy', uptime: '48h 12m' },
                { name: 'Pricing Keeper', status: 'healthy', uptime: '48h 12m' }
              ].map(service => (
                <div key={service.name} className="bg-cream-300 border-2 border-cream-400 p-4">
                  <div className="flex justify-between items-center">
                    <div className="font-mono text-sm">{service.name}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-green-700" />
                      <span className="text-xs font-mono text-green-700 uppercase">{service.status}</span>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-text-secondary mt-2">Uptime: {service.uptime}</div>
                </div>
              ))}
            </div>

            <div className="bg-cream-300 border-2 border-cream-400 p-4">
              <div className="font-mono text-sm mb-4">&gt; RECENT_ACTIVITY_LOG</div>
              <div className="space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                {[
                  '[18:45:32] Risk Monitor: VaR calculation completed - $780K (99%)',
                  '[18:45:15] Hedge Executor: Opened Polymarket position H005 - $50K',
                  '[18:44:58] API: Premium quote generated for USDC depeg coverage',
                  '[18:44:42] Tranche: SURE-JNR rebalanced - new capital $1.52M',
                  '[18:44:20] System: Health check passed - all services nominal',
                  '[18:43:55] Database: Connection pool stats - 45/100 active'
                ].map((log, idx) => (
                  <div key={idx} className="text-text-secondary">{log}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </TerminalWindow>
  );
};
