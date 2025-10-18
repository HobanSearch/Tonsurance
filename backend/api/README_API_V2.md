# Tonsurance API v2 Documentation

## Overview

**API v2** is the comprehensive REST + WebSocket API for the 560-product multi-dimensional insurance system. It exposes real-time monitoring data from the backend OCaml infrastructure to frontend consumers.

### Security Features

API v2 includes comprehensive security measures:

- **Rate Limiting**: 100 requests/min per IP, 500/min per authenticated API key
- **CORS Protection**: Origin allowlist with preflight support
- **Authentication**: Bearer token authentication for write operations
- - **Request Limits**: 10MB max request size, input validation
- **Logging**: Comprehensive request/response logging for audit trails

**Public Endpoints** (No Authentication Required):
- All GET endpoints for quotes, risk data, bridge health, alerts
- WebSocket connections

**Protected Endpoints** (Require API Key):
- POST `/api/v2/policies` - Buy insurance policy
- POST `/api/v2/claims` - File claim
- POST `/api/v2/vault/deposit` - Deposit to vault
- POST `/api/v2/vault/withdraw` - Withdraw from vault
- ALL `/api/v2/admin/*` - Admin operations

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Clients                      │
│   (React, Mobile Apps, Analytics Dashboards)            │
└────────────┬────────────────────────────────────────────┘
             │
             │ HTTP/WebSocket
             │
┌────────────▼─────────────────────────────────────────────┐
│                  API v2 Server (Port 8080)               │
│  ┌────────────────────┐    ┌─────────────────────────┐  │
│  │   REST Endpoints   │    │   WebSocket Channels    │  │
│  │  - Quote           │    │  - bridge_health        │  │
│  │  - Risk Exposure   │    │  - risk_alerts          │  │
│  │  - Bridge Health   │    │  - top_products         │  │
│  │  - Alerts          │    │  - tranche_apy          │  │
│  │  - Tranche APY     │    │                         │  │
│  └────────┬───────────┘    └──────────┬──────────────┘  │
└───────────┼────────────────────────────┼─────────────────┘
            │                            │
            │ OCaml function calls       │
            │                            │
