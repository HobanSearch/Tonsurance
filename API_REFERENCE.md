# API Reference

**Complete reference for Tonsurance backend API (REST + WebSocket)**

**Last Updated:** October 15, 2025
**Version:** 2.0
**Base URL:** `https://api.tonsurance.io` (production) | `http://localhost:8080` (local)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket API](#websocket-api)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Examples](#examples)

---

## 1. Overview

### API Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    CLIENT (Frontend/Mobile)                │
└───────────┬────────────────────────┬───────────────────────┘
            │                        │
            │ REST (HTTP/HTTPS)      │ WebSocket (WSS)
            │                        │
┌───────────▼────────────────────────▼───────────────────────┐
│                   NGINX (Reverse Proxy)                    │
│  - SSL/TLS termination                                     │
│  - Load balancing                                          │
│  - Rate limiting                                           │
└───────────┬────────────────────────┬───────────────────────┘
            │                        │
            ▼                        ▼
┌─────────────────────┐    ┌─────────────────────┐
│   REST API Server   │    │ WebSocket Server    │
│   (OCaml Dream)     │    │  (OCaml Websocket)  │
│   Port: 8080        │    │  Port: 8081         │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          └──────────┬───────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
      ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│PostgreSQL│   │  Redis   │   │  TON     │
│(Policies)│   │ (Cache)  │   │Blockchain│
└──────────┘   └──────────┘   └──────────┘
```

### API Versions

- **v1:** Legacy API (deprecated, will be removed Q2 2026)
- **v2:** Current stable API (this document)
- **v3:** Beta API (new features, subject to change)

All endpoints in this document use `/api/v2/` prefix.

### Response Format

All API responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "timestamp": 1710512400
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMETERS",
    "message": "Coverage amount must be positive",
    "details": { ... }
  },
  "timestamp": 1710512400
}
```

---

## 2. Authentication

### Current Status: **Public Beta (No Auth Required)**

During testnet phase, API is publicly accessible without authentication.

### Mainnet: **API Keys (Coming Soon)**

When mainnet launches, all requests will require an API key:

```http
GET /api/v2/pricing/dynamic-quote
Authorization: Bearer <your_api_key>
```

**Get API Key:**
```bash
curl -X POST https://api.tonsurance.io/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "ton_address": "EQC..."
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "api_key": "tns_live_abc123...",
    "rate_limit": "1000 requests/minute",
    "expires_at": null
  }
}
```

---

## 3. REST API Endpoints

### 3.1 Health & Status

#### GET /health

Check API server health.

**Request:**
```http
GET /health HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "status": "healthy",
  "service": "api_v2",
  "version": "2.0.3",
  "uptime": 12345,
  "database": "connected",
  "redis": "connected",
  "blockchain": "connected"
}
```

**Status Codes:**
- `200 OK` - Service healthy
- `503 Service Unavailable` - Service degraded

---

#### GET /api/v2/status

Get comprehensive system status.

**Request:**
```http
GET /api/v2/status HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "success": true,
  "data": {
    "system": {
      "status": "operational",
      "version": "2.0.3",
      "uptime_seconds": 12345,
      "last_restart": "2025-10-15T10:00:00Z"
    },
    "services": {
      "database": {
        "status": "healthy",
        "latency_ms": 3.2,
        "connections_active": 5,
        "connections_max": 100
      },
      "redis": {
        "status": "healthy",
        "latency_ms": 1.1,
        "memory_used_mb": 45,
        "memory_max_mb": 512
      },
      "blockchain": {
        "status": "healthy",
        "network": "testnet",
        "last_block": 12345678,
        "last_sync": "2025-10-15T12:30:45Z"
      }
    },
    "metrics": {
      "total_policies": 1234,
      "total_coverage_usd": 12500000,
      "total_capital_usd": 25000000,
      "active_users": 567
    }
  },
  "timestamp": 1710512400
}
```

---

### 3.2 Pricing Endpoints

#### POST /api/v2/pricing/dynamic-quote

Get real-time premium quote with dynamic pricing.

**Request:**
```http
POST /api/v2/pricing/dynamic-quote HTTP/1.1
Host: api.tonsurance.io
Content-Type: application/json

{
  "coverage_type": "Depeg",
  "chain": "Ethereum",
  "stablecoin": "USDC",
  "coverage_amount": 10000,
  "duration_days": 30
}
```

**Parameters:**

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `coverage_type` | string | Yes | `Depeg`, `SmartContract`, `Oracle`, `Bridge`, `CEX` | Type of insurance |
| `chain` | string | Yes | `Ethereum`, `Arbitrum`, `Base`, `Polygon`, `Bitcoin`, `Lightning`, `TON`, `Solana` | Blockchain |
| `stablecoin` | string | Yes | `USDC`, `USDT`, `USDe`, `sUSDe`, `USDY`, `PYUSD`, `GHO`, `LUSD`, `crvUSD`, `mkUSD`, `DAI`, `FRAX`, `USDP`, `BUSD` | Stablecoin to insure |
| `coverage_amount` | number | Yes | > 0 | Coverage amount in USD |
| `duration_days` | integer | Yes | 30, 90, 180 | Policy duration |

**Response:**
```json
{
  "success": true,
  "data": {
    "base_premium": 65.75,
    "market_adjustment_pct": 15.2,
    "volatility_premium_pct": 8.3,
    "final_premium": 218.43,
    "effective_apr": 0.876,
    "valid_until": 1710512520,
    "multiplier_components": {
      "base": 80,
      "market_adj": 1520,
      "volatility": 830,
      "total": 2430
    },
    "market_factors": {
      "stablecoin_price": 0.9998,
      "bridge_health": 0.95,
      "cex_liquidation_rate": 0.05,
      "chain_congestion": "low",
      "overall_volatility": 0.08
    }
  },
  "timestamp": 1710512400
}
```

**Field Explanations:**

- **base_premium:** Base premium using static APR (e.g., 0.8% APR for Depeg)
- **market_adjustment_pct:** Percentage increase due to market conditions (stablecoin price, bridge health)
- **volatility_premium_pct:** Percentage increase due to volatility (price swings, CEX liquidations)
- **final_premium:** Total premium in USD
- **effective_apr:** Effective annual percentage rate
- **valid_until:** Unix timestamp when quote expires (120 seconds)
- **multiplier_components:** Breakdown of risk multipliers (basis points, 10000 = 1.0x)
- **market_factors:** Real-time market data influencing pricing

**Status Codes:**
- `200 OK` - Quote generated successfully
- `400 Bad Request` - Invalid parameters
- `503 Service Unavailable` - Pricing service temporarily unavailable

**Example cURL:**
```bash
curl -X POST https://api.tonsurance.io/api/v2/pricing/dynamic-quote \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "Depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 30
  }'
```

---

#### POST /api/v2/pricing/lock-price

Lock current price for 2 minutes (prevents price changes during checkout).

**Request:**
```http
POST /api/v2/pricing/lock-price HTTP/1.1
Host: api.tonsurance.io
Content-Type: application/json

{
  "user_address": "EQC...",
  "coverage_type": "Depeg",
  "chain": "Ethereum",
  "stablecoin": "USDC",
  "coverage_amount": 10000,
  "duration_days": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lock_id": "lock_abc123...",
    "locked_premium": 218.43,
    "locked_rate_bps": 2430,
    "valid_until": 1710512520,
    "expires_in_seconds": 120
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Price locked successfully
- `400 Bad Request` - Invalid parameters
- `409 Conflict` - Price already locked for this user
- `429 Too Many Requests` - Rate limit exceeded

**Example cURL:**
```bash
curl -X POST https://api.tonsurance.io/api/v2/pricing/lock-price \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQC...",
    "coverage_type": "Depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 30
  }'
