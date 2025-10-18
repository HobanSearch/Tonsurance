# Tonsurance Transactional API Documentation

## Overview

The Transactional API enables end users to interact with Tonsurance smart contracts through simple REST endpoints. All endpoints are async (return immediately with transaction hash) and support polling for confirmation.

**Base URL**: `https://api.tonsurance.com` (Mainnet) / `https://testnet-api.tonsurance.com` (Testnet)

**Rate Limits**:
- 100 requests/minute per IP address
- 20 transactions/hour per user address
- 429 response with `Retry-After` header when exceeded

---

## Authentication

Currently no authentication required (transactions validated on-chain). Future versions will support API keys for premium features.

---

## Endpoints

### 1. Buy Insurance Policy

**Endpoint**: `POST /api/v2/policies`

**Description**: Purchase insurance policy with on-chain transaction.

**Request Body**:
```json
{
  "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
  "coverage_type": "depeg",
  "chain": "Ethereum",
  "stablecoin": "USDC",
  "coverage_amount": 10000.0,
  "duration_days": 30,
  "payment_token": "USDT",
  "payment_amount": 6.58
}
```

**Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_address` | string | Yes | TON wallet address (buyer) |
| `coverage_type` | string | Yes | One of: `depeg`, `smart_contract`, `oracle`, `bridge`, `cex_liquidation` |
| `chain` | string | Yes | Blockchain: `Ethereum`, `Arbitrum`, `Base`, `Polygon`, `Optimism`, `Bitcoin`, `Lightning`, `Solana`, `TON` |
| `stablecoin` | string | Yes | Asset: `USDC`, `USDT`, `DAI`, `FRAX`, `BUSD`, `USDe`, `sUSDe`, `USDY`, `PYUSD`, `GHO`, `LUSD`, `crvUSD`, `mkUSD` |
| `coverage_amount` | float | Yes | Coverage in USD (e.g., 10000.0 = $10,000) |
| `duration_days` | int | Yes | Policy duration in days (1-365) |
| `payment_token` | string | Yes | Token to pay premium with (TON blockchain asset) |
| `payment_amount` | float | Yes | Premium amount (must match quote ±5%) |

**Response** (200 OK):
```json
{
  "policy_id": null,
  "tx_hash": "0xabc123def456...",
  "status": "pending",
  "poll_url": "/api/v2/transactions/0xabc123def456...",
  "estimated_confirmation_seconds": 5
}
```

**Error Responses**:
- `400 Bad Request`: Invalid parameters or premium mismatch
- `429 Too Many Requests`: Rate limit exceeded

**Example curl**:
```bash
curl -X POST https://testnet-api.tonsurance.com/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30,
    "payment_token": "USDT",
    "payment_amount": 6.58
  }'
```

---

### 2. File Insurance Claim

**Endpoint**: `POST /api/v2/claims`

**Description**: File claim for triggered policy.

**Request Body**:
```json
{
  "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
  "policy_id": 12345,
  "evidence_url": "ipfs://QmXa1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2xY3zA4bC",
  "claim_amount": 10000.0
}
```

**Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_address` | string | Yes | TON wallet address (must own policy) |
| `policy_id` | int | Yes | Policy ID to claim against |
| `evidence_url` | string | Yes | IPFS or Arweave URL with proof (e.g., oracle price data, exploit transaction) |
| `claim_amount` | float | Yes | Claim amount in USD |

**Response** (200 OK):
```json
{
  "claim_id": null,
  "tx_hash": "0xdef456ghi789...",
  "status": "pending_verification",
  "auto_verifiable": true,
  "estimated_payout_time": "2025-10-16T15:30:00Z",
  "poll_url": "/api/v2/transactions/0xdef456ghi789..."
}
```

**Error Responses**:
- `400 Bad Request`: Invalid policy ID, non-IPFS evidence, etc.
- `429 Too Many Requests`: Rate limit exceeded

**Example curl**:
```bash
curl -X POST https://testnet-api.tonsurance.com/api/v2/claims \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
    "policy_id": 12345,
    "evidence_url": "ipfs://QmXa1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2xY3zA4bC",
    "claim_amount": 10000.0
  }'
```

---

### 3. Deposit to Vault

**Endpoint**: `POST /api/v2/vault/deposit`

**Description**: Deposit capital to tranche vault and receive LP tokens.

**Request Body**:
```json
{
  "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
  "tranche_id": 2,
  "amount": 1000.0,
  "lock_period_days": 90
}
```

**Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_address` | string | Yes | TON wallet address (depositor) |
| `tranche_id` | int | Yes | Tranche: 1 (SURE-SNR), 2 (SURE-SNR+), 3 (SURE-MEZZ), 4 (SURE-JNR), 5 (SURE-JNR+), 6 (SURE-EQT) |
| `amount` | float | Yes | TON amount to deposit |
| `lock_period_days` | int | Optional | Lock period for higher APY (30, 60, 90, 180, 365) |

**Response** (200 OK):
```json
{
  "deposit_id": null,
  "tx_hash": "0xghi789jkl012...",
  "tokens_minted": 995.5,
  "nav": 1.004,
  "lock_until": "2026-01-14T00:00:00Z",
  "poll_url": "/api/v2/transactions/0xghi789jkl012..."
}
```

**Tranche Overview**:
| Tranche | Risk | APY | Lockup Required | First Loss Coverage |
|---------|------|-----|-----------------|---------------------|
| SURE-SNR (1) | Lowest | 4-6% | Optional | Yes (tier 6) |
| SURE-SNR+ (2) | Low | 6-8% | 30+ days | Yes (tier 5) |
| SURE-MEZZ (3) | Medium | 10-14% | 90+ days | Yes (tier 4) |
| SURE-JNR (4) | High | 18-24% | No | Yes (tier 3) |
| SURE-JNR+ (5) | High | 24-32% | No | Yes (tier 2) |
| SURE-EQT (6) | Highest | 40-60% | No | Yes (tier 1) |

**Example curl**:
```bash
curl -X POST https://testnet-api.tonsurance.com/api/v2/vault/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
    "tranche_id": 2,
    "amount": 1000.0,
    "lock_period_days": 90
  }'
