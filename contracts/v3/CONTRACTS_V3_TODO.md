# Tonsurance V3 Smart Contract Implementation Checklist

## Overview
V3 introduces a 3-tier nested factory pattern with shard optimization, comprehensive security hardening, and modular product architecture.

**Timeline**: 6-7 weeks
**Test Coverage Target**: 95%+ (contracts), 90%+ (services)
**Estimated Lines**: ~8,000 lines of FunC

---

## PHASE 1: SETUP & ARCHITECTURE (Week 1)

### 1.1 Directory Structure ✅
- [x] Create contracts/v3/{core,factories,children,vaults,libs}
- [x] Documentation files created

### 1.2 Core Documentation ✅
- [x] V3_ARCHITECTURE.md - Full architecture with shard grouping
- [x] SHARD_OPTIMIZATION.md - Gas cost analysis
- [x] SECURITY_PATTERNS.md - Security patterns reference
- [x] DEPLOYMENT_GUIDE_V3.md - Deployment procedures
- [x] MIGRATION_V2_TO_V3.md - V2 to V3 migration plan

---

## PHASE 2: SECURITY FOUNDATION (Week 1-2)

### 2.1 Security Helpers Library (libs/security_helpers.fc)
- [ ] `handle_bounced_message()` - Parse 0xFFFF error codes, emit events
- [ ] `validate_gas_buffer()` - Ensure 0.05 TON minimum for operations
- [ ] `rate_limit_check()` - 5 tx/min per address with sliding window
- [ ] `validate_nonce()` - Sequential nonce replay protection
- [ ] `validate_signature_early()` - ~1k gas signature check
- [ ] `reserve_gas()` - Reserve computation for bounce messages
- [ ] Unit tests: 25+ tests covering all edge cases

### 2.2 GasWallet.fc (core/GasWallet.fc) - Shard 0x00
- [ ] recv_external with early signature validation
- [ ] Rate limiting implementation (Dict<addr, (last_ts, count)>)
- [ ] Nonce management (Dict<addr, uint64>)
- [ ] Gas forwarding to MasterFactory
- [ ] Admin functions (fund, withdraw, pause)
- [ ] Bounced message handling with refunds
- [ ] Unit tests: 40+ tests (DoS attacks, replay, gas exhaustion)

### 2.3 SBTVerifier.fc (core/SBTVerifier.fc) - Shard 0x00
- [ ] ZK proof validation (guardian service integration)
- [ ] SBT ownership check (TEP-62 NFT standard)
- [ ] KYC tier management (Basic, Standard, Enhanced)
- [ ] Whitelist/blacklist management
- [ ] Access control for MasterFactory
- [ ] Unit tests: 30+ tests (proof validation, tier requirements)

---

## PHASE 3: MASTER FACTORY (Week 2)

### 3.1 Factory Helpers Library (libs/factory_helpers.fc)
- [ ] `compute_address_from_hash()` - StateInit to address conversion
- [ ] `deploy_child_with_shard_target()` - Salt-based deployment (iterate 10k salts)
- [ ] `send_deploy_message()` - Deploy with bounce handling
- [ ] `verify_shard_address()` - Confirm target shard deployment
- [ ] Unit tests: 20+ tests (salt computation, shard targeting)

### 3.2 MasterFactory.fc (core/MasterFactory.fc) - Shard 0x00
- [ ] Product type routing (Depeg=1, Bridge=2, Oracle=3, Contract=4)
- [ ] Sub-factory registry (Dict<uint8, slice> for factory addresses)
- [ ] Deploy product sub-factories on-demand with shard targeting
- [ ] Bounced message handling (log deployment failures)
- [ ] Admin functions (register factory, pause, upgrade)
- [ ] Events: PolicyCreated, FactoryDeployed, RoutingError
- [ ] Unit tests: 45+ tests (routing, deployment, error handling)

---

## PHASE 4: PRODUCT SUB-FACTORIES (Week 2-3)

### 4.1 ProductSubFactory.fc Template (factories/ProductSubFactory.fc)
- [ ] Base template with abstract product handling
- [ ] Child contract registry (Dict<uint16, slice> for asset addresses)
- [ ] Deploy asset children on-demand (same shard as factory)
- [ ] Forward policy creation to asset child
- [ ] Bounced message handling
- [ ] Unit tests: 30+ tests (template behavior)

### 4.2 DepegSubFactory.fc (factories/DepegSubFactory.fc) - Shard 0x10
- [ ] Asset IDs: USDT=1, USDC=2, DAI=3, USDD=4, TUSD=5
- [ ] Deploy StablecoinChild for each asset
- [ ] Forward depeg policy creation requests
- [ ] Unit tests: 25+ tests (stablecoin-specific logic)

