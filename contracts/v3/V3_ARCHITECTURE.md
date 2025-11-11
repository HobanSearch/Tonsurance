# Tonsurance V3 Architecture

## Overview

V3 introduces a **3-tier nested factory pattern** with **shard optimization** for 20-30% gas savings. The architecture separates concerns across modular contracts while co-locating frequently communicating contracts in the same shard.

**Key Improvements over V2**:
- Modular product expansion (add new assets without core changes)
- DoS-resistant gas abstraction layer
- ZK-proof based KYC gating (privacy-preserving)
- 20-30% lower gas costs via shard optimization
- Comprehensive bounce handling (no silent failures)
- Multi-party reward distribution (8+ parties)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARD 0x00 (Core Protocol)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐     ┌──────────────┐  │
│  │  GasWallet   │─────▶│ MasterFactory│────▶│ SBTVerifier  │  │
│  │  (DoS Guard) │      │  (Router)    │     │  (KYC Gate)  │  │
│  └──────────────┘      └──────┬───────┘     └──────────────┘  │
│                               │                                 │
│                     ┌─────────┼─────────┐                      │
│                     │         │         │                      │
│  ┌──────────────────┴───┐ ┌──┴─────┐ ┌─┴──────────────────┐  │
│  │ PolicyNFTMinter      │ │ Others │ │ Future Products     │  │
│  │ (TEP-62 NFTs)        │ │        │ │ (Expandable)        │  │
│  └──────────────────────┘ └────────┘ └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  SHARD 0x10     │  │  SHARD 0x20     │  │  SHARD 0x30     │
│  (Depeg)        │  │  (Bridge)       │  │  (Oracle)       │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│                 │  │                 │  │                 │
│ DepegSubFactory │  │BridgeSubFactory │  │OracleSubFactory │
│       │         │  │       │         │  │       │         │
│   ┌───┴───┐     │  │   ┌───┴───┐     │  │   ┌───┴───┐     │
│   ▼       ▼     │  │   ▼       ▼     │  │   ▼       ▼     │
│ USDT    USDC    │  │ TON Br. Orbit   │  │RedStone Pyth    │
│ Child   Child   │  │ Child   Child   │  │ Child   Child   │
│   │       │     │  │   │       │     │  │   │       │     │
└───┼───────┼─────┘  └───┼───────┼─────┘  └───┼───────┼─────┘
    │       │            │       │            │       │
    └───────┴────────────┴───────┴────────────┴───────┘
                         │
                         ▼
         ┌───────────────────────────────────────┐
         │     SHARD 0xF0 (Vault System)         │
         ├───────────────────────────────────────┤
         │                                       │
         │  ┌────────────────────────────────┐  │
         │  │   MultiTrancheVault            │  │
         │  │   (6 tranches: BTC→EQT)        │  │
         │  └────────────┬───────────────────┘  │
         │               │                       │
         │  ┌────────────┼───────────────────┐  │
         │  │            │                   │  │
         │  ▼            ▼                   ▼  │
         │ PriceOracle  ParametricEscrow   ...  │
         │ (3/5 oracles) (8-party split)        │
         └───────────────────────────────────────┘
```

---

## 3-Tier Contract Hierarchy

### Tier 1: Master Factory (Core Routing)
**Contract**: `MasterFactory.fc` (Shard 0x00)

**Responsibilities**:
- Route policy creation requests to product-specific sub-factories
- Deploy sub-factories on-demand (first request for product type)
- Maintain registry of deployed sub-factories
- Enforce global pause/access control

**Product Type Routing**:
```func
// Product type enum
const int PRODUCT_DEPEG = 1;      // Stablecoin depeg insurance
const int PRODUCT_BRIDGE = 2;     // Bridge failure insurance
const int PRODUCT_ORACLE = 3;     // Oracle failure insurance
const int PRODUCT_CONTRACT = 4;   // Smart contract exploit insurance
// Future: PRODUCT_LIQUIDATION = 5, PRODUCT_YIELD = 6, etc.
```

**Message Flow**:
```
GasWallet → MasterFactory.route(product_type, asset_id, user_data)
          ↓
MasterFactory checks product_factories dict
          ↓
If not found: deploy_subfactory_with_shard_target(product_type)
          ↓
