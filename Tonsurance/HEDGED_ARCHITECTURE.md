# Tonsurance: Hedged Insurance Architecture

**Version:** 1.0
**Last Updated:** October 2025
**Status:** Phase 4 System Design
**Owner:** Engineering Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Component Specifications](#component-specifications)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [API Specifications](#api-specifications)
6. [Integration Points](#integration-points)
7. [Scalability & Performance](#scalability--performance)

---

## Executive Summary

This document defines the complete architecture for **Tonsurance Hedged Insurance** - a premium-tier DeFi insurance product that combines on-chain collateral (80%) with external market hedges (20%) to enable dynamic "swing pricing" that adjusts based on real-time market conditions.

**Key Innovation**: By hedging insurance risk across multiple venues (Polymarket prediction markets, perpetual futures, and Allianz parametric insurance), we can offer 15-30% lower premiums when market conditions are favorable while maintaining 99.5% payout confidence.

---

## System Architecture

### High-Level Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                      USER INTERFACE LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │Core Insurance│  │Hedged        │  │Admin         │           │
│  │Purchase UI   │  │Insurance UI  │  │Dashboard     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │Policy Engine │  │Claims Engine │  │Pricing Oracle│           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN LAYER (TON)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │Core Insurance│  │Hedged Policy │  │Hedge         │           │
│  │Contracts     │  │Factory       │  │Coordinator   │           │
│  │(Phase 1-3)   │  │(Phase 4)     │  │(Phase 4)     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │3-Tier Vaults │  │Pricing Oracle│  │Claims        │           │
│  │(80% capital) │  │              │  │Processor     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│                    HEDGING EXECUTION LAYER                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │Risk          │  │Hedge Ratio   │  │Rebalancing   │           │
│  │Calculator    │  │Optimizer     │  │Engine        │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│                    EXTERNAL HEDGE VENUES (20%)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │Polymarket    │  │Perpetuals    │  │Allianz       │           │
│  │(Prediction   │  │(Binance,     │  │(Parametric   │           │
│  │Markets)      │  │Hyperliquid)  │  │Insurance)    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────────┘
```

### Capital Allocation Strategy

```
Total Insurance Capital: $10M
├─ On-Chain (80%): $8M
│  ├─ Primary Vault (45%): $4.5M (crypto LPs, first loss)
│  ├─ Secondary Vault (20%): $2M (SURE stakers, second loss)
│  ├─ TradFi Buffer (10%): $1M (institutions, third loss)
│  └─ Protocol/Reserve (5%): $0.5M
│
└─ Off-Chain Hedges (20%): $2M
   ├─ Polymarket (40% of hedges): $0.8M
   ├─ Perpetuals (40% of hedges): $0.8M
   └─ Allianz Parametric (20% of hedges): $0.4M
```

**Capital Efficiency**:
- **Traditional model**: $10M capital → $6.67M coverage (150% ratio)
- **Tonsurance Core**: $10M capital → $15M coverage (200% ratio via tranching)
- **Tonsurance Hedged**: $10M capital → $20M+ coverage (250%+ ratio with hedges)

---

## Component Specifications

### 1. Smart Contracts (TON Blockchain)

#### 1.1 HedgedPolicyFactory Contract

**Location**: `contracts/hedged_policy_factory.fc`

**Purpose**: Create insurance policies with dynamic swing pricing based on real-time hedge costs

**Storage**:
```func
global slice base_policy_factory_addr;  // Address of Core Insurance PolicyFactory
global slice pricing_oracle_addr;        // Address of PricingOracle contract
global slice hedge_coordinator_addr;     // Address of HedgeCoordinator
global int minimum_hedge_ratio;          // 20% (basis points: 2000)
global int protocol_margin;              // 5% (basis points: 500)
global cell active_hedged_policies;      // Dict: policy_id => hedge_data
global int total_hedged_policies;
global int total_hedged_capital;
```

**Key Functions**:

**create_hedged_policy()**
```func
() create_hedged_policy(
    slice user_addr,
    int coverage_type,      // 1=USDT depeg, 2=exploit, 3=bridge
    int coverage_amount,    // Amount in nanograms
    int duration_days       // 30, 90, or 180
) impure {
    // 1. Calculate base premium from Core Insurance model
    int base_premium = call_policy_factory_calculate_premium(
        coverage_type,
        coverage_amount,
        duration_days
    );

    // 2. Query PricingOracle for current hedge costs
    (int polymarket_cost, int perp_cost, int allianz_cost) =
        query_pricing_oracle(coverage_type, coverage_amount, duration_days);

    // 3. Calculate total hedge cost
    int total_hedge_cost = polymarket_cost + perp_cost + allianz_cost;

    // 4. Calculate swing premium
    // Formula: base + hedge_cost + margin
    int swing_premium = base_premium + total_hedge_cost;
    swing_premium = swing_premium + muldiv(swing_premium, protocol_margin, 10000);

    // 5. Verify user payment
    throw_unless(400, msg_value >= swing_premium);

    // 6. Create underlying policy via Base PolicyFactory
    int policy_id = forward_to_base_factory(
        user_addr,
        coverage_type,
        coverage_amount,
        duration_days,
        base_premium
    );

    // 7. Store hedge metadata
    cell hedge_data = begin_cell()
        .store_uint(policy_id, 64)
        .store_coins(total_hedge_cost)
        .store_coins(polymarket_cost)
        .store_coins(perp_cost)
        .store_coins(allianz_cost)
        .store_uint(now(), 64)
        .store_uint(0, 1)  // hedges_executed flag
        .end_cell();

    active_hedged_policies~udict_set(64, policy_id, hedge_data.begin_parse());

    // 8. Trigger hedge execution (off-chain keepers listen for event)
    emit_log("HEDGE_REQUESTED", policy_id, total_hedge_cost);

    // 9. Send hedge orders to HedgeCoordinator
    send_hedge_orders(policy_id, polymarket_cost, perp_cost, allianz_cost);

    total_hedged_policies += 1;
    total_hedged_capital += coverage_amount;

    save_data();
}
```

**Events**:
- `HEDGE_REQUESTED(policy_id, total_cost)`
- `HEDGED_POLICY_CREATED(policy_id, user, premium, coverage_amount)`
- `HEDGE_EXECUTION_CONFIRMED(policy_id, venue, confirmation_hash)`

---

#### 1.2 PricingOracle Contract

**Location**: `contracts/pricing_oracle.fc`

**Purpose**: Aggregate and serve real-time hedge costs from external venues

**Storage**:
```func
global cell hedge_prices;       // Dict: coverage_type => price_data
global slice oracle_keeper_addr; // Authorized keeper address
global int last_update_time;
global int price_validity_window;  // 600 seconds (10 minutes)
global cell historical_prices;   // For analytics
```

**Price Data Structure**:
```func
cell price_data = begin_cell()
    .store_uint(polymarket_odds, 16)      // Basis points (e.g., 1200 = 12%)
    .store_uint(perp_funding_rate, 16)    // Daily rate in basis points
    .store_uint(allianz_quote, 32)        // Premium per $1000 coverage
    .store_uint(timestamp, 64)            // Unix timestamp
    .store_uint(confidence_score, 8)      // 0-100, data quality metric
    .end_cell();
```

**Key Functions**:

**update_hedge_prices()**
```func
() update_hedge_prices(
    int coverage_type,
    int polymarket_odds,
    int perp_funding_rate,
    int allianz_quote
) impure {
    // Only oracle keeper can update
    throw_unless(401, equal_slices(sender(), oracle_keeper_addr));

    load_data();

    // Store new prices
    cell new_price_data = begin_cell()
        .store_uint(polymarket_odds, 16)
        .store_uint(perp_funding_rate, 16)
        .store_uint(allianz_quote, 32)
        .store_uint(now(), 64)
        .store_uint(100, 8)  // Confidence = 100 (verified data)
        .end_cell();

    hedge_prices~udict_set(8, coverage_type, new_price_data.begin_parse());
    last_update_time = now();

    // Archive old prices for historical analysis
    archive_price(coverage_type, new_price_data);

    save_data();

    emit_log("PRICES_UPDATED", coverage_type, polymarket_odds);
}
```

**calculate_hedge_cost()**
```func
int calculate_hedge_cost(
    int coverage_type,
    int coverage_amount,
    int duration_days
) method_id {
    load_data();

    // Retrieve latest prices
    (slice price_data, int found) = hedge_prices.udict_get?(8, coverage_type);
    throw_unless(404, found);  // Price data not found

    int polymarket_odds = price_data~load_uint(16);
    int perp_funding = price_data~load_uint(16);
    int allianz_quote = price_data~load_uint(32);
    int timestamp = price_data~load_uint(64);

    // Verify price freshness
    throw_unless(410, (now() - timestamp) <= price_validity_window);

    // Calculate costs for each venue

    // Polymarket: coverage * odds / 10000
    int poly_cost = muldiv(coverage_amount, polymarket_odds, 10000);

    // Perpetuals: coverage * funding_rate * days / 10000
    int perp_cost = muldiv(coverage_amount * duration_days, perp_funding, 10000);

    // Allianz: coverage * quote / 1000
    int allianz_cost = muldiv(coverage_amount, allianz_quote, 1000);

    // Total hedge cost (20% of coverage via external hedges)
    int total_cost = poly_cost + perp_cost + allianz_cost;

    // Divide by 5 because we're only hedging 20% (1/5) externally
    return total_cost / 5;
}
```

---

#### 1.3 HedgeCoordinator Contract

**Location**: `contracts/hedge_coordinator.fc`

**Purpose**: Coordinate hedge execution across multiple external venues

**Storage**:
```func
global cell pending_hedges;      // Dict: policy_id => hedge_orders
global cell executed_hedges;     // Dict: policy_id => execution_proof
global slice polymarket_keeper;
global slice perps_keeper;
global slice allianz_keeper;
global int total_hedges_requested;
global int total_hedges_executed;
```

**Hedge Order Structure**:
```func
cell hedge_order = begin_cell()
    .store_uint(policy_id, 64)
    .store_uint(coverage_type, 8)
    .store_coins(polymarket_allocation)
    .store_coins(perp_allocation)
    .store_coins(allianz_allocation)
    .store_uint(request_time, 64)
    .store_uint(execution_deadline, 64)  // request_time + 5 minutes
    .store_uint(0, 3)  // Execution flags (Poly, Perp, Allianz)
    .end_cell();
```

**Key Functions**:

**execute_hedges()**
```func
() execute_hedges(
    int policy_id,
    int coverage_type,
    int polymarket_allocation,
    int perp_allocation,
    int allianz_allocation
) impure {
    load_data();

    // Create hedge order
    cell hedge_order = begin_cell()
        .store_uint(policy_id, 64)
        .store_uint(coverage_type, 8)
        .store_coins(polymarket_allocation)
        .store_coins(perp_allocation)
        .store_coins(allianz_allocation)
        .store_uint(now(), 64)
        .store_uint(now() + 300, 64)  // 5-minute deadline
        .store_uint(0, 3)  // Execution flags
        .end_cell();

    pending_hedges~udict_set(64, policy_id, hedge_order.begin_parse());

    total_hedges_requested += 1;

    save_data();

    // Emit events for off-chain keepers
    emit_log("POLYMARKET_HEDGE_REQUESTED", policy_id, polymarket_allocation);
    emit_log("PERP_HEDGE_REQUESTED", policy_id, perp_allocation);
    emit_log("ALLIANZ_HEDGE_REQUESTED", policy_id, allianz_allocation);
}
```

**confirm_hedge_execution()**
```func
() confirm_hedge_execution(
    int policy_id,
    int venue,  // 1=Polymarket, 2=Perps, 3=Allianz
    slice execution_proof  // Transaction hash or API confirmation
) impure {
    // Verify caller is authorized keeper
    if (venue == 1) {
        throw_unless(403, equal_slices(sender(), polymarket_keeper));
    } elseif (venue == 2) {
        throw_unless(403, equal_slices(sender(), perps_keeper));
    } elseif (venue == 3) {
        throw_unless(403, equal_slices(sender(), allianz_keeper));
    }

    load_data();

    // Load pending hedge order
    (slice hedge_order, int found) = pending_hedges.udict_get?(64, policy_id);
    throw_unless(404, found);

    // Update execution flags
    int execution_flags = hedge_order~skip_bits(64 + 8 + 3*128 + 64*2)~load_uint(3);
    execution_flags = execution_flags | (1 << (venue - 1));  // Set bit for this venue

    // Update order
    // ... (update logic)

    // Check if all hedges executed
    if (execution_flags == 0b111) {  // All 3 venues confirmed
        // Move to executed_hedges
        executed_hedges~udict_set(64, policy_id, hedge_order);
        pending_hedges~udict_delete?(64, policy_id);

        total_hedges_executed += 1;

        emit_log("ALL_HEDGES_EXECUTED", policy_id);
    }

    save_data();
}
```

---

### 2. Off-Chain Components

#### 2.1 Risk Calculator Engine

**Location**: `backend/src/hedging/risk-calculator.ts`

**Purpose**: Calculate total exposure and required hedge amounts in real-time

**Class Definition**:
```typescript
interface ExposureByType {
  coverageType: 'depeg' | 'exploit' | 'bridge';
  totalCoverage: number;        // Sum of all active policy coverages
  activePolicies: number;        // Count of policies
  requiredHedge: number;         // 20% of total coverage
  currentHedge: number;          // Actual hedges in place
  hedgeDeficit: number;          // requiredHedge - currentHedge
}

class RiskCalculator {
  private db: Database;
  private blockchainClient: TONClient;

  /**
   * Calculate current exposure across all hedged policies
   */
  async calculateExposure(): Promise<ExposureByType[]> {
    // 1. Query blockchain for all active hedged policies
    const policies = await this.getActiveHedgedPolicies();

    // 2. Group by coverage type
    const grouped = this.groupByCoverageType(policies);

    // 3. Calculate metrics for each type
    return grouped.map(group => {
      const totalCoverage = group.policies.reduce(
        (sum, p) => sum + p.coverageAmount,
        0
      );

      const currentHedge = this.getCurrentHedgeAmount(group.type);

      return {
        coverageType: group.type,
        totalCoverage,
        activePolicies: group.policies.length,
        requiredHedge: totalCoverage * 0.2,  // 20% external hedges
        currentHedge,
        hedgeDeficit: (totalCoverage * 0.2) - currentHedge
      };
    });
  }

  /**
   * Determine if rebalancing is needed
   */
  async needsRebalancing(): Promise<boolean> {
    const exposures = await this.calculateExposure();

    for (const exposure of exposures) {
      // Rebalance if deficit > 10% of required hedge
      const driftPct = Math.abs(exposure.hedgeDeficit) / exposure.requiredHedge;
      if (driftPct > 0.10) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate hedge orders needed to rebalance
   */
  async calculateRebalanceOrders(): Promise<HedgeOrder[]> {
    const exposures = await this.calculateExposure();
    const orders: HedgeOrder[] = [];

    for (const exposure of exposures) {
      if (Math.abs(exposure.hedgeDeficit) < 100) continue;  // Ignore tiny amounts

      if (exposure.hedgeDeficit > 0) {
        // Need more hedges
        orders.push({
          action: 'INCREASE',
          coverageType: exposure.coverageType,
          amount: exposure.hedgeDeficit
        });
      } else {
        // Too many hedges, reduce
        orders.push({
          action: 'DECREASE',
          coverageType: exposure.coverageType,
          amount: Math.abs(exposure.hedgeDeficit)
        });
      }
    }

    return orders;
  }
}
```

**API Endpoints**:
```typescript
// GET /api/hedging/exposure
// Returns current exposure by coverage type

// GET /api/hedging/needs-rebalancing
// Returns boolean + details

// POST /api/hedging/calculate-rebalance
// Returns recommended hedge orders
```

---

#### 2.2 Hedge Optimizer

**Location**: `backend/src/hedging/hedge-optimizer.ts`

**Purpose**: Optimize hedge allocation across venues to minimize cost

**Class Definition**:
```typescript
interface HedgeAllocation {
  totalAmount: number;
  allocations: {
    polymarket: number;    // Amount to allocate
    perpetuals: number;
    allianz: number;
  };
  expectedCost: number;
  confidence: number;      // 0-1, based on liquidity
}

class HedgeOptimizer {
  /**
   * Optimize hedge allocation across 3 venues
   * Objective: Minimize cost
   * Constraints:
   *   - Min 5% per venue (diversification)
   *   - Max 60% per venue (risk limit)
   *   - Total = 100%
   */
  async optimize(
    totalHedgeAmount: number,
    coverageType: string
  ): Promise<HedgeAllocation> {
    // 1. Get current costs from all venues
    const polymarketCost = await this.polymarket.getCostPerDollar(coverageType);
    const perpCost = await this.perpetuals.getCostPerDollar(coverageType);
    const allianzCost = await this.allianz.getCostPerDollar(coverageType);

    // 2. Get liquidity constraints
    const polyLiquidity = await this.polymarket.getAvailableLiquidity(coverageType);
    const perpLiquidity = await this.perpetuals.getAvailableLiquidity(coverageType);

    // 3. Solve optimization problem
    // Use linear programming (simplex method)
    const result = this.solveLP({
      objective: 'minimize',
      costs: [polymarketCost, perpCost, allianzCost],
      constraints: [
        { type: 'gte', bound: 0.05, name: 'min_polymarket' },
        { type: 'gte', bound: 0.05, name: 'min_perps' },
        { type: 'gte', bound: 0.05, name: 'min_allianz' },
        { type: 'lte', bound: 0.60, name: 'max_polymarket' },
        { type: 'lte', bound: 0.60, name: 'max_perps' },
        { type: 'lte', bound: 0.60, name: 'max_allianz' },
        { type: 'eq', bound: 1.0, name: 'total_allocation' }
      ],
      liquidityLimits: [polyLiquidity, perpLiquidity, Infinity]  // Allianz has no limit
    });

    return {
      totalAmount: totalHedgeAmount,
      allocations: {
        polymarket: totalHedgeAmount * result.x[0],
        perpetuals: totalHedgeAmount * result.x[1],
        allianz: totalHedgeAmount * result.x[2]
      },
      expectedCost: result.objectiveValue,
      confidence: result.confidence
    };
  }

  /**
   * Solve linear programming problem
   * (Simplified - use library like `jsLPSolver` in production)
   */
  private solveLP(params: LPParams): LPSolution {
    // Implementation using simplex algorithm or library
    // Returns optimal allocation percentages
  }
}
```

---

#### 2.3 Polymarket Connector

**Location**: `backend/src/hedging/connectors/polymarket.ts`

**Purpose**: Execute and monitor prediction market hedges

**Class Definition**:
```typescript
import { PolymarketAPI } from '@polymarket/api';

interface PolymarketPosition {
  policyId: string;
  marketId: string;
  side: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
  currentValue: number;
  unrealizedPnL: number;
}

class PolymarketConnector {
  private client: PolymarketAPI;
  private positions: Map<string, PolymarketPosition>;

  /**
   * Place hedge order for a policy
   */
  async placeHedge(
    policyId: string,
    coverageType: string,
    amount: number
  ): Promise<PolymarketPosition> {
    // 1. Find appropriate market
    const market = await this.findMarket(coverageType);

    if (!market) {
      throw new Error(`No market found for coverage type: ${coverageType}`);
    }

    // 2. Place market order (buy YES shares)
    const order = await this.client.placeOrder({
      marketId: market.id,
      side: 'YES',  // Bet on event happening
      amount: amount,
      orderType: 'MARKET'
    });

    // 3. Track position
    const position: PolymarketPosition = {
      policyId,
      marketId: market.id,
      side: 'YES',
      shares: order.sharesAcquired,
      avgPrice: order.avgPrice,
      currentValue: order.sharesAcquired * market.currentPrice,
      unrealizedPnL: 0
    };

    this.positions.set(policyId, position);

    // 4. Store in database
    await this.db.saveHedge({
      policyId,
      venue: 'polymarket',
      marketId: market.id,
      shares: position.shares,
      cost: amount,
      timestamp: Date.now()
    });

    return position;
  }

  /**
   * Monitor all positions and update values
   */
  async monitorPositions(): Promise<void> {
    for (const [policyId, position] of this.positions) {
      const market = await this.client.getMarket(position.marketId);

      // Update current value
      position.currentValue = position.shares * market.currentPrice;
      position.unrealizedPnL = position.currentValue - (position.shares * position.avgPrice);

      // Check if market resolved
      if (market.resolved) {
        await this.handleMarketResolution(policyId, position, market);
      }

      // Update database
      await this.db.updateHedgeValue(policyId, position.currentValue);
    }
  }

  /**
   * Liquidate hedge (close position early)
   */
  async liquidate(policyId: string): Promise<number> {
    const position = this.positions.get(policyId);
    if (!position) return 0;

    // Sell all shares at market price
    const order = await this.client.placeOrder({
      marketId: position.marketId,
      side: 'NO',  // Sell our YES shares
      shares: position.shares,
      orderType: 'MARKET'
    });

    const proceeds = order.proceeds;

    // Remove from active positions
    this.positions.delete(policyId);

    return proceeds;
  }

  /**
   * Find appropriate market for coverage type
   */
  private async findMarket(coverageType: string): Promise<Market | null> {
    const searchQueries = {
      'depeg': 'USDT below 0.95',
      'exploit': 'DeFi protocol hack',
      'bridge': 'bridge exploit'
    };

    const query = searchQueries[coverageType];
    const markets = await this.client.searchMarkets(query);

    // Filter to active, liquid markets
    return markets
      .filter(m => m.active && m.liquidity > 10000)
      .sort((a, b) => b.liquidity - a.liquidity)[0];
  }
}
```

**Events**:
- `HEDGE_PLACED(policyId, marketId, shares, cost)`
- `HEDGE_LIQUIDATED(policyId, proceeds)`
- `MARKET_RESOLVED(policyId, outcome, payout)`

---

### 3. Data Flow Diagrams

#### 3.1 Policy Purchase Flow (Hedged Insurance)

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. Request quote (coverage_type, amount, duration)
     ▼
┌─────────────────┐
│ Frontend UI     │
└────┬────────────┘
     │ 2. Query /api/premium/swing-quote
     ▼
┌─────────────────┐
│ Backend API     │
└────┬────────────┘
     │ 3. Query PricingOracle.calculate_hedge_cost()
     ▼
┌─────────────────┐
│ PricingOracle   │ (TON smart contract)
└────┬────────────┘
     │ 4. Return (base_premium + hedge_costs)
     ▼
┌─────────────────┐
│ Frontend UI     │
└────┬────────────┘
     │ 5. User confirms purchase
     │ 6. Send transaction to HedgedPolicyFactory
     ▼
┌────────────────────┐
│HedgedPolicyFactory │ (TON smart contract)
└────┬───────────────┘
     │ 7. Forward to Base PolicyFactory (create policy)
     ▼
┌─────────────────┐
│ PolicyFactory   │ (Core Insurance)
└────┬────────────┘
     │ 8. Create policy NFT
     │ 9. Return policy_id
     ▼
┌────────────────────┐
│HedgedPolicyFactory │
└────┬───────────────┘
     │ 10. Emit HEDGE_REQUESTED event
     │ 11. Send hedge orders to HedgeCoordinator
     ▼
┌─────────────────┐
│HedgeCoordinator │ (TON smart contract)
└────┬────────────┘
     │ 12. Emit events for each venue
     ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│Polymarket Keeper│     │Perpetuals Keeper│     │Allianz Keeper   │
└────┬────────────┘     └────┬────────────┘     └────┬────────────┘
     │ 13. Execute hedge     │ 13. Execute hedge     │ 13. Execute hedge
     ▼                       ▼                       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Polymarket  │     │ Binance     │     │ Allianz API │
└────┬────────┘     └────┬────────┘     └────┬────────┘
     │ 14. Return confirmation               │
     └──────┬───────────────┬────────────────┘
            ▼               ▼
       ┌─────────────────┐
       │HedgeCoordinator │
       └────┬────────────┘
            │ 15. confirm_hedge_execution()
            │ 16. All hedges executed
            ▼
       ┌─────────────────┐
       │  User Dashboard │
       └─────────────────┘
       Display: Policy active, fully hedged ✓
```

**Total Time**: ~30 seconds
**Total Gas**: ~0.25 TON (~$8)

---

#### 3.2 Claim Payout Flow (With Hedge Liquidation)

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. File claim (USDT depegged to $0.92)
     ▼
┌─────────────────┐
│ ClaimsEngine    │ (Backend)
└────┬────────────┘
     │ 2. Validate event via Oracle
     ▼
┌─────────────────┐
│ PriceOracle     │
└────┬────────────┘
     │ 3. Confirm: USDT < $0.95 for 4+ hours
     ▼
┌─────────────────┐
│ClaimsProcessor  │ (TON smart contract)
└────┬────────────┘
     │ 4. Approve claim
     │ 5. Calculate payout ($10,000 coverage)
     │
     ├─ 6a. Deduct from Primary Vault ($8,000 = 80%)
     │      ▼
     │  ┌─────────────┐
     │  │Primary Vault│
     │  └─────────────┘
     │
     └─ 6b. Liquidate external hedges ($2,000 = 20%)
            ▼
       ┌─────────────────┐
       │HedgeCoordinator │
       └────┬────────────┘
            │ 7. Emit LIQUIDATE_HEDGE events
            ▼
       ┌──────┬──────┬──────┐
       ▼      ▼      ▼
   ┌────┐ ┌────┐ ┌────┐
   │Poly│ │Perp│ │Alli│ Keepers
   └─┬──┘ └─┬──┘ └─┬──┘
     │ 8. Sell positions / Claim parametric
     ▼      ▼      ▼
   $800  $800  $400  = $2,000 total
     │      │      │
     └──────┼──────┘
            ▼
       ┌─────────────┐
       │  Treasury   │
       └────┬────────┘
            │ 9. Aggregate proceeds
            │ 10. Send total payout to user
            ▼
       ┌─────────┐
       │  User   │
       └─────────┘
       Receives: $10,000 (8k on-chain + 2k hedge proceeds)
```

**Hedge Liquidation Example**:
- **Polymarket**: Market resolved YES (depeg happened) → payout $800
- **Perpetuals**: Close short USDT position (profited from drop) → $800
- **Allianz**: Parametric trigger met → automatic payout $400

**Total Payout**: $10,000 (100% of coverage)
**Sources**: 80% on-chain vaults + 20% hedge proceeds

---

## API Specifications

### REST API Endpoints

**Base URL**: `https://api.tonsurance.com/v1`

#### Premium Pricing

**GET** `/premium/swing-quote`

Calculate real-time swing premium for hedged insurance.

**Request**:
```json
{
  "coverageType": "depeg",  // or "exploit", "bridge"
  "coverageAmount": 10000,  // USD
  "duration": 90            // days
}
```

**Response**:
```json
{
  "basePremium": 80.00,
  "hedgeCosts": {
    "polymarket": 120.00,
    "perpetuals": 35.00,
    "allianz": 45.00,
    "total": 200.00
  },
  "protocolMargin": 14.00,
  "totalPremium": 294.00,
  "savings": 56.00,          // vs Core Insurance premium
  "savingsPct": 16.0,
  "validUntil": "2025-10-09T12:35:00Z",  // 5-minute validity
  "marketConditions": {
    "polymarketOdds": 12.0,   // %
    "perpFundingRate": 0.05,  // % per day
    "allianzQuote": 4.5       // per $1000
  }
}
```

---

#### Hedge Execution Status

**GET** `/hedging/policy/:policyId/status`

Check hedge execution status for a policy.

**Response**:
```json
{
  "policyId": "12345",
  "hedgesRequested": true,
  "hedgesExecuted": {
    "polymarket": {
      "status": "executed",
      "marketId": "poly-12345",
      "shares": 120,
      "cost": 120.00,
      "confirmationHash": "0xabc..."
    },
    "perpetuals": {
      "status": "executed",
      "exchange": "binance",
      "positionId": "BTC-PERP-456",
      "quantity": 0.005,
      "cost": 35.00,
      "confirmationHash": "0xdef..."
    },
    "allianz": {
      "status": "executed",
      "policyNumber": "ALZ-789",
      "coverage": 400,
      "cost": 45.00,
      "certificateUrl": "https://allianz.com/cert/..."
    }
  },
  "fullyHedged": true,
  "hedgedAt": "2025-10-09T12:30:15Z"
}
```

---

#### Exposure Monitoring

**GET** `/hedging/exposure`

Get current risk exposure across all hedged policies.

**Response**:
```json
{
  "totalExposure": 5000000,  // $5M across all types
  "byType": [
    {
      "coverageType": "depeg",
      "totalCoverage": 3000000,
      "activePolicies": 150,
      "requiredHedge": 600000,   // 20% of 3M
      "currentHedge": 580000,
      "hedgeDeficit": 20000,     // Need $20k more hedges
      "driftPct": 3.3            // 3.3% drift
    },
    {
      "coverageType": "exploit",
      "totalCoverage": 1500000,
      "activePolicies": 75,
      "requiredHedge": 300000,
      "currentHedge": 310000,
      "hedgeDeficit": -10000,    // $10k over-hedged
      "driftPct": -3.3
    },
    {
      "coverageType": "bridge",
      "totalCoverage": 500000,
      "activePolicies": 25,
      "requiredHedge": 100000,
      "currentHedge": 100000,
      "hedgeDeficit": 0,
      "driftPct": 0
    }
  ],
  "needsRebalancing": true,
  "timestamp": "2025-10-09T12:00:00Z"
}
```

---

### WebSocket API (Real-Time Updates)

**Endpoint**: `wss://api.tonsurance.com/v1/ws`

#### Subscribe to Premium Updates

```json
// Client → Server
{
  "action": "subscribe",
  "channel": "premium",
  "params": {
    "coverageType": "depeg",
    "coverageAmount": 10000,
    "duration": 90
  }
}

// Server → Client (every 30 seconds)
{
  "channel": "premium",
  "data": {
    "totalPremium": 294.00,
    "change": -2.50,         // $2.50 cheaper than 30s ago
    "changePct": -0.8,
    "timestamp": "2025-10-09T12:30:30Z"
  }
}
```

---

## Integration Points

### External System Integrations

| System | Purpose | Protocol | Authentication |
|--------|---------|----------|----------------|
| **Polymarket API** | Execute prediction market hedges | REST + WebSocket | API Key |
| **Binance Futures** | Execute perpetual contract hedges | REST + WebSocket | API Key + HMAC |
| **Allianz Parametric API** | Purchase parametric insurance | REST | OAuth 2.0 |
| **Chainlink Oracles** | Price feed data | On-chain | Decentralized |
| **TON Blockchain** | Smart contracts, policies | TON RPC | Wallet signing |

---

## Scalability & Performance

### Performance Targets

| Metric | Target | Current (Estimated) |
|--------|--------|---------------------|
| **Premium Quote Latency** | <500ms | ~300ms |
| **Policy Purchase Time** | <30s | ~25s |
| **Hedge Execution Time** | <2 minutes | ~90s |
| **Concurrent Users** | 10,000+ | Untested |
| **Policies/Day** | 5,000+ | Untested |

### Scaling Strategy

**Phase 4 (Launch)**: Single-region deployment
- 1 Backend API server (4 CPU, 16GB RAM)
- 1 PostgreSQL database (replicated)
- 3 Keeper bots (Polymarket, Perps, Allianz)

**Phase 5 (Growth)**: Multi-region, load-balanced
- 3+ Backend API servers (auto-scaling)
- PostgreSQL cluster (primary + 2 replicas)
- Redis cache layer
- 10+ Keeper bots (distributed)

**Future (>$100M TVL)**: Microservices architecture
- Separate services for: Risk Calc, Hedge Optimizer, Keepers
- Kubernetes orchestration
- Global CDN
- Multi-region failover

---

## Security Considerations

### Threat Model

**High-Risk Threats**:
1. **Oracle Manipulation**: Malicious keeper providing false hedge prices
   - **Mitigation**: Multi-signature oracle updates, price sanity checks

2. **Keeper Compromise**: Hacked keeper bot executes unauthorized trades
   - **Mitigation**: Hardware wallet for keeper, transaction limits, monitoring

3. **External Venue Failure**: Polymarket/Binance/Allianz goes offline
   - **Mitigation**: Fallback to on-chain-only mode, manual intervention process

**Medium-Risk Threats**:
4. **Front-Running (Bridge)**: MEV bots front-run large hedge orders via bridge from EVM to TON
   - **Mitigation**: Split large orders, use private mempools, monitor bridge activity

5. **API Rate Limiting**: External APIs throttle requests
   - **Mitigation**: Request caching, multiple API keys, exponential backoff

---

## Appendix

### A. Contract Addresses (Testnet)

```
HedgedPolicyFactory: EQD...
PricingOracle: EQD...
HedgeCoordinator: EQD...
```

### B. Keeper Bot Infrastructure

**Polymarket Keeper**:
- Language: TypeScript
- Hosting: AWS Lambda (serverless)
- Trigger: Smart contract events
- Execution: Every 5 minutes + on-demand

**Perpetuals Keeper**:
- Language: Python
- Hosting: Dedicated server (24/7 uptime)
- Trigger: Smart contract events
- Execution: Real-time WebSocket

**Allianz Keeper**:
- Language: TypeScript
- Hosting: AWS Lambda
- Trigger: Smart contract events
- Execution: On-demand (policy purchase)

---

**END OF HEDGED ARCHITECTURE DOCUMENT**

*Version 1.0 - October 2025*
*For questions: eng@tonsurance.com*
