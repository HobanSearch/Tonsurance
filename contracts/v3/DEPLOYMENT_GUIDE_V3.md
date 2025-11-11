# Tonsurance V3 Deployment Guide

## Overview

This guide covers deploying V3 smart contracts to TON testnet/mainnet with shard optimization. The deployment process includes:

1. **Salt Pre-computation**: Find addresses targeting specific shards
2. **Sequential Deployment**: Deploy in dependency order
3. **Cross-Contract Configuration**: Link contracts together
4. **Verification**: Confirm shard placement and functionality
5. **Monitoring Setup**: Track gas costs, success rates, errors

**Estimated Time**: 2-3 hours (testnet), 4-6 hours (mainnet with audits)

---

## Prerequisites

### Environment Setup

**Required Tools**:
- Node.js 18+ with TypeScript
- TON Blueprint (`npm install -g @ton/blueprint`)
- TON CLI (`npm install -g ton`)
- Wallet with funds (testnet: https://t.me/testgiver_ton_bot, mainnet: purchase TON)

**Environment Variables** (`.env`):
```bash
# Network
NETWORK=testnet  # or mainnet

# Deployer Wallet
DEPLOYER_MNEMONIC="word1 word2 ... word24"  # 24-word seed phrase
DEPLOYER_ADDRESS=EQA...  # Your wallet address

# Contract Addresses (filled after deployment)
GAS_WALLET_ADDRESS=
MASTER_FACTORY_ADDRESS=
SBT_VERIFIER_ADDRESS=
POLICY_NFT_MINTER_ADDRESS=
MULTI_TRANCHE_VAULT_ADDRESS=
PRICE_ORACLE_ADDRESS=

# Admin Multi-Sig
ADMIN_SIGNER_1_PUBKEY=0x...
ADMIN_SIGNER_2_PUBKEY=0x...
ADMIN_SIGNER_3_PUBKEY=0x...
ADMIN_SIGNER_4_PUBKEY=0x...
ADMIN_SIGNER_5_PUBKEY=0x...

# Oracle Keepers
ORACLE_KEEPER_1_ADDRESS=EQA...
ORACLE_KEEPER_2_ADDRESS=EQB...
ORACLE_KEEPER_3_ADDRESS=EQC...
ORACLE_KEEPER_4_ADDRESS=EQD...
ORACLE_KEEPER_5_ADDRESS=EQE...

# Guardian Service (ZK Proofs)
GUARDIAN_SERVICE_PUBKEY=0x...

# Gas Optimization
TARGET_SHARD_CORE=0x00
TARGET_SHARD_DEPEG=0x10
TARGET_SHARD_BRIDGE=0x20
TARGET_SHARD_ORACLE=0x30
TARGET_SHARD_CONTRACT=0x40
TARGET_SHARD_VAULT=0xF0
```

**Wallet Funding**:
- **Testnet**: Minimum 10 TON (get from @testgiver_ton_bot)
- **Mainnet**: Minimum 50 TON (30 TON for deployments + 20 TON buffer)

---

## Deployment Process

### Step 1: Compile All Contracts

```bash
# Compile all V3 contracts
npx blueprint build --all

# Verify compilation
ls -lh build/
# Expected files:
# - GasWallet.compiled.json
# - SBTVerifier.compiled.json
# - MasterFactory.compiled.json
# - PolicyNFTMinter.compiled.json
# - DepegSubFactory.compiled.json
# - BridgeSubFactory.compiled.json
# - OracleSubFactory.compiled.json
# - ContractSubFactory.compiled.json
# - StablecoinChild.compiled.json
# - BridgeChild.compiled.json
# - OracleChild.compiled.json
# - ProtocolChild.compiled.json
# - MultiTrancheVault.compiled.json
# - ParametricEscrow.compiled.json
# - PriceOracle.compiled.json
```

---

### Step 2: Deploy Shard-Optimized Contracts

**Deployment Script** (`scripts/deployV3.ts`):

```typescript
import { NetworkProvider } from '@ton/blueprint';
import { Address, toNano, Cell, beginCell, contractAddress } from '@ton/core';
import { compile } from '@ton/blueprint';

// Shard-aware deployment helper
async function deployToShard(
  provider: NetworkProvider,
  code: Cell,
  data: Cell,
  targetPrefix: number,
  value: bigint,
  name: string
): Promise<Address> {
  console.log(`\n🔍 Searching for ${name} address with shard prefix 0x${targetPrefix.toString(16).padStart(2, '0')}...`);

  for (let salt = 0; salt < 10000; salt++) {
    const saltedData = beginCell()
      .storeRef(data)
      .storeUint(salt, 64)
      .endCell();

    const stateInit = beginCell()
      .storeRef(code)
      .storeRef(saltedData)
      .endCell();

    const address = contractAddress(0, stateInit);
    const prefix = address.hash[0];

    if (prefix === targetPrefix) {
      console.log(`✓ Found address ${address.toString()} with salt ${salt}`);
      console.log(`  Shard: 0x${prefix.toString(16).padStart(2, '0')}`);

      // Deploy
      await provider.sender.send({
        to: address,
        value,
        stateInit,
        bounce: false,
        body: beginCell().endCell()
      });

      console.log(`⏳ Waiting for deployment...`);
      await provider.waitForDeploy(address, 60);
      console.log(`✅ ${name} deployed successfully`);

      return address;
    }

    if (salt % 1000 === 0 && salt > 0) {
      console.log(`  Tried ${salt} salts...`);
    }
  }

  throw new Error(`Failed to find address for ${name} after 10,000 iterations`);
}

export async function run(provider: NetworkProvider) {
  console.log('🚀 Starting V3 Deployment');
  console.log(`Network: ${provider.network()}`);
  console.log(`Deployer: ${provider.sender.address}`);

  // Load environment config
  const config = {
    adminSigners: [
      process.env.ADMIN_SIGNER_1_PUBKEY!,
      process.env.ADMIN_SIGNER_2_PUBKEY!,
      process.env.ADMIN_SIGNER_3_PUBKEY!,
      process.env.ADMIN_SIGNER_4_PUBKEY!,
      process.env.ADMIN_SIGNER_5_PUBKEY!
    ],
    oracleKeepers: [
      Address.parse(process.env.ORACLE_KEEPER_1_ADDRESS!),
      Address.parse(process.env.ORACLE_KEEPER_2_ADDRESS!),
      Address.parse(process.env.ORACLE_KEEPER_3_ADDRESS!),
      Address.parse(process.env.ORACLE_KEEPER_4_ADDRESS!),
      Address.parse(process.env.ORACLE_KEEPER_5_ADDRESS!)
    ],
    guardianPubkey: process.env.GUARDIAN_SERVICE_PUBKEY!
  };

  // Compile contracts
  console.log('\n📦 Compiling contracts...');
  const gasWalletCode = await compile('GasWallet');
  const sbtVerifierCode = await compile('SBTVerifier');
  const masterFactoryCode = await compile('MasterFactory');
  const policyNFTMinterCode = await compile('PolicyNFTMinter');
  const vaultCode = await compile('MultiTrancheVault');
  const oracleCode = await compile('PriceOracle');

  // === PHASE 1: Deploy Core Contracts (Shard 0x00) ===
  console.log('\n\n=== PHASE 1: CORE CONTRACTS (Shard 0x00) ===');

  // 1. Deploy GasWallet
  const gasWalletData = beginCell()
    .storeAddress(provider.sender.address) // Admin
    .storeUint(0, 64) // Total sponsored
    .storeDict(null) // User nonces
    .storeDict(null) // Rate limits
    .storeCoins(toNano('0')) // Reserve balance
    .endCell();

  const gasWallet = await deployToShard(
    provider,
    gasWalletCode,
    gasWalletData,
    0x00,
    toNano('1'),
    'GasWallet'
  );

  // 2. Deploy SBTVerifier
  const sbtVerifierData = beginCell()
    .storeAddress(provider.sender.address) // Admin
    .storeUint(BigInt(config.guardianPubkey), 256) // Guardian pubkey
    .storeDict(null) // SBT registry
    .storeUint(0, 1) // Not paused
    .endCell();

  const sbtVerifier = await deployToShard(
    provider,
    sbtVerifierCode,
    sbtVerifierData,
    0x00,
    toNano('1'),
    'SBTVerifier'
  );

  // 3. Deploy MasterFactory (needs GasWallet + SBTVerifier addresses)
  const masterFactoryData = beginCell()
    .storeAddress(provider.sender.address) // Admin
    .storeAddress(gasWallet) // GasWallet address
    .storeAddress(sbtVerifier) // SBTVerifier address
    .storeDict(null) // Product factories
    .storeUint(0, 1) // Not paused
    .endCell();

  const masterFactory = await deployToShard(
    provider,
    masterFactoryCode,
    masterFactoryData,
    0x00,
    toNano('2'),
    'MasterFactory'
  );

  // 4. Deploy PolicyNFTMinter
  const policyNFTMinterData = beginCell()
    .storeAddress(provider.sender.address) // Admin
    .storeAddress(masterFactory) // MasterFactory address
    .storeUint(0, 64) // Next policy ID
    .storeDict(null) // Policy metadata
    .endCell();

  const policyNFTMinter = await deployToShard(
    provider,
    policyNFTMinterCode,
    policyNFTMinterData,
    0x00,
    toNano('1'),
    'PolicyNFTMinter'
  );

  // === PHASE 2: Deploy Vault System (Shard 0xF0) ===
  console.log('\n\n=== PHASE 2: VAULT SYSTEM (Shard 0xF0) ===');

  // 5. Deploy PriceOracle
  const oracleData = beginCell()
    .storeAddress(provider.sender.address) // Admin
    .storeDict(null) // Oracle keepers (will set later)
    .storeDict(null) // Oracle prices
    .storeUint(3, 8) // Required consensus (3/5)
    .endCell();

  const priceOracle = await deployToShard(
    provider,
    oracleCode,
    oracleData,
    0xF0,
    toNano('1'),
    'PriceOracle'
  );

  // 6. Deploy MultiTrancheVault
  const vaultData = beginCell()
    .storeAddress(provider.sender.address) // Admin
    .storeAddress(masterFactory) // MasterFactory address
    .storeAddress(priceOracle) // PriceOracle address
    .storeCoins(0) // Total capital
    .storeCoins(0) // Total coverage sold
    .storeDict(null) // Tranche data (6 tranches)
    .storeDict(null) // Depositor balances
    .storeUint(0, 1) // Not paused
    .endCell();

  const vault = await deployToShard(
    provider,
    vaultCode,
    vaultData,
    0xF0,
    toNano('10'), // Vault needs more initial balance
    'MultiTrancheVault'
  );

  // === PHASE 3: Configure Cross-Contract Links ===
  console.log('\n\n=== PHASE 3: CONFIGURATION ===');

  // Set MasterFactory address in GasWallet
  console.log('🔗 Configuring GasWallet -> MasterFactory link...');
  await provider.sender.send({
    to: gasWallet,
    value: toNano('0.05'),
    body: beginCell()
      .storeUint(0x01, 32) // op::set_master_factory
      .storeAddress(masterFactory)
      .endCell()
  });

  // Set PolicyNFTMinter address in MasterFactory
  console.log('🔗 Configuring MasterFactory -> PolicyNFTMinter link...');
  await provider.sender.send({
    to: masterFactory,
    value: toNano('0.05'),
    body: beginCell()
      .storeUint(0x02, 32) // op::set_nft_minter
      .storeAddress(policyNFTMinter)
      .endCell()
  });

  // Set Vault address in MasterFactory
  console.log('🔗 Configuring MasterFactory -> Vault link...');
  await provider.sender.send({
    to: masterFactory,
    value: toNano('0.05'),
    body: beginCell()
      .storeUint(0x03, 32) // op::set_vault
      .storeAddress(vault)
      .endCell()
  });

  // Register oracle keepers
  console.log('🔗 Registering oracle keepers...');
  for (let i = 0; i < config.oracleKeepers.length; i++) {
    await provider.sender.send({
      to: priceOracle,
      value: toNano('0.05'),
      body: beginCell()
        .storeUint(0x04, 32) // op::register_keeper
        .storeUint(i, 8) // Keeper ID
        .storeAddress(config.oracleKeepers[i])
        .endCell()
    });
  }

  // === PHASE 4: Verification ===
  console.log('\n\n=== PHASE 4: VERIFICATION ===');

  console.log('✅ Deployment Complete!\n');
  console.log('📋 Contract Addresses:');
  console.log(`GasWallet:         ${gasWallet.toString()}`);
  console.log(`SBTVerifier:       ${sbtVerifier.toString()}`);
  console.log(`MasterFactory:     ${masterFactory.toString()}`);
  console.log(`PolicyNFTMinter:   ${policyNFTMinter.toString()}`);
  console.log(`PriceOracle:       ${priceOracle.toString()}`);
  console.log(`MultiTrancheVault: ${vault.toString()}\n`);

  console.log('🔍 Shard Verification:');
  console.log(`GasWallet:         0x${gasWallet.hash[0].toString(16).padStart(2, '0')} (expected 0x00) ${gasWallet.hash[0] === 0x00 ? '✓' : '✗'}`);
  console.log(`SBTVerifier:       0x${sbtVerifier.hash[0].toString(16).padStart(2, '0')} (expected 0x00) ${sbtVerifier.hash[0] === 0x00 ? '✓' : '✗'}`);
  console.log(`MasterFactory:     0x${masterFactory.hash[0].toString(16).padStart(2, '0')} (expected 0x00) ${masterFactory.hash[0] === 0x00 ? '✓' : '✗'}`);
  console.log(`PolicyNFTMinter:   0x${policyNFTMinter.hash[0].toString(16).padStart(2, '0')} (expected 0x00) ${policyNFTMinter.hash[0] === 0x00 ? '✓' : '✗'}`);
  console.log(`PriceOracle:       0x${priceOracle.hash[0].toString(16).padStart(2, '0')} (expected 0xf0) ${priceOracle.hash[0] === 0xf0 ? '✓' : '✗'}`);
  console.log(`MultiTrancheVault: 0x${vault.hash[0].toString(16).padStart(2, '0')} (expected 0xf0) ${vault.hash[0] === 0xf0 ? '✓' : '✗'}\n`);

  // Save addresses to .env
  console.log('💾 Saving addresses to .env...');
  const fs = require('fs');
  fs.appendFileSync('.env', `\n# V3 Deployed Contracts (${new Date().toISOString()})\n`);
  fs.appendFileSync('.env', `GAS_WALLET_ADDRESS=${gasWallet.toString()}\n`);
  fs.appendFileSync('.env', `MASTER_FACTORY_ADDRESS=${masterFactory.toString()}\n`);
  fs.appendFileSync('.env', `SBT_VERIFIER_ADDRESS=${sbtVerifier.toString()}\n`);
  fs.appendFileSync('.env', `POLICY_NFT_MINTER_ADDRESS=${policyNFTMinter.toString()}\n`);
  fs.appendFileSync('.env', `PRICE_ORACLE_ADDRESS=${priceOracle.toString()}\n`);
  fs.appendFileSync('.env', `MULTI_TRANCHE_VAULT_ADDRESS=${vault.toString()}\n`);

  console.log('\n✅ Deployment script complete!');
  console.log('\nNext steps:');
  console.log('1. Run smoke tests: npm run test:smoke');
  console.log('2. Deploy sub-factories: npm run deploy:subfactories');
  console.log('3. Monitor transactions: https://testnet.tonscan.org/address/' + gasWallet.toString());
}
```

**Run Deployment**:
```bash
npx blueprint run deployV3 --testnet

