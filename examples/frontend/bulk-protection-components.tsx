/**
 * Bulk Protection Components for Tonsurance
 * React components for buying protection for others (gifts, enterprise)
 */

import React, { useState } from 'react';
import {
  TonsuranceClient,
  BulkProtectionRequest,
  BeneficiaryEntry,
  ProtectionTemplate,
  BulkProtectionResponse,
  NotificationChannel,
} from './api-client';

const client = new TonsuranceClient('http://localhost:8080');

/**
 * Bulk Protection Purchase Component
 */
export const BulkProtectionPurchase: React.FC = () => {
  const [template, setTemplate] = useState<ProtectionTemplate>({
    asset: 'USDC',
    coverage_amount: 10000,
    trigger_price: 0.97,
    floor_price: 0.90,
    duration_days: 30,
  });

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryEntry[]>([]);
  const [csvInput, setCsvInput] = useState('');
  const [notifyBeneficiaries, setNotifyBeneficiaries] = useState(true);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<BulkProtectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCsvUpload = (csvText: string) => {
    const lines = csvText.split('\n').filter((line) => line.trim());

    const parsed: BeneficiaryEntry[] = lines.map((line) => {
      const [wallet, email, telegram, message] = line.split(',').map((s) => s.trim());

      let notification_channel: NotificationChannel | undefined;
      if (email) {
        notification_channel = { type: 'Email', address: email };
      } else if (telegram) {
        notification_channel = { type: 'Telegram', username: telegram };
      }

      return {
        wallet_address: wallet,
        custom_message: message || undefined,
        notification_channel,
      };
    });

    setBeneficiaries(parsed);
  };

  const calculateTotalPremium = () => {
    // Mock calculation - in production, get from API
    const singlePremium = template.coverage_amount * 0.04 * (template.duration_days / 365);
    const total = singlePremium * beneficiaries.length;

    // Apply volume discount
    let discount = 0;
    if (beneficiaries.length >= 200) discount = 0.3;
    else if (beneficiaries.length >= 51) discount = 0.25;
    else if (beneficiaries.length >= 11) discount = 0.15;

    return {
      total,
      discounted: total * (1 - discount),
      discount,
    };
  };

  const handlePurchase = async () => {
    if (beneficiaries.length === 0) {
      setError('Please add at least one beneficiary');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: BulkProtectionRequest = {
        payer_address: 'EQBv...', // Would come from wallet connection
        beneficiaries,
        template,
        notify_beneficiaries: notifyBeneficiaries,
      };

      const result = await client.purchaseBulkProtection(request);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  };

  const pricing = calculateTotalPremium();

  return (
    <div className="bulk-protection">
      <h2>Bulk Protection Purchase</h2>
      <p>Buy protection for employees, family, or community members</p>

      <div className="form-section">
        <h3>Protection Template</h3>

        <div className="template-grid">
          <div className="form-group">
            <label>Asset</label>
            <select
              value={template.asset}
              onChange={(e) => setTemplate({ ...template, asset: e.target.value })}
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
              value={template.coverage_amount}
              onChange={(e) =>
                setTemplate({ ...template, coverage_amount: Number(e.target.value) })
              }
              min="1000"
            />
          </div>

          <div className="form-group">
            <label>Trigger Price</label>
            <input
              type="number"
              value={template.trigger_price}
              onChange={(e) =>
                setTemplate({ ...template, trigger_price: Number(e.target.value) })
              }
              step="0.01"
            />
          </div>

          <div className="form-group">
            <label>Floor Price</label>
            <input
              type="number"
              value={template.floor_price}
              onChange={(e) =>
                setTemplate({ ...template, floor_price: Number(e.target.value) })
              }
              step="0.01"
            />
          </div>

          <div className="form-group">
            <label>Duration (Days)</label>
            <input
              type="number"
              value={template.duration_days}
              onChange={(e) =>
                setTemplate({ ...template, duration_days: Number(e.target.value) })
              }
              min="1"
              max="365"
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Beneficiaries</h3>

        <div className="upload-section">
          <label>Upload CSV (wallet, email, telegram, message)</label>
          <textarea
            value={csvInput}
            onChange={(e) => setCsvInput(e.target.value)}
            placeholder="EQBv..., user@example.com, @telegram, Thank you!"
            rows={5}
          />
          <button onClick={() => handleCsvUpload(csvInput)}>Parse CSV</button>
        </div>

        {beneficiaries.length > 0 && (
          <div className="beneficiaries-preview">
            <h4>{beneficiaries.length} Beneficiaries</h4>
            <div className="beneficiaries-list">
              {beneficiaries.slice(0, 5).map((b, i) => (
                <div key={i} className="beneficiary-item">
                  <code>{b.wallet_address.slice(0, 10)}...</code>
                  {b.notification_channel && (
                    <span className="notification-badge">
                      {b.notification_channel.type}
                    </span>
                  )}
                </div>
              ))}
              {beneficiaries.length > 5 && (
                <div className="more-indicator">
                  + {beneficiaries.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={notifyBeneficiaries}
              onChange={(e) => setNotifyBeneficiaries(e.target.checked)}
            />
            Send notifications to beneficiaries
          </label>
        </div>
      </div>

      <div className="pricing-summary">
        <h3>Pricing Summary</h3>

        <div className="pricing-details">
          <div className="pricing-row">
            <span>Total Coverage:</span>
            <strong>
              ${(template.coverage_amount * beneficiaries.length).toLocaleString()}
            </strong>
          </div>

          <div className="pricing-row">
            <span>Premium (before discount):</span>
            <span>${pricing.total.toLocaleString()}</span>
          </div>

          {pricing.discount > 0 && (
            <>
              <div className="pricing-row discount">
                <span>Volume Discount ({(pricing.discount * 100).toFixed(0)}%):</span>
                <span className="discount-amount">
                  -${(pricing.total - pricing.discounted).toLocaleString()}
                </span>
              </div>

              <div className="discount-badge">
                🎉 You're saving {(pricing.discount * 100).toFixed(0)}% with bulk purchase!
              </div>
            </>
          )}

          <div className="pricing-row total">
            <span>Total Premium:</span>
            <strong className="highlight">${pricing.discounted.toLocaleString()}</strong>
          </div>

          <div className="pricing-row">
            <span>Per Person:</span>
            <span>
              ${(pricing.discounted / beneficiaries.length || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        className="btn-primary btn-large"
        onClick={handlePurchase}
        disabled={loading || beneficiaries.length === 0}
      >
        {loading ? 'Processing...' : `Purchase ${beneficiaries.length} Policies`}
      </button>

      {response && (
        <div className="success-section">
          <h3>✅ Purchase Successful!</h3>
          <div className="success-details">
            <p>Request ID: {response.request_id}</p>
            <p>Policies Created: {response.num_policies}</p>
            <p>
              Total Premium: $
              {(response.total_premium_paid / 100).toLocaleString()}
            </p>
            <p>
              Discount Applied: {(response.discount_applied * 100).toFixed(0)}%
            </p>

            {response.notification_status.length > 0 && (
              <div className="notification-status">
                <h4>Notification Status</h4>
                <p>
                  {
                    response.notification_status.filter(([_, status]) => status === 'sent')
                      .length
                  }{' '}
                  / {response.notification_status.length} sent
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Enterprise Dashboard Component
 */
export const EnterpriseDashboard: React.FC<{ orgAddress: string }> = ({
  orgAddress,
}) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await client.getBulkStats(orgAddress);
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [orgAddress]);

  if (loading) return <div>Loading enterprise stats...</div>;

  return (
    <div className="enterprise-dashboard">
      <h2>Enterprise Protection Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-label">Employees Covered</div>
          <div className="stat-value">{stats?.total_employees_covered || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">Total Coverage</div>
          <div className="stat-value">
            ${((stats?.total_coverage_amount || 0) / 100).toLocaleString()}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-label">Monthly Premium</div>
          <div className="stat-value">
            ${((stats?.monthly_premium || 0) / 100).toLocaleString()}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎖️</div>
          <div className="stat-label">Discount Tier</div>
          <div className="stat-value">{stats?.discount_tier || 'Standard'}</div>
        </div>
      </div>

      <div className="chart-section">
        <h3>Coverage by Asset</h3>
        <div className="asset-breakdown">
          {stats?.policies_by_asset?.map(([asset, count]: [string, number]) => (
            <div key={asset} className="asset-bar">
              <span className="asset-name">{asset}</span>
              <div className="bar-container">
                <div
                  className="bar-fill"
                  style={{
                    width: `${(count / stats.total_employees_covered) * 100}%`,
                  }}
                />
              </div>
              <span className="asset-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {stats?.upcoming_renewals > 0 && (
        <div className="alert-section">
          <h3>⚠️ Upcoming Renewals</h3>
          <p>
            {stats.upcoming_renewals} policies expiring in the next 7 days
          </p>
          <button className="btn-primary">Renew All</button>
        </div>
      )}
    </div>
  );
};

/**
 * Gift Protection Component
 */
export const GiftProtection: React.FC = () => {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [coverageAmount, setCoverageAmount] = useState(5000);
  const [notificationMethod, setNotificationMethod] = useState<'email' | 'telegram'>(
    'email'
  );
  const [notificationValue, setNotificationValue] = useState('');

  const handleGift = async () => {
    // Implementation
    console.log('Gifting protection to', recipientAddress);
  };

  return (
    <div className="gift-protection">
      <h2>🎁 Gift Protection</h2>
      <p>Protect your loved ones from stablecoin depegs</p>

      <div className="form-section">
        <div className="form-group">
          <label>Recipient Wallet Address</label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="EQCx..."
          />
        </div>

        <div className="form-group">
          <label>Coverage Amount (USD)</label>
          <input
            type="number"
            value={coverageAmount}
            onChange={(e) => setCoverageAmount(Number(e.target.value))}
            min="1000"
          />
        </div>

        <div className="form-group">
          <label>Personal Message</label>
          <textarea
            value={giftMessage}
            onChange={(e) => setGiftMessage(e.target.value)}
            placeholder="Happy Birthday! I'm gifting you protection against stablecoin depegs..."
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Notify via</label>
          <select
            value={notificationMethod}
            onChange={(e) => setNotificationMethod(e.target.value as any)}
          >
            <option value="email">Email</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>

        <div className="form-group">
          <input
            type="text"
            value={notificationValue}
            onChange={(e) => setNotificationValue(e.target.value)}
            placeholder={
              notificationMethod === 'email' ? 'email@example.com' : '@username'
            }
          />
        </div>
      </div>

      <div className="gift-preview">
        <h3>Gift Preview</h3>
        <div className="gift-card">
          <div className="gift-header">🎁 Insurance Protection Gift</div>
          <div className="gift-amount">${coverageAmount.toLocaleString()}</div>
          <div className="gift-message">{giftMessage || 'No message'}</div>
          <div className="gift-footer">From: You</div>
        </div>
      </div>

      <button className="btn-primary btn-large" onClick={handleGift}>
        Send Gift Protection
      </button>
    </div>
  );
};
