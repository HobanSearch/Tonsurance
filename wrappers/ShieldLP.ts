import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ShieldLPConfig = {
    totalSupply: bigint;
    mintable: boolean;
    adminAddress: Address;
    primaryVaultAddress: Address;
    jettonWalletCode: Cell;
    content: Cell;
};

export function shieldLPConfigToCell(config: ShieldLPConfig): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeInt(config.mintable ? -1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeAddress(config.primaryVaultAddress)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.content)
        .endCell();
}

export class ShieldLP implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ShieldLP(address);
    }

    static createFromConfig(config: ShieldLPConfig, code: Cell, workchain = 0) {
        const data = shieldLPConfigToCell(config);
        const init = { code, data };
        return new ShieldLP(contractAddress(workchain, init), init);
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

    async getPrimaryVault(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_primary_vault', []);
        return result.stack.readAddress();
    }

    async getTotalSupply(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_supply', []);
        return result.stack.readBigNumber();
    }
}
