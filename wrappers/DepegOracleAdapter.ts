import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export type DepegOracleAdapterConfig = {
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    keeperAddress: Address;
};

export function depegOracleAdapterConfigToCell(config: DepegOracleAdapterConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.keeperAddress)
        .storeDict(null) // price_data
        .storeUint(0, 32) // last_update_timestamp
        .endCell();
}

export class DepegOracleAdapter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new DepegOracleAdapter(address);
    }

    static createFromConfig(config: DepegOracleAdapterConfig, code: Cell, workchain = 0) {
        const data = depegOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new DepegOracleAdapter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendUpdatePrice(
        provider: ContractProvider,
        via: Sender,
        stablecoinId: number,
        timestamp: number,
        price: bigint,
        sourceBitmap: number
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x12, 32) // OP_UPDATE_PRICE
                .storeUint(stablecoinId, 8)
                .storeUint(timestamp, 32)
                .storeUint(price, 64)
                .storeUint(sourceBitmap, 8)
                .endCell(),
        });
    }

    async sendBatchUpdatePrices(
        provider: ContractProvider,
        via: Sender,
        updates: Array<{
            stablecoinId: number;
            timestamp: number;
            price: bigint;
            sourceBitmap: number;
        }>
    ) {
        const body = beginCell()
            .storeUint(0x13, 32) // OP_BATCH_UPDATE_PRICES
            .storeUint(updates.length, 16);

        updates.forEach(update => {
            body.storeUint(update.stablecoinId, 8)
                .storeUint(update.timestamp, 32)
                .storeUint(update.price, 64)
                .storeUint(update.sourceBitmap, 8);
        });

        await provider.internal(via, {
            value: toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body.endCell(),
        });
    }

    async sendSetClaimsProcessor(provider: ContractProvider, via: Sender, newProcessor: Address) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // OP_SET_CLAIMS_PROCESSOR
                .storeAddress(newProcessor)
                .endCell(),
        });
    }

    async sendSetKeeper(provider: ContractProvider, via: Sender, newKeeper: Address) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x11, 32) // OP_SET_KEEPER
                .storeAddress(newKeeper)
                .endCell(),
        });
    }

    async getOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }

    async getClaimsProcessor(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_claims_processor', []);
        return result.stack.readAddress();
    }

    async getKeeper(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_keeper', []);
        return result.stack.readAddress();
    }

    async getLastUpdate(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_last_update', []);
        return result.stack.readNumber();
    }

    async getPrice(provider: ContractProvider, stablecoinId: number, timestamp: number): Promise<{
        price: bigint;
        sourceBitmap: number;
        found: boolean;
    }> {
        const result = await provider.get('get_price', [
            { type: 'int', value: BigInt(stablecoinId) },
            { type: 'int', value: BigInt(timestamp) }
        ]);

        const price = result.stack.readBigNumber();
        const sourceBitmap = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;

        return { price, sourceBitmap, found };
    }
}
