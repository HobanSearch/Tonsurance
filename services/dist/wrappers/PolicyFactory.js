"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyFactory = void 0;
exports.policyFactoryConfigToCell = policyFactoryConfigToCell;
const core_1 = require("@ton/core");
const ProductMatrix_1 = require("./types/ProductMatrix");
function policyFactoryConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextPolicyId, 64)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeUint(config.activePoliciesCount, 64)
        .storeAddress(config.treasuryAddress)
        .storeUint(config.paused, 1)
        .storeDict(null) // policies_dict (empty initially)
        .storeDict(null) // pending_txs (empty initially)
        .storeUint(0, 32) // seq_no
        .endCell();
}
class PolicyFactory {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new PolicyFactory(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = policyFactoryConfigToCell(config);
        const init = { code, data };
        return new PolicyFactory((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    /**
     * Create a new insurance policy with multi-dimensional parameters
     * @param provider Contract provider
     * @param via Sender
     * @param opts Policy creation options
     */
    async sendCreatePolicy(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: create_policy (multi-dimensional)
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.chainId, 8)
                .storeUint(opts.stablecoinId, 8)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.duration, 16)
                .endCell(),
        });
    }
    async sendSetTreasury(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x12, 32) // op: set_treasury
                .storeAddress(opts.newAddress)
                .endCell(),
        });
    }
    async sendSetPriceOracle(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x13, 32) // op: set_price_oracle
                .storeAddress(opts.newAddress)
                .endCell(),
        });
    }
    async getTotalPoliciesCreated(provider) {
        const result = await provider.get('get_total_policies_created', []);
        return result.stack.readBigNumber();
    }
    /**
     * Get policy data (extended with multi-dimensional fields)
     */
    async getPolicyData(provider, policyId) {
        const result = await provider.get('get_policy_data', [
            { type: 'int', value: policyId }
        ]);
        return {
            coverageType: result.stack.readNumber(),
            chainId: result.stack.readNumber(),
            stablecoinId: result.stack.readNumber(),
            coverageAmount: result.stack.readBigNumber(),
            premium: result.stack.readBigNumber(),
            startTime: result.stack.readNumber(),
            duration: result.stack.readNumber(),
            active: result.stack.readBoolean(),
        };
    }
    /**
     * Calculate premium with multi-dimensional risk factors
     * Uses on-chain calculation (matches risk_multipliers.fc)
     */
    async getCalculatePremium(provider, coverageType, chainId, stablecoinId, coverageAmount, durationDays) {
        const result = await provider.get('calculate_premium_external', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }
    /**
     * Get product information for a specific combination
     */
    async getProductInfo(provider, coverageType, chainId, stablecoinId) {
        const result = await provider.get('get_product_info', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) }
        ]);
        return {
            productHash: result.stack.readNumber(),
            baseRate: result.stack.readNumber(),
            chainMultiplier: result.stack.readNumber(),
        };
    }
    // ================================
    // HELPER METHODS (OFF-CHAIN)
    // ================================
    /**
     * Validate product parameters before creating policy
     * @returns Validation result with error message if invalid
     */
    validateProduct(product) {
        return (0, ProductMatrix_1.validateProduct)(product);
    }
    /**
     * Calculate premium off-chain (matches on-chain calculation)
     * Useful for quote generation without blockchain call
     */
    calculatePremiumOffchain(product, coverageAmount, durationDays) {
        return (0, ProductMatrix_1.calculatePremium)(product, coverageAmount, durationDays);
    }
    /**
     * Calculate product hash for indexing/caching
     */
    calculateProductHash(product) {
        return (0, ProductMatrix_1.calculateProductHash)(product);
    }
}
exports.PolicyFactory = PolicyFactory;
