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

export type TrancheData = {
    capital: bigint;
    apyMin: number;
    apyMax: number;
    curveType: number;
    allocationPercent: number;
    accumulatedYield: bigint;
    tokenAddress: Address;
    totalTokens: bigint;
};

export type MultiTrancheVaultConfig = {
    masterFactoryAddress: Address;
    claimsProcessorAddress: Address;
    floatManagerAddress: Address;
    totalCapital: bigint;
    totalCoverageSold: bigint;
    accumulatedPremiums: bigint;
    accumulatedLosses: bigint;
    protocolEarnedCapital: bigint;
    trancheData: Cell; // Dictionary of tranches
    depositorBalances: Dictionary<bigint, Cell>;
    paused: boolean;
    reentrancyGuard: boolean;
    seqNo: number;
    circuitBreakerWindowStart: number;
    circuitBreakerLosses: bigint;
    trancheDepositTimes: Dictionary<number, number>;
    pendingTxs: Dictionary<bigint, Cell>;
    trancheLocks: Dictionary<number, Cell>;
    testMode: boolean;
};

export function multiTrancheVaultConfigToCell(config: MultiTrancheVaultConfig): Cell {
    const extData = beginCell()
        .storeBit(config.reentrancyGuard)
        .storeUint(config.seqNo, 32)
        .storeUint(config.circuitBreakerWindowStart, 32)
        .storeCoins(config.circuitBreakerLosses)
        .storeDict(config.trancheDepositTimes)
        .storeDict(config.pendingTxs)
        .storeDict(config.trancheLocks)
        .storeBit(config.testMode)
        .endCell();

    return beginCell()
        .storeAddress(config.masterFactoryAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.floatManagerAddress)
        .storeCoins(config.totalCapital)
        .storeCoins(config.totalCoverageSold)
        .storeCoins(config.accumulatedPremiums)
        .storeCoins(config.accumulatedLosses)
        .storeCoins(config.protocolEarnedCapital)
        .storeRef(config.trancheData)
        .storeDict(config.depositorBalances)
        .storeBit(config.paused)
        .storeRef(extData)
        .endCell();
}

// Tranche IDs
export const TRANCHE_BTC = 1;      // Bitcoin (15%, lowest risk)
export const TRANCHE_SNR = 2;      // Senior (20%)
export const TRANCHE_MEZZ = 3;     // Mezzanine (25%)
export const TRANCHE_JNR = 4;      // Junior (20%)
export const TRANCHE_JNR_PLUS = 5; // Junior+ (15%)
export const TRANCHE_EQT = 6;      // Equity (5%, highest risk)

// Bonding Curve Types
export const CURVE_FLAT = 1;               // BTC
export const CURVE_LOGARITHMIC = 2;        // SNR
export const CURVE_LINEAR = 3;             // MEZZ
export const CURVE_SIGMOID = 4;            // JNR
export const CURVE_QUADRATIC = 5;          // JNR+
export const CURVE_CAPPED_EXPONENTIAL = 6; // EQT

export const DECIMALS = 1000000000; // 9 decimal places
export const MIN_DEPOSIT = 100000000; // 0.1 TON

export class MultiTrancheVault implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new MultiTrancheVault(address);
    }

    static createFromConfig(config: MultiTrancheVaultConfig, code: Cell, workchain = 0) {
        const data = multiTrancheVaultConfigToCell(config);
        const init = { code, data };
        return new MultiTrancheVault(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDeposit(provider: ContractProvider, via: Sender, opts: { value: bigint; trancheId: number; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x01, 32).storeUint(opts.trancheId, 8).storeCoins(opts.amount).endCell(),
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, opts: { value: bigint; trancheId: number; amount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x02, 32).storeUint(opts.trancheId, 8).storeCoins(opts.amount).endCell(),
        });
    }

    async sendAbsorbLoss(provider: ContractProvider, via: Sender, opts: { value: bigint; lossAmount: bigint; claimId: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x04, 32).storeCoins(opts.lossAmount).storeUint(opts.claimId, 64).endCell(),
        });
    }

    async sendAccrueDailyYield(provider: ContractProvider, via: Sender, opts: { value: bigint; yieldAmount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x06, 32).storeCoins(opts.yieldAmount).endCell(),
        });
    }

    async sendSetFloatManager(provider: ContractProvider, via: Sender, opts: { value: bigint; floatManagerAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x17, 32).storeAddress(opts.floatManagerAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x13, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x14, 32).endCell(),
        });
    }

    async getTotalCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_capital', []);
        return result.stack.readBigNumber();
    }

    async getTotalCoverageSold(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_coverage_sold', []);
        return result.stack.readBigNumber();
    }

    async getAccumulatedPremiums(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_accumulated_premiums', []);
        return result.stack.readBigNumber();
    }

    async getAccumulatedLosses(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_accumulated_losses', []);
        return result.stack.readBigNumber();
    }

    async getProtocolEarnedCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_protocol_earned_capital', []);
        return result.stack.readBigNumber();
    }

    async getTrancheCapital(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const args = new TupleBuilder();
        args.writeNumber(trancheId);
        const result = await provider.get('get_tranche_capital', args.build());
        return result.stack.readBigNumber();
    }

    async getTrancheApy(provider: ContractProvider, trancheId: number): Promise<{ min: number; max: number }> {
        const args = new TupleBuilder();
        args.writeNumber(trancheId);
        const result = await provider.get('get_tranche_apy', args.build());
        const min = Number(result.stack.readBigNumber());
        const max = Number(result.stack.readBigNumber());
        return { min, max };
    }

    async getTrancheNav(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const args = new TupleBuilder();
        args.writeNumber(trancheId);
        const result = await provider.get('get_tranche_nav', args.build());
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getTestMode(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_test_mode', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

export function calculateFlatNav(tYears: number): number {
    // BTC: NAV = 1.0 + 0.04 * t
    return 1.0 + 0.04 * tYears;
}

export function calculateLinearNav(tYears: number): number {
    // MEZZ: NAV = 1.0 + 0.10 * t
    return 1.0 + 0.10 * tYears;
}

export function calculateCappedExponentialNav(tYears: number): number {
    // EQT: NAV = min(1.25, 1.0 + 0.15 * (e^t - 1))
    const growth = 0.15 * (Math.exp(tYears) - 1);
    return Math.min(1.25, 1.0 + growth);
}
