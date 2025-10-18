import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, Dictionary } from '@ton/core';

export type DynamicPricingOracleConfig = {
    adminAddress: Address;
    authorizedKeepers: Cell | null; // Dict: address_hash -> 1
    multisigSigners: Cell | null; // Dict: address_hash -> 1
    multisigThreshold: number;
    productMultipliers: Cell | null; // Dict: product_hash -> multiplier_data
    globalCircuitBreaker: boolean;
    lastUpdateTime: number;
    totalUpdates: number;
};

export function dynamicPricingOracleConfigToCell(config: DynamicPricingOracleConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeDict(config.authorizedKeepers)
        .storeDict(config.multisigSigners)
        .storeUint(config.multisigThreshold, 8)
        .storeDict(config.productMultipliers)
        .storeBit(config.globalCircuitBreaker)
        .storeUint(config.lastUpdateTime, 32)
        .storeUint(config.totalUpdates, 32)
        .endCell();
}

export interface MultiplierData {
    baseMultiplier: bigint; // In basis points (10000 = 1.00x)
    marketAdjustment: bigint; // In basis points (signed)
    volatilityPremium: bigint; // In basis points (signed)
    timestamp: bigint;
    updateCount: bigint;
}

export class DynamicPricingOracle implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new DynamicPricingOracle(address);
    }

    static createFromConfig(config: DynamicPricingOracleConfig, code: Cell, workchain = 0) {
        const data = dynamicPricingOracleConfigToCell(config);
        const init = { code, data };
        return new DynamicPricingOracle(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ========================
    // SEND METHODS (Admin/Keeper Operations)
    // ========================

    async sendUpdateMultiplier(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            coverageType: number;
            chainId: number;
            stablecoinId: number;
            baseMultiplier: bigint;
            marketAdjustment: bigint;
            volatilityPremium: bigint;
        }
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x756d6c74, 32) // op::update_multiplier
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.chainId, 8)
                .storeUint(opts.stablecoinId, 8)
                .storeUint(opts.baseMultiplier, 16)
                .storeUint(opts.marketAdjustment, 16)
                .storeUint(opts.volatilityPremium, 16)
                .endCell(),
        });
    }

    async sendBatchUpdateMultipliers(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        multipliers: Array<{
            coverageType: number;
            chainId: number;
            stablecoinId: number;
            baseMultiplier: bigint;
            marketAdjustment: bigint;
            volatilityPremium: bigint;
        }>
    ) {
        // Build multipliers cell
        const multipliersCell = beginCell();
        multipliers.forEach(m => {
            multipliersCell
                .storeUint(m.coverageType, 8)
                .storeUint(m.chainId, 8)
                .storeUint(m.stablecoinId, 8)
                .storeUint(m.baseMultiplier, 16)
                .storeUint(m.marketAdjustment, 16)
                .storeUint(m.volatilityPremium, 16);
        });

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x626d6c74, 32) // op::batch_update_multipliers
                .storeUint(multipliers.length, 16)
                .storeRef(multipliersCell.endCell())
                .endCell(),
        });
    }

    async sendToggleCircuitBreaker(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x74636272, 32) // op::toggle_circuit_breaker
                .endCell(),
        });
    }

    async sendAddKeeper(provider: ContractProvider, via: Sender, value: bigint, keeperAddress: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x61646b70, 32) // op::add_keeper
                .storeAddress(keeperAddress)
                .endCell(),
        });
    }

    async sendRemoveKeeper(provider: ContractProvider, via: Sender, value: bigint, keeperAddress: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x726d6b70, 32) // op::remove_keeper
                .storeAddress(keeperAddress)
                .endCell(),
        });
    }

    async sendAddSigner(provider: ContractProvider, via: Sender, value: bigint, signerAddress: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x61647367, 32) // op::add_signer
                .storeAddress(signerAddress)
                .endCell(),
        });
    }

    async sendRemoveSigner(provider: ContractProvider, via: Sender, value: bigint, signerAddress: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x726d7367, 32) // op::remove_signer
                .storeAddress(signerAddress)
                .endCell(),
        });
    }

    // ========================
    // GETTER METHODS
    // ========================

    /**
     * Get product multiplier for specific coverage product
     * @param coverageType 0=depeg, 1=exploit, 2=bridge, 3=cex_liquidation, 4=cex_freeze
     * @param chainId 0-7 (ethereum, bsc, polygon, avalanche, arbitrum, optimism, ton, solana)
     * @param stablecoinId 0-13 (usdt, usdc, dai, ...)
     */
    async getMultiplier(
        provider: ContractProvider,
        coverageType: number,
        chainId: number,
        stablecoinId: number
    ): Promise<bigint> {
        const result = await provider.get('get_multiplier', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
        ]);
        return result.stack.readBigNumber();
    }

    async getMultiplierComponents(
        provider: ContractProvider,
        coverageType: number,
        chainId: number,
        stablecoinId: number
    ): Promise<MultiplierData> {
        const result = await provider.get('get_multiplier_components', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
        ]);
        return {
            baseMultiplier: result.stack.readBigNumber(),
            marketAdjustment: result.stack.readBigNumber(),
            volatilityPremium: result.stack.readBigNumber(),
            timestamp: result.stack.readBigNumber(),
            updateCount: result.stack.readBigNumber(),
        };
    }

    async getLastUpdateTime(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_last_update_time', []);
        return result.stack.readBigNumber();
    }

    async getTotalUpdates(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_updates', []);
        return result.stack.readBigNumber();
    }

    async getCircuitBreakerStatus(provider: ContractProvider): Promise<{
        enabled: boolean;
        minMultiplier: bigint;
        maxMultiplier: bigint;
    }> {
        const result = await provider.get('get_circuit_breaker_status', []);
        return {
            enabled: result.stack.readBigNumber() === 1n,
            minMultiplier: result.stack.readBigNumber(),
            maxMultiplier: result.stack.readBigNumber(),
        };
    }

    async isKeeperAuthorized(provider: ContractProvider, keeperAddress: Address): Promise<boolean> {
        const result = await provider.get('is_keeper_authorized', [
            { type: 'slice', cell: beginCell().storeAddress(keeperAddress).endCell() }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getMultisigThreshold(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_multisig_threshold', []);
        return result.stack.readBigNumber();
    }

    /**
     * Check if oracle data is fresh (updated within last 5 minutes)
     */
    async isFresh(provider: ContractProvider): Promise<boolean> {
        const lastUpdate = await this.getLastUpdateTime(provider);
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const staleness = currentTime - lastUpdate;
        return staleness < 300n; // 5 minutes
    }
}