### 4.3 BridgeSubFactory.fc (factories/BridgeSubFactory.fc) - Shard 0x20
- [ ] Asset IDs: TON Bridge=1, Orbit Bridge=2, Wormhole=3
- [ ] Deploy BridgeChild for each asset
- [ ] Forward bridge policy creation requests
- [ ] Unit tests: 25+ tests (bridge-specific logic)

### 4.4 OracleSubFactory.fc (factories/OracleSubFactory.fc) - Shard 0x30
- [ ] Asset IDs: RedStone=1, Pyth=2, Chainlink=3
- [ ] Deploy OracleChild for each asset
- [ ] Forward oracle policy creation requests
- [ ] Unit tests: 25+ tests (oracle-specific logic)

### 4.5 ContractSubFactory.fc (factories/ContractSubFactory.fc) - Shard 0x40
- [ ] Asset IDs: DeDust=1, STON.fi=2, Tonstakers=3
- [ ] Deploy ProtocolChild for each asset
- [ ] Forward contract policy creation requests
- [ ] Unit tests: 25+ tests (protocol-specific logic)

---

## PHASE 5: ASSET-SPECIFIC CHILDREN (Week 3-4)

### 5.1 StablecoinChild.fc (children/StablecoinChild.fc) - Shard 0x10
- [ ] Policy creation with depeg parameters (threshold, duration)
- [ ] Premium calculation integration with PremiumCalculator
- [ ] Parametric trigger: price < $0.98 for 1 hour
- [ ] PolicyNFT minting via PolicyNFTMinter
- [ ] Escrow creation via ParametricEscrow
- [ ] Unit tests: 50+ tests (policy lifecycle, triggers)

### 5.2 BridgeChild.fc (children/BridgeChild.fc) - Shard 0x20
- [ ] Policy creation with bridge parameters (failure duration)
- [ ] Parametric trigger: bridge offline > 4 hours
- [ ] Integration with bridge health monitors
- [ ] Unit tests: 45+ tests (bridge monitoring, payouts)

### 5.3 OracleChild.fc (children/OracleChild.fc) - Shard 0x30
- [ ] Policy creation with oracle parameters (staleness threshold)
- [ ] Parametric trigger: data stale > 30 minutes OR deviation > 5%
- [ ] Integration with oracle aggregators
- [ ] Unit tests: 45+ tests (staleness detection, deviation)

### 5.4 ProtocolChild.fc (children/ProtocolChild.fc) - Shard 0x40
- [ ] Policy creation with protocol parameters (contract risk types)
- [ ] Parametric trigger: exploit detected OR pause > 24 hours
- [ ] Integration with on-chain monitors
- [ ] Unit tests: 45+ tests (exploit detection, protocol health)

---

## PHASE 6: VAULT SYSTEM (Week 4-5)

### 6.1 Update MultiTrancheVault.fc (vaults/MultiTrancheVault.fc) - Shard 0xF0
- [ ] Salvage from V2 (793 lines)
- [ ] Update integrations: MasterFactory address, PolicyNFTMinter address
- [ ] Add bounced message handling
- [ ] Add shard-aware message sending
- [ ] 6-tranche structure: BTC (15%), SNR (20%), MEZZ (25%), JNR (20%), JNR+ (15%), EQT (5%)
- [ ] Deposit/withdraw with tranche targeting
- [ ] Premium distribution via waterfall
- [ ] Loss absorption (reverse waterfall)
- [ ] Yield claiming per tranche
- [ ] Unit tests: 60+ tests (waterfall, loss scenarios, edge cases)

### 6.2 Update ParametricEscrow.fc (vaults/ParametricEscrow.fc) - Shard 0xF0
- [ ] Salvage from V2 (551 lines)
- [ ] Update integrations: asset child addresses, vault addresses
- [ ] Multi-party distribution (8+ parties: user, LP, stakers, protocol, arbiters, builders, admin, gas)
- [ ] Timeout handling (refund after expiry)
- [ ] Dispute freeze mechanism
- [ ] Unit tests: 40+ tests (distributions, timeouts, disputes)

### 6.3 Update PriceOracle.fc (vaults/PriceOracle.fc) - Shard 0xF0
- [ ] Salvage from V2 (412 lines)
- [ ] Update integrations: asset child addresses
- [ ] Multi-oracle aggregation (3/5 consensus)
- [ ] Staleness checks (30 min max)
- [ ] Oracle keeper rewards
- [ ] Unit tests: 35+ tests (consensus, staleness, reward distribution)

