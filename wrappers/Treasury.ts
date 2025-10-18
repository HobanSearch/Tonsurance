import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type TreasuryConfig = {
    ownerAddress: Address;
    totalPremiumsCollected: bigint;
    totalPayoutsMade: bigint;
    reserveBalance: bigint;
    claimsProcessorAddress: Address;
    multiTrancheVaultAddress: Address;
    stakingPoolAddress: Address;
    btcYieldDistributed: bigint;
    snrYieldDistributed: bigint;
    mezzYieldDistributed: bigint;
    jnrYieldDistributed: bigint;
    jnrPlusYieldDistributed: bigint;
    eqtYieldDistributed: bigint;
};

export function treasuryConfigToCell(config: TreasuryConfig): Cell {
    // Split storage to avoid BitBuilder overflow
    // Main cell: owner + stats + first extra address
    // Ref cell 1: vault and staking addresses
    // Ref cell 2: tranche yield tracking
    const addressesRef = beginCell()
        .storeAddress(config.multiTrancheVaultAddress)
        .storeAddress(config.stakingPoolAddress)
        .endCell();

    const yieldRef = beginCell()
        .storeCoins(config.btcYieldDistributed)
        .storeCoins(config.snrYieldDistributed)
        .storeCoins(config.mezzYieldDistributed)
        .storeCoins(config.jnrYieldDistributed)
        .storeCoins(config.jnrPlusYieldDistributed)
        .storeCoins(config.eqtYieldDistributed)
        .endCell();

    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.totalPremiumsCollected)
        .storeCoins(config.totalPayoutsMade)
        .storeCoins(config.reserveBalance)
        .storeAddress(config.claimsProcessorAddress)
        .storeRef(addressesRef)
        .storeRef(yieldRef)
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

    async getAllTrancheYields(provider: ContractProvider): Promise<{
        btc: bigint;
        snr: bigint;
        mezz: bigint;
        jnr: bigint;
        jnrPlus: bigint;
        eqt: bigint;
    }> {
        const result = await provider.get('get_all_tranche_yields', []);
        return {
            btc: result.stack.readBigNumber(),
            snr: result.stack.readBigNumber(),
            mezz: result.stack.readBigNumber(),
            jnr: result.stack.readBigNumber(),
            jnrPlus: result.stack.readBigNumber(),
            eqt: result.stack.readBigNumber(),
        };
    }

    async getTotalYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getBtcYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_btc_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getSnrYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_snr_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getMezzYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_mezz_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getJnrYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_jnr_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getJnrPlusYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_jnr_plus_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getEqtYieldDistributed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_eqt_yield_distributed', []);
        return result.stack.readBigNumber();
    }

    async getMultiTrancheVault(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_multi_tranche_vault', []);
        return result.stack.readAddress();
    }
}
