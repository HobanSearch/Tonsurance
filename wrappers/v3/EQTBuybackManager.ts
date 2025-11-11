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

export type EQTBuybackManagerConfig = {
    adminAddress: Address;
    floatMasterAddress: Address;
    vaultAddress: Address;
    hedgeFloatAddress: Address;
    eqtTokenAddress: Address;
    dexRouterAddress: Address;
    totalBuybacksExecuted: number;
    totalEqtBought: bigint;
    totalSpent: bigint;
    buybackHistory: Dictionary<bigint, Cell>;
    nextBuybackId: bigint;
    paused: boolean;
};

export function eqtBuybackManagerConfigToCell(config: EQTBuybackManagerConfig): Cell {
    // Split addresses into 2 refs (3 + 3) to avoid cell overflow (6 × 267 = 1602 bits > 1023)
    const addrData1 = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.floatMasterAddress)
        .storeAddress(config.vaultAddress)
        .endCell();

    const addrData2 = beginCell()
        .storeAddress(config.hedgeFloatAddress)
        .storeAddress(config.eqtTokenAddress)
        .storeAddress(config.dexRouterAddress)
        .endCell();

    return beginCell()
        .storeRef(addrData1)
        .storeRef(addrData2)
        .storeUint(config.totalBuybacksExecuted, 32)
        .storeCoins(config.totalEqtBought)
        .storeCoins(config.totalSpent)
        .storeDict(config.buybackHistory)
        .storeUint(config.nextBuybackId, 64)
        .storeBit(config.paused)
        .endCell();
}

export const MIN_PROTOCOL_RESERVE = 10000000000000n; // $10M in nanotons
export const MIN_MATURITY_RATIO_FP = 4000000000n;    // 4.0 (fixed-point, 9 decimals)
export const MIN_HEDGE_COVERAGE_BPS = 9500;           // 95%

export type BuybackRecord = {
    amount: bigint;
    maturityRatioFp: bigint;
    protocolReserve: bigint;
    vaultYieldsSufficient: boolean;
    totalExposure: bigint;
    hedgedExposure: bigint;
    executedAt: number;
    eqtBought: bigint;
};

export class EQTBuybackManager implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new EQTBuybackManager(address);
    }

    static createFromConfig(config: EQTBuybackManagerConfig, code: Cell, workchain = 0) {
        const data = eqtBuybackManagerConfigToCell(config);
        const init = { code, data };
        return new EQTBuybackManager(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendExecuteBuyback(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
            maturityRatioFp: bigint;
            protocolReserve: bigint;
            vaultYieldsSufficient: boolean;
            totalExposure: bigint;
            hedgedExposure: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xAE, 32)
                .storeCoins(opts.amount)
                .storeUint(opts.maturityRatioFp, 64)
                .storeCoins(opts.protocolReserve)
                .storeBit(opts.vaultYieldsSufficient)
                .storeCoins(opts.totalExposure)
                .storeCoins(opts.hedgedExposure)
                .endCell(),
        });
    }

    async sendCheckBuybackEligibility(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            maturityRatioFp: bigint;
            protocolReserve: bigint;
            vaultYieldsSufficient: boolean;
            totalExposure: bigint;
            hedgedExposure: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xAF, 32)
                .storeUint(opts.maturityRatioFp, 64)
                .storeCoins(opts.protocolReserve)
                .storeBit(opts.vaultYieldsSufficient)
                .storeCoins(opts.totalExposure)
                .storeCoins(opts.hedgedExposure)
                .endCell(),
        });
    }

    async sendSetFloatMaster(provider: ContractProvider, via: Sender, opts: { value: bigint; floatMasterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB0, 32).storeAddress(opts.floatMasterAddress).endCell(),
        });
    }

    async sendSetVault(provider: ContractProvider, via: Sender, opts: { value: bigint; vaultAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB1, 32).storeAddress(opts.vaultAddress).endCell(),
        });
    }

    async sendSetHedgeFloat(provider: ContractProvider, via: Sender, opts: { value: bigint; hedgeFloatAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB2, 32).storeAddress(opts.hedgeFloatAddress).endCell(),
        });
    }

    async sendSetEqtToken(provider: ContractProvider, via: Sender, opts: { value: bigint; eqtTokenAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB3, 32).storeAddress(opts.eqtTokenAddress).endCell(),
        });
    }

    async sendSetDexRouter(provider: ContractProvider, via: Sender, opts: { value: bigint; dexRouterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB4, 32).storeAddress(opts.dexRouterAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB5, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xB6, 32).endCell(),
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

    async getTotalBuybacksExecuted(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_total_buybacks_executed', []);
        return Number(result.stack.readBigNumber());
    }

    async getTotalEqtBought(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_eqt_bought', []);
        return result.stack.readBigNumber();
    }

    async getTotalSpent(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_spent', []);
        return result.stack.readBigNumber();
    }

    async getBuyback(provider: ContractProvider, buybackId: bigint): Promise<BuybackRecord | null> {
        const args = new TupleBuilder();
        args.writeNumber(Number(buybackId));
        const result = await provider.get('get_buyback', args.build());

        const amount = result.stack.readBigNumber();
        if (amount === 0n) return null; // Not found

        const maturityRatioFp = result.stack.readBigNumber();
        const protocolReserve = result.stack.readBigNumber();
        const vaultYieldsSufficient = result.stack.readBigNumber() === 1n;
        const totalExposure = result.stack.readBigNumber();
        const hedgedExposure = result.stack.readBigNumber();
        const executedAt = Number(result.stack.readBigNumber());
        const eqtBought = result.stack.readBigNumber();

        return {
            amount,
            maturityRatioFp,
            protocolReserve,
            vaultYieldsSufficient,
            totalExposure,
            hedgedExposure,
            executedAt,
            eqtBought,
        };
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

export function calculateMaturityRatio(totalFloat: bigint, activeCoverage: bigint): bigint {
    // Maturity ratio = float / active_coverage (fixed-point 9 decimals)
    if (activeCoverage === 0n) return 0n;
    return (totalFloat * 1000000000n) / activeCoverage;
}

export function calculateHedgeCoverage(totalExposure: bigint, hedgedExposure: bigint): number {
    // Returns coverage in basis points
    if (totalExposure === 0n) return 10000; // 100%
    return Number((hedgedExposure * 10000n) / totalExposure);
}

export function isEligibleForBuyback(
    maturityRatioFp: bigint,
    protocolReserve: bigint,
    vaultYieldsSufficient: boolean,
    totalExposure: bigint,
    hedgedExposure: bigint
): { eligible: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (maturityRatioFp < MIN_MATURITY_RATIO_FP) {
        reasons.push(`Maturity ratio too low: ${Number(maturityRatioFp) / 1e9} < 4.0`);
    }

    if (protocolReserve < MIN_PROTOCOL_RESERVE) {
        reasons.push(`Protocol reserve too low: $${Number(protocolReserve) / 1e12}M < $10M`);
    }

    if (!vaultYieldsSufficient) {
        reasons.push('Vault yields insufficient for promised APYs');
    }

    const hedgeCoverage = calculateHedgeCoverage(totalExposure, hedgedExposure);
    if (hedgeCoverage < MIN_HEDGE_COVERAGE_BPS) {
        reasons.push(`Hedge coverage too low: ${hedgeCoverage / 100}% < 95%`);
    }

    return {
        eligible: reasons.length === 0,
        reasons,
    };
}
