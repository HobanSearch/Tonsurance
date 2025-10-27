import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export declare const EscrowStatus: {
    readonly PENDING: 0;
    readonly ACTIVE: 1;
    readonly RELEASED: 2;
    readonly CANCELLED: 3;
    readonly DISPUTED: 4;
    readonly TIMED_OUT: 5;
};
export type TimeoutAction = {
    type: 'refund_payer';
} | {
    type: 'release_payee';
} | {
    type: 'split';
    percentage: number;
};
export type PartyAllocation = {
    address: Address;
    percentage: number;
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
export declare function parametricEscrowConfigToCell(config: ParametricEscrowConfig): Cell;
export declare class ParametricEscrow implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): ParametricEscrow;
    static createFromConfig(config: ParametricEscrowConfig, code: Cell, workchain?: number): ParametricEscrow;
    /**
     * Deploy and initialize the escrow contract
     * The payer sends the escrowed amount as msg_value
     */
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    /**
     * Release escrow funds to payee (simple release without additional parties)
     * Only oracle can call this
     */
    sendRelease(provider: ContractProvider, via: Sender, opts: {
        conditionHash: bigint;
        value?: bigint;
    }): Promise<void>;
    /**
     * Release escrow funds to multiple parties
     * Only oracle can call this
     */
    sendMultiPartyRelease(provider: ContractProvider, via: Sender, opts: {
        conditionHash: bigint;
        additionalParties: PartyAllocation[];
        value?: bigint;
    }): Promise<void>;
    /**
     * Cancel escrow and refund payer
     * Only payer or payee can call this
     */
    sendCancel(provider: ContractProvider, via: Sender, opts?: {
        value?: bigint;
    }): Promise<void>;
    /**
     * Handle timeout based on configured timeout action
     * Anyone can trigger this after timeout
     */
    sendHandleTimeout(provider: ContractProvider, via: Sender, opts?: {
        value?: bigint;
    }): Promise<void>;
    /**
     * Freeze escrow for dispute
     * Only oracle can call this
     */
    sendFreeze(provider: ContractProvider, via: Sender, opts?: {
        value?: bigint;
    }): Promise<void>;
    /**
     * Update oracle address
     * Only current oracle can call this
     */
    sendUpdateOracle(provider: ContractProvider, via: Sender, opts: {
        newOracle: Address;
        value?: bigint;
    }): Promise<void>;
    /**
     * Emergency withdraw after dispute timeout (30 days)
     * Only payer can call this
     */
    sendEmergencyWithdraw(provider: ContractProvider, via: Sender, opts?: {
        value?: bigint;
    }): Promise<void>;
    /**
     * Get complete escrow data
     */
    getEscrowData(provider: ContractProvider): Promise<{
        escrowId: bigint;
        payer: Address;
        payee: Address;
        oracle: Address;
        amount: bigint;
        status: number;
        timeoutAt: number;
        timeoutAction: number;
    }>;
    /**
     * Get escrow status
     */
    getStatus(provider: ContractProvider): Promise<number>;
    /**
     * Check if escrow is timed out
     */
    isTimedOut(provider: ContractProvider): Promise<boolean>;
    /**
     * Get escrow amount
     */
    getAmount(provider: ContractProvider): Promise<bigint>;
    /**
     * Get condition hash
     */
    getConditionHash(provider: ContractProvider): Promise<bigint>;
    /**
     * Get additional parties count
     */
    getAdditionalPartiesCount(provider: ContractProvider): Promise<number>;
    /**
     * Get additional party by index
     */
    getAdditionalParty(provider: ContractProvider, index: number): Promise<{
        address: Address;
        percentage: number;
    }>;
    /**
     * Get protection policy ID
     */
    getProtectionPolicyId(provider: ContractProvider): Promise<bigint>;
    /**
     * Get timeout details
     */
    getTimeoutDetails(provider: ContractProvider): Promise<{
        timeoutAt: number;
        timeoutAction: number;
        splitPercentage: number;
    }>;
    /**
     * Get created timestamp
     */
    getCreatedAt(provider: ContractProvider): Promise<number>;
    /**
     * Get time remaining until timeout (in seconds)
     */
    getTimeRemaining(provider: ContractProvider): Promise<number>;
}
