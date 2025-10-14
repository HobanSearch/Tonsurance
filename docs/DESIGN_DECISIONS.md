# Design Decisions - Tonsurance Hedged Insurance

## Overview

This document records the key architectural and implementation decisions made during the development of Tonsurance, particularly for the Phase 4 Hedged Insurance product. Each decision includes the context, alternatives considered, rationale, and trade-offs.

---

## 1. Two-Product Architecture

**Decision**: Maintain Core Insurance (Phase 1-3) and Hedged Insurance (Phase 4) as **separate product lines** with shared infrastructure, rather than merging them into a single unified system.

### Context
- Initial plan proposed merging hedging capabilities into the existing 3-tier vault system
- User feedback indicated preference for keeping traditional on-chain insurance distinct from hedged insurance
- Market research showed different user personas have different risk/pricing preferences

### Alternatives Considered

#### Option A: Unified System (Rejected)
```
Single Product:
- All policies automatically hedged (20% external)
- Swing pricing for all users
- Simplified architecture

Pros:
- Less code duplication
- Single pricing engine
- Easier to maintain

Cons:
- Forces all users into swing pricing model
- Retail users may prefer predictable premiums
- Cannot launch Core Insurance independently
```

#### Option B: Two Separate Products (Selected)
```
Core Insurance:
- 100% on-chain collateral
- Fixed APR-based pricing
- Predictable premiums
- Retail/Telegram focus

Hedged Insurance:
- 80% on-chain + 20% external hedges
- Dynamic swing pricing
- 15-30% lower premiums (when hedges cheap)
- Institutional/savvy DeFi users

Shared:
- Same 3-tier vaults (Primary, Secondary, TradFi)
- Same claims engine
- Same oracles
```

#### Option C: Hedging as Optional Feature (Rejected)
```
Single product with optional hedge flag:
- Users choose to enable hedging per policy

Pros:
- Maximum flexibility
- Single frontend/UX

Cons:
- Complex state management
- Confusing UX ("Should I hedge?")
- Difficult to communicate value prop
```

### Rationale
1. **Market Segmentation**: Different user personas want different products:
   - Retail Telegram users: Simple, fixed pricing, fully decentralized
   - DeFi natives: Willing to accept swing pricing for lower premiums
   - Institutions: Want off-chain hedge diversification

2. **Phased Launch**: Allows Core Insurance (Phase 1-3) to launch first, establish product-market fit, then introduce Hedged Insurance as premium tier

3. **Pricing Clarity**: Fixed vs. swing pricing are fundamentally different models:
   - Fixed: "0.8% APR, guaranteed"
   - Swing: "0.294% today (save 15%), but may change based on market"

4. **Risk Isolation**: Keeps fully on-chain product isolated from external API dependencies/risks

### Trade-offs
- ✅ **Pro**: Clear product differentiation, easier marketing
- ✅ **Pro**: Reduced complexity in each product
- ✅ **Pro**: Can iterate on Hedged Insurance without affecting Core
- ❌ **Con**: Some code duplication (2 policy factories)
- ❌ **Con**: More frontend complexity (2 purchase flows)

### Implementation Impact
```typescript
// contracts/
├── core/
│   ├── PolicyFactory.fc           # Fixed pricing
│   └── PremiumCalculator.fc       # APR-based
└── hedged/
    ├── HedgedPolicyFactory.fc     # Swing pricing
    └── PricingOracle.fc           # Real-time hedge costs

// frontend/
├── routes/
│   ├── core-insurance/
│   └── hedged-insurance/
```

**Status**: ✅ Approved by user (2025-10-09)

---

## 2. Swing Pricing Model

**Decision**: Implement **dynamic swing pricing** for Hedged Insurance based on real-time external hedge costs, updated every 5 seconds.

### Context
- Traditional insurance uses fixed premiums set quarterly/annually
- DeFi market conditions change rapidly (Polymarket odds, funding rates, etc.)
- Users expect transparency in pricing breakdown

### Alternatives Considered

#### Option A: Fixed Hybrid Pricing (Rejected)
```
Premium = Base (fixed) + Hedge Cost (fixed quarterly)

Pros:
- Predictable for users
- Simple to implement

Cons:
- Cannot pass savings to users when hedges cheap
- Overprices during favorable markets
- Less competitive vs. Core Insurance
```

#### Option B: Real-Time Swing Pricing (Selected)
```
Premium = Base + Σ(Hedge Costs from 3 venues)

Update frequency: 5 seconds
Cache duration: 30 seconds for quotes

Example:
Base: 80 TON (0.8% APR)
Polymarket: 120 TON (2.5% odds × 40% allocation)
Perpetuals: 35 TON (-0.5% funding × 40%)
Allianz: 45 TON ($4.50 per $1k × 20%)
Total: 280 TON (15% cheaper than Core's 350 TON)
```

#### Option C: Batched Daily Pricing (Rejected)
```
Update prices once per day at 00:00 UTC

Pros:
- Simpler caching
- Predictable for 24h

Cons:
- Stale prices during volatile markets
- Cannot capture intraday savings
- Users may game the system (buy when cheap)
```

### Rationale
1. **User Savings**: Can offer 15-30% discount when hedge markets favorable
2. **Transparency**: Users see exact breakdown of where premium goes
3. **Competitive Advantage**: Only product offering real-time hedge-based pricing
4. **Risk Management**: Ensures protocol always covers actual hedge costs

### Trade-offs
- ✅ **Pro**: Lower premiums during normal markets
- ✅ **Pro**: Transparent cost breakdown
- ✅ **Pro**: Incentivizes users to buy during favorable conditions
- ❌ **Con**: Premiums can spike during market stress
- ❌ **Con**: More complex UX (quote expires in 30s)
- ❌ **Con**: Infrastructure cost (real-time API polling)

### Technical Implementation
```typescript
// Update cycle
setInterval(async () => {
  // 1. Fetch hedge costs
  const polymarketOdds = await polymarket.getOdds('usdt-depeg');
  const perpFunding = await binance.getFundingRate('TONUSDT');
  const allianzQuote = await allianz.getQuote({ coverage: 10000 });

  // 2. Update on-chain oracle
  await pricingOracle.updateHedgePrices({
    polymarketOdds,
    perpFundingRate: perpFunding,
    allianzQuote
  });

  // 3. Broadcast via WebSocket
  wss.broadcast('premium-update', {
    basePremium: 80,
    hedgeCosts: { polymarket: 120, perpetuals: 35, allianz: 45 },
    totalPremium: 280,
    timestamp: Date.now()
  });
}, 5000); // Every 5 seconds
```