Forward to SubFactory.create_policy(asset_id, user_data)
```

---

### Tier 2: Product Sub-Factories (Asset Management)
**Contracts**:
- `DepegSubFactory.fc` (Shard 0x10)
- `BridgeSubFactory.fc` (Shard 0x20)
- `OracleSubFactory.fc` (Shard 0x30)
- `ContractSubFactory.fc` (Shard 0x40)

**Responsibilities**:
- Deploy asset-specific child contracts (e.g., USDT child, USDC child)
- Maintain registry of deployed children
- Forward policy creation to appropriate child
- Product-specific parameter validation

**Asset ID Mapping**:

**Depeg (0x10)**:
```
1 = USDT (Tether)
2 = USDC (Circle)
3 = DAI (MakerDAO)
4 = USDD (Tron)
5 = TUSD (TrueUSD)
6 = FDUSD (First Digital)
// Expandable to 255 stablecoins
```

**Bridge (0x20)**:
```
1 = TON Bridge (official)
2 = Orbit Bridge
3 = Wormhole
4 = Axelar
// Expandable to 255 bridges
```

**Oracle (0x30)**:
```
1 = RedStone
2 = Pyth Network
3 = Chainlink (when available)
4 = DIA
// Expandable to 255 oracles
```

**Contract (0x40)**:
```
1 = DeDust (AMM)
2 = STON.fi (AMM)
3 = Tonstakers (liquid staking)
4 = Evaa Protocol (lending)
// Expandable to 255 protocols
```

**Message Flow**:
```
MasterFactory → DepegSubFactory.create_policy(asset_id=1, user_data)
              ↓
Check children dict for asset_id=1
              ↓
If not found: deploy_child(USDT_config) in same shard (0x10)
              ↓
Forward to USDTChild.create_policy(user_data)
```

---

### Tier 3: Asset-Specific Children (Policy Logic)
**Contracts**:
- `StablecoinChild.fc` (Shard 0x10, co-located with DepegSubFactory)
- `BridgeChild.fc` (Shard 0x20, co-located with BridgeSubFactory)
- `OracleChild.fc` (Shard 0x30, co-located with OracleSubFactory)
- `ProtocolChild.fc` (Shard 0x40, co-located with ContractSubFactory)

**Responsibilities**:
- Asset-specific policy creation logic
- Premium calculation (via PremiumCalculator library)
- Parametric trigger configuration (oracle monitoring)
- PolicyNFT minting (via PolicyNFTMinter in Shard 0x00)
- Premium investment (via FloatMaster for immediate capital deployment)
- Policy registration (via MasterFactory for claim coordination)

**Example: USDT Depeg Policy Creation**:
```
USDTChild.create_policy()
  1. Validate parameters (coverage_amount, duration_days)
  2. Check SBT/KYC via SBTVerifier (Shard 0x00)
  3. Calculate premium via PremiumCalculator library
  4. Mint PolicyNFT via PolicyNFTMinter (Shard 0x00)
  5. Send premium to FloatMaster for investment (Shard 0xF0)
     - 50% RWA (8% APY target)
     - 15% BTC (yield farming)
     - 15% DeFi protocols
     - 20% Hedging reserves
  6. Register policy with MasterFactory (Shard 0x00)
     - Store: policy_id, user_addr, coverage, expiry, trigger_params
     - Enables claim processing coordination
  7. Monitor oracle price (USDT/USD < $0.98 for 1+ hour)
  8. Emit PolicyCreated event
