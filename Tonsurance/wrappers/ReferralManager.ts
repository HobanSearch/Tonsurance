import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ReferralManagerConfig = {
    ownerAddress: Address;
    totalReferralRewardsDistributed: bigint;
};

export function referralManagerConfigToCell(config: ReferralManagerConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeDict(null) // referral_chains
        .storeDict(null) // referral_stats
        .storeCoins(config.totalReferralRewardsDistributed)
        .endCell();
}

export class ReferralManager implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ReferralManager(address);
    }

    static createFromConfig(config: ReferralManagerConfig, code: Cell, workchain = 0) {
        const data = referralManagerConfigToCell(config);
        const init = { code, data };
        return new ReferralManager(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterReferral(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            referrerAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: register_referral
                .storeAddress(opts.userAddress)
                .storeAddress(opts.referrerAddress)
                .endCell(),
        });
    }

    async sendDistributeReferralRewards(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            totalAmount: bigint;
            userAddress: Address;
            policyId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: distribute_referral_rewards
                .storeCoins(opts.totalAmount)
                .storeAddress(opts.userAddress)
                .storeUint(opts.policyId, 64)
                .endCell(),
        });
    }

    async getReferrerStats(provider: ContractProvider, referrer: Address): Promise<{
        totalEarned: bigint;
        referralCount: number;
    }> {
        const result = await provider.get('get_referrer_stats', [
            { type: 'slice', cell: beginCell().storeAddress(referrer).endCell() }
        ]);
        return {
            totalEarned: result.stack.readBigNumber(),
            referralCount: result.stack.readNumber(),
        };
    }

    async getDirectReferrer(provider: ContractProvider, user: Address): Promise<Address | null> {
        const result = await provider.get('get_direct_referrer', [
            { type: 'slice', cell: beginCell().storeAddress(user).endCell() }
        ]);
        try {
            return result.stack.readAddress();
        } catch {
            return null;
        }
    }

    async getFullChain(provider: ContractProvider, user: Address): Promise<{
        level1: Address | null;
        level2: Address | null;
        level3: Address | null;
        level4: Address | null;
        level5: Address | null;
        chainLength: number;
    }> {
        const result = await provider.get('get_full_chain', [
            { type: 'slice', cell: beginCell().storeAddress(user).endCell() }
        ]);

        const readAddressOrNull = () => {
            try {
                return result.stack.readAddress();
            } catch {
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

    async getTotalReferralRewards(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_referral_rewards', []);
        return result.stack.readBigNumber();
    }
}