### UX Mitigation for Volatility
```typescript
// Frontend: Show price range + lock mechanism
<PremiumQuote>
  <CurrentPrice>280 TON</CurrentPrice>
  <Range24h>265-310 TON</Range24h>
  <LockButton>Lock this price for 30 seconds</LockButton>
</PremiumQuote>

// Backend: Honor locked quotes
if (quote.lockedAt && Date.now() - quote.lockedAt < 30000) {
  return quote.lockedPremium; // Honor old price
} else {
  return calculateCurrentPremium(); // Fetch fresh
}
```

**Status**: ✅ Approved (balances savings with UX)

---

## 3. 80/20 On-Chain/External Split

**Decision**: Allocate **80% of coverage to on-chain vaults** and **20% to external hedges** (Polymarket, Perps, Allianz).

### Context
- Need balance between decentralization and capital efficiency
- External hedges provide uncorrelated risk exposure
- On-chain collateral gives users confidence in payout ability

### Alternatives Considered

#### Option A: 100% On-Chain (Core Insurance)
```
Allocation:
- Primary Vault: 45%
- Secondary Vault: 20%
- TradFi Buffer: 10%
- Protocol Reserve: 25%

Capital Efficiency: 200%
Decentralization: ✅ Fully on-chain
Cost: Higher premiums (no hedge savings)
```

#### Option B: 50/50 Split (Rejected)
```
Allocation:
- On-Chain: 50% (Primary 30%, Secondary 15%, TradFi 5%)
- External Hedges: 50%

Capital Efficiency: 300%+
Decentralization: ⚠️ Half reliant on external systems
Cost: Lowest premiums

Cons:
- Too centralized (Polymarket/Allianz risk)
- User concern: "What if Polymarket doesn't pay out?"
- Regulatory risk (heavy reliance on tradfi)
```

#### Option C: 80/20 Split (Selected)
```
Allocation:
- On-Chain: 80% (Primary 45%, Secondary 20%, TradFi 10%, Reserve 25%)
- External Hedges: 20% (Polymarket 8%, Perps 8%, Allianz 4%)

Capital Efficiency: 250%
Decentralization: ✅ Majority on-chain
Cost: 15-30% lower than 100% on-chain
```

#### Option D: 90/10 Split (Rejected)
```
Cons:
- Minimal capital efficiency gain (only 225% vs 250%)
- Overhead of external integrations not worth 10% savings
```

### Rationale
1. **Trust**: 80% on-chain ensures users can always get majority of payout from smart contracts
2. **Efficiency**: 20% hedges provide meaningful capital efficiency boost (200% → 250%)
3. **Diversification**: External hedges are uncorrelated to on-chain pool risk
4. **Scalability**: Allows pool to cover $10M+ exposure with $4M capital

### Mathematical Justification
```
Scenario: $10M total coverage needed

Option A (100% on-chain):
- Required capital: $10M / 2.0 = $5M
- LP returns: 12% APR

Option C (80/20):
- On-chain: $8M / 2.0 = $4M
- External: $2M / 2.5 = $0.8M (hedges are 250% efficient)
- Total capital: $4.8M
- Savings: $200k (4% reduction)
- LP returns: 14% APR (better utilization)
```

### External Hedge Diversification
```
$2M total external hedges:

Polymarket (40% = $800k):
- Prediction markets
- Binary outcomes (depeg: YES/NO)
- High liquidity for stablecoin markets
- Risk: Platform risk, oracle manipulation

Perpetuals (40% = $800k):
- Short TON/USDT or stablecoin/USD
- Hedge against price volatility
- Funding rate arbitrage (negative funding = we earn)
- Risk: Exchange risk, liquidation risk

Allianz Parametric (20% = $400k):
- Traditional reinsurance
- Regulatory-compliant
- Diversifies away from crypto-native risk
- Risk: Higher cost, slower payout
```

### Trade-offs
- ✅ **Pro**: Balanced decentralization + efficiency
- ✅ **Pro**: User confidence (80% trustless)
- ✅ **Pro**: Meaningful premium reduction (15-30%)
- ❌ **Con**: Complexity of managing 3 external venues
- ❌ **Con**: External hedge counterparty risk (20% exposure)

**Status**: ✅ Approved (optimal balance)

---

## 4. Pricing Oracle Architecture

**Decision**: Use **on-chain oracle contract** updated by off-chain keepers every 5 seconds, rather than fetching hedge costs at policy creation time.

### Context
- Need real-time hedge costs to calculate swing premiums
- Smart contracts cannot make HTTP requests
- Want deterministic pricing (same inputs = same premium)

### Alternatives Considered

#### Option A: Off-Chain Pricing (Rejected)
```
Flow:
1. User requests quote from API
2. API fetches hedge costs, calculates premium
3. User approves premium via TON Connect
4. API submits transaction to HedgedPolicyFactory

Pros:
- No oracle needed
- Always fresh data

Cons:
- Centralized (user trusts API)
- Quote can change between steps 2-4
- No on-chain verification of pricing
```

#### Option B: On-Chain Oracle (Selected)
```
Architecture:
┌─────────────────┐
│ Keeper Service  │ (Off-chain)
│ - Fetches hedge │
│   costs every 5s│
│ - Updates oracle│
└────────┬────────┘
         │ update_hedge_prices()
         ▼
┌─────────────────┐
│ PricingOracle   │ (On-chain)
│ - Stores prices │
│ - Validates age │
│ - Calculates    │
└────────┬────────┘
         │ get_hedge_cost()
         ▼
┌─────────────────┐
│HedgedPolicyFactory│
│ - Reads oracle  │
│ - Creates policy│
└─────────────────┘

Pros:
- On-chain price verification
- Deterministic (testable)
- Decentralized (multiple keepers can update)

Cons:
- 5-second lag (not truly real-time)
- Keeper gas costs
```

#### Option C: Chainlink-Style Aggregation (Rejected)
```
Multiple oracles report prices, median is used

Pros:
- Highly decentralized
- Resistant to manipulation

Cons:
- Expensive (multiple keeper txs per update)
- Overkill for non-financial-critical use case
- Still need off-chain infrastructure
```

