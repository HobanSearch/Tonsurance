# Testing Strategy - Tonsurance Hedged Insurance

## Overview

This document defines the comprehensive testing strategy for the Tonsurance protocol, with emphasis on the Phase 4 Hedged Insurance product. We follow a **test-first development (TFD)** approach with 90%+ code coverage requirements across all components.

## Testing Philosophy

1. **Test-First Development**: All features require tests written before implementation
2. **Multi-Layer Coverage**: Unit → Integration → E2E testing pyramid
3. **Mock External Dependencies**: Isolated testing of hedging logic without real API calls
4. **Realistic Scenarios**: Test data based on actual market conditions
5. **Performance Testing**: Ensure scalability targets met (1000 TPS, <100ms latency)

---

## 1. Testing Stack

### Core Testing Tools
```json
{
  "unit": "Jest 29.x",
  "contracts": "@ton/sandbox 0.20.0",
  "e2e": "Supertest + Playwright",
  "mocking": "nock (API) + @ton/test-utils (blockchain)",
  "coverage": "nyc (Istanbul)",
  "ci": "GitHub Actions"
}
```

### Test Organization
```
tests/
├── unit/
│   ├── contracts/          # FunC contract unit tests
│   ├── services/           # TypeScript service unit tests
│   └── utils/              # Utility function tests
├── integration/
│   ├── contract-service/   # Contract + wrapper integration
│   ├── api/                # REST API integration tests
│   └── hedging/            # Cross-component hedging tests
├── e2e/
│   ├── journeys/           # Full user journey tests
│   └── scenarios/          # Multi-actor scenario tests
├── mocks/
│   ├── polymarket.ts       # Polymarket API mocks
│   ├── perpetuals.ts       # Perp DEX mocks
│   └── allianz.ts          # Allianz API mocks
└── fixtures/
    ├── policies.ts         # Sample policy data
    ├── market-data.ts      # Realistic market prices
    └── hedge-responses.ts  # External API responses
```

---

## 2. Unit Testing Strategy

### 2.1 Smart Contract Unit Tests (FunC)

**Coverage Target**: 95%+

#### HedgedPolicyFactory.spec.ts
```typescript
describe('HedgedPolicyFactory', () => {
  let blockchain: Blockchain;
  let factory: SandboxContract<HedgedPolicyFactory>;
  let pricingOracle: SandboxContract<PricingOracle>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    pricingOracle = blockchain.openContract(PricingOracle.createFromConfig(...));
    factory = blockchain.openContract(HedgedPolicyFactory.createFromConfig(...));
  });

  describe('create_hedged_policy', () => {
    it('should calculate swing premium correctly', async () => {
      // Setup: Mock oracle with known hedge costs
      await pricingOracle.send(deployer, {
        value: toNano('0.05'),
        body: updateHedgePrices({
          coverageType: 1, // DEPEG
          polymarketOdds: 300,    // 3% probability
          perpFundingRate: -50,   // -0.5% daily
          allianzQuote: 450       // $4.50 per $1000
        })
      });

      // Execute: Create policy
      const result = await factory.send(user, {
        value: toNano('100'),
        body: createHedgedPolicy({
          coverageType: 1,
          coverageAmount: toNano('10000'),
          durationDays: 30
        })
      });

      // Assert: Premium breakdown
      expect(result.transactions).toHaveLength(4); // Factory + 3 keepers
      const premium = await factory.getLastPolicyPremium();
      expect(premium.basePremium).toBe(toNano('80'));  // 0.8% APR
      expect(premium.hedgeCost).toBe(toNano('214'));    // Calculated from oracle
      expect(premium.totalPremium).toBe(toNano('294')); // Base + hedge
    });

    it('should reject if coverage amount exceeds pool limit', async () => {
      const result = await factory.send(user, {
        value: toNano('100'),
        body: createHedgedPolicy({
          coverageAmount: toNano('100000000') // 100M TON
        })
      });

      expect(result.transactions).toHaveTransaction({
        from: factory.address,
        to: user.address,
        exitCode: 104 // INSUFFICIENT_POOL_CAPACITY
      });
    });

    it('should distribute hedge orders to 3 keepers', async () => {
      const result = await factory.send(user, {
        value: toNano('100'),
        body: createHedgedPolicy({
          coverageType: 2, // EXPLOIT
          coverageAmount: toNano('5000'),
          durationDays: 60
        })
      });

      // Verify 3 async messages sent to keepers
      expect(result.transactions).toHaveTransaction({
        from: factory.address,
        to: polymarketKeeper.address,
        body: expect.objectContaining({
          op: 0x48454447, // "HEDG"
          venue: 1,
          amount: expect.any(Number)
        })
      });

      expect(result.transactions).toHaveTransaction({
        from: factory.address,
        to: perpKeeper.address
      });

      expect(result.transactions).toHaveTransaction({
        from: factory.address,
        to: allianzKeeper.address
      });
    });

    // 15+ more test cases...
    it('should update policy registry correctly');
    it('should emit PolicyCreated event with correct data');
    it('should handle oracle unavailable gracefully');
    it('should apply discount for large coverage amounts');
    it('should reject policies with invalid duration (<7 days)');
    it('should cap hedge cost at 50% of base premium');
    it('should handle concurrent policy creations');
  });

  describe('claim_payout', () => {
    it('should split payout 80/20 on-chain/hedge', async () => {
      // Create policy first
      await factory.send(user, {
        value: toNano('100'),
        body: createHedgedPolicy({
          coverageAmount: toNano('10000')
        })
      });

      // File claim
      await claimsEngine.send(user, {
        value: toNano('1'),
        body: fileClaim({ policyId: 1, evidence: 'depeg-proof-hash' })
      });

      // Approve claim (admin)
      const result = await claimsEngine.send(admin, {
        value: toNano('10'),
        body: approveClaim({ claimId: 1 })
      });

      // Verify payouts
      expect(result.transactions).toHaveTransaction({
        from: primaryVault.address,
        to: user.address,
        value: toNano('8000') // 80% on-chain
      });

      expect(result.transactions).toHaveTransaction({
        from: hedgeCoordinator.address,
        to: user.address,
        value: toNano('2000') // 20% from hedge liquidation
      });
    });

    // 10+ more claim test cases...
  });
});
```

