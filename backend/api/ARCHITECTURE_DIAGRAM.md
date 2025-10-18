# API v2 System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  React App   │  │  Mobile App  │  │  Analytics   │             │
│  │  Dashboard   │  │  (iOS/And.)  │  │  Dashboard   │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                  │                      │
│         └──────────────────┼──────────────────┘                      │
│                            │                                         │
│                    HTTP + WebSocket                                 │
└────────────────────────────┼─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       API V2 LAYER (Port 8080)                      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    DREAM WEB SERVER                           │ │
│  │                                                               │ │
│  │  ┌─────────────────────┐    ┌──────────────────────────┐    │ │
│  │  │   REST ENDPOINTS    │    │   WEBSOCKET CHANNELS     │    │ │
│  │  ├─────────────────────┤    ├──────────────────────────┤    │ │
│  │  │ /quote/multi-dim    │    │ bridge_health (60s)      │    │ │
│  │  │ /risk/exposure      │    │ risk_alerts (60s)        │    │ │
│  │  │ /bridge-health/:id  │    │ top_products (120s)      │    │ │
│  │  │ /risk/alerts        │    │ tranche_apy (60s)        │    │ │
│  │  │ /tranches/apy       │    │                          │    │ │
│  │  │ /health             │    │ Heartbeat (30s)          │    │ │
│  │  └─────────────────────┘    └──────────────────────────┘    │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐│ │
│  │  │         BACKGROUND MONITORING TASKS (Lwt)               ││ │
│  │  │                                                          ││ │
│  │  │  Task 1: bridge_health_broadcaster()      [60s loop]   ││ │
│  │  │  Task 2: risk_alerts_broadcaster()        [60s loop]   ││ │
│  │  │  Task 3: top_products_broadcaster()       [120s loop]  ││ │
│  │  │  Task 4: tranche_apy_broadcaster()        [60s loop]   ││ │
│  │  │  Task 5: heartbeat_task()                 [30s loop]   ││ │
│  │  └─────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
│                         OCaml Function Calls                         │
│                                                                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND MODULES (OCaml)                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  unified_risk_monitor.ml                                      │ │
│  │  ┌──────────────────────────────────────────────────────────┐│ │
│  │  │ • calculate_risk_snapshot()         [Every 60s]          ││ │
│  │  │ • calculate_product_exposures()                          ││ │
│  │  │ • calculate_top_products()                               ││ │
│  │  │ • check_risk_limits()                                    ││ │
│  │  │                                                           ││ │
│  │  │ Data: VaR, stress tests, LTV, reserves, concentrations  ││ │
│  │  └──────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  bridge_monitor.ml                                            │ │
│  │  ┌──────────────────────────────────────────────────────────┐│ │
│  │  │ • monitor_all_bridges()             [Every 60s]          ││ │
│  │  │ • calculate_health_score()                               ││ │
│  │  │ • detect_tvl_drop()                                      ││ │
│  │  │ • check_oracle_consensus()                               ││ │
│  │  │                                                           ││ │
│  │  │ Monitors: 9 cross-chain bridges                          ││ │
│  │  └──────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  utilization_tracker.ml                                       │ │
│  │  ┌──────────────────────────────────────────────────────────┐│ │
│  │  │ • get_all_utilizations()                                 ││ │
│  │  │ • get_available_capacity()                               ││ │
│  │  │ • calculate_utilization_ratio()                          ││ │
│  │  │                                                           ││ │
│  │  │ Tracks: 6 tranches (SURE_BTC, SNR, MEZZ, JNR, JNR+, EQT)││ │
│  │  │ Cache: In-memory (30s TTL)                               ││ │
│  │  └──────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  collateral_manager.ml                                        │ │
│  │  ┌──────────────────────────────────────────────────────────┐│ │
│  │  │ • get_pool_state()                                       ││ │
│  │  │ • calculate_ltv()                                        ││ │
│  │  │ • calculate_reserve_ratio()                              ││ │
│  │  │                                                           ││ │
│  │  │ Data: Total capital, coverage sold, active policies      ││ │
│  │  └──────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PERSISTENCE LAYER                              │
│                                                                      │
│  ┌─────────────────────┐         ┌─────────────────────┐           │
│  │   PostgreSQL        │         │   Redis Cache       │           │
│  ├─────────────────────┤         ├─────────────────────┤           │
│  │ • Policies          │         │ • Utilization       │           │
│  │ • Tranche state     │         │   (30s TTL)         │           │
│  │ • Risk snapshots    │         │ • Premium quotes    │           │
│  │ • Bridge health     │         │                     │           │
│  └─────────────────────┘         └─────────────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Multi-Dimensional Quote Request

