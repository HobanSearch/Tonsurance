"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyShard = void 0;
exports.policyShardConfigToCell = policyShardConfigToCell;
const core_1 = require("@ton/core");
function policyShardConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeUint(config.shardId, 8)
        .storeAddress(config.routerAddress)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeUint(config.shardPolicyCount, 32)
        .storeBit(config.paused)
        .storeDict(config.policiesDict)
        .endCell();
}
class PolicyShard {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new PolicyShard(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = policyShardConfigToCell(config);
        const init = { code, data };
        return new PolicyShard((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    // ========================
    // SEND METHODS (Internal - called by Router/ClaimsProcessor)
    // ========================
    /**
     * Mark policy as claimed (only ClaimsProcessor can call)
     */
    async sendMarkClaimed(provider, via, value, policyId) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x03, 32) // OP_MARK_CLAIMED
                .storeUint(policyId, 64)
                .endCell(),
        });
    }
    /**
     * Deactivate policy (cancellation/expiry)
     */
    async sendDeactivatePolicy(provider, via, value, policyId) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x04, 32) // OP_DEACTIVATE_POLICY
                .storeUint(policyId, 64)
                .endCell(),
        });
    }
    // ========================
    // ADMIN OPERATIONS
    // ========================
    async sendPause(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x10, 32) // OP_PAUSE
                .endCell(),
        });
    }
    async sendUnpause(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x11, 32) // OP_UNPAUSE
                .endCell(),
        });
    }
    async sendSetClaimsProcessor(provider, via, value, newProcessor) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x12, 32) // OP_SET_CLAIMS_PROCESSOR
                .storeAddress(newProcessor)
                .endCell(),
        });
    }
    // ========================
    // GETTER METHODS
    // ========================
    /**
     * Get full policy data
     */
    async getPolicyData(provider, policyId) {
        const result = await provider.get('get_policy_data', [
            { type: 'int', value: policyId },
        ]);
        return {
            policyId: result.stack.readBigNumber(),
            userAddress: result.stack.readAddress(),
            coverageType: Number(result.stack.readBigNumber()),
            chainId: Number(result.stack.readBigNumber()),
            stablecoinId: Number(result.stack.readBigNumber()),
            coverageAmount: result.stack.readBigNumber(),
            startTime: result.stack.readBigNumber(),
            endTime: result.stack.readBigNumber(),
            active: result.stack.readBigNumber() === 1n,
            claimed: result.stack.readBigNumber() === 1n,
            premium: result.stack.readBigNumber(),
        };
    }
    /**
     * Get policy status (active/claimed)
     */
    async getPolicyStatus(provider, policyId) {
        const result = await provider.get('get_policy_status', [
            { type: 'int', value: policyId },
        ]);
        return {
            exists: result.stack.readBigNumber() === 1n,
            active: result.stack.readBigNumber() === 1n,
            claimed: result.stack.readBigNumber() === 1n,
            expired: result.stack.readBigNumber() === 1n,
        };
    }
    /**
     * Get user's policies in this shard
     */
    async getUserPolicies(provider, userAddress) {
        const result = await provider.get('get_user_policies', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(userAddress).endCell() }
        ]);
        const count = Number(result.stack.readBigNumber());
        const policyIds = [];
        // Read policy IDs from stack
        for (let i = 0; i < count; i++) {
            policyIds.push(result.stack.readBigNumber());
        }
        return { policyIds, count };
    }
    /**
     * Get this shard's ID
     */
    async getShardId(provider) {
        const result = await provider.get('get_shard_id', []);
        return Number(result.stack.readBigNumber());
    }
    /**
     * Get number of policies in this shard
     */
    async getPolicyCount(provider) {
        const result = await provider.get('get_policy_count', []);
        return result.stack.readBigNumber();
    }
    async getPaused(provider) {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }
    async getOwner(provider) {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }
    async getRouter(provider) {
        const result = await provider.get('get_router', []);
        return result.stack.readAddress();
    }
    async getClaimsProcessor(provider) {
        const result = await provider.get('get_claims_processor', []);
        return result.stack.readAddress();
    }
    /**
     * Check if a policy exists in this shard
     */
    async policyExists(provider, policyId) {
        try {
            const status = await this.getPolicyStatus(provider, policyId);
            return status.exists;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Verify that a policy ID belongs to this shard
     */
    static validateShardAssignment(policyId, shardId) {
        return Number(policyId % 256n) === shardId;
    }
}
exports.PolicyShard = PolicyShard;
