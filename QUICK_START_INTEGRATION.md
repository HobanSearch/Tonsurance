# Quick Start: Frontend Integration Guide

## 🚀 For Developers: Using the New Wrappers

### 1. Import Contracts

```typescript
import { useContracts } from './hooks/useContracts';

function MyComponent() {
  const { contracts, sender, isConnected } = useContracts();

  // Access any contract
  const { multiTrancheVault, dynamicPricingOracle, policyRouter } = contracts;
}
```

### 2. Using MultiTrancheVault

#### Deposit (Stake)
```typescript
import { toNano } from '@ton/core';

const depositToVault = async (trancheId: number, amount: string) => {
  if (!contracts.multiTrancheVault) return;

  const amountNano = toNano(amount);
  const gasAmount = toNano('0.15');

  await contracts.multiTrancheVault.sendDeposit(
    sender,
    trancheId,           // 1=BTC, 2=SNR, 3=MEZZ, 4=JNR, 5=JNR+, 6=EQT
    amountNano + gasAmount
  );
};

// Example: Deposit 100 TON to SURE-BTC
await depositToVault(1, '100');
```

#### Withdraw (Unstake)
```typescript
const withdrawFromVault = async (trancheId: number, tokenAmount: string) => {
  if (!contracts.multiTrancheVault) return;

  const amountNano = toNano(tokenAmount);
  const gasAmount = toNano('0.15');

  await contracts.multiTrancheVault.sendWithdraw(
    sender,
    gasAmount,
    trancheId,
    amountNano
  );
};

// Example: Withdraw 50 SURE-BTC tokens
await withdrawFromVault(1, '50');
```

#### Query Tranche Info
```typescript
const getTrancheDetails = async (trancheId: number) => {
  if (!contracts.multiTrancheVault) return;

  // Get basic info
  const info = await contracts.multiTrancheVault.getTrancheInfo(trancheId);
  console.log('Capital:', fromNano(info.capital));
  console.log('APY Range:', info.apyMin / 100, '-', info.apyMax / 100, '%');

  // Get current state
  const state = await contracts.multiTrancheVault.getTrancheState(trancheId);
  console.log('Utilization:', state.utilization, '%');

  // Get NAV
  const nav = await contracts.multiTrancheVault.getTrancheNAV(trancheId);
  console.log('NAV:', fromNano(nav));
};
```

#### Get User Balance
```typescript
const getUserStake = async (userAddress: string, trancheId: number) => {
  if (!contracts.multiTrancheVault) return;

  const addr = Address.parse(userAddress);
  const balance = await contracts.multiTrancheVault.getDepositorBalance(addr);

  console.log('Staked:', fromNano(balance.balance), 'tokens');
  console.log('Lock until:', new Date(Number(balance.lockUntil) * 1000));
  console.log('Stake start:', new Date(Number(balance.stakeStartTime) * 1000));
};
```

### 3. Using DynamicPricingOracle

#### Get Price Multiplier
```typescript
const getPriceMultiplier = async (
  coverageType: number,  // 0=depeg, 1=exploit, 2=bridge, 3=cex_liq, 4=cex_freeze
  chainId: number,       // 0=eth, 1=bsc, 2=polygon, 3=avax, 4=arb, 5=op, 6=ton, 7=sol
  stablecoinId: number   // 0=usdt, 1=usdc, 2=dai, ...
) => {
  if (!contracts.dynamicPricingOracle) return;

  // Get total multiplier (in basis points)
  const multiplier = await contracts.dynamicPricingOracle.getMultiplier(
    coverageType,
    chainId,
    stablecoinId
  );

  console.log('Multiplier:', Number(multiplier) / 10000, 'x');

  // Get component breakdown
  const components = await contracts.dynamicPricingOracle.getMultiplierComponents(
    coverageType,
    chainId,
    stablecoinId
  );

  console.log('Base:', Number(components.baseMultiplier) / 10000);
  console.log('Market adj:', Number(components.marketAdjustment) / 10000);
  console.log('Volatility:', Number(components.volatilityPremium) / 10000);
  console.log('Last update:', new Date(Number(components.timestamp) * 1000));
};

// Example: Get multiplier for USDT depeg on Ethereum
await getPriceMultiplier(0, 0, 0);
```

#### Check Oracle Freshness
```typescript
const checkOracleFreshness = async () => {
  if (!contracts.dynamicPricingOracle) return;

  const isFresh = await contracts.dynamicPricingOracle.isFresh();
  console.log('Oracle is fresh:', isFresh);

  if (!isFresh) {
    console.warn('⚠️ Oracle data stale (>5 minutes old)');
  }
};
```

### 4. Using PolicyRouter