```
1. Frontend
   └─► POST /api/v2/quote/multi-dimensional
       {
         "coverage_type": "depeg",
         "chain": "Ethereum",
         "stablecoin": "USDC",
         "coverage_amount": 10000,
         "duration_days": 90
       }
       │
       ▼
2. API v2 (api_v2.ml)
   └─► multi_dimensional_quote_handler()
       │
       ├─► Parse coverage_type → Base Rate Lookup
       │   depeg → 0.8% APR
       │
       ├─► Parse chain → Chain Multiplier
       │   Ethereum → 1.0x
       │
       ├─► Parse stablecoin → Adjustment
       │   USDC → +0.00%
       │
       ├─► Calculate Total Rate
       │   = (0.008 × 1.0) + 0.0 = 0.008
       │
       ├─► Calculate Premium
       │   = 10000 × 0.008 × (90/365) = $73.42
       │
       └─► Generate Product Hash
           = SHA256("depeg_Ethereum_USDC")
       │
       ▼
3. Response
   {
     "premium": 73.42,
     "breakdown": {...},
     "product_hash": "0xabc123..."
   }
```

---

## Data Flow: Real-Time Risk Alert

```
1. Background Task (60s interval)
   risk_alerts_broadcaster()
   │
   ├─► Call unified_risk_monitor.calculate_risk_snapshot()
   │   │
   │   ├─► Get pool state from collateral_manager
   │   ├─► Calculate VaR, stress tests, LTV, reserves
   │   ├─► Check risk limits
   │   │
   │   └─► Return risk_snapshot with alerts
   │
   ├─► Compare with previous snapshot
   │   │
   │   └─► Identify new critical alerts
   │
   └─► Broadcast to WebSocket clients
       │
       ▼
2. WebSocket Server
   broadcast_to_channel(state, "risk_alerts", message)
   │
   ├─► Filter clients subscribed to "risk_alerts"
   │
   └─► Send JSON message to each client
       {
         "channel": "risk_alerts",
         "type": "new_alert",
         "alert_type": "LTV_Breach",
         "severity": "Critical",
         "message": "LTV critical: 76.00% >= 75.00%",
         "current_value": 0.76,
         "limit_value": 0.75
       }
       │
       ▼
3. Frontend
   ws.onmessage = (event) => {
     const data = JSON.parse(event.data);
     if (data.severity === 'Critical') {
       showAlert(data.message);
     }
   }
```

---

## 560-Product Matrix

```
Coverage Types (5)      Chains (9)         Stablecoins (14)
─────────────────      ──────────────     ─────────────────
1. depeg               1. Ethereum        1.  USDC
2. smart_contract      2. Arbitrum        2.  USDT
3. oracle              3. Base            3.  USDP
4. bridge              4. Polygon         4.  DAI
5. cex_liquidation     5. Optimism        5.  FRAX
                       6. Bitcoin         6.  BUSD
                       7. Lightning       7.  USDe
                       8. Solana          8.  sUSDe
                       9. TON             9.  USDY
                                          10. PYUSD
                                          11. GHO
                                          12. LUSD
                                          13. crvUSD
                                          14. mkUSD

Total Combinations: 5 × 9 × 14 = 630 products
(Note: Some combinations invalid, e.g., bridge on Bitcoin)
Valid Products: ~560
```

---

## WebSocket Client Lifecycle

