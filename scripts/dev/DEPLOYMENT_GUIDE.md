# Tonsurance Testnet Deployment Guide

Complete guide for deploying all Tonsurance smart contracts to TON testnet.

## Prerequisites

- Node.js 18+ and npm
- Blueprint CLI installed (`npm install -g @ton/blueprint`)
- At least 100 TON in testnet tokens

## Quick Start

### 1. Create Deployment Wallet

```bash
npx ts-node scripts/dev/create-testnet-wallet.ts
```

This will:
- Generate a new mnemonic (24 words)
- Display your wallet address
- Create `.env.deployment.example` template

**IMPORTANT**: Save your mnemonic securely! You'll need it for all deployments.

### 2. Fund Wallet

Get testnet TON from:
- Telegram bot: https://t.me/testgiver_ton_bot
- Web faucet: https://faucet.toncoin.org/

Send at least 100 TON to your deployment wallet address.

### 3. Create .env.deployment

```bash
cp .env.deployment.example .env.deployment
# Edit .env.deployment and paste your mnemonic
```

**NEVER commit .env.deployment to git!**

### 4. Verify Contracts Compile

```bash
./scripts/dev/verify-contracts.sh
```

This ensures all contracts compile without errors.

### 5. Run Guided Deployment

```bash
./scripts/dev/deploy-all-testnet.sh
```

This interactive script will:
1. Compile all contracts
2. Deploy MultiTrancheVault + 6 SURE tokens (~4 TON, 10-15 min)
3. Deploy DynamicPricingOracle (~0.5 TON, 5 min)
4. Deploy PolicyFactory & ClaimsProcessor (~1 TON, 5 min)
5. Optionally deploy PolicyRouter + 256 Shards (~77 TON, 20-25 min)
6. Generate `frontend/.env.deployment` with all addresses

Total cost (without sharding): **~5.5 TON**
Total cost (with sharding): **~82.5 TON**

### 6. Verify Deployment

```bash
npx ts-node scripts/dev/verify-deployment.ts
```

This checks:
- All contracts are deployed and active
- Contract data is readable
- Links between contracts are correct

### 7. Update Frontend Configuration

```bash
./scripts/dev/update-frontend-env.sh
```

This updates `frontend/.env` with deployed contract addresses.

### 8. Test Integration

```bash
npx ts-node scripts/dev/test-integration.ts
```

Then follow manual testing instructions:
1. Start frontend: `cd frontend && npm run dev`
2. Connect wallet
3. Test policy purchase
4. Test vault staking
5. Verify on Analytics page

## Deployment Architecture

### Contract Deployment Order

1. **MultiTrancheVault** (+ 6 SURE tokens)
   - Core capital management
   - 6 risk tranches with bonding curves
   - Tokens: SURE-BTC, SURE-SNR, SURE-MEZZ, SURE-JNR, SURE-JNR+, SURE-EQT

2. **DynamicPricingOracle**
   - Real-time premium calculation
   - Multi-chain price feeds
   - Circuit breaker protection

3. **PolicyFactory**
   - Creates insurance policies
   - Multi-dimensional product matrix
   - Coverage types: Depeg, Bridge, CEX Liquidation

4. **ClaimsProcessor**
   - Validates and processes claims
   - Multi-party verification
   - Automatic payouts for approved claims

5. **PolicyRouter + Shards** (Optional)
   - Horizontal scaling for 100k+ policies
   - 256 shards, ~400 policies each
   - Only needed for production scale

### Contract Addresses

After deployment, addresses are saved in:
- `frontend/.env.deployment` - Generated addresses
- `frontend/.env` - Active configuration
- `logs/deployment-YYYYMMDD-HHMMSS.log` - Full deployment log

## Manual Deployment (Advanced)

If you prefer to deploy contracts individually:

### Deploy MultiTrancheVault

```bash
npx blueprint run deployMultiTrancheVault --testnet
```

Prompts:
- Admin address (your wallet)
- Initial capital per tranche (optional, for testing)

### Deploy DynamicPricingOracle

```bash
npx blueprint run deployPricingOracle --testnet
```

Prompts:
- Admin address
- Keeper addresses (1-3, for price updates)

### Deploy PolicyFactory & ClaimsProcessor

```bash
npx blueprint run deployPolicyFactory --testnet
```

Prompts:
- Admin address
- Treasury address
- Vault addresses (Primary, Secondary, TradFi)
- Oracle address

### Deploy PolicyRouter (Optional)

```bash
npx blueprint run deployPolicySharding --testnet
```

Prompts:
- Admin address
- PolicyFactory address
- ClaimsProcessor address

**Warning**: This deploys 257 contracts and takes ~25 minutes!

## Troubleshooting

### "Insufficient balance"

Your deployment wallet needs more testnet TON. Request more from:
- https://t.me/testgiver_ton_bot
- https://faucet.toncoin.org/

### "Contract deployment timeout"

Testnet can be slow. Wait 1-2 minutes and check on explorer:
```
https://testnet.tonscan.org/address/YOUR_CONTRACT_ADDRESS
```

### "Compilation failed"

Run verification script to see detailed errors:
```bash
./scripts/dev/verify-contracts.sh
```

Common issues:
- Missing dependencies: `npm install`
- Outdated Blueprint: `npm update @ton/blueprint`

### "Cannot read contract data"

Some getters may fail until contracts are initialized. This is normal.
- MultiTrancheVault needs initial deposits
- DynamicPricingOracle needs price updates from keepers
- PolicyFactory works immediately

## Mainnet Deployment

**DO NOT deploy to mainnet yet!**

When ready:
1. Use multi-sig wallet for admin (3-of-5)
2. Audit all contracts
3. Test on testnet for 2+ weeks
4. Deploy with gradual rollout:
   - Start with $10k coverage limits
   - Increase to $100k after 1 week
   - Increase to $1M+ after 1 month

## Security Checklist

Before mainnet:
- [ ] All contracts audited by professional firm
- [ ] Multi-sig admin wallet configured (3-of-5)
- [ ] Emergency pause functionality tested
- [ ] Oracle keeper infrastructure redundant (3+ keepers)
- [ ] Rate limits and circuit breakers tested
- [ ] All private keys stored in hardware wallets
- [ ] Deployment scripts reviewed for mainnet safety
- [ ] Testnet stress tested (1000+ policies)
- [ ] Claims processing tested end-to-end
- [ ] Vault rebalancing tested under high utilization

## Resources

- TON Testnet Explorer: https://testnet.tonscan.org/
- Blueprint Docs: https://github.com/ton-org/blueprint
- TON Docs: https://docs.ton.org/
- Tonsurance Architecture: See `docs/MULTI_TRANCHE_VAULT_SPEC.md`

## Support

Questions or issues?
- Check deployment logs: `logs/deployment-*.log`
- Review contract on explorer
- Verify wallet has sufficient balance
- Ensure Blueprint is up to date

---

Last updated: 2025-10-15
