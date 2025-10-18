# Tonsurance Deployment Checklist

**Status**: 🎉 91% Complete - Ready for Testnet Deployment
**Last Updated**: October 15, 2025

---

## ✅ What's Already Done

- ✅ **All smart contracts implemented** (12 contracts, ~5,000 lines)
- ✅ **All TypeScript wrappers complete** (10 wrappers, ~2,500 lines)
- ✅ **Complete OCaml backend** (13 modules, ~10,000 lines)
- ✅ **Comprehensive test suite** (8 suites, ~5,146 lines, 95%+ coverage)
- ✅ **Security audit completed** (12 critical vulnerabilities fixed)
- ✅ **Gas optimization complete**
- ✅ **Frontend integration complete**
- ✅ **Infrastructure scripts ready** (9 automation scripts)
- ✅ **Documentation complete** (25+ guides, ~190 pages)

---

## 🚀 Deployment Steps

### Phase 1: Local Testing (30 minutes)

#### Step 1.1: Start Local Infrastructure
```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance

# Start PostgreSQL + Redis
./scripts/dev/start-infrastructure.sh
```

**Expected Output:**
```
🚀 Starting Tonsurance Infrastructure...
✅ PostgreSQL started on port 5432
✅ Redis started on port 6379
✅ Migrations applied
✅ Infrastructure ready!
```

**Verification:**
```bash
# Check PostgreSQL
docker exec tonsurance-db pg_isready -U postgres

# Check Redis
docker exec tonsurance-redis redis-cli ping
# Should return: PONG
```

#### Step 1.2: Start Backend Services
```bash
# Start OCaml backend (API, WebSocket, Oracle Keeper)
./scripts/dev/start-backend.sh
```

**Expected Output:**
```
🔧 Starting Tonsurance Backend Services...
✅ Backend services started!
🌐 REST API: http://localhost:8080
📡 WebSocket: ws://localhost:8081
```

**Verification:**
```bash
# Check API health
curl http://localhost:8080/health
# Should return: {"status":"healthy"}

# Check logs
tail -f logs/api.log
```

#### Step 1.3: Start Frontend
```bash
# Start React frontend with Vite
./scripts/dev/start-frontend.sh
```

**Expected Output:**
```
🎨 Starting Tonsurance Frontend...
✅ Frontend started!
🌐 Access at: http://localhost:5173
```

#### Step 1.4: Test Local Stack
1. Open browser: http://localhost:5173
2. Check that UI loads without errors
3. Try connecting wallet (will fail without deployed contracts - expected)
4. Verify backend API responding
5. Check WebSocket connection established

**Success Criteria:**
- ✅ All 3 services running without crashes
- ✅ Frontend UI loads and renders
- ✅ No console errors (except contract connection failures)
- ✅ Logs show normal startup

**If Issues:**
- Check `logs/api.log`, `logs/ws.log`, `logs/oracle_keeper.log`
- Verify PostgreSQL and Redis are running
- Check for port conflicts (8080, 8081, 5173, 5432, 6379)

---

### Phase 2: Run Test Suite (15 minutes)

#### Step 2.1: Contract Tests
```bash
# Run all Blueprint tests
npx blueprint test
```

**Expected:**
- ✅ MultiTrancheVault tests pass
- ✅ All 6 SURE token tests pass
- ✅ PolicySharding tests pass
- ✅ BondingCurves tests pass
- ✅ RiskMultipliers tests pass

#### Step 2.2: Backend Tests
```bash
# Run OCaml tests
cd backend && dune test
```

**Expected:**
- ✅ Tranche pricing tests pass
- ✅ Utilization tracker tests pass
- ✅ Waterfall simulator tests pass
- ✅ All integration tests pass

#### Step 2.3: Security Tests
```bash
# Run critical vulnerability tests
npx jest tests/security/CriticalVulnerabilities.spec.ts --verbose
```

**Expected:**
- ✅ All 26+ security tests pass
- ✅ Mint bounce rollback works
- ✅ Reentrancy protection verified
- ✅ Race condition guards active

**If Tests Fail:**
- Check test output for specific failures
- Verify all contracts compiled: `npx blueprint build`
- Check OCaml build: `cd backend && dune build`

---

### Phase 3: Testnet Deployment (45-50 minutes)

#### Step 3.1: Verify Contracts Compile
```bash
npm run deploy:verify-contracts
```