# Expected output:
# 🚀 Starting V3 Deployment
# Network: testnet
# Deployer: EQA...
#
# 📦 Compiling contracts...
#
# === PHASE 1: CORE CONTRACTS (Shard 0x00) ===
# 🔍 Searching for GasWallet address with shard prefix 0x00...
#   Tried 1000 salts...
# ✓ Found address EQA012abcdef... with salt 1234
#   Shard: 0x00
# ⏳ Waiting for deployment...
# ✅ GasWallet deployed successfully
# ... (repeat for other contracts)
#
# === PHASE 4: VERIFICATION ===
# ✅ Deployment Complete!
# ...
```

---

### Step 3: Deploy Sub-Factories (On-Demand)

Sub-factories are deployed on-demand when first policy of that product type is created. You can also pre-deploy them:

```typescript
// scripts/deploySubFactories.ts
export async function run(provider: NetworkProvider) {
  const masterFactory = Address.parse(process.env.MASTER_FACTORY_ADDRESS!);

  // Compile sub-factory codes
  const depegFactoryCode = await compile('DepegSubFactory');
  const bridgeFactoryCode = await compile('BridgeSubFactory');
  const oracleFactoryCode = await compile('OracleSubFactory');
  const contractFactoryCode = await compile('ContractSubFactory');

  // Deploy Depeg Sub-Factory (Shard 0x10)
  const depegFactoryData = beginCell()
    .storeAddress(masterFactory)
    .storeUint(1, 8) // Product type: DEPEG
    .storeDict(null) // Children registry
    .endCell();

  const depegFactory = await deployToShard(
    provider,
    depegFactoryCode,
    depegFactoryData,
    0x10,
    toNano('1'),
    'DepegSubFactory'
  );

  // Register with MasterFactory
  await provider.sender.send({
    to: masterFactory,
    value: toNano('0.1'),
    body: beginCell()
      .storeUint(0x05, 32) // op::register_product_factory
      .storeUint(1, 8) // Product type: DEPEG
      .storeAddress(depegFactory)
      .endCell()
  });

  // Repeat for Bridge, Oracle, Contract sub-factories...
}
```

---

### Step 4: Smoke Tests

Run basic functionality tests to verify deployment:

```bash
# Test policy creation
npm run test:smoke