```

---

#### GET /api/v2/pricing/market-conditions

Get current market conditions affecting pricing.

**Request:**
```http
GET /api/v2/pricing/market-conditions HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stablecoin_prices": {
      "USDC": 0.9998,
      "USDT": 0.9996,
      "DAI": 0.9999,
      "USDe": 0.9992
    },
    "bridge_health": {
      "Wormhole": 0.98,
      "Axelar": 0.95,
      "LayerZero": 0.97,
      "Stargate": 0.96
    },
    "cex_liquidations": {
      "rate_24h": 0.05,
      "volume_24h_usd": 12500000,
      "status": "normal"
    },
    "chain_congestion": {
      "Ethereum": "medium",
      "Arbitrum": "low",
      "Base": "low",
      "Polygon": "low"
    },
    "volatility_index": {
      "current": 0.08,
      "average_7d": 0.06,
      "trend": "increasing"
    },
    "last_update": "2025-10-15T12:30:00Z"
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Data retrieved successfully

---

### 3.3 Risk Endpoints

#### GET /api/v2/risk/exposure

Get comprehensive risk exposure breakdown.

**Request:**
```http
GET /api/v2/risk/exposure HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_coverage_sold": 12500000,
      "total_capital": 25000000,
      "capital_adequacy_ratio": 200,
      "utilization": 50.0,
      "risk_score": 3.2
    },
    "by_coverage_type": {
      "Depeg": {
        "total_coverage": 5000000,
        "active_policies": 234,
        "capital_allocated": 2500000
      },
      "SmartContract": {
        "total_coverage": 3000000,
        "active_policies": 145,
        "capital_allocated": 1500000
      },
      "Bridge": {
        "total_coverage": 2500000,
        "active_policies": 89,
        "capital_allocated": 1250000
      },
      "Oracle": {
        "total_coverage": 1500000,
        "active_policies": 67,
        "capital_allocated": 750000
      },
      "CEX": {
        "total_coverage": 500000,
        "active_policies": 23,
        "capital_allocated": 250000
      }
    },
    "by_chain": {
      "Ethereum": 4500000,
      "Arbitrum": 2800000,
      "Base": 1900000,
      "Polygon": 1500000,
      "Bitcoin": 800000,
      "TON": 600000,
      "Solana": 400000
    },
    "by_stablecoin": {
      "USDC": 5500000,
      "USDT": 4000000,
      "DAI": 1500000,
      "USDe": 800000,
      "FRAX": 500000,
      "others": 200000
    },
    "top_risks": [
      {
        "type": "concentration",
        "severity": "medium",
        "description": "44% of coverage on Ethereum (max recommended: 40%)",
        "recommended_action": "Diversify to other chains"
      },
      {
        "type": "liquidity",
        "severity": "low",
        "description": "Vault utilization at 50% (threshold: 75%)",
        "recommended_action": "Monitor utilization trends"
      }
    ]
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Data retrieved successfully

---

#### GET /api/v2/risk/alerts

Get active risk alerts.

**Request:**
```http
GET /api/v2/risk/alerts HTTP/1.1
Host: api.tonsurance.io
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `severity` | string | No | Filter by severity: `low`, `medium`, `high`, `critical` |
| `limit` | integer | No | Max results (default: 50, max: 200) |

