import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type SURE_JNR_PLUS_Config = {
    total_supply: bigint;
    mintable: boolean;
    admin_address: Address;
    vault_address: Address;
    jetton_wallet_code: Cell;
    content: Cell;
};

export function sure_jnr_plus_ConfigToCell(config: SURE_JNR_PLUS_Config): Cell {
    return beginCell()
        .storeCoins(config.total_supply)
        .storeUint(config.mintable ? 1 : 0, 1)
        .storeAddress(config.admin_address)
        .storeAddress(config.vault_address)
        .storeRef(config.jetton_wallet_code)
        .storeRef(config.content)
        .storeDict(null) // stake_locks initially empty
        .endCell();
}

export class SURE_JNR_PLUS implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new SURE_JNR_PLUS(address);
    }

    static createFromConfig(config: SURE_JNR_PLUS_Config, code: Cell, workchain = 0) {
        const data = sure_jnr_plus_ConfigToCell(config);
        const init = { code, data };
        return new SURE_JNR_PLUS(contractAddress(workchain, init), init);
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
            to_address: Address;
            amount: bigint;
            response_address: Address;
            query_id?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x15, 32) // op::mint
                .storeUint(opts.query_id ?? 0, 64)
                .storeAddress(opts.to_address)
                .storeCoins(opts.amount)
                .storeAddress(opts.response_address)
                .endCell(),
        });
    }

    async getTotalSupply(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_jetton_data', []);
        return result.stack.readBigNumber();
    }

    async getLockPeriod(provider: ContractProvider): Promise<number> {
        // SURE-JNR+ has NO lock period
        return 0;
    }

    async isUnlocked(provider: ContractProvider, user: Address): Promise<boolean> {
        // JNR+ tokens are always unlocked (no lock-up period)
        return true;
    }
}
