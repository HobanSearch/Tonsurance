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

export type GasWalletConfig = {
    adminAddress: Address;
    masterFactoryAddress: Address;
    totalSponsored: bigint;
    userNonces: Dictionary<bigint, bigint>;         // addr_hash -> last_nonce
    rateLimits: Dictionary<bigint, Cell>;           // addr_hash -> (last_ts, count)
    reserveBalance: bigint;
    publicKey: bigint;
    paused: boolean;
};

export function gasWalletConfigToCell(config: GasWalletConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.masterFactoryAddress)
        .storeCoins(config.totalSponsored)
        .storeDict(config.userNonces)
        .storeDict(config.rateLimits)
        .storeCoins(config.reserveBalance)
        .storeUint(config.publicKey, 256)
        .storeBit(config.paused)
        .endCell();
}

export class GasWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new GasWallet(address);
    }

    static createFromConfig(config: GasWalletConfig, code: Cell, workchain = 0) {
        const data = gasWalletConfigToCell(config);
        const init = { code, data };
        return new GasWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // EXTERNAL MESSAGE (SIGNED TRANSACTION)
    // ================================================================
    // Note: External messages require signature validation
    // This method is for reference - in production, use wallet SDK

    async sendExternalForward(
        provider: ContractProvider,
        opts: {
            signature: Buffer;
            nonce: bigint;
            userAddress: Address;
            payload: Cell;
        }
    ) {
        const body = beginCell()
            .storeBuffer(opts.signature) // 512 bits
            .storeUint(opts.nonce, 64)
            .storeAddress(opts.userAddress)
            .storeSlice(opts.payload.beginParse())
            .endCell();

        await provider.external(body);
    }

    // ================================================================
    // ADMIN FUNCTIONS
    // ================================================================

    async sendSetMasterFactory(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            masterFactoryAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op::set_master_factory
                .storeAddress(opts.masterFactoryAddress)
                .endCell(),
        });
    }

    async sendFundWallet(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op::fund_wallet
                .endCell(),
        });
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            withdrawAmount: bigint;
            destinationAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32) // op::withdraw
                .storeCoins(opts.withdrawAmount)
                .storeAddress(opts.destinationAddress)
                .endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x05, 32) // op::pause
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x06, 32) // op::unpause
                .endCell(),
        });
    }

    async sendSetPublicKey(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            publicKey: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x07, 32) // op::set_public_key
                .storeUint(opts.publicKey, 256)
                .endCell(),
        });
    }

    // ================================================================
    // GETTER METHODS
    // ================================================================

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getMasterFactory(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_master_factory', []);
        return result.stack.readAddress();
    }

    async getTotalSponsored(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_sponsored', []);
        return result.stack.readBigNumber();
    }

    async getReserveBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_reserve_balance', []);
        return result.stack.readBigNumber();
    }

    async getPublicKey(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_public_key', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getNextNonce(provider: ContractProvider, userAddress: Address): Promise<bigint> {
        const result = await provider.get('get_next_nonce', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            }
        ]);
        return result.stack.readBigNumber();
    }

    async getRateLimitStatus(provider: ContractProvider, userAddress: Address): Promise<{
        lastTimestamp: number;
        countInWindow: number;
        limitReached: boolean;
    }> {
        const result = await provider.get('get_rate_limit_status', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            }
        ]);

        const lastTimestamp = Number(result.stack.readBigNumber());
        const countInWindow = Number(result.stack.readBigNumber());
        const limitReached = result.stack.readBigNumber() === 1n;

        return { lastTimestamp, countInWindow, limitReached };
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }

    async getWalletBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_wallet_balance', []);
        return result.stack.readBigNumber();
    }
}