**Response:**
```json
{
  "success": true,
  "data": {
    "active_alerts": [
      {
        "id": "alert_123",
        "severity": "high",
        "type": "bridge_health",
        "title": "Wormhole bridge health degraded",
        "description": "Health score dropped to 0.85 (threshold: 0.90)",
        "affected_policies": 45,
        "affected_coverage_usd": 1250000,
        "triggered_at": "2025-10-15T12:15:00Z",
        "status": "active",
        "recommended_actions": [
          "Temporarily pause new bridge insurance policies",
          "Monitor bridge transactions closely",
          "Notify affected policyholders"
        ]
      },
      {
        "id": "alert_124",
        "severity": "medium",
        "type": "utilization",
        "title": "Vault utilization at 65%",
        "description": "Utilization approaching 75% threshold",
        "affected_policies": null,
        "affected_coverage_usd": null,
        "triggered_at": "2025-10-15T11:30:00Z",
        "status": "active",
        "recommended_actions": [
          "Incentivize new capital deposits",
          "Consider reducing coverage capacity"
        ]
      }
    ],
    "total_active": 2
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Alerts retrieved successfully

---

### 3.4 Vault Endpoints

#### GET /api/v2/vault/tranche-apy

Get real-time APY for all vault tranches.

**Request:**
```http
GET /api/v2/vault/tranche-apy HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tranches": [
      {
        "id": 1,
        "name": "SURE-BTC",
        "symbol": "SURE-BTC",
        "current_apy": 4.0,
        "min_apy": 4.0,
        "max_apy": 4.0,
        "tvl_usd": 6250000,
        "total_capital_ton": 250000,
        "allocated_capital_ton": 125000,
        "utilization": 50.0,
        "risk_level": "safest",
        "description": "Bitcoin-focused, safest tranche"
      },
      {
        "id": 2,
        "name": "SURE-SNR",
        "symbol": "SURE-SNR",
        "current_apy": 8.2,
        "min_apy": 6.5,
        "max_apy": 10.0,
        "tvl_usd": 5000000,
        "total_capital_ton": 200000,
        "allocated_capital_ton": 100000,
        "utilization": 50.0,
        "risk_level": "very_low",
        "description": "Senior tranche, institutional-grade"
      },
      {
        "id": 3,
        "name": "SURE-MEZZ",
        "symbol": "SURE-MEZZ",
        "current_apy": 12.3,
        "min_apy": 9.0,
        "max_apy": 15.0,
        "tvl_usd": 4500000,
        "total_capital_ton": 180000,
        "allocated_capital_ton": 90000,
        "utilization": 50.0,
        "risk_level": "low",
        "description": "Mezzanine tranche, balanced risk-reward"
      },
      {
        "id": 4,
        "name": "SURE-JNR",
        "symbol": "SURE-JNR",
        "current_apy": 14.5,
        "min_apy": 12.5,
        "max_apy": 16.0,
        "tvl_usd": 3750000,
        "total_capital_ton": 150000,
        "allocated_capital_ton": 75000,
        "utilization": 50.0,
        "risk_level": "medium",
        "description": "Junior tranche, higher yield"
      },
      {
        "id": 5,
        "name": "SURE-JNR-PLUS",
        "symbol": "SURE-JNR+",
        "current_apy": 19.2,
        "min_apy": 16.0,
        "max_apy": 22.0,
        "tvl_usd": 3000000,
        "total_capital_ton": 120000,
        "allocated_capital_ton": 60000,
        "utilization": 50.0,
        "risk_level": "high",
        "description": "Junior+ tranche, aggressive growth"
      },
      {
        "id": 6,
        "name": "SURE-EQT",
        "symbol": "SURE-EQT",
        "current_apy": 21.8,
        "min_apy": 15.0,
        "max_apy": 25.0,
        "tvl_usd": 2500000,
        "total_capital_ton": 100000,
        "allocated_capital_ton": 50000,
        "utilization": 50.0,
        "risk_level": "highest",
        "description": "Equity tranche, first-loss capital"
      }
    ],
    "total_tvl_usd": 25000000,
    "total_capital_ton": 1000000,
    "overall_utilization": 50.0,
    "last_update": "2025-10-15T12:30:00Z"
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Data retrieved successfully

