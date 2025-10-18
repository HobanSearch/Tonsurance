# Tonsurance Deployment Guide

**Version:** 1.0
**Last Updated:** 2025-10-15
**Status:** Production Ready

This comprehensive guide covers all aspects of deploying Tonsurance to testnet and mainnet environments.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Testnet Deployment](#testnet-deployment)
5. [Mainnet Deployment](#mainnet-deployment)
6. [Database Management](#database-management)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)
10. [Security Considerations](#security-considerations)

---

## Overview

Tonsurance deployment consists of three main components:

1. **Smart Contracts** (TON blockchain)
   - PricingOracle.fc
   - MultiTrancheVault.fc + 6 SURE tokens
   - PolicyRouter.fc + 256 PolicyShard.fc contracts

2. **Backend Services** (Kubernetes)
   - OCaml backend (oracle aggregation, pricing)
   - PricingOracleKeeper (updates on-chain oracle)
   - BridgeHealthKeeper (monitors bridge health)
   - API v2 (REST endpoints)
   - WebSocket v2 (real-time updates)

3. **Infrastructure**
   - PostgreSQL + TimescaleDB (policy data)
   - Redis cluster (premium caching)
   - Prometheus + Grafana (monitoring)
   - Nginx (reverse proxy)

### Deployment Timeline

| Component | Testnet | Mainnet |
|-----------|---------|---------|
| Smart Contracts | ~15 min | ~45 min |
| Database Migrations | ~2 min | ~5 min |
| Backend Services | ~10 min | ~25 min |
| **Total** | **~30 min** | **~75 min** |

---

## Prerequisites

### Required Tools

```bash
# Install Node.js (v18+)
nvm install 18
nvm use 18

# Install OCaml (4.14.1)
opam switch create 4.14.1

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# Install PostgreSQL client
sudo apt-get install postgresql-client

# Install TON Blueprint
npm install -g @ton/blueprint
```

### Required Secrets

Create `.env.testnet` and `.env.mainnet` files:

```bash
# .env.testnet
TON_RPC_URL=https://testnet.toncenter.com/api/v2/jsonRPC
DEPLOYER_MNEMONIC="your testnet wallet mnemonic here"
ADMIN_ADDRESS="EQC..."
KEEPER_MNEMONIC="keeper wallet mnemonic"

DATABASE_URL=postgresql://user:pass@testnet-db.tonsurance.com/tonsurance
REDIS_URL=redis://testnet-redis.tonsurance.com:6379

POLYMARKET_API_KEY=pk_test_...
BINANCE_API_KEY=...
ALLIANZ_API_KEY=...

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Access Requirements

- **Testnet**: Single deployer wallet (>10 TON balance)
- **Mainnet**: Multi-sig wallet (3-of-5) + 100 TON minimum

---

## Architecture

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PIPELINE                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │   1. Run Tests (95%+)   │
                └─────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │   2. Security Scan      │
                └─────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │   3. Manual Approval    │
                │   (Mainnet Only)        │
                └─────────────────────────┘
                              │
                              ▼
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│  Smart Contracts    │               │  Backend Services   │
│  ───────────────    │               │  ─────────────────  │
│  • PricingOracle    │               │  • OCaml Backend    │
│  • MultiTranche     │               │  • Keepers          │
│  • PolicySharding   │               │  • API/WebSocket    │
└─────────────────────┘               └─────────────────────┘
          │                                       │
          └───────────────────┬───────────────────┘
                              ▼
                ┌─────────────────────────┐
                │   4. Health Checks      │
                └─────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │   5. Monitor (30 min)   │
                └─────────────────────────┘
```

---

## Testnet Deployment

### Automatic Deployment (Recommended)

Testnet deployments are fully automated via GitHub Actions:

1. **Push to `develop` branch**
   ```bash
   git checkout develop
   git add .
   git commit -m "feat: add new feature"
   git push origin develop
   ```

2. **GitHub Actions automatically:**
   - Runs full test suite
   - Builds contracts and services
   - Deploys to testnet
   - Runs smoke tests
   - Notifies Slack

3. **Monitor deployment:**
   - https://github.com/HobanSearch/Tonsurance/actions
   - Slack #deployments channel

### Manual Deployment

If you need to deploy manually:

#### Step 1: Deploy Smart Contracts

```bash
# Deploy PricingOracle
npx blueprint run deployPricingOracle --testnet

# Deploy MultiTrancheVault
npx blueprint run deployMultiTrancheVault --testnet

# Deploy PolicySharding (16 shards for testnet)
export SHARD_COUNT=16
npx blueprint run deployPolicySharding --testnet
```

**Expected Output:**
```
=== PricingOracle Deployment ===
Step 1: Compiling PricingOracle.fc...
✓ Contract compiled successfully

Step 2: Configuration
Admin address: EQC...
Keeper address: EQD...

Step 3: Deploying PricingOracle...
✓ PricingOracle deployed at: EQAbc123...

Contract Address: EQAbc123...
Add to .env:
PRICING_ORACLE_ADDRESS=EQAbc123...
```

#### Step 2: Run Database Migrations

```bash
for migration in backend/migrations/*.sql; do
    psql "$TESTNET_DATABASE_URL" -f "$migration"
done
```

#### Step 3: Deploy Backend Services

```bash
./scripts/deploy-backend.sh --env=testnet
```

#### Step 4: Verify Deployment

```bash
# Check contract deployment
node scripts/verify-deployment.js --env=testnet

# Check service health
curl https://testnet-api.tonsurance.com/health

# Check oracle updates
curl https://testnet-api.tonsurance.com/oracle/last-update
```

---

## Mainnet Deployment

**⚠️ CRITICAL: Mainnet deployments require:**
- 2/3 multi-sig approval
- 95%+ test coverage
- Security audit clearance
- Manual verification at each step

### Pre-deployment Checklist

- [ ] All tests passing (95%+ coverage)
- [ ] Security audit completed
- [ ] Smart contracts audited by external firm
- [ ] Testnet deployed and stable for 7+ days
- [ ] Multi-sig wallet ready (3-of-5 signers available)
- [ ] Backup procedures tested
- [ ] Rollback plan documented
- [ ] On-call team notified
- [ ] Communication drafted for users

### Deployment Process

#### Step 1: Trigger Mainnet Deployment

```bash
# Via GitHub Actions (recommended)
# Go to: Actions → Deploy to Mainnet → Run workflow
# Select: deployment_type = full_deployment
# Type: "MAINNET" to confirm
```

**OR manual:**

```bash
# Ensure on main branch
git checkout main
git pull origin main

# Verify no uncommitted changes
git status
```

#### Step 2: Deploy Smart Contracts

**⏱ Estimated Time: 45 minutes**

```bash
# 1. Deploy PricingOracle (5 min)
npx blueprint run deployPricingOracle --mainnet

# Admin must be multi-sig address!
# Enter multi-sig: EQC_multisig_address_here

# Output will show contract address
# SAVE THIS ADDRESS - needed for keepers
```

**Verification:**
```bash
node scripts/verify-deployment.js \
  --contract=PricingOracle \
  --address=EQAbc123... \
  --network=mainnet
```

```bash
# 2. Deploy MultiTrancheVault (15 min)
npx blueprint run deployMultiTrancheVault --mainnet

# This deploys:
# - 1 MultiTrancheVault contract
# - 6 SURE token contracts (BTC, SNR, MEZZ, JNR, JNR+, EQT)

# Verification includes:
# ✓ Admin = multi-sig
# ✓ All 6 tranches registered
# ✓ Bonding curves configured
```

```bash
# 3. Deploy PolicySharding (30 min)
npx blueprint run deployPolicySharding --mainnet

# Deploys 257 contracts:
# - 1 PolicyRouter
# - 256 PolicyShard contracts

# Batched deployment (10 per batch):
# Batch 1/26: Deploying shards 0-9...
# Batch 2/26: Deploying shards 10-19...
# ...
# Batch 26/26: Deploying shards 250-255...
```

**Contract Addresses:**
Save all deployed addresses to `deployments/mainnet-YYYYMMDD.json`

#### Step 3: Database Backup and Migration

**⏱ Estimated Time: 10 minutes**

```bash
# 1. Create full backup
BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump "$MAINNET_DATABASE_URL" | gzip > "$BACKUP_FILE"

# 2. Upload to S3
aws s3 cp "$BACKUP_FILE" s3://tonsurance-backups/mainnet/

# 3. Verify backup integrity
gunzip -c "$BACKUP_FILE" | psql "$TEST_DATABASE_URL"

# 4. Run migrations with transaction
psql "$MAINNET_DATABASE_URL" <<EOF
BEGIN;

-- Run migration 004
\i backend/migrations/004_add_dynamic_pricing.sql

-- Verify tables exist
SELECT COUNT(*) FROM pricing_oracle_updates;
SELECT COUNT(*) FROM product_exposure;

COMMIT;
EOF
```

#### Step 4: Deploy Backend Services (Gradual Rollout)

**⏱ Estimated Time: 25 minutes**

```bash
./scripts/deploy-backend.sh --env=mainnet
```

**Gradual Rollout Strategy:**

1. **20% Traffic** (5 min)
   - Deploy 2/10 pods
   - Monitor error rates
   - If error rate >1%, rollback

2. **50% Traffic** (5 min)
   - Deploy 5/10 pods
   - Monitor latency
   - If p99 latency >500ms, rollback

3. **100% Traffic** (5 min)
   - Deploy all 10 pods
   - Full production traffic

4. **Verification** (10 min)
   - Run smoke tests
   - Check all metrics
   - Verify user operations

**Monitoring During Rollout:**
```bash
# Watch pod status
watch kubectl get pods -n tonsurance-mainnet

# Check error rates
kubectl exec -it prometheus-0 -- \
  wget -qO- 'http://localhost:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])'

# Check logs
kubectl logs -f deployment/ocaml-backend -n tonsurance-mainnet
```

#### Step 5: Post-Deployment Verification

**⏱ Estimated Time: 30 minutes**

```bash
# 1. Contract verification
node scripts/verify-all-contracts.js --network=mainnet

# 2. API health check
curl -f https://api.tonsurance.com/health

# 3. Premium quote test
curl 'https://api.tonsurance.com/premium/swing-quote?coverage_type=1&chain_id=0&stablecoin_id=0&coverage_amount=10000000000&duration_days=30'

# Expected response:
# {
#   "base_premium": 658000000,
#   "hedge_cost": 16900000000,
#   "total_premium": 17558000000,
#   "valid_until": 1705334730
# }

# 4. Oracle freshness check
LAST_UPDATE=$(curl -s https://api.tonsurance.com/oracle/last-update | jq -r '.timestamp')
NOW=$(date +%s)
AGE=$((NOW - LAST_UPDATE))
echo "Oracle age: ${AGE}s (should be <300s)"

# 5. Create test policy
node scripts/create-test-policy.js --network=mainnet --amount=1000

# 6. Monitor for 30 minutes
for i in {1..30}; do
    echo "Minute $i/30: Checking metrics..."
    # Check error rate, latency, oracle updates
    sleep 60
done
```

#### Step 6: Enable Production Traffic

```bash
# Update DNS/load balancer to point to new deployment
# (Specific steps depend on your infrastructure)

# Verify traffic is flowing
watch curl -s https://api.tonsurance.com/metrics | grep http_requests_total
```

---

## Database Management

### Migrations

All database migrations are versioned and idempotent:

```
backend/migrations/
├── 001_initial_schema.sql
├── 002_add_multi_dimensional_coverage.sql
├── 003_add_blockchain_event_log.sql
└── 004_add_dynamic_pricing.sql  (NEW)
```

### Running Migrations

```bash
# Testnet
for migration in backend/migrations/*.sql; do
    psql "$TESTNET_DATABASE_URL" -f "$migration"
done

# Mainnet (with transaction)
psql "$MAINNET_DATABASE_URL" <<EOF
BEGIN;
\i backend/migrations/004_add_dynamic_pricing.sql
COMMIT;
EOF
```

### Rollback Migrations

If a migration fails:

```bash
# 1. Restore from backup
gunzip -c backup-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"

# 2. Verify restoration
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM policies;"

# 3. Identify problematic migration
# Fix SQL and re-run
```

### Backup Schedule

- **Mainnet**: Every 6 hours + before each deployment
- **Testnet**: Daily + before each deployment

```bash
# Automated backup (cron)
0 */6 * * * /scripts/backup-database.sh --env=mainnet
```

---

## Monitoring and Alerting

### Metrics Overview

Tonsurance exports metrics to Prometheus:

**Smart Contract Metrics:**
- `vault_total_capital` - Total capital in vault
- `vault_total_coverage_sold` - Total coverage sold
- `vault_utilization_ratio` - Coverage / Capital
- `pricing_oracle_last_update_timestamp` - Oracle freshness
- `policy_creation_total` - Total policies created

**Service Metrics:**
- `http_requests_total` - API request count
- `http_request_duration_seconds` - API latency
- `keeper_update_success_total` - Keeper update count
- `keeper_update_latency_seconds` - Keeper latency
- `hedge_execution_latency_seconds` - Hedge execution time

**System Metrics:**
- `pg_stat_activity_count` - Database connections
- `redis_memory_used_bytes` - Redis memory usage
- `container_cpu_usage_seconds_total` - CPU usage
- `container_memory_working_set_bytes` - Memory usage

### Alert Rules

See `infra/monitoring/alerts.yml` for complete alert definitions.

**Critical Alerts:**
- Oracle update stale (>5 min)
- Vault insolvency risk (>80% utilization)
- Claims processor down
- Database connection pool exhausted
- Circuit breaker triggered

**High Alerts:**
- CI test failures
- Bridge health degraded
- High gas costs
- Hedge execution delays
- Abnormal claim rate

### Grafana Dashboards

Access dashboards at:
- **Testnet**: https://testnet-grafana.tonsurance.com
- **Mainnet**: https://grafana.tonsurance.com

**Key Dashboards:**
1. **System Overview** - High-level health
2. **Smart Contracts** - On-chain metrics
3. **API Performance** - Request rates, latency
4. **Oracle Health** - Update frequency, staleness
5. **Vault Analytics** - TVL, utilization, APY
6. **Policy Analytics** - Creation rate, claims

---

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- Error rate >1% for 5+ minutes
- Critical service down >5 minutes
- Data corruption detected
- Security vulnerability discovered
- User funds at risk

### Rollback Script

```bash
# Automatic rollback
./scripts/rollback.sh --env=mainnet --type=all

# Selective rollback
./scripts/rollback.sh --env=mainnet --type=services
./scripts/rollback.sh --env=mainnet --type=database --backup-id=20250115-1430
```

### Manual Rollback Steps

#### 1. Rollback Smart Contracts

```bash
# Revert PolicyFactory to use previous router
node scripts/update-factory-router.js \
  --network=mainnet \
  --router=EQC_previous_router_address

# Revert keepers to previous oracle
kubectl set env deployment/pricing-keeper \
  PRICING_ORACLE_ADDRESS=EQC_previous_oracle_address \
  -n tonsurance-mainnet
```

#### 2. Rollback Backend Services

```bash
# Get previous image tag
PREV_TAG=$(jq -r '.docker.imageTag' deployments/mainnet-previous.json)

# Rollback all services
kubectl set image deployment/ocaml-backend \
  ocaml-backend=tonsurance/ocaml-backend:mainnet-$PREV_TAG \
  -n tonsurance-mainnet

kubectl set image deployment/pricing-keeper \
  pricing-keeper=tonsurance/keepers:mainnet-$PREV_TAG \
  -n tonsurance-mainnet

# Wait for rollouts
kubectl rollout status deployment/ocaml-backend -n tonsurance-mainnet
```

#### 3. Rollback Database

```bash
# CRITICAL: This will lose data since backup!
# Only if database migration caused corruption

# 1. Find latest backup
ls -lt backups/mainnet/

# 2. Restore
gunzip -c backups/mainnet/backup-YYYYMMDD-HHMMSS.sql.gz | \
  psql "$MAINNET_DATABASE_URL"

# 3. Verify
psql "$MAINNET_DATABASE_URL" -c "SELECT COUNT(*) FROM policies;"
```

### Post-Rollback

1. **Verify System Health**
   - Check all metrics return to normal
   - Verify user operations work
   - Monitor for 1 hour

2. **Root Cause Analysis**
   - Review logs
   - Identify what went wrong
   - Document findings

3. **Fix and Redeploy**
   - Fix underlying issue
   - Test thoroughly on testnet
   - Schedule new mainnet deployment

---

## Troubleshooting

### Common Issues

#### Issue: Oracle Updates Stale

**Symptoms:**
- `pricing_oracle_last_update_timestamp` >5 minutes old
- Premium quotes failing

**Diagnosis:**
```bash
# Check keeper logs
kubectl logs -l app=pricing-keeper -n tonsurance-mainnet --tail=100

# Check external API health
curl https://clob.polymarket.com/ping
curl https://api.binance.com/api/v3/ping
```

**Resolution:**
```bash
# Restart keeper
kubectl rollout restart deployment/pricing-keeper -n tonsurance-mainnet

# If API keys expired, update secrets
kubectl create secret generic external-api-keys \
  --from-literal=POLYMARKET_API_KEY=pk_new_key \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### Issue: High Gas Costs

**Symptoms:**
- `avg_gas_cost_ton` >0.5 TON
- Keeper operations expensive

**Diagnosis:**
```bash
# Check TON network congestion
curl https://toncenter.com/api/v2/getGasPrice

# Review recent transactions
node scripts/analyze-gas-usage.js --days=7
```

**Resolution:**
- Implement transaction batching
- Increase keeper update intervals
- Wait for network congestion to clear

#### Issue: Vault Insolvency Risk

**Symptoms:**
- `vault_utilization_ratio` >0.80
- Insufficient capital for new policies

**Diagnosis:**
```bash
# Check exact utilization
curl https://api.tonsurance.com/vault/utilization

# Check LP deposits over time
psql "$MAINNET_DATABASE_URL" -c "
  SELECT DATE(created_at), SUM(amount)
  FROM deposits
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at) DESC
  LIMIT 30;
"
```

**Resolution:**
1. **Immediate**: Pause new policy sales
2. **Short-term**: Increase LP incentives
3. **Long-term**: Activate protocol reserve funds

---

## Security Considerations

### Multi-sig Requirements (Mainnet)

All mainnet admin operations require 3-of-5 multi-sig approval:
- Contract upgrades
- Parameter changes
- Fund withdrawals
- Emergency pauses

### Secret Management

**⚠️  CRITICAL SECURITY REQUIREMENTS ⚠️**

Tonsurance handles sensitive cryptographic material that controls user funds. Improper secret management can lead to catastrophic loss.

#### What are Secrets?

Secrets include:
- Wallet mnemonics (24-word seed phrases)
- Private keys
- Database passwords
- External API keys (Polymarket, Binance, Allianz)
- Encryption keys
- JWT secrets
- Webhook URLs

#### Storage Requirements

**NEVER:**
- ❌ Commit secrets to git (even in private repos)
- ❌ Store mnemonics in plaintext files
- ❌ Share API keys in Slack, email, or chat
- ❌ Use the same secrets for testnet and mainnet
- ❌ Store secrets in environment variables in CI/CD
- ❌ Include secrets in Docker images
- ❌ Log secrets (check your application logs!)

**ALWAYS:**
- ✅ Use AWS Secrets Manager or HashiCorp Vault
- ✅ Rotate secrets every 30-90 days (based on criticality)
- ✅ Use separate secrets for test/staging/prod
- ✅ Enable 2FA on all accounts with secret access
- ✅ Use hardware wallets (Ledger/Trezor) for mainnet
- ✅ Implement least privilege access control
- ✅ Enable comprehensive audit logging
- ✅ Use pre-commit hooks to detect secrets

#### Quick Start: AWS Secrets Manager

```bash
# 1. Install AWS CLI
brew install awscli  # macOS
# or
apt-get install awscli  # Linux

# 2. Configure AWS credentials
aws configure

# 3. Create secret
aws secretsmanager create-secret \
  --name tonsurance/mainnet/deployer-mnemonic \
  --description "Mainnet deployer wallet mnemonic" \
  --secret-string "word1 word2 word3 ... word24" \
  --region us-east-1

# 4. Retrieve secret in application
aws secretsmanager get-secret-value \
  --secret-id tonsurance/mainnet/deployer-mnemonic \
  --query SecretString \
  --output text

# 5. Update .env file to reference secret (not contain it)
echo "DEPLOYMENT_MNEMONIC=\$(aws secretsmanager get-secret-value --secret-id tonsurance/mainnet/deployer-mnemonic --query SecretString --output text)" > .env.mainnet
```

#### Quick Start: Pre-Commit Hook

Prevent accidentally committing secrets:

```bash
# Install pre-commit hook
cp scripts/dev/detect-secrets.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Test it
git add .env.deployment  # This should be blocked!
git commit -m "test"     # Hook will detect and block commit

# Output:
# 🔍 Tonsurance Secret Detection Scanner
# ❌ ERROR: File matches ignored pattern: .env.deployment
# → This file should be in .gitignore!
# ❌ COMMIT BLOCKED: Secrets detected!
```

#### Secret Rotation Schedule

| Secret Type | Rotation Frequency | Owner |
|-------------|-------------------|-------|
| Deployer Wallet | 30 days | CTO |
| Keeper Wallets | 30 days | DevOps |
| Database Passwords | 90 days | DBA |
| External API Keys | 90 days | DevOps |
| Encryption Keys | 90 days | Security Team |

#### Emergency: Exposed Secret

If a secret is accidentally committed:

```bash
# 1. IMMEDIATELY rotate the exposed secret
./scripts/rotate-wallet.sh --emergency --env mainnet

# 2. Remove from git history (requires force push)
git filter-branch --tree-filter \
  'rm -f .env.deployment' HEAD

# 3. Force push (coordinate with team first!)
git push origin main --force

# 4. Notify security team
./scripts/send-security-notification.js \
  --type secret-exposure \
  --severity critical

# 5. Review audit logs for unauthorized access
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=compromised-secret

# 6. Document incident in post-mortem
```

#### Comprehensive Documentation

For complete secret management guidance, see:
- **[backend/docs/SECRETS_MANAGEMENT.md](backend/docs/SECRETS_MANAGEMENT.md)** - Complete guide
- **[backend/config/secrets.template.json](backend/config/secrets.template.json)** - Configuration template
- **[scripts/dev/detect-secrets.sh](scripts/dev/detect-secrets.sh)** - Pre-commit hook script

**Quick Links:**
- [AWS Secrets Manager Setup](backend/docs/SECRETS_MANAGEMENT.md#aws-secrets-manager-setup)
- [Secret Rotation Procedures](backend/docs/SECRETS_MANAGEMENT.md#secret-rotation-procedures)
- [Emergency Procedures](backend/docs/SECRETS_MANAGEMENT.md#emergency-procedures)
- [Wallet Management](backend/docs/SECRETS_MANAGEMENT.md#wallet-management)

### Access Control

| Role | Testnet | Mainnet |
|------|---------|---------|
| Deployer | Single wallet | Multi-sig (3-of-5) |
| Keeper | Single wallet | 3 redundant wallets |
| Database | Developer access | Production DBA only |
| Kubernetes | Team access | DevOps + On-call only |

### Audit Trail

All deployments are logged:
```json
{
  "timestamp": "2025-10-15T14:30:00Z",
  "environment": "mainnet",
  "deployer": "alice@tonsurance.com",
  "contracts": ["0xABC...", "0xDEF..."],
  "approved_by": ["alice", "bob", "charlie"],
  "git_commit": "a3017b0"
}
```

---

## Appendix

### Deployment Checklist (Mainnet)

**Pre-deployment (T-7 days):**
- [ ] All tests passing (95%+ coverage)
- [ ] Security audit completed
- [ ] Testnet stable for 7+ days
- [ ] User communication drafted
- [ ] On-call schedule confirmed

**Pre-deployment (T-1 day):**
- [ ] Multi-sig signers available
- [ ] Backup plan tested
- [ ] Rollback tested on testnet
- [ ] All secrets rotated

**Deployment Day:**
- [ ] Team on call and ready
- [ ] Monitoring dashboards open
- [ ] Communication sent to users
- [ ] Database backup created
- [ ] Dry-run completed

**Post-deployment:**
- [ ] All health checks passed
- [ ] User testing completed
- [ ] 24-hour monitoring completed
- [ ] Post-mortem scheduled

### Useful Commands

```bash
# View recent deployments
ls -lt deployments/mainnet-*

# Check contract version
node scripts/get-contract-version.js --address=EQAbc123...

# Estimate gas costs
node scripts/estimate-gas.js --operation=deploy-shard

# Backup database
pg_dump "$MAINNET_DATABASE_URL" | gzip > backup.sql.gz

# Restore database
gunzip -c backup.sql.gz | psql "$MAINNET_DATABASE_URL"

# View logs
kubectl logs -f deployment/ocaml-backend -n tonsurance-mainnet

# Port-forward to service
kubectl port-forward svc/ocaml-backend 8080:8080 -n tonsurance-mainnet

# Execute SQL
psql "$MAINNET_DATABASE_URL" -c "SELECT * FROM policies LIMIT 10;"
```

### Support Contacts

- **DevOps Issues**: #ops-urgent (Slack)
- **Smart Contract Issues**: #contract-team (Slack)
- **Database Issues**: dba@tonsurance.com
- **Security Issues**: security@tonsurance.com
- **On-call**: PagerDuty (auto-escalates)

---

**Document Version:** 1.0
**Maintained by:** DevOps Team
**Last Review:** 2025-10-15

For questions or clarifications, contact: devops@tonsurance.com
