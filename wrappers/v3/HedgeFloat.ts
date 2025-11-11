import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary,
    TupleBuilder,
} from '@ton/core';

export type HedgeFloatConfig = {
    adminAddress: Address;
    floatMasterAddress: Address;
    stormTradeAddress: Address;
    gmxRouterAddress: Address;
    totalHedgeCapital: bigint;
    activeCapitalDeployed: bigint;
    unrealizedPnL: bigint;
    activePositions: Dictionary<bigint, Cell>;
    nextPositionId: bigint;
    coverageExposure: Dictionary<number, bigint>;
    paused: boolean;
};

export function hedgeFloatConfigToCell(config: HedgeFloatConfig): Cell {
    // Split addresses into 2 refs (2 + 2) to avoid cell overflow (4 × 267 = 1068 bits > 1023)
    const addrData1 = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.floatMasterAddress)
        .endCell();

    const addrData2 = beginCell()
        .storeAddress(config.stormTradeAddress)
        .storeAddress(config.gmxRouterAddress)
        .endCell();

    return beginCell()
        .storeRef(addrData1)
        .storeRef(addrData2)
        .storeCoins(config.totalHedgeCapital)
        .storeCoins(config.activeCapitalDeployed)
        .storeCoins(config.unrealizedPnL)
        .storeDict(config.activePositions)
        .storeUint(config.nextPositionId, 64)
        .storeDict(config.coverageExposure)
        .storeBit(config.paused)
        .endCell();
}

export const HEDGE_COST_APY_BPS = -200; // -2% APY (hedges are cost centers)

// Hedge instrument types
export const INSTRUMENT_SHORT = 1;  // 40% allocation
export const INSTRUMENT_PUT = 2;    // 30% allocation
export const INSTRUMENT_VOL = 3;    // 20% allocation
export const INSTRUMENT_STABLE = 4; // 10% allocation

export class HedgeFloat implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new HedgeFloat(address);
    }

    static createFromConfig(config: HedgeFloatConfig, code: Cell, workchain = 0) {
        const data = hedgeFloatConfigToCell(config);
        const init = { code, data };
        return new HedgeFloat(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendAddHedgeCapital(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
            productType: number;
            assetId: number;
            coverageAmount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x83, 32)
                .storeCoins(opts.amount)
                .storeUint(opts.productType, 8)
                .storeUint(opts.assetId, 16)
                .storeCoins(opts.coverageAmount)
                .endCell(),
        });
    }

    async sendOpenShort(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            positionId: bigint;
            assetId: number;
            sizeUsd: bigint;
            leverage: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x8E, 32)
                .storeUint(opts.positionId, 64)
                .storeUint(opts.assetId, 16)
                .storeCoins(opts.sizeUsd)
                .storeUint(opts.leverage, 8)
                .endCell(),
        });
    }

    async sendCloseShort(provider: ContractProvider, via: Sender, opts: { value: bigint; positionId: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x8F, 32).storeUint(opts.positionId, 64).endCell(),
        });
    }

    async sendBuyPut(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            assetId: number;
            size: bigint;
            strikePrice: bigint;
            expiry: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xA0, 32)
                .storeUint(opts.assetId, 16)
                .storeCoins(opts.size)
                .storeCoins(opts.strikePrice)
                .storeUint(opts.expiry, 32)
                .endCell(),
        });
    }

    async sendSetStormTrade(provider: ContractProvider, via: Sender, opts: { value: bigint; address: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA1, 32).storeAddress(opts.address).endCell(),
        });
    }

    async sendSetGMXRouter(provider: ContractProvider, via: Sender, opts: { value: bigint; address: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA2, 32).storeAddress(opts.address).endCell(),
        });
    }

    async sendSetFloatMaster(provider: ContractProvider, via: Sender, opts: { value: bigint; floatMasterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA3, 32).storeAddress(opts.floatMasterAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA4, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA5, 32).endCell(),
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

    async getTotalHedgeCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_hedge_capital', []);
        return result.stack.readBigNumber();
    }

    async getActiveCapitalDeployed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_active_capital_deployed', []);
        return result.stack.readBigNumber();
    }

    async getUnrealizedPnL(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_unrealized_pnl', []);
        return result.stack.readBigNumber();
    }

    async getCoverageExposure(provider: ContractProvider, assetId: number): Promise<bigint> {
        const args = new TupleBuilder();
        args.writeNumber(assetId);
        const result = await provider.get('get_coverage_exposure', args.build());
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

export function calculateDailyCost(capital: bigint, costApyBps: number): bigint {
    // Daily cost = capital * cost_apy / 36500
    // Note: costApyBps is negative for hedges
    return (capital * BigInt(costApyBps)) / (365n * 100n);
}

export function calculateHedgeAllocation(coverageAmount: bigint): {
    short: bigint;
    put: bigint;
    vol: bigint;
    stable: bigint;
} {
    // Default allocation: 40% short, 30% put, 20% vol, 10% stable
    // Total hedge size is 20% of coverage amount
    const totalHedgeSize = (coverageAmount * 20n) / 100n;

    const short = (totalHedgeSize * 40n) / 100n;
    const put = (totalHedgeSize * 30n) / 100n;
    const vol = (totalHedgeSize * 20n) / 100n;
    const stable = totalHedgeSize - short - put - vol;

    return { short, put, vol, stable };
}

export function calculateRequiredHedge(exposure: bigint, hedgeRatio: number = 20): bigint {
    // Calculate required hedge size based on coverage exposure
    // Default: 20% of exposure
    return (exposure * BigInt(hedgeRatio)) / 100n;
}