```

---

### 4. Withdraw from Vault

**Endpoint**: `POST /api/v2/vault/withdraw`

**Description**: Burn LP tokens and withdraw capital + yield.

**Request Body**:
```json
{
  "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
  "tranche_id": 2,
  "token_amount": 500.0
}
```

**Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_address` | string | Yes | TON wallet address (LP token holder) |
| `tranche_id` | int | Yes | Tranche ID (1-6) |
| `token_amount` | float | Yes | LP tokens to burn |

**Response** (200 OK):
```json
{
  "withdrawal_id": null,
  "tx_hash": "0xjkl012mno345...",
  "capital_returned": 502.0,
  "yield_returned": 15.5,
  "total_payout": 517.5,
  "poll_url": "/api/v2/transactions/0xjkl012mno345..."
}
```

**Error Responses**:
- `400 Bad Request`: Lockup period not passed, insufficient tokens, etc.

**Example curl**:
```bash
curl -X POST https://testnet-api.tonsurance.com/api/v2/vault/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
    "tranche_id": 2,
    "token_amount": 500.0
  }'
```

---

### 5. Poll Transaction Status

**Endpoint**: `GET /api/v2/transactions/:tx_hash`

**Description**: Check status of pending transaction.

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `tx_hash` | string | Transaction hash from POST response |

**Response** (200 OK - Pending):
```json
{
  "tx_hash": "0xabc123def456...",
  "status": "pending",
  "block_height": null,
  "exit_code": null,
  "events": [],
  "created_at": 1729094500.0,
  "confirmed_at": null
}
```

**Response** (200 OK - Confirmed):
```json
{
  "tx_hash": "0xabc123def456...",
  "status": "confirmed",
  "block_height": 12345678,
  "exit_code": 0,
  "events": [
    {
      "event_id": "0x40",
      "type": "PolicyCreated",
      "data": {
        "policy_id": 12345,
        "buyer": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"
      }
    }
  ],
  "created_at": 1729094500.0,
  "confirmed_at": 1729094505.0
}
```

**Response** (200 OK - Failed):
```json
{
  "tx_hash": "0xabc123def456...",
  "status": "failed",
  "block_height": 12345678,
  "exit_code": 35,
  "events": [],
  "created_at": 1729094500.0,
  "confirmed_at": 1729094505.0
}
```

**Status Values**:
- `pending`: Transaction sent, awaiting confirmation
- `confirmed`: Transaction confirmed on-chain, events emitted
- `failed`: Transaction failed (check `exit_code` for reason)

**Common Exit Codes**:
| Code | Meaning |
|------|---------|
| 0 | Success |
| 35 | Insufficient balance |
| 36 | Invalid operation |
| 37 | Access denied |

**Example curl**:
```bash
curl https://testnet-api.tonsurance.com/api/v2/transactions/0xabc123def456...
```

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Descriptive error message"
}
```

**HTTP Status Codes**:
- `200 OK`: Request successful
- `400 Bad Request`: Invalid parameters or business logic error
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error (contact support)

**Rate Limit Response** (429):
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 3600
}
```

Headers:
```
Retry-After: 3600
```

---

## Integration Flow

### 1. Buy Policy Flow

```
1. User requests quote:
   GET /api/v2/quote/multi-dimensional

2. User approves premium, sends transaction:
   POST /api/v2/policies
   → Returns tx_hash immediately

3. Frontend polls for confirmation:
   GET /api/v2/transactions/:tx_hash
   → Status: "pending" (poll every 2 seconds)

4. Transaction confirms (~5 seconds):
   GET /api/v2/transactions/:tx_hash
   → Status: "confirmed"
   → Extract policy_id from events

5. User receives policy confirmation
```

### 2. File Claim Flow

```
1. Policy triggered (oracle price < trigger_price)

2. User submits claim with evidence:
   POST /api/v2/claims
   → Returns tx_hash

3. Auto-verification begins (if applicable):
   - Oracle checks price feeds
   - Validates trigger condition
   - Approves claim automatically

4. Poll for payout:
   GET /api/v2/transactions/:tx_hash
   → Status: "confirmed"
   → Events: ClaimApproved, PayoutExecuted

5. Funds arrive in user wallet (<5 seconds)
```

### 3. Vault Deposit Flow

```
1. User selects tranche and amount:
   POST /api/v2/vault/deposit

2. Transaction confirms:
   → LP tokens minted at current NAV
   → Lockup period starts (if applicable)

3. User earns yield:
   - Premiums distributed proportionally
   - NAV increases over time
   - Check APY: GET /api/v2/tranches/apy
```

---

## Testing

**Testnet Endpoints**:
- Base URL: `https://testnet-api.tonsurance.com`
- Faucet: `https://testnet.tonscan.org/faucet`
- Explorer: `https://testnet.tonscan.org`

**Test TON Address**:
```
EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2
```

**Sample Test Cases**:
1. Buy $10k USDC depeg insurance for 30 days (~$6.58 premium)
2. File claim with IPFS evidence
3. Deposit 1000 TON to SURE-SNR tranche
4. Withdraw after 90-day lockup

---

## Support

- **Documentation**: https://docs.tonsurance.com
- **Telegram**: https://t.me/tonsurance
- **Email**: dev@tonsurance.com
- **Status Page**: https://status.tonsurance.com
