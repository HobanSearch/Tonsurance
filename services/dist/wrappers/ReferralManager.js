"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferralManager = void 0;
exports.referralManagerConfigToCell = referralManagerConfigToCell;
const core_1 = require("@ton/core");
function referralManagerConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeDict(null) // referral_chains
        .storeDict(null) // referral_stats
        .storeCoins(config.totalReferralRewardsDistributed)
        .endCell();
}
class ReferralManager {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new ReferralManager(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = referralManagerConfigToCell(config);
        const init = { code, data };
        return new ReferralManager((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendRegisterReferral(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: register_referral
                .storeAddress(opts.userAddress)
                .storeAddress(opts.referrerAddress)
                .endCell(),
        });
    }
    async sendDistributeReferralRewards(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x03, 32) // op: distribute_referral_rewards
                .storeCoins(opts.totalAmount)
                .storeAddress(opts.userAddress)
                .storeUint(opts.policyId, 64)
                .endCell(),
        });
    }
    async getReferrerStats(provider, referrer) {
        const result = await provider.get('get_referrer_stats', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(referrer).endCell() }
        ]);
        return {
            totalEarned: result.stack.readBigNumber(),
            referralCount: result.stack.readNumber(),
        };
    }
    async getDirectReferrer(provider, user) {
        const result = await provider.get('get_direct_referrer', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(user).endCell() }
        ]);
        try {
            return result.stack.readAddress();
        }
        catch {
            return null;
        }
    }
    async getFullChain(provider, user) {
        const result = await provider.get('get_full_chain', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(user).endCell() }
        ]);
        const readAddressOrNull = () => {
            try {
                return result.stack.readAddress();
            }
            catch {
                return null;
            }
        };
        return {
            level1: readAddressOrNull(),
            level2: readAddressOrNull(),
            level3: readAddressOrNull(),
            level4: readAddressOrNull(),
            level5: readAddressOrNull(),
            chainLength: result.stack.readNumber(),
        };
    }
    async getTotalReferralRewards(provider) {
        const result = await provider.get('get_total_referral_rewards', []);
        return result.stack.readBigNumber();
    }
}
exports.ReferralManager = ReferralManager;