#### PricingOracle.spec.ts
```typescript
describe('PricingOracle', () => {
  it('should aggregate hedge prices from 3 sources', async () => {
    await oracle.send(keeper, {
      value: toNano('0.1'),
      body: updateHedgePrices({
        coverageType: 1,
        polymarketOdds: 250,     // 2.5%
        perpFundingRate: -75,    // -0.75% daily
        allianzQuote: 400        // $4.00 per $1000
      })
    });

    const cost = await oracle.getHedgeCost(1, toNano('10000'), 30);

    // Expected calculation:
    // Polymarket: 10000 * 0.025 * 0.4 = 100 TON
    // Perps: 10000 * 0.0075 * 30 * 0.4 = 90 TON
    // Allianz: 10000 * 0.004 * 0.2 = 8 TON
    // Total: 198 TON
    expect(cost).toBe(toNano('198'));
  });

  it('should reject stale prices (>5 min old)', async () => {
    await oracle.send(keeper, {
      value: toNano('0.1'),
      body: updateHedgePrices({ /* ... */ })
    });

    // Fast-forward 6 minutes
    blockchain.now = Math.floor(Date.now() / 1000) + 361;

    const result = await factory.send(user, {
      value: toNano('100'),
      body: createHedgedPolicy({ /* ... */ })
    });

    expect(result.transactions).toHaveTransaction({
      exitCode: 108 // STALE_ORACLE_DATA
    });
  });

  // 12+ more oracle test cases...
});
```

#### HedgeCoordinator.spec.ts
```typescript
describe('HedgeCoordinator', () => {
  it('should track hedge positions by policy', async () => {
    await coordinator.send(factory, {
      value: toNano('1'),
      body: registerHedge({
        policyId: 1,
        venue: 1, // Polymarket
        amount: toNano('100'),
        externalId: 'pm-market-123'
      })
    });

    const position = await coordinator.getHedgePosition(1);
    expect(position.polymarketAmount).toBe(toNano('100'));
    expect(position.externalIds.polymarket).toBe('pm-market-123');
  });

  it('should handle hedge settlement on claim approval', async () => {
    // Simulate claim approval notification
    const result = await coordinator.send(claimsEngine, {
      value: toNano('5'),
      body: settleHedge({
        policyId: 1,
        claimAmount: toNano('10000')
      })
    });

    // Should send liquidation orders to all 3 keepers
    expect(result.transactions).toHaveLength(4); // Coordinator + 3 keepers

    // Verify liquidation messages
    expect(result.transactions).toHaveTransaction({
      from: coordinator.address,
      to: polymarketKeeper.address,
      body: expect.objectContaining({
        op: 0x4c495144, // "LIQD"
        policyId: 1
      })
    });
  });

  // 10+ more coordinator test cases...
});
```

### 2.2 Off-Chain Service Unit Tests (TypeScript)

**Coverage Target**: 90%+

#### RiskCalculator.spec.ts
```typescript
import { RiskCalculator } from '@/services/hedging/RiskCalculator';
import { mockBlockchainData } from '@/tests/mocks/blockchain';

describe('RiskCalculator', () => {
  let calculator: RiskCalculator;

  beforeEach(() => {
    calculator = new RiskCalculator({
      tonClient: mockTonClient,
      vaultAddress: 'EQC...'
    });
  });

  describe('calculateExposure', () => {
    it('should aggregate exposure by coverage type', async () => {
      // Mock 10 active policies
      mockBlockchainData.policies = [
        { id: 1, type: 'depeg', coverage: 10000 },
        { id: 2, type: 'depeg', coverage: 5000 },
        { id: 3, type: 'exploit', coverage: 20000 },
        // ... 7 more
      ];

      const exposure = await calculator.calculateExposure();

      expect(exposure).toEqual([
        {
          coverageType: 'depeg',
          totalCoverage: 15000,
          requiredHedge: 3000,  // 20% of 15000
          currentHedge: 2500,
          hedgeDeficit: 500
        },
        {
          coverageType: 'exploit',
          totalCoverage: 20000,
          requiredHedge: 4000,
          currentHedge: 4200,
          hedgeDeficit: 0  // Over-hedged by 200
        }
      ]);
    });

    it('should handle zero policies gracefully', async () => {
      mockBlockchainData.policies = [];
      const exposure = await calculator.calculateExposure();
      expect(exposure).toEqual([]);
    });

    // 15+ more test cases...
    it('should exclude expired policies from calculation');
    it('should account for pending claims');
    it('should calculate exposure in real-time (<50ms)');
  });

  describe('needsRebalancing', () => {
    it('should return true if deficit exceeds 5% threshold', async () => {
      // Mock exposure with 8% deficit
      jest.spyOn(calculator, 'calculateExposure').mockResolvedValue([
        {
          coverageType: 'depeg',
          totalCoverage: 100000,
          requiredHedge: 20000,
          currentHedge: 18400,  // 8% deficit
          hedgeDeficit: 1600
        }
      ]);

      const needs = await calculator.needsRebalancing();
      expect(needs).toBe(true);
    });

    it('should return false if within tolerance', async () => {
      jest.spyOn(calculator, 'calculateExposure').mockResolvedValue([
        {
          coverageType: 'depeg',
          totalCoverage: 100000,
          requiredHedge: 20000,
          currentHedge: 19500,  // 2.5% deficit
          hedgeDeficit: 500
        }
      ]);

      const needs = await calculator.needsRebalancing();
      expect(needs).toBe(false);
    });
  });

  describe('calculateRebalanceOrders', () => {
    it('should distribute deficit across venues optimally', async () => {
      jest.spyOn(calculator, 'calculateExposure').mockResolvedValue([
        {
          coverageType: 'depeg',
          totalCoverage: 100000,
          requiredHedge: 20000,
          currentHedge: 18000,
          hedgeDeficit: 2000
        }
      ]);

      const orders = await calculator.calculateRebalanceOrders();

      expect(orders).toEqual([
        {
          venue: 'polymarket',
          action: 'increase',
          amount: 800,  // 40% of 2000
          coverageType: 'depeg'
        },
        {
          venue: 'perpetuals',
          action: 'increase',
          amount: 800,  // 40% of 2000
          coverageType: 'depeg'
        },
        {
          venue: 'allianz',
          action: 'increase',
          amount: 400,  // 20% of 2000
          coverageType: 'depeg'
        }
      ]);
    });

    // 10+ more rebalancing test cases...
  });
});
```