```

---

## Shard Grouping Strategy

### Why Shard Optimization Matters

TON uses **dynamic sharding**: contracts are distributed across shards based on their address. Messages between contracts in:
- **Same shard**: ~0.005 TON (1 validator set processes)
- **Different shards**: ~0.01-0.02 TON (cross-shard routing, 2 validator sets)

For a policy creation that sends 5 messages (GasWallet → Master → SubFactory → Child → Escrow + NFT), random sharding costs:
- Random: 5 × 0.015 TON = **0.075 TON** (~$0.38 at $5/TON)
- Optimized: 3 same-shard + 2 cross-shard = **0.045 TON** (~$0.22, **40% savings**)

### Shard Group Allocation

| Shard | Target Prefix | Contracts | Message Volume | Rationale |
|-------|---------------|-----------|----------------|-----------|
| **0x00** | Core | GasWallet, SBTVerifier, MasterFactory, PolicyNFTMinter | 10K msg/day | All entry points + routing |
| **0x10** | Depeg | DepegSubFactory, USDT/USDC/DAI children | 5K msg/day | 60% of policies are stablecoin |
| **0x20** | Bridge | BridgeSubFactory, TON Bridge/Orbit children | 2K msg/day | 20% of policies are bridge |
| **0x30** | Oracle | OracleSubFactory, RedStone/Pyth children | 1K msg/day | 10% of policies are oracle |
| **0x40** | Contract | ContractSubFactory, DeDust/STON children | 1K msg/day | 10% of policies are protocol |
| **0xF0** | Vault | MultiTrancheVault, ParametricEscrow, PriceOracle | 15K msg/day | Premium deposits + claims |

### Salt-Based Address Targeting

To deploy a contract to a specific shard, we iterate through salts (0-10000) until we find a StateInit hash that produces an address with the desired prefix:

```typescript
// Pseudo-code for deployment script
async function deployToShard(code: Cell, data: Cell, targetPrefix: number): Promise<Address> {
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
    const prefix = address.hash[0]; // First byte

    if (prefix === targetPrefix) {
      console.log(`Found address ${address} with salt ${salt}`);
      await deployer.send({
        to: address,
        value: toNano('1'),
        stateInit,
        bounce: false
      });
      return address;
    }
  }

  throw new Error(`Failed to find address with prefix 0x${targetPrefix.toString(16)}`);
}

// Deploy Master Factory to Shard 0x00
const masterFactory = await deployToShard(
  masterFactoryCode,
  masterFactoryData,
  0x00
);

// Deploy Depeg Sub-Factory to Shard 0x10
const depegFactory = await deployToShard(
  depegFactoryCode,
  depegFactoryData,
  0x10
);
```

**Expected Deployment Time**: ~2-5 minutes per contract (10K iterations on M1 Mac)

---

## Security Architecture

### Gas Abstraction Layer (GasWallet.fc)

**Problem**: Users sending external messages without sufficient gas creates DoS vector (spammers can exhaust contract compute).

**Solution**: Centralized GasWallet performs early validation (~1k gas) before forwarding to MasterFactory.

**DoS Prevention Mechanisms**:

1. **Rate Limiting**: 5 transactions per minute per address
```func
// Dict<addr_hash, (last_timestamp, count)>
global cell rate_limits;

int rate_limit_check(slice user_addr) impure {
  int addr_hash = slice_hash(user_addr);
  (slice data, int found) = rate_limits.udict_get?(256, addr_hash);

  if (!found) {
    // First transaction
    rate_limits~udict_set(256, addr_hash,
      begin_cell().store_uint(now(), 32).store_uint(1, 8).end_cell().begin_parse());
    return true;
  }

  int last_ts = data~load_uint(32);
  int count = data~load_uint(8);

  if (now() - last_ts > 60) {
    // Reset window
    rate_limits~udict_set(256, addr_hash,
      begin_cell().store_uint(now(), 32).store_uint(1, 8).end_cell().begin_parse());
    return true;
  }

  if (count >= 5) {
    return false; // Rate limit exceeded
  }

  // Increment count
  rate_limits~udict_set(256, addr_hash,
    begin_cell().store_uint(last_ts, 32).store_uint(count + 1, 8).end_cell().begin_parse());
  return true;
}
```

2. **Nonce Replay Protection**: Sequential nonces per user
```func
// Dict<addr_hash, last_nonce>
global cell user_nonces;

