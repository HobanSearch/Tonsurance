# Tonsurance Project - Remaining TODOs

**Last Updated:** October 16, 2025

This document lists the remaining implementation tasks required to get the Tonsurance protocol to a production-ready state. The core architecture has been refactored, and critical bugs have been fixed. The remaining work is primarily implementation based on the established patterns.

---

### In Progress: MultiTrancheVault Contract

- [x] **Fix Dictionary Access Mismatch** - Changed `udict_get?` to `udict_get_ref?` to match `udict_set_ref`
- [x] **Implement Admin Operations** - Added pause/unpause/set_admin/set_claims_processor/set_tranche_token handlers
- [x] **Implement Loss Absorption** - Complete waterfall logic with circuit breaker and insolvency detection
- [x] **Fix Compilation Errors** - Removed duplicate `is_null_address()` (exists in async_helpers.fc), added forward declarations for bounce handlers
- [x] **Implement Test Mode** - Added test_mode flag to bypass token minting/burning for tests
  - ✅ Added test_mode to contract storage (1 bit)
  - ✅ Modified deposit() to skip async token minting in test mode
  - ✅ Modified withdraw() to skip async token burning and send funds directly in test mode
  - ✅ Updated TypeScript wrapper config to support testMode field
  - ✅ Updated tests to enable testMode: true
  - ✅ Created store_depositor_balance() helper function
- [x] **Fix Critical Test Mode Bugs** - Fixed two bugs preventing deposits from working
  - ✅ Fixed `~ test_mode` boolean logic bug → changed to `test_mode == 0`
  - ✅ Fixed null address storage bug → changed from `storeSlice(nullAddr)` to `storeAddress(dummyAddr)`
  - ✅ Tests improved from initial broken state to 39/58 passing (67%)
- [ ] **Debug Remaining 19 Test Failures** - Tests at 39/58 passing (67%)
  - Most failures are in advanced scenarios (waterfall loss absorption, edge cases, NAV calculation)
  - Core deposit/withdraw/pause/admin operations are working
  - **Next steps**: Investigate specific failing tests individually
- [ ] **Optimize Gas Usage** - Current `distribute_premiums` needs optimization per todo note

### Priority 1: High (Core Feature Completion)

- [ ] **Complete Database Function Implementation:**
  - **File:** `backend/db/escrow_db.ml`
  - **Task:** The module for escrow-related database queries is only partially complete. All functions marked with `(* ... mock implementation ... *)` or that return `Error "Not Implemented"` need to be fully implemented with real `caqti` queries, following the pattern established in `get_escrow` and `insert_dispute`.

- [ ] **Complete Smart Contract Logic:**
  - **File:** `contracts/core/MultiTrancheVault.fc`
  - **Task:** The `distribute_premiums` function needs to be fully implemented and tested for gas efficiency. The current implementation is a simple placeholder. The complex, gas-intensive logic that was there previously should be replaced with a more efficient "pull" or batched-push pattern.

- [ ] **Implement Full Oracle Integration:**
  - **File:** `contracts/core/ClaimsProcessor.fc`
  - **Task:** The contract is now architected to work with external oracle adapters, but the adapters themselves do not exist. Your team needs to write and deploy the oracle smart contracts that can verify external events (e.g., by checking other blockchains) and call the `receive_verification` function on the `ClaimsProcessor`.

- [ ] **Port the AI Inference Server:**
  - **File:** `backend/tonny/tonny_server.py`
  - **Task:** The Python server for the AI assistant uses `mlx_lm`, which only runs on Apple Silicon. This server must be ported to a standard, cross-platform framework (like `HuggingFace TGI`, `vLLM`, or a basic `transformers` implementation with `FastAPI`) and containerized for production deployment on Linux/GPU instances.

### Priority 2: Medium (Testing & Frontend)

- [ ] **Fix Remaining Broken Tests:**
  - **Directory:** `tests/contracts/`
  - **Task:** While the most critical tests have been fixed, other test files that depended on the old vault architecture may still be broken. The entire test suite should be run, and any remaining failures should be fixed following the pattern established in `ClaimsProcessor.spec.ts`.

- [ ] **Implement Frontend Mini-App:**
  - **Directory:** `frontend/`
  - **Task:** As discussed, the implementation for the Telegram Mini App is missing. This involves adding the `@twa-dev/sdk`, creating the `TelegramContext.tsx`, and wrapping the main application in `main.tsx` as detailed in `MINI_APP_GUIDE.md`.

### Priority 3: Low (Cleanup & Polish)

- [ ] **Final Documentation Review:**
  - **Directory:** `docs/` and root `.md` files.
  - **Task:** Review all remaining documentation to ensure it is consistent with the final, refactored architecture.

- [ ] **Review and Complete `TODO`s:**
  - **Task:** Search the codebase for any remaining `TODO` or `FIXME` comments and address them.

### Smart Contract Todos

#### High Priority
- [ ] **`contracts/core/MultiTrancheVault.fc`**: Implement the `vault_handle_mint_bounce` and `vault_handle_burn_bounce` functions to ensure that failed token minting/burning operations are correctly handled and that the vault's state remains consistent. This is critical for the safety of LP funds.
- [ ] **`contracts/phase3/ComplianceGateway.fc`**: The `check_compliance_status` function needs to be fully implemented to query the compliance registry and return the correct status. This is a critical security and legal requirement.
- [ ] **`contracts/phase3/TradFiBuffer.fc`**: The `check_compliance` function is a placeholder and needs to be implemented to call the `ComplianceGateway` contract.

#### Medium Priority
- [ ] **`contracts/core/ClaimsProcessor.fc`**: The logic for parsing and rebuilding the `claim_data` cell to update the status in `approve_claim` and `reject_claim` is incomplete.
- [ ] **`contracts/core/PolicyFactory.fc`**: The `on_bounce` function is a placeholder and needs to be implemented to handle bounced messages, especially for premium forwarding to the treasury.
- [ ] **`contracts/core/PolicyRouter.fc`**: The `handle_bounce` function is a placeholder and needs to be implemented to handle bounced messages from the shard contracts.
- [ ] **`contracts/oracles/CEXOracleAdapter.fc`**: The `check_ed25519_signature` function is a placeholder and needs to be implemented with actual signature verification.
- [ ] **`contracts/phase2/AdvancedPremiumDistributor.fc`**: The messages to the `referral_manager` and `oracle_rewards` contracts are not implemented.
- [ ] **`contracts/phase2/ReferralManager.fc`**: The logic to handle the case where there are no referrers needs to be implemented.
- [ ] **`contracts/tranches/*.fc`**: All the `SURE_*.fc` contracts have placeholder implementations for `calculate_jetton_wallet_state_init` and `calculate_jetton_wallet_address`. These need to be correctly implemented according to the TEP-74 standard.

#### Low Priority
- [ ] **Remove Obsolete Contracts**: The contracts in `contracts_old`, as well as `PrimaryVault.fc`, `SecondaryVault.fc`, and `SimplePremiumDistributor.fc`, should be removed to avoid confusion.
- [ ] **`contracts/hedged/*.fc`**: The hedged coverage contracts should either be fully integrated with the main system or moved to a separate feature branch until they are ready.
- [ ] **`contracts/token.fc`**: Remove this empty file.
