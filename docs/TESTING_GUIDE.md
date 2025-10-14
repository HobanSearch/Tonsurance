# Testing Guide - Phase 1-3 Core Insurance

## Overview

**Target**: 170+ tests across 17 contracts (95%+ coverage)
**Framework**: Jest + @ton/sandbox + @ton/test-utils
**Status**: 2 sample tests completed (PolicyFactory, PrimaryVault)

---

## Test Suite Structure

### Phase 1 Core (7 contracts)
1. ✅ **PolicyFactory.spec.ts** (17 tests) - Sample complete
2. ✅ **PrimaryVault.spec.ts** (16 tests) - Sample complete
3. ⏳ **SecondaryVault.spec.ts** (14 tests) - Pending
4. ⏳ **Treasury.spec.ts** (12 tests) - Pending
5. ⏳ **ClaimsProcessor.spec.ts** (22 tests) - Pending
6. ⏳ **SimplePremiumDistributor.spec.ts** (10 tests) - Pending
7. ⏳ **SUREToken.spec.ts** (12 tests) - Pending

### Phase 2 Multi-Party (6 contracts)
8. ⏳ **AdvancedPremiumDistributor.spec.ts** (14 tests)
9. ⏳ **ReferralManager.spec.ts** (16 tests)
10. ⏳ **ShieldLP.spec.ts** (12 tests)
11. ⏳ **ShieldStake.spec.ts** (14 tests)
12. ⏳ **OracleRewards.spec.ts** (12 tests)
13. ⏳ **GovernanceRewards.spec.ts** (12 tests)

### Phase 3 TradFi (4 contracts)
14. ⏳ **TradFiBuffer.spec.ts** (14 tests)
15. ⏳ **ComplianceGateway.spec.ts** (16 tests)
16. ⏳ **ShieldInst.spec.ts** (12 tests)
17. ⏳ **PriceOracle.spec.ts** (14 tests)

**Total**: ~210 tests (exceeds 170 target)

---

## Testing Pattern

### Standard Test Structure

```typescript
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { ContractName } from '../wrappers/ContractName';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ContractName', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('ContractName');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let contract: SandboxContract<ContractName>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        contract = blockchain.openContract(
            ContractName.createFromConfig(
                {
                    // Config params
                },
                code
            )
        );

        const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: contract.address,
            deploy: true,
            success: true,
        });
    });

    // Tests here
});
```

### Test Categories

#### 1. Deployment Tests
```typescript
it('should deploy successfully', async () => {
    // Tested in beforeEach
});

it('should have correct initial state', async () => {
    const value = await contract.getInitialValue();
    expect(value).toBe(expectedValue);
});
```

#### 2. Operation Tests (Send Methods)
```typescript
it('should execute operation successfully', async () => {
    const user = await blockchain.treasury('user');

    const result = await contract.sendOperation(user.getSender(), {
        value: toNano('0.1'),
        param1: value1,
        param2: value2,
    });

    expect(result.transactions).toHaveTransaction({
        from: user.address,
        to: contract.address,
        success: true,
    });
});
```

#### 3. Getter Tests
```typescript
it('should return correct data from getter', async () => {
    // Setup state
    await contract.sendOperation(...);

    // Query state
    const data = await contract.getData();

    expect(data.field1).toBe(expected1);
    expect(data.field2).toBe(expected2);
});
```

#### 4. Access Control Tests
```typescript
it('should allow owner to perform admin operation', async () => {
    const result = await contract.sendAdminOp(deployer.getSender(), {...});

    expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: contract.address,
        success: true,
    });
});

it('should reject admin operation from non-owner', async () => {
    const attacker = await blockchain.treasury('attacker');

    const result = await contract.sendAdminOp(attacker.getSender(), {...});

    expect(result.transactions).toHaveTransaction({
        from: attacker.address,
        to: contract.address,
        success: false,
        exitCode: 403, // Unauthorized
    });
});
```

#### 5. Edge Case Tests
```typescript
it('should handle zero value', async () => {
    const result = await contract.sendOperation(user.getSender(), {
        value: toNano('0.1'),
        amount: 0n,
    });

    expect(result.transactions).toHaveTransaction({
        success: false,
        exitCode: 400, // Bad request
    });
});

it('should handle overflow', async () => {
    const maxValue = 2n ** 256n - 1n;
    // Test behavior at limits
});
```

#### 6. Integration Tests
```typescript
it('should send message to another contract', async () => {
    const result = await contract.sendOperation(...);

    // Verify message sent to target contract
    expect(result.transactions).toHaveTransaction({
        from: contract.address,
        to: targetContract.address,
        success: true,
    });
});
```

---

## Test Requirements by Contract

### PolicyFactory (17 tests)
- ✅ Deployment
- ✅ Initial state
- ✅ Premium calculation (4 coverage types)
- ✅ Duration multipliers (30/90/180 days)
- ✅ Policy creation
- ✅ Policy data storage
- ✅ Sequential policy IDs
- ✅ Admin operations (set treasury, set oracle)
- ✅ Access control
- ✅ Multiple policies from multiple users
- ✅ Premium forwarding to treasury

