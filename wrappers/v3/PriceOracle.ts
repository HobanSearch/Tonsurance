import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary,
    TupleBuilder,
} from '@ton/core';

export type PriceOracleConfig = {
    masterFactoryAddress: Address;
    rewardsAddress: Address;
    priceFeeds: Dictionary<number, Cell>;
    bridgeStatus: Dictionary<number, Cell>;
    oracleStatus: Dictionary<number, Cell>;
    protocolStatus: Dictionary<number, Cell>;
    oracleKeepers: Dictionary<bigint, Cell>;
    minOracleCount: number;
    maxPriceAge: number;
    maxStatusAge: number;
};

export function priceOracleConfigToCell(config: PriceOracleConfig): Cell {
    return beginCell()
        .storeAddress(config.masterFactoryAddress)
        .storeAddress(config.rewardsAddress)
        .storeDict(config.priceFeeds)
        .storeDict(config.bridgeStatus)
        .storeDict(config.oracleStatus)
        .storeDict(config.protocolStatus)
        .storeDict(config.oracleKeepers)
        .storeUint(config.minOracleCount, 8)
        .storeUint(config.maxPriceAge, 32)
        .storeUint(config.maxStatusAge, 32)
        .endCell();
}

// Asset IDs - Depeg Products
export const ASSET_USDT = 1;
export const ASSET_USDC = 2;
export const ASSET_DAI = 3;
export const ASSET_USDD = 4;
export const ASSET_TUSD = 5;
export const ASSET_FDUSD = 6;

// Bridge IDs
export const BRIDGE_TON = 1;
export const BRIDGE_ORBIT = 2;
export const BRIDGE_WORMHOLE = 3;
export const BRIDGE_AXELAR = 4;

// Oracle Provider IDs
export const ORACLE_REDSTONE = 1;
export const ORACLE_PYTH = 2;
export const ORACLE_CHAINLINK = 3;
export const ORACLE_DIA = 4;

// Protocol IDs
export const PROTOCOL_DEDUST = 1;
export const PROTOCOL_STON = 2;
export const PROTOCOL_TONSTAKERS = 3;
export const PROTOCOL_EVAA = 4;

// Constants
export const PRICE_DECIMALS = 1000000; // 6 decimals for USD pairs
export const MAX_PRICE_AGE_DEFAULT = 300; // 5 minutes
export const MAX_STATUS_AGE_DEFAULT = 1800; // 30 minutes
export const MIN_ORACLE_COUNT_DEFAULT = 3; // 3 out of 5 keepers

// Product Types (for trigger validation)
export const PRODUCT_TYPE_DEPEG = 1;
export const PRODUCT_TYPE_BRIDGE = 2;
export const PRODUCT_TYPE_ORACLE = 3;
export const PRODUCT_TYPE_PROTOCOL = 4;

