/**
 * React Component Example for Tonsurance
 * Demonstrates integration with the Tonsurance API
 */

import React, { useState, useEffect } from 'react';
import { TonsuranceClient, QuoteRequest, QuoteResponse, VaultInfo } from './api-client';

// Initialize client
const client = new TonsuranceClient('http://localhost:8080');

/**
 * Insurance Quote Component
 */
export const InsuranceQuote: React.FC = () => {
  const [formData, setFormData] = useState<QuoteRequest>({
    asset: 'USDC',
    coverage_amount_usd: 100000,
    trigger_price: 0.97,
    floor_price: 0.90,
    duration_days: 30,
  });

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetQuote = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await client.getQuote(formData);
      setQuote(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="insurance-quote">
      <h2>Get Insurance Quote</h2>

      <div className="form-group">
        <label>Asset</label>
        <select
          value={formData.asset}
          onChange={(e) => setFormData({ ...formData, asset: e.target.value as any })}
        >
          <option value="USDC">USDC</option>
          <option value="USDT">USDT</option>
          <option value="DAI">DAI</option>
          <option value="USDP">USDP</option>
          <option value="FRAX">FRAX</option>
        </select>
      </div>

      <div className="form-group">
        <label>Coverage Amount (USD)</label>
        <input
          type="number"
          value={formData.coverage_amount_usd}
          onChange={(e) =>
            setFormData({ ...formData, coverage_amount_usd: Number(e.target.value) })
          }
          min="1000"
          max="10000000"
        />
      </div>

      <div className="form-group">
        <label>Trigger Price</label>
        <input
          type="number"
          value={formData.trigger_price}
          onChange={(e) =>
            setFormData({ ...formData, trigger_price: Number(e.target.value) })
          }
          step="0.01"
          min="0.8"
          max="0.99"
        />
      </div>

      <div className="form-group">
        <label>Floor Price</label>
        <input
          type="number"
          value={formData.floor_price}
          onChange={(e) => setFormData({ ...formData, floor_price: Number(e.target.value) })}
          step="0.01"
          min="0.5"
          max="0.95"
        />
      </div>

      <div className="form-group">
        <label>Duration (Days)</label>
        <input
          type="number"
          value={formData.duration_days}
          onChange={(e) =>
            setFormData({ ...formData, duration_days: Number(e.target.value) })
          }
          min="1"
          max="365"
        />
      </div>

      <button onClick={handleGetQuote} disabled={loading}>
        {loading ? 'Loading...' : 'Get Quote'}
      </button>

      {error && <div className="error">{error}</div>}

      {quote && (
        <div className="quote-result">
          <h3>Quote Result</h3>
          <div className="quote-details">
            <div className="detail-row">
              <span>Premium:</span>
              <strong>${quote.premium_usd.toFixed(2)}</strong>
            </div>
            <div className="detail-row">
              <span>Rate:</span>
              <strong>{(quote.premium_rate_bps / 100).toFixed(2)}%</strong>
            </div>
            <div className="detail-row">
              <span>Coverage:</span>
              <strong>${quote.coverage_usd.toLocaleString()}</strong>
            </div>
            <div className="detail-row">
              <span>Duration:</span>
              <strong>{quote.duration_days} days</strong>
            </div>
            <div className="detail-row">
              <span>Available:</span>
              <strong className={quote.available ? 'success' : 'error'}>
                {quote.available ? 'Yes' : 'No'}
              </strong>
            </div>
            {!quote.available && quote.reason && (
              <div className="reason-text">{quote.reason}</div>
            )}
          </div>

          {quote.available && (
            <button className="btn-primary">Purchase Policy</button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Vault Dashboard Component
 */
export const VaultDashboard: React.FC = () => {
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVaultInfo = async () => {
      try {
        const info = await client.getVaultInfo();
        setVaultInfo(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch vault info');
      } finally {
        setLoading(false);
      }
    };

    fetchVaultInfo();
    const interval = setInterval(fetchVaultInfo, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, []);

  if (loading) return <div>Loading vault info...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!vaultInfo) return null;

  return (
    <div className="vault-dashboard">
      <h2>Vault Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Capital</div>
          <div className="stat-value">
            ${(vaultInfo.total_capital_usd / 1000000).toFixed(2)}M
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Coverage Sold</div>
          <div className="stat-value">
            ${(vaultInfo.total_coverage_sold_usd / 1000000).toFixed(2)}M
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">LTV Ratio</div>
          <div className="stat-value">{(vaultInfo.ltv_ratio * 100).toFixed(1)}%</div>
          <div className="stat-progress">
            <div
              className="stat-progress-bar"
              style={{ width: `${vaultInfo.ltv_ratio * 100}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">USD Reserves</div>
          <div className="stat-value">
            ${(vaultInfo.usd_reserves_usd / 1000000).toFixed(2)}M
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">BTC Float</div>
          <div className="stat-value">{vaultInfo.btc_float_btc.toFixed(2)} BTC</div>
          <div className="stat-sublabel">
            ${(vaultInfo.btc_float_usd / 1000000).toFixed(2)}M
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Available Capacity</div>
          <div className="stat-value">
            ${(vaultInfo.available_capacity_usd / 1000000).toFixed(2)}M
          </div>
        </div>
      </div>

      <h3>Tranches</h3>
      <div className="tranches-table">
        <table>
          <thead>
            <tr>
              <th>Tranche</th>
              <th>Target Yield</th>
              <th>NAV</th>
              <th>TVL</th>
              <th>Yield</th>
              <th>Loss</th>
            </tr>
          </thead>
          <tbody>
            {vaultInfo.tranches.map((tranche) => (
              <tr key={tranche.tranche_id}>
                <td>T{tranche.tranche_id}</td>
                <td>{(tranche.target_yield_bps / 100).toFixed(2)}%</td>
                <td>${tranche.nav.toFixed(4)}</td>
                <td>${(tranche.tvl_usd / 1000000).toFixed(2)}M</td>
                <td className="success">
                  ${(tranche.accumulated_yield_usd / 1000).toFixed(0)}k
                </td>
                <td className="error">
                  ${(tranche.accumulated_loss_usd / 1000).toFixed(0)}k
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * Policy Tracker Component
 */
export const PolicyTracker: React.FC<{ policyId: number }> = ({ policyId }) => {
  const [policyInfo, setPolicyInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const info = await client.getPolicy(policyId);
        setPolicyInfo(info);
      } catch (err) {
        console.error('Failed to fetch policy:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPolicy();
    const interval = setInterval(fetchPolicy, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [policyId]);

  if (loading) return <div>Loading policy...</div>;
  if (!policyInfo) return <div>Policy not found</div>;

  const timeRemaining = policyInfo.time_remaining_seconds;
  const daysRemaining = Math.floor(timeRemaining / 86400);
  const hoursRemaining = Math.floor((timeRemaining % 86400) / 3600);

  return (
    <div className="policy-tracker">
      <h2>Policy #{policyInfo.policy.policy_id}</h2>

      <div className="policy-status">
        <div className={`status-badge ${policyInfo.policy.status}`}>
          {policyInfo.policy.status.toUpperCase()}
        </div>
        {policyInfo.is_triggered && (
          <div className="status-badge triggered">TRIGGERED</div>
        )}
      </div>

      <div className="policy-details">
        <div className="detail-section">
          <h3>Coverage Details</h3>
          <div className="detail-row">
            <span>Asset:</span>
            <strong>{policyInfo.policy.asset}</strong>
          </div>
          <div className="detail-row">
            <span>Coverage:</span>
            <strong>
              ${(policyInfo.policy.coverage_amount / 100).toLocaleString()}
            </strong>
          </div>
          <div className="detail-row">
            <span>Trigger:</span>
            <strong>${policyInfo.policy.trigger_price}</strong>
          </div>
          <div className="detail-row">
            <span>Floor:</span>
            <strong>${policyInfo.policy.floor_price}</strong>
          </div>
        </div>

        <div className="detail-section">
          <h3>Current Status</h3>
          <div className="detail-row">
            <span>Current Price:</span>
            <strong>${policyInfo.current_asset_price.toFixed(4)}</strong>
          </div>
          <div className="detail-row">
            <span>Time Remaining:</span>
            <strong>
              {daysRemaining}d {hoursRemaining}h
            </strong>
          </div>
          {policyInfo.estimated_payout_usd && (
            <div className="detail-row">
              <span>Estimated Payout:</span>
              <strong className="highlight">
                ${policyInfo.estimated_payout_usd.toLocaleString()}
              </strong>
            </div>
          )}
        </div>

        <div className="detail-section">
          <h3>Addresses</h3>
          <div className="detail-row">
            <span>Policyholder:</span>
            <code>{policyInfo.policy.policyholder}</code>
          </div>
          {policyInfo.policy.beneficiary && (
            <div className="detail-row">
              <span>Beneficiary:</span>
              <code>{policyInfo.policy.beneficiary}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Example CSS (paste into your styles)
 */
export const exampleCSS = `
.insurance-quote,
.vault-dashboard,
.policy-tracker {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
}

button {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.quote-result {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #ddd;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.stat-card {
  padding: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.stat-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #333;
}

.stat-progress {
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin-top: 10px;
  overflow: hidden;
}

.stat-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease;
}

.success {
  color: #28a745;
}

.error {
  color: #dc3545;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.active {
  background: #28a745;
  color: white;
}

.status-badge.triggered {
  background: #ffc107;
  color: #333;
}
`;
