import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type PrimaryVaultConfig = {
    ownerAddress: Address;
    totalLpCapital: bigint;
    totalSupply: bigint;
    maxSupply: bigint;
    priceMin: bigint;
    priceMax: bigint;
    accumulatedYield: bigint;
    lossesAbsorbed: bigint;
    claimsProcessorAddress: Address;
};

export function primaryVaultConfigToCell(config: PrimaryVaultConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.totalLpCapital)
        .storeCoins(config.totalSupply)
        .storeCoins(config.maxSupply)
        .storeCoins(config.priceMin)
        .storeCoins(config.priceMax)
        .storeCoins(config.accumulatedYield)
        .storeCoins(config.lossesAbsorbed)
        .storeAddress(config.claimsProcessorAddress)
        .storeDict(null) // lp_balances
        .endCell();
}

export class PrimaryVault implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new PrimaryVault(address);
    }

    static createFromConfig(config: PrimaryVaultConfig, code: Cell, workchain = 0) {
        const data = primaryVaultConfigToCell(config);
        const init = { code, data };
        return new PrimaryVault(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendDeposit(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;  // Amount to deposit (sent as msg_value)
        }
    ) {
        await provider.internal(via, {
            value: opts.amount,  // Actual TON to deposit
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),  // Empty body triggers deposit
        });
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            tokens: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: withdraw_lp_capital
                .storeCoins(opts.tokens)
                .endCell(),
        });
    }

    async sendReceivePremiumShare(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
            policyId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: receive_premium_share
                .storeCoins(opts.amount)
                .storeUint(opts.policyId, 64)
                .endCell(),
        });
    }

    async sendAbsorbLoss(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            lossAmount: bigint;
            claimant: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32) // op: absorb_claim_loss
                .storeCoins(opts.lossAmount)
                .storeAddress(opts.claimant)
                .endCell(),
        });
    }

    async getCurrentPrice(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_current_price', []);
        return result.stack.readBigNumber();
    }

    async getTotalLpCapital(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_lp_capital', []);
        return result.stack.readBigNumber();
    }

    async getTotalSupply(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_supply', []);
        return result.stack.readBigNumber();
    }

    async getLpBalance(provider: ContractProvider, depositor: Address): Promise<bigint> {
        const result = await provider.get('get_lp_balance', [
            { type: 'slice', cell: beginCell().storeAddress(depositor).endCell() }
        ]);
        return result.stack.readBigNumber();
    }

    async getVaultStats(provider: ContractProvider): Promise<{
        totalLpCapital: bigint;
        accumulatedYield: bigint;
        lossesAbsorbed: bigint;
        totalSupply: bigint;
    }> {
        const result = await provider.get('get_vault_stats', []);
        return {
            totalLpCapital: result.stack.readBigNumber(),
            accumulatedYield: result.stack.readBigNumber(),
            lossesAbsorbed: result.stack.readBigNumber(),
            totalSupply: result.stack.readBigNumber(),
        };
    }
}