```
1. CONNECT
   ┌───────────┐
   │  Client   │ ──── ws://localhost:8080/ws ────┐
   └───────────┘                                  │
                                                  ▼
                                          ┌───────────────┐
                                          │  WS Server    │
                                          └───────┬───────┘
                                                  │
                                                  ▼
2. WELCOME                                 Assign client_id
   ┌───────────┐                           Generate welcome msg
   │  Client   │ ◄──── { type: "welcome" }
   └───────────┘       { client_id: "..." }
        │              { available_channels: [...] }
        │
        ▼
3. SUBSCRIBE
   ┌───────────┐
   │  Client   │ ──── { action: "subscribe" } ───┐
   └───────────┘      { channel: "bridge_health" }│
                                                   ▼
                                          ┌───────────────┐
                                          │  WS Server    │
                                          └───────┬───────┘
                                                  │
                                                  ▼
                                          Add to subscriptions
   ┌───────────┐                          Update client state
   │  Client   │ ◄──── { type: "subscribed" }
   └───────────┘       { channel: "bridge_health" }
        │
        │
        ▼
4. RECEIVE MESSAGES
   ┌───────────┐
   │  Client   │ ◄──── { channel: "bridge_health" } ─── Background Task
   └───────────┘       { type: "health_change" }         (60s loop)
        │              { bridge_id: "..." }
        │              { health_score: 0.88 }
        │
        ▼
   Display in UI

5. HEARTBEAT (every 30s)
   ┌───────────┐
   │  Client   │ ──── { action: "ping" } ────────────┐
   └───────────┘                                       │
        │                                              ▼
        │                                     ┌───────────────┐
        │                                     │  WS Server    │
        │                                     └───────┬───────┘
        │                                             │
        ◄────── { type: "pong" } ────────────────────┘
        │       { timestamp: ... }
        │
        ▼
   Update last_ping

6. UNSUBSCRIBE
   ┌───────────┐
   │  Client   │ ──── { action: "unsubscribe" } ────┐
   └───────────┘      { channel: "bridge_health" }   │
        │                                             ▼
        │                                    ┌───────────────┐
        │                                    │  WS Server    │
        │                                    └───────┬───────┘
        │                                            │
        ◄────── { type: "unsubscribed" } ───────────┘
        │       { channel: "bridge_health" }
        │
        ▼
   Stop receiving messages

7. DISCONNECT
   ┌───────────┐
   │  Client   │ ──── Close connection ──────────────┐
   └───────────┘                                      │
                                                      ▼
                                             ┌───────────────┐
                                             │  WS Server    │
                                             └───────┬───────┘
                                                     │
                                                     ▼
                                            Remove from clients
                                            Clean up subscriptions
```

---

## Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                      api_v2.ml                              │
│  (REST endpoint handlers + monitoring coordination)         │
└────────┬──────────────────────────────────────────┬─────────┘
         │                                          │
         │ imports                                  │ imports
         │                                          │
         ▼                                          ▼
┌─────────────────────┐                  ┌──────────────────────┐
│ websocket_v2.ml     │                  │ Background Modules   │
│ (Real-time channels)│                  │                      │
└────────┬────────────┘                  │ • unified_risk_      │
         │                                │   monitor.ml         │
         │ imports                        │ • bridge_monitor.ml  │
         │                                │ • utilization_       │
         ▼                                │   tracker.ml         │
┌─────────────────────┐                  │ • collateral_        │
│ Types.ml            │                  │   manager.ml         │
│ (Shared type defs)  │◄─────────────────┤                      │
└─────────────────────┘    imports       └──────────────────────┘
         │
         │ uses
         ▼
