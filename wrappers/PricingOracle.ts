import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice,
} from '@ton/core';

export type PricingOracleConfig = {
    adminAddress: Address;
    authorizedKeepers?: Address[];
};

export type HedgePrices = {
    polymarketOdds: number;      // Basis points (250 = 2.5%)
    perpFundingRate: number;     // Basis points per day (-50 = -0.5%)
    allianzQuote: number;        // Cents per $1000 (450 = $4.50)
    timestamp: number;
};

export enum CoverageType {
    DEPEG = 1,
    EXPLOIT = 2,
    BRIDGE = 3,
}

export function pricingOracleConfigToCell(config: PricingOracleConfig): Cell {
    // Build authorized keepers dictionary
    // TODO: In production, populate with actual keepers
    const keepersDict = undefined;

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeDict(keepersDict)
        .storeDict(undefined)  // hedge_prices initially empty
        .storeUint(0, 32) // last_update_time = 0
        .endCell();
}

export class PricingOracle implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new PricingOracle(address);
    }

    static createFromConfig(config: PricingOracleConfig, code: Cell, workchain = 0) {
        const data = pricingOracleConfigToCell(config);
        const init = { code, data };
        return new PricingOracle(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendUpdateHedgePrices(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            coverageType: CoverageType;
            polymarketOdds: number;
            perpFundingRate: number;
            allianzQuote: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x75706461, 32) // op::update_hedge_prices
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.polymarketOdds, 32)
                .storeInt(opts.perpFundingRate, 32)
                .storeUint(opts.allianzQuote, 32)
                .endCell(),
        });
    }

    async sendAddKeeper(
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
                .storeUint(0x61646b70, 32) // op::add_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }

    async sendRemoveKeeper(
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
                .storeUint(0x726d6b70, 32) // op::remove_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }

    async getHedgePrices(
        provider: ContractProvider,
        coverageType: CoverageType
    ): Promise<HedgePrices> {
        const result = await provider.get('get_hedge_prices', [
            { type: 'int', value: BigInt(coverageType) },
        ]);

        return {
            polymarketOdds: Number(result.stack.readBigNumber()),
            perpFundingRate: Number(result.stack.readBigNumber()),
            allianzQuote: Number(result.stack.readBigNumber()),
            timestamp: Number(result.stack.readBigNumber()),
        };
    }

    async calculateHedgeCost(
        provider: ContractProvider,
        coverageType: CoverageType,
        coverageAmount: bigint,
        durationDays: number
    ): Promise<bigint> {
        const result = await provider.get('calculate_hedge_cost', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) },
        ]);

        return result.stack.readBigNumber();
    }

    async getLastUpdateTime(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_last_update_time', []);
        return Number(result.stack.readBigNumber());
    }

    async checkKeeperAuthorized(
        provider: ContractProvider,
        keeperAddress: Address
    ): Promise<boolean> {
        const result = await provider.get('check_keeper_authorized', [
            { type: 'slice', cell: beginCell().storeAddress(keeperAddress).endCell() },
        ]);

        return result.stack.readBoolean();
    }

    async getAdminAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin_address', []);
        return result.stack.readAddress();
    }

    async isDataFresh(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('is_data_fresh', []);
        return result.stack.readBoolean();
    }
}