int validate_nonce(slice user_addr, int nonce) impure {
  int addr_hash = slice_hash(user_addr);
  (int last_nonce, int found) = user_nonces.udict_get?(256, addr_hash);

  if (!found) {
    throw_unless(400, nonce == 1); // First nonce must be 1
    user_nonces~udict_set(256, addr_hash, 1);
    return true;
  }

  throw_unless(400, nonce == last_nonce + 1); // Must increment by 1
  user_nonces~udict_set(256, addr_hash, nonce);
  return true;
}
```

3. **Gas Buffer Reservation**: Reserve 0.05 TON for bounce messages
```func
() recv_external(slice in_msg) impure {
  // Early validation (~1k gas)
  int sig_valid = check_signature(in_msg~load_uint(256), my_public_key);
  throw_unless(35, sig_valid);

  throw_unless(36, rate_limit_check(in_msg.sender));

  int nonce = in_msg~load_uint(64);
  throw_unless(37, validate_nonce(in_msg.sender, nonce));

  // Reserve gas buffer (0.05 TON)
  raw_reserve(50000000, 0); // 0.05 TON

  // Forward to MasterFactory with 0.5 TON gas
  send_internal_msg(master_factory_addr, op=1, in_msg, 500000000);
}
```

### Bounced Message Handling

**Problem**: If a child contract fails (out of gas, assertion failure), the bounce message should refund the user and log the error.

**Solution**: All contracts implement `on_bounce()` handler to parse error codes and emit events.

```func
() on_bounce(slice in_msg) impure {
  in_msg~skip_bits(32); // Skip 0xFFFFFFFF prefix

  int op = in_msg~load_uint(32);
  int error_code = in_msg~load_uint(32);

  if (op == op::create_policy) {
    // Policy creation failed
    slice user_addr = in_msg~load_msg_addr();
    int coverage_amount = in_msg~load_coins();

    // Refund user (amount - fees)
    send_internal_msg(user_addr, op=0, begin_cell().end_cell(), coverage_amount - 100000000);

    // Emit event for monitoring
    emit_log(
      "PolicyCreationFailed",
      begin_cell()
        .store_slice(user_addr)
        .store_uint(error_code, 32)
        .end_cell()
    );
  }
}
```

### KYC/SBT Gating (SBTVerifier.fc)

**Problem**: Regulatory compliance requires KYC without exposing user data on-chain.

**Solution**: Zero-knowledge proof system with soulbound tokens.

**Flow**:
1. User completes KYC with Didit (off-chain)
2. Guardian service generates ZK proof: "User X passed KYC level Y" (no PII)
3. User submits proof to SBTVerifier contract
4. Contract validates proof, mints SBT (TEP-62 non-transferable NFT)
5. All policy creation checks SBT ownership

```func
() verify_kyc_proof(slice user_addr, cell zk_proof) impure {
  // Validate ZK proof against guardian public key
  slice proof_data = zk_proof.begin_parse();
  int proof_commitment = proof_data~load_uint(256);
  int kyc_tier = proof_data~load_uint(8); // 1=Basic, 2=Standard, 3=Enhanced
  slice signature = proof_data~load_bits(512);

  int valid = check_signature(
    begin_cell()
      .store_slice(user_addr)
      .store_uint(proof_commitment, 256)
      .store_uint(kyc_tier, 8)
      .end_cell()
      .begin_parse()
      .slice_hash(),
    signature,
    guardian_pubkey
  );

  throw_unless(401, valid);

  // Mint SBT (non-transferable NFT)
  mint_sbt(user_addr, kyc_tier);
}

int check_user_kyc(slice user_addr, int required_tier) {
  int addr_hash = slice_hash(user_addr);
  (int user_tier, int found) = sbt_registry.udict_get?(256, addr_hash);

  return found & (user_tier >= required_tier);
}
```

**Tiers**:
- **Basic** (Tier 1): Email + phone verification, $5K coverage limit
- **Standard** (Tier 2): Government ID, $50K limit
- **Enhanced** (Tier 3): Proof of address, $500K+ limit

---

## Message Flow Examples

### Example 1: USDT Depeg Policy Creation

**User Action**: Create $10,000 USDT depeg policy for 30 days

**On-Chain Flow**:
```
1. User signs external message:
   - nonce: 42
   - product_type: 1 (DEPEG)
   - asset_id: 1 (USDT)
   - coverage_amount: 10000 USDC
   - duration_days: 30
   - signature: 0x1234...

2. GasWallet.recv_external() [Shard 0x00]
   - Validate signature (~1k gas) ✓
   - Check rate limit (user has 2/5 tx in window) ✓
   - Validate nonce (expect 42, last was 41) ✓
   - Reserve 0.05 TON gas buffer
   - Forward to MasterFactory with 0.5 TON

3. MasterFactory.route() [Shard 0x00 → Same shard]
   - Check SBT: SBTVerifier.check_user_kyc(user, required_tier=1) ✓
   - Lookup product_factories[1] (DEPEG)
     - Found: DepegSubFactory at 0x10...
   - Forward to DepegSubFactory with 0.4 TON

