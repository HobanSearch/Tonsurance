# TypeScript Wrappers Guide

## Overview
This document outlines the TypeScript wrapper implementation for all Tonsurance Phase 1-3 smart contracts.

## Wrapper Architecture

Each contract requires two files:
1. **{ContractName}.ts** - TypeScript wrapper class
2. **{ContractName}.compile.ts** - Compilation configuration

### Standard Wrapper Pattern

```typescript
import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ContractNameConfig = {
    // Contract storage fields
};

export function contractNameConfigToCell(config: ContractNameConfig): Cell {
    // Serialize config to Cell matching contract storage layout
}

export class ContractName implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ContractName(address);
    }

    static createFromConfig(config: ContractNameConfig, code: Cell, workchain = 0) {
        const data = contractNameConfigToCell(config);
        const init = { code, data };
        return new ContractName(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        // Deploy contract
    }

    // Message senders for each operation (op code)
    async sendOperationName(provider: ContractProvider, via: Sender, opts: {...}) {
        // Send internal message with op code and parameters
    }

    // Getters for each get method
    async getMethodName(provider: ContractProvider): Promise<Type> {
        // Call get method and return result
    }
}
```

### Compile Configuration Pattern

```typescript
import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['contracts/path/ContractName.fc'],
};
```

## Contract Wrappers Status

### Phase 1 Core (7 contracts)
- ✅ PolicyFactory.ts + .compile.ts
- ✅ PrimaryVault.ts + .compile.ts
- ✅ SecondaryVault.ts + .compile.ts
- ✅ Treasury.ts + .compile.ts
- ⏳ SimplePremiumDistributor.ts + .compile.ts
- ⏳ ClaimsProcessor.ts + .compile.ts
- ⏳ SUREToken.ts + .compile.ts

### Phase 2 Multi-Party (6 contracts)
- ⏳ AdvancedPremiumDistributor.ts + .compile.ts
- ⏳ ReferralManager.ts + .compile.ts
- ⏳ ShieldLP.ts + .compile.ts
- ⏳ ShieldStake.ts + .compile.ts
- ⏳ OracleRewards.ts + .compile.ts
- ⏳ GovernanceRewards.ts + .compile.ts

### Phase 3 TradFi (4 contracts)
- ⏳ TradFiBuffer.ts + .compile.ts
- ⏳ ComplianceGateway.ts + .compile.ts
- ⏳ ShieldInst.ts + .compile.ts
- ⏳ PriceOracle.ts + .compile.ts

## Operation Codes Reference

### PolicyFactory
- 0x01: create_policy
- 0x10: set_treasury
- 0x11: set_price_oracle

### PrimaryVault
- 0x01: deposit_lp_capital
- 0x02: withdraw_lp_capital
- 0x03: receive_premium_share
- 0x04: absorb_claim_loss

### SecondaryVault
- 0x01: stake_sure
- 0x02: unstake_sure
- 0x03: receive_premium_share
- 0x04: absorb_claim_loss

### SimplePremiumDistributor
- 0x01: distribute_premium
- 0x10: set_primary_vault
- 0x11: set_secondary_vault

### ClaimsProcessor
- 0x01: file_claim
- 0x02: vote_on_claim
- 0x03: finalize_claim_vote
- 0x10: add_verified_event

### Treasury
- 0x01: receive_premium
- 0x04: receive_protocol_share
- 0x05: receive_reserve_share
- 0x06: process_payout
- 0x20: emergency_withdraw

### SUREToken
- 21: mint
- 0x595f07bc: burn_notification

### AdvancedPremiumDistributor
- 0x01: distribute_premium
- 0x10: set_primary_vault
- 0x11: set_referral_manager
- 0x12: set_oracle_rewards
- 0x13: set_governance_rewards
- 0x14: set_tradfi_buffer

### ReferralManager
- 0x01: register_referral
- 0x03: distribute_referral_rewards

### OracleRewards
- 0x01: register_oracle
- 0x02: record_oracle_update
- 0x03: claim_rewards
- 0x04: distribute_oracle_fee

### GovernanceRewards
- 0x01: register_voter
- 0x02: record_vote
- 0x03: claim_rewards
- 0x05: receive_governance_share

### TradFiBuffer
- 0x01: deposit_capital
- 0x02: withdraw_capital
- 0x04: absorb_claim_loss
- 0x06: receive_premium_share

### ComplianceGateway
- 0x01: submit_kyc_application
- 0x02: approve_kyc
- 0x03: reject_kyc
- 0x04: revoke_compliance
- 0x10: add_admin
- 0x11: remove_admin

### PriceOracle
- 0x01: register_keeper
- 0x02: update_price
- 0x10: deactivate_keeper

### SHIELD Tokens (LP/STAKE/INST)
- 21: mint
- 0x595f07bc: burn_notification
- 0x10: set_vault_address
- 0x11: toggle_mintable

## Testing Integration

Each wrapper should have corresponding test file in `tests/`:
- Unit tests using @ton/sandbox
- Integration tests with related contracts
- Target: 95%+ coverage for critical paths

## Next Steps

1. Complete remaining 13 wrappers following the standard pattern
2. Create comprehensive test suite (170+ tests)
3. Create deployment scripts for all contracts
4. Update main documentation with wrapper usage examples