#### Create Policy
```typescript
const createPolicy = async (
  coverageType: number,
  chainId: number,
  stablecoinId: number,
  coverageAmount: string,  // In USD
  durationDays: number
) => {
  if (!contracts.policyRouter) return;

  const amountNano = toNano(coverageAmount);
  const premiumNano = toNano('10'); // Premium + gas

  await contracts.policyRouter.sendCreatePolicy(
    sender,
    premiumNano,
    {
      coverageType,
      chainId,
      stablecoinId,
      coverageAmount: amountNano,
      durationDays
    }
  );

  // Get the policy ID that was assigned
  const nextId = await contracts.policyRouter.getNextPolicyId();
  console.log('Policy created with ID:', nextId - 1n);
};

// Example: $1000 USDT depeg coverage on TON for 30 days
await createPolicy(0, 6, 0, '1000', 30);
```

#### Find Policy Shard
```typescript
const findPolicyShard = async (policyId: bigint) => {
  if (!contracts.policyRouter) return;

  const { shardId, shardAddress } = await contracts.policyRouter.getShardForPolicy(policyId);

  console.log('Policy', policyId, 'is in shard', shardId);
  console.log('Shard address:', shardAddress.toString());

  // Or calculate offline
  const calculatedShardId = PolicyRouter.calculateShardId(policyId);
  console.log('Calculated shard ID:', calculatedShardId);
};
```

### 5. Using PolicyShard (Advanced)

#### Get Policy Details
```typescript
import { PolicyShard } from '../wrappers/PolicyShard';

const getPolicyDetails = async (policyId: bigint) => {
  // First, find the shard
  const { shardAddress } = await contracts.policyRouter!.getShardForPolicy(policyId);

  // Connect to the shard
  const shard = tonClient.open(PolicyShard.createFromAddress(shardAddress));

  // Get policy data
  const policy = await shard.getPolicyData(policyId);

  console.log('User:', policy.userAddress.toString());
  console.log('Coverage:', fromNano(policy.coverageAmount), 'USD');
  console.log('Premium:', fromNano(policy.premium), 'TON');
  console.log('Active:', policy.active);
  console.log('Claimed:', policy.claimed);
  console.log('Start:', new Date(Number(policy.startTime) * 1000));
  console.log('End:', new Date(Number(policy.endTime) * 1000));
};
```

#### Get User's Policies
```typescript
const getUserPolicies = async (userAddress: string) => {
  // Must query ALL 256 shards (expensive operation - use backend API instead)
  const allPolicies: bigint[] = [];

  for (let shardId = 0; shardId < 256; shardId++) {
    const shardAddr = await contracts.policyRouter!.getShardAddress(shardId);
    const shard = tonClient.open(PolicyShard.createFromAddress(shardAddr));

    const { policyIds } = await shard.getUserPolicies(Address.parse(userAddress));
    allPolicies.push(...policyIds);
  }

  console.log('User has', allPolicies.length, 'policies');
  return allPolicies;
};

// BETTER: Use backend API
const getUserPoliciesFromAPI = async (userAddress: string) => {
  const response = await fetch(`${API_URL}/api/v2/policies/user/${userAddress}`);
  const policies = await response.json();
  return policies;
};
```

### 6. Using useMultiTrancheVault Hook

```typescript
import { useMultiTrancheVault } from '../hooks/useMultiTrancheVault';

function VaultDashboard() {
  const { trancheData, vaultSummary, loading, error, refetch } = useMultiTrancheVault();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Vault Summary</h2>
      <p>Total Capital: {vaultSummary?.totalCapital} TON</p>
      <p>Coverage Sold: {vaultSummary?.totalCoverageSold} TON</p>

      <h2>Tranches</h2>
      {Object.values(trancheData).map(tranche => (
        <div key={tranche.trancheId}>
          <h3>{tranche.name}</h3>
          <p>APY: {tranche.apyMin}% - {tranche.apyMax}%</p>
          <p>Current APY: {tranche.currentApy}%</p>
          <p>Utilization: {tranche.utilization}%</p>
          <p>Capital: {tranche.capital} TON</p>
        </div>
      ))}

      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

### 7. Using useDynamicPricing Hook

```typescript
import { useDynamicPricing } from '../hooks/useDynamicPricing';

