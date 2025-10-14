import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type AdvancedPremiumDistributorConfig = {
    ownerAddress: Address;
    primaryVaultAddress: Address;
    secondaryVaultAddress: Address;
    referralManagerAddress: Address;
    oracleRewardsAddress: Address;
    protocolTreasuryAddress: Address;
    governanceRewardsAddress: Address;
    reserveFundAddress: Address;
    tradfiBufferAddress: Address;
    totalPremiumsDistributed: bigint;
    distributionCount: bigint;
};

export function advancedPremiumDistributorConfigToCell(config: AdvancedPremiumDistributorConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.primaryVaultAddress)
        .storeAddress(config.secondaryVaultAddress)
        .storeRef(
            beginCell()
                .storeAddress(config.referralManagerAddress)
                .storeAddress(config.oracleRewardsAddress)
                .storeAddress(config.protocolTreasuryAddress)
                .storeRef(
                    beginCell()
                        .storeAddress(config.governanceRewardsAddress)
                        .storeAddress(config.reserveFundAddress)
                        .storeAddress(config.tradfiBufferAddress)
                        .endCell()
                )
                .endCell()
        )
        .storeCoins(config.totalPremiumsDistributed)
        .storeUint(config.distributionCount, 64)
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
            policyId: bigint;
            userAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: distribute_premium
                .storeCoins(opts.premiumAmount)
                .storeUint(opts.policyId, 64)
                .storeAddress(opts.userAddress)
                .endCell(),
        });
    }

    async sendSetPrimaryVault(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // op: set_primary_vault
                .storeAddress(opts.newAddress)
                .endCell(),
        });
    }

    async sendSetReferralManager(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x11, 32) // op: set_referral_manager
                .storeAddress(opts.newAddress)
                .endCell(),
        });
    }

    async getDistributionPercentages(provider: ContractProvider): Promise<{
        primary: number;
        secondary: number;
        referrer: number;
        oracle: number;
        protocol: number;
        governance: number;
        reserve: number;
        tradfi: number;
    }> {
        const result = await provider.get('get_distribution_percentages', []);
        return {
            primary: result.stack.readNumber(),
            secondary: result.stack.readNumber(),
            referrer: result.stack.readNumber(),
            oracle: result.stack.readNumber(),
            protocol: result.stack.readNumber(),
            governance: result.stack.readNumber(),
            reserve: result.stack.readNumber(),
            tradfi: result.stack.readNumber(),
        };
    }

    async getTotalPremiumsDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_premiums_distributed', []);
        return result.stack.readBigNumber();
    }

    async getDistributionCount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_distribution_count', []);
        return result.stack.readBigNumber();
    }
}
