/**
 * Tonsurance API Client
 * TypeScript client for interacting with the Tonsurance backend
 */

export type Blockchain = 'Ethereum' | 'Arbitrum' | 'Base' | 'Polygon' | 'Optimism' | 'Bitcoin' | 'Lightning' | 'TON';

export interface QuoteRequest {
  asset: 'USDC' | 'USDT' | 'USDP' | 'DAI' | 'FRAX' | 'BUSD';
  coverage_amount_usd: number;
  trigger_price: number;
  floor_price: number;
  duration_days: number;
  monitored_chain?: Blockchain; // NEW: Which chain to monitor asset on
  settlement_chain?: Blockchain; // NEW: Defaults to TON
}

export interface QuoteResponse {
  premium_usd: number;
  premium_rate_bps: number;
  coverage_usd: number;
  duration_days: number;
  estimated_roi: number;
  available: boolean;
  reason?: string;
}

export interface PolicyPurchaseRequest {
  buyer_address: string;
  beneficiary_address?: string;
  asset: string;
  coverage_amount_usd: number;
  trigger_price: number;
  floor_price: number;
  duration_days: number;
  is_gift?: boolean;
  gift_message?: string;
  monitored_chain?: Blockchain; // NEW
  settlement_chain?: Blockchain; // NEW
}

// NEW: Bulk protection types
export interface BulkProtectionRequest {
  payer_address: string;
  beneficiaries: BeneficiaryEntry[];
  template: ProtectionTemplate;
  notify_beneficiaries: boolean;
  payment_method?: 'TON' | 'USDC' | 'Card';
}

export interface BeneficiaryEntry {
  wallet_address: string;
  custom_message?: string;
  notification_channel?: NotificationChannel;
}

export interface ProtectionTemplate {
  asset: string;
  coverage_amount: number;
  trigger_price: number;
  floor_price: number;
  duration_days: number;
}

export type NotificationChannel =
  | { type: 'Email'; address: string }
  | { type: 'Telegram'; username: string }
  | { type: 'OnChain' }
  | { type: 'Push'; device_token: string };

export interface BulkProtectionResponse {
  request_id: string;
  payer: string;
  num_policies: number;
  total_premium_paid: number;
  discount_applied: number;
  policies_created: number[];
  notification_status: [string, string][];
  timestamp: number;
}

// NEW: Escrow types
export interface EscrowCreateRequest {
  payer: string;
  payee: string;
  amount_usd: number;
  release_conditions: ReleaseCondition[];
  timeout_action: 'RefundPayer' | 'ReleaseFunds' | 'ExtendTimeout';
  timeout_seconds: number;
  additional_parties?: PartyAllocation[];
  protection_enabled: boolean;
}

export type ReleaseCondition =
  | { type: 'OracleVerification'; oracle_endpoint: string; expected_value: string }
  | { type: 'TimeElapsed'; seconds: number; start_time: number }
  | { type: 'ManualApproval'; approver: string; approval_deadline?: number }
  | { type: 'ChainEvent'; chain: Blockchain; event_type: string; contract_address: string }
  | { type: 'MultisigApproval'; required_signatures: number; signers: string[] };

export interface PartyAllocation {
  party_address: string;
  percentage: number;
  role: string;
}

export interface EscrowContract {
  escrow_id: number;
  payer: string;
  payee: string;
  amount: number;
  release_conditions: ReleaseCondition[];
  status: 'Active' | 'Released' | 'Cancelled';
  created_at: number;
  funded_at?: number;
  released_at?: number;
  timeout_at: number;
  protection_enabled: boolean;
  protection_policy_id?: number;
}

export interface PolicyPurchaseResponse {
  policy_id: number;
  contract_address: string;
  nft_minted: boolean;
  premium_paid_usd: number;
  transaction_hash: string;
}

export interface PolicyInfo {
  policy: {
    policy_id: number;
    policyholder: string;
    beneficiary?: string;
    asset: string;
    coverage_amount: number;
    trigger_price: number;
    floor_price: number;
    status: string;
  };
  current_asset_price: number;
  is_triggered: boolean;
  time_remaining_seconds: number;
  estimated_payout_usd?: number;
}