---

#### GET /api/v2/vault/utilization

Get vault utilization statistics.

**Request:**
```http
GET /api/v2/vault/utilization HTTP/1.1
Host: api.tonsurance.io
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `timeframe` | string | No | `24h`, `7d`, `30d`, `all` (default: `7d`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "current": {
      "total_capital_usd": 25000000,
      "allocated_capital_usd": 12500000,
      "available_capital_usd": 12500000,
      "utilization_pct": 50.0,
      "coverage_sold_usd": 12500000,
      "as_of": "2025-10-15T12:30:00Z"
    },
    "historical": [
      {
        "timestamp": "2025-10-14T12:00:00Z",
        "utilization_pct": 48.5,
        "capital_usd": 24500000,
        "coverage_sold_usd": 11882500
      },
      {
        "timestamp": "2025-10-13T12:00:00Z",
        "utilization_pct": 47.2,
        "capital_usd": 24000000,
        "coverage_sold_usd": 11328000
      }
      // ... more data points ...
    ],
    "trends": {
      "7d_avg_utilization": 49.2,
      "7d_change_pct": 2.3,
      "peak_utilization": 52.8,
      "peak_timestamp": "2025-10-12T18:45:00Z"
    }
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Data retrieved successfully

---

#### GET /api/v2/vault/user-balance

Get user's balance in vault tranches.

**Request:**
```http
GET /api/v2/vault/user-balance?address=EQC... HTTP/1.1
Host: api.tonsurance.io
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | TON wallet address |

