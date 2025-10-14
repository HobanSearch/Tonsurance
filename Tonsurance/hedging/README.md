# Hedged Insurance System

## Overview

The Hedged Insurance system is Phase 4 of Tonsurance, providing dynamic swing-priced insurance policies backed by 80% on-chain collateral and 20% external hedges across three venues:
- **Polymarket** (40%): Prediction market hedges
- **Perpetual Futures** (40%): Price hedging via perps
- **Allianz Parametric** (20%): Traditional reinsurance

---

## Architecture

### Smart Contracts (On-Chain)

```
┌─────────────────────┐
│ PricingOracle       │  Stores real-time hedge costs
│ - Updated every 5s  │  from 3 external sources
│ - Staleness check   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ HedgedPolicyFactory │  Creates policies with
│ - Swing pricing     │  dynamic premiums
│ - Pool management   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ HedgeCoordinator    │  Tracks hedge positions
│ - Register hedges   │  and coordinates liquidation
│ - Liquidate on claim│
└─────────────────────┘
```

### Off-Chain Services

```
┌──────────────────┐     ┌──────────────────┐
│ RiskCalculator   │────▶│ HedgeOptimizer   │
│ - Calc exposure  │     │ - Optimize alloc │
│ - Hedge deficit  │     │ - Cost efficiency│
└──────────────────┘     └──────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│         External Connectors              │
├──────────────┬────────────┬──────────────┤
│ Polymarket   │ Perpetuals │ Allianz      │
│ Connector    │ Connector  │ Connector    │
└──────────────┴────────────┴──────────────┘
```

### Keepers

```
┌─────────────────────────┐
│ PricingOracleKeeper     │  Runs continuously
│ - Fetch hedge costs (5s)│  updating oracle with
│ - Update oracle         │  latest market data
└─────────────────────────┘

┌─────────────────────────┐
│ HedgeExecutionKeepers   │  Execute hedges when
│ - Polymarket            │  policies created
│ - Perpetuals            │
│ - Allianz               │
└─────────────────────────┘
```

---

## Services

### RiskCalculator

Calculates total exposure and hedge requirements.

**Usage**:
```typescript
import { RiskCalculator } from './services/RiskCalculator';

const calculator = new RiskCalculator({
    tonClient: client,
    factoryAddress: Address.parse('EQC...'),
    coordinatorAddress: Address.parse('EQC...'),
});

// Get exposure by coverage type
const exposures = await calculator.calculateExposure();
// Returns: { coverageType, totalCoverage, requiredHedge, currentHedge, hedgeDeficit }

// Check if rebalancing needed
const needsRebalancing = await calculator.needsRebalancing();

// Calculate rebalance orders
if (needsRebalancing) {
    const orders = await calculator.calculateRebalanceOrders();
    // Execute orders via connectors
}
```

---

### HedgeOptimizer

Optimizes hedge allocation across venues.

**Usage**:
```typescript
import { HedgeOptimizer } from './services/HedgeOptimizer';
import { NORMAL_MARKET } from '../tests/fixtures/market-data';

const optimizer = new HedgeOptimizer();

// Optimize allocation
const allocation = optimizer.optimizeAllocation({
    totalHedgeNeeded: 10000,
    marketData: NORMAL_MARKET.data,
    constraints: {
        maxPerVenue: 0.5,      // Max 50% in one venue
        minPerVenue: 0.15,     // Min 15% per venue
        requireDiversification: true,
    },
});

// Result: { polymarket: 4000, perpetuals: 4000, allianz: 2000, totalCost, score }

// Calculate expected ROI
const roi = optimizer.calculateHedgeROI({
    venue: 'polymarket',
    coverageType: 'depeg',
    amount: 10000,
    duration: 30,
});

// Result: { expectedPayout, totalCost, netROI, probability, expectedValue }
```

---

### PolymarketConnector

Executes hedges on Polymarket.

**Usage**:
```typescript
import { PolymarketConnector } from './services/PolymarketConnector';

const connector = new PolymarketConnector({
    apiUrl: 'https://clob.polymarket.com',
    apiKey: process.env.POLYMARKET_API_KEY!,
    apiSecret: process.env.POLYMARKET_API_SECRET!,
});

// Place order
const order = await connector.placeOrder({
    coverageType: 'depeg',
    amount: 10000,
    side: 'YES',
    type: 'MARKET',
});

// Result: { externalId, status, fillPrice, size, cost, venue }

// Liquidate position
const { proceeds, slippage } = await connector.liquidatePosition({
    externalId: 'pm-order-123',
    amount: 10000,
});

// Get market data
const marketData = await connector.getMarketData('depeg');
// Result: { probability, cost, capacity, confidence }
```

