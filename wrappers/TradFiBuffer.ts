import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type TradFiBufferConfig = {
    ownerAddress: Address;
    complianceGatewayAddress: Address;
    shieldInstTokenAddress: Address;
    premiumDistributorAddress: Address;
    totalDeposited: bigint;
    totalWithdrawn: bigint;
    totalInterestPaid: bigint;
    currentTvl: bigint;
    minDeposit: bigint;
    lockPeriod: number;
    minApy: number;
    maxApy: number;
};

export function tradFiBufferConfigToCell(config: TradFiBufferConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.complianceGatewayAddress)
        .storeRef(
            beginCell()
                .storeAddress(config.shieldInstTokenAddress)
                .storeAddress(config.premiumDistributorAddress)
                .endCell()
        )
        .storeDict(null) // investor_balances
        .storeCoins(config.totalDeposited)
        .storeCoins(config.totalWithdrawn)
        .storeCoins(config.totalInterestPaid)
        .storeCoins(config.currentTvl)
        .storeCoins(config.minDeposit)
        .storeUint(config.lockPeriod, 32)
        .storeUint(config.minApy, 16)
        .storeUint(config.maxApy, 16)
        .endCell();
}

export class TradFiBuffer implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new TradFiBuffer(address);
    }

    static createFromConfig(config: TradFiBufferConfig, code: Cell, workchain = 0) {
        const data = tradFiBufferConfigToCell(config);
        const init = { code, data };
        return new TradFiBuffer(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDepositCapital(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
            apyRate: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: deposit_capital
                .storeCoins(opts.amount)
                .storeUint(opts.apyRate, 16)
                .endCell(),
        });
    }

    async sendWithdrawCapital(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: withdraw_capital
                .endCell(),
        });
    }

    async getInvestorDeposit(provider: ContractProvider, investor: Address): Promise<{
        amount: bigint;
        unlockTime: number;
        apyRate: number;
    }> {
        const result = await provider.get('get_investor_deposit', [
            { type: 'slice', cell: beginCell().storeAddress(investor).endCell() }
        ]);
        return {
            amount: result.stack.readBigNumber(),
            unlockTime: result.stack.readNumber(),
            apyRate: result.stack.readNumber(),
        };
    }

    async getBufferStats(provider: ContractProvider): Promise<{
        totalDeposited: bigint;
        totalWithdrawn: bigint;
        totalInterestPaid: bigint;
        currentTvl: bigint;
    }> {
        const result = await provider.get('get_buffer_stats', []);
        return {
            totalDeposited: result.stack.readBigNumber(),
            totalWithdrawn: result.stack.readBigNumber(),
            totalInterestPaid: result.stack.readBigNumber(),
            currentTvl: result.stack.readBigNumber(),
        };
    }

    async getMinDeposit(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_min_deposit', []);
        return result.stack.readBigNumber();
    }

    async getApyRange(provider: ContractProvider): Promise<{
        minApy: number;
        maxApy: number;
    }> {
        const result = await provider.get('get_apy_range', []);
        return {
            minApy: result.stack.readNumber(),
            maxApy: result.stack.readNumber(),
        };
    }
}