#### HedgeOptimizer.spec.ts
```typescript
import { HedgeOptimizer } from '@/services/hedging/HedgeOptimizer';

describe('HedgeOptimizer', () => {
  let optimizer: HedgeOptimizer;

  beforeEach(() => {
    optimizer = new HedgeOptimizer();
  });

  describe('optimizeAllocation', () => {
    it('should allocate based on cost efficiency', async () => {
      const marketData = {
        polymarket: { cost: 0.025, capacity: 50000 },  // 2.5% cost
        perpetuals: { cost: 0.018, capacity: 100000 }, // 1.8% cost (cheapest)
        allianz: { cost: 0.040, capacity: 30000 }      // 4.0% cost
      };

      const allocation = optimizer.optimizeAllocation({
        totalHedgeNeeded: 10000,
        marketData,
        constraints: { maxPerVenue: 0.5 } // Max 50% in one venue
      });

      // Should prioritize perpetuals (cheapest)
      expect(allocation).toEqual({
        perpetuals: 5000,  // Max 50%
        polymarket: 3000,  // Second cheapest
        allianz: 2000      // Most expensive
      });
    });

    it('should respect capacity constraints', async () => {
      const marketData = {
        polymarket: { cost: 0.020, capacity: 2000 },   // Low capacity
        perpetuals: { cost: 0.018, capacity: 100000 },
        allianz: { cost: 0.040, capacity: 30000 }
      };

      const allocation = optimizer.optimizeAllocation({
        totalHedgeNeeded: 10000,
        marketData
      });

      // Should cap polymarket at capacity
      expect(allocation.polymarket).toBe(2000);
      expect(allocation.perpetuals + allocation.allianz).toBe(8000);
    });

    // 12+ more optimization test cases...
    it('should handle zero capacity markets');
    it('should apply diversification bonus');
    it('should optimize for time-weighted costs');
  });

  describe('calculateHedgeROI', () => {
    it('should project ROI based on historical data', async () => {
      const roi = await optimizer.calculateHedgeROI({
        venue: 'polymarket',
        coverageType: 'depeg',
        amount: 10000,
        duration: 30
      });

      expect(roi).toMatchObject({
        expectedPayout: 10000,
        totalCost: 250,       // 2.5% of 10000
        netROI: 9750,
        probability: 0.025,   // 2.5% chance
        expectedValue: 243.75 // 9750 * 0.025
      });
    });
  });
});
```

#### External Connector Unit Tests

**PolymarketConnector.spec.ts**
```typescript
import { PolymarketConnector } from '@/services/hedging/connectors/PolymarketConnector';
import nock from 'nock';

describe('PolymarketConnector', () => {
  let connector: PolymarketConnector;

  beforeEach(() => {
    connector = new PolymarketConnector({
      apiKey: 'test-key',
      apiSecret: 'test-secret'
    });

    // Reset HTTP mocks
    nock.cleanAll();
  });

  afterEach(() => {
    nock.isDone(); // Verify all mocks were called
  });

  describe('placeOrder', () => {
    it('should place YES order on depeg market', async () => {
      // Mock Polymarket API
      nock('https://clob.polymarket.com')
        .post('/order', (body) => {
          return body.market === 'usdt-depeg-q1-2025' &&
                 body.side === 'YES' &&
                 body.size === '10000';
        })
        .reply(200, {
          orderId: 'pm-order-123',
          status: 'FILLED',
          fillPrice: 0.025,
          size: 10000
        });

      const result = await connector.placeOrder({
        coverageType: 'depeg',
        amount: 10000,
        side: 'YES'
      });

      expect(result).toMatchObject({
        externalId: 'pm-order-123',
        status: 'FILLED',
        cost: 250,  // 10000 * 0.025
        venue: 'polymarket'
      });
    });

    it('should retry on rate limit (429)', async () => {
      nock('https://clob.polymarket.com')
        .post('/order')
        .reply(429, { error: 'Rate limit exceeded' })
        .post('/order')
        .reply(200, { orderId: 'pm-order-456', status: 'FILLED' });

      const result = await connector.placeOrder({
        coverageType: 'exploit',
        amount: 5000
      });

      expect(result.externalId).toBe('pm-order-456');
      expect(connector.retryCount).toBe(1);
    });

    it('should throw on invalid market', async () => {
      nock('https://clob.polymarket.com')
        .post('/order')
        .reply(400, { error: 'Market not found' });

      await expect(
        connector.placeOrder({ coverageType: 'invalid', amount: 1000 })
      ).rejects.toThrow('Market not found');
    });

    // 10+ more connector test cases...
    it('should handle partial fills');
    it('should validate order size limits');
    it('should sign requests with API credentials');
  });

  describe('liquidatePosition', () => {
    it('should sell position at market price', async () => {
      nock('https://clob.polymarket.com')
        .post('/order', (body) => body.side === 'NO') // Sell = NO order
        .reply(200, {
          orderId: 'pm-sell-789',
          status: 'FILLED',
          fillPrice: 0.98,
          size: 10000,
          proceeds: 9800
        });

      const result = await connector.liquidatePosition({
        externalId: 'pm-order-123',
        amount: 10000
      });

      expect(result).toMatchObject({
        proceeds: 9800,
        slippage: 0.02  // 2% slippage
      });
    });
  });

  describe('getMarketData', () => {
    it('should fetch current odds and liquidity', async () => {
      nock('https://clob.polymarket.com')
        .get('/markets/usdt-depeg-q1-2025')
        .reply(200, {
          yesPrice: 0.025,
          noPrice: 0.975,
          liquidity: 500000,
          volume24h: 125000
        });

      const data = await connector.getMarketData('depeg');

      expect(data).toMatchObject({
        probability: 0.025,
        cost: 0.025,
        capacity: 500000,
        confidence: 'high'  // Based on volume
      });
    });
  });
});
```

