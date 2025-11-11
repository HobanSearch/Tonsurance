# Tonsurance V2 to V3 Migration Guide

## Overview

This guide covers migrating from V2 (monolithic contracts) to V3 (3-tier factory pattern with shard optimization). The migration strategy prioritizes:

1. **Zero Downtime**: V2 remains operational during V3 deployment
2. **Gradual Transition**: New policies on V3, existing policies honored on V2
3. **Data Preservation**: Migrate critical data (LP positions, policy metadata)
4. **Backwards Compatibility**: Frontend supports both V2 and V3 contracts

**Timeline**: 4-6 weeks (2 weeks parallel operation, 2 weeks data migration, 2 weeks deprecation)

---

## V2 vs V3 Architecture Comparison

### V2 Architecture (Current)

**Monolithic Design**:
- `PolicyFactory.fc` (181 lines): Handles all product types in one contract
- `PremiumCalculator.fc` (247 lines): Fixed premium calculation
- `MultiTrancheVault.fc` (793 lines): 6-tranche vault system
- `ParametricEscrow.fc` (551 lines): Multi-party distribution
- `PriceOracle.fc` (412 lines): Multi-oracle aggregation
- 14 total contracts, 5,221 lines

**Limitations**:
- Adding new products requires modifying PolicyFactory
- Random shard deployment → 50% cross-shard messages
- No DoS protection on external messages
- No KYC/SBT gating
- Silent failures (no bounce handling)

### V3 Architecture (New)

**3-Tier Factory Pattern**:
- **Tier 1**: MasterFactory (routes by product type)
- **Tier 2**: ProductSubFactories (4 types: Depeg, Bridge, Oracle, Contract)
- **Tier 3**: AssetChildren (asset-specific logic)

**Key Improvements**:
- Modular product expansion (add new asset without core changes)
- Shard-optimized (20-30% gas savings)
- DoS-resistant gas abstraction (GasWallet)
- ZK-proof KYC gating (SBTVerifier)
- Comprehensive bounce handling
- 8-party reward distribution

---

## Migration Strategy

### Phase 1: Parallel Operation (Week 1-2)

**Goal**: Deploy V3 alongside V2, route new policies to V3 while V2 policies continue

**Actions**:
1. Deploy V3 contracts to testnet (see DEPLOYMENT_GUIDE_V3.md)
2. Update frontend to detect V2 vs V3 policies
3. Route new policy creations to V3
4. Keep V2 contracts active for existing policies (claims, withdrawals)

**Frontend Changes**:
```typescript
// frontend/src/hooks/usePolicyFactory.ts
export function usePolicyFactory() {
  const v2Factory = useContract(V2_POLICY_FACTORY_ADDRESS);
  const v3MasterFactory = useContract(V3_MASTER_FACTORY_ADDRESS);

  // Use V3 for new policies
  const createPolicy = async (params: PolicyParams) => {
    return v3MasterFactory.sendCreatePolicy(params);
  };

  // Support both V2 and V3 for viewing policies
  const getUserPolicies = async (userAddress: Address) => {
    const v2Policies = await v2Factory.getUserPolicies(userAddress);
    const v3Policies = await v3MasterFactory.getUserPolicies(userAddress);

    return [...v2Policies, ...v3Policies];
  };

  return { createPolicy, getUserPolicies };
}
```

**Success Metrics**:
- 100% of new policies created on V3
- V2 claims continue to process (>99% success rate)
- No user-facing errors

---

### Phase 2: Data Migration (Week 3-4)

**Goal**: Migrate LP positions and active policies from V2 to V3 vaults

#### 2.1 Migrate LP Positions

**V2 Vault State** (to extract):
```func
;; V2 MultiTrancheVault.fc storage
global cell tranche_data; ;; Dict<tranche_id:uint8, (balance, depositors)>
global cell depositor_balances; ;; Dict<depositor_addr_hash, (tranche, amount)>
```

