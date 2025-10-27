"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedPremiumDistributor = void 0;
exports.advancedPremiumDistributorConfigToCell = advancedPremiumDistributorConfigToCell;
const core_1 = require("@ton/core");
function advancedPremiumDistributorConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.multiTrancheVaultAddress)
        .storeAddress(config.referralManagerAddress)
        .storeAddress(config.oracleRewardsAddress)
        .storeAddress(config.protocolTreasuryAddress)
        .endCell();
}
class AdvancedPremiumDistributor {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new AdvancedPremiumDistributor(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = advancedPremiumDistributorConfigToCell(config);
        const init = { code, data };
        return new AdvancedPremiumDistributor((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendDistributePremium(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: distribute_premium
                .storeCoins(opts.premiumAmount)
                .endCell(),
        });
    }
    async getDistributionPercentages(provider) {
        const result = await provider.get('get_distribution_percentages', []);
        return {
            lpShare: result.stack.readNumber(),
            referrer: result.stack.readNumber(),
            oracle: result.stack.readNumber(),
            protocol: result.stack.readNumber(),
        };
    }
}
exports.AdvancedPremiumDistributor = AdvancedPremiumDistributor;
