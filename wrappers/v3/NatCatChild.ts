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

export type NatCatChildConfig = {
    parentFactoryAddress: Address;
    masterFactoryAddress: Address;
    productType: number; // = 5 (PRODUCT_TRADFI_NATCAT)
    assetId: number; // 1=Hurricane, 2=Earthquake
    policyNFTMinterAddress: Address;
    floatMasterAddress: Address;
    eventOracleAddress: Address;
    policyRegistry: Dictionary<bigint, Cell>;
    nextPolicyId: bigint;
    totalPoliciesCreated: bigint;
    totalCoverageAmount: bigint;
    paused: boolean;
    lastEventId: number;
    lastEventTimestamp: number;
    activePolicies: Dictionary<bigint, Cell>;
};

export function natCatChildConfigToCell(config: NatCatChildConfig): Cell {
    // Build address reference (3 addresses)
    const addrRef = beginCell()
        .storeAddress(config.policyNFTMinterAddress)
        .storeAddress(config.floatMasterAddress)
        .storeAddress(config.eventOracleAddress)
        .endCell();

    return beginCell()
        .storeAddress(config.parentFactoryAddress)
        .storeAddress(config.masterFactoryAddress)
        .storeUint(config.productType, 8)
        .storeUint(config.assetId, 16)
        .storeRef(addrRef)
        .storeDict(config.policyRegistry)
        .storeUint(config.nextPolicyId, 64)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeCoins(config.totalCoverageAmount)
        .storeBit(config.paused)
        .storeUint(config.lastEventId, 32)
        .storeUint(config.lastEventTimestamp, 32)
        .storeDict(config.activePolicies)
        .endCell();
}

export class NatCatChild implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new NatCatChild(address);
    }

    static createFromConfig(config: NatCatChildConfig, code: Cell, workchain = 0) {
        const data = natCatChildConfigToCell(config);
        const init = { code, data };
        return new NatCatChild(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // POLICY CREATION (FROM FACTORY)
    // ================================================================

    async sendCreatePolicyFromFactory(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            coverageAmount: bigint;
            durationHours: number;  // 6-8760 hours (6 hours to 365 days)
            latitude: number;      // degrees * 1000000
            longitude: number;     // degrees * 1000000
            radiusKm: number;
        }
    ) {
        const policyParams = beginCell()
            .storeCoins(opts.coverageAmount)
            .storeUint(opts.durationHours, 16)
            .storeInt(opts.latitude, 32)
            .storeInt(opts.longitude, 32)
            .storeUint(opts.radiusKm, 16)
            .endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x40, 32) // op::create_policy_from_factory
                .storeAddress(opts.userAddress)
                .storeRef(policyParams)
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

    async sendSetEventOracle(
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
                .storeUint(0x43, 32) // op::set_event_oracle
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
    // ORACLE EVENT UPDATE
    // ================================================================

    async sendEventUpdate(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            eventId: number;
            latitude: number;      // degrees * 1000000
            longitude: number;     // degrees * 1000000
            severity: number;      // Hurricane: category 3-5, Earthquake: magnitude * 10 (60-100)
            timestamp: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x46, 32) // op::event_update
                .storeUint(opts.eventId, 32)
                .storeInt(opts.latitude, 32)
                .storeInt(opts.longitude, 32)
                .storeUint(opts.severity, 16)
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

    async getEventOracle(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_event_oracle', []);
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
        return result.stack.readBigNumber() !== 0n;
    }

    async getPolicy(provider: ContractProvider, policyId: bigint): Promise<{
        userAddress: Address | null;
        assetId: number;
        coverageAmount: bigint;
        durationHours: number;  // Duration in hours (6-8760)
        premium: bigint;
        createdAt: number;
        expiresAt: number;
        claimed: boolean;
        latitude: number;
        longitude: number;
        radiusKm: number;
    }> {
        const result = await provider.get('get_policy', [
            { type: 'int', value: policyId }
        ]);

        try {
            const userAddress = result.stack.readAddress();
            const assetId = Number(result.stack.readBigNumber());
            const coverageAmount = result.stack.readBigNumber();
            const durationHours = Number(result.stack.readBigNumber());
            const premium = result.stack.readBigNumber();
            const createdAt = Number(result.stack.readBigNumber());
            const expiresAt = Number(result.stack.readBigNumber());
            const claimed = result.stack.readBigNumber() !== 0n;
            const latitude = Number(result.stack.readBigNumber());
            const longitude = Number(result.stack.readBigNumber());
            const radiusKm = Number(result.stack.readBigNumber());

            return {
                userAddress,
                assetId,
                coverageAmount,
                durationHours,
                premium,
                createdAt,
                expiresAt,
                claimed,
                latitude,
                longitude,
                radiusKm,
            };
        } catch {
            return {
                userAddress: null,
                assetId: 0,
                coverageAmount: 0n,
                durationHours: 0,
                premium: 0n,
                createdAt: 0,
                expiresAt: 0,
                claimed: false,
                latitude: 0,
                longitude: 0,
                radiusKm: 0,
            };
        }
    }

    async getPremiumQuote(
        provider: ContractProvider,
        coverageAmount: bigint,
        durationHours: number  // Duration in hours (6-8760)
    ): Promise<bigint> {
        const result = await provider.get('get_premium_quote', [
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationHours) }
        ]);
        return result.stack.readBigNumber();
    }

    async getTriggerThresholds(provider: ContractProvider): Promise<{
        minSeverity: number;
        reserved: number;
    }> {
        const result = await provider.get('get_trigger_thresholds', []);
        const minSeverity = Number(result.stack.readBigNumber());
        const reserved = Number(result.stack.readBigNumber());
        return { minSeverity, reserved };
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}
