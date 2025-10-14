import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type PriceOracleConfig = {
    ownerAddress: Address;
    oracleRewardsAddress: Address;
    minOracleCount: number;
    maxPriceAge: number;
};

export function priceOracleConfigToCell(config: PriceOracleConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.oracleRewardsAddress)
        .storeDict(null) // price_feeds
        .storeDict(null) // oracle_keepers
        .storeUint(config.minOracleCount, 8)
        .storeUint(config.maxPriceAge, 32)
        .endCell();
}

export class PriceOracle implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new PriceOracle(address);
    }

    static createFromConfig(config: PriceOracleConfig, code: Cell, workchain = 0) {
        const data = priceOracleConfigToCell(config);
        const init = { code, data };
        return new PriceOracle(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterKeeper(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            keeperAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: register_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }

    async sendUpdatePrice(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            assetId: number;
            price: bigint;
            timestamp: number;
            signature: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: update_price
                .storeUint(opts.assetId, 8)
                .storeCoins(opts.price)
                .storeUint(opts.timestamp, 32)
                .storeRef(opts.signature)
                .endCell(),
        });
    }

    async sendDeactivateKeeper(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            keeperAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // op: deactivate_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }

    async getPrice(provider: ContractProvider, assetId: number): Promise<{
        price: bigint;
        timestamp: number;
        isStale: boolean;
    }> {
        const result = await provider.get('get_price', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return {
            price: result.stack.readBigNumber(),
            timestamp: result.stack.readNumber(),
            isStale: result.stack.readBoolean(),
        };
    }

    async getLatestPrice(provider: ContractProvider, assetId: number): Promise<bigint> {
        const result = await provider.get('get_latest_price', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return result.stack.readBigNumber();
    }

    async isPriceStale(provider: ContractProvider, assetId: number): Promise<boolean> {
        const result = await provider.get('is_price_stale', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return result.stack.readBoolean();
    }

    async getKeeperStats(provider: ContractProvider, keeper: Address): Promise<{
        updateCount: number;
        accuracyScore: number;
        isActive: boolean;
    }> {
        const result = await provider.get('get_keeper_stats', [
            { type: 'slice', cell: beginCell().storeAddress(keeper).endCell() }
        ]);
        return {
            updateCount: result.stack.readNumber(),
            accuracyScore: result.stack.readNumber(),
            isActive: result.stack.readBoolean(),
        };
    }

    async getMinOracleCount(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_min_oracle_count', []);
        return result.stack.readNumber();
    }

    async getMaxPriceAge(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_max_price_age', []);
        return result.stack.readNumber();
    }
}
