# Tonsurance Hackathon Deployment Guide

## 🎯 Quick Start

This guide walks you through deploying Tonsurance frontend updates to your server **without touching the working backend/Tonny setup**.

---

## ✅ Pre-Deployment Checklist

- [x] TON API key configured in `frontend/.env`
- [x] Domain DNS configured (tonsurance.com, app.tonsurance.com, api.tonsurance.com)
- [x] Frontend built locally (`npm run build` succeeded)
- [x] Server has working backend + Tonny (DO NOT OVERWRITE)
- [ ] Deployer wallet has 6.0+ TON for contract deployment

---

## 📋 Deployment Options

### Option 1: Rsync (Recommended - Fast & Safe)

**Advantages**:
- Selective file sync - only frontend files deployed
- Server backend/tonny untouched
- Fast incremental updates
- No git conflicts

**Steps**:

1. **Verify Script Configuration**
   ```bash
   cat deploy-frontend-safe.sh
   # Review excluded directories: backend/, docker-compose.yml, backend .env
   ```

2. **Run Deployment**
   ```bash
   ./deploy-frontend-safe.sh root@YOUR_SERVER:/app/Tonsurance/
   ```

3. **What Gets Deployed**:
   ```
   ✅ frontend/src/           (TradFi page, components, config)
   ✅ frontend/public/        (products.json, contracts.json, manifest)
   ✅ frontend/dist/          (built assets)
   ✅ frontend/.env           (with TON API key and contract addresses)
   ✅ frontend/package*.json
   ✅ frontend/vite.config.ts
   ✅ contracts/v3/           (new v3 contracts)
   ✅ wrappers/v3/            (new v3 wrappers)
   ✅ scripts/v3/             (deployment scripts)
   ```

4. **What Stays Unchanged on Server**:
   ```
   ❌ backend/                (OCaml API - server's working version)
   ❌ backend/.env            (server's database credentials)
   ❌ docker-compose.yml      (server's service config)
   ❌ backend/tonny/          (server's working Tonny setup)
   ```

---

### Option 2: Git Selective Branch (Alternative)

**Advantages**:
- Version controlled
- Easy rollback
- Peer review possible

**Steps**:

1. **Create Deployment Branch**
   ```bash
   git checkout -b deploy-hackathon-frontend
   ```

2. **Stage ONLY Frontend Files**
   ```bash
   # Frontend core files
   git add frontend/src/
   git add frontend/public/
   git add frontend/.env
   git add frontend/package.json
   git add frontend/vite.config.ts
   git add frontend/tsconfig*.json
   git add frontend/index.html

   # V3 contracts
   git add contracts/v3/
   git add wrappers/v3/
   git add scripts/v3/
   git add tests/v3/

   # Documentation
   git add HACKATHON_DEPLOYMENT_GUIDE.md
   ```

3. **Verify What's Staged**
   ```bash
   git status
   # Should NOT see backend/ or tonny/ files
   ```

4. **Commit and Push**
   ```bash
   git commit -m "Hackathon frontend deployment: TradFi + v3 contracts

   - Add TradFi catastrophe insurance page
   - Add location picker and radius selector components
   - Add v3 contract deployment scripts
   - Update products.json with Hurricane/Earthquake coverage
   - Configure for tonsurance.com domain
   - TON API key configured

   Backend/Tonny NOT included - server version preserved"

   git push origin deploy-hackathon-frontend
   ```

5. **Deploy on Server**
   ```bash
   ssh root@YOUR_SERVER
   cd /app/Tonsurance

   # Fetch new branch
   git fetch origin deploy-hackathon-frontend

   # IMPORTANT: Stash server changes first (preserves backend)
   git stash push backend/ docker-compose.yml backend/.env -m "Server backend"

   # Checkout frontend-only branch
   git checkout deploy-hackathon-frontend

   # Restore server backend
   git stash pop
   ```

---

## 🚀 Phase 2: Deploy Smart Contracts

