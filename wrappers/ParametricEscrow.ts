import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

// Status constants
export const EscrowStatus = {
    PENDING: 0,
    ACTIVE: 1,
    RELEASED: 2,
    CANCELLED: 3,
    DISPUTED: 4,
    TIMED_OUT: 5,
} as const;

// Timeout action types
export type TimeoutAction =
    | { type: 'refund_payer' }
    | { type: 'release_payee' }
    | { type: 'split'; percentage: number };

// Party allocation for multi-party distribution
export type PartyAllocation = {
    address: Address;
    percentage: number;  // 0-100
};

export type ParametricEscrowConfig = {
    escrowId: bigint;
    payerAddress: Address;
    payeeAddress: Address;
    oracleAddress: Address;
    amount: bigint;
    status: number;
    createdAt: number;
    timeoutSeconds: number;
    timeoutAction: TimeoutAction;
    conditionHash: bigint;
    additionalParties?: PartyAllocation[];
    protectionPolicyId?: bigint;
};

// Helper to encode timeout action
function encodeTimeoutAction(action: TimeoutAction): { actionCode: number; splitPercentage: number } {
    switch (action.type) {
        case 'refund_payer':
            return { actionCode: 0, splitPercentage: 0 };
        case 'release_payee':
            return { actionCode: 1, splitPercentage: 0 };
        case 'split':
            return { actionCode: 2, splitPercentage: action.percentage };
    }
}

export function parametricEscrowConfigToCell(config: ParametricEscrowConfig): Cell {
    const { actionCode, splitPercentage } = encodeTimeoutAction(config.timeoutAction);
    const timeoutAt = config.createdAt + config.timeoutSeconds;

    // Build additional parties dictionary
    let additionalPartiesDict: Cell | null = null;
    if (config.additionalParties && config.additionalParties.length > 0) {
        const dict = beginCell().endCell();
        // TODO: Build proper dictionary from additional parties
        // For now, we'll leave it null and handle in the wrapper methods
    }

    // Pack additional data into reference cell (to avoid cell overflow)
    // Main cell: 3 addresses (801 bits) + escrowId (64) + amount (~100) + status/times (72) = ~1037 bits
    // Move condition_hash to ref cell to stay under 1023 bit limit
    const refData = beginCell()
        .storeUint(config.conditionHash, 256)
        .storeDict(additionalPartiesDict)
        .storeUint(config.protectionPolicyId || 0, 64)
        .endCell();

    return beginCell()
        .storeUint(config.escrowId, 64)
        .storeAddress(config.payerAddress)
        .storeAddress(config.payeeAddress)
        .storeAddress(config.oracleAddress)
        .storeCoins(config.amount)
        .storeUint(config.status, 8)
        .storeUint(config.createdAt, 32)
        .storeUint(timeoutAt, 32)
        .storeUint(actionCode, 8)
        .storeUint(splitPercentage, 8)
        .storeRef(refData)
        .endCell();
}