┌───────────▼────────────────────────────▼─────────────────┐
│              Backend OCaml Modules                        │
│  - unified_risk_monitor.ml (VaR, stress tests)           │
│  - bridge_monitor.ml (cross-chain health)                │
│  - utilization_tracker.ml (tranche metrics)              │
│  - collateral_manager.ml (pool state)                    │
└───────────────────────────────────────────────────────────┘
```

---

## REST API Endpoints

### Base URL
```
http://localhost:8080
```

---

### 1. POST `/api/v2/quote/multi-dimensional`

Calculate premium for any of the 560 product combinations (coverage_type × chain × stablecoin).

**Request:**
```json
{
  "coverage_type": "depeg",
  "chain": "Ethereum",
  "stablecoin": "USDC",
  "coverage_amount": 10000,
  "duration_days": 90
}
```

**Coverage Types:**
- `depeg` - Stablecoin depeg protection
- `smart_contract` - Smart contract exploit
- `oracle` - Oracle failure
- `bridge` - Bridge exploit
- `cex_liquidation` - CEX liquidation event

**Chains (9 total):**
- `Ethereum`, `Arbitrum`, `Base`, `Polygon`, `Optimism`, `Bitcoin`, `Lightning`, `Solana`, `TON`

**Stablecoins (14 total):**
- `USDC`, `USDT`, `USDP`, `DAI`, `FRAX`, `BUSD`, `USDe`, `sUSDe`, `USDY`, `PYUSD`, `GHO`, `LUSD`, `crvUSD`, `mkUSD`

**Response:**
```json
{
  "premium": 73.42,
  "breakdown": {
    "base_rate": 0.008,
    "chain_multiplier": 1.0,
    "stablecoin_adjustment": 0.0,
    "total_rate": 0.008,
    "coverage_amount": 10000,
    "duration_days": 90
  },
  "product_hash": "0xabc123...",
  "coverage_type": "depeg",
  "chain": "Ethereum",
  "stablecoin": "USDC",
  "timestamp": 1697564800.0
}
```

**Rate Structure:**
- **Base Rate** (by coverage type):
  - Depeg: 0.8% APR
  - Smart Contract: 1.5% APR
  - Oracle: 1.2% APR
  - Bridge: 2.0% APR
  - CEX Liquidation: 2.5% APR

- **Chain Multiplier**:
  - Bitcoin: 0.9x
  - Ethereum/TON: 1.0x
  - Arbitrum/Base/Optimism: 1.1x
  - Polygon: 1.2x
  - Lightning: 1.3x
  - Solana: 1.4x

- **Stablecoin Adjustment** (added to rate):
  - USDC: +0.00%
  - USDT: +0.05%
  - DAI: +0.02%
  - FRAX: +0.03%
  - USDe: +0.15%
  - sUSDe: +0.20%

---

### 2. GET `/api/v2/risk/exposure`

Aggregate portfolio exposure by coverage_type, chain, and stablecoin. Returns top 10 products by exposure.

**Request:**
```bash
GET /api/v2/risk/exposure
```

**Response:**
```json
{
  "by_coverage_type": [
    {
      "coverage_type": "depeg",
      "exposure_usd": 2500000.0
    },
    {
      "coverage_type": "bridge",
      "exposure_usd": 1200000.0
    }
  ],
  "by_chain": [
    {
      "chain": "Ethereum",
      "exposure_usd": 3000000.0
    },
    {
      "chain": "Arbitrum",
      "exposure_usd": 800000.0
    }
  ],
  "by_stablecoin": [
    {
      "stablecoin": "USDC",
      "exposure_usd": 2000000.0
    },
    {
      "stablecoin": "USDT",
      "exposure_usd": 1500000.0
    }
  ],
  "top_10_products": [
    {
      "coverage_type": "depeg",
      "chain": "Ethereum",
      "stablecoin": "USDC",
      "exposure_usd": 1200000.0,
      "policy_count": 450
    }
  ],
  "total_policies": 1523,
  "timestamp": 1697564800.0
}
```

---

### 3. GET `/api/v2/bridge-health/:bridge_id`

Get real-time health score for a cross-chain bridge.

**Request:**
```bash
GET /api/v2/bridge-health/wormhole_eth_ton
```

**Bridge IDs:**
- `wormhole_eth_ton`, `wormhole_arb_ton`, `wormhole_base_ton`, `wormhole_poly_ton`, `wormhole_sol_ton`
- `multichain_eth_ton`, `orbit_eth_ton`, `celer_eth_ton`, `lightning_btc_ton`

**Response:**
```json
{
  "bridge_id": "wormhole_eth_ton",
  "source_chain": "Ethereum",
  "dest_chain": "TON",
  "health_score": 0.92,
  "health_status": "Healthy",
  "tvl_usd": 500000.0,
  "tvl_change_pct": -2.3,
  "exploit_detected": false,
  "active_alerts": [],
  "last_updated": 1697564800.0,
  "oracle_consensus": 0.95,
  "timestamp": 1697564800.0
}
```

**Health Status:**
- `Healthy`: health_score ≥ 0.9
- `Caution`: 0.7 ≤ health_score < 0.9
- `Warning`: 0.5 ≤ health_score < 0.7
- `Critical`: health_score < 0.5

---

### 4. GET `/api/v2/risk/alerts`

Get active risk alerts from the unified risk monitor.

**Request:**
```bash
GET /api/v2/risk/alerts?severity=Critical&alert_type=LTV_Breach
```

**Query Parameters:**
- `severity` (optional): `Critical`, `High`, `Medium`, `Low`
- `alert_type` (optional): `LTV_Breach`, `Reserve_Low`, `Concentration_High`, etc.

**Response:**
```json
{
  "alerts": [
    {
      "alert_type": "LTV_Breach",
      "severity": "Critical",
      "message": "LTV critical: 76.00% >= 75.00%",
      "current_value": 0.76,
      "limit_value": 0.75,
      "timestamp": 1697564800.0
    }
  ],
  "total_alerts": 1,
  "critical_count": 1,
  "timestamp": 1697564800.0
}
```

**Alert Types:**
- `LTV_Breach` - Loan-to-value ratio exceeded
- `Reserve_Low` - Liquid reserves below threshold
- `Concentration_High` - Single asset exposure too high
- `Correlation_Spike` - Assets becoming highly correlated
- `Stress_Loss_High` - Stress test losses excessive
- `VaR_Breach` - Value at Risk limit exceeded

---

### 5. GET `/api/v2/tranches/apy`

Get real-time APY for all 6 tranches with current utilization.

**Request:**
```bash
GET /api/v2/tranches/apy
```

**Response:**
```json
{
  "tranches": [
    {
      "tranche_id": "SURE_BTC",
      "apy": 8.5,
      "utilization": 0.45,
      "total_capital_ton": 10000.0,
      "coverage_sold_ton": 4500.0,
      "available_capacity_ton": 5500.0,
      "last_updated": 1697564800.0
    },
    {
      "tranche_id": "SURE_SNR",
      "apy": 12.3,
      "utilization": 0.52,
      "total_capital_ton": 8000.0,
      "coverage_sold_ton": 4160.0,
      "available_capacity_ton": 3840.0,
      "last_updated": 1697564800.0
    }
  ],
  "timestamp": 1697564800.0
}
```

**Tranches (6 total):**
- `SURE_BTC` - Bitcoin-collateralized (0-25% util: 2-8% APY)
- `SURE_SNR` - Senior tranche (0-100% util: 5-25% APY)
- `SURE_MEZZ` - Mezzanine tranche (0-100% util: 15-50% APY)
- `SURE_JNR` - Junior tranche (0-100% util: 25-100% APY)
- `SURE_JNR_PLUS` - Junior+ tranche (0-100% util: 35-150% APY)
- `SURE_EQT` - Equity tranche (0-100% util: 50-300% APY)

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  console.log('Connected to Tonsurance WebSocket v2');

  // Subscribe to channels
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'bridge_health'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Available Channels

#### 1. `bridge_health`
Real-time bridge security updates (60s interval + instant alerts).

**Messages:**
```json
{
  "channel": "bridge_health",
  "type": "health_change",
  "bridge_id": "wormhole_eth_ton",
  "previous_score": 0.95,
  "current_score": 0.88,
  "exploit_detected": false,
  "timestamp": 1697564800.0
}
```

```json
{
  "channel": "bridge_health",
  "type": "critical_alert",
  "bridge_id": "multichain_eth_ton",
  "alert_id": "tvl_drop_1697564800",
  "message": "CRITICAL: Bridge TVL dropped 25.0% ($125000) in 45 minutes",
  "severity": "Critical",
  "timestamp": 1697564800.0
}
```

#### 2. `risk_alerts`
Critical risk threshold breaches (60s interval).

**Messages:**
```json
{
  "channel": "risk_alerts",
  "type": "new_alert",
  "alert_type": "Concentration_High",
  "severity": "High",
  "message": "Concentration warning: 27.00% >= 25.00%",
  "current_value": 0.27,
  "limit_value": 0.25,
  "timestamp": 1697564800.0
}
```

#### 3. `top_products`
Top 10 product ranking changes (120s interval).

**Messages:**
```json
{
  "channel": "top_products",
  "type": "ranking_update",
  "products": [
    {
      "coverage_type": "depeg",
      "chain": "Ethereum",
      "stablecoin": "USDC",
      "exposure_usd": 1200000.0,
      "policy_count": 450
    }
  ],
  "timestamp": 1697564800.0
}
```

#### 4. `tranche_apy`
Tranche APY updates (60s interval).

**Messages:**
```json
{
  "channel": "tranche_apy",
  "type": "apy_update",
  "tranches": [
    {
      "tranche_id": "SURE_BTC",
      "apy": 8.5,
      "utilization": 0.45,
      "last_updated": 1697564800.0
    }
  ],
  "timestamp": 1697564800.0
}
```

### WebSocket Actions

#### Subscribe
```json
{
  "action": "subscribe",
  "channel": "bridge_health"
}
```

#### Unsubscribe
```json
{
  "action": "unsubscribe",
  "channel": "bridge_health"
}
```

#### Heartbeat
```json
{
  "action": "ping",
  "channel": "heartbeat"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": 1697564800.0
}
```

---

## Testing

### 1. Start the API Server

```bash
# From backend/api directory
dune exec -- tonsurance-api-v2