---

## PHASE 7: POLICY NFT SYSTEM (Week 5)

### 7.1 PolicyNFTMinter.fc (core/PolicyNFTMinter.fc) - Shard 0x00
- [ ] TEP-62/74 NFT minting
- [ ] Policy metadata (coverage type, asset, amount, duration, expiry)
- [ ] Ownership transfer restrictions (soulbound option)
- [ ] Claim status tracking (active, claimed, expired)
- [ ] Integration with asset children
- [ ] Unit tests: 35+ tests (minting, metadata, transfers)

---

## PHASE 8: COMPREHENSIVE TESTING (Week 5-6)

### 8.1 Unit Tests (250+ tests total)
- [ ] Security library tests (25 tests)
- [ ] GasWallet DoS resistance (40 tests)
- [ ] SBTVerifier ZK proofs (30 tests)
- [ ] Factory helpers shard targeting (20 tests)
- [ ] MasterFactory routing (45 tests)
- [ ] Sub-factories (4 × 25 = 100 tests)
- [ ] Asset children (4 × 45 = 180 tests - running total 440+)
- [ ] Vault system (135 tests)
- [ ] PolicyNFT minting (35 tests)

### 8.2 Integration Tests (50+ scenarios)
- [ ] End-to-end policy creation (recv_external → GasWallet → MasterFactory → SubFactory → Child → Escrow + NFT)
- [ ] Cross-shard message verification (same-shard vs cross-shard gas costs)
- [ ] Bounced message propagation (child fails → factory logs → user refund)
- [ ] Multi-party claim distribution (trigger → escrow → 8 parties)
- [ ] Oracle consensus and staleness (3/5 agreement, 30 min timeout)
- [ ] Vault waterfall (premium distribution across 6 tranches)
- [ ] Loss absorption (claim payout, reverse waterfall)
- [ ] SBT gating (reject non-KYC users, tiered access)
- [ ] Rate limiting (spam 10 tx/min, verify 5 pass, 5 fail)
- [ ] Nonce replay protection (resubmit tx, verify rejection)

### 8.3 Security Testing (30+ attack scenarios)
- [ ] **DoS Attacks**:
  - [ ] GasWallet spam (1000 external messages, verify rate limit)
  - [ ] Gas exhaustion (send 0 TON message, verify rejection)
  - [ ] Nonce replay (reuse nonce, verify rejection)
- [ ] **Reentrancy**:
  - [ ] Vault deposit during withdraw (verify guard)
  - [ ] Claim during claim (verify guard)
- [ ] **Oracle Manipulation**:
  - [ ] Submit 5 identical prices (collusion detection)
  - [ ] Submit stale data (30 min old, verify rejection)
  - [ ] Sybil attack (same keeper multiple IDs, verify detection)
- [ ] **Economic Attacks**:
  - [ ] Vault bank run (simultaneous withdrawals, verify queue)
  - [ ] Premium front-running (oracle update → instant policy, verify delay)
  - [ ] Arbitrage drain (cross-chain price diff, verify limits)
- [ ] **Access Control**:
  - [ ] Non-admin pause (verify rejection)
  - [ ] Unauthorized factory deployment (verify rejection)
  - [ ] SBT forgery (invalid ZK proof, verify rejection)
- [ ] **Message Handling**:
  - [ ] Bounce message loops (child → factory → child, verify circuit breaker)
  - [ ] Cross-shard message loss (simulate timeout, verify retry/refund)
  - [ ] Out-of-order nonces (send 5, 3, 4, verify rejection of 3)

---

## PHASE 9: TESTNET DEPLOYMENT (Week 6)

### 9.1 Deployment Scripts
- [ ] Salt pre-computation scripts (find addresses for 0x00, 0x10, 0x20, 0x30, 0x40, 0xF0)
- [ ] Deployment sequence (GasWallet → SBTVerifier → MasterFactory → Vaults)
- [ ] Post-deployment verification (shard addresses, contract links)
- [ ] Configuration scripts (set factory addresses, oracle keepers, admin multisig)

### 9.2 Testnet Deployment
- [ ] Deploy GasWallet (Shard 0x00)
- [ ] Deploy SBTVerifier (Shard 0x00)
- [ ] Deploy MasterFactory (Shard 0x00)
- [ ] Deploy PolicyNFTMinter (Shard 0x00)
- [ ] Deploy MultiTrancheVault (Shard 0xF0)
- [ ] Deploy PriceOracle (Shard 0xF0)
- [ ] Configure cross-contract addresses
- [ ] Verify shard placement (check each address prefix)
- [ ] Run smoke tests (1 policy per product type)