# Manually create test policy
npx blueprint run createTestPolicy --testnet
```

**Smoke Test Script** (`scripts/createTestPolicy.ts`):
```typescript
export async function run(provider: NetworkProvider) {
  const gasWallet = Address.parse(process.env.GAS_WALLET_ADDRESS!);

  console.log('🧪 Creating test USDT depeg policy...');

  // Create policy via GasWallet
  await provider.sender.send({
    to: gasWallet,
    value: toNano('0.5'),
    body: beginCell()
      .storeUint(1, 64) // Nonce
      .storeUint(1, 8) // Product type: DEPEG
      .storeUint(1, 8) // Asset ID: USDT
      .storeCoins(toNano('10000')) // Coverage: 10,000 USDC
      .storeUint(30, 16) // Duration: 30 days
      .endCell()
  });

  console.log('⏳ Waiting for policy creation...');
  await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 sec

  // Check PolicyNFT minted
  const policyNFTMinter = Address.parse(process.env.POLICY_NFT_MINTER_ADDRESS!);
  const nextPolicyId = await provider.call(policyNFTMinter, 'get_next_policy_id', []);

  console.log(`✅ Policy created! Next policy ID: ${nextPolicyId}`);
  console.log(`View on explorer: https://testnet.tonscan.org/address/${policyNFTMinter.toString()}`);
}
```

---

### Step 5: Monitoring Setup

**Grafana Dashboard** (track gas costs, success rates):

```yaml
# docker-compose.yml
version: '3'
services:
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: tonsurance_analytics
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data

  transaction_indexer:
    build: ./indexer
    environment:
      TON_API_KEY: ${TON_CENTER_API_KEY}
      POSTGRES_URL: postgresql://admin:${DB_PASSWORD}@postgres/tonsurance_analytics
    command: node dist/indexer.js