# Or with custom port
PORT=9000 dune exec -- tonsurance-api-v2
```

### 2. Test REST Endpoints

```bash
# Make script executable
chmod +x examples/test_api_v2.sh

# Run tests
./examples/test_api_v2.sh
```

### 3. Test WebSocket

Open `examples/test_websocket.html` in a web browser:

```bash
# macOS
open examples/test_websocket.html

# Linux
xdg-open examples/test_websocket.html
```

Features:
- Real-time connection status
- Subscribe/unsubscribe to channels
- Live message log with color-coding
- Message statistics
- Automatic heartbeat

---

## Performance Characteristics

### REST API
- **Response Time**: <100ms (p95)
- **Throughput**: ~1000 requests/second (single instance)
- **Concurrency**: 100+ simultaneous connections

### WebSocket
- **Concurrent Connections**: 100+ clients
- **Message Latency**: <50ms
- **Heartbeat Interval**: 30 seconds
- **Client Timeout**: 5 minutes (no ping)

### Monitoring Tasks
- **Bridge Health Check**: Every 60 seconds
- **Risk Snapshot Update**: Every 60 seconds
- **Top Products Refresh**: Every 120 seconds
- **APY Broadcast**: Every 60 seconds

---

## Error Handling

### REST API Errors

**400 Bad Request:**
```json
{
  "error": "Invalid coverage_type: invalid"
}
```

**404 Not Found:**
```json
{
  "error": "Bridge not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Database connection failed"
}
```

### WebSocket Errors

**Invalid Channel:**
```json
{
  "type": "error",
  "message": "Invalid channel: invalid_channel",
  "valid_channels": ["bridge_health", "risk_alerts", "top_products", "tranche_apy"],
  "timestamp": 1697564800.0
}
```

---

## Integration Examples

### React Hook

```typescript
// useWebSocket.ts
import { useEffect, useState } from 'react';