---

### PricingOracleKeeper

Updates oracle every 5 seconds with latest hedge costs.

**Usage**:
```typescript
import { PricingOracleKeeper } from './keepers/PricingOracleKeeper';
import { WalletContractV4 } from '@ton/ton';

// Setup wallet
const wallet = WalletContractV4.create({
    publicKey: Buffer.from(publicKey, 'hex'),
    workchain: 0,
});

// Create keeper
const keeper = new PricingOracleKeeper({
    oracleAddress: Address.parse('EQC...'),
    keeperWallet: wallet,
    polymarketConnector: new PolymarketConnector({ ... }),
    updateInterval: 5000, // 5 seconds
});

// Start keeper (runs continuously)
keeper.start();

// Stop keeper
keeper.stop();

// Manual update (for testing)
await keeper.triggerUpdate();

// Check status
const isRunning = keeper.isKeeperRunning();
const lastUpdate = await keeper.getLastUpdateTime();
```

---

## Testing

### Unit Tests

```bash
# Test contracts
npm run test:unit:contracts

# Test services
npm run test:unit:services

# Test all
npm run test:unit
```

### Integration Tests

```bash
# Start mock APIs
npm run mock:polymarket

# Run integration tests (in another terminal)
npm run test:integration
```

### Test Data

**Mock Policies**:
```typescript
import { generateMockPolicy, SCENARIO_DEPEG_EVENT } from '../tests/fixtures/policies';

// Generate single policy
const policy = generateMockPolicy({
    coverageType: 1, // DEPEG
    coverageAmount: toNano('10000'),
});

// Use preset scenario
const scenario = SCENARIO_DEPEG_EVENT;
// Returns: { name, policies: MockPolicy[] }
```

**Market Scenarios**:
```typescript
import { BULL_MARKET, BEAR_MARKET, CRISIS } from '../tests/fixtures/market-data';

// Use preset scenario
const optimizer = new HedgeOptimizer();
const allocation = optimizer.optimizeAllocation({
    totalHedgeNeeded: 10000,
    marketData: BULL_MARKET.data,  // or BEAR_MARKET.data, CRISIS.data
});

// Generate random
import { generateRandomMarketData } from '../tests/fixtures/market-data';
const randomData = generateRandomMarketData();
```

---

## Deployment

### 1. Deploy Contracts

```bash
# PricingOracle
npx blueprint run deployPricingOracle --testnet

# HedgeCoordinator
npx blueprint run deployHedgeCoordinator --testnet

# HedgedPolicyFactory
npx blueprint run deployHedgedPolicyFactory --testnet
```

### 2. Configure Keepers

Update oracle and coordinator with keeper addresses:

```typescript
// Add keepers to PricingOracle
await pricingOracle.sendAddKeeper(admin.getSender(), {
    value: toNano('0.05'),
    keeperAddress: keeperWallet.address,
});

// Add keepers to HedgeCoordinator
await hedgeCoordinator.sendAddKeeper(admin.getSender(), {
    value: toNano('0.05'),
    keeperAddress: keeperWallet.address,
});
```

### 3. Start Keeper Service

```bash
# Set environment variables
export PRICING_ORACLE_ADDRESS=EQC...
export KEEPER_MNEMONIC="word1 word2 ..."
export POLYMARKET_API_KEY=...
export POLYMARKET_API_SECRET=...

# Start keeper
ts-node hedging/keepers/start.ts
```

---

## Swing Pricing Example

### Premium Calculation

For $10,000 USDT depeg insurance, 30 days:

**1. Base Premium** (0.8% APR):
```
Base = $10,000 × 0.008 × (30/365) = $6.58
```

**2. Hedge Costs** (from PricingOracle):

*Polymarket* (40% allocation):
```
Market odds: 2.5%
Cost = $10,000 × 0.025 × 0.4 = $100
```

*Perpetuals* (40% allocation):
```
Funding rate: -0.5% daily (negative = we earn)
Cost = $10,000 × 0.005 × 30 × 0.4 = $60
```

*Allianz* (20% allocation):
```
Quote: $4.50 per $1,000
Cost = $10,000 × 0.0045 × 0.2 = $9
```