After frontend files are on server, deploy contracts to TON testnet.

### 2.1 Prepare Deployer Wallet

1. **Check Wallet Balance**
   ```bash
   # On your local machine (Blueprint setup)
   npx blueprint run scripts/checkBalance
   ```

2. **Get Testnet TON** (if needed)
   - Telegram bot: https://t.me/testgiver_ton_bot
   - Send command: `/get YOUR_WALLET_ADDRESS`
   - Minimum needed: **6.0 TON**

### 2.2 Deploy Contracts

```bash
# On local machine (or server - both work)
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Compile contracts
npx blueprint build

# Deploy all 8 contracts
npx blueprint run scripts/v3/deployHackathonDemo.ts
```

**Expected Output**:
```
🎯 ===== TONSURANCE HACKATHON DEMO DEPLOYMENT =====

📍 Network: TESTNET
💰 Required balance: ~6.0 TON

Step 1: Configuration
Deployer: EQ...xyz
Balance: 6.50 TON
✓ Configuration complete

Step 2: Compiling contracts...
✓ All contracts compiled successfully

Step 3: Deploying MasterFactory...
✓ MasterFactory deployed: EQA...abc

Step 4: Deploying supporting contracts...
✓ PolicyNFTMinter deployed: EQB...def
✓ MultiTrancheVault deployed: EQC...ghi
✓ PriceOracle deployed: EQD...jkl

Step 5: Deploying DepegSubFactory...
✓ DepegSubFactory deployed: EQE...mno
  ✓ USDT child: EQF...pqr
  ✓ USDC child: EQG...stu
  ✓ USDe child: EQH...vwx

Step 6: Deploying TradFiNatCatFactory...
✓ TradFiNatCatFactory deployed: EQI...yza
  ✓ Hurricane child: EQJ...bcd
  ✓ Earthquake child: EQK...efg

🎉 DEPLOYMENT COMPLETE!
📋 Copy these addresses to frontend/.env
```

### 2.3 Save Contract Addresses

Create a file `contract-addresses.txt` with all addresses:

```bash
# MasterFactory and supporting contracts
VITE_MASTER_FACTORY_ADDRESS=EQA...abc
VITE_POLICY_NFT_MINTER_ADDRESS=EQB...def
VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQC...ghi
VITE_PRICE_ORACLE_ADDRESS=EQD...jkl

# DeFi SubFactory and children
VITE_DEPEG_SUBFACTORY_ADDRESS=EQE...mno
VITE_USDT_CHILD_ADDRESS=EQF...pqr
VITE_USDC_CHILD_ADDRESS=EQG...stu
VITE_USDE_CHILD_ADDRESS=EQH...vwx

# TradFi SubFactory and children
VITE_NATCAT_FACTORY_ADDRESS=EQI...yza
VITE_HURRICANE_CHILD_ADDRESS=EQJ...bcd
VITE_EARTHQUAKE_CHILD_ADDRESS=EQK...efg
```

---

## 🔧 Phase 3: Configure Server

### 3.1 Update Frontend .env with Contract Addresses

```bash
# SSH to server
ssh root@YOUR_SERVER

# Edit frontend environment
cd /app/Tonsurance/frontend
nano .env
```

Paste the contract addresses from `contract-addresses.txt`.

**Verify Critical Variables**:
```bash
grep -E 'VITE_(MASTER_FACTORY|USDT_CHILD|HURRICANE_CHILD)' .env
# Should see real addresses, not empty
```

### 3.2 Update Frontend Config

Edit `frontend/src/config/contracts.ts`:

```typescript
export const CONTRACTS = {
  masterFactory: 'EQA...abc',  // Update with real address
  policyNFTMinter: 'EQB...def',
  multiTrancheVault: 'EQC...ghi',
  priceOracle: 'EQD...jkl',
  defi: {
    depegSubFactory: 'EQE...mno',
    children: {
      usdt: 'EQF...pqr',
      usdc: 'EQG...stu',
      usde: 'EQH...vwx',
    }
  },
  tradfi: {
    natCatFactory: 'EQI...yza',
    children: {
      hurricane: 'EQJ...bcd',
      earthquake: 'EQK...efg',
    }
  }
};
```