**Migration Script** (`scripts/migrateVaultPositions.ts`):
```typescript
export async function run(provider: NetworkProvider) {
  const v2Vault = provider.open(MultiTrancheVaultV2.createFromAddress(V2_VAULT_ADDRESS));
  const v3Vault = provider.open(MultiTrancheVaultV3.createFromAddress(V3_VAULT_ADDRESS));

  console.log('📊 Extracting V2 vault positions...');

  // Get all depositors
  const depositors = await v2Vault.getAllDepositors();
  console.log(`Found ${depositors.length} depositors`);

  let migratedCount = 0;
  let totalMigrated = 0n;

  for (const depositor of depositors) {
    const { tranche, amount } = await v2Vault.getDepositorBalance(depositor.address);

    console.log(`Migrating ${depositor.address}: ${fromNano(amount)} TON in tranche ${tranche}`);

    // Credit position in V3 vault (admin-only operation)
    await v3Vault.sendCreditMigration(provider.sender(), {
      depositorAddress: depositor.address,
      trancheId: tranche,
      amount,
      migrationNonce: BigInt(migratedCount)
    });

    migratedCount++;
    totalMigrated += amount;

    // Rate limit (5 tx/min)
    if (migratedCount % 5 === 0) {
      console.log('⏸️  Rate limit: waiting 60 seconds...');
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }

  console.log(`✅ Migrated ${migratedCount} positions totaling ${fromNano(totalMigrated)} TON`);

  // Verify balances match
  const v2TotalCapital = await v2Vault.getTotalCapital();
  const v3TotalCapital = await v3Vault.getTotalCapital();

  console.log(`V2 Total Capital: ${fromNano(v2TotalCapital)} TON`);
  console.log(`V3 Total Capital: ${fromNano(v3TotalCapital)} TON`);
  console.log(`Match: ${v2TotalCapital === v3TotalCapital ? '✅' : '❌'}`);
}
```

**V3 Vault Migration Function**:
```func
;; V3 MultiTrancheVault.fc
() credit_migration(slice depositor_addr, int tranche_id, int amount, int migration_nonce) impure {
  ;; Only callable by admin during migration period
  throw_unless(401, equal_slices(sender(), admin_address));
  throw_unless(402, migration_mode == 1);

  ;; Verify nonce (prevent double-migration)
  int nonce_hash = slice_hash(depositor_addr) + migration_nonce;
  (_, int found) = migration_nonces.udict_get?(256, nonce_hash);
  throw_if(403, found); ;; Already migrated

  ;; Credit depositor balance
  credit_depositor(depositor_addr, tranche_id, amount);

  ;; Mark nonce as used
  migration_nonces~udict_set(256, nonce_hash, 1);

  save_data();
}
```

#### 2.2 Migrate Active Policies

**V2 Policy State** (to extract):
```func
;; V2 PolicyFactory.fc storage
global cell active_policies; ;; Dict<policy_id:uint64, (user, coverage, expiry, params)>
```

**Policy Migration Strategy**:

**Option A: Leave V2 Policies on V2** (Recommended)
- V2 policies continue to mature/claim on V2
- After all V2 policies expire (max 365 days), deprecate V2
- Pros: No migration complexity, no risk of data loss
- Cons: Must maintain V2 for up to 1 year

**Option B: Migrate to V3 PolicyNFTs**
- Mint V3 PolicyNFTs for existing V2 policies
- Link V3 NFTs to V2 escrows (for claim processing)
- Pros: Unified user experience
- Cons: Complex, risk of bugs, requires thorough testing

**Recommended**: Option A (leave V2 policies on V2)

---

### Phase 3: Deprecation (Week 5-6)

**Goal**: Wind down V2 contracts after all active policies expire

#### 3.1 Pause V2 Policy Creation

```typescript
// Week 3: Disable new policies on V2
await v2Factory.sendPause(adminSender);

// Frontend: Remove V2 policy creation UI
```

#### 3.2 Monitor V2 Policy Expirations