### PrimaryVault (16 tests)
- ✅ Deployment
- ✅ Initial state
- ✅ LP capital deposit
- ✅ Balance tracking
- ✅ Exponential bonding curve
- ✅ LP capital withdrawal
- ✅ Premium share receipt
- ✅ Claim loss absorption (first-loss)
- ✅ Minimum deposit enforcement
- ✅ Vault stats calculation
- ✅ Multiple depositors
- ✅ Price at full capacity
- ✅ Yield distribution
- ✅ Liquidity (no lock period)

### SecondaryVault (14 tests)
- Deployment
- Initial state
- SURE token staking
- 90-day lock enforcement
- Linear bonding curve
- Unstaking after unlock
- Unstaking before unlock (should fail)
- Premium share receipt
- Claim loss absorption (second-loss)
- Minimum stake enforcement
- Multiple stakers
- Stake info retrieval
- Yield distribution
- Price calculation

### Treasury (12 tests)
- Deployment
- Premium receipt
- Premium forwarding to distributor
- Protocol share receipt
- Protocol share split (60% staking, 40% reserve)
- Reserve share receipt
- Payout processing
- Reserve balance tracking
- Emergency withdraw (owner only)
- Access control
- Treasury stats
- Balance tracking

### ClaimsProcessor (22 tests)
- Deployment
- Claim filing
- Auto-verification (USDT depeg)
- Auto-verification (protocol exploit)
- Auto-verification (bridge hack)
- Voting initiation
- Vote casting
- Voting power requirement (min 100 SURE)
- Vote finalization
- Claim approval (majority yes)
- Claim rejection (majority no)
- Claim status retrieval
- Vote counts retrieval
- Loss waterfall (Primary → Secondary → TradFi)
- Verified events management
- 72-hour voting period
- Duplicate vote prevention
- Multiple claims handling
- Access control (add verified event)
- Claim payout to user
- Stats tracking

### SimplePremiumDistributor (10 tests)
- Deployment
- Premium distribution (4 parties)
- Distribution percentages
- Message sending to Primary Vault
- Message sending to Secondary Vault
- Message sending to Protocol Treasury
- Message sending to Reserve Fund
- Stats tracking
- Access control (admin ops)
- Multiple distributions

### SUREToken (12 tests)
- Deployment (Jetton standard)
- Jetton data retrieval
- Wallet address calculation
- Token minting (admin only)
- Token burning
- Total supply tracking
- Mintable flag
- Access control (mint)
- Multiple wallet creation
- Transfer functionality
- Burn notification
- Supply limits

### AdvancedPremiumDistributor (14 tests)
- Deployment
- Premium distribution (8 parties)
- Distribution percentages
- All 8 async messages sent
- Message to Primary Vault (45%)
- Message to Secondary Vault (20%)
- Message to Referral Manager (10%)
- Message to Oracle Rewards (3%)
- Message to Protocol Treasury (7%)
- Message to Governance Rewards (2%)
- Message to Reserve Fund (3%)
- Message to TradFi Buffer (10%)
- Stats tracking
- Admin operations

### ReferralManager (16 tests)
- Deployment
- Referral registration
- Self-referral prevention
- Cycle prevention
- 5-level chain retrieval
- Chain length calculation
- Reward distribution (5 levels)
- Reward splits (60/25/10/3/2)
- Referrer stats tracking
- Direct referrer retrieval
- Multiple referral chains
- Total rewards tracking
- Missing chain handling
- Reward payments to all levels
- Stats per referrer
- Orphaned user handling

### ShieldLP (12 tests)
- Deployment (Jetton)
- Minting by Primary Vault only
- Burning by Primary Vault only
- Jetton data retrieval
- Wallet address calculation
- Total supply tracking
- Access control (vault only)
- Token transfers
- Multiple wallets
- Supply updates
- Vault address retrieval
- Mintable flag

### ShieldStake (14 tests)
- Deployment (Jetton)
- Minting with 90-day lock
- Burning after unlock
- Burning before unlock (should fail)
- Unlock time tracking
- Lock enforcement
- is_unlocked checker
- Access control (vault only)
- Multiple stakes
- Lock period constant
- Jetton data retrieval
- Wallet address calculation
- Transfer restrictions during lock
- Supply tracking

### OracleRewards (12 tests)
- Deployment
- Oracle registration
- Oracle update recording
- Reward calculation (base)
- Accuracy bonus (2x multiplier)
- Stale data penalty (-50%)
- Reward claiming
- Pending rewards tracking
- Oracle stats retrieval
- Fee distribution receipt
- Multiple oracles
- Rewards summary