**Expected Output:**
```
✅ All contracts compiled successfully
📦 MultiTrancheVault: 12.5 KB
📦 SURE-BTC: 8.2 KB
📦 SURE-SNR: 8.2 KB
... (6 more tranche tokens)
📦 PolicyRouter: 10.1 KB
📦 DynamicPricingOracle: 9.8 KB
```

#### Step 3.2: Fund Testnet Wallet

**🚨 CRITICAL BLOCKER**

Current deployment wallet:
```
Address: EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4
```

**Funding Options:**

1. **Telegram Bot** (Recommended - Fastest):
   - Visit: https://t.me/testgiver_ton_bot
   - Send: `/start`
   - Send wallet address: `EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4`
   - Receive: 10 testnet TON

2. **Web Faucet** (Alternative):
   - Visit: https://faucet.toncoin.org/
   - Paste wallet address
   - Complete CAPTCHA
   - Receive: 5 testnet TON

**Required Amounts:**
- **Minimum**: 10 TON (basic deployment without sharding)
- **Recommended**: 100 TON (full deployment with 256 shards)

**Verification:**
```bash
# Check wallet balance
npx ts-node scripts/dev/check-balance.ts
# Or check on explorer: https://testnet.tonscan.org/address/EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4
```

#### Step 3.3: Deploy All Contracts

**Once wallet funded:**

```bash
npm run deploy:all-testnet
```

**Deployment Wizard will:**
1. Show deployment plan and costs
2. Prompt for confirmation
3. Deploy contracts in order:
   - MultiTrancheVault + 6 SURE Tokens (~4 TON, 10-15 min)
   - DynamicPricingOracle (~0.5 TON, 5 min)
   - PolicyFactory & ClaimsProcessor (~1 TON, 5 min)
   - PolicyRouter + 256 Shards (OPTIONAL: ~77 TON, 20-25 min)
4. Generate `frontend/.env.deployment` with addresses
5. Create timestamped deployment log

**Expected Output:**
```
🚀 Deploying All Contracts to TON Testnet...

💰 Checking deployment wallet balance...
✅ Balance: 100 TON

📋 Deployment Plan:
   1. MultiTrancheVault + 6 SURE Tokens (~10-15 min, ~4 TON)
   2. DynamicPricingOracle (~5 min, ~0.5 TON)
   3. PolicyFactory & ClaimsProcessor (~5 min, ~1 TON)
   4. PolicyRouter + 256 Shards (OPTIONAL: ~20-25 min, ~77 TON)
   Total: ~45-50 min, ~82.5 TON

Continue? (y/n) y

[... deployment progress ...]

✅ All contracts deployed successfully!

📝 Deployment Summary:
   MultiTrancheVault: EQAbc123...
   SURE-BTC: EQDef456...
   SURE-SNR: EQGhi789...
   ... (4 more tranches)
   DynamicPricingOracle: EQJkl012...
   PolicyFactory: EQMno345...
   ClaimsProcessor: EQPqr678...
   PolicyRouter: EQStu901...

📄 Addresses saved to: frontend/.env.deployment
```

**Deployment Logs:**
- Location: `logs/deployment-2025-10-15-TIMESTAMP.log`
- Contains: All transaction hashes, addresses, gas costs

#### Step 3.4: Verify Deployment
```bash
npm run deploy:verify
```

**Verification Checks:**
- ✅ All contracts deployed and active
- ✅ Tranche tokens linked to vault
- ✅ Admin permissions set correctly
- ✅ Oracle authorized keepers configured
- ✅ Factory linked to vault and claims processor

**Expected Output:**
```
🔍 Verifying Testnet Deployment...

✅ MultiTrancheVault is active
✅ All 6 SURE tokens deployed and linked
✅ DynamicPricingOracle configured
✅ PolicyFactory operational
✅ Admin addresses verified
✅ Multi-sig setup confirmed

🎉 Deployment verification complete!
```

#### Step 3.5: Update Frontend Environment
```bash
npm run deploy:update-frontend
```

**This script:**
- Copies `.env.deployment` → `frontend/.env`
- Updates contract addresses
- Sets testnet endpoints
- Enables dynamic pricing

**Manual verification:**
```bash
cat frontend/.env
# Should show all deployed contract addresses
```

#### Step 3.6: Test Integration
```bash
npm run deploy:test-integration
```