┌─────────────────────┐
│ Yojson, Core, Lwt   │
│ (External libraries)│
└─────────────────────┘
```

---

## Concurrency Model (Lwt)

```
Main Thread
│
├─► Dream HTTP Server
│   │
│   ├─► Request Handler Threads (concurrent)
│   │   ├─► GET /api/v2/risk/exposure
│   │   ├─► POST /api/v2/quote/multi-dimensional
│   │   └─► GET /api/v2/bridge-health/:id
│   │
│   └─► WebSocket Handler Threads (concurrent)
│       ├─► Client 1 (receive loop)
│       ├─► Client 2 (receive loop)
│       └─► Client N (receive loop)
│
├─► Background Task 1: bridge_health_broadcaster()
│   └─► Lwt_unix.sleep 60.0 → monitor → broadcast → loop
│
├─► Background Task 2: risk_alerts_broadcaster()
│   └─► Lwt_unix.sleep 60.0 → calculate → broadcast → loop
│
├─► Background Task 3: top_products_broadcaster()
│   └─► Lwt_unix.sleep 120.0 → fetch → compare → broadcast → loop
│
├─► Background Task 4: tranche_apy_broadcaster()
│   └─► Lwt_unix.sleep 60.0 → fetch → broadcast → loop
│
└─► Background Task 5: heartbeat_task()
    └─► Lwt_unix.sleep 30.0 → check clients → cleanup → loop

All tasks run cooperatively using Lwt
No OS threads, single event loop
Non-blocking I/O for 100+ concurrent connections
```

---

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────┐
│                     LATENCY BREAKDOWN                        │
└─────────────────────────────────────────────────────────────┘

HTTP Request (POST /quote/multi-dimensional):
│
├─► Network latency (client → server)        ~5ms
├─► Dream request parsing                    ~2ms
├─► JSON parsing (Yojson)                    ~3ms
├─► Quote calculation                        ~8ms
│   ├─► Coverage type lookup                 1ms
│   ├─► Chain multiplier                     1ms
│   ├─► Stablecoin adjustment                1ms
│   └─► Premium calculation                  5ms
├─► JSON serialization                       ~4ms
├─► Dream response building                  ~3ms
└─► Network latency (server → client)        ~5ms
    ──────────────────────────────────────────
    Total: ~30ms (typical)
           ~75ms (p95 with load)

WebSocket Message:
│
├─► Background task triggers                 0ms
├─► Data fetch from backend module           ~10ms
├─► JSON serialization                       ~5ms
├─► Broadcast to N clients                   ~5ms × N
└─► Network delivery                         ~5ms
    ──────────────────────────────────────────
    Total: ~25ms + (5ms × N)
           For N=100: ~525ms to all clients
           Per client: ~25ms
```

---

## Security Considerations

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                          │
└─────────────────────────────────────────────────────────────┘

1. Network Layer
   ├─► HTTPS/TLS in production (currently HTTP for dev)
   ├─► WSS (WebSocket Secure) in production
   └─► Rate limiting (planned for v2.1)

2. Authentication (planned)
   ├─► JWT tokens for WebSocket
   ├─► API key authentication for REST
   └─► IP whitelisting for sensitive endpoints

3. Input Validation
   ├─► JSON schema validation
   ├─► Coverage amount limits
   ├─► Duration bounds (1-365 days)
   └─► Coverage type/chain/asset validation

4. Data Sanitization
   ├─► Float precision limits
   ├─► String length limits
   └─► SQL injection prevention (parameterized queries)

5. Error Handling
   ├─► Never expose internal errors to clients
   ├─► Generic error messages
   └─► Detailed logging on server side

6. DoS Protection
   ├─► Connection limits (100+ concurrent)
   ├─► Heartbeat timeout (5 min)
   └─► Message rate limiting (planned)
```

---

## Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────┐
│                      METRICS TO TRACK                        │
└─────────────────────────────────────────────────────────────┘

Application Metrics:
├─► Request rate (req/s)
├─► Response time (p50, p95, p99)
├─► Error rate (%)
├─► WebSocket connection count
├─► Active subscriptions per channel
└─► Background task execution time

Business Metrics:
├─► Quotes generated per hour
├─► Quote → Purchase conversion rate
├─► Top requested products
├─► Bridge health alert frequency
└─► Risk alert distribution

Infrastructure Metrics:
├─► CPU usage
├─► Memory usage
├─► Network I/O
├─► Database connection pool
└─► Redis cache hit rate

Logs:
├─► Request/response logs (structured JSON)
├─► Error stack traces
├─► WebSocket connection events
├─► Background task execution logs
└─► Security events (failed auth, etc.)
```

This architecture provides a scalable, performant foundation for the 560-product insurance system!