### Rationale
1. **Trustlessness**: Users can verify premium calculation on-chain
2. **Testability**: Can mock oracle in tests with deterministic data
3. **Efficiency**: Single keeper update vs. per-policy API calls
4. **Fallback**: Can run multiple keepers for redundancy

### Technical Implementation

**PricingOracle Contract**:
```func
global int last_update_time;
global cell hedge_prices;  ;; coverage_type -> (polymarket, perps, allianz)

() update_hedge_prices(
    int coverage_type,
    int polymarket_odds,     ;; Basis points (250 = 2.5%)
    int perp_funding_rate,   ;; Basis points per day (-50 = -0.5%)
    int allianz_quote        ;; Cents per $1000 (450 = $4.50)
) impure {
    ;; Only authorized keepers can update
    throw_unless(401, is_authorized_keeper(sender()));

    ;; Store prices
    hedge_prices~udict_set(64, coverage_type, begin_cell()
        .store_uint(polymarket_odds, 32)
        .store_int(perp_funding_rate, 32)
        .store_uint(allianz_quote, 32)
        .store_uint(now(), 32)  ;; Timestamp
        .end_cell().begin_parse()
    );

    last_update_time = now();
}

int calculate_hedge_cost(
    int coverage_type,
    int coverage_amount,
    int duration_days
) method_id {
    ;; Reject if prices too old (>5 min)
    throw_if(108, now() - last_update_time > 300);

    ;; Fetch prices
    (int poly, int perp, int allianz, int ts) = get_hedge_prices(coverage_type);

    ;; Calculate costs
    int poly_cost = muldiv(coverage_amount, poly * 40, 10000000);  ;; 40% allocation
    int perp_cost = muldiv(coverage_amount, perp * duration_days * 40, 10000000);
    int allianz_cost = muldiv(coverage_amount, allianz * 20, 10000000);

    return poly_cost + perp_cost + allianz_cost;
}
```

**Keeper Service**:
```typescript
class PricingOracleKeeper {
  async updatePrices() {
    // 1. Fetch from external APIs
    const [polyOdds, perpFunding, allianzQuote] = await Promise.all([
      this.polymarket.getOdds('usdt-depeg'),
      this.binance.getFundingRate('TONUSDT'),
      this.allianz.getQuote({ coverage: 10000, duration: 30 })
    ]);

    // 2. Convert to basis points
    const polyBps = Math.round(polyOdds * 10000);
    const perpBps = Math.round(perpFunding * 10000);
    const allianzBps = Math.round(allianzQuote * 100);

    // 3. Update oracle for each coverage type
    for (const coverageType of [1, 2, 3]) {  // DEPEG, EXPLOIT, BRIDGE
      await this.oracle.send(this.wallet, {
        value: toNano('0.05'),
        body: updateHedgePrices({
          coverageType,
          polymarketOdds: polyBps,
          perpFundingRate: perpBps,
          allianzQuote: allianzBps
        })
      });
    }

    console.log(`Oracle updated at ${new Date().toISOString()}`);
  }

  start() {
    setInterval(() => this.updatePrices(), 5000);  // Every 5 seconds
  }
}
```

### Staleness Protection
```func
;; In HedgedPolicyFactory.create_hedged_policy()
int hedge_cost = pricing_oracle.calculate_hedge_cost(coverage_type, amount, duration);

;; calculate_hedge_cost() will throw 108 if prices >5 min old
;; This prevents policies from being created with stale pricing
```

### Trade-offs
- ✅ **Pro**: On-chain verifiable pricing
- ✅ **Pro**: Deterministic (testable)
- ✅ **Pro**: Efficient (1 update serves all users)
- ❌ **Con**: 5-second lag (vs. instant API fetch)
- ❌ **Con**: Keeper operational cost (~$50/month for updates)
- ❌ **Con**: Centralization risk (single keeper = single point of failure)

### Mitigation: Multi-Keeper Architecture
```typescript
// Deploy 3 keepers with different permissions
const keeper1 = deployKeeper({ priority: 1, wallet: wallet1 });
const keeper2 = deployKeeper({ priority: 2, wallet: wallet2 });
const keeper3 = deployKeeper({ priority: 3, wallet: wallet3 });

// Each keeper tries to update, oracle accepts first valid update
// If keeper1 fails, keeper2 takes over
```

**Status**: ✅ Approved (best balance)

---

## 5. Hedge Execution Timing

**Decision**: Execute hedges **asynchronously after policy creation** via keeper services, rather than synchronously during policy creation transaction.

### Context
- TON's asynchronous actor model makes cross-contract calls in single tx complex
- External API calls (Polymarket, Binance, Allianz) can take 100-500ms each
- Want fast policy creation UX (<5 seconds)

### Alternatives Considered

#### Option A: Synchronous Hedge Execution (Rejected)
```
Flow:
1. User sends create_hedged_policy()
2. HedgedPolicyFactory creates policy
3. Factory calls PolymarketKeeper.execute_hedge()
4. Keeper makes HTTP request to Polymarket
5. Wait for response (500ms)
6. Keeper reports back to Factory
7. Factory confirms policy creation

Total time: ~2-3 seconds per hedge × 3 = 6-9 seconds

Cons:
- Slow UX (users wait 9 seconds)
- On-chain tx holds state during HTTP calls (expensive)
- Single API failure fails entire policy creation
```

#### Option B: Async Hedge Execution (Selected)
```
Flow:
1. User sends create_hedged_policy()
2. HedgedPolicyFactory creates policy immediately
3. Factory sends async messages to 3 keepers
4. Policy confirmed to user (~1 second)
5. Keepers execute hedges in background (5-10 seconds)
6. Keepers report back when done

User sees:
- Policy created ✅ (1 sec)
- Hedges executing ⏳ (5-10 sec)
- Hedges confirmed ✅ (total 6-11 sec)

Pros:
- Fast policy creation (1 sec)
- Parallel hedge execution
- Single hedge failure doesn't block policy
```

#### Option C: Batch Hedge Execution (Rejected)
```
Flow:
1. Policies created without hedges
2. Every 1 minute, batch executor hedges all pending policies

Pros:
- Most efficient (1 API call per minute)

Cons:
- Up to 1 min delay for hedge execution
- Complex batching logic
- Users exposed to price movement during delay
```