**PerpetualsConnector.spec.ts**
```typescript
describe('PerpetualsConnector', () => {
  it('should open short position on TON/USDT perp', async () => {
    nock('https://api.binance.com')
      .post('/fapi/v1/order', (body) => {
        return body.symbol === 'TONUSDT' &&
               body.side === 'SELL' &&
               body.quantity === '5000';
      })
      .reply(200, {
        orderId: 12345,
        status: 'FILLED',
        avgPrice: 2.15,
        executedQty: 5000
      });

    const result = await perpConnector.openShort({
      asset: 'TON',
      size: 5000,
      leverage: 5
    });

    expect(result).toMatchObject({
      externalId: '12345',
      entryPrice: 2.15,
      notionalValue: 10750,  // 5000 * 2.15
      margin: 2150           // 10750 / 5 (5x leverage)
    });
  });

  it('should calculate funding rate cost', async () => {
    nock('https://api.binance.com')
      .get('/fapi/v1/fundingRate')
      .query({ symbol: 'TONUSDT' })
      .reply(200, {
        fundingRate: -0.0005,  // -0.05% per 8h
        fundingTime: Date.now()
      });

    const cost = await perpConnector.calculateFundingCost({
      size: 10000,
      durationDays: 30
    });

    // -0.05% * 3 (per day) * 30 days = -4.5%
    expect(cost).toBe(-450);  // Negative = we earn funding
  });

  // 15+ more perp test cases...
});
```

**AllianzConnector.spec.ts**
```typescript
describe('AllianzConnector', () => {
  it('should request parametric insurance quote', async () => {
    nock('https://api.allianz-re.com')
      .post('/parametric/quote', (body) => {
        return body.trigger === 'stablecoin-depeg' &&
               body.coverage === 10000;
      })
      .reply(200, {
        quoteId: 'alz-quote-abc',
        premium: 450,      // $450 for $10k coverage
        validUntil: Date.now() + 3600000
      });

    const quote = await allianzConnector.getQuote({
      coverageType: 'depeg',
      amount: 10000,
      duration: 30
    });

    expect(quote).toMatchObject({
      externalId: 'alz-quote-abc',
      premium: 450,
      cost: 0.045  // 4.5% of coverage
    });
  });

  it('should bind coverage after quote acceptance', async () => {
    nock('https://api.allianz-re.com')
      .post('/parametric/bind', {
        quoteId: 'alz-quote-abc'
      })
      .reply(200, {
        policyId: 'ALZ-POL-12345',
        status: 'ACTIVE',
        effectiveDate: '2025-10-09',
        expiryDate: '2025-11-08'
      });

    const policy = await allianzConnector.bindCoverage({
      quoteId: 'alz-quote-abc'
    });

    expect(policy.policyId).toBe('ALZ-POL-12345');
    expect(policy.status).toBe('ACTIVE');
  });

  it('should file claim with evidence', async () => {
    nock('https://api.allianz-re.com')
      .post('/parametric/claim', (body) => {
        return body.policyId === 'ALZ-POL-12345' &&
               body.evidence.oracleData.price < 0.98;  // Depeg below $0.98
      })
      .reply(200, {
        claimId: 'ALZ-CLM-789',
        status: 'APPROVED',
        payout: 10000,
        settlementDays: 3
      });

    const claim = await allianzConnector.fileClaim({
      policyId: 'ALZ-POL-12345',
      evidence: {
        oracleData: { price: 0.95, timestamp: Date.now() }
      }
    });

    expect(claim).toMatchObject({
      claimId: 'ALZ-CLM-789',
      approved: true,
      payout: 10000
    });
  });

  // 12+ more Allianz test cases...
});
```

---

## 3. Integration Testing Strategy

**Coverage Target**: 85%+

### 3.1 Contract + Service Integration

#### Policy Purchase Flow Integration Test
```typescript
describe('Policy Purchase Flow (Integration)', () => {
  let blockchain: Blockchain;
  let factory: SandboxContract<HedgedPolicyFactory>;
  let riskCalculator: RiskCalculator;
  let hedgeOptimizer: HedgeOptimizer;
  let polymarketConnector: PolymarketConnector;

  beforeEach(async () => {
    // Setup real contracts on sandbox
    blockchain = await Blockchain.create();
    factory = blockchain.openContract(/* ... */);

    // Setup services with mock APIs
    riskCalculator = new RiskCalculator({ /* ... */ });
    hedgeOptimizer = new HedgeOptimizer();
    polymarketConnector = new PolymarketConnector({ /* mocked */ });
  });

  it('should coordinate full policy purchase with hedges', async () => {
    // Step 1: User purchases hedged policy
    const policyResult = await factory.send(user, {
      value: toNano('100'),
      body: createHedgedPolicy({
        coverageType: 1,
        coverageAmount: toNano('10000'),
        durationDays: 30
      })
    });

    expect(policyResult.transactions).toHaveTransaction({
      success: true
    });

    // Step 2: Risk calculator detects new exposure
    const exposure = await riskCalculator.calculateExposure();
    expect(exposure[0].hedgeDeficit).toBeGreaterThan(0);

    // Step 3: Optimizer calculates allocation
    const allocation = hedgeOptimizer.optimizeAllocation({
      totalHedgeNeeded: Number(fromNano(exposure[0].requiredHedge)),
      marketData: await fetchMarketData()
    });

    expect(allocation.polymarket).toBeDefined();
    expect(allocation.perpetuals).toBeDefined();
    expect(allocation.allianz).toBeDefined();

    // Step 4: Connectors execute hedges
    const polymarketOrder = await polymarketConnector.placeOrder({
      coverageType: 'depeg',
      amount: allocation.polymarket
    });

    expect(polymarketOrder.status).toBe('FILLED');

    // Step 5: Verify hedge recorded on-chain
    const hedgePosition = await hedgeCoordinator.getHedgePosition(
      policyResult.policyId
    );

    expect(hedgePosition.polymarketAmount).toBe(
      toNano(allocation.polymarket.toString())
    );
  });

  it('should handle hedge execution failure gracefully', async () => {
    // Mock Polymarket API failure
    nock('https://clob.polymarket.com')
      .post('/order')
      .reply(500, { error: 'Internal server error' });

    // Purchase policy
    const policyResult = await factory.send(user, {
      value: toNano('100'),
      body: createHedgedPolicy({ /* ... */ })
    });

    // Should still create policy, but mark hedge as pending
    expect(policyResult.transactions).toHaveTransaction({
      success: true
    });

    const policy = await factory.getPolicy(policyResult.policyId);
    expect(policy.hedgeStatus).toBe('PENDING_RETRY');
  });

  // 20+ more integration test cases...
});
```