**Response:**
```json
{
  "success": true,
  "data": {
    "user_address": "EQC...",
    "balances": [
      {
        "tranche_id": 1,
        "tranche_name": "SURE-BTC",
        "balance_ton": "1000.00",
        "balance_usd": 25000,
        "accrued_yield_ton": "40.00",
        "accrued_yield_usd": 1000,
        "apy": 4.0,
        "deposited_at": "2025-09-15T10:00:00Z"
      },
      {
        "tranche_id": 2,
        "tranche_name": "SURE-SNR",
        "balance_ton": "500.00",
        "balance_usd": 12500,
        "accrued_yield_ton": "34.17",
        "accrued_yield_usd": 854.25,
        "apy": 8.2,
        "deposited_at": "2025-09-20T14:30:00Z"
      }
    ],
    "total_staked_ton": "1500.00",
    "total_staked_usd": 37500,
    "total_yield_ton": "74.17",
    "total_yield_usd": 1854.25
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Balance retrieved successfully
- `400 Bad Request` - Invalid address format
- `404 Not Found` - Address has no deposits

---

### 3.5 Policy Endpoints

#### GET /api/v2/policies

Get user's policies.

**Request:**
```http
GET /api/v2/policies?user_address=EQC... HTTP/1.1
Host: api.tonsurance.io
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_address` | string | Yes | TON wallet address |
| `status` | string | No | Filter by status: `active`, `expired`, `claimed` |
| `limit` | integer | No | Max results (default: 50, max: 200) |
| `offset` | integer | No | Pagination offset (default: 0) |

**Response:**
```json
{
  "success": true,
  "data": {
    "policies": [
      {
        "policy_id": "123456",
        "coverage_type": "Depeg",
        "chain": "Ethereum",
        "stablecoin": "USDC",
        "coverage_amount": 10000,
        "premium_paid": 218.43,
        "duration_days": 30,
        "created_at": "2025-10-15T10:00:00Z",
        "expires_at": "2025-11-14T10:00:00Z",
        "status": "active",
        "beneficiary": "EQC...",
        "claim_status": null
      },
      {
        "policy_id": "123455",
        "coverage_type": "Bridge",
        "chain": "Arbitrum",
        "stablecoin": "USDT",
        "coverage_amount": 5000,
        "premium_paid": 156.25,
        "duration_days": 30,
        "created_at": "2025-10-10T12:30:00Z",
        "expires_at": "2025-11-09T12:30:00Z",
        "status": "active",
        "beneficiary": "EQC...",
        "claim_status": null
      }
    ],
    "total_count": 2,
    "total_coverage": 15000,
    "total_premiums_paid": 374.68
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Policies retrieved successfully
- `400 Bad Request` - Invalid parameters

---

#### GET /api/v2/policies/:policy_id

Get details of a specific policy.

**Request:**
```http
GET /api/v2/policies/123456 HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "success": true,
  "data": {
    "policy_id": "123456",
    "coverage_type": "Depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "premium_paid": 218.43,
    "duration_days": 30,
    "created_at": "2025-10-15T10:00:00Z",
    "expires_at": "2025-11-14T10:00:00Z",
    "status": "active",
    "beneficiary": "EQC...",
    "contract_address": "EQD...",
    "shard_id": 42,
    "claim_status": null,
    "transactions": [
      {
        "type": "policy_created",
        "hash": "abc123...",
        "timestamp": "2025-10-15T10:00:15Z",
        "block": 12345678
      }
    ],
    "pricing_details": {
      "base_premium": 65.75,
      "market_adjustment": 15.2,
      "volatility_premium": 8.3,
      "effective_apr": 0.876,
      "multiplier_components": {
        "base": 80,
        "market_adj": 1520,
        "volatility": 830,
        "total": 2430
      }
    }
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Policy found
- `404 Not Found` - Policy not found

---

### 3.6 Bridge Health Endpoints

#### GET /api/v2/bridge/health

Get health scores for all monitored bridges.

**Request:**
```http
GET /api/v2/bridge/health HTTP/1.1
Host: api.tonsurance.io
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bridges": [
      {
        "name": "Wormhole",
        "health_score": 0.98,
        "status": "healthy",
        "tvl_usd": 4500000000,
        "last_incident": "2025-09-10T15:30:00Z",
        "uptime_7d": 99.9,
        "transaction_success_rate": 99.8,
        "avg_confirmation_time_seconds": 45,
        "last_check": "2025-10-15T12:30:00Z"
      },
      {
        "name": "Axelar",
        "health_score": 0.95,
        "status": "healthy",
        "tvl_usd": 2800000000,
        "last_incident": null,
        "uptime_7d": 100.0,
        "transaction_success_rate": 99.5,
        "avg_confirmation_time_seconds": 60,
        "last_check": "2025-10-15T12:30:00Z"
      },
      {
        "name": "LayerZero",
        "health_score": 0.97,
        "status": "healthy",
        "tvl_usd": 3200000000,
        "last_incident": "2025-10-01T08:15:00Z",
        "uptime_7d": 99.5,
        "transaction_success_rate": 99.7,
        "avg_confirmation_time_seconds": 50,
        "last_check": "2025-10-15T12:30:00Z"
      },
      {
        "name": "Stargate",
        "health_score": 0.96,
        "status": "healthy",
        "tvl_usd": 1900000000,
        "last_incident": null,
        "uptime_7d": 100.0,
        "transaction_success_rate": 99.6,
        "avg_confirmation_time_seconds": 55,
        "last_check": "2025-10-15T12:30:00Z"
      }
    ],
    "overall_status": "healthy",
    "last_update": "2025-10-15T12:30:00Z"
  },
  "timestamp": 1710512400
}
```

**Status Codes:**
- `200 OK` - Data retrieved successfully

---

## 4. WebSocket API

### Connection

**URL:** `wss://api.tonsurance.io/ws` (production) | `ws://localhost:8081` (local)