```typescript
// scripts/monitorV2Policies.ts
export async function run(provider: NetworkProvider) {
  const v2Factory = provider.open(PolicyFactoryV2.createFromAddress(V2_FACTORY_ADDRESS));

  const activePolicies = await v2Factory.getActivePolicies();
  console.log(`Active V2 Policies: ${activePolicies.length}`);

  if (activePolicies.length === 0) {
    console.log('✅ All V2 policies expired, safe to deprecate');
  } else {
    const oldestExpiry = Math.max(...activePolicies.map(p => p.expiry));
    const daysUntilExpiry = Math.ceil((oldestExpiry - Date.now() / 1000) / 86400);
    console.log(`⏳ Oldest policy expires in ${daysUntilExpiry} days`);
  }
}
```

#### 3.3 Withdraw Remaining V2 Vault Funds

Once all V2 policies are expired/claimed:

```typescript
// Admin withdraws remaining capital from V2 vault
const v2VaultBalance = await v2Vault.getTotalCapital();
await v2Vault.sendAdminWithdraw(adminSender, {
  amount: v2VaultBalance,
  destination: V3_VAULT_ADDRESS
});
```

#### 3.4 Archive V2 Contracts

```typescript
// Mark V2 contracts as deprecated (on-chain metadata)
await v2Factory.sendSetDeprecated(adminSender, {
  deprecated: true,
  migrationTarget: V3_MASTER_FACTORY_ADDRESS
});

// Frontend: Show deprecation notice on V2 policy pages
```

---

## Salvaging V2 Components

### Reusable Contracts (Minimal Changes)

#### ParametricEscrow.fc (551 lines)
**Status**: High-quality, reusable with minor updates

**Changes Needed**:
```diff
- global slice policy_factory_address;
+ global slice master_factory_address;
+ global slice policy_nft_minter_address;

() create_escrow(...) impure {
-   ;; Send confirmation to PolicyFactory
-   send_internal_msg(policy_factory_address, ...);
+   ;; Send confirmation to MasterFactory
+   send_internal_msg(master_factory_address, ...);

+   ;; Mint PolicyNFT
+   send_internal_msg(policy_nft_minter_address, op::mint_policy_nft, ...);
}
```

**Estimated Effort**: 2-3 hours (update integrations, test)

#### MultiTrancheVault.fc (793 lines)
**Status**: Core logic solid, needs integration updates

**Changes Needed**:
```diff
- global slice policy_factory_address;
+ global slice master_factory_address;

() deposit_premium(...) impure {
+   ;; Add bounce handling
+   if (is_bounced(in_msg)) {
+     handle_bounced_deposit(in_msg);
+     return ();
+   }

    ;; Existing deposit logic...
}

+ () handle_bounced_deposit(slice in_msg) impure {
+   ;; Refund premium to user
+ }
```

**Estimated Effort**: 4-6 hours (add bounce handlers, shard-aware messaging)

#### PriceOracle.fc (412 lines)
**Status**: Oracle logic is solid, minor updates needed

**Changes Needed**:
```diff
() submit_price(...) impure {
+   ;; Add staleness check (30 min max)
+   throw_unless(405, (now() - timestamp) < 1800);

+   ;; Add deviation check (10% max from last price)
+   validate_price_deviation(price, last_price);

    ;; Existing oracle logic...
}
```

**Estimated Effort**: 2-3 hours

---

### Non-Reusable Contracts (Deprecated)

#### PolicyFactory.fc (181 lines)
**Reason**: Monolithic, replaced by 3-tier factory pattern

**Deprecated**: After V2 policy creation paused (Week 3)

#### PremiumCalculator.fc (247 lines)
**Reason**: Fixed APR calculation, replaced by library functions in V3 children

**Deprecated**: Not deployed in V3 (logic moved to asset children)

---

## Frontend Migration

### V2 Detection Pattern

```typescript
// frontend/src/utils/detectPolicyVersion.ts
export function detectPolicyVersion(policyAddress: Address): 'v2' | 'v3' {
  // V2 policies created by PolicyFactory (specific address)
  // V3 policies created by asset children (multiple addresses)

  // Check policy source address
  const sourceAddress = await getTransactionSource(policyAddress);

  if (sourceAddress.equals(V2_POLICY_FACTORY_ADDRESS)) {
    return 'v2';
  } else {
    return 'v3';
  }
}
```