4. DepegSubFactory.create_policy() [Shard 0x10 → Cross shard]
   - Lookup children[1] (USDT)
     - Not found: deploy USDTChild to Shard 0x10 (same shard!)
   - Forward to USDTChild with 0.3 TON

5. USDTChild.create_policy() [Shard 0x10 → Same shard]
   - Calculate premium: $10,000 × 0.8% APR × (30/365) = $6.58
   - Validate user sent 7 USDC (premium + buffer)
   - Send 3 parallel messages:

   a) PolicyNFTMinter.mint() [Shard 0x00 → Cross shard]
      - Mint TEP-62 NFT with metadata:
        - policy_id: 12345
        - coverage_type: DEPEG_USDT
        - coverage_amount: 10000 USDC
        - duration: 30 days
        - expiry: now() + 30 days
        - parametric_trigger: USDT/USD < $0.98 for 1 hour
      - Transfer NFT to user

   b) FloatMaster.invest_premium() [Shard 0xF0 → Cross shard]
      - Invest 6.58 USDC premium immediately:
        - RWA allocation: 6.58 × 50% = 3.29 USDC (8% APY)
        - BTC allocation: 6.58 × 15% = 0.99 USDC (yield farming)
        - DeFi allocation: 6.58 × 15% = 0.99 USDC (protocols)
        - Hedge allocation: 6.58 × 20% = 1.32 USDC (reserves)
      - Generate yield → daily distribution to Vault tranches
      - Covers LP cost of capital in vault system

   c) MasterFactory.register_policy() [Shard 0x00 → Cross shard]
      - Store policy in registry:
        - policy_id: 12345
        - product_type: DEPEG
        - asset_id: USDT
        - user_address, coverage_amount, expiry
        - child_contract: USDTChild address
        - trigger_params: $0.98 threshold, 1 hour duration
      - Enables claim processing coordination
      - Prevents duplicate claims

6. User receives:
   - PolicyNFT in wallet (viewable in Tonkeeper/Tonhub)
   - Confirmation event: "Policy 12345 created"

Total time: <5 seconds
Total gas: ~0.045 TON (~$0.22)
```

**Message Count**:
- Same shard: 3 (GasWallet → Master, Master → Depeg, Child → Vault)
- Cross shard: 2 (Depeg → Child, Child → NFT/Escrow)
- **Gas savings**: 3 × 0.005 + 2 × 0.015 = 0.045 TON (vs 0.075 TON random)

---

### Example 2: Claim Payout (USDT Depegs)

**Trigger**: USDT/USD drops to $0.97 for 2 hours

**On-Chain Flow**:
```
1. Oracle Relayer detects trigger [Off-chain monitoring]
   - Fetches prices from 3 oracles:
     - RedStone: $0.971
     - Pyth: $0.969
     - Custom feed: $0.972
   - Median: $0.971 (below $0.98 threshold)
   - Duration: 7200 seconds (> 1 hour requirement)
   - Consensus: 3/3 oracles agree ✓
   - Push price update to USDTChild

2. USDTChild receives oracle update [Shard 0x10]
   - op::oracle_price_update from trusted relayer
   - Validate price freshness (<5 minutes) ✓
   - Check depeg duration (> 1 hour) ✓
   - Trigger all active USDT policies

3. USDTChild sends claim to MasterFactory [Shard 0x10 → 0x00]
   - op::process_claim(policy_id=12345, user_addr, coverage=10000)
   - Include trigger details (price=$0.971, timestamp)

4. MasterFactory coordinates withdrawal [Shard 0x00]
   - Lookup policy in registry ✓
   - Verify not already claimed ✓
   - Verify sender is registered child contract ✓
   - Mark policy as claimed in registry
   - Request vault withdrawal

5. MasterFactory → MultiTrancheVault [Shard 0x00 → 0xF0]
   - op::withdraw_for_claim(policy_id, user_addr, 10000 USDC)
   - Vault validates MasterFactory sender ✓

6. MultiTrancheVault processes payout [Shard 0xF0]
   - Validate sufficient capital (total_capital >= 10000) ✓
   - Absorb loss via waterfall (EQT → JNR+ → JNR → MEZZ → SNR → BTC)
   - Send direct payout to user: 10,000 USDC
   - Emit ClaimPaid event