---

## 🏗️ Phase 4: Rebuild Frontend on Server

### 4.1 Install Dependencies & Build

```bash
# On server
cd /app/Tonsurance/frontend

# Install dependencies (if package.json changed)
npm install

# Build for production
npm run build
```

**Expected Output**:
```
vite v7.1.9 building for production...
✓ 1217 modules transformed.
dist/index.html                     0.53 kB
dist/assets/index-fn94qPnP.css     30.19 kB
dist/assets/index-Cn5torGP.js   1,664.01 kB
✓ built in 2.32s
```

### 4.2 Restart Frontend Service

```bash
# Option A: Docker Compose
docker-compose restart frontend

# Option B: Systemd
sudo systemctl restart tonsurance-frontend

# Option C: PM2
pm2 restart tonsurance-frontend
```

### 4.3 Verify Service Running

```bash
# Check logs
docker-compose logs -f frontend
# OR
sudo journalctl -u tonsurance-frontend -f

# Test HTTP endpoint
curl http://localhost:3001
# Should return HTML
```

---

## 🧪 Phase 5: End-to-End Testing

### 5.1 Test DeFi Depeg Insurance

1. **Navigate to App**
   - Open: https://app.tonsurance.com/policy
   - OR: http://YOUR_SERVER_IP:3001/policy

2. **Connect Wallet**
   - Click "Connect Wallet"
   - Choose Tonkeeper or TON Wallet
   - Approve connection

3. **Select Coverage**
   - Click "STABLECOIN_DEPEG" (0.8% APR)
   - Select stablecoins: USDT, USDC, or USDe
   - Select blockchains: TON, Ethereum, etc.

4. **Configure Parameters**
   - Coverage Amount: $10,000
   - Duration: 30 days
   - Expected Premium: ~$6.58

5. **Purchase Policy**
   - Click "PURCHASE" button
   - Approve transaction in wallet
   - Wait for confirmation (~10 seconds)

6. **Verify on Explorer**
   - Copy transaction hash
   - Open: https://testnet.tonscan.org
   - Verify contract interaction with deployed address

### 5.2 Test TradFi Catastrophe Insurance

1. **Navigate to TradFi Page**
   - Open: https://app.tonsurance.com/tradfi

2. **Select Catastrophe Type**
   - Click "🌀 HURRICANE" (3.0% APR)
   - OR "🏚️ EARTHQUAKE" (1.5% APR)

3. **Configure Coverage**
   - Coverage Amount: $10,000
   - Duration: 30 days

4. **Set Location**
   - Select "Miami, FL" from popular locations
   - OR enter custom address: "Miami Beach, FL"
   - OR manual coordinates: 25.7617, -80.1918

5. **Set Coverage Radius**
   - Use slider: 100 km
   - OR select preset: "100 km (Metropolitan area)"
   - Verify area displayed: ~31,416 km²

6. **Verify Premium**
   - Hurricane: ~$24.66 (3.0% APR)
   - Earthquake: ~$12.33 (1.5% APR)

7. **Purchase Policy**
   - Click "PURCHASE_POLICY"
   - Approve transaction
   - Verify geographic data encoded (lat/lon × 1M, radius in km)

### 5.3 Verify Contract Data

```bash
# Check PolicyNFT minted
# Query PolicyNFTMinter contract via TON API

# Check vault balances
# Query MultiTrancheVault contract

# Check price oracle integration
# Query PriceOracle contract for latest USDT/USD price
```

---

## 🔍 Troubleshooting

### Frontend Not Building

**Error**: "Module not found" or TypeScript errors

**Solution**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Contract Deployment Fails

**Error**: "Insufficient balance"

**Solution**:
- Get more testnet TON: https://t.me/testgiver_ton_bot
- Reduce deployment scope (deploy one factory at a time)