**Example (JavaScript):**
```javascript
const ws = new WebSocket('wss://api.tonsurance.io/ws');

ws.onopen = () => {
  console.log('WebSocket connected');

  // Subscribe to channel
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'pricing_updates'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
  // Implement reconnection logic
};
```

### Message Format

**Client → Server:**
```json
{
  "action": "subscribe" | "unsubscribe" | "ping",
  "channel": "channel_name"
}
```

**Server → Client:**
```json
{
  "type": "message_type",
  "channel": "channel_name",
  "data": { ... },
  "timestamp": 1710512400
}
```

### Channels

#### pricing_updates

Real-time pricing multiplier updates (every 60 seconds).

**Subscribe:**
```json
{
  "action": "subscribe",
  "channel": "pricing_updates"
}
```

**Message:**
```json
{
  "type": "multiplier_update",
  "channel": "pricing_updates",
  "data": {
    "products": [
      {
        "coverage_type": "Depeg",
        "chain": "Ethereum",
        "stablecoin": "USDC",
        "multiplier": 2430,
        "market_adjustment": 1520,
        "volatility_premium": 830
      },
      {
        "coverage_type": "Depeg",
        "chain": "Arbitrum",
        "stablecoin": "USDC",
        "multiplier": 2650,
        "market_adjustment": 1680,
        "volatility_premium": 890
      }
      // ... all 560 products ...
    ],
    "volatility_index": 0.08
  },
  "timestamp": 1710512400
}
```

#### bridge_health

Bridge health score changes (60s interval + instant alerts).

**Subscribe:**
```json
{
  "action": "subscribe",
  "channel": "bridge_health"
}
```

**Message:**
```json
{
  "type": "health_update",
  "channel": "bridge_health",
  "data": {
    "bridge": "Wormhole",
    "health_score": 0.85,
    "previous_score": 0.98,
    "status": "degraded",
    "alert_level": "high",
    "details": "Transaction success rate dropped to 92% in last 10 minutes"
  },
  "timestamp": 1710512400
}
```

#### risk_alerts

Active risk alerts (60s interval + instant notifications).

**Subscribe:**
```json
{
  "action": "subscribe",
  "channel": "risk_alerts"
}
```

**Message:**
```json
{
  "type": "alert",
  "channel": "risk_alerts",
  "data": {
    "alert_id": "alert_125",
    "severity": "critical",
    "type": "circuit_breaker",
    "title": "Circuit breaker triggered",
    "description": "Vault losses exceeded 10% in 24h",
    "affected_tranches": [6, 5, 4],
    "action_taken": "New deposits paused, withdrawals continue",
    "recommended_actions": [
      "Review risk exposure",
      "Consider emergency vault rebalancing"
    ]
  },
  "timestamp": 1710512400
}
```

#### tranche_apy

Tranche APY updates (every 60 seconds).

**Subscribe:**
```json
{
  "action": "subscribe",
  "channel": "tranche_apy"
}
```

**Message:**
```json
{
  "type": "apy_update",
  "channel": "tranche_apy",
  "data": {
    "tranches": [
      {
        "id": 1,
        "name": "SURE-BTC",
        "current_apy": 4.0,
        "previous_apy": 4.0,
        "change_bps": 0
      },
      {
        "id": 2,
        "name": "SURE-SNR",
        "current_apy": 8.3,
        "previous_apy": 8.2,
        "change_bps": 10
      }
      // ... all 6 tranches ...
    ]
  },
  "timestamp": 1710512400
}
```

