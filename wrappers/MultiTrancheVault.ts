import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, Dictionary } from '@ton/core';

export type MultiTrancheVaultConfig = {
    ownerAddress: Address;
    totalCapital: bigint;
    totalCoverageSold: bigint;
    accumulatedPremiums: bigint;
    accumulatedLosses: bigint;
    trancheData: Cell;
    depositorBalances: Cell | null;
    paused: boolean;
    adminAddress: Address;
    claimsProcessorAddress: Address;
    reentrancyGuard: boolean;
    seqNo: number;
    circuitBreakerWindowStart: number;
    circuitBreakerLosses: bigint;
    pendingTxs: Cell | null;
    trancheLocks: Cell | null;
    testMode: boolean;
};

export function multiTrancheVaultConfigToCell(config: MultiTrancheVaultConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.totalCapital)
        .storeCoins(config.totalCoverageSold)
        .storeCoins(config.accumulatedPremiums)
        .storeCoins(config.accumulatedLosses)
        .storeRef(config.trancheData)
        .storeDict(config.depositorBalances)
        .storeBit(config.paused)
        .storeAddress(config.adminAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeBit(config.reentrancyGuard)
        .storeUint(config.seqNo, 32)
        .storeUint(config.circuitBreakerWindowStart, 32)
        .storeCoins(config.circuitBreakerLosses)
        .storeDict(config.pendingTxs)
        .storeDict(config.trancheLocks)
        .storeBit(config.testMode)
        .endCell();
}

// Helper function to create initial tranche data
export function createInitialTrancheData(): Cell {
    const trancheDict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());

    // Dummy address to use when token is not set (will be checked by test_mode in contract)
    const dummyAddr = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    // TRANCHE_BTC (1): 25% allocation, 4% APY (flat)
    trancheDict.set(1, beginCell()
        .storeCoins(0n)         // capital
        .storeUint(400, 16)     // apy_min (4.00% in basis points)
        .storeUint(400, 16)     // apy_max
        .storeUint(1, 8)        // curve_type (FLAT)
        .storeUint(25, 8)       // allocation_percent
        .storeCoins(0n)         // accumulated_yield
        .storeAddress(dummyAddr) // token_address (dummy for test mode)
        .storeCoins(0n)         // total_tokens
        .endCell()
    );

    // TRANCHE_SNR (2): 20% allocation, 6.5-10% APY (log)
    trancheDict.set(2, beginCell()
        .storeCoins(0n)
        .storeUint(650, 16)     // apy_min (6.50%)
        .storeUint(1000, 16)    // apy_max (10.00%)
        .storeUint(2, 8)        // curve_type (LOG)
        .storeUint(20, 8)
        .storeCoins(0n)
        .storeAddress(dummyAddr)
        .storeCoins(0n)
        .endCell()
    );

    // TRANCHE_MEZZ (3): 18% allocation, 9-15% APY (linear)
    trancheDict.set(3, beginCell()
        .storeCoins(0n)
        .storeUint(900, 16)     // apy_min (9.00%)
        .storeUint(1500, 16)    // apy_max (15.00%)
        .storeUint(3, 8)        // curve_type (LINEAR)
        .storeUint(18, 8)
        .storeCoins(0n)
        .storeAddress(dummyAddr)
        .storeCoins(0n)
        .endCell()
    );

    // TRANCHE_JNR (4): 15% allocation, 12.5-16% APY (sigmoidal)
    trancheDict.set(4, beginCell()
        .storeCoins(0n)
        .storeUint(1250, 16)    // apy_min (12.50%)
        .storeUint(1600, 16)    // apy_max (16.00%)
        .storeUint(4, 8)        // curve_type (SIGMOIDAL)
        .storeUint(15, 8)
        .storeCoins(0n)
        .storeAddress(dummyAddr)
        .storeCoins(0n)
        .endCell()
    );

    // TRANCHE_JNR_PLUS (5): 12% allocation, 16-22% APY (quadratic)
    trancheDict.set(5, beginCell()
        .storeCoins(0n)
        .storeUint(1600, 16)    // apy_min (16.00%)
        .storeUint(2200, 16)    // apy_max (22.00%)
        .storeUint(5, 8)        // curve_type (QUADRATIC)
        .storeUint(12, 8)
        .storeCoins(0n)
        .storeAddress(dummyAddr)
        .storeCoins(0n)
        .endCell()
    );

    // TRANCHE_EQT (6): 10% allocation, 15-25% APY (exponential)
    trancheDict.set(6, beginCell()
        .storeCoins(0n)
        .storeUint(1500, 16)    // apy_min (15.00%)
        .storeUint(2500, 16)    // apy_max (25.00%)
        .storeUint(6, 8)        // curve_type (EXPONENTIAL)
        .storeUint(10, 8)
        .storeCoins(0n)
        .storeAddress(dummyAddr)
        .storeCoins(0n)
        .endCell()
    );

    return trancheDict.size > 0 ? beginCell().storeDictDirect(trancheDict).endCell() : beginCell().endCell();
}

