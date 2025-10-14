import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type TreasuryConfig = {
    ownerAddress: Address;
    totalPremiumsCollected: bigint;
    totalPayoutsMade: bigint;
    reserveBalance: bigint;
    claimsProcessorAddress: Address;
    premiumDistributorAddress: Address;
    stakingPoolAddress: Address;
};

export function treasuryConfigToCell(config: TreasuryConfig): Cell {
    // Split storage to avoid BitBuilder overflow
    // Main cell: owner + stats + first extra address
    // Ref cell: remaining 2 addresses
    const addressesRef = beginCell()
        .storeAddress(config.premiumDistributorAddress)
        .storeAddress(config.stakingPoolAddress)
        .endCell();

    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.totalPremiumsCollected)
        .storeCoins(config.totalPayoutsMade)
        .storeCoins(config.reserveBalance)
        .storeAddress(config.claimsProcessorAddress)
        .storeRef(addressesRef)
        .endCell();
}

export class Treasury implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new Treasury(address);
    }

    static createFromConfig(config: TreasuryConfig, code: Cell, workchain = 0) {
        const data = treasuryConfigToCell(config);
        const init = { code, data };
        return new Treasury(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getTreasuryStats(provider: ContractProvider): Promise<{
        totalPremiums: bigint;
        totalPayouts: bigint;
        reserveBalance: bigint;
    }> {
        const result = await provider.get('get_treasury_stats', []);
        return {
            totalPremiums: result.stack.readBigNumber(),
            totalPayouts: result.stack.readBigNumber(),
            reserveBalance: result.stack.readBigNumber(),
        };
    }

    async getReserveBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_reserve_balance', []);
        return result.stack.readBigNumber();
    }
}