### 3.2 REST API Integration Tests

```typescript
import request from 'supertest';
import { app } from '@/api/server';

describe('Hedged Insurance API (Integration)', () => {
  describe('GET /premium/swing-quote', () => {
    it('should return real-time swing quote', async () => {
      // Mock all external APIs
      nock('https://clob.polymarket.com')
        .get('/markets/usdt-depeg-q1-2025')
        .reply(200, { yesPrice: 0.025 });

      nock('https://api.binance.com')
        .get('/fapi/v1/fundingRate')
        .reply(200, { fundingRate: -0.0005 });

      nock('https://api.allianz-re.com')
        .post('/parametric/quote')
        .reply(200, { premium: 450 });

      const response = await request(app)
        .get('/premium/swing-quote')
        .query({
          coverageType: 'depeg',
          coverageAmount: 10000,
          durationDays: 30
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        basePremium: 80.00,
        hedgeCosts: {
          polymarket: expect.any(Number),
          perpetuals: expect.any(Number),
          allianz: 450
        },
        totalPremium: expect.any(Number),
        savings: expect.any(Number),
        expiresAt: expect.any(String)
      });
    });

    it('should cache quotes for 30 seconds', async () => {
      // First request
      await request(app).get('/premium/swing-quote').query({ /* ... */ });

      // Second request within 30s should not hit APIs
      nock.cleanAll(); // Remove mocks

      const response = await request(app)
        .get('/premium/swing-quote')
        .query({ /* same params */ });

      expect(response.status).toBe(200);
      expect(response.body.cached).toBe(true);
    });
  });

  describe('POST /policies/hedged', () => {
    it('should create hedged policy via API', async () => {
      const response = await request(app)
        .post('/policies/hedged')
        .send({
          userAddress: 'EQC...',
          coverageType: 'exploit',
          coverageAmount: 5000,
          durationDays: 60,
          acceptedPremium: 294.50
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        policyId: expect.any(Number),
        premiumPaid: 294.50,
        hedgeStatus: 'EXECUTING',
        transactionHash: expect.any(String)
      });
    });

    it('should reject if premium changed by >2%', async () => {
      const response = await request(app)
        .post('/policies/hedged')
        .send({
          userAddress: 'EQC...',
          coverageAmount: 10000,
          acceptedPremium: 250  // Market premium now 294
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Premium changed');
    });
  });

  // 25+ more API integration tests...
});
```

### 3.3 WebSocket Integration Tests

```typescript
import { io as ioClient } from 'socket.io-client';

describe('WebSocket Premium Updates (Integration)', () => {
  let socket: any;

  beforeEach((done) => {
    socket = ioClient('http://localhost:3000');
    socket.on('connect', done);
  });

  afterEach(() => {
    socket.close();
  });

  it('should stream premium updates every 5 seconds', (done) => {
    socket.emit('subscribe', {
      channel: 'premium-updates',
      coverageType: 'depeg',
      coverageAmount: 10000
    });

    const updates: any[] = [];

    socket.on('premium-update', (data: any) => {
      updates.push(data);

      if (updates.length === 3) {
        expect(updates[0].timestamp).toBeLessThan(updates[1].timestamp);
        expect(updates[1].timestamp).toBeLessThan(updates[2].timestamp);
        expect(updates[2].totalPremium).toBeGreaterThan(0);
        done();
      }
    });
  }, 20000); // 20s timeout for 3 updates

  it('should notify on hedge execution completion', (done) => {
    socket.emit('subscribe', {
      channel: 'hedge-status',
      policyId: 1
    });

    socket.on('hedge-executed', (data: any) => {
      expect(data).toMatchObject({
        policyId: 1,
        venue: expect.stringMatching(/polymarket|perpetuals|allianz/),
        status: 'FILLED',
        amount: expect.any(Number)
      });
      done();
    });

    // Trigger hedge execution in background
    executeTestHedge(1);
  });
});
```

---

## 4. End-to-End Testing Strategy

**Coverage Target**: 75%+

### 4.1 User Journey Tests

