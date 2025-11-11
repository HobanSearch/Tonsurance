# Hackathon Deployment Checklist

## ✅ Pre-Deployment Status

### Completed
- [x] NatCatChild contract updated for hours-based duration (6-8760 hours)
- [x] Frontend supports 6+ hours via hours/days toggle
- [x] RadiusSelector supports 10km minimum
- [x] TypeScript wrapper updated to send hours
- [x] All tests passing (14/14 tests)
- [x] TonConnect manifest configured for local and production
- [x] Frontend deployment script ready (preserves backend)

### Your Configuration
- **Funded Testnet Wallet**: `0QBkg6JGZ3m_JCyJy0DBKcR8A_fo8wel-NqWKlIBg6yi7IR2`
- **TON API Key**: `aef46a8a66231331827251c34f07413ca1c66d8305b216661ed8e784f5077d65`
- **Domain**: tonsurance.com (DNS configured)
- **Server Backend**: Working (Tonny + OCaml API - DO NOT OVERWRITE)

---

## 🧪 Step 1: Test Wallet Connection Locally (5 minutes)

### 1.1 Restart Dev Server (to pick up new manifest config)

```bash
# The dev server should restart automatically, but if not:
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/frontend
npm run dev
```

### 1.2 Test Wallet Connection

1. Open http://localhost:5174/tradfi
2. Click "Connect Wallet" button
3. Choose Tonkeeper or TON Wallet
4. Scan QR code with your wallet app
5. **Expected**: Wallet connects successfully
6. **Your address should show**: `0QBkg...7IR2`

### 1.3 Verify Configuration

```bash
# Check that manifest is served correctly
curl http://localhost:5174/tonconnect-manifest.json
# Should return JSON with "url": "http://localhost:5174"
```

**✅ Mark complete when wallet connects successfully locally**

---

## 🚀 Step 2: Deploy Smart Contracts to Testnet (15 minutes)

### 2.1 Verify Wallet Balance

```bash
# Check your testnet wallet has enough TON
# Minimum needed: 6.0 TON
# Your wallet: 0QBkg6JGZ3m_JCyJy0DBKcR8A_fo8wel-NqWKlIBg6yi7IR2
```

If balance is low, get testnet TON:
- Telegram bot: https://t.me/testgiver_ton_bot
- Send: `/get 0QBkg6JGZ3m_JCyJy0DBKcR8A_fo8wel-NqWKlIBg6yi7IR2`

### 2.2 Deploy Contracts

```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Deploy complete contract suite (8 contracts)
npx blueprint run scripts/v3/deployHackathonDemo.ts
```

**What This Deploys**:
1. **MasterFactory** - Main factory contract
2. **PolicyNFTMinter** - Mints policy NFTs
3. **MultiTrancheVault** - Manages liquidity
4. **PriceOracle** - Price feeds
5. **DepegSubFactory** - DeFi factory
   - USDT Child
   - USDC Child
   - USDe Child
6. **TradFiNatCatFactory** - TradFi factory
   - Hurricane Child (3% APR, 6+ hours duration)
   - Earthquake Child (1.5% APR, 6+ hours duration)

**Expected Output**:
```
🎯 ===== TONSURANCE HACKATHON DEMO DEPLOYMENT =====

📍 Network: TESTNET
💰 Required balance: ~6.0 TON

Step 1: Configuration
Deployer: 0QBkg6JGZ3m_JCyJy0DBKcR8A_fo8wel-NqWKlIBg6yi7IR2
Balance: 6.50 TON
✓ Configuration complete

Step 2: Compiling contracts...
✓ All contracts compiled successfully

Step 3: Deploying MasterFactory...
✓ MasterFactory deployed: EQA...

[... deployment continues ...]

🎉 DEPLOYMENT COMPLETE!
```

### 2.3 Save Contract Addresses

The script will output all contract addresses. **COPY THESE** to a text file:

```bash
# Create contract addresses file
cat > contract-addresses.txt << 'EOF'
VITE_MASTER_FACTORY_ADDRESS=EQA...
VITE_POLICY_NFT_MINTER_ADDRESS=EQB...
VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQC...
VITE_PRICE_ORACLE_ADDRESS=EQD...
VITE_DEPEG_SUBFACTORY_ADDRESS=EQE...
VITE_USDT_CHILD_ADDRESS=EQF...
VITE_USDC_CHILD_ADDRESS=EQG...
VITE_USDE_CHILD_ADDRESS=EQH...
VITE_NATCAT_FACTORY_ADDRESS=EQI...
VITE_HURRICANE_CHILD_ADDRESS=EQJ...
VITE_EARTHQUAKE_CHILD_ADDRESS=EQK...
EOF
```

**✅ Mark complete when all 11 contract addresses are saved**

---

## 🔧 Step 3: Update Frontend Configuration (5 minutes)

### 3.1 Update Local .env for Testing

```bash
cd frontend

# Edit .env with contract addresses
nano .env
# Paste the addresses from contract-addresses.txt
```

### 3.2 Update Production .env

