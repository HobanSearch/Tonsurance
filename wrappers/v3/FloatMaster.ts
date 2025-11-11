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

export type FloatMasterConfig = {
    adminAddress: Address;
    vaultAddress: Address;
    rwaFloatAddress: Address;
    btcFloatAddress: Address;
    defiFloatAddress: Address;
    hedgeFloatAddress: Address;
    totalPremiumsCollected: bigint;
    totalClaimsPaid: bigint;
    protocolEarnedCapital: bigint;
    activePolicies: Dictionary<bigint, Cell>;
    totalActiveCoverage: bigint;
    activeCoverageCapital: bigint;
    expiredCoverageCapital: bigint;
    coverageMaturities: Dictionary<number, Cell>;
    rwaAllocated: bigint;
    btcAllocated: bigint;
    defiAllocated: bigint;
    hedgeAllocated: bigint;
    illiquidDeployment: bigint;
    paused: boolean;
};

export function floatMasterConfigToCell(config: FloatMasterConfig): Cell {
    const extData = beginCell()
        .storeDict(config.activePolicies)
        .storeCoins(config.totalActiveCoverage)
        .storeCoins(config.activeCoverageCapital)
        .storeCoins(config.expiredCoverageCapital)
        .storeDict(config.coverageMaturities)
        .endCell();

    // Split addresses into 2 refs to match contract (3 + 3 addresses)
    const addrRef1 = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.vaultAddress)
        .storeAddress(config.rwaFloatAddress)
        .endCell();

    const addrRef2 = beginCell()
        .storeAddress(config.btcFloatAddress)
        .storeAddress(config.defiFloatAddress)
        .storeAddress(config.hedgeFloatAddress)
        .endCell();

    const allocData = beginCell()
        .storeCoins(config.rwaAllocated)
        .storeCoins(config.btcAllocated)
        .storeCoins(config.defiAllocated)
        .storeCoins(config.hedgeAllocated)
        .storeCoins(config.illiquidDeployment)
        .endCell();

    return beginCell()
        .storeRef(addrRef1)
        .storeRef(addrRef2)
        .storeCoins(config.totalPremiumsCollected)
        .storeCoins(config.totalClaimsPaid)
        .storeCoins(config.protocolEarnedCapital)
        .storeRef(extData)
        .storeRef(allocData)
        .storeBit(config.paused)
        .endCell();
}

export const ALLOCATION_RWA = 5000;     // 50%
export const ALLOCATION_BTC = 1500;     // 15%
export const ALLOCATION_DEFI = 1500;    // 15%
export const ALLOCATION_HEDGES = 2000;  // 20%

export class FloatMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new FloatMaster(address);
    }

    static createFromConfig(config: FloatMasterConfig, code: Cell, workchain = 0) {
        const data = floatMasterConfigToCell(config);
        const init = { code, data };
        return new FloatMaster(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendReceivePremium(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            premiumAmount: bigint;
            productType: number;
            assetId: number;
            coverageAmount: bigint;
            expiryTimestamp: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x60, 32)
                .storeUint(opts.policyId, 64)
                .storeCoins(opts.premiumAmount)
                .storeUint(opts.productType, 8)
                .storeUint(opts.assetId, 16)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.expiryTimestamp, 32)
                .endCell(),
        });
    }

    async sendReleaseExpiredCoverage(provider: ContractProvider, via: Sender, opts: { value: bigint; expiryTimestamp: number }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x61, 32).storeUint(opts.expiryTimestamp, 32).endCell(),
        });
    }

    async sendAggregateDailyYield(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            rwaYield: bigint;
            btcYield: bigint;
            defiYield: bigint;
            hedgePnL: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x62, 32)
                .storeCoins(opts.rwaYield)
                .storeCoins(opts.btcYield)
                .storeCoins(opts.defiYield)
                .storeCoins(opts.hedgePnL)
                .endCell(),
        });
    }

    async sendSetRWAFloat(provider: ContractProvider, via: Sender, opts: { value: bigint; floatAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x70, 32).storeAddress(opts.floatAddress).endCell(),
        });
    }

    async sendSetBTCFloat(provider: ContractProvider, via: Sender, opts: { value: bigint; floatAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x71, 32).storeAddress(opts.floatAddress).endCell(),
        });
    }

    async sendSetDeFiFloat(provider: ContractProvider, via: Sender, opts: { value: bigint; floatAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x72, 32).storeAddress(opts.floatAddress).endCell(),
        });
    }

    async sendSetHedgeFloat(provider: ContractProvider, via: Sender, opts: { value: bigint; floatAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x73, 32).storeAddress(opts.floatAddress).endCell(),
        });
    }

    async sendSetVault(provider: ContractProvider, via: Sender, opts: { value: bigint; vaultAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x74, 32).storeAddress(opts.vaultAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x75, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x76, 32).endCell(),
        });
    }

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getVault(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_vault', []);
        return result.stack.readAddress();
    }

    async getRWAFloat(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_rwa_float', []);
        return result.stack.readAddress();
    }

    async getBTCFloat(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_btc_float', []);
        return result.stack.readAddress();
    }

    async getDeFiFloat(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_defi_float', []);
        return result.stack.readAddress();
    }

    async getHedgeFloat(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_hedge_float', []);
        return result.stack.readAddress();
    }

    async getTotalPremiumsCollected(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_premiums_collected', []);
        return result.stack.readBigNumber();
    }

    async getProtocolEarnedCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_protocol_earned_capital', []);
        return result.stack.readBigNumber();
    }

    async getTotalActiveCoverage(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_active_coverage', []);
        return result.stack.readBigNumber();
    }

    async getActiveCoverageCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_active_coverage_capital', []);
        return result.stack.readBigNumber();
    }

    async getExpiredCoverageCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_expired_coverage_capital', []);
        return result.stack.readBigNumber();
    }

    async getFloatAllocations(provider: ContractProvider): Promise<{
        rwa: bigint;
        btc: bigint;
        defi: bigint;
        hedge: bigint;
    }> {
        const result = await provider.get('get_float_allocations', []);
        return {
            rwa: result.stack.readBigNumber(),
            btc: result.stack.readBigNumber(),
            defi: result.stack.readBigNumber(),
            hedge: result.stack.readBigNumber(),
        };
    }

    async getTotalFloatBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_float_balance', []);
        return result.stack.readBigNumber();
    }

    async getMaturityRatio(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_maturity_ratio', []);
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

export function createPremiumData(
    policyId: bigint,
    premiumAmount: bigint,
    productType: number,
    assetId: number,
    coverageAmount: bigint,
    expiryTimestamp: number
): Cell {
    return beginCell()
        .storeUint(policyId, 64)
        .storeCoins(premiumAmount)
        .storeUint(productType, 8)
        .storeUint(assetId, 16)
        .storeCoins(coverageAmount)
        .storeUint(expiryTimestamp, 32)
        .endCell();
}

export function calculateAllocation(premiumAmount: bigint, allocationBps: number): bigint {
    return (premiumAmount * BigInt(allocationBps)) / 10000n;
}