#### Journey: Retail User Purchases Hedged Insurance
```typescript
import { test, expect } from '@playwright/test';

test.describe('Retail User Journey: Hedged Policy Purchase', () => {
  test('should complete full purchase flow', async ({ page }) => {
    // Step 1: Connect TON wallet
    await page.goto('http://localhost:3000');
    await page.click('[data-testid="connect-wallet"]');

    // Mock TON Connect approval
    await page.evaluate(() => {
      window.tonConnect.connect({ address: 'EQC...' });
    });

    await expect(page.locator('[data-testid="wallet-address"]'))
      .toContainText('EQC...');

    // Step 2: Navigate to hedged insurance product
    await page.click('text=Hedged Insurance');

    // Step 3: Configure policy
    await page.selectOption('[data-testid="coverage-type"]', 'depeg');
    await page.fill('[data-testid="coverage-amount"]', '10000');
    await page.selectOption('[data-testid="duration"]', '30');

    // Step 4: View real-time quote
    await page.click('[data-testid="get-quote"]');

    await expect(page.locator('[data-testid="premium-breakdown"]'))
      .toBeVisible();

    const basePremium = await page.textContent('[data-testid="base-premium"]');
    const totalPremium = await page.textContent('[data-testid="total-premium"]');

    expect(parseFloat(basePremium!)).toBeLessThan(parseFloat(totalPremium!));

    // Step 5: Compare with fixed-price insurance
    await page.click('[data-testid="compare-products"]');

    await expect(page.locator('[data-testid="savings-amount"]'))
      .toContainText(/Save \d+%/);

    // Step 6: Purchase policy
    await page.click('[data-testid="purchase-hedged"]');

    // Mock TON transaction approval
    await page.evaluate(() => {
      window.tonConnect.sendTransaction({
        value: '100000000000',  // 100 TON
        to: 'factory-address',
        payload: '...'
      });
    });

    // Step 7: Wait for confirmation
    await expect(page.locator('[data-testid="policy-created"]'))
      .toBeVisible({ timeout: 10000 });

    const policyId = await page.textContent('[data-testid="policy-id"]');
    expect(policyId).toMatch(/^\d+$/);

    // Step 8: View hedge execution status
    await page.click('[data-testid="view-hedge-status"]');

    await expect(page.locator('[data-testid="polymarket-hedge"]'))
      .toContainText(/FILLED|PENDING/);
    await expect(page.locator('[data-testid="perpetuals-hedge"]'))
      .toContainText(/FILLED|PENDING/);
    await expect(page.locator('[data-testid="allianz-hedge"]'))
      .toContainText(/FILLED|PENDING/);

    // Step 9: Verify policy in dashboard
    await page.goto('/dashboard');
    await expect(page.locator(`[data-policy-id="${policyId}"]`))
      .toBeVisible();
  });

  test('should reject purchase if wallet balance insufficient', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Mock wallet with low balance
    await page.evaluate(() => {
      window.tonConnect.connect({ address: 'EQC...', balance: '10' });
    });

    await page.click('text=Hedged Insurance');
    await page.selectOption('[data-testid="coverage-type"]', 'depeg');
    await page.fill('[data-testid="coverage-amount"]', '10000');
    await page.click('[data-testid="get-quote"]');
    await page.click('[data-testid="purchase-hedged"]');

    await expect(page.locator('[data-testid="error-message"]'))
      .toContainText('Insufficient balance');
  });

  // 10+ more user journey test cases...
});
```

#### Journey: LP Monitors Hedge Performance
```typescript
test.describe('LP Journey: Monitor Hedge ROI', () => {
  test('should view real-time hedge performance', async ({ page }) => {
    // Login as LP
    await page.goto('/lp-dashboard');
    await connectWallet(page, 'lp-address');

    // Navigate to hedge analytics
    await page.click('text=Hedge Performance');

    // Verify real-time metrics
    await expect(page.locator('[data-testid="total-hedged"]'))
      .toContainText(/\$[\d,]+/);

    await expect(page.locator('[data-testid="hedge-roi"]'))
      .toContainText(/[-+]?\d+\.\d+%/);

    // View breakdown by venue
    await page.click('[data-testid="venue-breakdown"]');

    const polymarketROI = await page.textContent('[data-testid="polymarket-roi"]');
    const perpsROI = await page.textContent('[data-testid="perpetuals-roi"]');
    const allianzROI = await page.textContent('[data-testid="allianz-roi"]');

    expect(polymarketROI).toMatch(/[-+]?\d+\.\d+%/);
    expect(perpsROI).toMatch(/[-+]?\d+\.\d+%/);
    expect(allianzROI).toMatch(/[-+]?\d+\.\d+%/);

    // Verify historical chart
    await expect(page.locator('[data-testid="hedge-chart"]'))
      .toBeVisible();
  });
});
```

### 4.2 Multi-Actor Scenario Tests

#### Scenario: High Volume Stress Test
```typescript
test.describe('Stress Test: 100 Concurrent Policies', () => {
  test('should handle 100 policies in 60 seconds', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, i) =>
        createHedgedPolicy({
          userAddress: `EQC-user-${i}`,
          coverageAmount: 1000 + i * 100,
          coverageType: ['depeg', 'exploit', 'bridge'][i % 3]
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    expect(successful).toBeGreaterThanOrEqual(95); // 95% success rate

    // Verify all hedges executed
    const hedgeStatus = await checkAllHedges();
    expect(hedgeStatus.pending).toBeLessThanOrEqual(10); // Max 10 pending
  });
});
```

---

## 5. Performance Testing

### 5.1 Load Testing

```typescript
import autocannon from 'autocannon';

describe('Performance: API Load Tests', () => {
  it('should handle 1000 req/sec on /premium/swing-quote', async () => {
    const result = await autocannon({
      url: 'http://localhost:3000/premium/swing-quote',
      connections: 100,
      duration: 30,
      pipelining: 10,
      method: 'GET',
      query: {
        coverageType: 'depeg',
        coverageAmount: 10000,
        durationDays: 30
      }
    });

    expect(result.requests.average).toBeGreaterThanOrEqual(1000);
    expect(result.latency.p99).toBeLessThanOrEqual(100); // <100ms p99
  });

  it('should handle 500 policy purchases per minute', async () => {
    const result = await autocannon({
      url: 'http://localhost:3000/policies/hedged',
      connections: 50,
      duration: 60,
      method: 'POST',
      body: JSON.stringify({
        userAddress: 'EQC...',
        coverageType: 'depeg',
        coverageAmount: 5000,
        durationDays: 30
      })
    });

    expect(result.requests.total).toBeGreaterThanOrEqual(500);
  });
});
```

### 5.2 Smart Contract Gas Benchmarks

