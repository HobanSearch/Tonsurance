# Tonsurance Security Quick Reference

**Last Updated:** 2025-10-16

---

## 🚨 NEVER Commit These

- ❌ Wallet mnemonics (24-word seed phrases)
- ❌ Private keys
- ❌ Database passwords
- ❌ API keys (Polymarket, Binance, Allianz)
- ❌ AWS access keys
- ❌ Encryption keys
- ❌ JWT secrets
- ❌ Webhook URLs
- ❌ .env files with real values

---

## ✅ How to Store Secrets Properly

### 1. Install Pre-Commit Hook (ONE TIME)

```bash
./scripts/dev/install-git-hooks.sh
```

### 2. Use AWS Secrets Manager (PRODUCTION)

```bash
# Store secret
aws secretsmanager create-secret \
  --name tonsurance/mainnet/deployer-mnemonic \
  --secret-string "word1 word2 ... word24" \
  --region us-east-1

# Retrieve secret
aws secretsmanager get-secret-value \
  --secret-id tonsurance/mainnet/deployer-mnemonic \
  --query SecretString \
  --output text
```

### 3. Use .env.local for Development (LOCAL ONLY)

```bash
# Create local env file (gitignored)
cp .env.example .env.local

# Edit with your testnet secrets
vim .env.local

# Never commit this file!
```

---

## 🔄 Secret Rotation Schedule

| Secret | How Often | Command |
|--------|-----------|---------|
| Deployer Wallet | 30 days | `./scripts/rotate-wallet.sh --env mainnet` |
| Keeper Wallet | 30 days | `./scripts/rotate-keeper-wallet.sh` |
| Database Password | 90 days | `./scripts/rotate-database-password.sh` |
| API Keys | 90 days | `./scripts/rotate-api-key.sh --provider binance` |

---

## 🆘 Emergency: Secret Exposed

```bash
# 1. Rotate immediately
./scripts/rotate-wallet.sh --emergency --env mainnet

# 2. Remove from git history
git filter-branch --tree-filter 'rm -f .env.deployment' HEAD

# 3. Notify security team
security@tonsurance.com

# 4. Review audit logs
aws cloudtrail lookup-events --lookup-attributes AttributeKey=ResourceName,AttributeValue=secret-name
```

---

## 📚 Documentation

| Document | Purpose | Location |
|----------|---------|----------|
| Comprehensive Guide | Full secret management guide | [backend/docs/SECRETS_MANAGEMENT.md](backend/docs/SECRETS_MANAGEMENT.md) |
| AWS Template | Secret configuration template | [backend/config/secrets.template.json](backend/config/secrets.template.json) |
| Deployment Guide | Secrets section in deployment | [DEPLOYMENT.md](DEPLOYMENT.md#secret-management) |
| Security Fix Summary | Recent vulnerability fix | [SECURITY_FIX_SUMMARY.md](SECURITY_FIX_SUMMARY.md) |

---

## 🛠️ Tools

| Tool | Purpose | Location |
|------|---------|----------|
| detect-secrets.sh | Pre-commit hook to block secrets | [scripts/dev/detect-secrets.sh](scripts/dev/detect-secrets.sh) |
| install-git-hooks.sh | Install pre-commit hook | [scripts/dev/install-git-hooks.sh](scripts/dev/install-git-hooks.sh) |

---

## 🎯 Quick Commands

```bash
# Test if file contains secrets
./scripts/dev/detect-secrets.sh

# Check wallet balance
node scripts/check-wallet-balance.js --address EQ...

# Generate new wallet
ton-wallet create --network mainnet

# View secret access logs
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=GetSecretValue

# Check secret age
aws secretsmanager describe-secret --secret-id tonsurance/mainnet/secrets | jq '.LastChangedDate'
```

---

## 📞 Emergency Contacts

- **Security Team:** security@tonsurance.com
- **DevOps Team:** devops@tonsurance.com
- **On-Call:** PagerDuty (auto-escalates)

---

## ✅ Pre-Commit Checklist

Before committing:

- [ ] No .env files staged (use `git status`)
- [ ] No hardcoded secrets in code
- [ ] Pre-commit hook installed and working
- [ ] All example files use placeholders
- [ ] Secrets stored in AWS Secrets Manager
- [ ] Documentation updated if needed

---

## 🔍 Detect Secrets in Staged Files

```bash
# Manual check
git diff --cached | grep -Ei "secret|password|mnemonic|api_key"

# Automatic check (with hook)
git commit -m "message"
# Hook runs automatically
```

---

**Keep this card handy! Print it and pin it to your desk.**

**Remember: A single exposed secret can compromise the entire system.**
