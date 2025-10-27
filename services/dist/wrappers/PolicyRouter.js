"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyRouter = void 0;
exports.policyRouterConfigToCell = policyRouterConfigToCell;
const core_1 = require("@ton/core");
function policyRouterConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextPolicyId, 64)
        .storeUint(config.totalPolicies, 64)
        .storeBit(config.paused)
        .storeDict(config.shardAddresses)
        .storeAddress(config.treasuryAddress)
        .storeDict(config.pendingTxs)
        .storeUint(config.seqNo, 32)
        .endCell();
}
class PolicyRouter {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new PolicyRouter(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = policyRouterConfigToCell(config);
        const init = { code, data };
        return new PolicyRouter((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    // ========================
    // SEND METHODS (Policy Operations)
    // ========================
    /**
     * Create a new policy (routes to appropriate shard)
     * @param via Sender
     * @param value Premium amount + gas (0.3 TON recommended)
     * @param opts Policy parameters
     */
    async sendCreatePolicy(provider, via, value, opts) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // OP_CREATE_POLICY
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.chainId, 8)
                .storeUint(opts.stablecoinId, 8)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.durationDays, 16)
                .endCell(),
        });
    }
    /**
     * Cancel an active policy (must be owner)
     */
    async sendCancelPolicy(provider, via, value, policyId) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x02, 32) // OP_CANCEL_POLICY
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
    async sendRegisterShard(provider, via, value, shardId, shardAddress) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x12, 32) // OP_REGISTER_SHARD
                .storeUint(shardId, 8)
                .storeAddress(shardAddress)
                .endCell(),
        });
    }
    async sendSetTreasury(provider, via, value, newTreasury) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x13, 32) // OP_SET_TREASURY
                .storeAddress(newTreasury)
                .endCell(),
        });
    }
    // ========================
    // GETTER METHODS
    // ========================
    /**
     * Get the address of a specific shard
     */
    async getShardAddress(provider, shardId) {
        const result = await provider.get('get_shard_address', [
            { type: 'int', value: BigInt(shardId) },
        ]);
        return result.stack.readAddress();
    }
    /**
     * Get shard ID and address for a given policy ID
     */
    async getShardForPolicy(provider, policyId) {
        const result = await provider.get('get_shard_for_policy', [
            { type: 'int', value: policyId },
        ]);
        const shardId = Number(result.stack.readBigNumber());
        const shardAddress = result.stack.readAddress();
        return { shardId, shardAddress };
    }
    /**
     * Get the next policy ID that will be assigned
     */
    async getNextPolicyId(provider) {
        const result = await provider.get('get_next_policy_id', []);
        return result.stack.readBigNumber();
    }
    /**
     * Get total number of policies across all shards
     */
    async getTotalPolicies(provider) {
        const result = await provider.get('get_total_policies', []);
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
    async getTreasury(provider) {
        const result = await provider.get('get_treasury', []);
        return result.stack.readAddress();
    }
    async getSeqNo(provider) {
        const result = await provider.get('get_seq_no', []);
        return result.stack.readBigNumber();
    }
    /**
     * Calculate which shard a policy ID belongs to
     */
    static calculateShardId(policyId) {
        return Number(policyId % 256n);
    }
}
exports.PolicyRouter = PolicyRouter;
