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

export type BridgeSubFactoryConfig = {
    masterFactoryAddress: Address;
    productType: number; // = 2 (PRODUCT_BRIDGE)
    children: Dictionary<number, Address>;  // asset_id -> child_address
    childCodes: Dictionary<number, Cell>;   // asset_id -> child_code
    totalChildrenDeployed: number;
    totalPoliciesCreated: bigint;
    paused: boolean;
};

export function bridgeSubFactoryConfigToCell(config: BridgeSubFactoryConfig): Cell {
    return beginCell()
        .storeAddress(config.masterFactoryAddress)
        .storeUint(config.productType, 8)
        .storeDict(config.children)
        .storeDict(config.childCodes)
        .storeUint(config.totalChildrenDeployed, 32)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeBit(config.paused)
        .endCell();
}

// Bridge Asset IDs
export const ASSET_TON_BRIDGE = 1;
export const ASSET_ORBIT_BRIDGE = 2;
export const ASSET_WORMHOLE = 3;
export const ASSET_AXELAR = 4;

export class BridgeSubFactory implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new BridgeSubFactory(address);
    }

    static createFromConfig(config: BridgeSubFactoryConfig, code: Cell, workchain = 0) {
        const data = bridgeSubFactoryConfigToCell(config);
        const init = { code, data };
        return new BridgeSubFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // POLICY CREATION (FROM MASTERFACTORY)
    // ================================================================

    async sendCreatePolicyFromMaster(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            assetId: number;
            policyParams: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x30, 32) // op::create_policy_from_master
                .storeAddress(opts.userAddress)
                .storeUint(opts.assetId, 16)
                .storeRef(opts.policyParams)
                .endCell(),
        });
    }

    // ================================================================
    // ADMIN FUNCTIONS (FROM MASTERFACTORY)
    // ================================================================

    async sendRegisterChild(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            assetId: number;
            childAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x31, 32) // op::register_child
                .storeUint(opts.assetId, 16)
                .storeAddress(opts.childAddress)
                .endCell(),
        });
    }

    async sendSetChildCode(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            assetId: number;
            childCode: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x32, 32) // op::set_child_code
                .storeUint(opts.assetId, 16)
                .storeRef(opts.childCode)
                .endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x33, 32) // op::pause
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x34, 32) // op::unpause
                .endCell(),
        });
    }

    // ================================================================
    // GETTER METHODS
    // ================================================================

    async getMasterFactory(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_master_factory', []);
        return result.stack.readAddress();
    }

    async getProductType(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_product_type', []);
        return Number(result.stack.readBigNumber());
    }

    async getChild(provider: ContractProvider, assetId: number): Promise<Address | null> {
        const result = await provider.get('get_child', [
            { type: 'int', value: BigInt(assetId) }
        ]);

        try {
            return result.stack.readAddress();
        } catch {
            return null;
        }
    }

    async isChildDeployed(provider: ContractProvider, assetId: number): Promise<boolean> {
        const result = await provider.get('has_child', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async getTotalChildren(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_total_children', []);
        return Number(result.stack.readBigNumber());
    }

    async getTotalPolicies(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_policies', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getSupportedBridges(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_supported_bridges', []);
        return Number(result.stack.readBigNumber());
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}