```

**Transaction Indexer** (Node.js service):
```typescript
// indexer/indexer.ts
import { TonClient } from '@ton/ton';
import { Pool } from 'pg';

const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC' });
const db = new Pool({ connectionString: process.env.POSTGRES_URL });

async function indexTransactions() {
  const contracts = [
    process.env.GAS_WALLET_ADDRESS!,
    process.env.MASTER_FACTORY_ADDRESS!,
    // ... other contracts
  ];

  for (const address of contracts) {
    const txs = await client.getTransactions(address, { limit: 100 });

    for (const tx of txs) {
      await db.query(
        'INSERT INTO transactions (hash, contract, gas_used, success, timestamp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [tx.hash, address, tx.totalFees, tx.inMsg?.success, tx.now]
      );
    }
  }
}

setInterval(indexTransactions, 60000); // Every minute
```

---

## Mainnet Deployment Checklist

- [ ] **External Audit**: Certik/SlowMist/Zellic (2-3 weeks, $50K-100K)
- [ ] **Testnet Monitoring**: 2 weeks minimum, >10K policies, 99%+ success rate
- [ ] **Multi-Sig Setup**: 3-of-5 admin control (hardware wallets recommended)
- [ ] **Emergency Procedures**: Pause scripts, rollback plan, incident response
- [ ] **Insurance**: Protocol insurance for first $1M of coverage (Nexus Mutual or similar)
- [ ] **Legal Review**: Ensure compliance with relevant jurisdictions
- [ ] **Bug Bounty**: $50K pool on ImmuneFi
- [ ] **Monitoring**: 24/7 alerts (Grafana, PagerDuty)
- [ ] **Gradual Rollout**:
  - Week 1: $50K coverage limit, invite-only (50 users)
  - Week 2: $200K limit, public launch (500 users)
  - Month 2: $500K limit (5,000 users)
  - Month 3+: Full capacity ($10M+)

---

## Troubleshooting

### Salt Computation Times Out
**Problem**: After 10,000 iterations, no address found with target prefix

**Solutions**:
1. Increase iteration limit to 50,000 (takes ~10 min)
2. Change target prefix (e.g., use 0x01 instead of 0x00)
3. Use alternative deployment method (random, then redeploy with correct prefix later)

### Deployment Transaction Fails
**Problem**: Transaction bounces with error 34 (invalid sender)

**Solutions**:
1. Verify deployer wallet has funds (check with `ton wallet show`)
2. Ensure wallet is active on network (send 0.001 TON to self first)
3. Check gas limits (increase value to 2 TON)

### Cross-Contract Messages Fail
**Problem**: MasterFactory → SubFactory message bounces

**Solutions**:
1. Verify SubFactory address is correct (run verification script)
2. Check SubFactory has gas (send 1 TON to factory address)
3. Review bounce message logs (parse error code)

---

## Cost Breakdown

### Testnet
- GasWallet: ~0.02 TON (1 TON deployment + salt computation gas)
- MasterFactory: ~0.02 TON
- SBTVerifier: ~0.02 TON
- PolicyNFTMinter: ~0.02 TON
- Vault: ~0.05 TON (larger contract)
- Oracle: ~0.02 TON
- Sub-factories (4×): ~0.08 TON
- **Total: ~0.23 TON**

### Mainnet
- Same as testnet + buffer
- **Recommended wallet balance**: 50 TON (30 TON deployments + 20 TON buffer)

---

## Next Steps

After successful deployment:
1. **Monitor gas costs**: Track average policy creation cost (target: <0.045 TON)
2. **Run integration tests**: Full user journeys (E2E tests)
3. **Simulate attacks**: DoS, oracle manipulation, reentrancy
4. **Collect feedback**: 5-10 beta testers, iterate on UX
5. **Prepare mainnet**: External audit, multi-sig setup, legal review
6. **Gradual launch**: Start with $50K limit, scale to $10M+ over 3 months

**Monitoring**: https://testnet.tonscan.org/address/{GAS_WALLET_ADDRESS}
