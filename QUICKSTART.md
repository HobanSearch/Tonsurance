# Tonsurance - Quick Start Guide

Get the entire Tonsurance stack running locally in 5 minutes.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js 18+** - JavaScript runtime (`node --version`)
- **OCaml 4.14+** - Functional programming language (`ocaml --version`)
- **opam** - OCaml package manager (`opam --version`)
- **Docker Desktop** - Container runtime (running)
- **PostgreSQL client** - Database CLI (`psql --version`)

### Install Prerequisites

**macOS:**
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node opam postgresql docker

# Initialize opam
opam init -y
eval $(opam env)

# Install OCaml packages
opam install dune dream lwt cohttp yojson core ppx_sexp_conv ppx_yojson_conv
```

**Linux (Ubuntu/Debian):**
```bash
# Install system dependencies
sudo apt update
sudo apt install -y nodejs npm ocaml opam postgresql-client docker.io

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Initialize opam
opam init -y
eval $(opam env)

# Install OCaml packages
opam install dune dream lwt cohttp yojson core ppx_sexp_conv ppx_yojson_conv
```

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/HobanSearch/Tonsurance.git
cd Tonsurance
```

### 2. Install Dependencies

**Root dependencies:**
```bash
npm install
```

**Frontend dependencies:**
```bash
cd frontend
npm install
cd ..
```

**Backend dependencies:**
```bash
cd backend
opam install . --deps-only
cd ..
```

### 3. Configure Environment
```bash
# Copy frontend environment template
cp frontend/.env.example frontend/.env

# Edit .env if needed (optional for local dev)
# For local development, default values work out of the box
nano frontend/.env
```

## Running Locally

### Start Full Stack (3 Commands)

Open **3 separate terminal windows** and run one command in each:

**Terminal 1 - Infrastructure (PostgreSQL + Redis):**
```bash
./scripts/dev/start-infrastructure.sh
```

This will:
- Start TimescaleDB container on port 5432
- Start Redis container on port 6379
- Run all database migrations
- Create database roles

**Terminal 2 - Backend Services (API + WebSocket + Oracle Keeper):**
```bash
./scripts/dev/start-backend.sh
```

This will:
- Build OCaml services with dune
- Start REST API server on port 8080 (includes WebSocket endpoint)
- Start Pricing Oracle Keeper
- Run health checks

**Terminal 3 - Frontend (React + Vite):**
```bash
./scripts/dev/start-frontend.sh
```

This will:
- Start Vite dev server on port 5173
- Enable hot module replacement
- Open browser automatically

### Access Points

Once all services are running:

- **Frontend UI**: http://localhost:5173
- **REST API**: http://localhost:8080
- **WebSocket**: ws://localhost:8080/ws
- **API Health Check**: http://localhost:8080/health
- **PostgreSQL**: localhost:5432 (user: `postgres`, pass: `postgres`, db: `tonsurance`)
- **Redis**: localhost:6379

### Test Integration

1. Open http://localhost:5173 in your browser
2. Click **"Connect Wallet"** (use TON Keeper testnet wallet)
3. Navigate to **"Vault Staking"** page
4. Select a tranche (SURE_SNR, SURE_MEZZ, SURE_JNR, etc.)
5. Enter staking amount
6. Click **"Stake"**

**Note**: If contracts aren't deployed yet, you'll see a message about deploying contracts first. This is expected for local development without deployed contracts.

## Deploying Contracts (Optional)

To fully test the integration with real on-chain contracts, deploy to TON testnet:

### Get Testnet TON

Visit the TON testnet faucet: https://testnet.tonscan.org/faucet

### Deploy MultiTrancheVault + SURE Tokens

```bash
npx blueprint run deployMultiTrancheVault --testnet
```

This deploys:
- MultiTrancheVault contract
- 6 SURE token contracts (SNR, BTC, MEZZ, EQT, JNR_PLUS, JNR)
- Initializes vault with all tranches

**Deployment time**: ~5 minutes

### Deploy DynamicPricingOracle

```bash
npx blueprint run deployPricingOracle --testnet
```

This deploys:
- DynamicPricingOracle contract for real-time premium updates
- Initialized with default multipliers

**Deployment time**: ~2 minutes

### Deploy PolicyRouter + Shards (Advanced)

```bash
npx blueprint run deployPolicySharding --testnet
```

This deploys:
- PolicyRouter contract
- 256 PolicyShard contracts for horizontal scaling
- Enables support for millions of policies

**Deployment time**: ~20 minutes (256 contract deployments)

### Update Frontend Configuration

After deploying contracts, update `frontend/.env` with contract addresses:

```bash
VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQxxx...
VITE_DYNAMIC_PRICING_ORACLE_ADDRESS=EQyyy...
VITE_POLICY_ROUTER_ADDRESS=EQzzz...
```

Then restart the frontend:

```bash
# In Terminal 3
# Press Ctrl+C to stop
./scripts/dev/start-frontend.sh
```

## Stopping Services

### Stop Backend Services
```bash
./scripts/dev/stop-backend.sh
```

### Stop Infrastructure
```bash
./scripts/dev/stop-infrastructure.sh
```

### Stop All Services
```bash
./scripts/dev/stop-backend.sh
./scripts/dev/stop-infrastructure.sh
# Press Ctrl+C in Terminal 3 (frontend)
```

## Alternative: PM2 Process Manager

For production-like service management with automatic restarts and log rotation:

### Install PM2
```bash
npm install -g pm2
```

### Start All Services
```bash
# Start infrastructure first (still use Docker)
./scripts/dev/start-infrastructure.sh

# Start backend with PM2
pm2 start ecosystem.config.js
```