```typescript
describe('Gas Usage Benchmarks', () => {
  it('create_hedged_policy should cost <0.05 TON', async () => {
    const result = await factory.send(user, {
      value: toNano('1'),
      body: createHedgedPolicy({ /* ... */ })
    });

    const gasUsed = result.transactions.reduce(
      (sum, tx) => sum + Number(tx.totalFees.coins),
      0
    );

    expect(gasUsed).toBeLessThan(toNano('0.05'));
  });

  it('update_hedge_prices should cost <0.01 TON', async () => {
    const result = await pricingOracle.send(keeper, {
      value: toNano('0.1'),
      body: updateHedgePrices({ /* ... */ })
    });

    const gasUsed = result.transactions[0].totalFees.coins;
    expect(Number(gasUsed)).toBeLessThan(toNano('0.01'));
  });
});
```

---

## 6. Test Data & Fixtures

### 6.1 Mock Data Generators

```typescript
// tests/fixtures/policies.ts
export function generateMockPolicy(overrides = {}) {
  return {
    id: Math.floor(Math.random() * 10000),
    userAddress: 'EQC' + randomHex(64),
    coverageType: randomChoice(['depeg', 'exploit', 'bridge']),
    coverageAmount: randomInt(1000, 100000),
    durationDays: randomChoice([7, 14, 30, 60, 90]),
    basePremium: randomInt(50, 500),
    hedgeCosts: {
      polymarket: randomInt(10, 200),
      perpetuals: randomInt(5, 100),
      allianz: randomInt(20, 150)
    },
    totalPremium: 0, // Calculated
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
    hedgeStatus: 'FILLED',
    ...overrides
  };
}

// tests/fixtures/market-data.ts
export function generateMarketData(scenario: 'bull' | 'bear' | 'volatile') {
  const scenarios = {
    bull: {
      polymarketOdds: randomInt(10, 50),     // 0.1-0.5% depeg probability
      perpFundingRate: randomInt(-100, -20), // Negative = longs pay shorts
      allianzQuote: randomInt(200, 400)      // $2-4 per $1000
    },
    bear: {
      polymarketOdds: randomInt(200, 500),   // 2-5% depeg probability
      perpFundingRate: randomInt(20, 100),   // Positive = shorts pay longs
      allianzQuote: randomInt(600, 1000)     // $6-10 per $1000
    },
    volatile: {
      polymarketOdds: randomInt(100, 300),
      perpFundingRate: randomInt(-50, 50),
      allianzQuote: randomInt(400, 700)
    }
  };

  return scenarios[scenario];
}
```

### 6.2 Test Scenarios

```typescript
// tests/scenarios/depeg-event.ts
export const DEPEG_EVENT_SCENARIO = {
  name: 'USDT Depegs to $0.95',
  setup: async () => {
    // Create 50 active policies
    const policies = await Promise.all(
      Array.from({ length: 50 }, () =>
        createHedgedPolicy({
          coverageType: 'depeg',
          coverageAmount: randomInt(5000, 50000)
        })
      )
    );

    return { policies };
  },
  trigger: async () => {
    // Simulate depeg event
    await mockPriceOracle.updatePrice({
      asset: 'USDT',
      price: 0.95,
      timestamp: Date.now()
    });
  },
  assertions: async ({ policies }) => {
    // All policies should trigger claims
    for (const policy of policies) {
      const claim = await claimsEngine.getClaim(policy.id);
      expect(claim.status).toBe('APPROVED');
    }

    // Hedges should settle automatically
    for (const policy of policies) {
      const hedgeSettlement = await hedgeCoordinator.getSettlement(policy.id);
      expect(hedgeSettlement.polymarketPayout).toBeGreaterThan(0);
      expect(hedgeSettlement.perpsPayout).toBeGreaterThan(0);
      expect(hedgeSettlement.allianzPayout).toBeGreaterThan(0);
    }

    // Total payout should match 80/20 split
    const totalPayout = policies.reduce((sum, p) => sum + p.coverageAmount, 0);
    const onChainPayout = totalPayout * 0.8;
    const hedgePayout = totalPayout * 0.2;

    const actualOnChain = await primaryVault.getTotalPaidOut();
    const actualHedge = await hedgeCoordinator.getTotalSettled();

    expect(actualOnChain).toBeCloseTo(onChainPayout, -2); // Within 1%
    expect(actualHedge).toBeCloseTo(hedgePayout, -2);
  }
};
```

---

## 7. CI/CD Integration

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/hedging-tests.yml
name: Hedged Insurance Tests