export class ParametricEscrow implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ParametricEscrow(address);
    }

    static createFromConfig(config: ParametricEscrowConfig, code: Cell, workchain = 0) {
        const data = parametricEscrowConfigToCell(config);
        const init = { code, data };
        return new ParametricEscrow(contractAddress(workchain, init), init);
    }

    /**
     * Deploy and initialize the escrow contract
     * The payer sends the escrowed amount as msg_value
     */
    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(1, 32)  // op: initialize
                .storeUint(0, 64)  // query_id
                .endCell(),
        });
    }

    /**
     * Release escrow funds to payee (simple release without additional parties)
     * Only oracle can call this
     */
    async sendRelease(
        provider: ContractProvider,
        via: Sender,
        opts: {
            conditionHash: bigint;
            value?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value || toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(2, 32)  // op: release
                .storeUint(0, 64)  // query_id
                .storeUint(opts.conditionHash, 256)
                .endCell(),
        });
    }

    /**
     * Release escrow funds to multiple parties
     * Only oracle can call this
     */
    async sendMultiPartyRelease(
        provider: ContractProvider,
        via: Sender,
        opts: {
            conditionHash: bigint;
            additionalParties: PartyAllocation[];
            value?: bigint;
        }
    ) {
        const body = beginCell()
            .storeUint(6, 32)  // op: multi_party_release
            .storeUint(0, 64)  // query_id
            .storeUint(opts.conditionHash, 256)
            .storeUint(opts.additionalParties.length, 8);

        // Add each party
        for (const party of opts.additionalParties) {
            body.storeAddress(party.address)
                .storeUint(party.percentage, 8);
        }

        await provider.internal(via, {
            value: opts.value || toNano('0.15'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body.endCell(),
        });
    }

    /**
     * Cancel escrow and refund payer
     * Only payer or payee can call this
     */
    async sendCancel(
        provider: ContractProvider,
        via: Sender,
        opts?: {
            value?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts?.value || toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(3, 32)  // op: cancel
                .storeUint(0, 64)  // query_id
                .endCell(),
        });
    }

    /**
     * Handle timeout based on configured timeout action
     * Anyone can trigger this after timeout
     */
    async sendHandleTimeout(
        provider: ContractProvider,
        via: Sender,
        opts?: {
            value?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts?.value || toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(4, 32)  // op: handle_timeout
                .storeUint(0, 64)  // query_id
                .endCell(),
        });
    }

    /**
     * Freeze escrow for dispute
     * Only oracle can call this
     */
    async sendFreeze(
        provider: ContractProvider,
        via: Sender,
        opts?: {
            value?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts?.value || toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(5, 32)  // op: freeze
                .storeUint(0, 64)  // query_id
                .endCell(),
        });
    }

    /**
     * Update oracle address
     * Only current oracle can call this
     */
    async sendUpdateOracle(
        provider: ContractProvider,
        via: Sender,
        opts: {
            newOracle: Address;
            value?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value || toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(7, 32)  // op: update_oracle
                .storeUint(0, 64)  // query_id
                .storeAddress(opts.newOracle)
                .endCell(),
        });
    }

    /**
     * Emergency withdraw after dispute timeout (30 days)
     * Only payer can call this
     */
    async sendEmergencyWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts?: {
            value?: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts?.value || toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(8, 32)  // op: emergency_withdraw
                .storeUint(0, 64)  // query_id
                .endCell(),
        });
    }

    // ==================== GET METHODS ====================

    /**
     * Get complete escrow data
     */
    async getEscrowData(provider: ContractProvider): Promise<{
        escrowId: bigint;
        payer: Address;
        payee: Address;
        oracle: Address;
        amount: bigint;
        status: number;
        timeoutAt: number;
        timeoutAction: number;
    }> {
        const result = await provider.get('get_escrow_data', []);
        return {
            escrowId: result.stack.readBigNumber(),
            payer: result.stack.readAddress(),
            payee: result.stack.readAddress(),
            oracle: result.stack.readAddress(),
            amount: result.stack.readBigNumber(),
            status: result.stack.readNumber(),
            timeoutAt: result.stack.readNumber(),
            timeoutAction: result.stack.readNumber(),
        };
    }

    /**
     * Get escrow status
     */
    async getStatus(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_status', []);
        return result.stack.readNumber();
    }

    /**
     * Check if escrow is timed out
     */
    async isTimedOut(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_is_timed_out', []);
        return result.stack.readNumber() === -1;  // FunC true
    }

    /**
     * Get escrow amount
     */
    async getAmount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_amount', []);
        return result.stack.readBigNumber();
    }

    /**
     * Get condition hash
     */
    async getConditionHash(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_condition_hash', []);
        return result.stack.readBigNumber();
    }

    /**
     * Get additional parties count
     */
    async getAdditionalPartiesCount(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_additional_parties_count', []);
        return result.stack.readNumber();
    }

    /**
     * Get additional party by index
     */
    async getAdditionalParty(provider: ContractProvider, index: number): Promise<{
        address: Address;
        percentage: number;
    }> {
        const result = await provider.get('get_additional_party', [{ type: 'int', value: BigInt(index) }]);
        return {
            address: result.stack.readAddress(),
            percentage: result.stack.readNumber(),
        };
    }

    /**
     * Get protection policy ID
     */
    async getProtectionPolicyId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_protection_policy_id', []);
        return result.stack.readBigNumber();
    }

    /**
     * Get timeout details
     */
    async getTimeoutDetails(provider: ContractProvider): Promise<{
        timeoutAt: number;
        timeoutAction: number;
        splitPercentage: number;
    }> {
        const result = await provider.get('get_timeout_details', []);
        return {
            timeoutAt: result.stack.readNumber(),
            timeoutAction: result.stack.readNumber(),
            splitPercentage: result.stack.readNumber(),
        };
    }

    /**
     * Get created timestamp
     */
    async getCreatedAt(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_created_at', []);
        return result.stack.readNumber();
    }

    /**
     * Get time remaining until timeout (in seconds)
     */
    async getTimeRemaining(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_time_remaining', []);
        return result.stack.readNumber();
    }
}
