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

export type StablecoinChildConfig = {
    parentFactoryAddress: Address;
    masterFactoryAddress: Address;
    productType: number; // = 1 (PRODUCT_DEPEG)
    assetId: number;
    policyNFTMinterAddress: Address;
    floatMasterAddress: Address;
    priceOracleAddress: Address;
    policyRegistry: Dictionary<bigint, Cell>;
    nextPolicyId: bigint;
    totalPoliciesCreated: bigint;
    totalCoverageAmount: bigint;
    paused: boolean;
    lastOraclePrice: number;
    lastOracleTimestamp: number;
    depegStartTimestamp: number;
    activePolicies: Dictionary<bigint, Cell>;
};

export function stablecoinChildConfigToCell(config: StablecoinChildConfig): Cell {
    // Build address reference (3 addresses = 801 bits)
    const addrRef1 = beginCell()
        .storeAddress(config.policyNFTMinterAddress)
        .storeAddress(config.floatMasterAddress)
        .storeAddress(config.priceOracleAddress)
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
        .storeUint(config.lastOraclePrice, 32)
        .storeUint(config.lastOracleTimestamp, 32)
        .storeUint(config.depegStartTimestamp, 32)
        .storeDict(config.activePolicies)
        .endCell();
}

// Constants
export const BASE_APR_BPS = 80; // 0.8% annual
export const DEPEG_THRESHOLD_PRICE = 980000; // $0.98 (6 decimals)
export const DEPEG_DURATION_SECONDS = 3600; // 1 hour

export class StablecoinChild implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new StablecoinChild(address);
    }

    static createFromConfig(config: StablecoinChildConfig, code: Cell, workchain = 0) {
        const data = stablecoinChildConfigToCell(config);
        const init = { code, data };
        return new StablecoinChild(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // POLICY CREATION
    // ================================================================

    async sendCreatePolicyFromFactory(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            policyParams: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x40, 32) // op::create_policy_from_factory
                .storeAddress(opts.userAddress)
                .storeRef(opts.policyParams)
                .endCell(),
        });
    }

    // ================================================================
    // ADMIN FUNCTIONS
    // ================================================================

    async sendSetPolicyNFTMinter(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            minterAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x41, 32) // op::set_policy_nft_minter
                .storeAddress(opts.minterAddress)
                .endCell(),
        });
    }

    async sendSetFloatMaster(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            floatMasterAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x42, 32) // op::set_float_master
                .storeAddress(opts.floatMasterAddress)
                .endCell(),
        });
    }

    async sendSetPriceOracle(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            oracleAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x43, 32) // op::set_price_oracle
                .storeAddress(opts.oracleAddress)
                .endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x44, 32) // op::pause
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x45, 32) // op::unpause
                .endCell(),
        });
    }

    // ================================================================
    // ORACLE FUNCTIONS
    // ================================================================

    async sendOraclePriceUpdate(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            currentPrice: number;
            timestamp: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x46, 32) // op::oracle_price_update
                .storeUint(opts.currentPrice, 32)
                .storeUint(opts.timestamp, 32)
                .endCell(),
        });
    }

    // ================================================================
    // GETTER METHODS
    // ================================================================

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

    async getFloatMaster(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_float_master', []);
        return result.stack.readAddress();
    }

    async getPriceOracle(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_price_oracle', []);
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
        const result = await provider.get('get_policy', [
            { type: 'int', value: policyId }
        ]);

        const userAddress = result.stack.readAddressOpt();
        if (!userAddress) {
            return null;
        }

        const assetId = Number(result.stack.readBigNumber());
        const coverageAmount = result.stack.readBigNumber();
        const durationDays = Number(result.stack.readBigNumber());
        const premiumAmount = result.stack.readBigNumber();
        const createdAt = Number(result.stack.readBigNumber());
        const expiresAt = Number(result.stack.readBigNumber());
        const claimed = result.stack.readBigNumber() === 1n;

        return {
            userAddress,
            assetId,
            coverageAmount,
            durationDays,
            premiumAmount,
            createdAt,
            expiresAt,
            claimed,
        };
    }

    async getPremiumQuote(
        provider: ContractProvider,
        coverageAmount: bigint,
        durationDays: number
    ): Promise<bigint> {
        const result = await provider.get('get_premium_quote', [
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }

    async getDepegTriggerParams(provider: ContractProvider): Promise<{
        thresholdPrice: number;
        durationSeconds: number;
    }> {
        const result = await provider.get('get_depeg_trigger_params', []);
        const thresholdPrice = Number(result.stack.readBigNumber());
        const durationSeconds = Number(result.stack.readBigNumber());
        return { thresholdPrice, durationSeconds };
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

// Helper function to create policy params cell
export function createPolicyParams(
    coverageAmount: bigint,
    durationDays: number
): Cell {
    return beginCell()
        .storeCoins(coverageAmount)
        .storeUint(durationDays, 16)
        .endCell();
}

// Helper to calculate premium off-chain
export function calculatePremium(coverageAmount: bigint, durationDays: number): bigint {
    // Premium = coverage × (APR / 10000) × (days / 365)
    // = (coverage × APR × days) / (10000 × 365)
    return (coverageAmount * BigInt(BASE_APR_BPS) * BigInt(durationDays)) / BigInt(10000 * 365);
}
