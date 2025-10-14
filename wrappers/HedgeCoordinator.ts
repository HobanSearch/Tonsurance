import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';

export type HedgeCoordinatorConfig = {
    adminAddress: Address;
    factoryAddress: Address;
};

export enum VenueType {
    POLYMARKET = 1,
    PERPETUALS = 2,
    ALLIANZ = 3,
}

export enum HedgeStatus {
    PENDING = 0,
    FILLED = 1,
    FAILED = 2,
    LIQUIDATING = 3,
    LIQUIDATED = 4,
}

export type HedgePosition = {
    polymarketStatus: HedgeStatus;
    polymarketAmount: bigint;
    perpetualsStatus: HedgeStatus;
    perpetualsAmount: bigint;
    allianzStatus: HedgeStatus;
    allianzAmount: bigint;
};

export type LiquidationStatus = {
    timestamp: number;
    status: HedgeStatus;
    polymarketProceeds: bigint;
    perpetualsProceeds: bigint;
    allianzProceeds: bigint;
};

export function hedgeCoordinatorConfigToCell(config: HedgeCoordinatorConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.factoryAddress)
        .storeDict(null)  // authorized_keepers initially empty
        .storeDict(null)  // hedge_positions initially empty
        .storeDict(null)  // liquidations initially empty
        .endCell();
}

export class HedgeCoordinator implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new HedgeCoordinator(address);
    }

    static createFromConfig(config: HedgeCoordinatorConfig, code: Cell, workchain = 0) {
        const data = hedgeCoordinatorConfigToCell(config);
        const init = { code, data };
        return new HedgeCoordinator(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterHedge(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            venueId: VenueType;
            amount: bigint;
            externalId: string;
            status: HedgeStatus;
        }
    ) {
        // Convert external ID to 256-bit hash
        const externalIdHash = BigInt('0x' + Buffer.from(opts.externalId).toString('hex').padEnd(64, '0').slice(0, 64));

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x72656768, 32) // op::register_hedge
                .storeUint(opts.policyId, 64)
                .storeUint(opts.venueId, 8)
                .storeCoins(opts.amount)
                .storeUint(externalIdHash, 256)
                .storeUint(opts.status, 8)
                .endCell(),
        });
    }

    async sendLiquidateHedges(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            polymarketKeeper: Address;
            perpKeeper: Address;
            allianzKeeper: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x6c697164, 32) // op::liquidate_hedges
                .storeUint(opts.policyId, 64)
                .storeAddress(opts.polymarketKeeper)
                .storeAddress(opts.perpKeeper)
                .storeAddress(opts.allianzKeeper)
                .endCell(),
        });
    }

    async sendReportLiquidation(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            venueId: VenueType;
            proceeds: bigint;
            reserveVault: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x72706c64, 32) // op::report_liquidation
                .storeUint(opts.policyId, 64)
                .storeUint(opts.venueId, 8)
                .storeCoins(opts.proceeds)
                .storeAddress(opts.reserveVault)
                .endCell(),
        });
    }

    async sendUpdateFactory(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            factoryAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x75706466, 32) // op::update_factory
                .storeAddress(opts.factoryAddress)
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

    async getHedgePosition(provider: ContractProvider, policyId: bigint): Promise<HedgePosition> {
        const result = await provider.get('get_hedge_position', [
            { type: 'int', value: policyId },
        ]);

        return {
            polymarketStatus: Number(result.stack.readBigNumber()) as HedgeStatus,
            polymarketAmount: result.stack.readBigNumber(),
            perpetualsStatus: Number(result.stack.readBigNumber()) as HedgeStatus,
            perpetualsAmount: result.stack.readBigNumber(),
            allianzStatus: Number(result.stack.readBigNumber()) as HedgeStatus,
            allianzAmount: result.stack.readBigNumber(),
        };
    }

    async getLiquidationStatus(
        provider: ContractProvider,
        policyId: bigint
    ): Promise<LiquidationStatus> {
        const result = await provider.get('get_liquidation_status', [
            { type: 'int', value: policyId },
        ]);

        return {
            timestamp: Number(result.stack.readBigNumber()),
            status: Number(result.stack.readBigNumber()) as HedgeStatus,
            polymarketProceeds: result.stack.readBigNumber(),
            perpetualsProceeds: result.stack.readBigNumber(),
            allianzProceeds: result.stack.readBigNumber(),
        };
    }

    async getTotalLiquidationProceeds(provider: ContractProvider, policyId: bigint): Promise<bigint> {
        const result = await provider.get('get_total_liquidation_proceeds', [
            { type: 'int', value: policyId },
        ]);

        return result.stack.readBigNumber();
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

    async getFactoryAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_factory_address', []);
        return result.stack.readAddress();
    }
}
