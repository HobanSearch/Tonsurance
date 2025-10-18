# Tonsurance Development Scripts

Collection of scripts for local development workflow and TON blockchain deployment.

## 📋 Table of Contents

1. [Deployment Scripts](#deployment-scripts) - Deploy to TON testnet/mainnet
2. [Development Scripts](#development-scripts) - Local development workflow
3. [Documentation](#documentation) - Guides and references

---

## Deployment Scripts

### 🚀 Deploy to TON Testnet

**Quick Start**: See [QUICK_START.md](./QUICK_START.md) for 5-minute guide

**Comprehensive Guide**: See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for full documentation

#### Available Scripts

| Command | Purpose | Time |
|---------|---------|------|
| `npm run deploy:create-wallet` | Create deployment wallet | 30s |
| `npm run deploy:verify-contracts` | Verify contract compilation | 1min |
| `npm run deploy:all-testnet` | Deploy all contracts (guided) | 25-30min |
| `npm run deploy:verify` | Verify deployed contracts | 1min |
| `npm run deploy:update-frontend` | Update frontend .env | 30s |
| `npm run deploy:test-integration` | Test contract integration | 5min |

#### Individual Deployments

| Command | Deploys | Cost | Time |
|---------|---------|------|------|
| `npm run deploy:vault` | MultiTrancheVault + SURE tokens | ~4 TON | 15min |
| `npm run deploy:oracle` | DynamicPricingOracle | ~0.5 TON | 5min |
| `npm run deploy:factory` | PolicyFactory + ClaimsProcessor | ~1 TON | 5min |
| `npm run deploy:sharding` | PolicyRouter + 256 Shards | ~77 TON | 25min |

**Total Cost** (without sharding): ~5.5 TON
**Total Time**: ~25-30 minutes

#### Quick Deployment Workflow

```bash
# 1. Create wallet
npm run deploy:create-wallet

# 2. Fund wallet (get ~10 TON from testnet faucet)
# Visit: https://t.me/testgiver_ton_bot

# 3. Setup environment
cp .env.deployment.example .env.deployment
# Edit and paste your mnemonic

# 4. Verify contracts
npm run deploy:verify-contracts

# 5. Deploy!
npm run deploy:all-testnet

# 6. Verify deployment
npm run deploy:verify

# 7. Update frontend
npm run deploy:update-frontend

# 8. Start frontend and test
cd frontend && npm run dev
```

**Documentation**:
- Quick Start: [QUICK_START.md](./QUICK_START.md)
- Full Guide: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- Infrastructure Summary: [../../DEPLOYMENT_SUMMARY.md](../../DEPLOYMENT_SUMMARY.md)

---

## Development Scripts

### Quick Start - Local Development (3 Commands)

```bash
# Terminal 1: Infrastructure
./scripts/dev/start-infrastructure.sh

# Terminal 2: Backend Services
./scripts/dev/start-backend.sh

# Terminal 3: Frontend
./scripts/dev/start-frontend.sh
```

## Script Reference

### Infrastructure Management

#### `start-infrastructure.sh`

Starts PostgreSQL (TimescaleDB) and Redis containers, runs migrations.

**Usage:**
```bash
./scripts/dev/start-infrastructure.sh
```

**Services Started:**
- PostgreSQL on port 5432
- Redis on port 6379

**What it does:**
1. Checks if Docker is running
2. Stops and removes existing containers
3. Starts TimescaleDB container
4. Starts Redis container
5. Waits for services to be ready
6. Creates database roles (tonsurance_analytics, tonsurance_integration)
7. Runs all SQL migrations from `backend/migrations/`

**Output:**
- Container status
- Migration results
- Connection details

#### `stop-infrastructure.sh`

Stops and removes all infrastructure containers.

**Usage:**
```bash
./scripts/dev/stop-infrastructure.sh
```

**Note:** This does NOT delete database data (if volumes are mounted).

### Backend Service Management

#### `start-backend.sh`

Builds and starts OCaml backend services.

**Usage:**
```bash
./scripts/dev/start-backend.sh
```

**Prerequisites:**
- Infrastructure must be running (PostgreSQL + Redis)
- OCaml and opam must be installed
- Dune build dependencies must be installed

**Services Started:**
- API + WebSocket server (port 8080)
- Pricing Oracle Keeper (background)

**What it does:**
1. Checks if infrastructure is running
2. Builds OCaml services with `dune build`
3. Starts API server with WebSocket endpoint
4. Starts Pricing Oracle Keeper
5. Runs health checks
6. Saves PIDs to `logs/*.pid`

**Logs:**
- API + WebSocket: `logs/api.log`
- Oracle Keeper: `logs/oracle_keeper.log`

#### `stop-backend.sh`

Stops all backend services gracefully.

**Usage:**
```bash
./scripts/dev/stop-backend.sh
```

**What it does:**
1. Reads PIDs from `logs/*.pid` files
2. Sends SIGTERM to each process
3. Removes PID files
4. Reports status

### Frontend Management

#### `start-frontend.sh`

Starts React frontend with Vite dev server.

**Usage:**
```bash
./scripts/dev/start-frontend.sh
```

**Prerequisites:**
- Node.js 18+ installed
- Frontend dependencies installed (`npm install`)

**What it does:**
1. Checks if backend is running (optional)
2. Creates `.env` from `.env.example` if missing
3. Installs dependencies if `node_modules` missing
4. Starts Vite dev server

**Access:** http://localhost:5173

**Features:**
- Hot module replacement
- Fast refresh
- TypeScript type checking

### Log Viewing

#### `logs.sh`

View logs for any service in real-time.

**Usage:**
```bash
# Show all available logs
./scripts/dev/logs.sh

# Show specific service logs
./scripts/dev/logs.sh api        # API + WebSocket logs
./scripts/dev/logs.sh keeper     # Oracle Keeper logs
./scripts/dev/logs.sh db         # PostgreSQL logs
./scripts/dev/logs.sh redis      # Redis logs
```

**Tip:** Press `Ctrl+C` to exit log viewing.

## Common Workflows

### Fresh Start

Start everything from scratch:

```bash
# Stop everything
./scripts/dev/stop-backend.sh
./scripts/dev/stop-infrastructure.sh

# Start fresh
./scripts/dev/start-infrastructure.sh
./scripts/dev/start-backend.sh
./scripts/dev/start-frontend.sh
```

### Restart Backend Only

```bash
./scripts/dev/stop-backend.sh
./scripts/dev/start-backend.sh
```

### View Logs

```bash
# View API logs
./scripts/dev/logs.sh api

# View all logs in separate terminals
./scripts/dev/logs.sh api     # Terminal 1
./scripts/dev/logs.sh keeper  # Terminal 2
./scripts/dev/logs.sh db      # Terminal 3
```

### Rebuild Backend

```bash
cd backend
dune clean
dune build
cd ..
./scripts/dev/stop-backend.sh
./scripts/dev/start-backend.sh
```

### Reset Database

```bash
./scripts/dev/stop-infrastructure.sh
docker volume rm tonsurance-db-volume 2>/dev/null || true
./scripts/dev/start-infrastructure.sh
```

## Environment Variables

### Backend Configuration

Backend services read from `backend/config/local.json`:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "database": "tonsurance",
    "user": "postgres",
    "password": "postgres"
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  },
  "api": {
    "port": 8080,
    "cors_origins": ["http://localhost:5173"]
  }
}
```

### Frontend Configuration

Frontend reads from `frontend/.env`:

```bash
VITE_BACKEND_API_URL=http://localhost:8080
VITE_BACKEND_WS_URL=ws://localhost:8080/ws
VITE_TON_NETWORK=testnet
```

### Oracle Keeper Configuration

Set environment variables:

```bash
UPDATE_INTERVAL=60  # Update frequency in seconds
```

Example:
```bash
UPDATE_INTERVAL=30 ./scripts/dev/start-backend.sh
```

## Troubleshooting

### "Docker is not running"

**Solution:**
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

### "PostgreSQL not running"

**Solution:**
```bash
# Check container status
docker ps | grep tonsurance-db

# Restart infrastructure
./scripts/dev/stop-infrastructure.sh
./scripts/dev/start-infrastructure.sh
```

### "Build failed"

**Solution:**
```bash
# Install OCaml dependencies
cd backend
opam install . --deps-only
dune clean
dune build
```

### "Port already in use"

**Solution:**
```bash
# Find and kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or change port in backend/config/local.json
```

### Services won't stop

**Solution:**
```bash
# Force kill all services
pkill -f tonsurance-api-v2
pkill -f pricing_oracle_keeper

# Clean up PID files
rm -f logs/*.pid
```

## Advanced Usage

### Custom Ports

Edit `backend/config/local.json`:

```json
{
  "api": {
    "port": 9000
  }
}
```

Then update frontend `.env`:

```bash
VITE_BACKEND_API_URL=http://localhost:9000
VITE_BACKEND_WS_URL=ws://localhost:9000/ws
```

### Multiple Instances

Run multiple backend instances on different ports:

```bash
# Instance 1
PORT=8080 dune exec -- tonsurance-api-v2 &

# Instance 2
PORT=8081 dune exec -- tonsurance-api-v2 &
```

### PM2 Process Manager

Alternative to shell scripts for production-like management:

```bash
# Install PM2
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Stop all
pm2 stop ecosystem.config.js
```

See `ecosystem.config.js` for configuration.

## File Locations

- **Scripts**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/`
- **Logs**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/logs/`
- **Backend**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/backend/`
- **Frontend**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/frontend/`
- **Config**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/backend/config/`

## Health Checks

### API Health

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "tonsurance-api-v2",
  "version": "2.0.0",
  "timestamp": 1729087654.123
}
```

### Database Health

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d tonsurance -c "SELECT 1;"
```

### Redis Health

```bash
docker exec tonsurance-redis redis-cli ping
```

Expected: `PONG`

## Performance Tips

1. **Keep services running**: Don't restart unless necessary
2. **Use PM2 for stability**: Automatic restarts on crashes
3. **Monitor logs**: Use `./scripts/dev/logs.sh` to catch issues early
4. **Clean builds**: Run `dune clean` if build behaves oddly
5. **Docker resources**: Allocate enough RAM to Docker Desktop (4GB+ recommended)

## Security Notes

- **Development only**: These scripts are NOT for production use
- **Default credentials**: Change passwords in production
- **No TLS**: Services use HTTP/WS, not HTTPS/WSS
- **CORS**: Only allows localhost origins
- **Secrets**: Never commit API keys to git

## Support

- **Documentation**: See [QUICKSTART.md](../../QUICKSTART.md)
- **Issues**: https://github.com/HobanSearch/Tonsurance/issues
- **Logs**: Always check logs first: `./scripts/dev/logs.sh`
