# Tonsurance Deployment Summary

## Overview

Complete deployment infrastructure for Tonsurance smart contracts on TON testnet/mainnet.

## Deployment Wallet

**Address**: `EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4`

**Mnemonic**: (Saved in `.env.deployment` - **DO NOT COMMIT**)

```
enjoy language august wing lady blossom glove craft fruit hockey response excess
few bike card candy tissue town phone wink clinic cube industry grab
```

**Funding**:
- Testnet TON Faucets:
  - Telegram: https://t.me/testgiver_ton_bot
  - Web: https://faucet.toncoin.org/
- Required: ~100 TON for full deployment (with sharding)
- Minimum: ~10 TON for basic deployment (without sharding)

## Deployment Scripts Created

All scripts located in `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/`

### 1. Pre-Deployment Scripts

#### `create-testnet-wallet.ts`
- Generates new deployment wallet with mnemonic
- Creates `.env.deployment.example` template
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/create-testnet-wallet.ts`

**Usage**:
```bash
npm run deploy:create-wallet
```

#### `verify-contracts.sh`
- Compiles all contracts
- Verifies compilation success
- Lists compiled contract sizes
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/verify-contracts.sh`

**Usage**:
```bash
npm run deploy:verify-contracts
```

### 2. Main Deployment Script

#### `deploy-all-testnet.sh`
- Interactive guided deployment
- Deploys all contracts in correct order
- Generates `frontend/.env.deployment` with addresses
- Creates timestamped deployment log
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/deploy-all-testnet.sh`

**Usage**:
```bash
npm run deploy:all-testnet
```

**Deployment Sequence**:
1. MultiTrancheVault + 6 SURE Tokens (~4 TON, 10-15 min)
2. DynamicPricingOracle (~0.5 TON, 5 min)
3. PolicyFactory & ClaimsProcessor (~1 TON, 5 min)
4. PolicyRouter + 256 Shards (OPTIONAL: ~77 TON, 20-25 min)

**Total Cost** (without sharding): ~5.5 TON
**Total Cost** (with sharding): ~82.5 TON

### 3. Individual Deployment Scripts

#### `deployMultiTrancheVault.ts`
- Deploys MultiTrancheVault contract
- Deploys 6 SURE token contracts (BTC, SNR, MEZZ, JNR, JNR+, EQT)
- Configures bonding curves per tranche
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/deployMultiTrancheVault.ts`

**Usage**:
```bash
npm run deploy:vault
```

#### `deployDynamicPricingOracle.ts`
- Deploys DynamicPricingOracle contract
- Configures admin and authorized keepers
- Sets up multi-sig for mainnet
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/deployDynamicPricingOracle.ts`

**Usage**:
```bash
npx blueprint run deployDynamicPricingOracle --testnet
```

#### `deployPolicyFactory.ts`
- Deploys PolicyFactory contract
- Deploys ClaimsProcessor contract
- Links contracts to vaults and oracles
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/deployPolicyFactory.ts`

**Usage**:
```bash
npm run deploy:factory
```

#### `deployPolicySharding.ts`
- Deploys PolicyRouter contract
- Deploys 256 PolicyShard contracts
- Configures routing table
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/deployPolicySharding.ts`

**Usage**:
```bash
npm run deploy:sharding
```

**WARNING**: Expensive and time-consuming. Only needed for production scale (100k+ policies).

### 4. Post-Deployment Scripts

#### `verify-deployment.ts`
- Verifies all deployed contracts are active
- Checks contract data is readable
- Tests basic contract functionality
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/verify-deployment.ts`

**Usage**:
```bash
npm run deploy:verify
```

#### `test-integration.ts`
- Tests vault state reading
- Tests tranche info retrieval
- Provides manual testing instructions
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/test-integration.ts`

**Usage**:
```bash
npm run deploy:test-integration
```

#### `update-frontend-env.sh`
- Updates `frontend/.env` with deployed addresses
- Backs up existing `.env` file
- Location: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/update-frontend-env.sh`

**Usage**:
```bash
npm run deploy:update-frontend
```

## NPM Scripts Added

All scripts added to `/Users/ben/Documents/Work/HS/Application/Tonsurance/package.json`:

```json
{
  "scripts": {
    "deploy:create-wallet": "npx ts-node scripts/dev/create-testnet-wallet.ts",
    "deploy:verify-contracts": "./scripts/dev/verify-contracts.sh",
    "deploy:all-testnet": "./scripts/dev/deploy-all-testnet.sh",
    "deploy:verify": "npx ts-node scripts/dev/verify-deployment.ts",
    "deploy:update-frontend": "./scripts/dev/update-frontend-env.sh",
    "deploy:test-integration": "npx ts-node scripts/dev/test-integration.ts",
    "deploy:vault": "npx blueprint run deployMultiTrancheVault --testnet",
    "deploy:oracle": "npx blueprint run deployPricingOracle --testnet",
    "deploy:factory": "npx blueprint run deployPolicyFactory --testnet",
    "deploy:sharding": "npx blueprint run deployPolicySharding --testnet"
  }
}
```