export function useWebSocket(channel: string) {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws');

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        action: 'subscribe',
        channel: channel
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.channel === channel) {
        setData(message);
      }
    };

    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, [channel]);

  return { data, connected };
}

// Usage in component
function BridgeHealthDashboard() {
  const { data, connected } = useWebSocket('bridge_health');

  if (!connected) return <div>Connecting...</div>;

  return (
    <div>
      {data?.type === 'critical_alert' && (
        <Alert severity="error">
          {data.message}
        </Alert>
      )}
    </div>
  );
}
```

---

## Production Deployment

### Environment Variables

```bash
PORT=8080                    # API server port
DATABASE_URL=postgresql://   # PostgreSQL connection
REDIS_URL=redis://           # Redis cache (optional)
LOG_LEVEL=info               # Logging level
```

### Scaling

**Horizontal Scaling:**
- Deploy multiple API instances behind load balancer
- Use Redis for shared WebSocket client state
- PostgreSQL connection pooling (max 20 connections per instance)

**Vertical Scaling:**
- 2 CPU cores minimum
- 4GB RAM recommended
- SSD storage for database

### Monitoring

**Metrics to track:**
- Request rate (requests/second)
- Response time (p50, p95, p99)
- WebSocket connection count
- Error rate
- Bridge health check failures
- Database query latency

**Logging:**
- Structured JSON logs
- Request/response logging
- Error stack traces
- WebSocket connection events

---

---

## Authentication & Security

### API Key Authentication

Protected endpoints require Bearer token authentication. Include your API key in the `Authorization` header.

**Request Example:**
```bash
curl -X POST http://localhost:8080/api/v2/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tonsure_dev_1234567890abcdef1234567890abcdef" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 30,
    "user_address": "EQ..."
  }'
```

**Response (Success):**
```json
{
  "success": true,
  "policy_id": "POL-1234567890",
  "tx_hash": "0xabc123...",
  "status": "pending"
}
```

**Response (Unauthorized):**
```json
{
  "error": "Missing Authorization header",
  "hint": "Use 'Authorization: Bearer YOUR_API_KEY'"
}
```

### Generating API Keys

**Development:**
```bash
# Use the pre-configured development key
export API_KEY="tonsure_dev_1234567890abcdef1234567890abcdef"
```

**Production:**
```bash
# Generate a new API key (32 bytes, base64 encoded)
cd backend/scripts
./generate_api_key.sh --name "My App" --scopes "read,write"