### Rationale
1. **UX**: Users see instant policy confirmation
2. **Reliability**: Single hedge failure doesn't fail policy creation
3. **Efficiency**: Hedges executed in parallel
4. **TON-Native**: Leverages TON's async message passing

### Technical Implementation

**HedgedPolicyFactory Contract**:
```func
() create_hedged_policy(...) impure {
    ;; 1. Create policy immediately
    int policy_id = next_policy_id;
    policies~udict_set(...);
    next_policy_id += 1;

    ;; 2. Calculate hedge allocation
    int total_hedge = muldiv(coverage_amount, 20, 100);  ;; 20% to hedges
    int poly_amount = muldiv(total_hedge, 40, 100);      ;; 40% to Polymarket
    int perp_amount = muldiv(total_hedge, 40, 100);
    int allianz_amount = muldiv(total_hedge, 20, 100);

    ;; 3. Send async messages to keepers
    send_hedge_order(polymarket_keeper, policy_id, 1, poly_amount);
    send_hedge_order(perp_keeper, policy_id, 2, perp_amount);
    send_hedge_order(allianz_keeper, policy_id, 3, allianz_amount);

    ;; 4. Emit event immediately
    emit_policy_created(policy_id, user_addr, coverage_amount);
}

() send_hedge_order(slice keeper_addr, int policy_id, int venue, int amount) impure {
    var msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(keeper_addr)
        .store_coins(100000000)  ;; 0.1 TON for gas
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::execute_hedge, 32)
        .store_uint(policy_id, 64)
        .store_uint(venue, 8)
        .store_coins(amount)
        .end_cell();
    send_raw_message(msg, 1);
}
```

**Keeper Service** (Off-Chain):
```typescript
class HedgeKeeperService {
  async handleHedgeOrder(message: HedgeOrderMessage) {
    const { policyId, venue, amount } = message;

    try {
      // 1. Execute hedge on external venue
      let result;
      switch (venue) {
        case 1: // Polymarket
          result = await this.polymarket.placeOrder({
            market: 'usdt-depeg',
            side: 'YES',
            size: fromNano(amount)
          });
          break;
        case 2: // Perpetuals
          result = await this.binance.openShort({
            symbol: 'TONUSDT',
            quantity: fromNano(amount)
          });
          break;
        case 3: // Allianz
          result = await this.allianz.bindCoverage({
            coverage: fromNano(amount),
            trigger: 'stablecoin-depeg'
          });
          break;
      }

      // 2. Report success to HedgeCoordinator
      await this.coordinator.send(this.wallet, {
        value: toNano('0.05'),
        body: registerHedge({
          policyId,
          venue,
          amount,
          externalId: result.orderId,
          status: 'FILLED'
        })
      });

      console.log(`✅ Hedge executed: Policy ${policyId}, Venue ${venue}`);

    } catch (error) {
      // 3. Report failure and retry
      console.error(`❌ Hedge failed: ${error.message}`);

      await this.coordinator.send(this.wallet, {
        value: toNano('0.05'),
        body: registerHedge({
          policyId,
          venue,
          amount,
          status: 'FAILED',
          error: error.message
        })
      });

      // Schedule retry in 30 seconds
      setTimeout(() => this.handleHedgeOrder(message), 30000);
    }
  }
}
```

**HedgeCoordinator Contract** (Tracks hedge status):
```func
global cell hedge_positions;  ;; policy_id -> (poly_status, perp_status, allianz_status)

() register_hedge(
    int policy_id,
    int venue,
    int amount,
    slice external_id,
    int status
) impure {
    ;; Only keepers can register
    throw_unless(401, is_authorized_keeper(sender()));

    ;; Update hedge position
    var position = hedge_positions~udict_get(64, policy_id);
    if (venue == 1) {  ;; Polymarket
        position = position.set_polymarket(amount, external_id, status);
    }
    ;; ... similar for venues 2, 3

    hedge_positions~udict_set(64, policy_id, position);

    ;; Emit event for frontend
    emit_hedge_registered(policy_id, venue, status);
}

(int, int, int) get_hedge_status(int policy_id) method_id {
    var position = hedge_positions~udict_get(64, policy_id);
    return (
        position.polymarket_status,  ;; 0=PENDING, 1=FILLED, 2=FAILED
        position.perp_status,
        position.allianz_status
    );
}
```

### Frontend UX

```tsx
function PolicyCreationFlow() {
  const [policy, setPolicy] = useState(null);
  const [hedgeStatus, setHedgeStatus] = useState({
    polymarket: 'PENDING',
    perpetuals: 'PENDING',
    allianz: 'PENDING'
  });

  // 1. Create policy (instant)
  async function createPolicy() {
    const result = await tonConnect.sendTransaction({
      to: hedgedPolicyFactory,
      value: toNano('100'),
      payload: createHedgedPolicyPayload(...)
    });

    setPolicy({ id: result.policyId, status: 'CREATED' });

    // 2. Subscribe to hedge status updates
    subscribeToHedgeStatus(result.policyId);
  }

  // 3. Real-time status updates via WebSocket
  function subscribeToHedgeStatus(policyId) {
    socket.on(`hedge-update-${policyId}`, (update) => {
      setHedgeStatus(prev => ({
        ...prev,
        [update.venue]: update.status
      }));
    });
  }

  return (
    <div>
      {policy && (
        <>
          <PolicyConfirmation policyId={policy.id} />

          <HedgeStatusTracker>
            <HedgeItem
              venue="Polymarket"
              status={hedgeStatus.polymarket}
              icon={hedgeStatus.polymarket === 'FILLED' ? '✅' : '⏳'}
            />
            <HedgeItem
              venue="Perpetuals"
              status={hedgeStatus.perpetuals}
              icon={hedgeStatus.perpetuals === 'FILLED' ? '✅' : '⏳'}
            />
            <HedgeItem
              venue="Allianz"
              status={hedgeStatus.allianz}
              icon={hedgeStatus.allianz === 'FILLED' ? '✅' : '⏳'}
            />
          </HedgeStatusTracker>
        </>
      )}
    </div>
  );
}
```

### Error Handling

**Scenario: Polymarket API Down**
```
1. User creates policy (✅ succeeds, $10k coverage)
2. PolymarketKeeper tries to hedge $2k (❌ API error 500)
3. Keeper reports FAILED to HedgeCoordinator
4. User sees: "Policy active, hedge pending retry"
5. Keeper retries after 30s (3 attempts total)
6. If all retries fail, alert admin + flag policy

Risk Mitigation:
- Policy still valid (80% on-chain collateral always available)
- User is under-hedged but not unprotected
- Admin can manually hedge via Polymarket UI
```