export class PriceOracle implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

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

    async sendRegisterKeeper(provider: ContractProvider, via: Sender, opts: { value: bigint; keeperAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x01, 32).storeAddress(opts.keeperAddress).endCell(),
        });
    }

    async sendDeactivateKeeper(provider: ContractProvider, via: Sender, opts: { value: bigint; keeperAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x02, 32).storeAddress(opts.keeperAddress).endCell(),
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
                .storeUint(0x03, 32)
                .storeUint(opts.assetId, 16)
                .storeCoins(opts.price)
                .storeUint(opts.timestamp, 32)
                .storeRef(opts.signature)
                .endCell(),
        });
    }

    async sendUpdateBridgeStatus(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            bridgeId: number;
            isOnline: boolean;
            lastSeen: number;
            signature: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32)
                .storeUint(opts.bridgeId, 8)
                .storeBit(opts.isOnline)
                .storeUint(opts.lastSeen, 32)
                .storeRef(opts.signature)
                .endCell(),
        });
    }

    async sendUpdateOracleStatus(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            oracleId: number;
            isHealthy: boolean;
            lastUpdateTime: number;
            deviationBps: number;
            signature: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x05, 32)
                .storeUint(opts.oracleId, 8)
                .storeBit(opts.isHealthy)
                .storeUint(opts.lastUpdateTime, 32)
                .storeUint(opts.deviationBps, 16)
                .storeRef(opts.signature)
                .endCell(),
        });
    }

    async sendUpdateProtocolStatus(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            protocolId: number;
            isPaused: boolean;
            pauseTimestamp: number;
            signature: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x06, 32)
                .storeUint(opts.protocolId, 8)
                .storeBit(opts.isPaused)
                .storeUint(opts.pauseTimestamp, 32)
                .storeRef(opts.signature)
                .endCell(),
        });
    }

    async sendSetMinOracleCount(provider: ContractProvider, via: Sender, opts: { value: bigint; minOracleCount: number }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x10, 32).storeUint(opts.minOracleCount, 8).endCell(),
        });
    }

    async sendSetMaxPriceAge(provider: ContractProvider, via: Sender, opts: { value: bigint; maxPriceAge: number }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x11, 32).storeUint(opts.maxPriceAge, 32).endCell(),
        });
    }

    async getPrice(provider: ContractProvider, assetId: number): Promise<{ price: bigint; timestamp: number; isStale: boolean }> {
        const args = new TupleBuilder();
        args.writeNumber(assetId);
        const result = await provider.get('get_price', args.build());
        return {
            price: result.stack.readBigNumber(),
            timestamp: Number(result.stack.readBigNumber()),
            isStale: result.stack.readBigNumber() === 1n,
        };
    }

    async getLatestPrice(provider: ContractProvider, assetId: number): Promise<bigint> {
        const args = new TupleBuilder();
        args.writeNumber(assetId);
        const result = await provider.get('get_latest_price', args.build());
        return result.stack.readBigNumber();
    }

    async isPriceStale(provider: ContractProvider, assetId: number): Promise<boolean> {
        const args = new TupleBuilder();
        args.writeNumber(assetId);
        const result = await provider.get('is_price_stale', args.build());
        const stale = result.stack.readBigNumber();
        return stale !== 0n; // -1 (no data) or 1 (stale) = true
    }

    async getKeeperStats(
        provider: ContractProvider,
        keeperAddress: Address
    ): Promise<{ updateCount: number; accuracyScore: number; isActive: boolean }> {
        const args = new TupleBuilder();
        args.writeAddress(keeperAddress);
        const result = await provider.get('get_keeper_stats', args.build());
        return {
            updateCount: Number(result.stack.readBigNumber()),
            accuracyScore: Number(result.stack.readBigNumber()),
            isActive: result.stack.readBigNumber() === 1n,
        };
    }

    async getMinOracleCount(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_min_oracle_count', []);
        return Number(result.stack.readBigNumber());
    }

    async getMaxPriceAge(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_max_price_age', []);
        return Number(result.stack.readBigNumber());
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }

    async validateTrigger(
        provider: ContractProvider,
        opts: {
            productType: number;
            assetId: number;
            triggerThreshold: bigint;
            triggerDuration: number;
        }
    ): Promise<{ isTriggered: boolean; proof: Cell }> {
        const args = new TupleBuilder();
        args.writeNumber(opts.productType);
        args.writeNumber(opts.assetId);
        args.writeNumber(Number(opts.triggerThreshold));
        args.writeNumber(opts.triggerDuration);
        const result = await provider.get('validate_trigger', args.build());
        return {
            isTriggered: result.stack.readBigNumber() === 1n,
            proof: result.stack.readCell(),
        };
    }
}

/**
 * Formats price for display (converts 6-decimal fixed-point to float)
 * @param price Price in PRICE_DECIMALS format
 * @returns Price as float (e.g., 0.995 for $0.995)
 */
export function formatPrice(price: bigint): number {
    return Number(price) / PRICE_DECIMALS;
}

/**
 * Encodes price from float to 6-decimal fixed-point
 * @param price Price as float (e.g., 0.995)
 * @returns Price in PRICE_DECIMALS format
 */
export function encodePrice(price: number): bigint {
    return BigInt(Math.round(price * PRICE_DECIMALS));
}

/**
 * Checks if price is below depeg threshold
 * @param price Current price (e.g., 0.965 USDT/USD)
 * @param threshold Depeg threshold (e.g., 0.98)
 * @returns True if depegged
 */
export function isDepegged(price: number, threshold: number): boolean {
    return price < threshold;
}