## Security Updates

### .gitignore Updated

Added to `/Users/ben/Documents/Work/HS/Application/Tonsurance/.gitignore`:

```gitignore
.env.deployment
.env.backup*
frontend/.env.deployment
frontend/.env.backup*
```

**CRITICAL**: Never commit `.env.deployment` to git - it contains your private mnemonic!

## Deployment Workflow

### Quick Start (Recommended)

1. **Create deployment wallet**:
   ```bash
   npm run deploy:create-wallet
   ```

2. **Fund wallet** (get ~10 TON from faucet):
   - https://t.me/testgiver_ton_bot

3. **Create `.env.deployment`**:
   ```bash
   cp .env.deployment.example .env.deployment
   # Edit and paste your mnemonic
   ```

4. **Verify contracts compile**:
   ```bash
   npm run deploy:verify-contracts
   ```

5. **Run guided deployment**:
   ```bash
   npm run deploy:all-testnet
   ```
   - Follow interactive prompts
   - Optionally skip PolicyRouter/Shards to save time and cost

6. **Verify deployment**:
   ```bash
   npm run deploy:verify
   ```

7. **Update frontend**:
   ```bash
   npm run deploy:update-frontend
   cd frontend && npm run dev
   ```

8. **Test integration**:
   ```bash
   npm run deploy:test-integration
   ```

### Manual Deployment (Advanced)

For fine-grained control, deploy contracts individually:

```bash
# 1. Deploy vault
npm run deploy:vault

# 2. Deploy oracle
npx blueprint run deployDynamicPricingOracle --testnet

# 3. Deploy factory
npm run deploy:factory

# 4. (Optional) Deploy sharding
npm run deploy:sharding
```

## Contract Addresses

After deployment, addresses are saved in:

- **Generated**: `frontend/.env.deployment`
- **Active Config**: `frontend/.env`
- **Deployment Log**: `logs/deployment-YYYYMMDD-HHMMSS.log`

Example `frontend/.env.deployment`:
```bash
# Deployed Contract Addresses - 2025-10-15
VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQAbc123...
VITE_DYNAMIC_PRICING_ORACLE_ADDRESS=EQDef456...
VITE_POLICY_FACTORY_ADDRESS=EQGhi789...
VITE_CLAIMS_PROCESSOR_ADDRESS=EQJkl012...
VITE_POLICY_ROUTER_ADDRESS=EQMno345...
```

## Testnet Explorer

Verify deployments at:
- https://testnet.tonscan.org/address/[CONTRACT_ADDRESS]

## Troubleshooting

### "Insufficient balance"
- Request more testnet TON from faucets
- Check wallet balance: https://testnet.tonscan.org/address/EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4

### "Contract deployment timeout"
- Testnet can be slow, wait 1-2 minutes
- Check contract on explorer
- Retry deployment if needed

### "Compilation failed"
- Run: `npm run deploy:verify-contracts`
- Check for missing dependencies: `npm install`
- Update Blueprint: `npm update @ton/blueprint`

### "Cannot read contract data"
- Normal for uninitialized contracts
- Some getters require initial deposits or price updates
- Check verification script output for details

## Documentation

- **Deployment Guide**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/scripts/dev/DEPLOYMENT_GUIDE.md`
- **Architecture**: See `docs/MULTI_TRANCHE_VAULT_SPEC.md`
- **Testing Strategy**: See `docs/TESTING_STRATEGY.md`

## Status

✅ **Deployment infrastructure complete**:
- [x] Wallet creation script
- [x] Contract verification script
- [x] Guided deployment script
- [x] Individual deployment scripts
- [x] Post-deployment verification
- [x] Integration testing
- [x] Frontend env update
- [x] NPM scripts added
- [x] Security (.gitignore updated)
- [x] Documentation

⚠️ **Next Steps**:
1. Fund deployment wallet with testnet TON
2. Run guided deployment
3. Verify all contracts on testnet explorer
4. Test end-to-end integration
5. Document deployed addresses

## Mainnet Deployment

**DO NOT deploy to mainnet yet!**

Requirements before mainnet:
- [ ] Professional smart contract audit
- [ ] Multi-sig admin wallet (3-of-5)
- [ ] 2+ weeks testnet operation
- [ ] Stress testing (1000+ policies)
- [ ] Emergency pause procedures tested
- [ ] Keeper infrastructure redundant (3+ keepers)
- [ ] All private keys in hardware wallets
- [ ] Gradual rollout plan (start $10k limits)

## Support

For issues or questions:
- Check deployment logs: `logs/deployment-*.log`
- Review contract on testnet explorer
- Verify wallet has sufficient balance
- Ensure all dependencies are installed

---

**Last Updated**: 2025-10-15
**Status**: Ready for Deployment
**Total Scripts Created**: 10
**Deployment Wallet**: EQCMat-92Thv6WoOeXMfIagsBi90hztYccSxq-s4K_ZYw5x4