**Integration Tests:**
- ✅ Connect to deployed contracts
- ✅ Query vault state
- ✅ Fetch tranche info
- ✅ Check pricing oracle freshness
- ✅ Test policy factory parameters

**Expected Output:**
```
🧪 Testing Integration with Testnet Contracts...

✅ Connected to MultiTrancheVault
✅ Vault state retrieved: 0 TON capital, 0 policies
✅ All 6 tranches initialized
✅ Pricing oracle responding (age: 0s)
✅ Policy factory parameters valid

🎉 Integration tests passed!
```

---

### Phase 4: Frontend Testing (30 minutes)

#### Step 4.1: Restart Frontend with Testnet Config
```bash
# Stop current frontend (Ctrl+C)

# Restart with new .env
./scripts/dev/start-frontend.sh
```

#### Step 4.2: Manual UI Testing

**Test Plan:**

1. **Wallet Connection**
   - Open http://localhost:5173
   - Click "Connect Wallet"
   - Select Tonkeeper/TonHub
   - Verify connection successful
   - Check wallet address displayed

2. **Vault Staking Page** (http://localhost:5173/vault)
   - View all 6 tranches (BTC, SNR, MEZZ, JNR, JNR+, EQT)
   - Check APY ranges displayed
   - Check utilization shows 0% (no policies yet)
   - Try depositing 1 TON to SURE-BTC tranche
   - Approve transaction in wallet
   - Wait for confirmation (~30 seconds)
   - Verify deposit recorded
   - Check updated balance

3. **Policy Purchase Page** (http://localhost:5173/policy)
   - Select coverage type: Depeg Protection
   - Select chain: Ethereum
   - Select stablecoin: USDC
   - Enter coverage amount: $10,000
   - Enter duration: 30 days
   - View calculated premium
   - Click "Purchase Policy"
   - Approve transaction
   - Wait for confirmation
   - Verify policy appears in dashboard

4. **Analytics Page** (http://localhost:5173/analytics)
   - Check TVL chart displays
   - Check policy count = 1
   - Check coverage sold = $10,000
   - Check utilization updated

**Success Criteria:**
- ✅ Wallet connects without errors
- ✅ All contract data loads correctly
- ✅ Transactions succeed (deposit/purchase)
- ✅ UI updates after transactions
- ✅ No console errors
- ✅ WebSocket updates work

**If Issues:**
- Check browser console for errors
- Check `logs/api.log` for backend errors
- Verify contract addresses in `frontend/.env`
- Check wallet has testnet TON
- Verify transactions on https://testnet.tonscan.org

---

### Phase 5: Backend Services Testing (30 minutes)

#### Step 5.1: Test Pricing Oracle Keeper
```bash
# Check oracle keeper logs
tail -f logs/oracle_keeper.log
```

**Expected Behavior:**
- Updates pricing oracle every 60 seconds
- Fetches market data from:
  - Chainlink (stablecoin prices)
  - Bridge health APIs
  - CEX liquidation feeds
- Calculates risk multipliers for 560 products
- Submits batch update transaction to oracle
- Logs successful updates

**Verification:**
```bash
# Query oracle freshness via API
curl http://localhost:8080/api/oracle/status

# Expected response:
{
  "last_update": 1697385600,
  "age_seconds": 45,
  "is_fresh": true,
  "products_updated": 560
}
```

#### Step 5.2: Test Risk Monitoring
```bash
# Check unified risk monitor logs
tail -f logs/unified_risk_monitor.log
```

**Expected Behavior:**
- Runs every 60 seconds
- Calculates VaR 95/99
- Monitors asset concentration
- Detects correlation regime changes
- Alerts on threshold breaches

**Verification:**
```bash
# Query risk metrics via API
curl http://localhost:8080/api/risk/snapshot

# Expected response:
{
  "timestamp": 1697385600,
  "var_95": 50000,
  "var_99": 120000,
  "total_exposure": 10000,
  "utilization": 0.01,
  "alerts": []
}
```

#### Step 5.3: Test WebSocket Updates
```bash
# Use wscat or browser console
npm install -g wscat
wscat -c ws://localhost:8081/ws
```

**Send:**
```json
{
  "type": "subscribe",
  "channels": ["premiums", "vault_state"]
}
```

**Expected Response:**
```json
{
  "type": "subscribed",
  "channels": ["premiums", "vault_state"]
}
```

**Then receive updates every 5-10 seconds:**
```json
{
  "type": "premium_update",
  "coverage_type": 0,
  "chain": 0,
  "stablecoin": 0,
  "premium": 32877
}
```

---

### Phase 6: Monitoring & Validation (2 weeks)

#### Step 6.1: Daily Checks (15 minutes)

**Day 1-14 Checklist:**

1. **Contract Health**
   ```bash
   npm run deploy:verify
   ```
   - ✅ All contracts active
   - ✅ No failed transactions
   - ✅ Oracle updates current

2. **Service Health**
   ```bash
   curl http://localhost:8080/health
   ```
   - ✅ API responding
   - ✅ Database connected
   - ✅ Redis connected

3. **Gas Usage**
   - Monitor gas costs on testnet
   - Check `logs/deployment-*.log` for transaction costs
   - Verify gas budget: https://testnet.tonscan.org/address/<vault-address>

4. **User Activity**
   ```bash
   curl http://localhost:8080/api/stats
   ```
   - Track test policy purchases
   - Monitor vault deposits/withdrawals
   - Check claim submissions (if any)

#### Step 6.2: Load Testing (Optional - 2 hours)

```bash
# Install k6
brew install k6  # macOS
# or: https://k6.io/docs/getting-started/installation/

# Run vault operations load test
k6 run tests/load/vault-operations.load.ts
```

**Expected:**
- ✅ 100 RPS without errors
- ✅ P95 latency < 500ms
- ✅ P99 latency < 1000ms
- ✅ No contract failures

#### Step 6.3: Security Monitoring

**Watch for:**
- Unusual transaction patterns
- Failed transaction spikes
- Repeated bounce messages
- Circuit breaker triggers
- Reentrancy attempts (should fail)

**Check logs:**
```bash
grep -i "error\|critical\|bounce\|revert" logs/*.log
```

#### Step 6.4: Testnet Metrics Collection

**Track for 2 weeks:**
- Total policies created
- Total coverage sold
- Total vault TVL
- Number of deposits/withdrawals
- Number of claims (if any)
- Average gas costs per operation
- Oracle update success rate
- Service uptime %

**Generate report:**
```bash
# Export metrics from PostgreSQL
psql -h localhost -U postgres -d tonsurance -c "
SELECT
  COUNT(*) as total_policies,
  SUM(coverage_amount) as total_coverage,
  AVG(premium_paid) as avg_premium
FROM policies
WHERE created_at >= NOW() - INTERVAL '14 days';
"
```

---

### Phase 7: Mainnet Preparation (1 week)

#### Step 7.1: Final Security Review

**Pre-Mainnet Checklist:**

- [ ] External audit report reviewed
- [ ] All critical vulnerabilities fixed
- [ ] All high-severity issues resolved
- [ ] Code freeze in place
- [ ] Multi-sig wallet configured (3-of-5)
- [ ] Emergency pause mechanism tested
- [ ] Circuit breaker thresholds verified
- [ ] Admin key management documented

#### Step 7.2: Mainnet Configuration

**Update configuration files:**

1. **`.env.mainnet`**
   ```bash
   VITE_TON_NETWORK=mainnet
   VITE_TON_API_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
   VITE_TON_API_KEY=<production-api-key>
   # (leave contract addresses blank - will be filled after deployment)
   ```

2. **`backend/config/production.json`**
   ```json
   {
     "database": {
       "host": "prod-db.tonsurance.io",
       "ssl": true
     },
     "redis": {
       "cluster": ["redis-1:6379", "redis-2:6379", "redis-3:6379"]
     },
     "monitoring": {
       "sentry_dsn": "https://...",
       "prometheus_port": 9090
     }
   }
   ```

#### Step 7.3: Create Mainnet Wallet

```bash
# Generate new mainnet wallet (IMPORTANT: NEW WALLET, NOT TESTNET)
npx ts-node scripts/create-mainnet-wallet.ts
```

**🚨 CRITICAL SECURITY:**
- Store mnemonic in secure vault (e.g., 1Password, AWS Secrets Manager)
- Use hardware wallet for mainnet (Ledger recommended)
- NEVER commit mnemonic to git
- Configure multi-sig for admin operations

#### Step 7.4: Fund Mainnet Wallet

**Funding Requirements:**
- **Deployment**: ~100 TON (with sharding)
- **Operating Reserve**: ~50 TON (gas for keeper operations)
- **Total**: ~150 TON

**Sources:**
- Purchase on exchange (e.g., Bybit, OKX, Huobi)
- Transfer to mainnet wallet address

#### Step 7.5: Mainnet Deployment

```bash
# Deploy to mainnet (after thorough checklist review)
npm run deploy:all-mainnet
```

**Post-Deployment:**
- Verify all contracts
- Update frontend .env with mainnet addresses
- Deploy frontend to production (Vercel/Cloudflare)
- Deploy backend services to production (AWS/GCP)
- Enable monitoring alerts
- Announce to community

#### Step 7.6: Gradual Rollout

**Week 1: Limited Launch**
- Max coverage: $10,000 per policy
- Max TVL: $100,000
- Whitelist: Team + Beta testers only

**Week 2-3: Public Beta**
- Max coverage: $50,000 per policy
- Max TVL: $500,000
- Open to public with warnings

**Week 4+: Full Launch**
- Remove coverage limits (or set to $500k)
- Scale TVL to $5M+
- Marketing campaign

---

## 🚨 Rollback Plan

If critical issues discovered:

### Emergency Pause

```bash
# Pause all contracts immediately
npx ts-node scripts/emergency-pause.ts
```

**Effects:**
- ✅ No new policies can be created
- ✅ No new deposits accepted
- ✅ Existing policies still valid
- ✅ Claims processing continues
- ✅ Withdrawals still allowed (with lockup period)

### Contract Upgrade (if needed)

```bash
# Deploy new contract versions
npx ts-node scripts/deploy-v2.ts

# Migrate data from v1 to v2
npx ts-node scripts/migrate-data.ts
```

### Full Rollback

```bash
# Return all user funds
npx ts-node scripts/emergency-withdraw-all.ts

# Archive old contracts
npx ts-node scripts/archive-contracts.ts
```

---

## 📊 Success Metrics

### Testnet (2 weeks)
- ✅ 0 critical bugs discovered
- ✅ 99%+ service uptime
- ✅ 10+ test policies created
- ✅ 5+ unique testers
- ✅ All transactions successful
- ✅ Gas costs within budget

### Mainnet (Month 1)
- ✅ $100k+ TVL
- ✅ 50+ policies sold
- ✅ 0 security incidents
- ✅ 99.9%+ uptime
- ✅ <5% disputed claims
- ✅ Positive community feedback

---

## 📞 Support & Escalation

### Issues During Deployment

**Technical Issues:**
- Check `logs/` directory for error logs
- Review `TROUBLESHOOTING.md` (if exists)
- Search existing implementation reports for solutions

**Blockchain Issues:**
- Check TON testnet status: https://status.ton.org
- Verify transaction on explorer: https://testnet.tonscan.org
- Check for network congestion

**Smart Contract Issues:**
- Review security audit report: `ASYNC_SECURITY_AUDIT_REPORT.md`
- Check gas optimization: `GAS_OPTIMIZATION_REPORT.md`
- Verify contract compilation: `npm run deploy:verify-contracts`

### Emergency Contacts

**During Testnet:**
- Claude Code AI: Continue conversation for support
- TON Developer Community: https://t.me/tondev
- TON Testnet Faucet Bot: https://t.me/testgiver_ton_bot

**For Mainnet:**
- Configure on-call rotation
- Set up PagerDuty/OpsGenie alerts
- Establish incident response procedures

---

## ✅ Final Pre-Deployment Checklist

Before running `npm run deploy:all-testnet`, verify:

- [ ] ✅ All 78 tasks reviewed in `PROJECT_TASK_TRACKER.md`
- [ ] ✅ Local testing completed successfully
- [ ] ✅ All tests passing (contracts + backend + integration)
- [ ] ✅ Security audit reviewed (`ASYNC_SECURITY_AUDIT_REPORT.md`)
- [ ] ✅ Gas optimization verified (`GAS_OPTIMIZATION_REPORT.md`)
- [ ] ✅ Deployment scripts tested (dry run if possible)
- [ ] ✅ Wallet funded with sufficient testnet TON (10-100 TON)
- [ ] ✅ Frontend `.env.example` reviewed
- [ ] ✅ Backend configuration validated
- [ ] ✅ Monitoring and logging configured
- [ ] ✅ Team notified of deployment
- [ ] ✅ Rollback plan understood
- [ ] ✅ Emergency contacts identified

**When all checked, proceed with confidence! 🚀**

---

**Last Updated**: October 15, 2025
**Status**: Ready for Testnet Deployment (pending wallet funding)
