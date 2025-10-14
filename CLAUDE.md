# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Tonsurance is a TON blockchain smart contract project built using the Blueprint framework. The project uses FunC for smart contract development and TypeScript for wrappers, tests, and deployment scripts.

## Key Commands

### Building Contracts
```bash
npx blueprint build
# or
yarn blueprint build
```

### Running Tests
```bash
npx blueprint test
# or
yarn test  # Uses jest directly with verbose output
```

To run a single test file:
```bash
jest tests/Token.spec.ts --verbose
```

### Deployment and Scripts
```bash
npx blueprint run
# or
yarn start
```

### Creating New Contracts
```bash
npx blueprint create ContractName
# or
yarn blueprint create ContractName
```

This scaffolds a new contract with:
- Contract source file in `contracts/`
- Wrapper class in `wrappers/ContractName.ts`
- Compile configuration in `wrappers/ContractName.compile.ts`
- Test file in `tests/ContractName.spec.ts`
- Deployment script in `scripts/deployContractName.ts`

## Architecture

### Product Lines

Tonsurance offers **two distinct insurance products**:

1. **Core Insurance (Phase 1-3)**:
   - 100% on-chain collateral
   - Fixed APR-based pricing (e.g., 0.8% APR)
   - Three-tier vault system: Primary (45%), Secondary (20%), TradFi Buffer (10%), Reserve (25%)
   - Retail/Telegram-focused
   - Contracts: `PolicyFactory.fc`, `PremiumCalculator.fc`

2. **Hedged Insurance (Phase 4)**:
   - 80% on-chain + 20% external hedges
   - Dynamic swing pricing (updates every 5 seconds)
   - External hedge venues: Polymarket (40%), Perpetuals (40%), Allianz Parametric (20%)
   - 15-30% lower premiums when hedge markets favorable
   - Institutional/DeFi-native users
   - Contracts: `HedgedPolicyFactory.fc`, `PricingOracle.fc`, `HedgeCoordinator.fc`

**Shared Infrastructure**:
- Same three-tier vaults (Primary, Secondary, TradFi Buffer)
- Same claims engine and oracles
- Same multi-party reward distribution