7. User receives:
   - 10,000 USDC in wallet
   - PolicyNFT marked as "CLAIMED"
   - Confirmation event

Total time: <10 seconds (oracle update → payout)
Total gas: ~0.05 TON (cross-shard messages + vault withdrawal)

**Key Differences from V2**:
- No ParametricEscrow contract (policies registered in MasterFactory)
- No 8-party distribution (simple vault → user payout)
- MasterFactory coordinates claim processing
- Oracle monitoring in child contracts
```

---

## Upgradeability Strategy

### Proxy Pattern for Core Contracts

V3 implements the **proxy pattern** for MasterFactory and MultiTrancheVault to enable upgrades without changing contract addresses or requiring user migrations.

**Why Proxies Matter**:
- **Permanent Addresses**: Users, frontends, and integrations always interact with the same address
- **State Preservation**: LP balances, policy registry, and tranche data persist across upgrades
- **No Migrations**: LPs never need to withdraw and re-deposit funds
- **Bug Fixes**: Critical bugs can be patched without protocol downtime

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                  Proxy Contract (Permanent)                  │
│  Address: EQ...abc (never changes)                          │
├─────────────────────────────────────────────────────────────┤
│  Storage:                                                    │
│  - implementation_address: EQ...v1 → EQ...v2 (upgradable)   │
│  - admin_address: DAO multisig                              │
│  - persistent_state: policy_registry, lp_balances, etc.     │
│  - last_upgrade_timestamp: Rate limiting                    │
│  - protocol_version: 1 → 2 → 3...                          │
├─────────────────────────────────────────────────────────────┤
│  Logic:                                                      │
│  - Proxy-specific opcodes (op::upgrade_implementation)      │
│  - Forward all other messages to implementation             │
│  - Emergency pause mechanism                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓ forwards
┌─────────────────────────────────────────────────────────────┐
│            Implementation Contract V1 (Upgradable)           │
│  Address: EQ...v1 (changes on upgrade)                      │
├─────────────────────────────────────────────────────────────┤
│  - Business logic only (no state storage)                   │
│  - Receives forwarded messages from proxy                   │
│  - Can be replaced without affecting proxy state            │
└─────────────────────────────────────────────────────────────┘
```

**Implemented Proxies**:

1. **MasterFactoryProxy.fc** (Shard 0x00)
   - Persistent state: `active_policies`, `product_factories`
   - Rate limiting: 24 hours between upgrades
   - Admin: DAO multisig (3-of-5 recommended)
   - Proxy fee: 0.005 TON overhead per message

2. **MultiTrancheVaultProxy.fc** (Shard 0xF0)
   - Persistent state: `lp_balances`, `tranche_allocations`, `total_value_locked`
   - Rate limiting: 48 hours between upgrades (LP protection)
   - Admin: DAO multisig
   - Proxy fee: 0.005 TON overhead per message

**Upgrade Flow**:
```
1. Deploy new implementation (e.g., MasterFactoryImpl_v2)
2. Test on testnet for 2 weeks
3. Submit upgrade proposal to DAO
4. DAO approves (3-of-5 multisig)
5. Admin sends op::upgrade_implementation(new_impl_addr)
6. Proxy validates:
   - Sender is admin ✓
   - 24h/48h elapsed since last upgrade ✓
   - New implementation address valid ✓
7. Proxy updates implementation_address
8. All future messages routed to v2
9. All state preserved (policies, balances, etc.)
```

**Upgrade Safety**:
- **Time locks**: 24h (factory) / 48h (vault) minimum between upgrades
- **DAO governance**: Multi-sig required (not single admin)
- **Emergency pause**: Admin can pause proxy during upgrade window
- **Withdrawal pause**: Vault pauses withdrawals during upgrade (user protection)
- **Event logging**: All upgrades emit `ImplementationUpgraded` event

**Example Upgrade Scenario**:
```typescript
// Deploy new implementation
const newImpl = await blockchain.deploy(MasterFactoryImplV2, {...});

// Admin sends upgrade message (after DAO approval)
await proxyContract.send(admin, {
  value: toNano('0.1'),
  body: beginCell()
    .storeUint(0xFF, 32)  // op::upgrade_implementation
    .storeAddress(newImpl.address)
    .endCell()
});

// Verify upgrade
const implAddr = await proxyContract.getImplementation();
expect(implAddr.equals(newImpl.address)).toBe(true);

// Old policies still work
const policy = await proxyContract.getPolicy(12345);
expect(policy.coverage).toBe(10000);  // State preserved!
```

