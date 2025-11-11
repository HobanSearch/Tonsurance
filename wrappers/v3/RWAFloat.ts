import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary
} from '@ton/core';

export type RWAFloatConfig = {
    adminAddress: Address;
    floatMasterAddress: Address;
    tonBridgeAddress: Address;
    plumeNestCreditAddress: Address;
    totalInvested: bigint;
    totalRedeemed: bigint;
    plumeHoldings: bigint;
    pendingRedemptions: bigint;
    redemptionQueue: Dictionary<bigint, Cell>;
    nextRedemptionId: bigint;
    paused: boolean;
};

export function rwaFloatConfigToCell(config: RWAFloatConfig): Cell {
    // Split addresses into 2 refs (2 + 2) to avoid cell overflow (4 × 267 = 1068 bits > 1023)
    const addrData1 = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.floatMasterAddress)
        .endCell();

    const addrData2 = beginCell()
        .storeAddress(config.tonBridgeAddress)
        .storeAddress(config.plumeNestCreditAddress)
        .endCell();

    return beginCell()
        .storeRef(addrData1)
        .storeRef(addrData2)
        .storeCoins(config.totalInvested)
        .storeCoins(config.totalRedeemed)
        .storeCoins(config.plumeHoldings)
        .storeCoins(config.pendingRedemptions)
        .storeDict(config.redemptionQueue)
        .storeUint(config.nextRedemptionId, 64)
        .storeBit(config.paused)
        .endCell();
}

export const TARGET_APY_BPS = 1000; // 10% APY
export const REDEMPTION_PERIOD_SECONDS = 604800; // 7 days

export class RWAFloat implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new RWAFloat(address);
    }

    static createFromConfig(config: RWAFloatConfig, code: Cell, workchain = 0) {
        const data = rwaFloatConfigToCell(config);
        const init = { code, data };
        return new RWAFloat(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendInvestRWA(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x80, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendRedeemRWA(provider: ContractProvider, via: Sender, opts: { value: bigint; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x81, 32).storeCoins(opts.amount).endCell(),
        });
    }

    async sendSetTonBridge(provider: ContractProvider, via: Sender, opts: { value: bigint; bridgeAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x90, 32).storeAddress(opts.bridgeAddress).endCell(),
        });
    }

    async sendSetPlumeNestCredit(provider: ContractProvider, via: Sender, opts: { value: bigint; plumeAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x91, 32).storeAddress(opts.plumeAddress).endCell(),
        });
    }

    async sendSetFloatMaster(provider: ContractProvider, via: Sender, opts: { value: bigint; floatMasterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x92, 32).storeAddress(opts.floatMasterAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x93, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x94, 32).endCell(),
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

    async getTonBridge(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_ton_bridge', []);
        return result.stack.readAddress();
    }

    async getPlumeNestCredit(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_plume_nest_credit', []);
        return result.stack.readAddress();
    }

    async getTotalInvested(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_invested', []);
        return result.stack.readBigNumber();
    }

    async getPlumeHoldings(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_plume_holdings', []);
        return result.stack.readBigNumber();
    }

    async getPendingRedemptions(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_pending_redemptions', []);
        return result.stack.readBigNumber();
    }

    async getAvailableBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_available_balance', []);
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
    // Daily yield = holdings * APY / 36500
    return (holdings * BigInt(apyBps)) / (365n * 100n);
}

export function calculateAnnualRewards(holdings: bigint, apyBps: number): bigint {
    // Annual rewards = holdings * APY / 10000
    return (holdings * BigInt(apyBps)) / 10000n;
}

export function calculateRedemptionUnlockTime(requestTime: number): number {
    return requestTime + REDEMPTION_PERIOD_SECONDS;
}