### Contract Structure
- **contracts/**: FunC smart contract source files (.fc)
  - `contracts/core/`: Core Insurance contracts (fixed pricing)
  - `contracts/hedged/`: Hedged Insurance contracts (swing pricing)
  - `contracts/shared/`: Shared contracts (vaults, claims, oracles)
  - `contracts/imports/`: Shared FunC libraries (e.g., stdlib.fc)
  - Contracts must include stdlib.fc for standard library functions

### Wrapper Pattern
Each contract has a corresponding TypeScript wrapper class in `wrappers/`:
- Implements the `Contract` interface from `@ton/core`
- Contains:
  - Config type definition (e.g., `TokenConfig`)
  - `configToCell()` function for serializing config to Cell
  - Static `createFromConfig()` and `createFromAddress()` factory methods
  - Methods for sending messages to the contract (e.g., `sendDeploy()`)
  - Getter methods for retrieving contract data

### Compilation
- `wrappers/*.compile.ts` files define compilation targets
- Specify language (`func`, `tact`, or `tolk`) and target source files
- Used by Blueprint's `compile()` function

### Testing
- Uses Jest with `@ton/sandbox` for local blockchain simulation
- Test structure:
  - `beforeAll`: Compile contract code
  - `beforeEach`: Create fresh blockchain instance and deploy contract
  - Tests use `SandboxContract` wrappers and `TreasuryContract` for test wallets
  - Assertions use `toHaveTransaction()` matcher from `@ton/test-utils`

### Deployment
- Scripts in `scripts/` export a `run(provider: NetworkProvider)` function
- Blueprint CLI prompts for network selection (testnet/mainnet) and wallet
- Uses `provider.waitForDeploy()` to confirm deployment

## Technology Stack

### Blockchain Layer
- **Smart Contracts**: FunC (also supports Tact and Tolk via compiler configs)
- **Framework**: Blueprint
- **Testing**: Jest with @ton/sandbox (local blockchain) and @ton/test-utils
- **Build**: TypeScript with ts-jest
- **Blockchain SDK**: @ton/core, @ton/ton, @ton/crypto

### Off-Chain Services (Phase 4 Hedging)
- **Runtime**: Node.js + TypeScript
- **Services**:
  - `RiskCalculator`: Calculates total exposure by coverage type, determines hedge requirements
  - `HedgeOptimizer`: Optimizes hedge allocation across 3 venues based on cost/liquidity
  - `PricingOracleKeeper`: Updates on-chain oracle every 5 seconds with hedge costs
  - `HedgeExecutionKeepers`: Execute hedges on Polymarket, Binance Futures, Allianz
- **External Integrations**:
  - Polymarket CLOB API (prediction markets)
  - Binance Futures API (perpetual contracts)
  - Allianz Parametric Insurance API (tradfi reinsurance)
- **Infrastructure**:
  - PostgreSQL (policy/hedge position storage)
  - Redis (premium quote caching)
  - WebSocket server (real-time premium updates to frontend)

### Frontend
- **Framework**: React + Vite + TypeScript
- **Wallet**: TON Connect (supports Tonkeeper, TonHub, OpenMask)
- **UI**: Tailwind CSS, Recharts (analytics)

## Development Phases

### Phase 1-3: Core Insurance (Current)
Implemented contracts:
- `PolicyFactory.fc`: Creates policies with fixed APR pricing
- `PremiumCalculator.fc`: Calculates premiums based on coverage amount × duration × APR
- `PrimaryVault.fc`: First-loss capital from crypto LPs (45% allocation)
- `SecondaryVault.fc`: Second-loss capital from SURE stakers (20%)
- `TradFiBuffer.fc`: Third-loss capital from institutions (10%)
- `ClaimsEngine.fc`: Validates and processes claims
- Multi-party reward distribution to 8+ parties

### Phase 4: Hedged Insurance (Planned)
New contracts:
- `HedgedPolicyFactory.fc`: Creates policies with swing pricing (base + hedge costs)
- `PricingOracle.fc`: Stores real-time hedge costs from 3 external sources, updated every 5s
- `HedgeCoordinator.fc`: Tracks hedge positions per policy, coordinates liquidation on claims

Off-chain components:
- `PricingOracleKeeper`: Fetches hedge costs and updates oracle
- `PolymarketKeeper`, `PerpKeeper`, `AllianzKeeper`: Execute/liquidate hedges
- `RiskCalculator`, `HedgeOptimizer`: Calculate exposure and optimal hedge allocation
- REST API + WebSocket for premium quotes and hedge status

### Phase 5: Advanced Features (Future)
- ML-based hedge optimization
- Dynamic venue allocation (adaptive to market conditions)
- Additional hedge venues (options, cross-chain)
- Automated rebalancing

## Key Documentation

Comprehensive planning documents in repository root:
- **DEVELOPMENT_PLAN.md**: Full roadmap with Phase 1-5 breakdown
- **HEDGED_ARCHITECTURE.md**: Complete system design for Phase 4 (contracts, services, APIs)
- **TESTING_STRATEGY.md**: Test-first development plan (unit, integration, E2E, 90%+ coverage)
- **DESIGN_DECISIONS.md**: Architectural decisions with rationale (two-product strategy, 80/20 split, swing pricing)
- **TECHNICAL_SPEC.md**: Smart contract specifications for Phase 1-3
- **PRD.md**: Product requirements, user personas, journeys
- **SUBAGENT_TASKS.md**: Detailed task breakdown for specialized AI agents

## Testing Strategy

Tonsurance follows **test-first development** with strict coverage requirements:

### Coverage Thresholds
- **Smart Contracts**: 95%+ (critical financial logic)
- **Off-Chain Services**: 90%+
- **Integration Tests**: 85%+
- **End-to-End**: 75%+

### Test Organization
```
tests/
├── unit/
│   ├── contracts/       # FunC contract unit tests (TON Sandbox)
│   ├── services/        # TypeScript service unit tests
│   └── utils/           # Utility function tests
├── integration/
│   ├── contract-service/  # Contract + wrapper integration
│   ├── api/             # REST/WebSocket API tests
│   └── hedging/         # Cross-component hedging tests
├── e2e/
│   ├── journeys/        # Full user journey tests (Playwright)
│   └── scenarios/       # Multi-actor scenario tests
├── mocks/
│   ├── polymarket.ts    # Mock Polymarket API responses
│   ├── perpetuals.ts    # Mock Binance API
│   └── allianz.ts       # Mock Allianz API
└── fixtures/
    ├── policies.ts      # Sample policy data
    ├── market-data.ts   # Realistic market prices
    └── hedge-responses.ts  # External API responses
```

### Running Tests
```bash
# All tests
npm test

# Specific suites
npm run test:unit               # All unit tests
npm run test:unit:contracts     # Contract unit tests only
npm run test:unit:services      # Service unit tests only
npm run test:integration        # Integration tests
npm run test:e2e                # E2E tests (Playwright)

# Watch mode (TDD)
npm run test:watch

# Coverage report
npm run test:coverage
open coverage/lcov-report/index.html
```

### CI/CD Pipeline
GitHub Actions workflow (`.github/workflows/hedging-tests.yml`):
1. Lint & Type Check (2 min)
2. Unit Tests - Contracts (5 min)
3. Unit Tests - Services (5 min)
4. Integration Tests (10 min)
5. E2E Tests (15 min)
6. Coverage Check (2 min)
7. Deploy to Testnet (on main branch)

Total: ~42 min per PR, ~57 min for main branch merge

## Hedged Insurance Architecture (Phase 4)

### Swing Pricing Model
Premium = Base Premium + Σ(Hedge Costs from 3 venues)

**Example Calculation**:
```
Coverage: $10,000 USDT depeg insurance
Duration: 30 days

Base Premium:
  $10,000 × 0.8% APR × (30/365) = $6.58

Hedge Costs (from PricingOracle):
  Polymarket (40%):
    Market odds: 2.5% (YES on "USDT < $0.98 in Q1")
    Cost: $10,000 × 0.025 × 0.4 = $100

  Perpetuals (40%):
    Funding rate: -0.5% daily (negative = we earn)
    Cost: $10,000 × 0.005 × 30 × 0.4 = $60

  Allianz (20%):
    Quote: $4.50 per $1,000
    Cost: $10,000 × 0.0045 × 0.2 = $9

Total Hedge Cost: $100 + $60 + $9 = $169
Total Premium: $6.58 + $169 = $175.58 (vs. $350 for Core Insurance)
Savings: 50% (when hedges cheap)
```

### Policy Purchase Flow
```
1. User requests quote → Frontend calls GET /premium/swing-quote
2. API fetches latest hedge costs from PricingOracle (on-chain)
3. Calculate total premium, cache for 30 seconds
4. User approves → Transaction to HedgedPolicyFactory.create_hedged_policy()
5. Factory creates policy immediately, sends async messages to 3 keepers
6. User receives policy confirmation (<5 sec)
7. Keepers execute hedges in parallel (5-10 sec background):
   - PolymarketKeeper: Buy YES shares on prediction market
   - PerpKeeper: Open short position on Binance TONUSDT
   - AllianzKeeper: Bind parametric insurance coverage
8. Keepers report back to HedgeCoordinator with external order IDs
9. User sees hedge status updates via WebSocket
```

### Claim Payout Flow (Hedged Policies)
```
1. Claim approved by ClaimsEngine
2. IMMEDIATELY pay 100% to user:
   - 80% from PrimaryVault (on-chain collateral)
   - 20% from Reserve (temporary float)
3. Total payout time: <5 seconds
4. SIMULTANEOUSLY trigger hedge liquidation:
   - PolymarketKeeper: Sell YES position (market order)
   - PerpKeeper: Close short position
   - AllianzKeeper: File claim for parametric payout
5. Hedge settlements arrive (30s - 5 min):
   - Polymarket: Instant settlement to USDC → swap to TON
   - Perpetuals: Instant PnL settlement
   - Allianz: 3-5 day payout (via traditional banking)
6. HedgeCoordinator receives proceeds, refills Reserve vault
7. Net result: User paid instantly, Reserve self-heals from hedge proceeds
```

### 80/20 Capital Allocation
For $10M total coverage:

**On-Chain (80% = $8M)**:
- Primary Vault: $4.5M (45% - crypto LPs, first loss)
- Secondary Vault: $2M (20% - SURE stakers, second loss)
- TradFi Buffer: $1M (10% - institutions, third loss)
- Reserve: $2.5M (25% - protocol reserve, hedge float)

**External Hedges (20% = $2M)**:
- Polymarket: $800k (40% - prediction markets)
- Perpetuals: $800k (40% - perp futures)
- Allianz: $400k (20% - tradfi reinsurance)

**Capital Efficiency**: 250% (vs. 200% for Core Insurance, 100-150% for traditional insurance)

## Important Notes
- Jest caching is disabled in config to prevent stale Tact compilation artifacts
- Test environment is `@ton/sandbox/jest-environment`
- TypeScript strict mode is enabled
- Working directory is `Tonsurance/` subdirectory, not repository root
- **All Phase 4 features require passing 255+ tests before implementation begins** (see TESTING_STRATEGY.md)
- External API keys stored in AWS Secrets Manager (never committed to repo)
- Multi-sig required for mainnet admin functions (3-of-5)
- Gradual rollout: Testnet → 2 week beta → Mainnet with increasing coverage limits