export interface VaultInfo {
  total_capital_usd: number;
  total_coverage_sold_usd: number;
  ltv_ratio: number;
  usd_reserves_usd: number;
  btc_float_btc: number;
  btc_float_usd: number;
  tranches: TrancheInfo[];
  available_capacity_usd: number;
}

export interface TrancheInfo {
  tranche_id: number;
  seniority: number;
  target_yield_bps: number;
  nav: number;
  tvl_usd: number;
  accumulated_yield_usd: number;
  accumulated_loss_usd: number;
}

export interface RiskMetrics {
  var_95: number;
  var_99: number;
  cvar_95: number;
  expected_loss: number;
  ltv: number;
  reserve_ratio: number;
  max_concentration: number;
  breach_alerts: number;
  warning_alerts: number;
}

export class TonsuranceClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = 'http://localhost:8080', apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'X-API-Key': this.apiKey }),
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: response.statusText,
      }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  /**
   * Get a premium quote for insurance coverage
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    return this.request<QuoteResponse>('/api/v1/quote', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Purchase an insurance policy
   */
  async purchasePolicy(
    request: PolicyPurchaseRequest
  ): Promise<PolicyPurchaseResponse> {
    return this.request<PolicyPurchaseResponse>('/api/v1/policy/purchase', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get policy information by ID
   */
  async getPolicy(policyId: number): Promise<PolicyInfo> {
    return this.request<PolicyInfo>(`/api/v1/policy/${policyId}`);
  }

  /**
   * Get vault information
   */
  async getVaultInfo(): Promise<VaultInfo> {
    return this.request<VaultInfo>('/api/v1/vault/info');
  }

  /**
   * Deposit liquidity to a tranche
   */
  async depositLP(
    lpAddress: string,
    trancheId: number,
    amountUsd: number
  ): Promise<any> {
    return this.request('/api/v1/lp/deposit', {
      method: 'POST',
      body: JSON.stringify({
        lp_address: lpAddress,
        tranche_id: trancheId,
        amount_usd: amountUsd,
      }),
    });
  }

  /**
   * Withdraw liquidity from a tranche
   */
  async withdrawLP(
    lpAddress: string,
    trancheId: number,
    lpTokens: number
  ): Promise<any> {
    return this.request('/api/v1/lp/withdraw', {
      method: 'POST',
      body: JSON.stringify({
        lp_address: lpAddress,
        tranche_id: trancheId,
        lp_tokens: lpTokens,
      }),
    });
  }

  /**
   * Get current risk metrics
   */
  async getRiskMetrics(): Promise<RiskMetrics> {
    return this.request<RiskMetrics>('/api/v1/risk/metrics');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: number }> {
    return this.request('/health');
  }

  /**
   * NEW: Purchase bulk protection for multiple beneficiaries
   */
  async purchaseBulkProtection(
    request: BulkProtectionRequest
  ): Promise<BulkProtectionResponse> {
    return this.request<BulkProtectionResponse>('/api/v1/protection/bulk', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * NEW: Get bulk protection statistics
   */
  async getBulkStats(payerAddress: string): Promise<any> {
    return this.request(`/api/v1/protection/bulk/stats/${payerAddress}`);
  }

  /**
   * NEW: Create escrow contract
   */
  async createEscrow(request: EscrowCreateRequest): Promise<EscrowContract> {
    return this.request<EscrowContract>('/api/v1/escrow/create', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * NEW: Get escrow status
   */
  async getEscrow(escrowId: number): Promise<EscrowContract> {
    return this.request<EscrowContract>(`/api/v1/escrow/${escrowId}`);
  }

  /**
   * NEW: Approve escrow release
   */
  async approveEscrow(
    escrowId: number,
    approver: string,
    signature: string
  ): Promise<EscrowContract> {
    return this.request<EscrowContract>('/api/v1/escrow/approve', {
      method: 'POST',
      body: JSON.stringify({ escrow_id: escrowId, approver, signature }),
    });
  }

  /**
   * NEW: Cancel escrow
   */
  async cancelEscrow(
    escrowId: number,
    canceller: string
  ): Promise<EscrowContract> {
    return this.request<EscrowContract>('/api/v1/escrow/cancel', {
      method: 'POST',
      body: JSON.stringify({ escrow_id: escrowId, canceller }),
    });
  }

  /**
   * NEW: Get bridge health status
   */
  async getBridgeHealth(chain: Blockchain): Promise<any> {
    return this.request(`/api/v1/bridge/health/${chain}`);
  }

  /**
   * NEW: Get cross-chain price data
   */
  async getCrossChainPrices(asset: string): Promise<any> {
    return this.request(`/api/v1/oracle/cross-chain/${asset}`);
  }
}

/**
 * Helper functions for common calculations
 */
export class TonsuranceHelpers {
  /**
   * Calculate estimated payout for a policy
   */
  static calculatePayout(
    coverageUsd: number,
    triggerPrice: number,
    floorPrice: number,
    currentPrice: number
  ): number {
    if (currentPrice >= triggerPrice) return 0;

    const clampedPrice = Math.max(floorPrice, Math.min(triggerPrice, currentPrice));
    const priceDrop = triggerPrice - clampedPrice;
    const protectionRange = triggerPrice - floorPrice;
    const interpolationFactor = priceDrop / protectionRange;

    return coverageUsd * interpolationFactor;
  }

  /**
   * Calculate premium rate in basis points
   */
  static calculatePremiumRate(premiumUsd: number, coverageUsd: number): number {
    return Math.round((premiumUsd / coverageUsd) * 10000);
  }

  /**
   * Format USD cents to dollars
   */
  static centsToUsd(cents: number): number {
    return cents / 100;
  }

  /**
   * Format dollars to USD cents
   */
  static usdToCents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  /**
   * Format BTC satoshis to BTC
   */
  static satsToBtc(sats: number): number {
    return sats / 100000000;
  }

  /**
   * Format BTC to satoshis
   */
  static btcToSats(btc: number): number {
    return Math.round(btc * 100000000);
  }

  /**
   * Format duration in seconds to human readable
   */
  static formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Format basis points to percentage
   */
  static bpsToPercent(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
  }

  /**
   * Validate TON address format
   */
  static isValidTonAddress(address: string): boolean {
    return /^EQ[A-Za-z0-9_-]{46}$/.test(address);
  }

  /**
   * Calculate ROI percentage
   */
  static calculateROI(payout: number, premium: number): number {
    if (premium === 0) return 0;
    return ((payout - premium) / premium) * 100;
  }

  /**
   * Check if price is in trigger range
   */
  static isInTriggerRange(
    price: number,
    triggerPrice: number,
    floorPrice: number
  ): boolean {
    return price < triggerPrice && price >= floorPrice;
  }
}

// Example usage
export const exampleUsage = async () => {
  const client = new TonsuranceClient('http://localhost:8080');

  // Get a quote
  const quote = await client.getQuote({
    asset: 'USDC',
    coverage_amount_usd: 100000,
    trigger_price: 0.97,
    floor_price: 0.90,
    duration_days: 30,
  });

  console.log(`Premium: $${quote.premium_usd.toFixed(2)}`);
  console.log(`Rate: ${TonsuranceHelpers.bpsToPercent(quote.premium_rate_bps)}`);

  if (quote.available) {
    // Purchase policy
    const policy = await client.purchasePolicy({
      buyer_address: 'EQBv...',
      beneficiary_address: 'EQCx...',
      asset: 'USDC',
      coverage_amount_usd: 100000,
      trigger_price: 0.97,
      floor_price: 0.90,
      duration_days: 30,
    });

    console.log(`Policy ID: ${policy.policy_id}`);
    console.log(`Contract: ${policy.contract_address}`);

    // Get policy info
    const info = await client.getPolicy(policy.policy_id);
    console.log(`Status: ${info.policy.status}`);
    console.log(
      `Time remaining: ${TonsuranceHelpers.formatDuration(
        info.time_remaining_seconds
      )}`
    );
  }

  // Get vault info
  const vault = await client.getVaultInfo();
  console.log(`Total Capital: $${vault.total_capital_usd.toLocaleString()}`);
  console.log(`LTV: ${(vault.ltv_ratio * 100).toFixed(2)}%`);

  // Get risk metrics
  const risk = await client.getRiskMetrics();
  console.log(`VaR 95%: ${(risk.var_95 * 100).toFixed(2)}%`);
  console.log(`Reserve Ratio: ${(risk.reserve_ratio * 100).toFixed(2)}%`);
};