# Output:
# API Key: tonsure_prod_a1b2c3d4e5f6...
# Key Hash: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
# Add this to backend/config/api_security.json
```

### API Key Scopes

- **read**: Access to all GET endpoints (quotes, risk data, analytics)
- **write**: Access to POST endpoints (buy policy, file claim, vault operations)
- **admin**: Full access including admin endpoints

### Rate Limiting

**Rate Limits:**
- **Unauthenticated** (by IP): 100 requests/minute
- **Authenticated** (by API key): 500 requests/minute
- **Endpoint-specific limits**:
  - `/api/v2/quote/*`: 60/min (burst: +10)
  - `/api/v2/policies`: 20/min (burst: +5)
  - `/api/v2/claims`: 10/min (burst: +2)
  - `/api/v2/vault/*`: 30/min (burst: +5)

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 60
```

**Rate Limit Exceeded (429):**
```json
{
  "error": "Rate limit exceeded",
  "retry_after_seconds": 60
}
```

**Check Current Rate Limit Status:**
```bash
# The response headers include rate limit info
curl -I http://localhost:8080/api/v2/risk/exposure
```

### CORS Configuration

API v2 supports CORS with an origin allowlist.

**Allowed Origins:**
- `http://localhost:3000` (React dev)
- `http://localhost:5173` (Vite dev)
- `https://tonsurance.io`
- `https://app.tonsurance.io`

**CORS Headers:**
```
Access-Control-Allow-Origin: https://app.tonsurance.io
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

**Adding New Origins:**
Edit `backend/config/api_security.json`:
```json
{
  "cors": {
    "allowed_origins": [
      "https://app.tonsurance.io",
      "https://your-app.com"
    ]
  }
}
```

### Input Validation & Sanitization

All requests are validated:

- **Max request size**: 10MB
- **Max string length**: 1,000 characters
- **Max array length**: 100 items
- **Allowed content types**: `application/json`, `application/x-www-form-urlencoded`

**Invalid Input (400):**
```json
{
  "error": "Request body too large",
  "max_size_mb": 10
}
```

### Security Headers

All responses include security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### API Key Rotation

**Best Practices:**
- Rotate API keys every 90 days
- Never commit keys to version control
- Store keys in environment variables or secret managers
- Revoke compromised keys immediately

**Revoking an API Key:**
```bash
# Add to backend/config/api_security.json
{
  "key": "tonsure_prod_...",
  "revoked": true
}
```

### Monitoring & Alerts

The API logs all security events:

- Failed authentication attempts (threshold: 10/hour per IP)
- Rate limit violations (threshold: 50/hour per IP)
- CORS violations
- Suspicious activity patterns

**View Security Logs:**
```bash
# Logs are written to stdout/stderr
docker logs tonsurance-api-v2 | grep "\[SECURITY\]"
```

### Configuration

**Environment Variables:**
```bash
# Port (default: 8080)
export PORT=8080

# Security config path (default: backend/config/api_security.json)
export SECURITY_CONFIG=/path/to/api_security.json

# Redis for rate limiting (default: 127.0.0.1:6379)
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
```

**Configuration File:**
See `backend/config/api_security.json` for full configuration options.

---

## Roadmap

### v2.1 (Q1 2025)
- [x] Rate limiting per IP/API key (COMPLETED)
- [x] CORS protection (COMPLETED)
- [x] Bearer token authentication (COMPLETED)
- [ ] GraphQL endpoint for complex queries
- [ ] JWT authentication for WebSocket
- [ ] OpenAPI/Swagger documentation

### v2.2 (Q2 2025)
- [ ] Redis pub/sub for multi-instance WebSocket
- [ ] Historical data endpoints (7/30/90 day)
- [ ] CSV export for analytics
- [ ] Webhook notifications

---

## Support

**Documentation:** `/docs/API_V2_SPEC.md`
**Issues:** GitHub Issues
**Discord:** #api-support channel

**Base URL (Production):** `https://api.tonsurance.com`
**WebSocket URL (Production):** `wss://api.tonsurance.com/ws`