### Monitor Services
```bash
# View dashboard
pm2 monit

# View logs
pm2 logs

# View specific service logs
pm2 logs tonsurance-api
pm2 logs tonsurance-websocket
pm2 logs tonsurance-oracle-keeper
```

### Stop Services
```bash
pm2 stop ecosystem.config.js
```

## Viewing Logs

### Backend Service Logs

**API Server:**
```bash
tail -f logs/api.log
```

**WebSocket Server:**
```bash
tail -f logs/ws.log
```

**Oracle Keeper:**
```bash
tail -f logs/oracle_keeper.log
```

### Database Logs

```bash
# PostgreSQL container logs
docker logs tonsurance-db -f

# Connect to database
PGPASSWORD=postgres psql -h localhost -U postgres -d tonsurance
```

### Redis Logs

```bash
# Redis container logs
docker logs tonsurance-redis -f

# Connect to Redis CLI
docker exec -it tonsurance-redis redis-cli
```

## Troubleshooting

### PostgreSQL Connection Error

**Symptom**: Backend services fail to start with connection errors

**Solution**:
```bash
# Check if container is running
docker ps | grep tonsurance-db

# Restart infrastructure
./scripts/dev/stop-infrastructure.sh
./scripts/dev/start-infrastructure.sh
```

### Backend Service Not Starting

**Symptom**: Health check fails or service crashes immediately

**Solution**:
```bash
# Check build errors
cd backend
dune clean
dune build

# Check logs for errors
tail -f ../logs/api.log

# Check OCaml dependencies
opam install . --deps-only
```

### Frontend Can't Connect to Backend

**Symptom**: API calls return 404 or connection refused

**Solution**:
```bash
# Verify backend is running
curl http://localhost:8080/health

# Check CORS settings in backend/api/api_v2.ml
# Should include: http://localhost:5173

# Check frontend .env
cat frontend/.env | grep BACKEND
```

### Contract Not Deployed

**Symptom**: Frontend shows "Deploy contracts first" message

**Solution**:
```bash
# This is expected for local development without contracts
# Frontend will show mock data

# To use real contracts, deploy to testnet:
npx blueprint run deployMultiTrancheVault --testnet

# Then update frontend/.env with deployed addresses
```

### Docker Not Running

**Symptom**: `start-infrastructure.sh` fails immediately

**Solution**:
```bash
# macOS: Start Docker Desktop app
open -a Docker

# Linux: Start Docker daemon
sudo systemctl start docker

# Verify Docker is running
docker info
```

### Port Already in Use

**Symptom**: Service fails to start with "address already in use"

**Solution**:
```bash
# Find process using port 8080
lsof -ti:8080 | xargs kill -9

# Or use different ports in backend/config/local.json
```

## Testing the Stack

### Test REST API

```bash
# Health check
curl http://localhost:8080/health

# Get tranche APY
curl http://localhost:8080/api/v2/tranches/apy

# Get premium quote (multi-dimensional)
curl -X POST http://localhost:8080/api/v2/quote/multi-dimensional \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "depeg",
    "chain": "ethereum",
    "stablecoin": "usdc",
    "coverage_amount": 10000,
    "duration_days": 30
  }'

# Get risk exposure
curl http://localhost:8080/api/v2/risk/exposure
```

### Test WebSocket

```bash
# Install wscat (WebSocket CLI)
npm install -g wscat

# Connect to WebSocket server
wscat -c ws://localhost:8080/ws

# Subscribe to channels
> {"action": "subscribe", "channel": "tranche_apy"}
> {"action": "subscribe", "channel": "risk_alerts"}

# You should receive real-time updates every 60 seconds
```

### Run Backend Tests

```bash
cd backend
dune runtest
```

### Run Frontend Tests

```bash
cd frontend
npm test
```

## Next Steps

- **Read Documentation**: See [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for detailed setup
- **Run Tests**: `npm test` in frontend and `dune runtest` in backend
- **Deploy to Testnet**: Follow contract deployment steps above
- **Create Telegram Bot**: See [MINI_APP_GUIDE.md](MINI_APP_GUIDE.md)
- **Integrate with Tonny**: See [backend/tonny/README.md](backend/tonny/README.md)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│                    http://localhost:5173                     │
│  - Wallet Connect (TON Keeper)                               │
│  - Policy Purchase, Vault Staking, Analytics                │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
          ┌─────────▼────────┐  ┌──────▼───────┐
          │   REST API + WS   │
          │   Port 8080       │
          │                   │
          │ - Premium quotes  │
          │ - Risk exposure   │
          │ - Bridge health   │
          │ - WS: /ws         │
          └────────┬──────────┘
                   │                    │
          ┌────────┴────────────────────┴────────┐
          │      Backend Services (OCaml)        │
          │                                      │
          │  - Collateral Manager                │
          │  - Risk Monitor                      │
          │  - Bridge Monitor                    │
          │  - Pricing Engine                    │
          └──────────────┬───────────────────────┘
                         │
          ┌──────────────┴───────────────┐
          │                              │
   ┌──────▼──────┐              ┌────────▼────────┐
   │ PostgreSQL  │              │     Redis       │
   │ Port 5432   │              │   Port 6379     │
   │             │              │                 │
   │ - Policies  │              │ - Price cache   │
   │ - Exposure  │              │ - Sessions      │
   │ - Analytics │              │                 │
   └─────────────┘              └─────────────────┘
```

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: https://github.com/HobanSearch/Tonsurance/issues
- **Email**: dev@tonsurance.io
- **Telegram**: @TonsuranceDevs

## License

MIT License - See [LICENSE](LICENSE) file for details
