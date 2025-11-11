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
} from '@ton/core';

export type LiquidityManagerConfig = {
    adminAddress: Address;
    floatMasterAddress: Address;
    vaultAddress: Address;
    dedustRouterAddress: Address;
    totalLpDeployed: bigint;
    accumulatedFees: bigint;
    lpPositions: Dictionary<bigint, Cell>;
    nextPositionId: bigint;
    detectedCrossovers: Dictionary<number, Cell>;
    paused: boolean;
};

export function liquidityManagerConfigToCell(config: LiquidityManagerConfig): Cell {
    // Split addresses into 2 refs (2 + 2) to avoid cell overflow (4 × 267 = 1068 bits > 1023)
    const addrData1 = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.floatMasterAddress)
        .endCell();

    const addrData2 = beginCell()
        .storeAddress(config.vaultAddress)
        .storeAddress(config.dedustRouterAddress)
        .endCell();

    return beginCell()
        .storeRef(addrData1)
        .storeRef(addrData2)
        .storeCoins(config.totalLpDeployed)
        .storeCoins(config.accumulatedFees)
        .storeDict(config.lpPositions)
        .storeUint(config.nextPositionId, 64)
        .storeDict(config.detectedCrossovers)
        .storeBit(config.paused)
        .endCell();
}

export const MIN_FEE_APY_BPS = 1500;  // 15% minimum fee APY
export const MAX_POOL_SHARE_BPS = 3000; // 30% maximum pool share

export class LiquidityManager implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new LiquidityManager(address);
    }

    static createFromConfig(config: LiquidityManagerConfig, code: Cell, workchain = 0) {
        const data = liquidityManagerConfigToCell(config);
        const init = { code, data };
        return new LiquidityManager(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDeployCrossoverLP(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            tranche1Id: number;
            tranche2Id: number;
            amount: bigint;
            estimatedFeeApyBps: number;
            poolTotalLiquidity: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xA6, 32)
                .storeUint(opts.tranche1Id, 8)
                .storeUint(opts.tranche2Id, 8)
                .storeCoins(opts.amount)
                .storeUint(opts.estimatedFeeApyBps, 16)
                .storeCoins(opts.poolTotalLiquidity)
                .endCell(),
        });
    }

    async sendWithdrawCrossoverLP(provider: ContractProvider, via: Sender, opts: { value: bigint; positionId: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA7, 32).storeUint(opts.positionId, 64).endCell(),
        });
    }

    async sendClaimLPFees(provider: ContractProvider, via: Sender, opts: { value: bigint; positionId: bigint; feesEarned: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA8, 32).storeUint(opts.positionId, 64).storeCoins(opts.feesEarned).endCell(),
        });
    }

    async sendSetDedustRouter(provider: ContractProvider, via: Sender, opts: { value: bigint; routerAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xA9, 32).storeAddress(opts.routerAddress).endCell(),
        });
    }

    async sendSetFloatMaster(provider: ContractProvider, via: Sender, opts: { value: bigint; floatMasterAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xAA, 32).storeAddress(opts.floatMasterAddress).endCell(),
        });
    }

    async sendSetVault(provider: ContractProvider, via: Sender, opts: { value: bigint; vaultAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xAB, 32).storeAddress(opts.vaultAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xAC, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xAD, 32).endCell(),
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

    async getTotalLpDeployed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_lp_deployed', []);
        return result.stack.readBigNumber();
    }

    async getAccumulatedFees(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_accumulated_fees', []);
        return result.stack.readBigNumber();
    }

    async getActiveLpCount(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_active_lp_count', []);
        return Number(result.stack.readBigNumber());
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

export function calculatePoolShare(lpAmount: bigint, poolTotalLiquidity: bigint): number {
    // Calculate pool share in basis points
    if (poolTotalLiquidity === 0n) return 0;
    return Number((lpAmount * 10000n) / poolTotalLiquidity);
}

export function isValidFeeApy(feeApyBps: number): boolean {
    return feeApyBps >= MIN_FEE_APY_BPS;
}

export function isValidPoolShare(shareBps: number): boolean {
    return shareBps <= MAX_POOL_SHARE_BPS;
}

export function calculateEstimatedFeeIncome(lpAmount: bigint, feeApyBps: number, durationYears: number): bigint {
    // Calculate estimated fee income from LP position
    // Fee income = LP amount × fee APY × duration (years)
    const feeApyFraction = BigInt(feeApyBps) * 1000000n / 10000n; // Convert to 6 decimal fixed point
    const durationFp = BigInt(Math.floor(durationYears * 1000000));
    return (lpAmount * feeApyFraction * durationFp) / (1000000n * 1000000n);
}