### 9.3 Testnet Monitoring (2 weeks)
- [ ] Monitor transaction success rates (>99% target)
- [ ] Monitor gas costs (verify 20-30% savings vs V2)
- [ ] Monitor cross-shard message latency (<10 sec target)
- [ ] Monitor bounced message rates (<1% target)
- [ ] Simulate attacks (DoS, oracle manipulation, reentrancy)
- [ ] Collect user feedback (5-10 beta testers)
- [ ] Performance profiling (identify bottlenecks)

---

## PHASE 10: MAINNET PREPARATION (Week 7)

### 10.1 Documentation
- [ ] User guide (policy creation via Telegram, web, direct contract)
- [ ] Developer guide (integrate V3 contracts, event subscriptions)
- [ ] Security audit report (Certik/SlowMist/Zellic)
- [ ] Deployment postmortem (testnet learnings)
- [ ] Gas optimization guide (best practices for users)

### 10.2 Mainnet Deployment
- [ ] Coordinate with auditors (review testnet findings)
- [ ] Final code freeze (no changes after audit)
- [ ] Mainnet salt pre-computation (fresh addresses)
- [ ] Gradual rollout:
  - Week 1: $50K coverage limit, invite-only
  - Week 2: $200K limit, public launch
  - Week 3: $500K limit
  - Month 2: $2M limit
  - Month 3+: Full capacity ($10M+)
- [ ] Multi-sig setup (3-of-5 admin control)
- [ ] Emergency pause procedures (documented, tested)
- [ ] Monitoring dashboards (Grafana, on-chain analytics)

---

## SUCCESS METRICS

### Technical Metrics
- [ ] **Test Coverage**: 95%+ contracts, 90%+ services
- [ ] **Gas Efficiency**: 20-30% savings vs V2 (0.04 TON vs 0.055 TON per policy)
- [ ] **Transaction Success Rate**: >99% (testnet, 2 weeks)
- [ ] **Cross-Shard Latency**: <10 seconds average
- [ ] **Bounced Message Rate**: <1%

### Security Metrics
- [ ] **Zero critical vulnerabilities** (audit report)
- [ ] **DoS resistance**: >1000 tx/sec without degradation
- [ ] **No reentrancy exploits** (all guards tested)
- [ ] **Oracle consensus**: 100% uptime on testnet

### Product Metrics
- [ ] **Policy creation time**: <5 seconds (user perception)
- [ ] **Supported products**: 4 categories, 16+ assets
- [ ] **Modular expansion**: Add new asset in <1 week
- [ ] **TradFi integration**: Allianz reinsurance operational

---

## RISK MITIGATION

### Technical Risks
- **Shard deployment failure**: Pre-compute 10k salts, have fallback addresses
- **Cross-shard message loss**: Implement retry logic with 5 min timeout
- **Gas cost variance**: Buffer 0.05 TON per operation, refund excess
- **Oracle downtime**: 3/5 consensus, 30 min staleness limit

### Security Risks
- **DoS attacks**: Rate limiting (5/min), early validation (~1k gas)
- **Oracle manipulation**: Multi-source (3 providers), median aggregation
- **Smart contract bugs**: External audit (2-3 weeks), bug bounty ($50K)
- **Economic exploits**: Coverage limits ($50K → $2M gradual), circuit breakers

### Operational Risks
- **Team capacity**: 1 FunC dev + 1 TypeScript dev minimum
- **Testnet delays**: 2 week buffer, can extend if issues found
- **Audit timeline**: Book auditor 4 weeks in advance
- **Mainnet rollback**: Multi-sig pause, emergency upgrade procedures

---

## NEXT STEPS

**Immediate** (Week 1):
1. Start Phase 2.1: Write security_helpers.fc library
2. Start Phase 2.2: Implement GasWallet.fc
3. Set up testing infrastructure (jest, ton-sandbox)

**Short-term** (Week 2-3):
1. Complete security foundation (GasWallet, SBTVerifier)
2. Implement MasterFactory with shard-aware routing
3. Begin product sub-factories

**Mid-term** (Week 4-5):
1. Complete all asset children
2. Integrate vault system
3. Comprehensive testing (250+ unit tests)

**Long-term** (Week 6-7):
1. Testnet deployment and monitoring
2. External security audit
3. Mainnet preparation and gradual rollout
