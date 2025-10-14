import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ShieldInstConfig = {
    totalSupply: bigint;
    mintable: boolean;
    adminAddress: Address;
    tradfiBufferAddress: Address;
    complianceGatewayAddress: Address;
    jettonWalletCode: Cell;
    content: Cell;
};

export function shieldInstConfigToCell(config: ShieldInstConfig): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeInt(config.mintable ? -1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeAddress(config.tradfiBufferAddress)
        .storeAddress(config.complianceGatewayAddress)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.content)
        .storeDict(null) // deposit_locks
        .endCell();
}

export class ShieldInst implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ShieldInst(address);
    }

    static createFromConfig(config: ShieldInstConfig, code: Cell, workchain = 0) {
        const data = shieldInstConfigToCell(config);
        const init = { code, data };
        return new ShieldInst(contractAddress(workchain, init), init);
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
            lockDays: number; // 180 days
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
                .storeUint(opts.lockDays, 16)
                .endCell(),
        });
    }

    async sendCheckTransferEligibility(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            fromAddress: Address;
            toAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x08, 32) // op: check_transfer_eligibility
                .storeAddress(opts.fromAddress)
                .storeAddress(opts.toAddress)
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

    async getTradfiBuffer(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_tradfi_buffer', []);
        return result.stack.readAddress();
    }

    async getComplianceGateway(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_compliance_gateway', []);
        return result.stack.readAddress();
    }

    async getUnlockTime(provider: ContractProvider, investor: Address): Promise<number> {
        const result = await provider.get('get_unlock_time', [
            { type: 'slice', cell: beginCell().storeAddress(investor).endCell() }
        ]);
        return result.stack.readNumber();
    }

    async isUnlocked(provider: ContractProvider, investor: Address): Promise<boolean> {
        const result = await provider.get('is_unlocked', [
            { type: 'slice', cell: beginCell().storeAddress(investor).endCell() }
        ]);
        return result.stack.readBoolean();
    }

    async getLockPeriod(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_lock_period', []);
        return result.stack.readNumber();
    }
}
