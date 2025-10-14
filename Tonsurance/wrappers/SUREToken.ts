import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type SURETokenConfig = {
    totalSupply: bigint;
    mintable: boolean;
    adminAddress: Address;
    jettonWalletCode: Cell;
    content: Cell;
};

export function sureTokenConfigToCell(config: SURETokenConfig): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeInt(config.mintable ? -1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.content)
        .endCell();
}

export class SUREToken implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new SUREToken(address);
    }

    static createFromConfig(config: SURETokenConfig, code: Cell, workchain = 0) {
        const data = sureTokenConfigToCell(config);
        const init = { code, data };
        return new SUREToken(contractAddress(workchain, init), init);
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
}
