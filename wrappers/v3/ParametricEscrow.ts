import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    TupleBuilder,
} from '@ton/core';

export type ParametricEscrowConfig = {
    policyId: bigint;
    policyOwner: Address;
    vaultAddress: Address;
    oracleAddress: Address;
    adminAddress: Address;
    coverageAmount: bigint;
    collateralAmount: bigint;
    status: number;
    createdAt: number;
    expiryTimestamp: number;
    productType: number;
    assetId: number;
    triggerThreshold: number;
    triggerDuration: number;
    userShareBps: number;
    lpShareBps: number;
    stakerShareBps: number;
    protocolShareBps: number;
    arbiterShareBps: number;
    builderShareBps: number;
    adminShareBps: number;
    gasRefundBps: number;
    lpRewardsAddress: Address;
    stakerRewardsAddress: Address;
    protocolTreasuryAddress: Address;
    arbiterRewardsAddress: Address;
    builderRewardsAddress: Address;
    adminFeeAddress: Address;
};

export function parametricEscrowConfigToCell(config: ParametricEscrowConfig): Cell {
    const addressData1 = beginCell()
        .storeAddress(config.policyOwner)
        .storeAddress(config.vaultAddress)
        .endCell();

    const addressData2 = beginCell()
        .storeAddress(config.oracleAddress)
        .storeAddress(config.adminAddress)
        .endCell();

    const extData = beginCell()
        .storeUint(config.triggerThreshold, 32)
        .storeUint(config.triggerDuration, 32)
        .storeUint(config.userShareBps, 16)
        .storeUint(config.lpShareBps, 16)
        .storeUint(config.stakerShareBps, 16)
        .storeUint(config.protocolShareBps, 16)
        .storeUint(config.arbiterShareBps, 16)
        .storeUint(config.builderShareBps, 16)
        .storeUint(config.adminShareBps, 16)
        .storeUint(config.gasRefundBps, 16)
        .endCell();

    const partyData1 = beginCell()
        .storeAddress(config.lpRewardsAddress)
        .storeAddress(config.stakerRewardsAddress)
        .storeAddress(config.protocolTreasuryAddress)
        .endCell();

    const partyData2 = beginCell()
        .storeAddress(config.arbiterRewardsAddress)
        .storeAddress(config.builderRewardsAddress)
        .storeAddress(config.adminFeeAddress)
        .endCell();

    // Nest party data to avoid 5-ref overflow (max 4 refs per cell)
    const partyRoot = beginCell()
        .storeRef(partyData1)
        .storeRef(partyData2)
        .endCell();

    return beginCell()
        .storeUint(config.policyId, 64)
        .storeRef(addressData1)
        .storeRef(addressData2)
        .storeCoins(config.coverageAmount)
        .storeCoins(config.collateralAmount)
        .storeUint(config.status, 8)
        .storeUint(config.createdAt, 32)
        .storeUint(config.expiryTimestamp, 32)
        .storeUint(config.productType, 8)
        .storeUint(config.assetId, 16)
        .storeRef(extData)
        .storeRef(partyRoot)
        .endCell();
}

// Status constants
export const STATUS_PENDING = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_PAID_OUT = 2;
export const STATUS_EXPIRED = 3;
export const STATUS_DISPUTED = 4;
export const STATUS_CANCELLED = 5;

// Product types
export const PRODUCT_TYPE_DEPEG = 1;
export const PRODUCT_TYPE_BRIDGE = 2;
export const PRODUCT_TYPE_ORACLE = 3;
export const PRODUCT_TYPE_PROTOCOL = 4;

// Default distribution (8-party split in basis points, sum = 10000)
export const DEFAULT_USER_SHARE_BPS = 9000; // 90%
export const DEFAULT_LP_SHARE_BPS = 300; // 3%
export const DEFAULT_STAKER_SHARE_BPS = 200; // 2%
export const DEFAULT_PROTOCOL_SHARE_BPS = 150; // 1.5%
export const DEFAULT_ARBITER_SHARE_BPS = 100; // 1%
export const DEFAULT_BUILDER_SHARE_BPS = 100; // 1%
export const DEFAULT_ADMIN_SHARE_BPS = 100; // 1%
export const DEFAULT_GAS_REFUND_BPS = 50; // 0.5%

// Dispute resolution types
export const RESOLUTION_REFUND_VAULT = 0;
export const RESOLUTION_PAY_USER = 1;
export const RESOLUTION_SPLIT = 2;