function PremiumCalculator() {
  const [product, setProduct] = useState({
    coverageType: 'depeg',
    blockchain: 'TON',
    stablecoin: 'USDT'
  });

  const {
    quote,
    isLoading,
    isConnected,
    error,
    priceChange,
    lockPrice,
    refreshQuote
  } = useDynamicPricing({
    product,
    coverageAmount: 1000,
    durationDays: 30,
    autoRefresh: true
  });

  const handleLockPrice = async () => {
    const lock = await lockPrice();
    if (lock) {
      console.log('Price locked until:', new Date(lock.valid_until * 1000));
      console.log('Locked premium:', lock.locked_premium);
    }
  };

  return (
    <div>
      {error && <div className="error">⚠️ {error}</div>}

      {quote && (
        <>
          <div>
            Premium: ${quote.final_premium.toFixed(2)}
            {priceChange === 'up' && ' 📈'}
            {priceChange === 'down' && ' 📉'}
          </div>
          <div>Effective APR: {quote.effective_apr.toFixed(2)}%</div>
          <div>
            Market Adjustment: {quote.market_adjustment_pct > 0 ? '+' : ''}
            {quote.market_adjustment_pct}%
          </div>
          <div>
            Volatility Premium: {quote.volatility_premium_pct > 0 ? '+' : ''}
            {quote.volatility_premium_pct}%
          </div>

          <button onClick={handleLockPrice}>Lock This Price (2 min)</button>
        </>
      )}

      <div>
        WebSocket: {isConnected ? '✅ Connected' : '🔴 Disconnected'}
      </div>
    </div>
  );
}
```

## 📋 Coverage Type IDs

```typescript
const COVERAGE_TYPES = {
  DEPEG: 0,
  EXPLOIT: 1,
  BRIDGE: 2,
  CEX_LIQUIDATION: 3,
  CEX_FREEZE: 4
};
```

## 🌐 Chain IDs

```typescript
const CHAIN_IDS = {
  ETHEREUM: 0,
  BSC: 1,
  POLYGON: 2,
  AVALANCHE: 3,
  ARBITRUM: 4,
  OPTIMISM: 5,
  TON: 6,
  SOLANA: 7
};
```

## 💵 Stablecoin IDs

```typescript
const STABLECOIN_IDS = {
  USDT: 0,
  USDC: 1,
  DAI: 2,
  BUSD: 3,
  TUSD: 4,
  FRAX: 5,
  USDD: 6,
  USDP: 7,
  GUSD: 8,
  LUSD: 9,
  SUSD: 10,
  UST: 11,
  MIM: 12,
  FEI: 13
};
```

## 🎯 Tranche IDs

```typescript
const TRANCHE_IDS = {
  BTC: 1,      // Bitcoin-tier, safest (25% allocation)
  SNR: 2,      // Senior (20%)
  MEZZ: 3,     // Mezzanine (18%)
  JNR: 4,      // Junior (15%)
  JNR_PLUS: 5, // Junior Plus (12%)
  EQT: 6       // Equity, riskiest (10%)
};
```

## ⚡ Gas Estimates

```typescript
const GAS_ESTIMATES = {
  DEPOSIT: toNano('0.15'),          // Vault deposit
  WITHDRAW: toNano('0.15'),         // Vault withdrawal
  CREATE_POLICY: toNano('0.3'),     // Policy creation (includes routing)
  CLAIM: toNano('0.5'),             // Claim processing (includes waterfall)
  UPDATE_ORACLE: toNano('0.05'),    // Oracle update (keeper only)
  BATCH_UPDATE: toNano('0.2')       // Batch oracle update (560 products)
};
```

## 🛡️ Error Codes Reference

```typescript
const ERROR_CODES = {
  400: 'Invalid amount (min $10, max $1000)',
  401: 'Invalid duration',
  402: 'Invalid product parameters',
  403: 'Unauthorized (not owner/admin)',
  408: 'Stale oracle data (>5 min old)',
  409: 'Conflict (duplicate policy)',
  410: 'Circuit breaker active',
  423: 'Contract paused'
};
```

## 📊 Example: Complete Policy Purchase Flow

```typescript
async function purchasePolicy() {
  // 1. Get dynamic quote
  const { quote } = useDynamicPricing({
    product: { coverageType: 'depeg', blockchain: 'TON', stablecoin: 'USDT' },
    coverageAmount: 1000,
    durationDays: 30
  });

  if (!quote) return;

  // 2. Lock price
  const lock = await lockPrice();
  if (!lock) return;

  // 3. Create policy
  await contracts.policyRouter.sendCreatePolicy(
    sender,
    toNano(quote.final_premium.toString()) + toNano('0.3'), // Premium + gas
    {
      coverageType: 0, // DEPEG
      chainId: 6,      // TON
      stablecoinId: 0, // USDT
      coverageAmount: toNano('1000'),
      durationDays: 30
    }
  );

  // 4. Get policy ID
  const policyId = await contracts.policyRouter.getNextPolicyId() - 1n;

  // 5. Verify policy created
  const { shardAddress } = await contracts.policyRouter.getShardForPolicy(policyId);
  const shard = tonClient.open(PolicyShard.createFromAddress(shardAddress));
  const policy = await shard.getPolicyData(policyId);

  console.log('✅ Policy created:', policy);
}
```

---

**For more details, see:** `FRONTEND_INTEGRATION_COMPLETE.md`