on:
  push:
    branches: [main, develop]
    paths:
      - 'hedging/**'
      - 'contracts/hedged/**'
      - 'tests/hedging/**'
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test-suite:
          - contracts
          - services
          - connectors
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ${{ matrix.test-suite }} unit tests
        run: npm run test:unit:${{ matrix.test-suite }}

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/${{ matrix.test-suite }}/coverage-final.json
          flags: unit-${{ matrix.test-suite }}

  integration-tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Start mock API servers
        run: |
          npm run mock:polymarket &
          npm run mock:perpetuals &
          npm run mock:allianz &
          sleep 5

      - name: Run integration tests
        run: npm run test:integration
        env:
          POLYMARKET_API_URL: http://localhost:3001
          BINANCE_API_URL: http://localhost:3002
          ALLIANZ_API_URL: http://localhost:3003

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/integration/coverage-final.json
          flags: integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Start application
        run: npm start &

      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-results
          path: test-results/

  coverage-check:
    needs: [unit-tests, integration-tests, e2e-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Download all coverage reports
        uses: actions/download-artifact@v3

      - name: Merge coverage reports
        run: npm run coverage:merge

      - name: Check coverage thresholds
        run: npm run coverage:check
        # Fails if:
        # - Unit tests < 90%
        # - Integration tests < 85%
        # - E2E tests < 75%
```

### 7.2 Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:changed && npm run lint",
      "pre-push": "npm run test:integration"
    }
  }
}
```

---

## 8. Test Coverage Requirements

### 8.1 Coverage Thresholds

```json
// jest.config.ts
{
  "coverageThreshold": {
    "global": {
      "branches": 85,
      "functions": 90,
      "lines": 90,
      "statements": 90
    },
    "contracts/**/*.ts": {
      "branches": 95,
      "functions": 95,
      "lines": 95,
      "statements": 95
    },
    "hedging/services/**/*.ts": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    },
    "hedging/connectors/**/*.ts": {
      "branches": 85,
      "functions": 85,
      "lines": 85,
      "statements": 85
    }
  }
}
```

### 8.2 Untested Code Enforcement

```typescript
// scripts/check-coverage.ts
import { readFileSync } from 'fs';

const coverage = JSON.parse(readFileSync('./coverage/coverage-summary.json', 'utf8'));

const failed: string[] = [];

for (const [file, metrics] of Object.entries(coverage)) {
  if (metrics.lines.pct < 90) {
    failed.push(`${file}: ${metrics.lines.pct}% line coverage (requires 90%)`);
  }
}

if (failed.length > 0) {
  console.error('Coverage check failed:\n' + failed.join('\n'));
  process.exit(1);
}

console.log('✅ All coverage thresholds met');
```

---

## 9. Test Execution Plan

### 9.1 Local Development

```bash
# Run all tests
npm test

# Run specific suites
npm run test:unit               # All unit tests
npm run test:unit:contracts     # Contract unit tests only
npm run test:unit:services      # Service unit tests only
npm run test:integration        # Integration tests
npm run test:e2e                # E2E tests

# Watch mode for TDD
npm run test:watch

# Coverage report
npm run test:coverage
open coverage/lcov-report/index.html
```

### 9.2 CI Pipeline

```
Pull Request:
1. Lint & Type Check (2 min)
2. Unit Tests - Contracts (5 min)
3. Unit Tests - Services (5 min)
4. Unit Tests - Connectors (3 min)
5. Integration Tests (10 min)
6. E2E Tests (15 min)
7. Coverage Check (2 min)
Total: ~42 minutes

Main Branch Merge:
1-7. Same as PR
8. Deploy to Testnet (5 min)
9. Run Testnet Smoke Tests (10 min)
Total: ~57 minutes
```

---

## 10. Testing Best Practices

### 10.1 Test Naming Convention

```typescript
// ✅ Good
it('should reject policy if coverage exceeds pool capacity')
it('should calculate swing premium with 3 hedge sources')
it('should retry Polymarket order on rate limit (429)')

// ❌ Bad
it('works')
it('test policy creation')
it('handles errors')
```

### 10.2 AAA Pattern (Arrange-Act-Assert)

```typescript
it('should apply 10% discount for coverage >$50k', async () => {
  // Arrange
  const largeCoverage = toNano('75000');
  await setupPricingOracle({ baseRate: 0.01 });

  // Act
  const result = await factory.send(user, {
    value: toNano('100'),
    body: createHedgedPolicy({
      coverageAmount: largeCoverage
    })
  });

  // Assert
  const premium = await factory.getLastPolicyPremium();
  const expectedBase = 750; // 75000 * 0.01
  const expectedWithDiscount = 675; // 750 * 0.9
  expect(premium.basePremium).toBe(toNano(expectedWithDiscount.toString()));
});
```

### 10.3 Test Independence

```typescript
// ✅ Good - Each test is independent
beforeEach(async () => {
  blockchain = await Blockchain.create();
  factory = blockchain.openContract(/* ... */);
});

// ❌ Bad - Tests depend on execution order
let sharedPolicy;
it('creates policy', async () => {
  sharedPolicy = await createPolicy();
});
it('files claim', async () => {
  await fileClaim(sharedPolicy.id); // Breaks if first test fails
});
```

---

## 11. Mock API Servers (For Testing)

### 11.1 Mock Polymarket Server

```typescript
// tests/mocks/servers/polymarket.ts
import express from 'express';

const app = express();
app.use(express.json());

let marketData = {
  'usdt-depeg-q1-2025': {
    yesPrice: 0.025,
    noPrice: 0.975,
    liquidity: 500000
  }
};

app.get('/markets/:marketId', (req, res) => {
  const data = marketData[req.params.marketId];
  if (!data) return res.status(404).json({ error: 'Market not found' });
  res.json(data);
});

app.post('/order', (req, res) => {
  const { market, side, size } = req.body;

  // Simulate 100ms latency
  setTimeout(() => {
    res.json({
      orderId: `pm-${Date.now()}`,
      status: 'FILLED',
      fillPrice: marketData[market].yesPrice,
      size
    });
  }, 100);
});

// Admin endpoint to update mock data
app.post('/admin/update-market', (req, res) => {
  marketData[req.body.marketId] = req.body.data;
  res.json({ success: true });
});

app.listen(3001, () => console.log('Mock Polymarket on :3001'));
```

---

## 12. Test Maintenance

### 12.1 Quarterly Test Review

- **Q1**: Review all unit tests, remove duplicates, update fixtures
- **Q2**: Update E2E tests for new features, refresh screenshots
- **Q3**: Performance test benchmarks review, update thresholds
- **Q4**: Integration test review, mock API update

### 12.2 Test Debt Tracking

```typescript
// Mark flaky tests for investigation
it.skip('should handle concurrent hedge executions', async () => {
  // TODO: Flaky - investigate race condition
  // Skipped on 2025-10-09 by @alice
  // Related issue: #234
});

// Mark slow tests
it('should process 1000 policies', async () => {
  // SLOW: ~30 seconds
  // Consider splitting into smaller tests
}, 60000);
```

---

## Summary

This testing strategy ensures the Tonsurance Hedged Insurance product is production-ready through:

1. **Comprehensive Coverage**: 90%+ unit, 85%+ integration, 75%+ E2E
2. **Test-First Development**: All features tested before implementation
3. **Realistic Scenarios**: Market-based test data, multi-actor flows
4. **Performance Validation**: Load tests, gas benchmarks, latency checks
5. **Automated CI/CD**: GitHub Actions, pre-commit hooks, coverage enforcement
6. **Mock Infrastructure**: Isolated testing without external dependencies

**Total Test Count Estimate**: 180+ unit tests, 50+ integration tests, 25+ E2E scenarios = **255+ tests**

All tests must pass before Phase 4 implementation begins.
