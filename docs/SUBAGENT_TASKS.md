# Tonsurance: Specialized Subagent Task Breakdown

**Version:** 1.0
**Last Updated:** October 2025
**Purpose:** Detailed task assignments for AI subagents
**Owner:** Engineering Team

---

## How to Use This Document

This document breaks down the Tonsurance development plan into **specialized subagent tasks**. Each subagent is an autonomous AI agent with specific expertise and a clear set of deliverables.

**Subagent Types:**
1. **Smart Contract Agent** - FunC contract development
2. **Frontend Agent** - React/TypeScript UI development
3. **Backend Agent** - Node.js API development
4. **Testing Agent** - Test writing and execution
5. **Documentation Agent** - Technical documentation

---

## Table of Contents

1. [Phase 1 Subagent Tasks](#phase-1-subagent-tasks)
2. [Phase 2 Subagent Tasks](#phase-2-subagent-tasks)
3. [Phase 3 Subagent Tasks](#phase-3-subagent-tasks)
4. [Coordination Guidelines](#coordination-guidelines)

---

# Phase 1 Subagent Tasks (Months 1-3)

## SUBAGENT-SC-001: Primary Vault Contract

**Agent Type:** Smart Contract Agent
**Priority:** P0
**Estimated Time:** 1 week
**Dependencies:** None

### Objective
Implement the Primary Vault contract for crypto-native LP deposits with first-loss tranche mechanism.

### Detailed Requirements

**Contract:** `contracts/primary_vault.fc`

**Storage Structure:**
```func
global cell lp_balances;           ;; Dict: address => lp_data
global int total_lp_capital;       ;; Total TON deposited
global int accumulated_yield;       ;; Unclaimed yield from premiums
global int losses_absorbed;         ;; Total losses taken
global slice distributor_address;   ;; Premium distributor contract
global slice claims_processor;      ;; Claims processor contract
global int vault_apy;               ;; Current APY (basis points)
```

**LP Data Structure:**
```func
cell lp_data = begin_cell()
    .store_coins(deposited_amount)      ;; Original deposit
    .store_uint(deposit_timestamp, 64)  ;; Entry time
    .store_coins(accumulated_yield)     ;; Unclaimed yield
    .store_coins(losses_taken)          ;; Losses absorbed pro-rata
    .end_cell();
```

### Function Specifications

#### 1. `deposit_lp_capital()`
```func
() deposit_lp_capital(slice depositor, int amount) impure {
    throw_unless(100, amount >= 1000000000);  ;; Min 1 TON

    load_data();

    ;; Get or create LP data
    (slice lp_data, int found) = lp_balances.udict_get?(267, depositor);

    int current_balance = 0;
    int current_yield = 0;
    int current_losses = 0;

    if (found) {
        current_balance = lp_data~load_coins();
        lp_data~load_uint(64);  ;; Skip timestamp
        current_yield = lp_data~load_coins();
        current_losses = lp_data~load_coins();
    }

    ;; Update balance
    current_balance += amount;
    total_lp_capital += amount;

    ;; Store updated data
    cell new_lp_data = begin_cell()
        .store_coins(current_balance)
        .store_uint(now(), 64)
        .store_coins(current_yield)
        .store_coins(current_losses)
        .end_cell();

    lp_balances~udict_set(267, depositor, new_lp_data.begin_parse());

    save_data();

    emit_log("LP_DEPOSIT", depositor, amount, current_balance);
}
```

**Test Cases:**
- ✅ First deposit creates new LP record
- ✅ Second deposit adds to existing balance
- ✅ Minimum deposit enforced (1 TON)
- ✅ Total vault capital updated correctly
- ✅ Event emitted

---

#### 2. `withdraw_lp_capital()`
```func
() withdraw_lp_capital(slice depositor, int amount) impure {
    load_data();

    (slice lp_data, int found) = lp_balances.udict_get?(267, depositor);
    throw_unless(101, found);  ;; LP not found

    int balance = lp_data~load_coins();
    int deposit_time = lp_data~load_uint(64);
    int yield = lp_data~load_coins();
    int losses = lp_data~load_coins();

    throw_unless(102, amount <= balance);  ;; Insufficient balance

    ;; Calculate available (balance - losses not yet realized)
    int available = balance - get_pending_losses(depositor);
    throw_unless(103, amount <= available);

    ;; Update balance
    balance -= amount;
    total_lp_capital -= amount;

    if (balance > 0) {
        cell updated_lp_data = begin_cell()
            .store_coins(balance)
            .store_uint(deposit_time, 64)
            .store_coins(yield)
            .store_coins(losses)
            .end_cell();

        lp_balances~udict_set(267, depositor, updated_lp_data.begin_parse());
    } else {
        ;; Remove LP if balance = 0
        lp_balances~udict_delete?(267, depositor);
    }

    save_data();

    ;; Transfer funds
    send_raw_message(begin_cell()
        .store_uint(0x18, 6)
        .store_slice(depositor)
        .store_coins(amount)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .end_cell(), 1);

    emit_log("LP_WITHDRAW", depositor, amount, balance);
}
```

**Test Cases:**
- ✅ Withdraw full balance removes LP
- ✅ Partial withdraw updates balance
- ✅ Cannot withdraw more than balance
- ✅ Cannot withdraw if pending losses
- ✅ Funds transferred correctly

---

#### 3. `receive_premium_share()`
```func
() receive_premium_share(int amount, int policy_id) impure {
    ;; Called by Premium Distributor
    throw_unless(104, equal_slices(sender(), distributor_address));

    load_data();

    accumulated_yield += amount;

    ;; Distribute to LPs pro-rata
    distribute_yield_to_lps(amount);

    save_data();

    emit_log("PREMIUM_RECEIVED", amount, policy_id);
}
```

**Test Cases:**
- ✅ Only distributor can call
- ✅ Yield accumulated correctly
- ✅ LPs receive pro-rata shares

---

#### 4. `absorb_claim_loss()`
```func
() absorb_claim_loss(int loss_amount, int claim_id) impure {
    ;; Called by Claims Processor
    throw_unless(105, equal_slices(sender(), claims_processor));

    load_data();

    throw_unless(106, total_lp_capital >= loss_amount);  ;; Insufficient capital

    ;; Distribute loss pro-rata to all LPs
    distribute_loss_to_lps(loss_amount);

    total_lp_capital -= loss_amount;
    losses_absorbed += loss_amount;

    save_data();

    emit_log("LOSS_ABSORBED", loss_amount, claim_id);
}
```

**Test Cases:**
- ✅ Only claims processor can call
- ✅ Loss distributed pro-rata
- ✅ Total capital reduced
- ✅ Vault balance updated

---

#### 5. `distribute_yield_to_lps()`
```func
() distribute_yield_to_lps(int yield_amount) impure {
    ;; Iterate all LPs and distribute pro-rata

    int key = -1;
    do {
        (key, slice lp_data, int found) = lp_balances.udict_get_next?(267, key);
        if (found) {
            int balance = lp_data~load_coins();
            int deposit_time = lp_data~load_uint(64);
            int current_yield = lp_data~load_coins();
            int losses = lp_data~load_coins();

            ;; Calculate share
            int share = muldiv(yield_amount, balance, total_lp_capital);
            current_yield += share;

            ;; Update LP data
            cell updated = begin_cell()
                .store_coins(balance)
                .store_uint(deposit_time, 64)
                .store_coins(current_yield)
                .store_coins(losses)
                .end_cell();

            lp_balances~udict_set(267, key, updated.begin_parse());
        }
    } until (~ found);
}
```

**Test Cases:**
- ✅ All LPs receive correct pro-rata share
- ✅ Total yield distributed = input amount
- ✅ Works with 1 LP, 100 LPs, 1000 LPs

---

#### 6. Get Methods
```func
(int, int, int, int) get_lp_info(slice lp_addr) method_id {
    (slice lp_data, int found) = lp_balances.udict_get?(267, lp_addr);
    if (~ found) {
        return (0, 0, 0, 0);
    }

    int balance = lp_data~load_coins();
    int deposit_time = lp_data~load_uint(64);
    int yield = lp_data~load_coins();
    int losses = lp_data~load_coins();

    return (balance, deposit_time, yield, losses);
}

(int, int, int) get_vault_stats() method_id {
    return (total_lp_capital, accumulated_yield, losses_absorbed);
}

int get_vault_apy() method_id {
    ;; Calculate APY based on last 30 days yield
    ;; APY = (yield / capital) * (365 / days) * 100

    if (total_lp_capital == 0) { return 0; }

    int days = 30;
    int recent_yield = get_recent_yield(days);

    int apy = muldiv(recent_yield, 36500, total_lp_capital * days);

    return apy;  ;; Returns basis points (e.g., 2500 = 25%)
}
```

---

### Deliverables

**Code:**
- [ ] `contracts/primary_vault.fc` (complete implementation)
- [ ] `wrappers/PrimaryVault.ts` (TypeScript wrapper)
- [ ] `wrappers/PrimaryVault.compile.ts` (compilation config)

**Tests:**
- [ ] `tests/PrimaryVault.spec.ts` (20+ test cases)

**Documentation:**
- [ ] Inline code comments
- [ ] Function documentation
- [ ] Storage layout diagram

### Acceptance Criteria
- [ ] All functions implemented
- [ ] All tests passing (100% coverage)
- [ ] Gas usage optimized (<0.1 TON per deposit)
- [ ] Code reviewed by senior engineer
- [ ] No linter warnings

---

## SUBAGENT-SC-002: Secondary Vault Contract

**Agent Type:** Smart Contract Agent
**Priority:** P0
**Estimated Time:** 1 week
**Dependencies:** SUBAGENT-SC-001 (similar structure)

### Objective
Implement Secondary Vault for SURE token staking with 90-day lock-up and second-loss tranche.

### Detailed Requirements

**Contract:** `contracts/secondary_vault.fc`

**Key Differences from Primary:**
- Accepts SURE tokens (not TON)
- 90-day lock-up period
- Second-loss tranche (only absorbs losses if Primary exhausted)
- Lower APY (12-18% vs 25-35%)

### Function Specifications

#### 1. `stake_sure()`
```func
() stake_sure(slice staker, int amount, int lock_days) impure {
    throw_unless(200, amount >= 100000000000);  ;; Min 100 SURE
    throw_unless(201, (lock_days == 90) | (lock_days == 180));

    load_data();

    ;; Transfer SURE from user (Jetton transfer)
    transfer_jetton_from_user(staker, amount);

    ;; Create stake record
    int unlock_time = now() + (lock_days * 86400);

    cell stake_data = begin_cell()
        .store_coins(amount)
        .store_uint(now(), 64)
        .store_uint(unlock_time, 64)
        .store_coins(0)  ;; Initial yield
        .store_uint(get_lock_multiplier(lock_days), 16)  ;; 90d=1x, 180d=1.2x
        .end_cell();

    staker_data~udict_set(267, staker, stake_data.begin_parse());

    total_staked_sure += amount;

    save_data();

    emit_log("SURE_STAKED", staker, amount, unlock_time);
}
```

**Test Cases:**
- ✅ Minimum stake enforced
- ✅ Lock period validated
- ✅ Unlock time calculated correctly
- ✅ SURE tokens transferred
- ✅ Multiplier applied for longer locks

---

#### 2. `unstake_sure()`
```func
() unstake_sure(slice staker) impure {
    load_data();

    (slice stake_data, int found) = staker_data.udict_get?(267, staker);
    throw_unless(202, found);

    int amount = stake_data~load_coins();
    int stake_time = stake_data~load_uint(64);
    int unlock_time = stake_data~load_uint(64);
    int yield = stake_data~load_coins();

    throw_unless(203, now() >= unlock_time);  ;; Still locked

    ;; Calculate total return
    int total_return = amount + yield;

    ;; Remove stake
    staker_data~udict_delete?(267, staker);
    total_staked_sure -= amount;

    save_data();

    ;; Transfer SURE back
    transfer_jetton_to_user(staker, total_return);

    emit_log("SURE_UNSTAKED", staker, total_return);
}
```

**Test Cases:**
- ✅ Cannot unstake before unlock
- ✅ Can unstake after unlock
- ✅ Yield included in return
- ✅ Stake removed from dict
- ✅ SURE transferred back

---

#### 3. `absorb_loss_if_needed()`
```func
() absorb_loss_if_needed(int loss_amount, int claim_id) impure {
    ;; Called by Claims Processor ONLY if Primary Vault exhausted
    throw_unless(204, equal_slices(sender(), claims_processor));

    load_data();

    ;; Check if we have capacity
    int vault_value = calculate_vault_value();  ;; SURE in TON value
    throw_unless(205, vault_value >= loss_amount);

    ;; Distribute loss pro-rata to stakers
    distribute_loss_to_stakers(loss_amount);

    save_data();

    emit_log("SECONDARY_LOSS_ABSORBED", loss_amount, claim_id);
}
```

**Test Cases:**
- ✅ Only called if Primary exhausted
- ✅ Loss distributed pro-rata
- ✅ Vault value reduced
- ✅ All stakers impacted equally

---

### Deliverables

**Code:**
- [ ] `contracts/secondary_vault.fc`
- [ ] `wrappers/SecondaryVault.ts`
- [ ] `wrappers/SecondaryVault.compile.ts`

**Tests:**
- [ ] `tests/SecondaryVault.spec.ts` (20+ test cases)

**Documentation:**
- [ ] Lock-up mechanism explained
- [ ] Second-loss tranche logic

### Acceptance Criteria
- [ ] All functions implemented
- [ ] All tests passing
- [ ] Lock-up enforced correctly
- [ ] Loss cascade works with Primary
- [ ] Code reviewed

---

## SUBAGENT-SC-003: Simple Premium Distributor

**Agent Type:** Smart Contract Agent
**Priority:** P0
**Estimated Time:** 3 days
**Dependencies:** SUBAGENT-SC-001, SUBAGENT-SC-002

### Objective
Implement premium distribution contract that splits premiums to 4 parties (Phase 1 version).

### Detailed Requirements

**Contract:** `contracts/simple_premium_distributor.fc`

**Recipients (Phase 1):**
1. Primary Vault: 50%
2. Secondary Vault: 30%
3. Protocol Treasury: 15%
4. Reserve Fund: 5%

### Function Specifications

#### 1. `distribute_premium()`
```func
() distribute_premium(int premium_amount, int policy_id) impure {
    load_data();

    ;; Calculate shares
    int primary_share = premium_amount * 50 / 100;
    int secondary_share = premium_amount * 30 / 100;
    int protocol_share = premium_amount * 15 / 100;
    int reserve_share = premium_amount * 5 / 100;

    ;; Send 4 async messages (parallel execution)

    ;; 1. Primary Vault
    send_raw_message(begin_cell()
        .store_uint(0x18, 6)
        .store_slice(primary_vault_addr)
        .store_coins(primary_share)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::receive_premium_share, 32)
        .store_coins(premium_amount)  ;; Original amount for reference
        .store_uint(policy_id, 64)
        .end_cell(), 1);  ;; Mode 1: ignore errors, pay fees separately

    ;; 2. Secondary Vault
    send_raw_message(begin_cell()
        .store_uint(0x18, 6)
        .store_slice(secondary_vault_addr)
        .store_coins(secondary_share)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::receive_premium_share, 32)
        .store_uint(policy_id, 64)
        .end_cell(), 1);

    ;; 3. Protocol Treasury
    send_raw_message(begin_cell()
        .store_uint(0x18, 6)
        .store_slice(protocol_treasury_addr)
        .store_coins(protocol_share)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::protocol_revenue, 32)
        .store_uint(policy_id, 64)
        .end_cell(), 1);

    ;; 4. Reserve Fund
    send_raw_message(begin_cell()
        .store_uint(0x18, 6)
        .store_slice(reserve_fund_addr)
        .store_coins(reserve_share)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::reserve_contribution, 32)
        .store_uint(policy_id, 64)
        .end_cell(), 1);

    emit_log("PREMIUM_DISTRIBUTED", premium_amount, policy_id);
}
```

**Test Cases:**
- ✅ Correct split percentages
- ✅ All 4 messages sent
- ✅ Messages executed in parallel (async)
- ✅ Total = 100% of premium
- ✅ Gas cost < 0.05 TON

---

### Deliverables

**Code:**
- [ ] `contracts/simple_premium_distributor.fc`
- [ ] `wrappers/SimplePremiumDistributor.ts`

**Tests:**
- [ ] `tests/SimplePremiumDistributor.spec.ts`
- [ ] Integration test with vaults

### Acceptance Criteria
- [ ] All recipients receive correct amount
- [ ] Messages sent asynchronously
- [ ] Gas optimized
- [ ] Works with PolicyFactory

---

## SUBAGENT-FE-001: Vault Dashboard UI

**Agent Type:** Frontend Agent
**Priority:** P1
**Estimated Time:** 1 week
**Dependencies:** SUBAGENT-SC-001, SUBAGENT-SC-002

### Objective
Create React components for Primary and Secondary vault displays with deposit/withdraw functionality.

### Detailed Requirements

**Location:** `frontend/src/features/vaults/`

**Components to Create:**
1. `VaultDashboard.tsx` - Main vault overview
2. `VaultCard.tsx` - Individual vault display
3. `DepositModal.tsx` - Deposit flow
4. `WithdrawModal.tsx` - Withdrawal flow
5. `VaultStats.tsx` - Statistics component

### Component Specifications

#### 1. VaultDashboard.tsx
```typescript
import { useVaults } from '@/shared/hooks/useVaults';
import { VaultCard } from './VaultCard';

export function VaultDashboard() {
  const { primaryVault, secondaryVault, loading, error } = useVaults();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Liquidity Vaults</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <VaultCard
          vault={primaryVault}
          type="primary"
          onDeposit={() => setShowDepositModal(true)}
          onWithdraw={() => setShowWithdrawModal(true)}
        />

        <VaultCard
          vault={secondaryVault}
          type="secondary"
          onDeposit={() => setShowStakeModal(true)}
          onWithdraw={() => setShowUnstakeModal(true)}
        />
      </div>

      <VaultStats
        totalTVL={primaryVault.tvl + secondaryVault.tvl}
        yourTotalDeposit={primaryVault.userBalance + secondaryVault.userBalance}
        combinedAPY={calculateCombinedAPY()}
      />
    </div>
  );
}
```

**UI Requirements:**
- Responsive grid (2 columns desktop, 1 column mobile)
- Loading states
- Error handling
- Real-time TVL updates

---

#### 2. VaultCard.tsx
```typescript
interface VaultCardProps {
  vault: {
    name: string;
    tvl: number;
    apy: number;
    userBalance: number;
    userYield: number;
    tier: 'primary' | 'secondary';
  };
  type: 'primary' | 'secondary';
  onDeposit: () => void;
  onWithdraw: () => void;
}

export function VaultCard({ vault, type, onDeposit, onWithdraw }: VaultCardProps) {
  const isPrimary = type === 'primary';

  return (
    <Card className={`p-6 ${isPrimary ? 'border-blue-500' : 'border-purple-500'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{vault.name}</h2>
        <Badge variant={isPrimary ? 'blue' : 'purple'}>
          {isPrimary ? 'First Loss' : 'Second Loss'}
        </Badge>
      </div>

      {/* Stats */}
      <div className="space-y-3 mb-6">
        <StatRow label="TVL" value={formatCurrency(vault.tvl)} />
        <StatRow label="APY" value={`${vault.apy}%`} highlight />
        <StatRow label="Your Deposit" value={formatCurrency(vault.userBalance)} />
        <StatRow label="Your Yield" value={formatCurrency(vault.userYield)} />
      </div>

      {/* Features */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Features:</h3>
        <ul className="space-y-1 text-sm text-gray-600">
          {isPrimary ? (
            <>
              <li>✓ Highest APY (25-35%)</li>
              <li>✓ Liquid (no lock-up)</li>
              <li>✗ First-loss exposure</li>
            </>
          ) : (
            <>
              <li>✓ Medium APY (12-18%)</li>
              <li>✓ Stake SURE tokens</li>
              <li>✗ 90-day lock-up</li>
            </>
          )}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={onDeposit}
          className="flex-1"
          variant="primary"
        >
          {isPrimary ? 'Deposit TON' : 'Stake SURE'}
        </Button>

        <Button
          onClick={onWithdraw}
          className="flex-1"
          variant="outline"
          disabled={vault.userBalance === 0}
        >
          Withdraw
        </Button>
      </div>
    </Card>
  );
}
```

**UI Requirements:**
- Color-coded by tier (blue = primary, purple = secondary)
- Clear stat display
- Disabled states for zero balance
- Responsive layout

---

#### 3. DepositModal.tsx
```typescript
interface DepositModalProps {
  vaultType: 'primary' | 'secondary';
  isOpen: boolean;
  onClose: () => void;
}

export function DepositModal({ vaultType, isOpen, onClose }: DepositModalProps) {
  const [amount, setAmount] = useState('');
  const [lockPeriod, setLockPeriod] = useState(90); // For secondary only
  const { deposit, loading, error } = useVaultDeposit(vaultType);
  const { balance } = useWallet();

  const handleDeposit = async () => {
    try {
      await deposit(parseFloat(amount), lockPeriod);
      onClose();
      toast.success('Deposit successful!');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">
        {vaultType === 'primary' ? 'Deposit TON' : 'Stake SURE'}
      </h2>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Amount</label>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={vaultType === 'primary' ? '1.0 TON' : '100 SURE'}
        />
        <p className="text-sm text-gray-500 mt-1">
          Balance: {formatNumber(balance)} {vaultType === 'primary' ? 'TON' : 'SURE'}
        </p>
      </div>

      {/* Lock Period (Secondary only) */}
      {vaultType === 'secondary' && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Lock Period</label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={lockPeriod === 90 ? 'primary' : 'outline'}
              onClick={() => setLockPeriod(90)}
            >
              90 days (1.0x)
            </Button>
            <Button
              variant={lockPeriod === 180 ? 'primary' : 'outline'}
              onClick={() => setLockPeriod(180)}
            >
              180 days (1.2x)
            </Button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <h3 className="font-medium mb-2">Deposit Summary</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Amount:</span>
            <span className="font-medium">{amount || '0'} {vaultType === 'primary' ? 'TON' : 'SURE'}</span>
          </div>
          {vaultType === 'secondary' && (
            <div className="flex justify-between">
              <span>Lock Period:</span>
              <span className="font-medium">{lockPeriod} days</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Expected APY:</span>
            <span className="font-medium text-green-600">
              {vaultType === 'primary' ? '~30%' : '~15%'}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleDeposit}
          disabled={!amount || parseFloat(amount) <= 0 || loading}
          className="flex-1"
        >
          {loading ? 'Processing...' : 'Confirm Deposit'}
        </Button>
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
      </div>

      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </Modal>
  );
}
```

**Features:**
- Amount validation
- Balance check
- Lock period selector (secondary only)
- Summary preview
- Loading states
- Error handling

---

#### 4. useVaultDeposit Hook
```typescript
// frontend/src/features/vaults/hooks/useVaultDeposit.ts

import { useTonConnect } from '@/shared/hooks/useTonConnect';
import { Address, beginCell, toNano } from '@ton/core';

export function useVaultDeposit(vaultType: 'primary' | 'secondary') {
  const { tonConnectUI } = useTonConnect();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = async (amount: number, lockPeriod?: number) => {
    setLoading(true);
    setError(null);

    try {
      const vaultAddress = vaultType === 'primary'
        ? process.env.VITE_PRIMARY_VAULT_ADDRESS
        : process.env.VITE_SECONDARY_VAULT_ADDRESS;

      if (vaultType === 'primary') {
        // Primary: Send TON
        const tx = {
          validUntil: Math.floor(Date.now() / 1000) + 600,
          messages: [
            {
              address: vaultAddress,
              amount: toNano(amount).toString(),
              payload: beginCell()
                .storeUint(1, 32) // op: deposit_lp_capital
                .endCell()
                .toBoc()
                .toString('base64'),
            },
          ],
        };

        await tonConnectUI.sendTransaction(tx);
      } else {
        // Secondary: Transfer SURE tokens + stake
        const sureTokenAddress = process.env.VITE_SURE_TOKEN_ADDRESS;

        // First, approve transfer
        // Then call stake_sure
        // (Jetton transfer implementation)

        const tx = {
          validUntil: Math.floor(Date.now() / 1000) + 600,
          messages: [
            {
              address: sureTokenAddress,
              amount: toNano('0.1').toString(), // Gas
              payload: beginCell()
                .storeUint(0xf8a7ea5, 32) // Jetton transfer op
                .storeUint(0, 64) // query_id
                .storeCoins(toNano(amount))
                .storeAddress(Address.parse(vaultAddress))
                .storeAddress(Address.parse(vaultAddress)) // response_destination
                .storeBit(0) // custom_payload
                .storeCoins(toNano('0.05'))
                .storeBit(1) // forward_payload
                .storeRef(
                  beginCell()
                    .storeUint(2, 32) // op: stake_sure
                    .storeUint(lockPeriod || 90, 16)
                    .endCell()
                )
                .endCell()
                .toBoc()
                .toString('base64'),
            },
          ],
        };

        await tonConnectUI.sendTransaction(tx);
      }

      // Wait for confirmation
      await new Promise((resolve) => setTimeout(resolve, 5000));

      return { success: true };
    } catch (err: any) {
      setError(err.message || 'Deposit failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deposit, loading, error };
}
```

---

### Deliverables

**Components:**
- [ ] VaultDashboard.tsx
- [ ] VaultCard.tsx
- [ ] DepositModal.tsx
- [ ] WithdrawModal.tsx
- [ ] VaultStats.tsx

**Hooks:**
- [ ] useVaults.ts
- [ ] useVaultDeposit.ts
- [ ] useVaultWithdraw.ts

**Tests:**
- [ ] Component tests (Jest + Testing Library)
- [ ] Hook tests
- [ ] E2E tests (Playwright)

### Acceptance Criteria
- [ ] All components render correctly
- [ ] Deposit flow works end-to-end
- [ ] Withdrawal flow works
- [ ] Real-time stats update
- [ ] Responsive on mobile
- [ ] Error states handled
- [ ] Loading states shown
- [ ] 90%+ test coverage

---

## SUBAGENT-TEST-001: Phase 1 Integration Tests

**Agent Type:** Testing Agent
**Priority:** P0
**Estimated Time:** 1 week
**Dependencies:** All Phase 1 contracts + frontend

### Objective
Write comprehensive integration tests for entire Phase 1 system.

### Test Scenarios

#### Scenario 1: End-to-End Policy Purchase
```typescript
describe('Policy Purchase Flow', () => {
  it('should complete full flow: deposit → purchase → premium distribution', async () => {
    // 1. User deposits to Primary Vault
    const depositTx = await primaryVault.deposit(
      user.getSender(),
      toNano('100')
    );
    expect(depositTx.transactions).toHaveTransaction({ success: true });

    // 2. Check vault balance
    const vaultBalance = await primaryVault.getVaultStats();
    expect(vaultBalance.total).toBe(toNano('100'));

    // 3. User buys policy (10 TON premium)
    const policyTx = await policyFactory.createPolicy(
      user.getSender(),
      {
        coverageType: 1,
        coverageAmount: toNano('500'),
        durationDays: 90,
      },
      toNano('10')  // Premium
    );
    expect(policyTx.transactions).toHaveTransaction({ success: true });

    // 4. Verify premium distributed
    await blockchain.tick();  // Process async messages

    // Primary Vault should receive 50% = 5 TON
    const primaryYield = await primaryVault.getAccumulatedYield();
    expect(primaryYield).toBeCloseTo(toNano('5'), 2);

    // Secondary Vault should receive 30% = 3 TON
    const secondaryYield = await secondaryVault.getAccumulatedYield();
    expect(secondaryYield).toBeCloseTo(toNano('3'), 2);

    // Protocol should receive 15% = 1.5 TON
    const protocolBalance = await treasury.getBalance();
    expect(protocolBalance).toBeCloseTo(toNano('1.5'), 2);

    // Reserve should receive 5% = 0.5 TON
    const reserveBalance = await reserveFund.getBalance();
    expect(reserveBalance).toBeCloseTo(toNano('0.5'), 2);
  });
});
```

---

#### Scenario 2: Loss Waterfall
```typescript
describe('Loss Waterfall', () => {
  beforeEach(async () => {
    // Setup: Primary has 100 TON, Secondary has 150 TON
    await primaryVault.deposit(lp1.getSender(), toNano('100'));
    await secondaryVault.stake(staker1.getSender(), toNano('150'));
  });

  it('should absorb small loss from Primary only', async () => {
    // Claim: 50 TON (< Primary capacity)
    const claimTx = await claimsProcessor.processClaim(
      claimId,
      toNano('50')
    );

    await blockchain.tick();

    // Primary should take loss
    const primaryBalance = await primaryVault.getTotalCapital();
    expect(primaryBalance).toBe(toNano('50'));  // 100 - 50

    // Secondary should be untouched
    const secondaryBalance = await secondaryVault.getTotalCapital();
    expect(secondaryBalance).toBe(toNano('150'));  // Unchanged
  });

  it('should cascade to Secondary if Primary exhausted', async () => {
    // Claim: 120 TON (> Primary capacity)
    const claimTx = await claimsProcessor.processClaim(
      claimId,
      toNano('120')
    );

    await blockchain.tick();

    // Primary should be exhausted
    const primaryBalance = await primaryVault.getTotalCapital();
    expect(primaryBalance).toBe(toNano('0'));

    // Secondary should absorb remaining 20 TON
    const secondaryBalance = await secondaryVault.getTotalCapital();
    expect(secondaryBalance).toBe(toNano('130'));  // 150 - 20
  });

  it('should fail if total capital insufficient', async () => {
    // Claim: 300 TON (> Primary + Secondary)
    const claimTx = await claimsProcessor.processClaim(
      claimId,
      toNano('300')
    );

    // Should fail with insufficient capital error
    expect(claimTx.transactions).toHaveTransaction({
      success: false,
      exitCode: 106,  // Insufficient capital
    });
  });
});
```

---

#### Scenario 3: Concurrent Operations
```typescript
describe('Concurrent Operations', () => {
  it('should handle 100 simultaneous deposits', async () => {
    const deposits = Array.from({ length: 100 }, (_, i) =>
      primaryVault.deposit(
        users[i].getSender(),
        toNano(Math.random() * 10 + 1)  // Random 1-10 TON
      )
    );

    const results = await Promise.all(deposits);

    // All should succeed
    results.forEach((tx) => {
      expect(tx.transactions).toHaveTransaction({ success: true });
    });

    // Total vault balance should match sum
    const expectedTotal = deposits.reduce((sum, _, i) =>
      sum + (Math.random() * 10 + 1), 0
    );

    const vaultTotal = await primaryVault.getTotalCapital();
    expect(vaultTotal).toBeCloseTo(toNano(expectedTotal), 1);
  });
});
```

---

### Deliverables

**Test Files:**
- [ ] `tests/integration/PolicyPurchaseFlow.spec.ts`
- [ ] `tests/integration/LossWaterfall.spec.ts`
- [ ] `tests/integration/VaultOperations.spec.ts`
- [ ] `tests/integration/PremiumDistribution.spec.ts`
- [ ] `tests/load/ConcurrentOperations.spec.ts`

**Documentation:**
- [ ] Test scenarios document
- [ ] Coverage report
- [ ] Performance benchmarks

### Acceptance Criteria
- [ ] 100+ integration test cases
- [ ] 90%+ code coverage
- [ ] All tests passing
- [ ] Load tests (1000+ concurrent ops)
- [ ] Performance report generated

---

## SUBAGENT-DOC-001: Phase 1 Documentation

**Agent Type:** Documentation Agent
**Priority:** P1
**Estimated Time:** 3 days
**Dependencies:** All Phase 1 contracts complete

### Objective
Create comprehensive documentation for Phase 1 contracts and architecture.

### Deliverables

#### 1. Contract Documentation
**File:** `docs/contracts/PRIMARY_VAULT.md`

```markdown
# Primary Vault Contract

## Overview
The Primary Vault is the first-loss tranche collateral vault for crypto-native liquidity providers.

## Key Features
- Liquid deposits/withdrawals (no lock-up)
- Highest APY (25-35%)
- First to absorb claim losses
- Issues SHIELD-LP tokens (Phase 2)

## Contract Address
Mainnet: `EQD...`
Testnet: `EQD...`

## Functions

### deposit_lp_capital()
**Description:** Deposit TON to become LP

**Parameters:**
- `depositor: slice` - LP address
- `amount: int` - Amount in nanotons

**Minimum:** 1 TON

**Returns:** None (emits LP_DEPOSIT event)

**Example:**
```typescript
const tx = await primaryVault.send(
  user.getSender(),
  { value: toNano('100') },
  { $$type: 'DepositLPCapital' }
);
```

...
```

**Create docs for:**
- [ ] Primary Vault
- [ ] Secondary Vault
- [ ] Simple Premium Distributor
- [ ] PolicyFactory (updated)
- [ ] ClaimsProcessor (updated)

---

#### 2. Architecture Diagrams
**File:** `docs/architecture/PHASE1_ARCHITECTURE.md`

Include:
- System diagram
- Data flow diagram
- Message flow diagram
- Loss waterfall diagram

---

#### 3. Developer Guide
**File:** `docs/DEVELOPER_GUIDE.md`

Sections:
1. Getting Started
2. Local Development Setup
3. Running Tests
4. Deploying Contracts
5. Frontend Development
6. Integration Guide

---

### Acceptance Criteria
- [ ] All contracts documented
- [ ] Architecture diagrams created
- [ ] Developer guide complete
- [ ] API reference generated
- [ ] Examples included
- [ ] Reviewed by team

---

# Phase 2 Subagent Tasks (Months 4-6)

## SUBAGENT-SC-004: Advanced Premium Distributor

**Agent Type:** Smart Contract Agent
**Priority:** P0
**Estimated Time:** 2 weeks
**Dependencies:** Phase 1 complete

### Objective
Upgrade Simple Distributor to support 8-party distribution with referrals, oracles, and governance rewards.

### Function Specifications

#### 1. `distribute_premium()` (Full Version)
```func
() distribute_premium(
    int premium_amount,
    slice referrer_addr,  ;; Can be null
    int policy_id
) impure {
    load_data();

    ;; Calculate shares (basis points)
    int primary_share = muldiv(premium_amount, SHARE_PRIMARY_LPS, 10000);          // 45%
    int secondary_share = muldiv(premium_amount, SHARE_SECONDARY_STAKE, 10000);    // 20%
    int tradfi_share = muldiv(premium_amount, SHARE_TRADFI_BUFFER, 10000);         // 10% (saved for Phase 3)
    int oracle_share = muldiv(premium_amount, SHARE_ORACLE, 10000);                // 3%
    int protocol_share = muldiv(premium_amount, SHARE_PROTOCOL, 10000);            // 7%
    int governance_share = muldiv(premium_amount, SHARE_GOVERNANCE, 10000);        // 2%
    int reserve_share = muldiv(premium_amount, SHARE_RESERVE, 10000);              // 3%

    int referrer_share = 0;
    int has_referrer = ~ is_null(referrer_addr);
    if (has_referrer) {
        referrer_share = muldiv(premium_amount, SHARE_REFERRER, 10000);  // 10%
    }

    ;; Send 8 async messages in parallel
    ;; (See Advanced Architecture doc for full implementation)

    send_to_primary_vault(primary_share, policy_id);
    send_to_secondary_vault(secondary_share, policy_id);
    ;; TradFi share saved to reserve for Phase 3
    send_to_reserve(tradfi_share + reserve_share, policy_id);

    if (has_referrer) {
        send_to_referrer(referrer_addr, referrer_share, policy_id);
    }

    send_to_oracle(oracle_share, policy_id);
    send_to_protocol(protocol_share, policy_id);
    send_to_governance(governance_share, policy_id);

    emit_log("PREMIUM_DISTRIBUTED_FULL", premium_amount, policy_id);
}
```

**Test Cases:**
- ✅ All 8 parties receive correct share
- ✅ Referrer optional (works with/without)
- ✅ Total = 100%
- ✅ Messages sent in parallel
- ✅ Gas cost < 0.15 TON

---

### Deliverables
- [ ] `contracts/advanced_premium_distributor.fc`
- [ ] Migration from Simple Distributor
- [ ] Tests (30+ cases)
- [ ] Gas optimization report

---

## SUBAGENT-SC-005: Referral Chain Manager

**Agent Type:** Smart Contract Agent
**Priority:** P0
**Estimated Time:** 1 week
**Dependencies:** SUBAGENT-SC-004

### Objective
Track referral chains (up to 5 levels) and distribute rewards proportionally.

### Detailed Requirements

**Contract:** `contracts/referral_manager.fc`

### Function Specifications

#### 1. `register_referral()`
```func
() register_referral(slice user_addr, slice referrer_addr) impure {
    load_data();

    ;; Check user not already registered
    (slice existing, int found) = referral_chains.udict_get?(267, user_addr);
    throw_if(300, found);  ;; Already registered

    ;; Check referrer exists (or is root)
    int is_root_referrer = is_root(referrer_addr);
    if (~ is_root_referrer) {
        (slice ref_chain, int ref_found) = referral_chains.udict_get?(267, referrer_addr);
        throw_unless(301, ref_found);  ;; Referrer not registered
    }

    ;; Build referral chain (max 5 levels)
    cell chain = build_referral_chain(referrer_addr, 5);

    referral_chains~udict_set(267, user_addr, chain.begin_parse());

    save_data();

    emit_log("REFERRAL_REGISTERED", user_addr, referrer_addr);
}
```

**Test Cases:**
- ✅ User can be referred once only
- ✅ Referrer must exist
- ✅ Chain built correctly (5 levels max)
- ✅ Circular references prevented

---

#### 2. `distribute_referral_rewards()`
```func
() distribute_referral_rewards(int total_amount, slice user_addr) impure {
    load_data();

    (slice chain, int found) = referral_chains.udict_get?(267, user_addr);
    if (~ found) { return (); }  ;; No referrers

    ;; Parse chain and distribute
    ;; Level 1 (direct): 60%
    ;; Level 2: 25%
    ;; Level 3: 10%
    ;; Level 4: 3%
    ;; Level 5: 2%

    int level = 0;
    while (~ chain.slice_empty?()) {
        slice referrer = chain~load_msg_addr();

        int share_pct = get_level_share_pct(level);  ;; 60, 25, 10, 3, 2
        int amount = muldiv(total_amount, share_pct, 100);

        ;; Send reward
        send_raw_message(begin_cell()
            .store_uint(0x18, 6)
            .store_slice(referrer)
            .store_coins(amount)
            .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .store_uint(op::referral_reward, 32)
            .store_uint(level, 8)
            .store_slice(user_addr)
            .end_cell(), 1);

        level += 1;
        if (level >= 5) { break; }
    }

    emit_log("REFERRAL_REWARDS_DISTRIBUTED", total_amount, user_addr);
}
```

**Test Cases:**
- ✅ 1-level chain: only direct referrer rewarded
- ✅ 5-level chain: all 5 levels rewarded
- ✅ Percentages correct (60, 25, 10, 3, 2)
- ✅ Total distributed = input amount
- ✅ Works with partial chains (e.g., 3 levels)

---

### Deliverables
- [ ] `contracts/referral_manager.fc`
- [ ] `wrappers/ReferralManager.ts`
- [ ] Tests (25+ cases)
- [ ] Integration with Premium Distributor

---

## SUBAGENT-FE-002: Referral Dashboard

**Agent Type:** Frontend Agent
**Priority:** P1
**Estimated Time:** 1 week
**Dependencies:** SUBAGENT-SC-005

### Objective
Create referral tracking and management UI.

### Components

#### 1. ReferralDashboard.tsx
```typescript
export function ReferralDashboard() {
  const { referralCode, stats, tree } = useReferrals();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Referral Program</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Referral Code"
          value={referralCode}
          icon={<Link />}
          copyable
        />
        <StatCard
          title="Direct Referrals"
          value={stats.directReferrals}
          icon={<Users />}
        />
        <StatCard
          title="Total Earned"
          value={formatCurrency(stats.totalEarned)}
          icon={<DollarSign />}
          highlight
        />
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Referral Link</h2>
        <div className="flex gap-2">
          <Input
            value={`https://t.me/tonsurance_bot/app?ref=${referralCode}`}
            readOnly
            className="flex-1"
          />
          <Button onClick={() => copyToClipboard(referralLink)}>
            Copy
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Your Referral Tree</h2>
        <ReferralTree data={tree} />
      </Card>
    </div>
  );
}
```

---

#### 2. ReferralTree.tsx
```typescript
interface ReferralNode {
  address: string;
  level: number;
  children: ReferralNode[];
  totalEarned: number;
}

export function ReferralTree({ data }: { data: ReferralNode }) {
  return (
    <div className="space-y-4">
      {renderNode(data, 0)}
    </div>
  );
}

function renderNode(node: ReferralNode, depth: number) {
  const colors = ['blue', 'green', 'yellow', 'orange', 'red'];
  const color = colors[Math.min(depth, 4)];

  return (
    <div key={node.address} className={`ml-${depth * 4}`}>
      <div className={`flex items-center gap-3 p-3 rounded-lg bg-${color}-50`}>
        <div className={`w-8 h-8 rounded-full bg-${color}-500 text-white flex items-center justify-center`}>
          L{depth + 1}
        </div>
        <div className="flex-1">
          <p className="font-mono text-sm">
            {truncateAddress(node.address)}
          </p>
          <p className="text-xs text-gray-600">
            Earned: {formatCurrency(node.totalEarned)}
          </p>
        </div>
      </div>

      {node.children.map((child) => (
        <div key={child.address} className="mt-2">
          {renderNode(child, depth + 1)}
        </div>
      ))}
    </div>
  );
}
```

---

### Deliverables
- [ ] ReferralDashboard.tsx
- [ ] ReferralTree.tsx
- [ ] useReferrals.ts hook
- [ ] Copy link functionality
- [ ] Share to Telegram
- [ ] Tests

---

# Phase 3 Subagent Tasks (Months 7-12)

## SUBAGENT-SC-006: TradFi Buffer Vault

**Agent Type:** Smart Contract Agent
**Priority:** P0
**Estimated Time:** 2 weeks
**Dependencies:** Phase 2 complete

### Objective
Implement institutional-grade vault with KYC requirements and guaranteed yields.

*(Full specification in Advanced Architecture document)*

---

## SUBAGENT-COMPLIANCE-001: KYC/AML Integration

**Agent Type:** Backend Agent + Legal
**Priority:** P0
**Estimated Time:** 3 weeks
**Dependencies:** Legal entity setup

### Objective
Integrate KYC provider and implement compliance workflow.

### Tasks
1. Select KYC provider (Sumsub, Onfido)
2. Integrate API
3. Build compliance dashboard
4. Implement sanctions screening
5. Create audit trail
6. Documentation

*(Full specification available on request)*

---

# Coordination Guidelines

## How Subagents Collaborate

### 1. Smart Contract → Frontend Integration
- SC agent completes contract
- SC agent updates TECHNICAL_SPEC.md with contract addresses
- FE agent reads spec and builds UI
- Both agents write integration tests together

### 2. Backend → Smart Contract Integration
- SC agent emits events
- Backend agent indexes events
- Backend agent provides API for frontend
- Testing agent verifies end-to-end flow

### 3. Documentation → All
- Doc agent waits for implementation complete
- Doc agent reads code and writes docs
- Developers review docs for accuracy
- Doc agent updates based on feedback

---

## Communication Protocol

**Issue Tracking:**
- Each subagent task becomes a GitHub issue
- Issue format: `[SUBAGENT-XX-001] Task Title`
- Labels: `subagent`, `phase-1`/`phase-2`/`phase-3`, `priority-p0`/`p1`/`p2`

**Pull Requests:**
- PR title: `[SUBAGENT-XX-001] Implementation`
- PR description includes:
  - Checklist of deliverables
  - Test results
  - Gas benchmarks (for contracts)
  - Screenshots (for frontend)

**Daily Standups (Async):**
- Post in #subagent-updates channel:
  - Yesterday: What was completed
  - Today: What will be worked on
  - Blockers: Any dependencies or issues

---

## Quality Gates

**Before Marking Task Complete:**
- [ ] All code written
- [ ] All tests passing (90%+ coverage)
- [ ] Code reviewed by human
- [ ] Documentation updated
- [ ] No linter warnings
- [ ] Gas optimized (for contracts)
- [ ] Performance benchmarked

---

**END OF SUBAGENT TASK BREAKDOWN**

*Next Steps: Assign tasks to specialized subagents and begin implementation*
