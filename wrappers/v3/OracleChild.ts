import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary
} from '@ton/core';

export type OracleChildConfig = {
    parentFactoryAddress: Address;
    masterFactoryAddress: Address;
    productType: number; // = 3 (PRODUCT_ORACLE)
    assetId: number;
    policyNFTMinterAddress: Address;
    vaultAddress: Address;
    oracleMonitorAddress: Address;
    policyRegistry: Dictionary<bigint, Cell>;
    nextPolicyId: bigint;
    totalPoliciesCreated: bigint;
    totalCoverageAmount: bigint;
    paused: boolean;
};

export function oracleChildConfigToCell(config: OracleChildConfig): Cell {
    // Build address reference (3 addresses = 801 bits)
    const addrRef1 = beginCell()
        .storeAddress(config.policyNFTMinterAddress)
        .storeAddress(config.vaultAddress)
        .storeAddress(config.oracleMonitorAddress)
        .endCell();

    return beginCell()
        .storeAddress(config.parentFactoryAddress)
        .storeAddress(config.masterFactoryAddress)
        .storeUint(config.productType, 8)
        .storeUint(config.assetId, 16)
        .storeRef(addrRef1)  // Store addresses in reference
        .storeDict(config.policyRegistry)
        .storeUint(config.nextPolicyId, 64)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeCoins(config.totalCoverageAmount)
        .storeBit(config.paused)
        .endCell();
}

export const BASE_APR_BPS = 150; // 1.5% annual
export const ORACLE_STALENESS_THRESHOLD_SECONDS = 1800; // 30 minutes
export const ORACLE_DEVIATION_THRESHOLD_BPS = 500; // 5% deviation

export class OracleChild implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new OracleChild(address);
    }

    static createFromConfig(config: OracleChildConfig, code: Cell, workchain = 0) {
        const data = oracleChildConfigToCell(config);
        const init = { code, data };
        return new OracleChild(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendCreatePolicyFromFactory(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; userAddress: Address; policyParams: Cell }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x40, 32)
                .storeAddress(opts.userAddress)
                .storeRef(opts.policyParams)
                .endCell(),
        });
    }

    async sendSetPolicyNFTMinter(provider: ContractProvider, via: Sender, opts: { value: bigint; minterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x41, 32).storeAddress(opts.minterAddress).endCell(),
        });
    }

    async sendSetVault(provider: ContractProvider, via: Sender, opts: { value: bigint; vaultAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x42, 32).storeAddress(opts.vaultAddress).endCell(),
        });
    }

    async sendSetOracleMonitor(provider: ContractProvider, via: Sender, opts: { value: bigint; monitorAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x43, 32).storeAddress(opts.monitorAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x44, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x45, 32).endCell(),
        });
    }

    async getParentFactory(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_parent_factory', []);
        return result.stack.readAddress();
    }

    async getMasterFactory(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_master_factory', []);
        return result.stack.readAddress();
    }

    async getProductType(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_product_type', []);
        return Number(result.stack.readBigNumber());
    }

    async getAssetId(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_asset_id', []);
        return Number(result.stack.readBigNumber());
    }

    async getPolicyNFTMinter(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_policy_nft_minter', []);
        return result.stack.readAddress();
    }

    async getVault(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_vault', []);
        return result.stack.readAddress();
    }

    async getOracleMonitor(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_oracle_monitor', []);
        return result.stack.readAddress();
    }

    async getNextPolicyId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_next_policy_id', []);
        return result.stack.readBigNumber();
    }

    async getTotalPolicies(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_policies', []);
        return result.stack.readBigNumber();
    }

    async getTotalCoverage(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_coverage', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getPolicy(provider: ContractProvider, policyId: bigint): Promise<{
        userAddress: Address | null;
        assetId: number;
        coverageAmount: bigint;
        durationDays: number;
        premiumAmount: bigint;
        createdAt: number;
        expiresAt: number;
        claimed: boolean;
    } | null> {
        const result = await provider.get('get_policy', [{ type: 'int', value: policyId }]);

        const userAddr = result.stack.readAddressOpt();
        if (!userAddr) {
            return null;
        }

        return {
            userAddress: userAddr,
            assetId: Number(result.stack.readBigNumber()),
            coverageAmount: result.stack.readBigNumber(),
            durationDays: Number(result.stack.readBigNumber()),
            premiumAmount: result.stack.readBigNumber(),
            createdAt: Number(result.stack.readBigNumber()),
            expiresAt: Number(result.stack.readBigNumber()),
            claimed: result.stack.readBigNumber() === 1n,
        };
    }

    async getPremiumQuote(provider: ContractProvider, coverageAmount: bigint, durationDays: number): Promise<bigint> {
        const result = await provider.get('get_premium_quote', [
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }

    async getTriggerParams(provider: ContractProvider): Promise<{ stalenessThreshold: number; deviationThreshold: number }> {
        const result = await provider.get('get_trigger_params', []);
        return {
            stalenessThreshold: Number(result.stack.readBigNumber()),
            deviationThreshold: Number(result.stack.readBigNumber()),
        };
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

export function createPolicyParams(coverageAmount: bigint, durationDays: number): Cell {
    return beginCell().storeCoins(coverageAmount).storeUint(durationDays, 16).endCell();
}

export function calculatePremium(coverageAmount: bigint, durationDays: number): bigint {
    return (coverageAmount * BigInt(BASE_APR_BPS) * BigInt(durationDays)) / BigInt(10000 * 365);
}