### Dual-Version Policy Display

```typescript
// frontend/src/components/PolicyCard.tsx
export function PolicyCard({ policy }: { policy: Policy }) {
  const version = detectPolicyVersion(policy.address);

  return (
    <Card>
      <Badge color={version === 'v3' ? 'green' : 'gray'}>
        {version === 'v2' ? 'Legacy' : 'V3'}
      </Badge>

      <PolicyDetails policy={policy} />

      {version === 'v2' && (
        <Alert color="yellow">
          This is a V2 policy. New policies are created on V3 with lower gas costs.
        </Alert>
      )}

      <ClaimButton policy={policy} version={version} />
    </Card>
  );
}
```

### V2 Claim Handler

```typescript
// frontend/src/hooks/useClaim.ts
export function useClaim() {
  const claimV2 = async (policyId: bigint) => {
    const v2ClaimsEngine = useContract(V2_CLAIMS_ENGINE_ADDRESS);
    return v2ClaimsEngine.sendProcessClaim(policyId);
  };

  const claimV3 = async (policyId: bigint) => {
    // V3 claims are automatic via oracle trigger
    // User just needs to wait for oracle consensus
    const v3Oracle = useContract(V3_PRICE_ORACLE_ADDRESS);
    return v3Oracle.waitForTrigger(policyId);
  };

  return { claimV2, claimV3 };
}
```

---

## Database Migration

### V2 Schema (PostgreSQL)

```sql
-- V2 tables
CREATE TABLE policies_v2 (
  policy_id BIGINT PRIMARY KEY,
  user_address TEXT NOT NULL,
  product_type INT NOT NULL,
  coverage_amount BIGINT NOT NULL,
  premium BIGINT NOT NULL,
  duration_days INT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  expiry_at TIMESTAMP NOT NULL,
  claimed BOOLEAN DEFAULT FALSE
);

CREATE TABLE vault_positions_v2 (
  id SERIAL PRIMARY KEY,
  depositor_address TEXT NOT NULL,
  tranche_id INT NOT NULL,
  amount BIGINT NOT NULL,
  deposited_at TIMESTAMP NOT NULL
);
```

### V3 Schema (Extended)

```sql
-- V3 tables (new)
CREATE TABLE policies_v3 (
  policy_id BIGINT PRIMARY KEY,
  user_address TEXT NOT NULL,
  product_type INT NOT NULL,
  asset_id INT NOT NULL,  -- NEW: Asset-specific ID
  coverage_amount BIGINT NOT NULL,
  premium BIGINT NOT NULL,
  duration_days INT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  expiry_at TIMESTAMP NOT NULL,
  claimed BOOLEAN DEFAULT FALSE,
  policy_nft_address TEXT,  -- NEW: NFT address
  escrow_address TEXT,  -- NEW: Escrow contract address
  child_contract_address TEXT,  -- NEW: Asset child address
  shard_prefix TEXT  -- NEW: Track shard for analytics
);

CREATE TABLE vault_positions_v3 (
  id SERIAL PRIMARY KEY,
  depositor_address TEXT NOT NULL,
  tranche_id INT NOT NULL,
  amount BIGINT NOT NULL,
  deposited_at TIMESTAMP NOT NULL,
  migrated_from_v2 BOOLEAN DEFAULT FALSE,  -- NEW: Track migrations
  migration_nonce BIGINT  -- NEW: Prevent double-migration
);

-- Combined view (for frontend)
CREATE VIEW all_policies AS
  SELECT policy_id, user_address, product_type, NULL as asset_id, coverage_amount, premium, duration_days, created_at, expiry_at, claimed, 'v2' as version FROM policies_v2
  UNION ALL
  SELECT policy_id, user_address, product_type, asset_id, coverage_amount, premium, duration_days, created_at, expiry_at, claimed, 'v3' as version FROM policies_v3;
```

---

## Rollback Plan

**If V3 deployment fails catastrophically**:

### Step 1: Pause V3 Contracts
```typescript
await v3MasterFactory.sendPause(adminSender);
await v3Vault.sendPause(adminSender);
```

