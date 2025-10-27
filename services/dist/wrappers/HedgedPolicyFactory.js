"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HedgedPolicyFactory = void 0;
exports.hedgedPolicyFactoryConfigToCell = hedgedPolicyFactoryConfigToCell;
const core_1 = require("@ton/core");
function hedgedPolicyFactoryConfigToCell(config) {
    const keepersCell = (0, core_1.beginCell)()
        .storeAddress(config.keepers.polymarket)
        .storeAddress(config.keepers.perpetuals)
        .storeAddress(config.keepers.allianz)
        .endCell();
    return (0, core_1.beginCell)()
        .storeAddress(config.adminAddress)
        .storeAddress(config.pricingOracle)
        .storeAddress(config.hedgeCoordinator)
        .storeAddress(config.primaryVault)
        .storeRef(keepersCell)
        .storeUint(1, 64) // next_policy_id starts at 1
        .storeDict(null) // policies initially empty
        .storeCoins(0) // total_coverage starts at 0
        .endCell();
}
class HedgedPolicyFactory {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new HedgedPolicyFactory(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = hedgedPolicyFactoryConfigToCell(config);
        const init = { code, data };
        return new HedgedPolicyFactory((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendCreateHedgedPolicy(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x63726561, 32) // op::create_hedged_policy
                .storeAddress(opts.userAddress)
                .storeUint(opts.coverageType, 8)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.durationDays, 16)
                .storeCoins(opts.expectedPremium)
                .storeUint(opts.quoteTimestamp, 32)
                .endCell(),
        });
    }
    async sendUpdateOracle(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x75706f72, 32) // op::update_oracle
                .storeAddress(opts.oracleAddress)
                .endCell(),
        });
    }
    async sendUpdateCoordinator(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x7570636f, 32) // op::update_coordinator
                .storeAddress(opts.coordinatorAddress)
                .endCell(),
        });
    }
    async sendUpdateVault(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x75707661, 32) // op::update_vault
                .storeAddress(opts.vaultAddress)
                .endCell(),
        });
    }
    async getPolicy(provider, policyId) {
        const result = await provider.get('get_policy', [
            { type: 'int', value: policyId },
        ]);
        return {
            userAddress: result.stack.readAddress(),
            coverageType: Number(result.stack.readBigNumber()),
            coverageAmount: result.stack.readBigNumber(),
            durationDays: Number(result.stack.readBigNumber()),
            totalPremium: result.stack.readBigNumber(),
            createdAt: Number(result.stack.readBigNumber()),
            expiryTime: Number(result.stack.readBigNumber()),
            isActive: result.stack.readBigNumber() === 1n,
        };
    }
    async getNextPolicyId(provider) {
        const result = await provider.get('get_next_policy_id', []);
        return result.stack.readBigNumber();
    }
    async getTotalCoverage(provider) {
        const result = await provider.get('get_total_coverage', []);
        return result.stack.readBigNumber();
    }
    async getPoolUtilization(provider) {
        const result = await provider.get('get_pool_utilization', []);
        return Number(result.stack.readBigNumber());
    }
    async getPricingOracle(provider) {
        const result = await provider.get('get_pricing_oracle', []);
        return result.stack.readAddress();
    }
    async getHedgeCoordinator(provider) {
        const result = await provider.get('get_hedge_coordinator', []);
        return result.stack.readAddress();
    }
    async getAdminAddress(provider) {
        const result = await provider.get('get_admin_address', []);
        return result.stack.readAddress();
    }
}
exports.HedgedPolicyFactory = HedgedPolicyFactory;
