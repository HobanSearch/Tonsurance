import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type SimplePremiumDistributorConfig = {
    ownerAddress: Address;
    primaryVaultAddress: Address;
    secondaryVaultAddress: Address;
    protocolTreasuryAddress: Address;
    reserveFundAddress: Address;
    totalPremiumsDistributed: bigint;
    distributionCount: bigint;
};

export function simplePremiumDistributorConfigToCell(config: SimplePremiumDistributorConfig): Cell {
    // Store vault addresses in first reference cell (2 addresses = 534 bits)
    const vaultsCell = beginCell()
        .storeAddress(config.primaryVaultAddress)
        .storeAddress(config.secondaryVaultAddress)
        .endCell();

    // Store treasury addresses in second reference cell (2 addresses = 534 bits)
    const treasuriesCell = beginCell()
        .storeAddress(config.protocolTreasuryAddress)
        .storeAddress(config.reserveFundAddress)
        .endCell();

    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeRef(vaultsCell)
        .storeRef(treasuriesCell)
        .storeCoins(config.totalPremiumsDistributed)
        .storeUint(config.distributionCount, 64)
        .endCell();
}

export class SimplePremiumDistributor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new SimplePremiumDistributor(address);
    }

    static createFromConfig(config: SimplePremiumDistributorConfig, code: Cell, workchain = 0) {
        const data = simplePremiumDistributorConfigToCell(config);
        const init = { code, data };
        return new SimplePremiumDistributor(contractAddress(workchain, init), init);
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
        }
    ) {
        await provider.internal(via, {
            value: opts.premiumAmount + opts.value,  // Send premium + gas
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: distribute_premium
                .storeCoins(opts.premiumAmount)
                .storeUint(opts.policyId, 64)
                .endCell(),
        });
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
