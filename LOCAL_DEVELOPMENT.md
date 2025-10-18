# Local Development Guide

Complete guide for setting up and running Tonsurance locally.

**Last Updated:** October 15, 2025
**Version:** 1.0

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Architecture Overview](#architecture-overview)
4. [Running the Stack](#running-the-stack)
5. [Development Workflow](#development-workflow)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Troubleshooting](#troubleshooting)
9. [Appendix](#appendix)

---

## 1. Prerequisites

### Required Software

#### Node.js 18+
Tonsurance uses Node.js for smart contract compilation, testing, and frontend development.

**macOS:**
```bash
# Using Homebrew
brew install node@18

# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Linux:**
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Or using apt (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows (WSL2):**
```bash
# Use WSL2 with Ubuntu, then follow Linux instructions
wsl --install -d Ubuntu-22.04
```

#### OCaml 4.14+ (Backend)
OCaml powers the backend services including API server, oracle keepers, and risk calculators.

**Install OPAM (OCaml Package Manager):**
```bash
# macOS
brew install opam

# Linux
sudo apt-get install opam

# Initialize OPAM
opam init -y
eval $(opam env)
```

**Install OCaml 4.14.1:**
```bash
opam switch create 4.14.1
eval $(opam env)

# Verify installation
ocaml --version  # Should show 4.14.1
```

**Install OCaml Dependencies:**
```bash
cd backend
opam install . --deps-only --with-test
```

#### Docker Desktop
Docker runs PostgreSQL, Redis, and other infrastructure services.

**macOS:**
```bash
# Download from https://www.docker.com/products/docker-desktop
# Or using Homebrew
brew install --cask docker
```

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

**Verify Docker:**
```bash
docker --version
docker-compose --version
docker ps  # Should run without errors
```

#### PostgreSQL Client
For database management and debugging.

```bash
# macOS
brew install postgresql@15

# Linux
sudo apt-get install postgresql-client-15

# Verify
psql --version
```

### Verify Installation

Run this script to verify all prerequisites:

```bash
#!/bin/bash
echo "Checking prerequisites..."

# Node.js
node_version=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -ge 18 ]; then
    echo "✓ Node.js $(node --version)"
else
    echo "✗ Node.js 18+ required (found: $(node --version 2>/dev/null || echo 'none'))"
fi

# OCaml
ocaml_version=$(ocaml --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+')
echo "✓ OCaml $ocaml_version"

# Docker
docker --version &>/dev/null && echo "✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')" || echo "✗ Docker not found"

# PostgreSQL client
psql --version &>/dev/null && echo "✓ PostgreSQL client $(psql --version | cut -d' ' -f3)" || echo "✗ psql not found"

echo "Prerequisites check complete!"
```

---

## 2. Installation

### Clone Repository

```bash
# Clone the repository
git clone https://github.com/HobanSearch/Tonsurance.git
cd Tonsurance

# Verify you're in the correct directory
ls -la
# Should see: backend/, frontend/, contracts/, wrappers/, tests/, etc.
```

### Install Dependencies

#### Root Dependencies (Smart Contracts)
```bash
# Install Blueprint and TON SDK
npm install

# Verify Blueprint is working
npx blueprint --version
```

#### Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

#### Backend Dependencies (OCaml)
```bash
cd backend

# Install all OCaml dependencies
opam install . --deps-only --with-test

# Build backend
dune build

# Verify build succeeded
ls _build/default/api/api_v2.exe  # Should exist
cd ..
```

### Configure Environment

#### Create Environment Files

**1. Root `.env` (Infrastructure)**
```bash
cp .env.example .env
```

Edit `.env`:
```bash
# API Server
API_PORT=8080
API_HOST=0.0.0.0
LOG_LEVEL=info

# Database
POSTGRES_PASSWORD=tonsurance_local_dev
DATABASE_URL=postgresql://tonsurance:tonsurance_local_dev@localhost:5432/tonsurance

# Cache & Queue
REDIS_URL=redis://localhost:6379
RABBITMQ_PASSWORD=tonsurance_local_dev
RABBITMQ_URL=amqp://tonsurance:tonsurance_local_dev@localhost:5672

# TON Blockchain (Testnet)
TON_MAINNET=false
TON_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_ton_api_key_here

# Optional: Get free API key from https://toncenter.com
# Leave blank to use public endpoints (slower)

# Development
ENVIRONMENT=development
DEBUG=true
```

**2. Frontend `.env`**
```bash
cd frontend
cat > .env << 'EOF'
# Backend API endpoints
VITE_BACKEND_API_URL=http://localhost:8080
VITE_BACKEND_WS_URL=ws://localhost:8081

# TON Network
VITE_TON_NETWORK=testnet

# Contract addresses (will be filled after deployment)
VITE_POLICY_FACTORY_ADDRESS=
VITE_MULTI_TRANCHE_VAULT_ADDRESS=
VITE_PRICING_ORACLE_ADDRESS=
VITE_POLICY_ROUTER_ADDRESS=
EOF
cd ..
```

**3. TON Wallet Setup (for contract deployment)**

You need a TON testnet wallet with test TON to deploy contracts.

```bash
# Generate a new wallet or use existing mnemonic
# Option 1: Create new wallet
npx blueprint create-wallet --testnet

# Option 2: Use existing wallet
# Add to root .env:
echo 'TON_WALLET_MNEMONIC="your 24 word mnemonic phrase here"' >> .env

# Get testnet TON from faucet
# Visit: https://t.me/testgiver_ton_bot
# Send your testnet address
# You'll receive 2-5 test TON (enough for deployment)
```

---

## 3. Architecture Overview

### System Components

```
┌──────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │        Frontend (React + Vite + TON Connect)           │  │
│  │  http://localhost:5173                                 │  │
│  └────────┬──────────────────────────┬────────────────────┘  │
└───────────┼──────────────────────────┼───────────────────────┘
            │                          │
            │ REST API                 │ WebSocket
            │ (port 8080)              │ (port 8081)
            ▼                          ▼
┌──────────────────────────────────────────────────────────────┐
│                     BACKEND SERVICES (OCaml)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  API Server  │  │  WebSocket   │  │ Oracle       │       │
│  │  api_v2.ml   │  │  Server      │  │ Aggregator   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                          │                                   │
│              ┌───────────┴──────────┐                        │
│              ▼                      ▼                        │
│    ┌──────────────────┐  ┌──────────────────┐               │
│    │   PostgreSQL     │  │      Redis       │               │
│    │  + TimescaleDB   │  │   (Caching)      │               │
│    │  (port 5432)     │  │   (port 6379)    │               │
│    └──────────────────┘  └──────────────────┘               │
└──────────────────────────────────────────────────────────────┘
            │
            │ JSON-RPC
            ▼
┌──────────────────────────────────────────────────────────────┐
│                   TON BLOCKCHAIN (Testnet)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ PolicyFactory│  │MultiTranche  │  │ Pricing      │       │
│  │     .fc      │  │  Vault.fc    │  │ Oracle.fc    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────────────────────────┐     │
│  │ PolicyRouter │  │ 256 PolicyShards (on-demand)     │     │
│  │     .fc      │  │ (horizontal scaling)             │     │
│  └──────────────┘  └──────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
            ▲
            │
┌───────────┴───────────────────────────────────────────────────┐
│                    EXTERNAL DATA SOURCES                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ RedStone │  │   Pyth   │  │Chainlink │  │ Bridge   │      │
│  │  (40%)   │  │  (35%)   │  │  (25%)   │  │ Monitors │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow: Policy Purchase

```
1. User connects wallet
   └─→ TON Connect UI (Tonkeeper, TonHub, OpenMask)

2. User selects product (chain, stablecoin, coverage)
   └─→ Frontend calls GET /api/v2/pricing/dynamic-quote

3. Backend aggregates market data
   ├─→ Fetch stablecoin price from 3 oracles (RedStone, Pyth, Chainlink)
   ├─→ Get bridge health scores
   ├─→ Check CEX liquidation rates
   └─→ Calculate risk multiplier (base × chain × asset × volatility)

4. Frontend displays quote + live updates
   └─→ WebSocket connection receives real-time price changes (every 60s)

5. User approves purchase
   ├─→ Frontend calls policyFactory.sendCreatePolicy()
   └─→ Transaction sent to TON blockchain

6. Smart contract creates policy
   ├─→ PolicyFactory.fc validates parameters
   ├─→ Routes to PolicyRouter → PolicyShard (sharding for scalability)
   ├─→ Transfers premium to MultiTrancheVault
   └─→ Emits policy_created event

7. Backend captures event
   ├─→ Event subscriber listens to blockchain
   ├─→ Inserts policy into PostgreSQL
   └─→ WebSocket broadcasts policy_created to frontend

8. User sees policy in dashboard
   └─→ PolicyList.tsx displays active policies
```

---

## 4. Running the Stack

### Quick Start (3 Commands)

Open 3 terminal windows:

**Terminal 1 - Infrastructure (Docker)**
```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Start PostgreSQL, Redis, RabbitMQ
docker-compose up -d

# Verify services are running
docker ps
# Should show: tonsurance-postgres, tonsurance-redis, tonsurance-rabbitmq
```

**Terminal 2 - Backend (OCaml)**
```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/backend

# Build backend
dune build

# Run API server
dune exec -- api/api_v2.exe

# API should start on http://localhost:8080
# Logs will show: "API server listening on 0.0.0.0:8080"
```

**Terminal 3 - Frontend (React)**
```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/frontend

# Start Vite dev server
npm run dev

# Frontend should start on http://localhost:5173
# Open browser to http://localhost:5173
```

### Detailed Startup

#### 4.1 Infrastructure Setup

**Start Docker Services:**
```bash
# Navigate to project root
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Start all infrastructure services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service health
docker-compose ps
```

**Expected output:**
```
NAME                    STATUS         PORTS
tonsurance-postgres     Up (healthy)   0.0.0.0:5432->5432/tcp
tonsurance-redis        Up (healthy)   0.0.0.0:6379->6379/tcp
tonsurance-rabbitmq     Up (healthy)   0.0.0.0:5672->5672/tcp, 0.0.0.0:15672->15672/tcp
```

**Initialize Database:**
```bash
# Run migrations
cd backend/migrations
psql $DATABASE_URL -f 001_initial_schema.sql
psql $DATABASE_URL -f 002_add_policy_sharding.sql
psql $DATABASE_URL -f 003_add_tranche_apy_tracking.sql

# Verify tables created
psql $DATABASE_URL -c "\dt"
# Should show: policies, vault_tranches, bridge_health, risk_alerts, etc.
```

**Test Redis Connection:**
```bash
docker exec -it tonsurance-redis redis-cli ping
# Should return: PONG

# Test set/get
docker exec -it tonsurance-redis redis-cli SET test "Hello Tonsurance"
docker exec -it tonsurance-redis redis-cli GET test
# Should return: "Hello Tonsurance"
```

#### 4.2 Backend Services

**Option A: Run API Server Only**
```bash
cd backend

# Build
dune build

# Run API server (includes WebSocket server)
dune exec -- api/api_v2.exe

# You should see:
# [INFO] API server starting...
# [INFO] WebSocket server listening on 0.0.0.0:8081
# [INFO] API server listening on 0.0.0.0:8080
```

**Option B: Run All Services (API + Oracle Keepers)**

Open 3 separate terminals:

```bash
# Terminal 1: API Server
cd backend
dune exec -- api/api_v2.exe

# Terminal 2: Pricing Oracle Keeper (updates on-chain oracle every 60s)
cd backend
dune exec -- daemons/pricing_oracle_keeper.exe

# Terminal 3: Bridge Health Monitor
cd backend
dune exec -- monitoring/bridge_monitor.exe
```

**Test API Endpoints:**
```bash
# Health check
curl http://localhost:8080/health
# Expected: {"status":"healthy","service":"api_v2","uptime":123}

# Get dynamic quote
curl -X POST http://localhost:8080/api/v2/quote/multi-dimensional \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "Depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 30
  }'
# Expected: {"base_premium":65.75,"final_premium":218.43,...}
```

#### 4.3 Deploy Smart Contracts (First Time Only)

Before running the frontend, you need to deploy contracts to testnet:

```bash
# Build all contracts
npx blueprint build

# Deploy PricingOracle
npx blueprint run deployPricingOracle --testnet
# Copy the deployed address to frontend/.env as VITE_PRICING_ORACLE_ADDRESS

# Deploy MultiTrancheVault
npx blueprint run deployMultiTrancheVault --testnet
# Copy address to VITE_MULTI_TRANCHE_VAULT_ADDRESS

# Deploy PolicyRouter + PolicyShards
npx blueprint run deployPolicySharding --testnet
# Copy PolicyRouter address to VITE_POLICY_ROUTER_ADDRESS

# Your frontend/.env should now look like:
# VITE_PRICING_ORACLE_ADDRESS=EQC...
# VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQD...
# VITE_POLICY_ROUTER_ADDRESS=EQE...
```

**Note:** Deployment costs ~0.5-1.0 TON per contract. Ensure your testnet wallet has at least 5 TON.

#### 4.4 Frontend Development Server

```bash
cd frontend

# Start Vite dev server
npm run dev

# You should see:
#   VITE v7.1.7  ready in 823 ms
#
#   ➜  Local:   http://localhost:5173/
#   ➜  Network: http://192.168.1.100:5173/
#   ➜  press h + enter to show help

# Open browser to http://localhost:5173
```

**First-Time Setup in UI:**
1. Click "Connect Wallet" (top right)
2. Select Tonkeeper or TonHub
3. Approve connection
4. You should see your wallet address and balance

### Verification Checklist

- [ ] PostgreSQL running: `docker ps | grep postgres`
- [ ] Redis running: `docker exec tonsurance-redis redis-cli ping`
- [ ] API responds: `curl http://localhost:8080/health`
- [ ] WebSocket listening: `nc -z localhost 8081`
- [ ] Frontend loads: Navigate to `http://localhost:5173`
- [ ] Contracts deployed: Check frontend/.env has addresses
- [ ] Wallet connected: Click "Connect Wallet" in UI

---

## 5. Development Workflow

### Making Changes

#### Smart Contracts (FunC)

**1. Edit Contract**
```bash
# Example: Add a new function to PolicyFactory
nano contracts/core/PolicyFactory.fc
```

**2. Recompile**
```bash
# Blueprint automatically detects changes
npx blueprint build

# Or compile specific contract
npx blueprint build PolicyFactory
```

**3. Run Tests**
```bash
# Run all contract tests
npx blueprint test

# Run specific test file
npx blueprint test tests/PolicyFactory.spec.ts

# Watch mode (auto-rerun on changes)
npx jest --watch tests/PolicyFactory.spec.ts
```

**4. Deploy to Testnet**
```bash
# Deploy updated contract
npx blueprint run deployPolicyFactory --testnet

# Update frontend/.env with new address
# Note: Old policies will still exist at old contract address
```

#### Backend (OCaml)

**1. Edit Source**
```bash
# Example: Add new API endpoint
nano backend/api/api_v2.ml
```

**2. Rebuild**
```bash
cd backend

# Incremental build (fast)
dune build

# Clean build (if you encounter issues)
dune clean && dune build
```

**3. Run Tests**
```bash
# Run all backend tests
cd backend
dune test

# Run specific test suite
dune exec -- test/test_pricing_engine.exe

# Run with verbose output
dune test --verbose
```

**4. Restart Services**
```bash
# Stop current API server (Ctrl+C)
# Restart with new build
dune exec -- api/api_v2.exe

# Or use auto-restart with watchexec (install: brew install watchexec)
watchexec -r -e ml,mli -w backend/api dune exec -- api/api_v2.exe
```

**5. Check Logs**
```bash
# View API logs
tail -f logs/api.log

# View all backend logs
tail -f logs/*.log

# Search for errors
grep -i error logs/api.log
```

#### Frontend (React + TypeScript)

**1. Edit Component**
```bash
nano frontend/src/pages/PolicyPurchase.tsx
```

**2. Hot Reload (Automatic)**
Vite automatically reloads changes. Just save the file and check your browser.

**3. Type Check**
```bash
cd frontend

# Check TypeScript errors
npm run build
# or
tsc --noEmit
```

**4. Lint**
```bash
cd frontend
npm run lint
```

**5. Test**
```bash
cd frontend

# Run unit tests (if configured)
npm test

# Run E2E tests (Playwright - if configured)
npm run test:e2e
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/add-new-coverage-type

# Make changes, add files
git add .

# Commit with descriptive message
git commit -m "Add CEX liquidation coverage type

- Add CEX_liquidation to coverage_type enum
- Implement pricing logic with 2.5% APR base rate
- Add frontend UI for CEX selection
- Add tests for new coverage type"

# Push to remote
git push origin feature/add-new-coverage-type

# Create Pull Request on GitHub
# Go to https://github.com/HobanSearch/Tonsurance/pulls
# Click "New Pull Request"
```

**Commit Message Convention:**
```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Add tests
- `chore`: Maintenance

**Example:**
```
feat: Add dynamic pricing for CEX liquidation coverage

- Implement risk multiplier based on CEX liquidation events
- Integrate with Coinglass API for liquidation data
- Add 15% premium surcharge during high liquidation periods
- Cache liquidation data in Redis (60s TTL)

Closes #42
```

---

## 6. Testing

### Smart Contract Tests

**Run All Tests:**
```bash
npx blueprint test

# Or with coverage
npx jest --coverage
```

**Run Specific Test Suite:**
```bash
# Test specific contract
npx blueprint test tests/MultiTrancheVault.spec.ts

# Test with verbose output
npx blueprint test tests/PolicyFactory.spec.ts --verbose

# Watch mode (auto-rerun on changes)
npx jest --watch tests/
```

**Example Test Structure:**
```typescript
// tests/PolicyFactory.spec.ts
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { PolicyFactory } from '../wrappers/PolicyFactory';
import '@ton/test-utils';

describe('PolicyFactory', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let policyFactory: SandboxContract<PolicyFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        policyFactory = blockchain.openContract(
            PolicyFactory.createFromConfig({...}, code)
        );

        await policyFactory.sendDeploy(deployer.getSender(), toNano('0.05'));
    });

    it('should create policy successfully', async () => {
        const result = await policyFactory.sendCreatePolicy(
            deployer.getSender(),
            {
                coverageType: 0, // Depeg
                coverageAmount: toNano('10000'),
                durationDays: 30,
            },
            toNano('220') // Premium
        );

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: policyFactory.address,
            success: true,
        });
    });
});
```

### Backend Tests (OCaml)

**Run All Tests:**
```bash
cd backend
dune test