**3. Total Premium**:
```
Total = $6.58 + $100 + $60 + $9 = $175.58
```

**vs. Core Insurance** (fixed 0.8% APR):
```
Core Premium = $10,000 × 0.008 × (30/365) = $6.58
```

**Savings**: $175.58 vs. Core depends on market conditions:
- Bull market: Hedges cheap → Hedged Insurance wins
- Bear market: Hedges expensive → Core Insurance wins

---

## Monitoring

### Key Metrics

**Exposure**:
```typescript
const summary = await riskCalculator.getExposureSummary();

console.log(`Total Coverage: ${summary.totalCoverage}`);
console.log(`Total Hedges: ${summary.totalCurrentHedge}`);
console.log(`Hedge Deficit: ${summary.totalDeficit}`);
console.log(`Deficit %: ${(summary.totalDeficit / summary.totalRequiredHedge) * 100}%`);
```

**Pool Utilization**:
```typescript
const utilization = await factory.getPoolUtilization(provider);
console.log(`Pool Utilization: ${utilization}%`);  // Max 80%
```

**Oracle Freshness**:
```typescript
const isFresh = await pricingOracle.isDataFresh(provider);
const lastUpdate = await pricingOracle.getLastUpdateTime(provider);

if (!isFresh) {
    console.warn(`Oracle stale! Last update: ${lastUpdate}`);
}
```

---

## Security Considerations

### Oracle Updates
- Only authorized keepers can update prices
- Staleness check (>5 min = rejected)
- Price validation (ranges enforced)

### Hedge Execution
- Async execution prevents blocking policy creation
- Retry logic with exponential backoff
- Failed hedges marked for manual review

### Claim Payouts
- 80% paid from on-chain vaults (trustless)
- 20% paid from Reserve (temporary float)
- Reserve refilled from hedge liquidation proceeds

### Access Control
- Admin-only functions (add/remove keepers, update addresses)
- Factory-only functions (trigger liquidation)
- Keeper-only functions (register hedges, update oracle)

---

## Troubleshooting

### Oracle Not Updating
```typescript
// Check keeper is running
const isRunning = keeper.isKeeperRunning();

// Check keeper is authorized
const isAuthorized = await pricingOracle.checkKeeperAuthorized(provider, keeper.address);

// Check last update time
const lastUpdate = await pricingOracle.getLastUpdateTime(provider);
```

### Hedge Execution Failed
```typescript
// Check hedge position
const position = await hedgeCoordinator.getHedgePosition(provider, policyId);

// If status = FAILED, retry manually
if (position.polymarketStatus === HedgeStatus.FAILED) {
    await polymarketConnector.placeOrder({ ... });

    // Register successful hedge
    await hedgeCoordinator.sendRegisterHedge(keeper.getSender(), {
        policyId,
        venueId: VenueType.POLYMARKET,
        amount: hedgeAmount,
        externalId: order.externalId,
        status: HedgeStatus.FILLED,
    });
}
```

### High Hedge Deficit
```typescript
// Check if rebalancing needed
const needsRebalance = await riskCalculator.needsRebalancing();

if (needsRebalance) {
    const orders = await riskCalculator.calculateRebalanceOrders();

    // Execute rebalance orders
    for (const order of orders) {
        if (order.venue === 'polymarket') {
            await polymarketConnector.placeOrder({
                coverageType: order.coverageType,
                amount: Number(order.amount),
            });
        }
        // ... similar for other venues
    }
}
```

---

## Future Enhancements (Phase 5)

1. **ML-Based Optimization**:
   - Dynamic venue allocation based on historical performance
   - Predictive hedge cost modeling
   - Automated rebalancing triggers

2. **Additional Venues**:
   - Options markets (e.g., Deribit)
   - Cross-chain hedges (e.g., Ethereum derivatives)
   - Additional TradFi reinsurers

3. **Advanced Features**:
   - Multi-signature keeper coordination
   - Decentralized oracle (Chainlink integration)
   - Flash loan-based rebalancing

---

## Resources

- **Documentation**: See `/docs` for detailed specs
- **Tests**: See `/tests` for examples
- **Architecture**: See `HEDGED_ARCHITECTURE.md`
- **Decisions**: See `DESIGN_DECISIONS.md`

---

**Version**: 0.0.1
**Phase**: 4 (Hedged Insurance)
**Status**: ✅ Complete - Ready for Testing
