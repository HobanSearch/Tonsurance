import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';

export type DeFiFloatConfig = {
    adminAddress: Address;
    floatMasterAddress: Address;
    dedustRouterAddress: Address;
    stonRouterAddress: Address;
    evaaMarketAddress: Address;
    totalDeployed: bigint;
    totalWithdrawn: bigint;
    dedustLiquidity: bigint;
    stonLiquidity: bigint;
    evaaSupplied: bigint;
    paused: boolean;
};

export function defiFloatConfigToCell(config: DeFiFloatConfig): Cell {
    // Split addresses into 2 refs (3 + 2) to avoid cell overflow (5 × 267 = 1335 bits > 1023)
    const addrData1 = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.floatMasterAddress)
        .storeAddress(config.dedustRouterAddress)
        .endCell();

    const addrData2 = beginCell()
        .storeAddress(config.stonRouterAddress)
        .storeAddress(config.evaaMarketAddress)
        .endCell();

    return beginCell()
        .storeRef(addrData1)
        .storeRef(addrData2)
        .storeCoins(config.totalDeployed)
        .storeCoins(config.totalWithdrawn)
        .storeCoins(config.dedustLiquidity)
        .storeCoins(config.stonLiquidity)
        .storeCoins(config.evaaSupplied)
        .storeBit(config.paused)
        .endCell();
}

export const TARGET_APY_BPS = 700; // 7% APY

export class DeFiFloat implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new DeFiFloat(address);
    }

    static createFromConfig(config: DeFiFloatConfig, code: Cell, workchain = 0) {
        const data = defiFloatConfigToCell(config);
        const init = { code, data };
        return new DeFiFloat(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDeployDeFi(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x82, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendWithdrawDeFi(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x88, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendAddLiquidityDedust(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x89, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendRemoveLiquidityDedust(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x8A, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendSupplyEvaa(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x8B, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendWithdrawEvaa(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x8C, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendSwapSton(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x8D, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendSetDedust(provider: ContractProvider, via: Sender, opts: { value: bigint; routerAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x99, 32).storeAddress(opts.routerAddress).endCell(),
        });
    }

    async sendSetSton(provider: ContractProvider, via: Sender, opts: { value: bigint; routerAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x9A, 32).storeAddress(opts.routerAddress).endCell(),
        });
    }

    async sendSetEvaa(provider: ContractProvider, via: Sender, opts: { value: bigint; marketAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x9B, 32).storeAddress(opts.marketAddress).endCell(),
        });
    }

    async sendSetFloatMaster(provider: ContractProvider, via: Sender, opts: { value: bigint; floatMasterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x9C, 32).storeAddress(opts.floatMasterAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x9D, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x9E, 32).endCell(),
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

    async getTotalDeployed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_deployed', []);
        return result.stack.readBigNumber();
    }

    async getDedustLiquidity(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_dedust_liquidity', []);
        return result.stack.readBigNumber();
    }

    async getStonLiquidity(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_ston_liquidity', []);
        return result.stack.readBigNumber();
    }

    async getEvaaSupplied(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_evaa_supplied', []);
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

export function calculateDailyYield(balance: bigint, apyBps: number): bigint {
    // Daily yield = balance * APY / 36500
    return (balance * BigInt(apyBps)) / (365n * 100n);
}

export function calculateAnnualRewards(balance: bigint, apyBps: number): bigint {
    // Annual rewards = balance * APY / 10000
    return (balance * BigInt(apyBps)) / 10000n;
}

export function calculateVenueAllocation(amount: bigint): {
    dedust: bigint;
    ston: bigint;
    evaa: bigint;
} {
    // Default allocation: 40% DeDust, 30% STON, 30% Evaa
    const dedust = (amount * 40n) / 100n;
    const ston = (amount * 30n) / 100n;
    const evaa = amount - dedust - ston;
    return { dedust, ston, evaa };
}
