"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskMultipliersTest = void 0;
exports.riskMultipliersTestConfigToCell = riskMultipliersTestConfigToCell;
const core_1 = require("@ton/core");
function riskMultipliersTestConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .endCell();
}
class RiskMultipliersTest {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new RiskMultipliersTest(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = riskMultipliersTestConfigToCell(config);
        const init = { code, data };
        return new RiskMultipliersTest((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    // ===== GETTER METHODS =====
    async getChainRiskMultiplier(provider, chainId) {
        const result = await provider.get('get_chain_risk_multiplier_test', [{ type: 'int', value: BigInt(chainId) }]);
        return result.stack.readNumber();
    }
    async getStablecoinRiskAdjustment(provider, stablecoinId) {
        const result = await provider.get('get_stablecoin_risk_adjustment_test', [{ type: 'int', value: BigInt(stablecoinId) }]);
        return result.stack.readNumber();
    }
    async getCoverageTypeBaseRate(provider, coverageType) {
        const result = await provider.get('get_coverage_type_base_rate_test', [{ type: 'int', value: BigInt(coverageType) }]);
        return result.stack.readNumber();
    }
    async getStablecoinRiskTier(provider, stablecoinId) {
        const result = await provider.get('get_stablecoin_risk_tier_test', [{ type: 'int', value: BigInt(stablecoinId) }]);
        return result.stack.readNumber();
    }
    async validateChainStablecoinPair(provider, chainId, stablecoinId) {
        const result = await provider.get('validate_chain_stablecoin_pair_test', [
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) }
        ]);
        return result.stack.readNumber() === 1;
    }
    async calculateProductHash(provider, coverageType, chainId, stablecoinId) {
        const result = await provider.get('calculate_product_hash_test', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) }
        ]);
        return result.stack.readNumber();
    }
    async decomposeProductHash(provider, productHash) {
        const result = await provider.get('decompose_product_hash_test', [{ type: 'int', value: BigInt(productHash) }]);
        return {
            coverageType: result.stack.readNumber(),
            chainId: result.stack.readNumber(),
            stablecoinId: result.stack.readNumber(),
        };
    }
    async calculateMultiDimensionalPremium(provider, coverageType, chainId, stablecoinId, coverageAmount, durationDays) {
        const result = await provider.get('calculate_multi_dimensional_premium_test', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }
    async validateChainId(provider, chainId) {
        try {
            const result = await provider.get('validate_chain_id_test', [{ type: 'int', value: BigInt(chainId) }]);
            return result.stack.readNumber() === 1;
        }
        catch {
            return false;
        }
    }
    async validateStablecoinId(provider, stablecoinId) {
        try {
            const result = await provider.get('validate_stablecoin_id_test', [{ type: 'int', value: BigInt(stablecoinId) }]);
            return result.stack.readNumber() === 1;
        }
        catch {
            return false;
        }
    }
    async validateCoverageType(provider, coverageType) {
        try {
            const result = await provider.get('validate_coverage_type_test', [{ type: 'int', value: BigInt(coverageType) }]);
            return result.stack.readNumber() === 1;
        }
        catch {
            return false;
        }
    }
}
exports.RiskMultipliersTest = RiskMultipliersTest;
