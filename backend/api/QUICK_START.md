# API v2 Quick Start Guide

## 1. Start the Server

```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/backend/api
dune exec -- tonsurance-api-v2
```

**Expected Output:**
```
╔════════════════════════════════════════╗
║  Tonsurance API v2 + WebSocket         ║
╚════════════════════════════════════════╝

Port: 8080
Base URL: http://localhost:8080

REST Endpoints:
  POST http://localhost:8080/api/v2/quote/multi-dimensional
  GET  http://localhost:8080/api/v2/risk/exposure
  GET  http://localhost:8080/api/v2/bridge-health/:bridge_id
  GET  http://localhost:8080/api/v2/risk/alerts
  GET  http://localhost:8080/api/v2/tranches/apy

WebSocket:
  WS   ws://localhost:8080/ws

Channels: bridge_health, risk_alerts, top_products, tranche_apy
```

---

## 2. Test REST Endpoints

```bash
# Make script executable (first time only)
chmod +x examples/test_api_v2.sh

# Run all tests
./examples/test_api_v2.sh
```

---

## 3. Test WebSocket

```bash
# Open in browser
open examples/test_websocket.html
```

**What to do:**
1. Click "Connect"
2. Subscribe to channels using the buttons
3. Watch real-time messages appear in the log

---

## 4. Example API Calls

### Get a Quote
```bash
curl -X POST http://localhost:8080/api/v2/quote/multi-dimensional \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 90
  }'
```

### Get Risk Exposure
```bash
curl http://localhost:8080/api/v2/risk/exposure | jq '.'
```

### Get Bridge Health
```bash
curl http://localhost:8080/api/v2/bridge-health/wormhole_eth_ton | jq '.'
```

### Get Risk Alerts
```bash
curl http://localhost:8080/api/v2/risk/alerts?severity=Critical | jq '.'
```

### Get Tranche APY
```bash
curl http://localhost:8080/api/v2/tranches/apy | jq '.'
```

---

## 5. WebSocket Example (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  // Subscribe to bridge health updates
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'bridge_health'
  }));

  // Subscribe to risk alerts
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'risk_alerts'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

---

## 6. Coverage Types

```javascript
"depeg"           // Stablecoin depeg protection (0.8% APR)
"smart_contract"  // Smart contract exploit (1.5% APR)
"oracle"          // Oracle failure (1.2% APR)
"bridge"          // Bridge exploit (2.0% APR)
"cex_liquidation" // CEX liquidation (2.5% APR)
```

---

## 7. Chains (9 total)

```javascript
"Ethereum", "Arbitrum", "Base", "Polygon", "Optimism",
"Bitcoin", "Lightning", "Solana", "TON"
```

---

## 8. Stablecoins (14 total)

```javascript
"USDC", "USDT", "USDP", "DAI", "FRAX", "BUSD", "USDe",
"sUSDe", "USDY", "PYUSD", "GHO", "LUSD", "crvUSD", "mkUSD"
```

---

## 9. Bridge IDs

```javascript
"wormhole_eth_ton", "wormhole_arb_ton", "wormhole_base_ton",
"wormhole_poly_ton", "wormhole_sol_ton", "multichain_eth_ton",
"orbit_eth_ton", "celer_eth_ton", "lightning_btc_ton"
```

---

## 10. WebSocket Channels

```javascript
"bridge_health"  // Updates every 60s + instant alerts
"risk_alerts"    // Updates every 60s
"top_products"   // Updates every 120s
"tranche_apy"    // Updates every 60s
```

---

## Troubleshooting

### Server won't start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Kill existing process
kill -9 <PID>

# Or use different port
PORT=9000 dune exec -- tonsurance-api-v2
```

### Can't connect to WebSocket
```bash
# Check server is running
curl http://localhost:8080/health

# Check browser console for errors
# Make sure URL is: ws://localhost:8080/ws (not wss://)
```

### REST endpoint returns 404
```bash
# Verify server started successfully
# Check URL spelling (case-sensitive)
# Ensure you're using correct HTTP method (GET vs POST)
```

---

## Full Documentation

See `README_API_V2.md` for complete API reference with:
- Detailed endpoint documentation
- Request/response schemas
- Error handling
- Performance characteristics
- Integration examples
- Production deployment guide

---

## Support

- **Documentation:** `README_API_V2.md`
- **Implementation Summary:** `API_V2_IMPLEMENTATION_SUMMARY.md`
- **Test Scripts:** `examples/`
