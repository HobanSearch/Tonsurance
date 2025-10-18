import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type AdvancedPremiumDistributorConfig = {
    ownerAddress: Address;
    multiTrancheVaultAddress: Address;
    referralManagerAddress: Address;
    oracleRewardsAddress: Address;
    protocolTreasuryAddress: Address;
};

export function advancedPremiumDistributorConfigToCell(config: AdvancedPremiumDistributorConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.multiTrancheVaultAddress)
        .storeAddress(config.referralManagerAddress)
        .storeAddress(config.oracleRewardsAddress)
        .storeAddress(config.protocolTreasuryAddress)
        .endCell();
}

export class AdvancedPremiumDistributor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new AdvancedPremiumDistributor(address);
    }

    static createFromConfig(config: AdvancedPremiumDistributorConfig, code: Cell, workchain = 0) {
        const data = advancedPremiumDistributorConfigToCell(config);
        const init = { code, data };
        return new AdvancedPremiumDistributor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDistributePremium(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            premiumAmount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: distribute_premium
                .storeCoins(opts.premiumAmount)
                .endCell(),
        });
    }

    async getDistributionPercentages(provider: ContractProvider): Promise<{
        lpShare: number;
        referrer: number;
        oracle: number;
        protocol: number;
    }> {
        const result = await provider.get('get_distribution_percentages', []);
        return {
            lpShare: result.stack.readNumber(),
            referrer: result.stack.readNumber(),
            oracle: result.stack.readNumber(),
            protocol: result.stack.readNumber(),
        };
    }
}