### Step 2: Revert Frontend to V2
```typescript
// frontend/.env
REACT_APP_POLICY_FACTORY_ADDRESS=0xV2_ADDRESS  # Revert to V2
REACT_APP_USE_V3=false  # Disable V3 features
```

### Step 3: Refund V3 Users
```typescript
// Refund all V3 policies that haven't matured
const v3Policies = await v3MasterFactory.getActivePolicies();

for (const policy of v3Policies) {
  await v3Escrow.sendRefund(adminSender, {
    policyId: policy.id,
    userAddress: policy.user,
    refundAmount: policy.premium
  });
}
```

### Step 4: Investigate Root Cause
- Analyze bounced message logs
- Review gas cost metrics (expected <0.045 TON, actual?)
- Check shard placement (contracts in correct shards?)
- Run postmortem (what went wrong, how to prevent)

---

## Testing Migration

### Migration Test Checklist

- [ ] **V2 Policies Continue**: Existing V2 policies can claim/expire
- [ ] **V3 Policy Creation**: New policies successfully created on V3
- [ ] **LP Position Migration**: All V2 LP positions credited in V3 vault
- [ ] **Vault Balance Match**: V3 total capital = V2 total capital
- [ ] **Frontend Compatibility**: UI shows both V2 and V3 policies correctly
- [ ] **Database Sync**: PostgreSQL accurately tracks V2 and V3 policies
- [ ] **Gas Costs**: V3 policies cost 20-30% less than V2 (0.040 vs 0.055 TON)
- [ ] **Rollback Test**: Can successfully revert to V2 if needed

### Testnet Migration Dry Run

```bash
# 1. Deploy V3 to testnet
npm run deploy:v3 -- --testnet

# 2. Create test V2 policies (100 policies)
npm run test:create-v2-policies -- --count 100

# 3. Run migration script
npm run migrate:vault-positions -- --testnet

# 4. Verify balances match
npm run verify:migration -- --testnet

# 5. Create V3 policies (100 policies)
npm run test:create-v3-policies -- --count 100

# 6. Compare gas costs
npm run analyze:gas-costs

# 7. Test rollback
npm run rollback:v3 -- --testnet
```

---

## Communication Plan

### User Notifications

**Week 1-2** (Parallel Operation):
- Email: "We've launched V3 with 20-30% lower gas costs!"
- In-app banner: "New policies now use V3 architecture"
- FAQ: "What's the difference between V2 and V3 policies?"

**Week 3-4** (Data Migration):
- Email: "We're migrating your LP positions to V3"
- In-app notification: "Your funds are safe, migration in progress"
- Live updates: "150/500 positions migrated (30%)"

**Week 5-6** (Deprecation):
- Email: "V2 policy creation disabled, please use V3"
- In-app modal: "Create new policies on V3 for lower fees"
- Documentation: "V2 policies will be honored until expiry (max 1 year)"

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **V3 Adoption Rate** | >90% of new policies | Week 2 onwards |
| **Migration Success** | 100% of LP positions | Week 4 |
| **Vault Balance Match** | Exact match (0 discrepancy) | Week 4 |
| **V2 Policy Expiry** | <1 year to 0 active policies | Ongoing |
| **Gas Cost Reduction** | 20-30% savings on V3 | Week 2 (analytics) |
| **User Complaints** | <1% of users | Ongoing (support tickets) |
| **Downtime** | 0 seconds | Throughout migration |

---

## Conclusion

V2 to V3 migration prioritizes **zero downtime** and **data integrity** over speed. By running V2 and V3 in parallel for 2 weeks, we ensure:
- Existing users are unaffected
- New users benefit from V3 immediately
- LP positions are safely migrated
- Rollback is possible at any stage

**Timeline**: 4-6 weeks (2 weeks parallel, 2 weeks migration, 2 weeks deprecation)

**Estimated Cost**: ~1-2 TON (migration scripts gas) + ~$50K-100K (external audit)

**Next Steps**: Deploy V3 to testnet, run migration dry run, collect feedback, refine process, deploy to mainnet.
