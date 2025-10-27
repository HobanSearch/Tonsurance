import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, Dictionary } from '@ton/core';

export type PolicyShardConfig = {
    shardId: number;
    routerAddress: Address;
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    shardPolicyCount: number;
    paused: boolean;
    policiesDict: Cell | null; // Dict: uint64 -> policy_data
};

export function policyShardConfigToCell(config: PolicyShardConfig): Cell {
    return beginCell()
        .storeUint(config.shardId, 8)
        .storeAddress(config.routerAddress)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeUint(config.shardPolicyCount, 32)
        .storeBit(config.paused)
        .storeDict(undefined)  // policiesDict - empty dict initially
        .endCell();
}

export interface PolicyData {
    policyId: bigint;
    userAddress: Address;
    coverageType: number;
    chainId: number;
    stablecoinId: number;
    coverageAmount: bigint;
    startTime: bigint;
    endTime: bigint;
    active: boolean;
    claimed: boolean;
    premium: bigint;
}

export class PolicyShard implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new PolicyShard(address);
    }

    static createFromConfig(config: PolicyShardConfig, code: Cell, workchain = 0) {
        const data = policyShardConfigToCell(config);
        const init = { code, data };
        return new PolicyShard(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ========================
    // SEND METHODS (Internal - called by Router/ClaimsProcessor)
    // ========================

    /**
     * Mark policy as claimed (only ClaimsProcessor can call)
     */
    async sendMarkClaimed(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        policyId: bigint
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // OP_MARK_CLAIMED
                .storeUint(policyId, 64)
                .endCell(),
        });
    }

    /**
     * Deactivate policy (cancellation/expiry)
     */
    async sendDeactivatePolicy(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        policyId: bigint
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32) // OP_DEACTIVATE_POLICY
                .storeUint(policyId, 64)
                .endCell(),
        });
    }

    // ========================
    // ADMIN OPERATIONS
    // ========================

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // OP_PAUSE
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x11, 32) // OP_UNPAUSE
                .endCell(),
        });
    }

    async sendSetClaimsProcessor(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        newProcessor: Address
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
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
    async getPolicyData(provider: ContractProvider, policyId: bigint): Promise<PolicyData> {
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
    async getPolicyStatus(provider: ContractProvider, policyId: bigint): Promise<{
        exists: boolean;
        active: boolean;
        claimed: boolean;
        expired: boolean;
    }> {
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
    async getUserPolicies(provider: ContractProvider, userAddress: Address): Promise<{
        policyIds: bigint[];
        count: number;
    }> {
        const result = await provider.get('get_user_policies', [
            { type: 'slice', cell: beginCell().storeAddress(userAddress).endCell() }
        ]);
        const count = Number(result.stack.readBigNumber());
        const policyIds: bigint[] = [];

        // Read policy IDs from stack
        for (let i = 0; i < count; i++) {
            policyIds.push(result.stack.readBigNumber());
        }

        return { policyIds, count };
    }

    /**
     * Get this shard's ID
     */
    async getShardId(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_shard_id', []);
        return Number(result.stack.readBigNumber());
    }

    /**
     * Get number of policies in this shard
     */
    async getPolicyCount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_policy_count', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }

    async getRouter(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_router', []);
        return result.stack.readAddress();
    }

    async getClaimsProcessor(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_claims_processor', []);
        return result.stack.readAddress();
    }

    /**
     * Check if a policy exists in this shard
     */
    async policyExists(provider: ContractProvider, policyId: bigint): Promise<boolean> {
        try {
            const status = await this.getPolicyStatus(provider, policyId);
            return status.exists;
        } catch (error) {
            return false;
        }
    }

    /**
     * Verify that a policy ID belongs to this shard
     */
    static validateShardAssignment(policyId: bigint, shardId: number): boolean {
        return Number(policyId % 256n) === shardId;
    }
}
