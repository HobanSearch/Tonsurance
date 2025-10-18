# CEX Liquidation Protection - Technical Specification

**Version**: 1.0
**Last Updated**: October 2025
**Status**: Coverage Type 5 Implementation
**Owner**: Tonsurance Engineering Team

---

## Executive Summary

CEX Liquidation Protection is Tonsurance's fifth parametric coverage type, designed to protect traders against forced liquidations on centralized cryptocurrency exchanges. This product addresses one of the most painful events in leveraged trading: unexpected liquidations due to market volatility, cascading liquidations, or exchange-specific issues.

**Key Features:**
- Coverage for liquidation events on major CEXs (Binance, OKX, Bybit)
- Leverage-based premium multipliers (5x-20x leverage = 1.5x-3.0x premium)
- Real-time position monitoring via CEX APIs
- Automated claim verification through cryptographic proof
- Instant payout upon verified liquidation (< 5 seconds)

**Target Users:**
- Leveraged traders on perpetual futures markets
- Professional traders managing multiple positions
- Institutional traders with high-risk exposure
- Retail traders seeking liquidation insurance

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Coverage Mechanics](#coverage-mechanics)
3. [Premium Calculation](#premium-calculation)
4. [Risk Model](#risk-model)
5. [Smart Contract Architecture](#smart-contract-architecture)
6. [Backend Services](#backend-services)
7. [CEX API Integration](#cex-api-integration)
8. [Claims Processing](#claims-processing)
9. [Frontend Implementation](#frontend-implementation)
10. [Security Considerations](#security-considerations)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Plan](#deployment-plan)

---

## Product Overview

### What is CEX Liquidation Protection?

Centralized exchanges automatically liquidate leveraged positions when the margin ratio falls below a threshold (typically 80-90% of initial margin). This protection product compensates users when their positions are forcibly liquidated.

### Coverage Trigger Conditions

A claim is valid when ALL of the following conditions are met:

1. **Verified CEX Account**: User has linked and verified their CEX account via API keys
2. **Active Position**: User had an open leveraged position on a supported CEX
3. **Liquidation Event**: Position was forcibly liquidated by the exchange (not user-initiated close)
4. **Margin Call Threshold**: Account fell below maintenance margin requirements
5. **Supported CEX**: Liquidation occurred on Binance, OKX, or Bybit
6. **Temporal Validity**: Liquidation occurred during active policy period

### Exclusions

Coverage does NOT apply to:
- User-initiated position closures
- Liquidations due to user margin withdrawals
- Liquidations during exchange maintenance/downtime (covered by separate "Exchange Downtime" product)
- Positions closed via stop-loss orders
- Liquidations caused by user placing opposing orders

---

## Coverage Mechanics

### Coverage Amount

- **Minimum Coverage**: $1,000 USDT
- **Maximum Coverage**: $100,000 USDT per policy
- **Maximum Per User**: $500,000 aggregate across all CEX policies

### Supported Exchanges

| Exchange | Supported | API Integration | Real-time Monitoring |
|----------|-----------|-----------------|----------------------|
| Binance Futures | ✅ | REST + WebSocket | ✅ |
| OKX Futures | ✅ | REST + WebSocket | ✅ |
| Bybit Futures | ✅ | REST + WebSocket | ✅ |
| Kraken Futures | ⏳ Phase 2 | - | - |
| BitMEX | ⏳ Phase 2 | - | - |

### Supported Contract Types

- **Perpetual Futures**: USDT-margined perpetuals (e.g., BTC-USDT-PERP)
- **Quarterly Futures**: Standard quarterly contracts
- **Inverse Perpetuals**: Coin-margined perpetuals (e.g., BTC-USD-INV)

---

## Premium Calculation

### Base Premium Formula

```
Base Premium = Coverage Amount × Base APR × (Duration / 365)
Base APR = 1.2% (vs. 0.8% for depeg coverage)
```

### Leverage Multiplier

Premium increases based on leverage ratio:

| Leverage Range | Multiplier | Rationale |
|----------------|------------|-----------|
| 1x-2x | 1.0x | Low risk, minimal liquidation probability |
| 3x-5x | 1.5x | Moderate risk, standard leverage |
| 6x-10x | 2.0x | High risk, common in crypto futures |
| 11x-20x | 2.5x | Very high risk, 10-20% liquidation probability |
| 21x-50x | 3.0x | Extreme risk, 30-40% liquidation probability |
| 51x-100x | 4.0x | Ultra high risk, 50%+ liquidation probability |

### Exchange Risk Multiplier

Different exchanges have different liquidation risk profiles:

| Exchange | Multiplier | Reason |
|----------|------------|--------|
| Binance | 1.0x | Largest liquidity, best execution |
| OKX | 1.1x | Good liquidity, slightly higher slippage |
| Bybit | 1.2x | Lower liquidity, higher liquidation risk |

### Volatility Multiplier

Based on 30-day historical volatility of the underlying asset:

| Asset Volatility (30d) | Multiplier |
|-------------------------|------------|
| < 20% (BTC, ETH) | 1.0x |
| 20-40% (Major Alts) | 1.3x |
| 40-60% (Mid Caps) | 1.6x |
| > 60% (Low Caps, Memes) | 2.0x |

### Final Premium Formula

```python
Final Premium = Base Premium
                × Leverage Multiplier
                × Exchange Multiplier
                × Volatility Multiplier

Example:
Coverage: $10,000 USDT
Duration: 30 days
Leverage: 10x
Exchange: Binance
Asset: BTC (25% volatility)

Base Premium = $10,000 × 0.012 × (30/365) = $9.86
Leverage Multiplier = 2.0x (10x leverage)
Exchange Multiplier = 1.0x (Binance)
Volatility Multiplier = 1.3x (25% vol)

Final Premium = $9.86 × 2.0 × 1.0 × 1.3 = $25.64
```

---

## Risk Model

### Liquidation Probability Model

We estimate liquidation probability using Black-Scholes-inspired barrier option pricing:

```python
P(liquidation) = N(d) where:

d = (ln(Current Price / Liquidation Price) - (r - 0.5σ²)T) / (σ√T)

Current Price: Market price of underlying asset
Liquidation Price: Price at which position liquidates
r: Risk-free rate (0%)
σ: Historical volatility (30-day)
T: Time to expiry (days/365)
N(): Standard normal CDF
```

### Historical Liquidation Data

Based on 2023-2024 data from major CEXs:

| Leverage | 30-Day Liquidation % | 90-Day Liquidation % | Annual Liquidation % |
|----------|---------------------|----------------------|----------------------|
| 1x-2x | 0.1% | 0.3% | 1.2% |
| 3x-5x | 2.5% | 7.0% | 25% |
| 6x-10x | 8.0% | 20% | 55% |
| 11x-20x | 15% | 35% | 75% |
| 21x-50x | 25% | 50% | 90% |
| 51x-100x | 40% | 70% | 95% |

### Expected Loss Calculation

```python
Expected Loss = P(liquidation) × Average Liquidation Loss
Average Liquidation Loss ≈ 10-20% of coverage amount (due to partial liquidations)

For 10x leverage, 30-day policy:
Expected Loss = 8% × 15% × $10,000 = $120
Premium = $25.64
Loss Ratio = 120 / 25.64 = 4.68 (too high!)

Solution: Introduce position limits and dynamic pricing
```

### Risk Limits

To maintain sustainable loss ratios (target: 60-80%):

- **Max Coverage per Leverage Tier**:
  - 1x-5x: $100,000 per policy
  - 6x-10x: $50,000 per policy
  - 11x-20x: $25,000 per policy
  - 21x+: $10,000 per policy

- **Aggregate Pool Limits**:
  - Max total CEX liquidation coverage: 15% of total pool capital
  - Max exposure per exchange: 5% of pool capital
  - Max exposure per asset: 10% of pool capital

---

## Smart Contract Architecture

### CEXOracleAdapter.fc

**Purpose**: Verifies CEX liquidation claims by validating oracle-submitted proofs.

**Storage**:
```func
global slice owner_address;
global slice trusted_oracle;  ;; Backend oracle that submits proofs
global cell verified_cex_platforms;  ;; dict<string, int> -> CEX name to ID mapping
global int liquidation_threshold;  ;; 5% from margin call (stored as basis points)
global cell liquidation_proofs;  ;; dict<int64, cell> -> policy_id to proof
```

**Key Operations**:

1. **submit_liquidation_proof()**
```func
() submit_liquidation_proof(
    int policy_id,
    slice cex_platform,  ;; "binance", "okx", "bybit"
    slice user_cex_id,   ;; User's CEX account ID
    int position_id,     ;; Liquidated position ID
    int liquidation_price,  ;; Price at liquidation (nanotons)
    int liquidation_time,   ;; Unix timestamp
    slice oracle_signature  ;; Ed25519 signature from trusted oracle
) impure {
    ;; Verify caller is trusted oracle
    throw_unless(401, equal_slices(sender_address, trusted_oracle));

    ;; Verify signature
    int valid = check_signature(
        hash_liquidation_data(policy_id, cex_platform, position_id, liquidation_price, liquidation_time),
        oracle_signature,
        trusted_oracle
    );
    throw_unless(402, valid);

    ;; Verify CEX platform is supported
    (int cex_id, int found) = verified_cex_platforms.udict_get?(256, string_hash(cex_platform));
    throw_unless(403, found);

    ;; Store proof
    cell proof = begin_cell()
        .store_slice(cex_platform)
        .store_slice(user_cex_id)
        .store_uint(position_id, 64)
        .store_coins(liquidation_price)
        .store_uint(liquidation_time, 32)
        .store_uint(1, 1)  ;; verified flag
        .end_cell();

    liquidation_proofs~udict_set(64, policy_id, proof.begin_parse());

    ;; Emit verification event
    emit_liquidation_verified(policy_id, position_id, liquidation_price);
}
```

2. **verify_claim()**
```func
int verify_claim(int policy_id, int claim_time) method_id {
    ;; Retrieve proof
    (slice proof_slice, int found) = liquidation_proofs.udict_get?(64, policy_id);
    if (~ found) {
        return 0;  ;; Not verified
    }

    ;; Parse proof
    slice cex_platform = proof_slice~load_msg_addr();
    slice user_cex_id = proof_slice~load_msg_addr();
    int position_id = proof_slice~load_uint(64);
    int liquidation_price = proof_slice~load_coins();
    int liquidation_time = proof_slice~load_uint(32);
    int verified = proof_slice~load_uint(1);

    ;; Verify claim is within 24 hours of liquidation
    throw_unless(404, (claim_time - liquidation_time) < 86400);

    return verified;
}
```

---

## Backend Services

### 1. cex_monitor.ml

**Purpose**: Monitors user positions on CEX platforms via API, tracks liquidation distances.

**Architecture**:
```ocaml
module CEXMonitor = struct
  type cex_platform = Binance | OKX | Bybit

  type position_state = {
    user_id: string;
    policy_id: int64;
    cex_platform: cex_platform;
    position_id: string;
    symbol: string;
    leverage: float;
    margin_ratio: float;  (* Current margin / Maintenance margin *)
    liquidation_price: float;
    current_price: float;
    liquidation_distance_pct: float;  (* (Current - Liq) / Current *)
    last_updated: float;
  }

  type alert_level = Safe | Warning | Danger | Critical

  val monitor_position : string -> position_state Lwt.t
  val calculate_liquidation_distance : position_state -> float
  val determine_alert_level : float -> alert_level
  val send_alert : position_state -> alert_level -> unit Lwt.t
end
```

**Alert Thresholds**:
- **Safe**: > 20% from liquidation
- **Warning**: 10-20% from liquidation (send Telegram notification)
- **Danger**: 5-10% from liquidation (send urgent notification + email)
- **Critical**: < 5% from liquidation (real-time monitoring, escalate to keeper)

### 2. cex_liquidation_keeper.ml

**Purpose**: Polls CEX APIs for liquidation events, matches to policies, triggers verification.

**Workflow**:
```ocaml
let liquidation_keeper_loop () =
  let rec loop () =
    (* 1. Fetch recent liquidations from all CEXs *)
    let* binance_liqs = fetch_binance_liquidations ~since:(now() - 300.0) in
    let* okx_liqs = fetch_okx_liquidations ~since:(now() - 300.0) in
    let* bybit_liqs = fetch_bybit_liquidations ~since:(now() - 300.0) in

    (* 2. Match liquidations to active policies *)
    let all_liquidations = binance_liqs @ okx_liqs @ bybit_liqs in
    let* matched_claims = match_liquidations_to_policies all_liquidations in

    (* 3. For each match, verify and submit proof *)
    let* () = Lwt_list.iter_p (fun claim ->
      let* proof = generate_liquidation_proof claim in
      let* signature = sign_proof proof in
      submit_to_oracle_adapter ~policy_id:claim.policy_id ~proof ~signature
    ) matched_claims in

    (* 4. Sleep and repeat *)
    let* () = Lwt_unix.sleep 60.0 in  (* Poll every 60 seconds *)
    loop ()
  in
  loop ()
```

**Data Storage** (PostgreSQL):
```sql
CREATE TABLE cex_liquidations (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT REFERENCES policies(id),
  cex_platform VARCHAR(20) NOT NULL,
  user_cex_id VARCHAR(100) NOT NULL,
  position_id VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  leverage DECIMAL(10,2) NOT NULL,
  liquidation_price DECIMAL(20,8) NOT NULL,
  liquidation_time TIMESTAMP NOT NULL,
  liquidation_value_usd DECIMAL(20,2) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  claim_submitted BOOLEAN DEFAULT FALSE,
  proof_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_liquidations_policy ON cex_liquidations(policy_id);
CREATE INDEX idx_liquidations_time ON cex_liquidations(liquidation_time);
CREATE INDEX idx_liquidations_cex_user ON cex_liquidations(cex_platform, user_cex_id);
```

### 3. cex_verifier.ml

**Purpose**: Verifies liquidation claims against CEX API data, generates cryptographic proofs.

**Verification Steps**:
```ocaml
let verify_liquidation_claim ~policy_id ~position_id ~cex_platform =
  (* 1. Fetch policy details *)
  let* policy = fetch_policy_from_db policy_id in

  (* 2. Fetch liquidation data from CEX API *)
  let* liquidation_data = match cex_platform with
    | Binance -> fetch_binance_liquidation ~position_id
    | OKX -> fetch_okx_liquidation ~position_id
    | Bybit -> fetch_bybit_liquidation ~position_id
  in

  (* 3. Verify conditions *)
  let* () = verify_liquidation_conditions liquidation_data policy in

  (* 4. Generate merkle proof from trade history *)
  let* trade_history = fetch_trade_history
    ~cex_platform
    ~user_id:policy.cex_user_id
    ~start_time:(liquidation_data.timestamp - 3600.0)
    ~end_time:liquidation_data.timestamp
  in

  let merkle_root = build_merkle_tree trade_history in

  (* 5. Create cryptographic proof *)
  let proof = {
    policy_id;
    cex_platform = cex_platform_to_string cex_platform;
    position_id;
    liquidation_price = liquidation_data.price;
    liquidation_time = liquidation_data.timestamp;
    trade_history_merkle_root = merkle_root;
    verified_at = Unix.time ();
  } in

  (* 6. Sign proof with oracle private key *)
  let* signature = sign_with_oracle_key (serialize_proof proof) in

  Lwt.return (proof, signature)
```

---

## CEX API Integration

### Binance Futures API

**Authentication**:
```ocaml
type binance_credentials = {
  api_key: string;
  secret_key: string;
}

let sign_binance_request ~secret ~params =
  let query_string = params |> List.map (fun (k, v) -> k ^ "=" ^ v)
                            |> String.concat "&" in
  let timestamp = Unix.time () *. 1000.0 |> int_of_float |> string_of_int in
  let signed_params = query_string ^ "&timestamp=" ^ timestamp in
  let signature = Cryptokit.Hash.hmac_sha256 secret signed_params
                  |> Hex.of_string in
  signed_params ^ "&signature=" ^ signature
```

**Fetch Liquidation Orders**:
```ocaml
let fetch_binance_liquidations ~since =
  let endpoint = "https://fapi.binance.com/fapi/v1/forceOrders" in
  let params = [
    ("startTime", string_of_float (since *. 1000.0));
    ("limit", "1000");
  ] in

  let* response = Cohttp_lwt_unix.Client.get
    (Uri.of_string (endpoint ^ "?" ^ sign_binance_request params)) in

  let* body = Cohttp_lwt.Body.to_string (snd response) in
  let json = Yojson.Safe.from_string body in

  (* Parse liquidation events *)
  json |> Yojson.Safe.Util.to_list
       |> List.map parse_binance_liquidation
```

**WebSocket Real-time Monitoring**:
```ocaml
let subscribe_liquidation_stream ~symbol =
  let ws_url = "wss://fstream.binance.com/ws/" ^
               String.lowercase_ascii symbol ^ "@forceOrder" in

  Websocket_lwt_unix.with_connection ws_url (fun ws ->
    let rec listen () =
      let* frame = Websocket_lwt_unix.read ws in
      match frame.opcode with
      | Frame.Opcode.Text ->
          let* () = handle_liquidation_event (Frame.content frame) in
          listen ()
      | _ -> listen ()
    in
    listen ()
  )
```

### OKX API

**Fetch Liquidations**:
```ocaml
let fetch_okx_liquidations ~since =
  let endpoint = "https://www.okx.com/api/v5/public/liquidation-orders" in
  let params = [
    ("instType", "SWAP");
    ("state", "filled");
    ("after", string_of_float (since *. 1000.0));
  ] in

  (* OKX uses different auth scheme *)
  let headers = okx_sign_request ~params in

  let* response = Cohttp_lwt_unix.Client.get
    ~headers
    (Uri.of_string endpoint) in

  parse_okx_response response
```

### Bybit API

**Fetch Liquidations**:
```ocaml
let fetch_bybit_liquidations ~since =
  let endpoint = "https://api.bybit.com/v5/market/liquidation-history" in
  let params = [
    ("category", "linear");
    ("startTime", string_of_float (since *. 1000.0));
    ("limit", "200");
  ] in

  let* response = Cohttp_lwt_unix.Client.get
    (Uri.of_string (endpoint ^ "?" ^ build_query_string params)) in

  parse_bybit_response response
```

### Rate Limits

| Exchange | Requests/Min | WebSocket Connections | Notes |
|----------|--------------|----------------------|-------|
| Binance | 2400 | 10 per IP | Weight-based limits |
| OKX | 60 (public), 120 (private) | 100 | Per API key |
| Bybit | 120 | 50 | Per account |

**Rate Limiting Strategy**:
```ocaml
module RateLimiter = struct
  type t = {
    max_requests: int;
    window_seconds: float;
    mutable requests: (float * int) list;
  }

  let create ~max_requests ~window_seconds = {
    max_requests;
    window_seconds;
    requests = [];
  }

  let can_request limiter =
    let now = Unix.time () in
    let cutoff = now -. limiter.window_seconds in
    limiter.requests <- List.filter (fun (t, _) -> t > cutoff) limiter.requests;
    List.length limiter.requests < limiter.max_requests

  let acquire limiter =
    let rec wait () =
      if can_request limiter then (
        limiter.requests <- (Unix.time (), 1) :: limiter.requests;
        Lwt.return_unit
      ) else (
        let* () = Lwt_unix.sleep 1.0 in
        wait ()
      )
    in
    wait ()
end
```

---

## Claims Processing

### Claim Verification Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CEX Liquidation Event Occurs                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. cex_liquidation_keeper detects event (60s polling)       │
│    - Matches position_id to active policy                   │
│    - Verifies user owns the position                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. cex_verifier generates proof                             │
│    - Fetches full trade history from CEX                    │
│    - Builds Merkle tree of trades                           │
│    - Signs proof with oracle private key                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Submit proof to CEXOracleAdapter.fc                      │
│    - Verify oracle signature                                │
│    - Store verified proof on-chain                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. ClaimsProcessor.fc processes claim                       │
│    - Query CEXOracleAdapter for verification                │
│    - Calculate payout (coverage amount)                     │
│    - Execute payout from vault                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. User receives payout (< 5 seconds total)                 │
│    - 100% coverage amount to user's TON wallet              │
│    - Update policy status to "Claimed"                      │
└─────────────────────────────────────────────────────────────┘
```

### Payout Calculation

```python
# Full coverage payout (unlike depeg which uses linear interpolation)
Payout = min(Coverage Amount, Actual Liquidation Loss)

Example:
Coverage Amount: $10,000
Liquidation Loss: $8,500 (partial liquidation)
Payout: $8,500

Coverage Amount: $10,000
Liquidation Loss: $12,000 (full liquidation + fees)
Payout: $10,000 (capped at coverage)
```

---

## Frontend Implementation

### CEXProtection.tsx

**Page Structure**:
```tsx
export const CEXProtection = () => {
  const [selectedCEX, setSelectedCEX] = useState<'binance' | 'okx' | 'bybit'>('binance');
  const [leverage, setLeverage] = useState<number>(10);
  const [coverageAmount, setCoverageAmount] = useState<string>('10000');
  const [duration, setDuration] = useState<number>(30);
  const [cexApiKey, setCexApiKey] = useState<string>('');
  const [cexSecretKey, setCexSecretKey] = useState<string>('');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <TerminalWindow title="CEX_LIQUIDATION_PROTECTION.EXE">
        <TerminalOutput type="info">
          Protect against forced liquidations on Binance, OKX, and Bybit
        </TerminalOutput>
      </TerminalWindow>

      {/* CEX Selection */}
      <TerminalWindow title="STEP 1/5: SELECT EXCHANGE">
        <div className="grid grid-cols-3 gap-4">
          {['binance', 'okx', 'bybit'].map(cex => (
            <CEXCard
              cex={cex}
              selected={selectedCEX === cex}
              onClick={() => setSelectedCEX(cex)}
            />
          ))}
        </div>
      </TerminalWindow>

      {/* API Key Configuration */}
      <TerminalWindow title="STEP 2/5: CONNECT CEX ACCOUNT">
        <APIKeyForm
          cex={selectedCEX}
          onSubmit={handleAPIKeySubmit}
        />
      </TerminalWindow>

      {/* Leverage Selection */}
      <TerminalWindow title="STEP 3/5: SELECT LEVERAGE">
        <LeverageSelector
          value={leverage}
          onChange={setLeverage}
          premiumMultiplier={calculateLeverageMultiplier(leverage)}
        />
      </TerminalWindow>

      {/* Coverage Parameters */}
      <TerminalWindow title="STEP 4/5: COVERAGE PARAMETERS">
        <CoverageForm
          amount={coverageAmount}
          duration={duration}
          onAmountChange={setCoverageAmount}
          onDurationChange={setDuration}
        />
      </TerminalWindow>

      {/* Premium Quote */}
      <TerminalWindow title="STEP 5/5: PREMIUM QUOTE">
        <PremiumQuote
          coverage={parseFloat(coverageAmount)}
          leverage={leverage}
          cex={selectedCEX}
          duration={duration}
        />
      </TerminalWindow>
    </div>
  );
};
```

### CEXMonitor.tsx

**Component Structure**:
```tsx
export const CEXMonitor = () => {
  const [positions, setPositions] = useState<CEXPosition[]>([]);

  useEffect(() => {
    // WebSocket connection to backend for real-time updates
    const ws = new WebSocket('wss://api.tonsurance.com/cex/monitor');

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setPositions(update.positions);
    };

    return () => ws.close();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Your Monitored Positions</h2>

      {positions.map(position => (
        <PositionCard key={position.id}>
          <div className="flex justify-between">
            <div>
              <div className="font-semibold">{position.symbol}</div>
              <div className="text-sm text-gray-500">
                {position.cex} • {position.leverage}x leverage
              </div>
            </div>

            <LiquidationMeter
              distance={position.liquidationDistance}
              alertLevel={position.alertLevel}
            />
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-gray-500">Liq. Price</div>
              <div className="font-mono">${position.liquidationPrice}</div>
            </div>
            <div>
              <div className="text-gray-500">Current Price</div>
              <div className="font-mono">${position.currentPrice}</div>
            </div>
            <div>
              <div className="text-gray-500">Distance</div>
              <div className={`font-mono ${getDistanceColor(position.liquidationDistance)}`}>
                {position.liquidationDistance}%
              </div>
            </div>
          </div>
        </PositionCard>
      ))}
    </div>
  );
};
```

---

## Security Considerations

### API Key Security

**Storage**:
- User CEX API keys encrypted with AES-256-GCM
- Encryption key derived from user's TON wallet signature
- Keys stored in PostgreSQL with row-level encryption
- Keys never sent to frontend (server-side only)

**Permissions**:
- API keys require ONLY read-only permissions
- No trading, withdrawal, or transfer permissions needed
- Backend validates permissions on key submission

### Oracle Trust Model

**Centralized Oracle (Phase 1)**:
- Single trusted oracle run by Tonsurance team
- Oracle private key secured in AWS KMS
- All proofs signed with Ed25519 signatures
- Public key published on-chain for verification

**Decentralized Oracle (Phase 2)**:
- 5-of-7 multisig oracle network
- Each oracle independently verifies liquidations
- Requires majority consensus to submit proof
- Slashing for malicious/incorrect proofs

### Proof Integrity

**Merkle Tree Construction**:
```ocaml
let build_merkle_tree trades =
  let leaves = List.map (fun trade ->
    Cryptokit.Hash.sha256 (serialize_trade trade)
  ) trades in

  let rec build_tree leaves =
    match leaves with
    | [] -> failwith "Empty tree"
    | [single] -> single
    | _ ->
        let pairs = pair_up leaves in
        let next_level = List.map (fun (left, right) ->
          Cryptokit.Hash.sha256 (left ^ right)
        ) pairs in
        build_tree next_level
  in
  build_tree leaves
```

---

## Testing Strategy

### Unit Tests

**cex_monitor_test.ml**:
```ocaml
let test_liquidation_distance_calculation () =
  let position = {
    current_price = 50000.0;
    liquidation_price = 45000.0;
    leverage = 10.0;
  } in

  let distance = calculate_liquidation_distance position in
  assert_float_equal 10.0 distance ~epsilon:0.01
```

**cex_verifier_test.ml**:
```ocaml
let test_proof_generation () =
  let liquidation = mock_liquidation_event () in
  let proof = generate_liquidation_proof liquidation in

  assert (verify_proof_signature proof);
  assert_equal liquidation.position_id proof.position_id
```

### Integration Tests

**Test CEX API Integration**:
```ocaml
let test_binance_liquidation_fetch () =
  let* liquidations = fetch_binance_liquidations ~since:(now() - 3600.0) in

  assert (List.length liquidations > 0);
  List.iter (fun liq ->
    assert (liq.liquidation_time > now() - 3600.0)
  ) liquidations
```

### End-to-End Tests

**Full claim workflow**:
```typescript
test('CEX liquidation claim E2E', async () => {
  // 1. User purchases CEX liquidation protection
  const policy = await purchaseCEXProtection({
    cex: 'binance',
    leverage: 10,
    coverage: 10000,
    duration: 30
  });

  // 2. Simulate liquidation event
  await mockBinanceLiquidation({
    userId: policy.cexUserId,
    positionId: 'test-position-123',
    price: 45000
  });

  // 3. Wait for keeper to detect and verify
  await waitForLiquidationDetection(policy.id);

  // 4. Verify claim processed
  const claim = await getClaim(policy.id);
  expect(claim.status).toBe('approved');
  expect(claim.payoutAmount).toBe(10000);
});
```

---

## Deployment Plan

### Phase 1: Testnet (Weeks 1-2)

- Deploy CEXOracleAdapter.fc to TON testnet
- Deploy backend services (monitor, keeper, verifier)
- Configure API keys for Binance/OKX/Bybit testnets
- Run end-to-end tests with simulated liquidations

### Phase 2: Private Beta (Weeks 3-4)

- Invite 10-20 beta testers with real CEX accounts
- Monitor for bugs and edge cases
- Collect feedback on UX and pricing
- Refine premium multipliers based on actual liquidation data

### Phase 3: Public Launch (Week 5)

- Deploy to TON mainnet
- Launch frontend with CEXProtection.tsx page
- Publish security audit results
- Start with conservative limits ($25k max coverage)

### Phase 4: Scaling (Weeks 6-12)

- Gradually increase coverage limits to $100k
- Add support for more CEXs (Kraken, BitMEX)
- Implement decentralized oracle network
- Launch CEX liquidation index derivatives

---

## Appendix

### API Endpoints

**Backend REST API**:
```
POST /api/v1/cex/connect
  - Connect user's CEX account via API keys
  - Returns: { success, accountId, permissions }

GET /api/v1/cex/positions/:userId
  - Fetch user's current leveraged positions
  - Returns: { positions: [...] }

POST /api/v1/cex/premium-quote
  - Calculate premium for CEX liquidation coverage
  - Body: { cex, leverage, coverage, duration }
  - Returns: { premium, multipliers, breakdown }

POST /api/v1/cex/purchase
  - Purchase CEX liquidation protection
  - Body: { cex, leverage, coverage, duration, apiKey (encrypted) }
  - Returns: { policyId, contractAddress, premium }

GET /api/v1/cex/monitor/:policyId
  - Get real-time monitoring data for policy
  - Returns: { position, liquidationDistance, alerts }
```

### Database Schema

```sql
-- CEX account connections
CREATE TABLE cex_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_address VARCHAR(66) NOT NULL,
  cex_platform VARCHAR(20) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  secret_key_encrypted TEXT NOT NULL,
  permissions JSONB,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_address, cex_platform)
);

-- Active position monitoring
CREATE TABLE monitored_positions (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT REFERENCES policies(id),
  cex_account_id BIGINT REFERENCES cex_accounts(id),
  position_id VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  leverage DECIMAL(10,2) NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  liquidation_price DECIMAL(20,8) NOT NULL,
  current_margin_ratio DECIMAL(10,4),
  liquidation_distance_pct DECIMAL(10,4),
  alert_level VARCHAR(20),
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(cex_account_id, position_id)
);
```

---

**End of Specification**

For implementation questions, contact: engineering@tonsurance.com
