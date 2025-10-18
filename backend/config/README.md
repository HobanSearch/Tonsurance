# Tonsurance Configuration and Secrets

This directory contains configuration templates and examples for Tonsurance deployment.

## Files

### secrets.template.json

**Purpose:** Template for storing secrets in AWS Secrets Manager or HashiCorp Vault

**Usage:**
```bash
# DO NOT fill in actual secrets in this file!
# Use it as a reference for creating secrets in your secret manager

# AWS Secrets Manager
aws secretsmanager create-secret \
  --name tonsurance/mainnet/secrets \
  --secret-string file://your-actual-secrets.json \
  --region us-east-1

# HashiCorp Vault
vault kv put secret/tonsurance/mainnet @your-actual-secrets.json
```

**Important:**
- Never commit files with actual secrets
- Use `.gitignore` to prevent accidental commits
- Rotate secrets regularly (30-90 days)

## Quick Start

### 1. Set Up Secret Storage

Choose one:

**Option A: AWS Secrets Manager (Recommended)**
```bash
# Install AWS CLI
brew install awscli

# Configure credentials
aws configure

# Create secrets
aws secretsmanager create-secret \
  --name tonsurance/testnet/secrets \
  --secret-string '{"deployer":{"mnemonic":"..."}}' \
  --region us-east-1
```

**Option B: HashiCorp Vault**
```bash
# Install Vault
brew install vault

# Start server (dev mode)
vault server -dev

# Store secrets
export VAULT_ADDR='http://127.0.0.1:8200'
vault kv put secret/tonsurance/testnet deployer_mnemonic="..."
```

### 2. Install Pre-Commit Hooks

```bash
# Install hooks to prevent committing secrets
./scripts/dev/install-git-hooks.sh
```

### 3. Retrieve Secrets in Application

**Node.js/TypeScript:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });
const response = await client.send(
  new GetSecretValueCommand({ SecretId: "tonsurance/mainnet/secrets" })
);
const secrets = JSON.parse(response.SecretString!);
```

**OCaml:**
```ocaml
let get_secret name =
  let cmd = Printf.sprintf
    "aws secretsmanager get-secret-value --secret-id %s --query SecretString --output text"
    name
  in
  let ic = Unix.open_process_in cmd in
  let json = input_line ic in
  close_in ic;
  Yojson.Safe.from_string json
```

**Shell Script:**
```bash
MNEMONIC=$(aws secretsmanager get-secret-value \
  --secret-id tonsurance/mainnet/deployer-mnemonic \
  --query SecretString \
  --output text)
```

## Documentation

- **[SECRETS_MANAGEMENT.md](../docs/SECRETS_MANAGEMENT.md)** - Comprehensive guide
- **[DEPLOYMENT.md](../../DEPLOYMENT.md)** - Deployment procedures

## Security Best Practices

✅ **DO:**
- Use AWS Secrets Manager or HashiCorp Vault
- Rotate secrets every 30-90 days
- Use separate secrets for testnet/mainnet
- Enable 2FA on all accounts
- Use hardware wallets for mainnet
- Enable audit logging
- Use pre-commit hooks

❌ **DON'T:**
- Commit secrets to git
- Store mnemonics in plaintext
- Share secrets via Slack/email
- Use same secrets for test/prod
- Log secrets in application
- Store secrets in Docker images

## Emergency Contact

If secrets are exposed:
1. Rotate immediately: `./scripts/rotate-wallet.sh --emergency`
2. Contact: security@tonsurance.com
3. Follow: [Emergency Procedures](../docs/SECRETS_MANAGEMENT.md#emergency-procedures)

## Support

- Security Team: security@tonsurance.com
- DevOps Team: devops@tonsurance.com
- Documentation: backend/docs/SECRETS_MANAGEMENT.md
