import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type SecondaryVaultConfig = {
    ownerAddress: Address;
    totalStaked: bigint;
    accumulatedYield: bigint;
    lossesAbsorbed: bigint;
    claimsProcessorAddress: Address;
    totalSupply: bigint;
    maxSupply: bigint;
    priceMin: bigint;
    priceMax: bigint;
};

export function secondaryVaultConfigToCell(config: SecondaryVaultConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.totalStaked)
        .storeCoins(config.accumulatedYield)
        .storeCoins(config.lossesAbsorbed)
        .storeAddress(config.claimsProcessorAddress)
        .storeDict(null) // staker_data
        .storeCoins(config.priceMin)
        .storeCoins(config.priceMax)
        .storeUint(config.maxSupply, 64)
        .storeUint(config.totalSupply, 64)
        .endCell();
}

export class SecondaryVault implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new SecondaryVault(address);
    }

    static createFromConfig(config: SecondaryVaultConfig, code: Cell, workchain = 0) {
        const data = secondaryVaultConfigToCell(config);
        const init = { code, data };
        return new SecondaryVault(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendStake(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
            duration: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.amount + opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32)
                .storeCoins(opts.amount)
                .storeUint(opts.duration, 16)
                .endCell(),
        });
    }

    async sendUnstake(
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
                .storeUint(0x02, 32)
                .storeUint(opts.tokens, 64)  // FIXED: use storeUint not storeCoins
                .endCell(),
        });
    }

    async getTotalStaked(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_staked', []);
        return result.stack.readBigNumber();
    }

    async getCurrentPrice(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_current_token_price', []);  // FIXED: correct method name
        return result.stack.readBigNumber();
    }

    async getStakeInfo(provider: ContractProvider, staker: Address): Promise<{
        amount: bigint;
        stakeTime: number;
        unlockTime: number;
        tokens: bigint;
    }> {
        const result = await provider.get('get_stake_info', [
            { type: 'slice', cell: beginCell().storeAddress(staker).endCell() }
        ]);
        return {
            amount: result.stack.readBigNumber(),
            stakeTime: result.stack.readNumber(),
            unlockTime: result.stack.readNumber(),
            tokens: result.stack.readBigNumber(),
        };
    }
}