**Non-Upgradable Contracts**:
- **Child contracts** (StablecoinChild, BridgeChild, etc.): Product logic frozen at deployment
- **PolicyNFTs**: Immutable metadata
- **Sub-factories**: Redeployable via factory pattern (no proxy needed)

### Factory Pattern for Products
**Adding New Product** (e.g., PRODUCT_LIQUIDATION = 5):
1. Deploy `LiquidationSubFactory.fc` to Shard 0x50 (new shard)
2. Call `MasterFactory.register_product_factory(5, 0x50abc...)`
3. Deploy asset children as needed (e.g., Venus, Aave, Compound)

**No changes to**:
- GasWallet
- MasterFactory core logic
- Existing sub-factories
- Vault system

### Configurable Parameters (BoC Storage)
**Updateable without redeployment**:
- Oracle keeper addresses (PriceOracle)
- Tranche allocation percentages (MultiTrancheVault)
- Rate limit thresholds (GasWallet)
- SBT tier requirements (SBTVerifier)
- Admin multisig signers

**Example**: Change rate limit from 5/min to 10/min
```func
() set_rate_limit(int new_limit) impure {
  throw_unless(401, equal_slices(sender(), admin_address));
  rate_limit_max = new_limit;
  save_data();
}
```

### Emergency Procedures
**Pause Contract**:
```func
() pause() impure {
  throw_unless(401, equal_slices(sender(), admin_address));
  paused = true;
  save_data();
}

() recv_internal(slice in_msg) impure {
  throw_if(402, paused); // Reject all operations
  // ... normal logic
}
```

**Circuit Breaker** (auto-pause on anomaly):
- Vault loss > $1M in 1 hour
- >50 policies claim simultaneously
- Oracle consensus fails (0/3 agree)
- Bounced message rate > 10%

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Policy Creation Time** | <5 seconds | User perception (external msg → PolicyNFT) |
| **Cross-Shard Latency** | <10 seconds | Average message routing time |
| **Gas Cost per Policy** | 0.04-0.05 TON | Optimized (vs 0.055-0.075 TON random) |
| **Transaction Success Rate** | >99% | Testnet, 2 weeks, 10K+ policies |
| **Bounced Message Rate** | <1% | Failed operations / total operations |
| **DoS Resistance** | >1000 tx/sec | GasWallet rate limiting, no degradation |
| **Oracle Uptime** | >99.9% | 3/5 consensus, <30 min staleness |
| **Vault Capacity** | $10M+ | Across 6 tranches, no single-point failure |

---

## Future Enhancements (Post-V3)

### V3.1: Additional Products
- **Liquidation Insurance** (PRODUCT_LIQUIDATION = 5)
  - Parametric trigger: LTV > 90% on Venus/Aave
  - Shard 0x50
- **Yield Stability** (PRODUCT_YIELD = 6)
  - Parametric trigger: APY drops > 50% in 1 week
  - Shard 0x60

### V3.2: Advanced Features
- **Dynamic Pricing**: Adjust premiums based on vault utilization
- **Tranched Policies**: User selects tranche (BTC = lowest premium, EQT = highest)
- **Policy Marketplace**: Secondary market for PolicyNFTs (transfer restrictions lifted)
- **Batch Claims**: Process 100+ claims in single transaction (gas optimization)

### V3.3: Cross-Chain Expansion
- **Ethereum L2s**: Deploy to Arbitrum, Optimism (same codebase)
- **Cosmos**: IBC integration for cross-chain policies
- **Solana**: Rust port of core contracts

---

## Conclusion

V3 architecture balances **modularity** (easy product expansion), **security** (DoS resistance, bounce handling), and **efficiency** (20-30% gas savings via shard optimization). The 3-tier factory pattern enables adding new products and assets without core infrastructure changes, while the shard grouping strategy minimizes cross-shard messaging costs.

**Next Steps**: Begin Phase 2 implementation - security_helpers.fc library and GasWallet.fc contract.