export class ParametricEscrow implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new ParametricEscrow(address);
    }

    static createFromConfig(config: ParametricEscrowConfig, code: Cell, workchain = 0) {
        const data = parametricEscrowConfigToCell(config);
        const init = { code, data };
        return new ParametricEscrow(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendInitialize(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x01, 32).endCell(),
        });
    }

    async sendTriggerClaim(provider: ContractProvider, via: Sender, opts: { value: bigint; triggerProof: Cell }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x03, 32).storeRef(opts.triggerProof).endCell(),
        });
    }

    async sendHandleExpiry(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x04, 32).endCell(),
        });
    }

    async sendFreezeDispute(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x05, 32).endCell(),
        });
    }

    async sendResolveDispute(provider: ContractProvider, via: Sender, opts: { value: bigint; resolution: number }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x06, 32).storeUint(opts.resolution, 8).endCell(),
        });
    }

    async sendEmergencyWithdraw(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x07, 32).endCell(),
        });
    }

    async getEscrowInfo(
        provider: ContractProvider
    ): Promise<{ policyId: bigint; policyOwner: Address; coverageAmount: bigint; status: number; expiryTimestamp: number }> {
        const result = await provider.get('get_escrow_info', []);
        return {
            policyId: result.stack.readBigNumber(),
            policyOwner: result.stack.readAddress(),
            coverageAmount: result.stack.readBigNumber(),
            status: Number(result.stack.readBigNumber()),
            expiryTimestamp: Number(result.stack.readBigNumber()),
        };
    }

    async getStatus(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_status', []);
        return Number(result.stack.readBigNumber());
    }

    async getPolicyId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_policy_id', []);
        return result.stack.readBigNumber();
    }

    async getPolicyOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_policy_owner', []);
        return result.stack.readAddress();
    }

    async getCoverageAmount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_coverage_amount', []);
        return result.stack.readBigNumber();
    }

    async getCollateralAmount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_collateral_amount', []);
        return result.stack.readBigNumber();
    }

    async getExpiryTimestamp(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_expiry_timestamp', []);
        return Number(result.stack.readBigNumber());
    }

    async getTimeRemaining(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_time_remaining', []);
        return Number(result.stack.readBigNumber());
    }

    async getTriggerParams(provider: ContractProvider): Promise<{ triggerThreshold: number; triggerDuration: number }> {
        const result = await provider.get('get_trigger_params', []);
        return {
            triggerThreshold: Number(result.stack.readBigNumber()),
            triggerDuration: Number(result.stack.readBigNumber()),
        };
    }

    async getProductInfo(
        provider: ContractProvider
    ): Promise<{ productType: number; assetId: number; triggerThreshold: number; triggerDuration: number }> {
        const result = await provider.get('get_product_info', []);
        return {
            productType: Number(result.stack.readBigNumber()),
            assetId: Number(result.stack.readBigNumber()),
            triggerThreshold: Number(result.stack.readBigNumber()),
            triggerDuration: Number(result.stack.readBigNumber()),
        };
    }

    async getDistribution(
        provider: ContractProvider
    ): Promise<{
        userShareBps: number;
        lpShareBps: number;
        stakerShareBps: number;
        protocolShareBps: number;
        arbiterShareBps: number;
        builderShareBps: number;
        adminShareBps: number;
        gasRefundBps: number;
    }> {
        const result = await provider.get('get_distribution', []);
        return {
            userShareBps: Number(result.stack.readBigNumber()),
            lpShareBps: Number(result.stack.readBigNumber()),
            stakerShareBps: Number(result.stack.readBigNumber()),
            protocolShareBps: Number(result.stack.readBigNumber()),
            arbiterShareBps: Number(result.stack.readBigNumber()),
            builderShareBps: Number(result.stack.readBigNumber()),
            adminShareBps: Number(result.stack.readBigNumber()),
            gasRefundBps: Number(result.stack.readBigNumber()),
        };
    }

    async getVaultAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_vault_address', []);
        return result.stack.readAddress();
    }

    async getOracleAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_oracle_address', []);
        return result.stack.readAddress();
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

/**
 * Gets status name from status code
 */
export function getStatusName(status: number): string {
    switch (status) {
        case STATUS_PENDING:
            return 'Pending';
        case STATUS_ACTIVE:
            return 'Active';
        case STATUS_PAID_OUT:
            return 'Paid Out';
        case STATUS_EXPIRED:
            return 'Expired';
        case STATUS_DISPUTED:
            return 'Disputed';
        case STATUS_CANCELLED:
            return 'Cancelled';
        default:
            return 'Unknown';
    }
}

/**
 * Calculates 8-party distribution amounts
 */
export function calculateDistribution(
    coverageAmount: bigint,
    distribution: {
        userShareBps: number;
        lpShareBps: number;
        stakerShareBps: number;
        protocolShareBps: number;
        arbiterShareBps: number;
        builderShareBps: number;
        adminShareBps: number;
        gasRefundBps: number;
    }
): {
    user: bigint;
    lp: bigint;
    staker: bigint;
    protocol: bigint;
    arbiter: bigint;
    builder: bigint;
    admin: bigint;
    gasRefund: bigint;
} {
    return {
        user: (coverageAmount * BigInt(distribution.userShareBps)) / 10000n,
        lp: (coverageAmount * BigInt(distribution.lpShareBps)) / 10000n,
        staker: (coverageAmount * BigInt(distribution.stakerShareBps)) / 10000n,
        protocol: (coverageAmount * BigInt(distribution.protocolShareBps)) / 10000n,
        arbiter: (coverageAmount * BigInt(distribution.arbiterShareBps)) / 10000n,
        builder: (coverageAmount * BigInt(distribution.builderShareBps)) / 10000n,
        admin: (coverageAmount * BigInt(distribution.adminShareBps)) / 10000n,
        gasRefund: (coverageAmount * BigInt(distribution.gasRefundBps)) / 10000n,
    };
}