# With verbose output
dune test --verbose
```

**Run Specific Test:**
```bash
# Run single test executable
dune exec -- test/test_pricing_engine.exe

# Run with specific test filter
dune exec -- test/test_risk_calculator.exe --only-test="Risk Calculator"
```

**Test Structure (Alcotest):**
```ocaml
(* backend/test/test_pricing_engine.ml *)
open Alcotest
open Pricing_engine

let test_base_premium () =
  let result = PricingEngine.calculate_base_premium
    ~coverage_type:Depeg
    ~amount:10000.0
    ~duration_days:30
  in
  check (float 0.01) "base premium" 65.75 result

let suite = [
  "Pricing Engine", [
    test_case "Calculate base premium" `Quick test_base_premium;
  ];
]

let () = run "Tonsurance Backend" suite
```

**Coverage Report:**
```bash
cd backend

# Generate coverage report
dune test --instrument-with bisect_ppx

# View HTML report
bisect-ppx-report html
open _coverage/index.html
```

### Integration Tests

**Full Stack Integration:**
```bash
# Start all services
docker-compose up -d
cd backend && dune exec -- api/api_v2.exe &
cd frontend && npm run dev &

# Run integration test suite
npm run test:integration

# Example integration test:
# 1. Deploy contracts to testnet
# 2. Create policy via API
# 3. Verify policy stored in database
# 4. Verify event emitted on blockchain
# 5. Verify frontend displays policy
```

### Testing Best Practices

1. **Write tests first (TDD)**: Write failing test → Implement feature → Test passes
2. **Test edge cases**: Zero amounts, maximum values, invalid inputs
3. **Mock external services**: Don't call real APIs in tests (use fixtures)
4. **Isolation**: Each test should be independent (use `beforeEach` to reset state)
5. **Coverage**: Aim for 90%+ coverage on critical code paths
6. **Fast tests**: Keep unit tests under 100ms each

---

## 7. Debugging

### Backend Debugging (OCaml)

**Enable Debug Logs:**
```bash
# Set log level to debug
export LOG_LEVEL=debug

# Run API server with debug output
cd backend
dune exec -- api/api_v2.exe

# You'll see detailed logs:
# [DEBUG] Processing request: POST /api/v2/quote/multi-dimensional
# [DEBUG] Parsed coverage_type: Depeg
# [DEBUG] Fetching oracle prices...
# [DEBUG] RedStone price: 0.9998, Pyth: 0.9999, Chainlink: 0.9997
# [DEBUG] Calculated multiplier: 1.15
```

**OCaml REPL (utop):**
```bash
cd backend
dune utop

# Load modules
#require "lwt";;
#require "yojson";;
#mod_use "api/api_v2.ml";;

# Test functions interactively
open Pricing_engine;;
PricingEngine.calculate_base_premium ~coverage_type:Depeg ~amount:10000.0 ~duration_days:30;;
```

**Inspect Database:**
```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# View recent policies
SELECT policy_id, coverage_type, chain, stablecoin, coverage_amount, premium
FROM policies
ORDER BY created_at DESC
LIMIT 10;

# View vault balances
SELECT tranche, total_capital, allocated_capital, available_capital
FROM vault_tranches;

# View bridge health
SELECT bridge_name, health_score, last_update
FROM bridge_health
ORDER BY last_update DESC;
```

**Redis Inspection:**
```bash
# Connect to Redis
docker exec -it tonsurance-redis redis-cli

# View all keys
KEYS *

# Inspect cached quote
GET quote:Depeg:Ethereum:USDC:10000:30

# Monitor real-time commands
MONITOR

# View WebSocket subscribers
PUBSUB CHANNELS
```

### Smart Contract Debugging

**TON Sandbox Traces:**
```typescript
// In test file, print transaction details
const result = await policyFactory.sendCreatePolicy(...);

// Print all transactions
result.transactions.forEach((tx, i) => {
    console.log(`Transaction ${i}:`, {
        from: tx.inMessage?.info.src,
        to: tx.inMessage?.info.dest,
        value: tx.inMessage?.info.value.coins,
        success: tx.description.type === 'generic' &&
                 tx.description.computePhase.type === 'vm' &&
                 tx.description.computePhase.success,
        exitCode: tx.description.type === 'generic' &&
                  tx.description.computePhase.type === 'vm'
                  ? tx.description.computePhase.exitCode
                  : null,
    });
});
```

**Testnet Explorer:**
- View transactions on https://testnet.tonscan.org
- Search by address or transaction hash
- Inspect messages, compute phase, action phase
- View gas costs and exit codes

**Common Exit Codes:**
- `0`: Success
- `35`: Invalid address
- `36`: Not enough TON for gas
- `37`: Message bounced
- `128+`: Custom error codes (defined in contract)

### Frontend Debugging

**React DevTools:**
```bash
# Install Chrome extension
# https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi

# Open DevTools (F12) → Components tab
# Inspect component props, state, hooks
```

**Network Tab:**
```
1. Open DevTools (F12) → Network tab
2. Filter: XHR/Fetch
3. Perform action (e.g., get quote)
4. Click request → Preview tab to see response
```

**WebSocket Debugging:**
```typescript
// Add to useDynamicPricing hook
useEffect(() => {
    if (ws) {
        ws.addEventListener('message', (event) => {
            console.log('[WS] Received:', event.data);
            const data = JSON.parse(event.data);
            console.log('[WS] Parsed:', data);
        });
    }
}, [ws]);
```

**TON Connect Debugging:**
```typescript
// In useContracts hook
import { useTonConnectUI } from '@tonconnect/ui-react';

const [tonConnectUI] = useTonConnectUI();

// Log wallet info
console.log('Wallet:', tonConnectUI.wallet);
console.log('Account:', tonConnectUI.account);
console.log('Connected:', tonConnectUI.connected);
```

---

## 8. Troubleshooting

### Common Issues

#### PostgreSQL Connection Failed

**Symptoms:**
```
Error: Connection refused (port 5432)
FATAL: role "tonsurance" does not exist
```

**Solution:**
```bash
# Check if PostgreSQL container is running
docker ps | grep postgres

# If not running, start it
docker-compose up -d postgres

# Verify health
docker-compose ps postgres
# Should show: Up (healthy)

# Check logs for errors
docker-compose logs postgres

# If database doesn't exist, recreate it
docker-compose down -v postgres
docker-compose up -d postgres

# Wait 10 seconds for initialization
sleep 10

# Run migrations
cd backend/migrations
psql $DATABASE_URL -f 001_initial_schema.sql
```

#### Redis Connection Failed

**Symptoms:**
```
Error: ECONNREFUSED 127.0.0.1:6379
```

**Solution:**
```bash
# Check if Redis is running
docker ps | grep redis

# Start if not running
docker-compose up -d redis

# Test connection
docker exec tonsurance-redis redis-cli ping
# Should return: PONG

# If issues persist, recreate container
docker-compose down redis
docker-compose up -d redis
```

#### API Returns 404

**Symptoms:**
```
curl http://localhost:8080/health
# Returns: Connection refused or 404 Not Found
```

**Solution:**
```bash
# Check if API server is running
ps aux | grep api_v2.exe

# If not running, start it
cd backend
dune exec -- api/api_v2.exe

# Check if port 8080 is in use
lsof -i :8080
# If something else is using it, kill it or change API_PORT in .env

# Verify API responds
curl http://localhost:8080/health

# Check CORS settings
# Ensure frontend URL is allowed in backend/api/api_v2.ml
# Look for: Dream.origin_allowed
```

#### Frontend Can't Connect to Backend

**Symptoms:**
```
Console errors:
- CORS policy error
- Network error
- Failed to fetch
```

**Solution:**
```bash
# 1. Verify backend is running
curl http://localhost:8080/health

# 2. Check frontend .env
cat frontend/.env
# Ensure:
# VITE_BACKEND_API_URL=http://localhost:8080
# VITE_BACKEND_WS_URL=ws://localhost:8081

# 3. Restart frontend dev server
cd frontend
# Press Ctrl+C to stop
npm run dev

# 4. Check browser console for CORS errors
# If CORS issue, verify backend/api/api_v2.ml allows origin:
# Dream.origin_allowed (fun origin ->
#   origin = "http://localhost:5173" || ...
# )

# 5. Test API directly from browser
# Open http://localhost:8080/health in browser
# Should see JSON response
```

#### Contract Calls Fail

**Symptoms:**
```
Transaction failed: Contract not found
Invalid address
Insufficient balance for gas
```

**Solution:**
```bash
# 1. Verify contracts are deployed
cat frontend/.env
# Check if all addresses are filled:
# VITE_POLICY_FACTORY_ADDRESS=EQC...
# VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQD...

# 2. If missing, deploy contracts
npx blueprint build
npx blueprint run deployPolicyFactory --testnet
npx blueprint run deployMultiTrancheVault --testnet
npx blueprint run deployPolicySharding --testnet

# 3. Update frontend/.env with new addresses

# 4. Restart frontend
cd frontend
npm run dev

# 5. Verify wallet has sufficient balance
# Open Tonkeeper/TonHub
# Ensure you have >1 TON on testnet
# Get more from https://t.me/testgiver_ton_bot

# 6. Check transaction on explorer
# Copy transaction hash from wallet
# Visit https://testnet.tonscan.org/tx/<hash>
# Look at compute_phase and action_phase for errors
```

#### WebSocket Not Connecting

**Symptoms:**
```
Console: WebSocket connection failed
No real-time price updates
```

**Solution:**
```bash
# 1. Check if WebSocket server is running
nc -z localhost 8081
# Should return: Connection to localhost port 8081 [tcp/*] succeeded!

# If failed:
ps aux | grep api_v2.exe
# WebSocket server runs alongside API server

cd backend
dune exec -- api/api_v2.exe

# 2. Check browser console
# Open DevTools → Console → Look for:
# [WS] Connecting to ws://localhost:8081...

# 3. Verify VITE_BACKEND_WS_URL in frontend/.env
cat frontend/.env | grep WS
# Should be: VITE_BACKEND_WS_URL=ws://localhost:8081

# 4. Test WebSocket manually
npm install -g wscat
wscat -c ws://localhost:8081
# Type: {"type":"subscribe","channel":"pricing_updates"}
# Should receive: {"type":"subscribed","channel":"pricing_updates"}
```

#### Build Errors

**Smart Contracts:**
```bash
# Error: Cannot find module '@ton/core'
cd /Users/ben/Documents/Work/HS/Application/Tonsurance
npm install

# Error: FunC compilation failed
# Check syntax in contract file
# Ensure stdlib.fc is included:
#include "imports/stdlib.fc";

# Clear cache and rebuild
rm -rf build/
npx blueprint build
```

**OCaml Backend:**
```bash
# Error: Unbound module
cd backend

# Install missing dependencies
opam install . --deps-only

# Rebuild from scratch
dune clean
dune build

# If dune version issues:
opam install dune --yes
```

**Frontend:**
```bash
# Error: Module not found
cd frontend
rm -rf node_modules package-lock.json
npm install

# TypeScript errors
npm run build
# Fix errors shown in output

# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

### Performance Issues

**Slow API Responses:**
```bash
# Check database query performance
psql $DATABASE_URL

EXPLAIN ANALYZE
SELECT * FROM policies
WHERE user_address = 'EQC...'
ORDER BY created_at DESC;

# Add indexes if needed
CREATE INDEX idx_policies_user_address ON policies(user_address);
CREATE INDEX idx_policies_created_at ON policies(created_at);
```

**High Memory Usage (Backend):**
```bash
# Monitor memory
ps aux | grep api_v2.exe

# Reduce log verbosity
export LOG_LEVEL=info  # Instead of debug

# Limit WebSocket connections
# Edit backend/api/api_v2.ml
# Set max_clients = 1000  # Default may be unlimited
```

**Slow Frontend Loading:**
```bash
# Analyze bundle size
cd frontend
npm run build
npx vite-bundle-visualizer

# Lazy load routes
# Edit frontend/src/App.tsx
const PolicyPurchase = lazy(() => import('./pages/PolicyPurchase'));

# Use React.memo for expensive components
export const PolicyCard = memo(({ policy }) => { ... });
```

### Getting Help

**Documentation:**
- Check `/Users/ben/Documents/Work/HS/Application/Tonsurance/docs/`
- Read CLAUDE.md for architecture overview
- See DEPLOYMENT.md for production deployment

**Community:**
- Telegram: @TonsuranceDevs
- GitHub Issues: https://github.com/HobanSearch/Tonsurance/issues

**Logs:**
```bash
# Backend logs
tail -f logs/api.log

# Docker logs
docker-compose logs -f

# System logs (Linux)
journalctl -u tonsurance-api -f
```

---

## 9. Appendix

### Directory Structure

```
Tonsurance/
├── backend/                    # OCaml backend services
│   ├── api/                   # REST + WebSocket servers
│   │   ├── api_v2.ml         # Main API server
│   │   └── dune              # Build config
│   ├── pricing/               # Pricing engine
│   │   ├── pricing_engine.ml # Premium calculator
│   │   └── tranche_pricing.ml# Tranche APY calculator
│   ├── integration/           # External API clients
│   │   ├── redstone_client.ml
│   │   ├── pyth_client.ml
│   │   └── chainlink_client.ml
│   ├── monitoring/            # Bridge & risk monitors
│   │   ├── bridge_monitor.ml
│   │   └── unified_risk_monitor.ml
│   ├── risk/                  # Risk calculators
│   │   ├── risk_model.ml
│   │   └── chain_risk_calculator.ml
│   ├── types/                 # Shared type definitions
│   │   └── types.ml
│   ├── daemons/               # Background services
│   │   ├── pricing_oracle_keeper.ml
│   │   └── bridge_health_keeper.ml
│   ├── test/                  # Backend tests
│   │   ├── test_pricing_engine.ml
│   │   └── test_risk_calculator.ml
│   ├── migrations/            # SQL migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_policy_sharding.sql
│   │   └── 003_add_tranche_apy_tracking.sql
│   ├── dune-project          # OCaml project config
│   └── tonsurance.opam       # OPAM package definition
├── contracts/                 # FunC smart contracts
│   ├── core/                 # Core contracts
│   │   ├── PolicyFactory.fc  # Policy creation
│   │   ├── PolicyRouter.fc   # Policy sharding router
│   │   ├── PolicyShard.fc    # Policy shard (256 instances)
│   │   ├── MultiTrancheVault.fc  # 6-tranche vault
│   │   ├── ClaimsProcessor.fc    # Claims validation
│   │   ├── PrimaryVault.fc   # First-loss capital
│   │   ├── SecondaryVault.fc # Second-loss capital
│   │   └── Treasury.fc       # Protocol treasury
│   ├── oracles/              # Oracle adapters
│   │   ├── DynamicPricingOracle.fc  # On-chain pricing
│   │   └── CEXOracleAdapter.fc      # CEX liquidation oracle
│   ├── tranches/             # Tranche tokens
│   │   ├── SURE_SNR.fc      # Senior tranche (lowest risk)
│   │   ├── SURE_MEZZ.fc     # Mezzanine tranche
│   │   ├── SURE_BTC.fc      # Bitcoin tranche
│   │   ├── SURE_JNR.fc      # Junior tranche
│   │   ├── SURE_JNR_PLUS.fc # Junior+ tranche
│   │   └── SURE_EQT.fc      # Equity tranche (highest risk)
│   ├── libs/                 # Shared libraries
│   │   ├── bonding_curves.fc # APY bonding curves
│   │   ├── risk_multipliers.fc # Risk calculation helpers
│   │   └── async_helpers.fc  # Async message helpers
│   └── imports/
│       └── stdlib.fc         # TON standard library
├── wrappers/                  # TypeScript contract wrappers
│   ├── PolicyFactory.ts
│   ├── MultiTrancheVault.ts
│   ├── PolicyRouter.ts
│   ├── SURE_SNR.ts
│   ├── SURE_MEZZ.ts
│   ├── SURE_BTC.ts
│   └── *.compile.ts          # Compilation configs
├── tests/                     # Smart contract tests
│   ├── PolicyFactory.spec.ts
│   ├── MultiTrancheVault.spec.ts
│   ├── BondingCurves.spec.ts
│   ├── SURE_SNR.spec.ts
│   ├── SURE_MEZZ.spec.ts
│   └── SURE_BTC.spec.ts
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── pages/            # Main pages
│   │   │   ├── Home.tsx
│   │   │   ├── PolicyPurchase.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── VaultStaking.tsx
│   │   │   ├── MultiChainInsurance.tsx
│   │   │   ├── EnterpriseBulk.tsx
│   │   │   └── HedgedInsurance.tsx
│   │   ├── components/       # Reusable components
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── ProductSelector.tsx
│   │   │   ├── BeneficiarySelector.tsx
│   │   │   ├── ChainSelector.tsx
│   │   │   ├── BridgeHealthIndicator.tsx
│   │   │   └── terminal/     # Terminal UI components
│   │   ├── hooks/            # React hooks
│   │   │   ├── useContracts.ts
│   │   │   ├── useDynamicPricing.ts
│   │   │   └── useMultiTrancheVault.ts
│   │   ├── utils/            # Utility functions
│   │   ├── App.tsx           # Main app component
│   │   └── main.tsx          # Entry point
│   ├── public/               # Static assets
│   ├── package.json
│   ├── vite.config.ts        # Vite configuration
│   ├── tsconfig.json         # TypeScript config
│   └── tailwind.config.js    # Tailwind CSS config
├── services/                  # TypeScript services (optional)
│   └── lib/                  # Service libraries
├── scripts/                   # Deployment scripts
│   ├── deployPolicyFactory.ts
│   ├── deployMultiTrancheVault.ts
│   ├── deployPolicySharding.ts
│   ├── deployPricingOracle.ts
│   ├── deploy-production.sh
│   └── rollback.sh
├── infra/                     # Infrastructure configs
│   └── docker/
│       ├── docker-compose.production.yml
│       └── docker-compose.redis.yml
├── docs/                      # Documentation
│   ├── DEVELOPMENT_PLAN.md
│   ├── HEDGED_ARCHITECTURE.md
│   ├── TESTING_STRATEGY.md
│   ├── DESIGN_DECISIONS.md
│   ├── TECHNICAL_SPEC.md
│   └── PRD.md
├── logs/                      # Log files (gitignored)
├── .env                       # Environment variables
├── .env.example               # Example environment
├── docker-compose.yml         # Local development Docker
├── package.json               # Root package.json (monorepo)
├── tsconfig.json              # Root TypeScript config
├── blueprint.config.ts        # Blueprint configuration
├── README.md                  # Project overview
└── CLAUDE.md                  # AI assistant instructions
```

### Environment Variables Reference

**Infrastructure:**
```bash
# API Server
API_PORT=8080                  # API server port
API_HOST=0.0.0.0              # Bind to all interfaces
LOG_LEVEL=info                # Logging: debug|info|warn|error

# Database
POSTGRES_PASSWORD=***         # PostgreSQL password
DATABASE_URL=postgresql://... # Full database connection URL

# Cache & Queue
REDIS_URL=redis://...         # Redis connection
RABBITMQ_PASSWORD=***         # RabbitMQ password
RABBITMQ_URL=amqp://...       # RabbitMQ connection
```

**Blockchain:**
```bash
# TON Network
TON_MAINNET=false             # true=mainnet, false=testnet
TON_ENDPOINT=https://...      # TON RPC endpoint
TON_API_KEY=***               # TonCenter API key (optional)
TON_WALLET_MNEMONIC="..."     # Deployer wallet mnemonic
```

**Oracles:**
```bash
REDSTONE_API_KEY=***          # RedStone Finance API key
PYTH_RPC_URL=https://...      # Pyth Network RPC
CHAINLINK_RPC_URL=https://... # Chainlink RPC
```

**Risk Management:**
```bash
RISK_MONITOR_INTERVAL=60      # Risk check interval (seconds)
REBALANCER_INTERVAL=300       # Rebalance interval (seconds)
MAX_LTV=0.75                  # Maximum loan-to-value ratio
MIN_RESERVE_RATIO=0.15        # Minimum reserve ratio
```

**Monitoring:**
```bash
DATADOG_API_KEY=***           # Datadog monitoring
SENTRY_DSN=https://...        # Sentry error tracking
PAGERDUTY_API_KEY=***         # PagerDuty alerts
```

**Frontend (frontend/.env):**
```bash
# Backend APIs
VITE_BACKEND_API_URL=http://localhost:8080
VITE_BACKEND_WS_URL=ws://localhost:8081

# TON Network
VITE_TON_NETWORK=testnet      # testnet|mainnet

# Contract Addresses (filled after deployment)
VITE_POLICY_FACTORY_ADDRESS=EQC...
VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQD...
VITE_PRICING_ORACLE_ADDRESS=EQE...
VITE_POLICY_ROUTER_ADDRESS=EQF...
```

### API Endpoints Quick Reference

**Health & Status:**
- `GET /health` - Health check
- `GET /api/v2/status` - System status

**Pricing:**
- `POST /api/v2/quote/multi-dimensional` - Get dynamic quote
- `POST /api/v2/pricing/lock-price` - Lock price for 2 minutes

**Risk:**
- `GET /api/v2/risk/exposure` - Get risk exposure breakdown
- `GET /api/v2/bridge/health` - Get bridge health scores

**Vault:**
- `GET /api/v2/vault/tranche-apy` - Get real-time tranche APYs
- `GET /api/v2/vault/utilization` - Get vault utilization stats

**WebSocket Channels:**
- `pricing_updates` - Real-time multiplier updates (60s)
- `bridge_health` - Bridge health changes
- `risk_alerts` - Active risk alerts
- `tranche_apy` - Tranche APY updates

### Smart Contract Operations & Gas Costs

**PolicyFactory:**
- `create_policy`: ~0.1 TON gas
- `update_policy`: ~0.05 TON gas
- `cancel_policy`: ~0.05 TON gas

**MultiTrancheVault:**
- `deposit`: ~0.08 TON gas
- `withdraw`: ~0.12 TON gas (triggers rebalancing)
- `claim`: ~0.15 TON gas (waterfall distribution)

**PolicyRouter:**
- `route_policy`: ~0.05 TON gas (routing only)
- Full policy creation (factory + router + shard): ~0.2 TON total

**Vault Tranches (deposit/withdraw):**
- SURE_SNR, SURE_MEZZ: ~0.06 TON each
- SURE_BTC, SURE_JNR: ~0.06 TON each
- SURE_JNR_PLUS, SURE_EQT: ~0.06 TON each

**Oracles:**
- `update_price`: ~0.04 TON gas (keeper only)

### Common OCaml Commands

```bash
# OPAM (package manager)
opam list                      # List installed packages
opam install <package>         # Install package
opam update                    # Update package list
opam upgrade                   # Upgrade all packages

# Dune (build system)
dune build                     # Build project
dune clean                     # Clean build artifacts
dune test                      # Run tests
dune exec -- <executable>      # Run executable
dune utop                      # Start REPL with project loaded

# OCaml REPL
utop                           # Start REPL
#require "lwt";;               # Load package
#mod_use "file.ml";;           # Load module
#quit;;                         # Exit

# Format code
dune build @fmt --auto-promote # Auto-format all .ml files
```

### Common Blueprint Commands

```bash
# Create new contract
npx blueprint create ContractName

# Build contracts
npx blueprint build                  # Build all
npx blueprint build ContractName     # Build specific

# Run tests
npx blueprint test                   # All tests
npx blueprint test tests/File.spec.ts # Specific test

# Deploy
npx blueprint run deployScript       # Interactive
npx blueprint run deployScript --testnet  # Testnet
npx blueprint run deployScript --mainnet  # Mainnet

# Create wallet
npx blueprint create-wallet --testnet
```

### Docker Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f [service]

# Restart service
docker-compose restart [service]

# Rebuild and restart
docker-compose up -d --build [service]

# Remove volumes (DANGER: deletes data)
docker-compose down -v

# Execute command in container
docker exec -it container_name command

# View container stats
docker stats
```

---

**End of Local Development Guide**

For production deployment, see [DEPLOYMENT.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/DEPLOYMENT.md).

For Telegram Mini App integration, see [MINI_APP_GUIDE.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/MINI_APP_GUIDE.md).

For frontend-contract integration, see [FRONTEND_INTEGRATION.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/FRONTEND_INTEGRATION.md).

For complete API reference, see [API_REFERENCE.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/API_REFERENCE.md).
