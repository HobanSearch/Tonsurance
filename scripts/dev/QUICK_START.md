# Tonsurance Deployment - Quick Start

## 5-Minute Deployment Guide

### Prerequisites
- Node.js 18+ installed
- At least 10 TON in testnet tokens

### Step 1: Create Wallet (30 seconds)
```bash
npm run deploy:create-wallet
```

**Output**: 24-word mnemonic and wallet address
**Action**: Save mnemonic securely!

### Step 2: Fund Wallet (2 minutes)
```bash
# Use Telegram bot
https://t.me/testgiver_ton_bot

# Send to: EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4
# Amount: 10-100 TON (more = can deploy sharding)
```

### Step 3: Configure Wallet (30 seconds)
```bash
cp .env.deployment.example .env.deployment
# Edit .env.deployment and paste your mnemonic
```

### Step 4: Verify Contracts (1 minute)
```bash
npm run deploy:verify-contracts
```

Should show: ✅ All contracts compiled successfully

### Step 5: Deploy! (20-30 minutes)
```bash
npm run deploy:all-testnet
```

**Interactive prompts**:
1. Deploy MultiTrancheVault? → `y`
   - Enter admin address: [your wallet]
2. Deploy DynamicPricingOracle? → `y`
   - Enter admin address: [your wallet]
   - Enter keeper address: [your wallet]
3. Deploy PolicyFactory? → `y`
   - Enter admin, treasury, vault addresses (from previous deployments)
4. Deploy PolicyRouter? → `n` (skip for testnet, saves ~77 TON)

**Cost without sharding**: ~5.5 TON
**Time**: ~20-25 minutes

### Step 6: Verify (1 minute)
```bash
npm run deploy:verify
```

Should show: ✅ All contracts verified successfully!

### Step 7: Update Frontend (30 seconds)
```bash
npm run deploy:update-frontend
cd frontend && npm run dev
```

Frontend now connected to deployed contracts!

### Step 8: Test (5-10 minutes)
```bash
npm run deploy:test-integration
```

Then manually test in browser:
1. Open http://localhost:5173
2. Connect wallet
3. Try purchasing a policy
4. Check Analytics page

## Quick Commands

```bash
# Full deployment (one command)
npm run deploy:all-testnet

# Verify deployment
npm run deploy:verify

# Update frontend
npm run deploy:update-frontend

# Test integration
npm run deploy:test-integration

# Individual deployments
npm run deploy:vault
npm run deploy:oracle
npm run deploy:factory
npm run deploy:sharding  # (expensive, skip for testnet)
```

## Troubleshooting

**"Insufficient balance"**
→ Get more TON: https://t.me/testgiver_ton_bot

**"Contract deployment timeout"**
→ Wait 1-2 minutes, check testnet.tonscan.org

**"Compilation failed"**
→ Run: `npm install && npm run deploy:verify-contracts`

**"Cannot find .env.deployment"**
→ Run: `cp .env.deployment.example .env.deployment`
→ Edit and add your mnemonic

## Deployed Addresses

After deployment, find addresses in:
- `frontend/.env.deployment`
- `logs/deployment-[timestamp].log`

## Testnet Explorer

Verify contracts at:
https://testnet.tonscan.org/address/[CONTRACT_ADDRESS]

## Full Guide

See: `scripts/dev/DEPLOYMENT_GUIDE.md`

---

**Estimated Total Time**: 30-40 minutes
**Estimated Total Cost**: 5.5-10 TON (testnet)
