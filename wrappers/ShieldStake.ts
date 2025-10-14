import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ShieldStakeConfig = {
    totalSupply: bigint;
    mintable: boolean;
    adminAddress: Address;
    secondaryVaultAddress: Address;
    jettonWalletCode: Cell;
    content: Cell;
};

export function shieldStakeConfigToCell(config: ShieldStakeConfig): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeInt(config.mintable ? -1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeAddress(config.secondaryVaultAddress)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.content)
        .storeDict(null) // stake_locks
        .endCell();
}

export class ShieldStake implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ShieldStake(address);
    }

    static createFromConfig(config: ShieldStakeConfig, code: Cell, workchain = 0) {
        const data = shieldStakeConfigToCell(config);
        const init = { code, data };
        return new ShieldStake(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: bigint;
            toAddress: Address;
            amount: bigint;
            responseAddress: Address;
            lockDuration: number; // days
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(21, 32) // op: mint
                .storeUint(opts.queryId, 64)
                .storeAddress(opts.toAddress)
                .storeCoins(opts.amount)
                .storeAddress(opts.responseAddress)
                .storeUint(opts.lockDuration, 16)
                .endCell(),
        });
    }

    async getJettonData(provider: ContractProvider): Promise<{
        totalSupply: bigint;
        mintable: boolean;
        adminAddress: Address;
        content: Cell;
        walletCode: Cell;
    }> {
        const result = await provider.get('get_jetton_data', []);
        return {
            totalSupply: result.stack.readBigNumber(),
            mintable: result.stack.readBoolean(),
            adminAddress: result.stack.readAddress(),
            content: result.stack.readCell(),
            walletCode: result.stack.readCell(),
        };
    }

    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const result = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() }
        ]);
        return result.stack.readAddress();
    }

    async getSecondaryVault(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_secondary_vault', []);
        return result.stack.readAddress();
    }

    async getTotalSupply(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_supply', []);
        return result.stack.readBigNumber();
    }

    async getUnlockTime(provider: ContractProvider, user: Address): Promise<number> {
        const result = await provider.get('get_unlock_time', [
            { type: 'slice', cell: beginCell().storeAddress(user).endCell() }
        ]);
        return result.stack.readNumber();
    }

    async isUnlocked(provider: ContractProvider, user: Address): Promise<boolean> {
        const result = await provider.get('is_unlocked', [
            { type: 'slice', cell: beginCell().storeAddress(user).endCell() }
        ]);
        return result.stack.readBoolean();
    }
}