```bash
# Edit production env
nano .env.production
# Paste the same addresses
```

### 3.3 Update contracts.ts Config

```bash
nano src/config/contracts.ts
```

Update the addresses:
```typescript
export const CONTRACTS = {
  masterFactory: 'EQA...',  // Your deployed address
  policyNFTMinter: 'EQB...',
  multiTrancheVault: 'EQC...',
  priceOracle: 'EQD...',
  defi: {
    depegSubFactory: 'EQE...',
    children: {
      usdt: 'EQF...',
      usdc: 'EQG...',
      usde: 'EQH...',
    }
  },
  tradfi: {
    natCatFactory: 'EQI...',
    children: {
      hurricane: 'EQJ...',
      earthquake: 'EQK...',
    }
  }
};
```

**✅ Mark complete when all config files updated**

---

## 🧪 Step 4: Test Locally with Real Contracts (10 minutes)

### 4.1 Restart Frontend

The dev server should hot-reload, but restart if needed:
```bash
# Frontend should already be running
# Check http://localhost:5174/tradfi
```

### 4.2 Test Hurricane Insurance Purchase

1. Navigate to http://localhost:5174/tradfi
2. Connect wallet (should work now)
3. Configure policy:
   - **Type**: Hurricane
   - **Coverage**: $10,000
   - **Duration**: Toggle to "HOURS", enter **12 hours** (overnight coverage)
   - **Location**: Miami, FL (or any US city)
   - **Radius**: 50 km
4. **Expected Premium**: ~$0.41 (12 hours = 0.5 days × $24.66/30 days)
5. Click "PURCHASE_POLICY"
6. Approve transaction in wallet
7. **Expected**: Transaction succeeds, policy created

### 4.3 Test Earthquake Insurance (6 Hours)

1. Same page, select **Earthquake**
2. Configure:
   - **Coverage**: $5,000
   - **Duration**: **6 hours** (minimum - overnight)
   - **Location**: San Francisco, CA
   - **Radius**: 25 km
3. **Expected Premium**: ~$0.10
4. Purchase and verify

### 4.4 Verify on TON Explorer

1. Copy transaction hash from wallet
2. Open https://testnet.tonscan.org
3. Paste hash
4. Verify contract interaction with Hurricane/Earthquake child addresses

**✅ Mark complete when both 6-hour and 12-hour policies work**

---

## 📦 Step 5: Build Frontend for Production (5 minutes)

### 5.1 Build Production Bundle

```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/frontend

# Build with production env
npm run build
```

**Expected Output**:
```
vite v7.1.9 building for production...
✓ 1217 modules transformed.
dist/index.html                     0.53 kB
dist/assets/index-xxx.css          30.19 kB
dist/assets/index-xxx.js        1,664.01 kB
✓ built in 2.32s
```

### 5.2 Switch to Production Manifest

```bash
# Copy production manifest to public directory
cp public/tonconnect-manifest.production.json public/tonconnect-manifest.json
```

**✅ Mark complete when build succeeds**

---

## 🚀 Step 6: Deploy Frontend to Server (10 minutes)

### 6.1 Run Deployment Script

```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Deploy ONLY frontend (preserves backend)
chmod +x deploy-frontend-safe.sh
./deploy-frontend-safe.sh root@YOUR_SERVER_IP:/app/Tonsurance/
```

**What Gets Deployed**:
- ✅ frontend/ (src, public, dist, .env, .env.production)
- ✅ contracts/v3/
- ✅ wrappers/v3/
- ✅ scripts/v3/
- ✅ tests/v3/

