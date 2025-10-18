# Tonsurance API Reference

**Version**: 1.0
**Base URL**: `http://localhost:8080` (development) | `https://api.tonsurance.com` (production)
**Protocol**: REST over HTTP/HTTPS
**Response Format**: JSON

---

## Table of Contents

1. [Authentication](#authentication)
2. [Health Check](#health-check)
3. [Quote Endpoints](#quote-endpoints)
4. [Policy Endpoints](#policy-endpoints)
5. [Vault Endpoints](#vault-endpoints)
6. [LP (Liquidity Provider) Endpoints](#lp-liquidity-provider-endpoints)
7. [Risk Metrics Endpoints](#risk-metrics-endpoints)
8. [Error Codes](#error-codes)
9. [Rate Limits](#rate-limits)
10. [WebSocket Events](#websocket-events)

---

## Authentication

**Current Status**: No authentication required (development)

**Future Implementation**:
- API keys for programmatic access
- Wallet signature verification for user operations
- Rate limiting by IP address and/or API key

---

## Health Check

### GET /health

Check API server status.

**Request:**
```bash
curl -X GET http://localhost:8080/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1697385600.0
}
```

**Status Codes:**
- `200 OK`: Server is operational
- `500 Internal Server Error`: Server degraded

---

## Quote Endpoints

### POST /api/v1/quote

Calculate premium for insurance policy quote.

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "USDC",
    "coverage_amount_usd": 100000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 30
  }'
```

**Request Body:**
```json
{
  "asset": "USDC",                    // Stablecoin to insure (USDC, USDT, DAI, etc.)
  "coverage_amount_usd": 100000,       // Coverage amount in USD
  "trigger_price": 0.97,               // Trigger price (depeg threshold)
  "floor_price": 0.90,                 // Floor price (maximum payout)
  "duration_days": 30,                 // Policy duration (1-365 days)
  "chain": "ethereum",                 // Optional: blockchain (default: ethereum)
  "coverage_type": "depeg"             // Optional: coverage type (default: depeg)
}
```

**Response:**
```json
{
  "premium_usd": 328.77,
  "premium_rate_bps": 400,             // 4% APR = 400 basis points
  "coverage_usd": 100000,
  "duration_days": 30,
  "estimated_roi": 0.0,                // Historical expected return (future)
  "available": true,
  "reason": null                       // Error reason if available = false
}
```

**Validation Rules:**
- `coverage_amount_usd` > 0
- `trigger_price` < 1.0 (for stablecoins)
- `floor_price` < `trigger_price`
- `duration_days` between 1-365
- Asset must be supported (see [Product Matrix](PRODUCT_MATRIX.md))

**Status Codes:**
- `200 OK`: Quote calculated successfully
- `400 Bad Request`: Invalid input parameters
- `500 Internal Server Error`: Pricing calculation failed

**Example - Multi-dimensional Quote:**
```bash
curl -X POST http://localhost:8080/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "smart_contract",
    "chain": "polygon",
    "asset": "USDe",
    "coverage_amount_usd": 100000,
    "trigger_price": 0.95,
    "floor_price": 0.85,
    "duration_days": 90
  }'
```

**Response:**
```json
{
  "premium_usd": 1904.51,
  "premium_rate_bps": 776,             // 7.76% APR (higher for SC + Polygon + USDe)
  "coverage_usd": 100000,
  "duration_days": 90,
  "coverage_multiplier": 1.3,          // Smart contract multiplier
  "chain_multiplier": 1.2,             // Polygon risk
  "stablecoin_adjustment_bps": 150,    // Tier 3 stablecoin
  "available": true
}
```

---

## Policy Endpoints

### POST /api/v1/policy/purchase

Purchase an insurance policy.

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/policy/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "buyer_address": "EQAbc123...",
    "beneficiary_address": "EQDef456...",
    "asset": "USDC",
    "coverage_amount_usd": 100000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 30,
    "is_gift": false
  }'
```

**Request Body:**
```json
{
  "buyer_address": "EQAbc123...",           // TON address paying premium
  "beneficiary_address": "EQDef456...",     // Optional: payout recipient (default: buyer)
  "asset": "USDC",
  "coverage_amount_usd": 100000,
  "trigger_price": 0.97,
  "floor_price": 0.90,
  "duration_days": 30,
  "is_gift": false,                          // Optional: gift policy
  "gift_message": null,                      // Optional: gift message
  "coverage_type": "depeg",                  // Optional: coverage type
  "chain": "ethereum"                        // Optional: monitored chain
}
```

**Response:**
```json
{
  "policy_id": 12345678,
  "contract_address": "EQPolicy...",
  "nft_minted": true,
  "premium_paid_usd": 328.77,
  "transaction_hash": "tx_12345678"
}
```

**Status Codes:**
- `200 OK`: Policy created successfully
- `400 Bad Request`: Invalid input or insufficient capacity
- `500 Internal Server Error`: Policy creation failed

**Example - Gift Policy:**
```bash
curl -X POST http://localhost:8080/api/v1/policy/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "buyer_address": "EQAlice...",
    "beneficiary_address": "EQBob...",
    "asset": "USDC",
    "coverage_amount_usd": 10000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 90,
    "is_gift": true,
    "gift_message": "Happy Birthday! Stay safe in DeFi."
  }'
```

### GET /api/v1/policy/:id

Get policy information and status.

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/policy/12345678
```

**Response:**
```json
{
  "policy": {
    "policy_id": 12345678,
    "policyholder": "EQAbc123...",
    "beneficiary": "EQDef456...",
    "coverage_type": "depeg",
    "chain": "ethereum",
    "asset": "USDC",
    "coverage_amount": 10000000,         // USD cents (int64)
    "premium_paid": 32877,               // USD cents
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "start_time": 1697385600.0,
    "expiry_time": 1699977600.0,
    "status": "active",
    "payout_amount": null,
    "payout_time": null,
    "is_gift": false,
    "gift_message": null
  },
  "current_asset_price": 0.9998,
  "is_triggered": false,
  "time_remaining_seconds": 2592000,
  "estimated_payout_usd": null
}
```

**Policy Status Values:**
- `active`: Policy is active and monitoring
- `triggered`: Trigger condition met
- `claimed`: Payout executed
- `expired`: Policy expired without trigger
- `cancelled`: Policy cancelled

**Status Codes:**
- `200 OK`: Policy found
- `404 Not Found`: Policy ID not found
- `400 Bad Request`: Invalid policy ID format

---

## Vault Endpoints

### GET /api/v1/vault/info

Get vault status, tranche information, and liquidity metrics.

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/vault/info
```

**Response:**
```json
{
  "total_capital_usd": 10000000.0,
  "total_coverage_sold_usd": 5000000.0,
  "ltv_ratio": 0.5,                      // Loan-to-value: 50%
  "usd_reserves_usd": 2000000.0,
  "btc_float_btc": 15.5,
  "btc_float_usd": 1007500.0,
  "available_capacity_usd": 5000000.0,
  "tranches": [
    {
      "tranche_id": 0,
      "seniority": 1,                    // 1 = most senior
      "target_yield_bps": 400,           // 4% target APY
      "nav": 1.025,                       // Net asset value per token
      "tvl_usd": 2500000.0,
      "accumulated_yield_usd": 62500.0,
      "accumulated_loss_usd": 0.0
    },
    {
      "tranche_id": 1,
      "seniority": 2,
      "target_yield_bps": 650,           // 6.5% target APY
      "nav": 1.042,
      "tvl_usd": 2000000.0,
      "accumulated_yield_usd": 84000.0,
      "accumulated_loss_usd": 0.0
    }
    // ... additional tranches
  ]
}
```

**Status Codes:**
- `200 OK`: Vault info retrieved
- `500 Internal Server Error`: Failed to fetch vault data

---

## LP (Liquidity Provider) Endpoints

### POST /api/v1/lp/deposit

Deposit capital into a specific tranche.

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/lp/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "lp_address": "EQAlice...",
    "tranche_id": 0,
    "amount_usd": 50000
  }'
```

**Request Body:**
```json
{
  "lp_address": "EQAlice...",            // TON address of LP
  "tranche_id": 0,                        // Tranche ID (0-5)
  "amount_usd": 50000                     // Deposit amount in USD
}
```

**Response:**
```json
{
  "lp_tokens": 48780,                     // LP tokens minted (adjusted for NAV)
  "tranche_id": 0,
  "amount_deposited_usd": 50000,
  "transaction_hash": "tx_deposit_EQAlice..."
}
```

**Tranche IDs:**
- `0`: SURE-BTC (Tier 1, 4% flat, most senior)
- `1`: SURE-SNR (Tier 2, 6.5-10%, senior)
- `2`: SURE-MEZZ (Tier 3, 9-15%, mezzanine)
- `3`: SURE-JNR (Tier 4, 12.5-16%, junior)
- `4`: SURE-JNR+ (Tier 5, 16-22%, junior+)
- `5`: SURE-EQT (Tier 6, 15-25%, equity/most junior)

**Status Codes:**
- `200 OK`: Deposit successful
- `400 Bad Request`: Invalid tranche ID or amount
- `500 Internal Server Error`: Deposit failed

### POST /api/v1/lp/withdraw

Withdraw capital from a tranche by burning LP tokens.

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/lp/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "lp_address": "EQAlice...",
    "tranche_id": 0,
    "lp_tokens": 48780
  }'
```

**Request Body:**
```json
{
  "lp_address": "EQAlice...",
  "tranche_id": 0,
  "lp_tokens": 48780                      // LP tokens to burn
}
```

**Response:**
```json
{
  "lp_tokens_burned": 48780,
  "tranche_id": 0,
  "amount_returned_usd": 51250.0,         // Includes yield accrued
  "transaction_hash": "tx_withdraw_EQAlice..."
}
```

**Status Codes:**
- `200 OK`: Withdrawal successful
- `400 Bad Request`: Insufficient LP tokens or invalid tranche
- `500 Internal Server Error`: Withdrawal failed

---

## Risk Metrics Endpoints

### GET /api/v1/risk/metrics

Get real-time risk metrics for the unified pool.

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/risk/metrics
```

**Response:**
```json
{
  "var_95": 1250000.0,                   // Value at Risk (95% confidence)
  "var_99": 1875000.0,                   // Value at Risk (99% confidence)
  "cvar_95": 2100000.0,                  // Conditional VaR (expected shortfall)
  "expected_loss": 250000.0,
  "ltv": 0.50,                           // Loan-to-value ratio
  "reserve_ratio": 0.20,
  "max_concentration": 0.28,             // Highest single-asset exposure
  "breach_alerts": 0,                    // Critical breaches
  "warning_alerts": 1                    // Warning-level alerts
}
```

**Risk Metrics Definitions:**
- **VaR 95%**: 95% confidence that losses won't exceed this amount
- **VaR 99%**: 99% confidence that losses won't exceed this amount
- **CVaR 95%**: Expected loss if we exceed VaR 95% threshold
- **Expected Loss**: Mean expected loss from current portfolio
- **LTV**: Total coverage / Total capital (should be < 75%)
- **Reserve Ratio**: Liquid reserves / Total coverage (should be > 15%)
- **Max Concentration**: Highest exposure to single asset (should be < 30%)

**Status Codes:**
- `200 OK`: Risk metrics calculated
- `500 Internal Server Error`: Risk calculation failed

---

## Error Codes

### Standard HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request parameters |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Server maintenance or overload |

### Custom Error Response Format

```json
{
  "error": "Coverage amount must be positive",
  "error_code": "INVALID_COVERAGE",
  "timestamp": 1697385600.0
}
```

### Application-Specific Error Codes

| Error Code | HTTP Status | Description |
|-----------|-------------|-------------|
| `INVALID_ASSET` | 400 | Unsupported stablecoin |
| `INVALID_COVERAGE` | 400 | Coverage amount out of range |
| `INVALID_TRIGGER` | 400 | Trigger price >= $1.00 |
| `INVALID_FLOOR` | 400 | Floor >= trigger price |
| `INVALID_DURATION` | 400 | Duration not in 1-365 range |
| `INSUFFICIENT_CAPACITY` | 400 | Pool cannot underwrite policy |
| `LTV_BREACH` | 400 | LTV would exceed 75% |
| `RESERVE_BREACH` | 400 | Reserve ratio would drop below 15% |
| `CONCENTRATION_BREACH` | 400 | Asset concentration would exceed 30% |
| `POLICY_NOT_FOUND` | 404 | Policy ID doesn't exist |
| `TRANCHE_NOT_FOUND` | 404 | Tranche ID invalid |
| `PRICING_FAILED` | 500 | Premium calculation error |
| `ORACLE_UNAVAILABLE` | 503 | Price oracle temporarily down |

---

## Rate Limits

**Current Limits (Development):**
- No rate limits enforced

**Production Limits (Planned):**
- **Anonymous Users**: 100 requests/hour per IP
- **Authenticated Users**: 1,000 requests/hour per API key
- **Premium Tier**: 10,000 requests/hour

**Rate Limit Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1697389200
```

**Rate Limit Exceeded Response:**
```json
{
  "error": "Rate limit exceeded",
  "error_code": "RATE_LIMIT",
  "retry_after": 3600,
  "timestamp": 1697385600.0
}
```

---

## WebSocket Events

**Base URL**: `ws://localhost:8080/ws` (development)

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  console.log('Connected to Tonsurance API');
};
```

### Subscribe to Policy Updates

```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  channel: 'policy',
  policy_id: 12345678
}));
```

### Event: Policy Triggered

```json
{
  "event": "policy_triggered",
  "policy_id": 12345678,
  "current_price": 0.95,
  "trigger_price": 0.97,
  "trigger_time": 1697385600.0,
  "sustained_duration": 14400.0,
  "estimated_payout": 25000.0
}
```

### Event: Policy Claimed

```json
{
  "event": "policy_claimed",
  "policy_id": 12345678,
  "payout_amount": 25000.0,
  "payout_time": 1697389200.0,
  "transaction_hash": "tx_payout_12345678"
}
```

### Event: Vault Update

```json
{
  "event": "vault_update",
  "ltv": 0.52,
  "available_capacity": 4800000.0,
  "timestamp": 1697385600.0
}
```

---

## Example Use Cases

### Example 1: Get Quote and Purchase

```bash
# Step 1: Get quote
QUOTE=$(curl -X POST http://localhost:8080/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "USDC",
    "coverage_amount_usd": 50000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 30
  }')

echo $QUOTE
# {"premium_usd":164.38,"premium_rate_bps":400,"available":true,...}

# Step 2: Purchase policy
curl -X POST http://localhost:8080/api/v1/policy/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "buyer_address": "EQAbc123...",
    "asset": "USDC",
    "coverage_amount_usd": 50000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 30
  }'
```

### Example 2: Monitor Policy Status

```bash
# Check policy status
watch -n 60 'curl -s http://localhost:8080/api/v1/policy/12345678 | jq ".current_asset_price, .is_triggered"'
```

### Example 3: LP Deposit and Monitor Yield

```bash
# Deposit into SURE-MEZZ tranche
curl -X POST http://localhost:8080/api/v1/lp/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "lp_address": "EQAlice...",
    "tranche_id": 2,
    "amount_usd": 100000
  }'

# Monitor vault status
curl -s http://localhost:8080/api/v1/vault/info | jq '.tranches[] | select(.tranche_id == 2)'
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:8080/api/v1';

// Get quote
const quote = await axios.post(`${API_BASE}/quote`, {
  asset: 'USDC',
  coverage_amount_usd: 100000,
  trigger_price: 0.97,
  floor_price: 0.90,
  duration_days: 30
});

console.log(`Premium: $${quote.data.premium_usd}`);

// Purchase policy
const policy = await axios.post(`${API_BASE}/policy/purchase`, {
  buyer_address: 'EQAbc123...',
  asset: 'USDC',
  coverage_amount_usd: 100000,
  trigger_price: 0.97,
  floor_price: 0.90,
  duration_days: 30
});

console.log(`Policy ID: ${policy.data.policy_id}`);
```

### Python

```python
import requests

API_BASE = 'http://localhost:8080/api/v1'

# Get quote
quote = requests.post(f'{API_BASE}/quote', json={
    'asset': 'USDC',
    'coverage_amount_usd': 100000,
    'trigger_price': 0.97,
    'floor_price': 0.90,
    'duration_days': 30
}).json()

print(f"Premium: ${quote['premium_usd']}")

# Purchase policy
policy = requests.post(f'{API_BASE}/policy/purchase', json={
    'buyer_address': 'EQAbc123...',
    'asset': 'USDC',
    'coverage_amount_usd': 100000,
    'trigger_price': 0.97,
    'floor_price': 0.90,
    'duration_days': 30
}).json()

print(f"Policy ID: {policy['policy_id']}")
```

---

## References

- Backend Implementation: `backend/api/api_server.ml`
- Type Definitions: `backend/types/types.ml`
- Pricing Engine: `backend/pricing/pricing_engine.ml`
- Risk Model: `backend/risk/risk_model.ml`
- Product Matrix: `docs/PRODUCT_MATRIX.md`
- Risk Matrix: `docs/RISK_MATRIX.md`
- Deployment Guide: `docs/DEPLOYMENT_GUIDE.md`

---

**Document Version History:**
- v1.0 (2025-10-15): Initial API reference for 560-product system