### Trade-offs
- ✅ **Pro**: Instant policy confirmation (1 sec)
- ✅ **Pro**: Parallel hedge execution (faster)
- ✅ **Pro**: Resilient to single hedge failure
- ❌ **Con**: More complex state management (track hedge status)
- ❌ **Con**: Users see "pending" status for 5-10 seconds
- ❌ **Con**: Requires WebSocket for real-time updates

**Status**: ✅ Approved (optimal for UX + reliability)

---

## 6. External Hedge Venue Selection

**Decision**: Integrate **3 external venues** with fixed allocation:
- **Polymarket**: 40% (prediction markets)
- **Perpetual Futures (Binance)**: 40% (price hedging)
- **Allianz Parametric**: 20% (tradfi reinsurance)

### Context
- Need diversified hedge sources (don't rely on single platform)
- Different venues have different strengths/weaknesses
- Want mix of crypto-native + traditional finance

### Alternatives Considered

#### Option A: Polymarket Only (Rejected)
```
Allocation: 100% prediction markets

Pros:
- Simple integration (1 API)
- Deep liquidity for stablecoin markets
- Crypto-native, permissionless

Cons:
- Single point of failure
- Platform risk (Polymarket shuts down?)
- Oracle manipulation risk
- Limited to binary outcomes
```

#### Option B: 3 Venues with Fixed Allocation (Selected)
```
Polymarket (40%):
- Binary prediction markets
- Best for: Depeg events (USDT < $0.98?)
- Liquidity: $500k-$5M per market
- Cost: 2-5% probability-based

Perpetuals (40%):
- Short TON/USDT or stablecoin pairs
- Best for: Price volatility hedging
- Liquidity: $100M+ (Binance)
- Cost: Funding rate (often negative = we earn)

Allianz Parametric (20%):
- Traditional parametric insurance
- Best for: Regulatory compliance, uncorrelated risk
- Liquidity: $10M+ capacity
- Cost: 4-6% (higher but stable)
```

#### Option C: Dynamic Venue Allocation (Rejected)
```
HedgeOptimizer decides allocation per hedge based on:
- Current costs
- Liquidity availability
- Historical performance

Pros:
- Most capital efficient
- Adapts to market conditions

Cons:
- Complex optimization logic
- Unpredictable for users
- May over-allocate to single venue
- Difficult to test/audit
```

### Rationale

**Polymarket (40%)**:
1. **Strengths**:
   - Purpose-built for binary event outcomes (perfect for depeg/exploit events)
   - High liquidity in crypto markets ($1M+ for stablecoin depegs)
   - Transparent on-chain settlement (UMA oracle)
   - Crypto-native, aligns with DeFi ethos

2. **Weaknesses**:
   - Platform risk (centralized CLOB)
   - Oracle manipulation (though UMA is robust)
   - Limited to discrete events (not continuous price movements)

3. **Use Cases**:
   - Depeg Insurance: Buy YES on "USDT drops below $0.98 in Q1 2025"
   - Exploit Insurance: Buy YES on "Major DeFi protocol exploited in Q1"
   - Bridge Insurance: Buy YES on "TON bridge hack in Q1"

**Perpetual Futures (40%)**:
1. **Strengths**:
   - Massive liquidity (Binance TONUSDT: $100M+ daily volume)
   - Funding rate arbitrage (often earn while hedging)
   - Continuous price exposure (not binary)
   - CEX insurance funds backstop (Binance SAFU)

2. **Weaknesses**:
   - Centralized exchange risk
   - Liquidation risk if leverage used
   - Basis risk (perp price != spot price)

3. **Use Cases**:
   - Price Hedging: Short TON if insuring TON depeg
   - Volatility Hedging: Dynamic position sizing based on VIX
   - Funding Arbitrage: Earn when funding negative

**Allianz Parametric (20%)**:
1. **Strengths**:
   - TradFi credibility (regulated reinsurer)
   - Uncorrelated to crypto market risk
   - Large capacity ($10M+)
   - Regulatory compliance (important for institutional LPs)

2. **Weaknesses**:
   - Expensive (4-6% vs 2-3% for crypto hedges)
   - Slower payout (3-5 days vs instant)
   - Requires KYC/legal contracts
   - Less transparent (off-chain processes)

3. **Use Cases**:
   - Regulatory Compliance: Show LPs we have tradfi reinsurance
   - Tail Risk: Cover black swan events beyond crypto hedge capacity
   - Marketing: "Backed by Allianz" builds user trust

### Why This Allocation?

**40/40/20 Split Rationale**:
```
Given $2M total external hedges:

Polymarket ($800k):
- Primary hedge for discrete events
- Best cost-efficiency (2.5% avg)
- Largest allocation to most suitable venue

Perpetuals ($800k):
- Equal to Polymarket for diversification
- Hedges continuous price risk
- Funding rate often negative (we earn)

Allianz ($400k):
- Smaller allocation due to high cost (4.5% avg)
- Still meaningful for tail risk
- 20% enough to market "tradfi backed"

Total Blended Cost:
(800k * 0.025) + (800k * 0.018) + (400k * 0.045) = $52.4k
Avg: 2.62% of $2M
```

### Venue Integration Complexity

**Polymarket**:
```typescript
// Easiest: RESTful API + WebSocket
await polymarket.placeOrder({
  market: 'usdt-depeg-q1-2025',
  side: 'YES',
  size: 10000,
  price: 0.025  // Limit order at 2.5% implied probability
});
```

**Perpetuals (Binance)**:
```typescript
// Medium: Futures API + Signature Auth
await binance.futuresOrder({
  symbol: 'TONUSDT',
  side: 'SELL',
  type: 'MARKET',
  quantity: 5000,
  leverage: 5
});
```

**Allianz**:
```typescript
// Hardest: Enterprise API + Legal Contracts
// 1. Get quote (API)
const quote = await allianz.getQuote({
  trigger: 'stablecoin-depeg',
  coverage: 10000,
  duration: 30
});

// 2. Legal review (manual, 1-2 days first time)
// 3. Bind coverage (API)
const policy = await allianz.bindCoverage({
  quoteId: quote.id
});
```

### Trade-offs
- ✅ **Pro**: Diversified (no single point of failure)
- ✅ **Pro**: Balanced cost (2.62% avg)
- ✅ **Pro**: Crypto + tradfi mix (appeals to all LP types)
- ✅ **Pro**: Complementary strengths (discrete + continuous + tail risk)
- ❌ **Con**: 3x integration complexity vs. single venue
- ❌ **Con**: Requires managing 3 sets of API keys/contracts
- ❌ **Con**: More operational overhead (monitor 3 platforms)

### Future: Dynamic Allocation (Phase 5)

```typescript
// HedgeOptimizer.optimizeAllocation() - Future
const allocation = await optimizer.optimize({
  totalHedge: 10000,
  constraints: {
    minPerVenue: 0.15,  // Min 15% per venue
    maxPerVenue: 0.50,  // Max 50% per venue
    targetCost: 0.025   // Target <2.5% total cost
  },
  marketData: {
    polymarket: { cost: 0.030, liquidity: 100000, confidence: 0.9 },
    perpetuals: { cost: 0.018, liquidity: 500000, confidence: 0.95 },
    allianz: { cost: 0.045, liquidity: 1000000, confidence: 1.0 }
  }
});

// Result: { polymarket: 2500, perpetuals: 5000, allianz: 2500 }
// Explanation: Perps cheapest + highest liquidity → 50% allocation
```

**Status**: ✅ Approved (Phase 4 fixed allocation, Phase 5 dynamic)

---

## 7. Claim Payout Split

**Decision**: For Hedged Insurance claims, pay **80% from on-chain vaults** and **20% from liquidated external hedges**, settling both concurrently.

### Context
- Need fast payout UX (users want funds immediately)
- External hedge liquidation can take 30s-5min
- Want to maintain 80/20 allocation consistency

### Alternatives Considered

#### Option A: Sequential Payout (Rejected)
```
Flow:
1. Claim approved
2. Pay 80% from Primary Vault immediately
3. Wait for hedge liquidation (30s-5min)
4. Pay remaining 20% after hedges settled

Pros:
- Simple logic
- Users get 80% fast

Cons:
- Poor UX (2 separate transactions, confusion)
- Users may think they're missing 20%
- Complexity tracking partial payouts
```

#### Option B: Wait for Full Hedge Settlement (Rejected)
```
Flow:
1. Claim approved
2. Liquidate all 3 hedges
3. Wait for all to complete (1-5 min)
4. Pay 100% in single transaction

Pros:
- Single transaction (clean UX)
- Guaranteed full payout

Cons:
- Slow (users wait 1-5 min)
- On-chain capital locked during hedge settlement
- Bad UX (users expect instant payout)
```

#### Option C: Concurrent Payout + Reconciliation (Selected)
```
Flow:
1. Claim approved
2. IMMEDIATELY pay 100% from on-chain vaults (80% Primary + 20% Reserve)
3. SIMULTANEOUSLY trigger hedge liquidation
4. When hedges settle, refill Reserve vault from proceeds

Timeline:
- User receives full payout: <5 seconds (on-chain tx)
- Hedge liquidation completes: 30s-5 min (background)
- Reserve refilled: 1-6 min total

Result:
- User sees instant payout (great UX)
- Protocol self-heals via hedge proceeds
- No tracking of partial payments
```

### Rationale
1. **UX**: Users get full payout instantly (no waiting for hedges)
2. **Simplicity**: Single transaction, clean accounting
3. **Capital Efficiency**: Reserve vault acts as float for hedge settlement lag
4. **Risk**: Minimal (hedges settle within 5 min, Reserve has 25% buffer)

### Technical Implementation

**ClaimsEngine Contract**:
```func
() approve_claim(int claim_id) impure {
    ;; Only admin can approve
    throw_unless(401, is_admin(sender()));

    var claim = claims~udict_get(64, claim_id);
    throw_unless(404, claim.found?);

    slice user_addr = claim.user_addr;
    int payout_amount = claim.coverage_amount;
    int policy_id = claim.policy_id;

    ;; Check if hedged policy
    int is_hedged = policy.is_hedged;

    if (is_hedged) {
        ;; 1. Pay 80% from Primary Vault
        send_payout(primary_vault, user_addr, muldiv(payout_amount, 80, 100));

        ;; 2. Pay 20% from Reserve (temporary float)
        send_payout(reserve_vault, user_addr, muldiv(payout_amount, 20, 100));

        ;; 3. Trigger hedge liquidation (async)
        send_liquidate_hedges(hedge_coordinator, policy_id, payout_amount);

    } else {
        ;; Core Insurance: Pay 100% from on-chain vaults only
        send_payout(primary_vault, user_addr, payout_amount);
    }

    ;; Mark claim as paid
    claim.status = STATUS_PAID;
    claims~udict_set(64, claim_id, claim);
}

() send_liquidate_hedges(slice coordinator, int policy_id, int amount) impure {
    var msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(coordinator)
        .store_coins(50000000)  ;; 0.05 TON gas
        .store_uint(0, 107)
        .store_uint(op::liquidate_hedges, 32)
        .store_uint(policy_id, 64)
        .store_coins(amount)
        .end_cell();
    send_raw_message(msg, 1);
}
```

**HedgeCoordinator Contract**:
```func
() liquidate_hedges(int policy_id, int payout_amount) impure {
    ;; Fetch hedge positions
    var position = hedge_positions~udict_get(64, policy_id);

    ;; Send liquidation orders to all 3 keepers
    send_liquidate(polymarket_keeper, policy_id, position.poly_amount);
    send_liquidate(perp_keeper, policy_id, position.perp_amount);
    send_liquidate(allianz_keeper, policy_id, position.allianz_amount);

    ;; Track liquidation
    liquidations~udict_set(64, policy_id, begin_cell()
        .store_uint(now(), 32)
        .store_coins(payout_amount)
        .store_uint(STATUS_PENDING, 8)
        .end_cell().begin_parse()
    );
}

;; Keeper reports back when liquidation complete
() report_liquidation(int policy_id, int venue, int proceeds) impure {
    throw_unless(401, is_authorized_keeper(sender()));

    var liquidation = liquidations~udict_get(64, policy_id);

    ;; Update proceeds
    if (venue == 1) { liquidation.poly_proceeds = proceeds; }
    if (venue == 2) { liquidation.perp_proceeds = proceeds; }
    if (venue == 3) { liquidation.allianz_proceeds = proceeds; }

    ;; Check if all 3 complete
    if (all_liquidations_complete(liquidation)) {
        ;; Refill Reserve vault
        int total_proceeds = liquidation.poly_proceeds +
                            liquidation.perp_proceeds +
                            liquidation.allianz_proceeds;

        send_refill(reserve_vault, total_proceeds);

        liquidation.status = STATUS_COMPLETE;
    }

    liquidations~udict_set(64, policy_id, liquidation);
}
```

**Keeper Service** (Polymarket Liquidation Example):
```typescript
class PolymarketLiquidationKeeper {
  async liquidatePosition(message: LiquidateMessage) {
    const { policyId, amount } = message;

    try {
      // 1. Fetch position details
      const position = await this.coordinator.getHedgePosition(policyId);
      const externalId = position.polymarketOrderId;

      // 2. Sell position on Polymarket (opposite of entry)
      const result = await this.polymarket.placeOrder({
        market: 'usdt-depeg-q1-2025',
        side: 'NO',  // Sell YES position
        size: fromNano(amount),
        type: 'MARKET'  // Instant execution
      });

      console.log(`Liquidated Polymarket position: ${result.proceeds} USDC`);

      // 3. Convert USDC to TON
      const tonProceeds = await this.swap.usdcToTON(result.proceeds);

      // 4. Report proceeds to HedgeCoordinator
      await this.coordinator.send(this.wallet, {
        value: toNano('0.05'),
        body: reportLiquidation({
          policyId,
          venue: 1,  // Polymarket
          proceeds: toNano(tonProceeds.toString())
        })
      });

    } catch (error) {
      console.error(`Liquidation failed: ${error.message}`);

      // Retry up to 3 times
      if (this.retryCount < 3) {
        this.retryCount++;
        setTimeout(() => this.liquidatePosition(message), 30000);
      } else {
        // Alert admin for manual intervention
        await this.alertAdmin({
          policyId,
          venue: 'Polymarket',
          error: error.message
        });
      }
    }
  }
}
```

### Reserve Vault Float Management

**Normal State**:
```
Reserve Vault: $2.5M (25% of $10M pool)
Hedge Proceeds Float: $0
Available: $2.5M
```

**During Claim Payout** (User receives full $10k instantly):
```
t=0s: Claim approved
- Primary pays $8k → User
- Reserve pays $2k → User (temporary float)
- Reserve balance: $2.498M
- Liquidation triggered

t=30s: Polymarket settles
- Proceeds: $800 (slippage: $8 → $800)
- Reserve balance: $2.4988M

t=1min: Perps settle
- Proceeds: $850 (profit from negative funding)
- Reserve balance: $2.4996M

t=3min: Allianz settles
- Proceeds: $400
- Reserve balance: $2.5006M (fully refilled + $6 profit)

Result: Reserve refilled, user paid instantly, protocol net +$6
```

**Worst Case** (Hedge Slippage):
```
Total proceeds: $1,800 (instead of $2,000)
Shortfall: $200

Reserve absorbs loss: $2.5M - $200 = $2.4998M
Still 24.998% of pool (within tolerance)

After 100 claims with 10% avg slippage:
Reserve: $2.5M - (100 * $200) = $2.48M
Still healthy, no intervention needed
```

### Trade-offs
- ✅ **Pro**: Instant full payout (best UX)
- ✅ **Pro**: Simple accounting (no partial tracking)
- ✅ **Pro**: Self-healing (Reserve refills automatically)
- ✅ **Pro**: Hedge slippage absorbed by Reserve (designed for this)
- ❌ **Con**: Requires Reserve float (capital inefficiency)
- ❌ **Con**: Risk if massive claim + hedge liquidation fails (mitigated by retries + admin alerts)

### Risk Mitigation

**If All Hedges Fail to Liquidate**:
```typescript
// After 3 retry attempts (total 5 min), keeper alerts admin
await adminAlert.send({
  severity: 'HIGH',
  message: 'Hedge liquidation failed for policy 123',
  action: 'MANUAL_INTERVENTION',
  details: {
    policyId: 123,
    venue: 'Polymarket',
    expectedProceeds: toNano('800'),
    error: 'API timeout after 3 retries'
  }
});

// Admin manually liquidates via Polymarket UI
// Then manually triggers reserve refill via admin panel
```

**Reserve Buffer Analysis**:
```
Reserve: $2.5M (25% of $10M pool)
Max simultaneous claims: Assume 10 policies ($10k each = $100k payout)
Float needed: 10 * $2k (20% each) = $20k
Percentage: $20k / $2.5M = 0.8%

Reserve can handle 125 simultaneous claims before depletion
This is 125x above expected peak (black swan scenario)
```

**Status**: ✅ Approved (optimal UX + risk balance)

---

## 8. Technology Stack

**Decision**: Use **TON Blockchain + Blueprint + TypeScript** for smart contracts and services, with **React + TON Connect** for frontend.

### Blockchain Layer

**TON Blockchain**:
- Rationale: Telegram integration (800M users), low fees ($0.01/tx), high TPS (1000+)
- FunC for smart contracts (stack-based, gas-efficient)
- Asynchronous actor model (suited for multi-party distribution)

**Blueprint Framework**:
- Official TON development toolkit
- TypeScript wrappers for contracts
- Integrated testing (TON Sandbox)
- Deployment scripts

### Backend Services

**TypeScript/Node.js**:
- Hedging services (RiskCalculator, HedgeOptimizer, Connectors)
- Keeper services (PricingOracle updates, hedge execution)
- REST API + WebSocket server

**Key Libraries**:
```json
{
  "@ton/ton": "^13.0.0",
  "@ton/core": "^0.56.0",
  "@ton/sandbox": "^0.20.0",
  "express": "^4.18.0",
  "socket.io": "^4.7.0",
  "nock": "^13.5.0",  // API mocking
  "jest": "^29.7.0"
}
```

### Frontend

**React + Vite**:
- Fast dev server
- TypeScript support
- Component-based UI

**TON Connect**:
- Wallet connection (Tonkeeper, TonHub, OpenMask)
- Transaction signing
- Multi-wallet support

**UI Libraries**:
```json
{
  "react": "^18.3.0",
  "vite": "^5.0.0",
  "@tonconnect/ui-react": "^2.0.0",
  "recharts": "^2.12.0",  // Charts for analytics
  "tailwindcss": "^3.4.0"
}
```

### Infrastructure

**Database**:
- PostgreSQL (policy/claim records, hedge positions)
- Redis (caching for premium quotes, WebSocket state)

**Monitoring**:
- Prometheus + Grafana (metrics)
- Sentry (error tracking)
- Custom alerts (hedge failures, oracle staleness)

### External APIs

```typescript
// Polymarket
import { PolymarketClient } from '@polymarket/sdk';

// Binance Futures
import { USDMClient } from 'binance';

// Allianz (Enterprise API - custom integration)
import { AllianzParametricAPI } from '@/integrations/allianz';
```

**Status**: ✅ Approved (leverages TON ecosystem)

---

## 9. Deployment Strategy

**Decision**: Deploy contracts to **TON Testnet** first with full test suite, then mainnet after 2-week beta period.

### Phase 4 Deployment Sequence

**Week 1-2: Testnet Deployment**
```bash
# 1. Deploy core contracts
npx blueprint deploy PricingOracle --testnet
npx blueprint deploy HedgeCoordinator --testnet
npx blueprint deploy HedgedPolicyFactory --testnet

# 2. Deploy keeper wallets
npx blueprint run setup-keepers --testnet

# 3. Start keeper services (connected to mock APIs)
npm run keepers:start -- --network=testnet --mock-apis

# 4. Run E2E tests on testnet
npm run test:e2e:testnet

# 5. Beta testing (invite 10 users, $100 max coverage)
npm run beta:invite -- --users=10 --max-coverage=100
```

**Week 3: Mainnet Deployment**
```bash
# 1. Audit review (external security firm)
# 2. Deploy to mainnet
npx blueprint deploy PricingOracle --mainnet
npx blueprint deploy HedgeCoordinator --mainnet
npx blueprint deploy HedgedPolicyFactory --mainnet

# 3. Connect to real external APIs
npm run keepers:start -- --network=mainnet --api-keys=production

# 4. Gradual rollout:
# - Week 1: $10k max coverage per policy
# - Week 2: $50k max
# - Week 3: $100k max (full launch)
```

### Upgrade Strategy

**Contracts** (Immutable by default):
- Use proxy pattern for upgradability (admin-controlled)
- 48-hour timelock on upgrades (users can exit if disagree)

**Off-Chain Services** (Rolling updates):
- Blue-green deployment for keepers
- Canary releases (10% traffic first, then 100%)

**Status**: ✅ Approved (safe, gradual rollout)

---

## 10. Security Considerations

### Smart Contract Security

**Audits**:
- External audit before mainnet (CertiK/Trail of Bits)
- Focus areas: Premium calculation, claim payout logic, hedge coordination
- Budget: $50k-$100k for comprehensive audit

**Access Control**:
```func
;; Only admin can approve claims
throw_unless(401, is_admin(sender()));

;; Only authorized keepers can update oracle
throw_unless(401, is_authorized_keeper(sender()));

;; Only HedgedPolicyFactory can register policies
throw_unless(401, sender() == factory_address);
```

**Reentrancy Protection**:
```func
;; Mark claim as paid BEFORE sending payout
claim.status = STATUS_PAID;
claims~udict_set(64, claim_id, claim);

;; Then send funds
send_payout(vault, user, amount);
```

**Oracle Staleness**:
```func
;; Reject if prices >5 min old
throw_if(108, now() - last_update_time > 300);
```

### Off-Chain Security

**API Key Management**:
- Store in AWS Secrets Manager (not env vars)
- Rotate every 90 days
- Separate keys for testnet/mainnet

**Keeper Wallet Security**:
- Hardware wallets for mainnet keepers
- Multi-sig for admin functions (3-of-5)
- Rate limiting (max 10 updates/min to prevent spam)

**DDoS Protection**:
- Cloudflare for frontend/API
- Rate limiting: 100 req/min per IP
- WebSocket connection limits: 1000 concurrent

### Operational Security

**Monitoring**:
```typescript
// Alert if oracle not updated for >10 min
if (Date.now() - lastOracleUpdate > 600000) {
  alertAdmin('Oracle stale: >10 min since last update');
}

// Alert if hedge execution failing >20%
if (hedgeFailureRate > 0.2) {
  alertAdmin('High hedge failure rate: Check API connectivity');
}

// Alert if Reserve depleting
if (reserveBalance < reserveTarget * 0.8) {
  alertAdmin('Reserve low: May need manual refill');
}
```

**Incident Response**:
1. **Oracle Failure**: Switch to backup keeper within 5 min
2. **Hedge API Down**: Queue orders, execute when restored
3. **Smart Contract Bug**: Pause new policies, allow existing claims
4. **Exploit Detected**: Emergency shutdown (admin multisig)

**Status**: ✅ Security-first approach approved

---

## Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Product Architecture** | Two separate products (Core + Hedged) | Market segmentation, phased launch, pricing clarity |
| **Pricing Model** | Real-time swing pricing (5s updates) | User savings, transparency, competitive advantage |
| **Collateral Split** | 80% on-chain, 20% external hedges | Balance decentralization + capital efficiency |
| **Oracle Design** | On-chain oracle updated by keepers | Trustless pricing, deterministic, testable |
| **Hedge Execution** | Asynchronous (after policy creation) | Fast UX, parallel execution, resilient |
| **Hedge Venues** | Polymarket 40%, Perps 40%, Allianz 20% | Diversification, complementary strengths |
| **Claim Payout** | Concurrent (80% vault + 20% reserve, then refill) | Instant full payout, clean UX, self-healing |
| **Tech Stack** | TON + Blueprint + TypeScript + React | Telegram integration, low fees, modern tooling |
| **Deployment** | Testnet → 2 week beta → Mainnet gradual rollout | Safe, tested, audited |
| **Security** | External audit + multi-sig + monitoring | Production-ready, minimize risk |

---

## Decision Log

All future design decisions should be documented here with:
1. **Date**: When decision was made
2. **Context**: Why decision was needed
3. **Options**: Alternatives considered (with pros/cons)
4. **Choice**: What was selected
5. **Rationale**: Why this option was best
6. **Trade-offs**: What we gained/lost
7. **Status**: Approved/Rejected/Pending

This document should be updated whenever architectural changes are proposed.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-09
**Author**: Claude Code (Tonsurance Development Team)
**Status**: ✅ Comprehensive design decisions documented
