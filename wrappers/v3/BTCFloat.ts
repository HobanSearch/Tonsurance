import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode
} from '@ton/core';

export type BTCFloatConfig = {
    adminAddress: Address;
    floatMasterAddress: Address;
    tonstakersAddress: Address;
    totalStaked: bigint;
    totalUnstaked: bigint;
    tsTONHoldings: bigint;
    accumulatedRewards: bigint;
    paused: boolean;
};

export function btcFloatConfigToCell(config: BTCFloatConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.floatMasterAddress)
        .storeAddress(config.tonstakersAddress)
        .storeCoins(config.totalStaked)
        .storeCoins(config.totalUnstaked)
        .storeCoins(config.tsTONHoldings)
        .storeCoins(config.accumulatedRewards)
        .storeBit(config.paused)
        .endCell();
}

export const TARGET_APY_BPS = 2000; // 20% APY

export class BTCFloat implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new BTCFloat(address);
    }

    static createFromConfig(config: BTCFloatConfig, code: Cell, workchain = 0) {
        const data = btcFloatConfigToCell(config);
        const init = { code, data };
        return new BTCFloat(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendStakeBTC(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x81, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendUnstakeBTC(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x85, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendSetTonstakers(provider: ContractProvider, via: Sender, opts: { value: bigint; tonstakersAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x95, 32).storeAddress(opts.tonstakersAddress).endCell(),
        });
    }

    async sendSetFloatMaster(provider: ContractProvider, via: Sender, opts: { value: bigint; floatMasterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x96, 32).storeAddress(opts.floatMasterAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x97, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x98, 32).endCell(),
        });
    }

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getFloatMaster(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_float_master', []);
        return result.stack.readAddress();
    }

    async getTonstakers(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_tonstakers', []);
        return result.stack.readAddress();
    }

    async getTotalStaked(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_staked', []);
        return result.stack.readBigNumber();
    }

    async getTsTONHoldings(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_tsTON_holdings', []);
        return result.stack.readBigNumber();
    }

    async getAccumulatedRewards(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_accumulated_rewards', []);
        return result.stack.readBigNumber();
    }

    async getTotalBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_balance', []);
        return result.stack.readBigNumber();
    }

    async getDailyYield(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_daily_yield', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

export function calculateDailyYield(holdings: bigint, apyBps: number): bigint {
    // Daily yield = holdings * APY_BPS / (365 * 10000)
    // For 20% APY (2000 bps): holdings * 2000 / 3650000
    return (holdings * BigInt(apyBps)) / (365n * 10000n);
}

export function calculateAnnualRewards(holdings: bigint, apyBps: number): bigint {
    // Annual rewards = holdings * APY / 10000
    return (holdings * BigInt(apyBps)) / 10000n;
}