### Heartbeat

**Client → Server (every 30 seconds):**
```json
{
  "action": "ping",
  "channel": "heartbeat"
}
```

**Server → Client:**
```json
{
  "type": "pong",
  "channel": "heartbeat",
  "timestamp": 1710512400
}
```

---

## 5. Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "coverage_amount",
      "reason": "Must be positive"
    }
  },
  "timestamp": 1710512400
}
```

### Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_PARAMETERS` | Invalid request parameters |
| 400 | `INVALID_ADDRESS` | Invalid TON address format |
| 400 | `INVALID_AMOUNT` | Amount out of valid range |
| 401 | `UNAUTHORIZED` | API key missing or invalid |
| 403 | `FORBIDDEN` | Access denied |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource conflict (e.g., price already locked) |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_SERVER_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

---

## 6. Rate Limiting

### Limits

**Public Beta (No Auth):**
- **REST API:** 100 requests/minute per IP
- **WebSocket:** 500 connections max, 1000 messages/minute per connection

**Mainnet (With API Key):**
- **Standard:** 1000 requests/minute
- **Premium:** 10000 requests/minute
- **Enterprise:** Unlimited (custom agreement)

### Rate Limit Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1710512460
```

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again in 30 seconds.",
    "details": {
      "limit": 100,
      "window": 60,
      "retry_after": 30
    }
  },
  "timestamp": 1710512400
}
```

---

## 7. Examples

### Example 1: Get Quote and Purchase Policy

```javascript
// Step 1: Get dynamic quote
const quoteResponse = await fetch('https://api.tonsurance.io/api/v2/pricing/dynamic-quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    coverage_type: 'Depeg',
    chain: 'Ethereum',
    stablecoin: 'USDC',
    coverage_amount: 10000,
    duration_days: 30
  })
});

const quote = await quoteResponse.json();
console.log('Premium:', quote.data.final_premium);

// Step 2: Lock price
const lockResponse = await fetch('https://api.tonsurance.io/api/v2/pricing/lock-price', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_address: 'EQC...',
    coverage_type: 'Depeg',
    chain: 'Ethereum',
    stablecoin: 'USDC',
    coverage_amount: 10000,
    duration_days: 30
  })
});

const lock = await lockResponse.json();
console.log('Price locked until:', new Date(lock.data.valid_until * 1000));

// Step 3: Create policy on blockchain (see FRONTEND_INTEGRATION.md)
await policyFactory.sendCreatePolicy(sender, {...});
```

### Example 2: Monitor Vault APY

```javascript
const ws = new WebSocket('wss://api.tonsurance.io/ws');

ws.onopen = () => {
  // Subscribe to tranche APY updates
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'tranche_apy'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'apy_update') {
    data.data.tranches.forEach(tranche => {
      console.log(`${tranche.name}: ${tranche.current_apy}% APY`);

      if (tranche.change_bps > 0) {
        console.log(`↑ APY increased by ${tranche.change_bps / 100}%`);
      } else if (tranche.change_bps < 0) {
        console.log(`↓ APY decreased by ${Math.abs(tranche.change_bps) / 100}%`);
      }
    });
  }
};
```

### Example 3: Check User's Policies and Balances

```javascript
const userAddress = 'EQC...';

// Get policies
const policiesResponse = await fetch(
  `https://api.tonsurance.io/api/v2/policies?user_address=${userAddress}`
);
const policies = await policiesResponse.json();
console.log('Active policies:', policies.data.total_count);

// Get vault balances
const balancesResponse = await fetch(
  `https://api.tonsurance.io/api/v2/vault/user-balance?address=${userAddress}`
);
const balances = await balancesResponse.json();
console.log('Total staked:', balances.data.total_staked_usd, 'USD');
console.log('Total yield:', balances.data.total_yield_usd, 'USD');
```

---

**End of API Reference**

For local development setup, see [LOCAL_DEVELOPMENT.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/LOCAL_DEVELOPMENT.md).

For Telegram Mini App integration, see [MINI_APP_GUIDE.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/MINI_APP_GUIDE.md).

For frontend-contract integration, see [FRONTEND_INTEGRATION.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/FRONTEND_INTEGRATION.md).