**What DOES NOT Get Deployed**:
- ❌ backend/ (server's working version preserved)
- ❌ docker-compose.yml (server's config preserved)
- ❌ backend .env (server's DB credentials preserved)

### 6.2 SSH to Server and Configure

```bash
ssh root@YOUR_SERVER_IP
cd /app/Tonsurance/frontend

# Verify manifest was deployed
cat public/tonconnect-manifest.json
# Should show "url": "https://tonsurance.com"

# Verify .env.production
cat .env.production
# Should have all contract addresses

# Install dependencies
npm install

# Build for production
npm run build
```

### 6.3 Restart Frontend Service

```bash
# Option A: Docker
docker-compose restart frontend

# Option B: PM2
pm2 restart tonsurance-frontend

# Option C: Systemd
sudo systemctl restart tonsurance-frontend
```

### 6.4 Verify Service Running

```bash
# Check logs
docker-compose logs -f frontend

# Test HTTP
curl http://localhost:3001
# Should return HTML

# Check if Nginx is serving it
curl https://app.tonsurance.com
```

**✅ Mark complete when frontend is live at https://app.tonsurance.com**

---

## 🧪 Step 7: Test Production Deployment (15 minutes)

### 7.1 Test Wallet Connection

1. Open https://app.tonsurance.com/tradfi
2. Click "Connect Wallet"
3. **Expected**: Manifest loads from https://tonsurance.com/tonconnect-manifest.json
4. Connect wallet
5. Verify your address shows: `0QBkg...7IR2`

### 7.2 Test Overnight Hurricane Coverage

1. Navigate to TradFi page
2. Select **Hurricane**
3. Configure:
   - Coverage: $10,000
   - Duration: **6 hours** (overnight)
   - Location: Miami, FL
   - Radius: 100 km
4. Expected Premium: ~$0.21
5. Purchase policy
6. **Verify on TON Explorer**: https://testnet.tonscan.org

### 7.3 Test 24-Hour Earthquake Coverage

1. Select **Earthquake**
2. Configure:
   - Coverage: $5,000
   - Duration: **24 hours** (1 day)
   - Location: San Francisco, CA
   - Radius: 50 km
3. Expected Premium: ~$0.20
4. Purchase and verify

### 7.4 Test DeFi Depeg Insurance

1. Navigate to https://app.tonsurance.com/policy
2. Select **STABLECOIN_DEPEG**
3. Configure:
   - Coverage: $10,000
   - Duration: 30 days
   - Stablecoins: USDT, USDC
4. Expected Premium: ~$6.58
5. Purchase and verify

**✅ Mark complete when all 3 product types work on production**

---

## 🔍 Step 8: Verify Server Backend Intact (5 minutes)

### 8.1 Check Backend API

```bash
# On server
ssh root@YOUR_SERVER_IP

# Check backend is still running
docker-compose ps api
# OR
sudo systemctl status tonsurance-backend

# Test API endpoint
curl http://localhost:8080/health
# Should return success
```

### 8.2 Check Tonny Bot

```bash
# Check Tonny is still running
docker-compose ps tonny-bot
# OR
ps aux | grep tonny

# Check Tonny logs (should show no errors)
docker-compose logs tonny-bot --tail 50
```

### 8.3 Check Database

```bash
# Verify database connection
docker-compose exec postgres psql -U tonsurance -d tonsurance -c "SELECT COUNT(*) FROM policies;"
# Should return count (not error)
```

**✅ Mark complete when backend/Tonny/DB all working**

---

## 📊 Deployment Summary

### Contract Addresses (Fill in after deployment)

```
MasterFactory:          EQA...
PolicyNFTMinter:        EQB...
MultiTrancheVault:      EQC...
PriceOracle:            EQD...

DepegSubFactory:        EQE...
  USDT Child:           EQF...
  USDC Child:           EQG...
  USDe Child:           EQH...

TradFiNatCatFactory:    EQI...
  Hurricane Child:      EQJ...
  Earthquake Child:     EQK...
```

### Deployment URLs

- **Marketing**: https://tonsurance.com
- **Mini-App**: https://app.tonsurance.com
- **Backend API**: https://api.tonsurance.com
- **TON Explorer**: https://testnet.tonscan.org

### Overnight Coverage Features

- ✅ Hurricane insurance: **6-8760 hours** (6 hours to 365 days)
- ✅ Earthquake insurance: **6-8760 hours**
- ✅ Radius: **10-500 km** (down to neighborhood level)
- ✅ Premium formula: `coverage × APR × (hours / 8760)`
- ✅ Frontend: Hours/days toggle for easy UX

### Demo Script

**6-Hour Overnight Hurricane Bond**:
1. User in Miami needs coverage for hurricane season overnight
2. Purchases 6-hour policy for $10k coverage
3. Premium: ~$0.21 (vs. $24.66 for 30 days)
4. Hurricane hits within 50km radius
5. Automatic payout within 10 seconds
6. No claims, no paperwork - fully parametric

**Target Use Case**: Micro-duration natural catastrophe bonds for event-specific coverage (e.g., tropical storm warnings, earthquake aftershock periods)

---

## 🎉 Success Criteria

- [ ] Wallet connects on https://app.tonsurance.com
- [ ] Can purchase 6-hour hurricane policy
- [ ] Can purchase 24-hour earthquake policy
- [ ] Can purchase 30-day USDT depeg policy
- [ ] All transactions confirm on TON testnet
- [ ] Backend/Tonny still operational on server
- [ ] No data loss from deployment

---

## 🆘 Troubleshooting

### Issue: Wallet connection fails

**Solution**:
```bash
# Verify manifest is served
curl https://tonsurance.com/tonconnect-manifest.json
# Should return valid JSON

# Check Nginx config allows .json
sudo nginx -t
sudo systemctl restart nginx
```

### Issue: Contract deployment fails

**Solution**:
```bash
# Check wallet balance
# Get more testnet TON: https://t.me/testgiver_ton_bot

# Deploy one contract at a time if needed
npx blueprint run scripts/v3/deployMasterFactory.ts
```

### Issue: Frontend build fails

**Solution**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Backend stopped working

**Solution**:
```bash
# This means the deployment script touched backend files
# Rollback and restore from server's version

# Restore backend from git stash
git stash list
git stash apply stash@{0}  # Or restore from backup
```

---

**Last Updated**: 2024-11-11 (Pre-hackathon deployment)
**Status**: Ready for deployment
**Estimated Total Time**: 70 minutes