**Error**: "Contract already deployed"

**Solution**:
- Check if contract exists at expected address
- Use existing contract addresses instead of redeploying

### Wallet Connection Fails

**Error**: "Manifest not found" or CORS error

**Solution**:
1. Verify `tonconnect-manifest.json` is served at:
   ```
   https://tonsurance.com/tonconnect-manifest.json
   ```

2. Check Nginx/Apache config allows serving .json files:
   ```nginx
   location ~ \.json$ {
       add_header Content-Type application/json;
       add_header Access-Control-Allow-Origin *;
   }
   ```

3. Test manifest URL:
   ```bash
   curl https://tonsurance.com/tonconnect-manifest.json
   ```

### Backend API Not Responding

**Error**: "API connection failed" or 502 Bad Gateway

**Solution**:
1. Check backend service status:
   ```bash
   docker-compose ps api
   # OR
   sudo systemctl status tonsurance-backend
   ```

2. Check backend logs:
   ```bash
   docker-compose logs api
   ```

3. Verify port 8080 is open:
   ```bash
   sudo netstat -tulpn | grep 8080
   ```

4. Test backend health endpoint:
   ```bash
   curl http://localhost:8080/health
   ```

---

## 📊 Deployment Verification Checklist

- [ ] Frontend builds successfully
- [ ] All 8 contracts deployed to testnet
- [ ] Contract addresses updated in frontend/.env
- [ ] Frontend service running on server
- [ ] Domain DNS resolving correctly
- [ ] TonConnect manifest accessible
- [ ] DeFi policy purchase works end-to-end
- [ ] TradFi policy purchase works with location selection
- [ ] Wallet connection successful
- [ ] Transaction confirmed on TON explorer
- [ ] Backend API responding (optional for MVP)
- [ ] Server backend/Tonny still working

---

## 🎉 Success Metrics

**Frontend Deployed**:
- ✅ https://tonsurance.com - marketing site
- ✅ https://app.tonsurance.com - mini-app with TradFi page

**Contracts Live**:
- ✅ 8 contracts deployed to testnet
- ✅ DeFi: USDT, USDC, USDe depeg insurance
- ✅ TradFi: Hurricane and Earthquake parametric insurance

**User Flows Working**:
- ✅ Connect TON wallet via TonConnect
- ✅ Purchase depeg insurance (PolicyPurchase page)
- ✅ Purchase catastrophe insurance (TradFiInsurance page)
- ✅ Location picker with geocoding
- ✅ Radius selector with visual feedback
- ✅ Premium calculation for both product lines
- ✅ Transaction submission to blockchain

**Server Intact**:
- ✅ OCaml backend running (untouched)
- ✅ Tonny bot working (untouched)
- ✅ Database and Redis operational

---

## 🚀 Post-Deployment

### Monitor System Health

```bash
# Frontend logs
docker-compose logs -f frontend

# Backend logs
docker-compose logs -f api

# Tonny logs
docker-compose logs -f tonny-bot

# System metrics
docker stats
```

### Update Documentation

- [ ] Add contract addresses to project README
- [ ] Document any environment-specific configurations
- [ ] Create user guide for hackathon demo
- [ ] Share deployment summary with team

### Next Steps

1. **Test full user journeys** with external users
2. **Monitor transaction volume** on testnet
3. **Gather feedback** on UX flows
4. **Prepare demo script** for hackathon presentation
5. **Create video walkthrough** of both product lines

---

## 📞 Support

**Deployment Issues**:
- Check logs first
- Review this guide's Troubleshooting section
- Verify all environment variables set correctly

**Contract Issues**:
- TON Testnet Explorer: https://testnet.tonscan.org
- Blueprint Docs: https://github.com/ton-org/blueprint

**Server Issues**:
- SSH into server and check service status
- Review Nginx/Docker logs
- Verify firewall rules allow ports 80/443/8080

---

**Last Updated**: November 10, 2024 (Hackathon Deployment)