### GovernanceRewards (12 tests)
- Deployment
- Voter registration
- Vote recording
- Reward calculation (scaled by voting power)
- Participation bonus (1.5x)
- Consensus bonus (+20%)
- Dissent penalty (-30%)
- Reward claiming
- Pending rewards tracking
- Voter stats retrieval
- Governance share receipt
- Multiple voters

### TradFiBuffer (14 tests)
- Deployment
- Institutional deposit ($250k+ min)
- KYC compliance check
- 180-day lock enforcement
- Withdrawal after unlock
- Withdrawal before unlock (should fail)
- Interest calculation (6-10% APY)
- APY range validation
- Premium share receipt
- Claim loss absorption (third-loss)
- Investor deposit retrieval
- Buffer stats
- Min deposit enforcement
- Multiple investors

### ComplianceGateway (16 tests)
- Deployment
- KYC application submission
- Tier validation (1/2/3)
- KYC approval (admin)
- KYC rejection (admin)
- Compliance revocation (admin)
- Compliance status retrieval
- is_compliant checker
- 1-year expiry enforcement
- Expired compliance handling
- Multi-admin system
- Admin management (add/remove)
- Compliance stats
- Access control
- Multiple applications
- Tier limits enforcement

### ShieldInst (12 tests)
- Deployment (Jetton)
- Minting with 180-day lock + KYC check
- Burning after unlock + KYC valid
- Transfer eligibility (both parties KYC'd)
- Transfer during lock (should fail)
- Transfer without KYC (should fail)
- Unlock time tracking
- Lock period constant
- Access control (buffer only)
- Compliance gateway integration
- Jetton data retrieval
- Multiple institutional investors

### PriceOracle (14 tests)
- Deployment
- Keeper registration
- Price update (single keeper)
- Price aggregation (median of 5)
- Staleness detection (>5 min)
- Price retrieval
- Latest price getter
- is_price_stale checker
- Keeper stats tracking
- Keeper deactivation
- Min oracle count enforcement
- Max price age setting
- Multiple assets (USDT, TON, BTC, ETH)
- Accuracy scoring

---

## Running Tests

### Compile Contracts
```bash
npm run build
```

### Run All Tests
```bash
npm test
```

### Run Single Test File
```bash
npx jest tests/PolicyFactory.spec.ts --verbose
```

### Run Tests in Watch Mode
```bash
npx jest --watch
```

### Generate Coverage Report
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### Run Tests for Specific Phase
```bash
# Phase 1
npx jest tests/PolicyFactory.spec.ts tests/PrimaryVault.spec.ts tests/SecondaryVault.spec.ts tests/Treasury.spec.ts tests/ClaimsProcessor.spec.ts tests/SimplePremiumDistributor.spec.ts tests/SUREToken.spec.ts

# Phase 2
npx jest tests/AdvancedPremiumDistributor.spec.ts tests/ReferralManager.spec.ts tests/ShieldLP.spec.ts tests/ShieldStake.spec.ts tests/OracleRewards.spec.ts tests/GovernanceRewards.spec.ts

# Phase 3
npx jest tests/TradFiBuffer.spec.ts tests/ComplianceGateway.spec.ts tests/ShieldInst.spec.ts tests/PriceOracle.spec.ts
```

---

## Coverage Targets

- **Overall**: 95%+
- **Statements**: 95%+
- **Branches**: 90%+
- **Functions**: 95%+
- **Lines**: 95%+

### Critical Paths (Must be 100%)
- Premium calculations
- Loss waterfall logic
- Access control checks
- Balance tracking
- Token minting/burning
- KYC compliance checks

---

## Common Test Utilities

### Creating Test Accounts
```typescript
const deployer = await blockchain.treasury('deployer');
const user1 = await blockchain.treasury('user1');
const user2 = await blockchain.treasury('user2');
```

### Asserting Transactions
```typescript
expect(result.transactions).toHaveTransaction({
    from: sender.address,
    to: receiver.address,
    success: true,
    // value: expectedValue,
    // exitCode: expectedCode,
});
```

### Time Manipulation
```typescript
// Fast-forward blockchain time
blockchain.now = blockchain.now!! + 86400; // +1 day
blockchain.now = blockchain.now!! + 7776000; // +90 days
```

### Gas Estimation
```typescript
const gasUsed = result.transactions.reduce((sum, tx) => sum + tx.totalFees.coins, 0n);
console.log(`Gas used: ${gasUsed}`);
```

---

## Next Steps

1. ✅ Complete remaining 15 test files (208 tests)
2. Run full test suite
3. Generate coverage report
4. Identify gaps <95%
5. Add tests for uncovered branches
6. Integration testing
7. E2E scenarios

---

## Sample Test Files

- ✅ **tests/PolicyFactory.spec.ts** - 17 tests complete
- ✅ **tests/PrimaryVault.spec.ts** - 16 tests complete

Follow these patterns for remaining 15 contracts.

---

**Status**: 2/17 test files complete (33 tests written, ~16% of target)
**Next**: Complete remaining test files following established patterns