export class MultiTrancheVault implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

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

    // Admin functions
    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // OP_PAUSE
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x11, 32) // OP_UNPAUSE
                .endCell(),
        });
    }

    async sendSetAdmin(provider: ContractProvider, via: Sender, value: bigint, newAdmin: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x12, 32) // OP_SET_ADMIN
                .storeAddress(newAdmin)
                .endCell(),
        });
    }

    async sendSetClaimsProcessor(provider: ContractProvider, via: Sender, value: bigint, newProcessor: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x13, 32) // OP_SET_CLAIMS_PROCESSOR
                .storeAddress(newProcessor)
                .endCell(),
        });
    }

    async sendSetTrancheToken(provider: ContractProvider, via: Sender, value: bigint, trancheId: number, tokenAddress: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x14, 32) // OP_SET_TRANCHE_TOKEN
                .storeUint(trancheId, 8)
                .storeAddress(tokenAddress)
                .endCell(),
        });
    }

    // Vault operations
    async sendDeposit(provider: ContractProvider, via: Sender, opts: { value: bigint; trancheId: number }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // OP_DEPOSIT
                .storeUint(opts.trancheId, 8)
                .endCell(),
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, opts: { value: bigint; trancheId: number; tokenAmount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // OP_WITHDRAW
                .storeUint(opts.trancheId, 8)
                .storeCoins(opts.tokenAmount)
                .endCell(),
        });
    }

    async sendAbsorbLoss(provider: ContractProvider, via: Sender, value: bigint, lossAmount: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32) // OP_ABSORB_LOSS
                .storeCoins(lossAmount)
                .endCell(),
        });
    }

    async sendDistributePremiums(provider: ContractProvider, via: Sender, opts: { value: bigint; premiumAmount: bigint }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // OP_DISTRIBUTE_PREMIUMS
                .storeCoins(opts.premiumAmount)
                .endCell(),
        });
    }

    // Getter functions
    async getTotalCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_capital', []);
        return result.stack.readBigNumber();
    }

    async getTotalCoverageSold(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_coverage_sold', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getTrancheCapital(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const result = await provider.get('get_tranche_capital', [{ type: 'int', value: BigInt(trancheId) }]);
        return result.stack.readBigNumber();
    }

    async getTrancheApy(provider: ContractProvider, trancheId: number): Promise<{ min: bigint; max: bigint }> {
        const result = await provider.get('get_tranche_apy', [{ type: 'int', value: BigInt(trancheId) }]);
        const min = result.stack.readBigNumber();
        const max = result.stack.readBigNumber();
        return { min, max };
    }

    async getOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getClaimsProcessor(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_claims_processor', []);
        return result.stack.readAddress();
    }

    async getAccumulatedPremiums(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_accumulated_premiums', []);
        return result.stack.readBigNumber();
    }

    async getAccumulatedLosses(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_accumulated_losses', []);
        return result.stack.readBigNumber();
    }

    async getSeqNo(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_seq_no', []);
        return result.stack.readBigNumber();
    }

    async getCircuitBreakerStatus(provider: ContractProvider): Promise<{ windowStart: bigint; losses: bigint }> {
        const result = await provider.get('get_circuit_breaker_status', []);
        const windowStart = result.stack.readBigNumber();
        const losses = result.stack.readBigNumber();
        return { windowStart, losses };
    }

    async getTrancheTokenAddress(provider: ContractProvider, trancheId: number): Promise<Address> {
        const result = await provider.get('get_tranche_token_address', [{ type: 'int', value: BigInt(trancheId) }]);
        return result.stack.readAddress();
    }

    async getTrancheTotalTokens(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const result = await provider.get('get_tranche_total_tokens', [{ type: 'int', value: BigInt(trancheId) }]);
        return result.stack.readBigNumber();
    }

    async getTrancheInfo(provider: ContractProvider, trancheId: number): Promise<{
        capital: bigint;
        apyMin: bigint;
        apyMax: bigint;
        curveType: bigint;
        allocationPercent: bigint;
        accumulatedYield: bigint;
        tokenAddress: Address;
        totalTokens: bigint;
    }> {
        const result = await provider.get('get_tranche_info', [{ type: 'int', value: BigInt(trancheId) }]);
        return {
            capital: result.stack.readBigNumber(),
            apyMin: result.stack.readBigNumber(),
            apyMax: result.stack.readBigNumber(),
            curveType: result.stack.readBigNumber(),
            allocationPercent: result.stack.readBigNumber(),
            accumulatedYield: result.stack.readBigNumber(),
            tokenAddress: result.stack.readAddress(),
            totalTokens: result.stack.readBigNumber(),
        };
    }

    async getTrancheNAV(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const result = await provider.get('get_tranche_nav', [{ type: 'int', value: BigInt(trancheId) }]);
        return result.stack.readBigNumber();
    }

    async getTrancheState(provider: ContractProvider, trancheId: number): Promise<{
        totalCapital: bigint;
        tokenSupply: bigint;
        utilization: bigint;
        nav: bigint;
        accumulatedYield: bigint;
    }> {
        const result = await provider.get('get_tranche_state', [{ type: 'int', value: BigInt(trancheId) }]);
        return {
            totalCapital: result.stack.readBigNumber(),
            tokenSupply: result.stack.readBigNumber(),
            utilization: result.stack.readBigNumber(),
            nav: result.stack.readBigNumber(),
            accumulatedYield: result.stack.readBigNumber(),
        };
    }

    async getDepositorBalance(provider: ContractProvider, depositorAddress: Address): Promise<{
        trancheId: bigint;
        balance: bigint;
        lockUntil: bigint;
        stakeStartTime: bigint;
    }> {
        const result = await provider.get('get_depositor_balance', [{ type: 'slice', cell: beginCell().storeAddress(depositorAddress).endCell() }]);
        return {
            trancheId: result.stack.readBigNumber(),
            balance: result.stack.readBigNumber(),
            lockUntil: result.stack.readBigNumber(),
            stakeStartTime: result.stack.readBigNumber(),
        };
    }

    async getTestMode(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_test_mode', []);
        return result.stack.readBigNumber() !== 0n;
    }
}
