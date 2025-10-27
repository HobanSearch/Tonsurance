"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicPricingOracle = void 0;
exports.dynamicPricingOracleConfigToCell = dynamicPricingOracleConfigToCell;
const core_1 = require("@ton/core");
function dynamicPricingOracleConfigToCell(config) {
    return (0, core_1.beginCell)()
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
class DynamicPricingOracle {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new DynamicPricingOracle(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = dynamicPricingOracleConfigToCell(config);
        const init = { code, data };
        return new DynamicPricingOracle((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    // ========================
    // SEND METHODS (Admin/Keeper Operations)
    // ========================
    async sendUpdateMultiplier(provider, via, value, opts) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
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
    async sendBatchUpdateMultipliers(provider, via, value, multipliers) {
        // Build multipliers cell
        const multipliersCell = (0, core_1.beginCell)();
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
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x626d6c74, 32) // op::batch_update_multipliers
                .storeUint(multipliers.length, 16)
                .storeRef(multipliersCell.endCell())
                .endCell(),
        });
    }
    async sendToggleCircuitBreaker(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x74636272, 32) // op::toggle_circuit_breaker
                .endCell(),
        });
    }
    async sendAddKeeper(provider, via, value, keeperAddress) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x61646b70, 32) // op::add_keeper
                .storeAddress(keeperAddress)
                .endCell(),
        });
    }
    async sendRemoveKeeper(provider, via, value, keeperAddress) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x726d6b70, 32) // op::remove_keeper
                .storeAddress(keeperAddress)
                .endCell(),
        });
    }
    async sendAddSigner(provider, via, value, signerAddress) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x61647367, 32) // op::add_signer
                .storeAddress(signerAddress)
                .endCell(),
        });
    }
    async sendRemoveSigner(provider, via, value, signerAddress) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
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
    async getMultiplier(provider, coverageType, chainId, stablecoinId) {
        const result = await provider.get('get_multiplier', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
        ]);
        return result.stack.readBigNumber();
    }
    async getMultiplierComponents(provider, coverageType, chainId, stablecoinId) {
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
    async getLastUpdateTime(provider) {
        const result = await provider.get('get_last_update_time', []);
        return result.stack.readBigNumber();
    }
    async getTotalUpdates(provider) {
        const result = await provider.get('get_total_updates', []);
        return result.stack.readBigNumber();
    }
    async getCircuitBreakerStatus(provider) {
        const result = await provider.get('get_circuit_breaker_status', []);
        return {
            enabled: result.stack.readBigNumber() === 1n,
            minMultiplier: result.stack.readBigNumber(),
            maxMultiplier: result.stack.readBigNumber(),
        };
    }
    async isKeeperAuthorized(provider, keeperAddress) {
        const result = await provider.get('is_keeper_authorized', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(keeperAddress).endCell() }
        ]);
        return result.stack.readBigNumber() === 1n;
    }
    async getAdmin(provider) {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }
    async getMultisigThreshold(provider) {
        const result = await provider.get('get_multisig_threshold', []);
        return result.stack.readBigNumber();
    }
    /**
     * Check if oracle data is fresh (updated within last 5 minutes)
     */
    async isFresh(provider) {
        const lastUpdate = await this.getLastUpdateTime(provider);
        const currentTime = BigInt(Math.floor(Date.now() / 1000));
        const staleness = currentTime - lastUpdate;
        return staleness < 300n; // 5 minutes
    }
}
exports.DynamicPricingOracle = DynamicPricingOracle;
