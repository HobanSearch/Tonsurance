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

export type MasterFactoryProxyConfig = {
    implementationAddress: Address;
    adminAddress: Address;
    paused: boolean;
    lastUpgradeTimestamp: number;
    activePolicies: Dictionary<bigint, Cell>;        // policy_id -> policy_data
    productFactories: Dictionary<number, Address>;   // product_type -> factory_address
    totalPoliciesCreated: bigint;
    protocolVersion: number;
};

export function masterFactoryProxyConfigToCell(config: MasterFactoryProxyConfig): Cell {
    return beginCell()
        .storeAddress(config.implementationAddress)
        .storeAddress(config.adminAddress)
        .storeBit(config.paused)
        .storeUint(config.lastUpgradeTimestamp, 32)
        .storeDict(config.activePolicies)
        .storeDict(config.productFactories)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeUint(config.protocolVersion, 16)
        .endCell();
}

export class MasterFactoryProxy implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new MasterFactoryProxy(address);
    }

    static createFromConfig(config: MasterFactoryProxyConfig, code: Cell, workchain = 0) {
        const data = masterFactoryProxyConfigToCell(config);
        const init = { code, data };
        return new MasterFactoryProxy(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // PROXY-SPECIFIC OPERATIONS (NOT FORWARDED)
    // ================================================================

    async sendUpgradeImplementation(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            implementationAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xFF, 32) // op::upgrade_implementation
                .storeAddress(opts.implementationAddress)
                .endCell(),
        });
    }

    async sendSetAdmin(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            adminAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xFE, 32) // op::set_admin
                .storeAddress(opts.adminAddress)
                .endCell(),
        });
    }

    async sendPauseProxy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xFD, 32) // op::pause_proxy
                .endCell(),
        });
    }

    async sendUnpauseProxy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xFC, 32) // op::unpause_proxy
                .endCell(),
        });
    }

    // ================================================================
    // FORWARDED OPERATIONS (TO IMPLEMENTATION)
    // ================================================================
    // These operations are forwarded to the implementation contract
    // The proxy adds 0.005 TON overhead for forwarding

    async sendCreatePolicy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            productType: number;
            assetId: number;
            policyParams: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x20, 32) // op::create_policy (forwarded)
                .storeUint(opts.productType, 8)
                .storeUint(opts.assetId, 16)
                .storeRef(opts.policyParams)
                .endCell(),
        });
    }

    async sendRegisterProductFactory(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            productType: number;
            factoryAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x21, 32) // op::register_product_factory (forwarded)
                .storeUint(opts.productType, 8)
                .storeAddress(opts.factoryAddress)
                .endCell(),
        });
    }

    async sendSetFactoryCode(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            productType: number;
            factoryCode: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x22, 32) // op::set_factory_code (forwarded)
                .storeUint(opts.productType, 8)
                .storeRef(opts.factoryCode)
                .endCell(),
        });
    }

    // ================================================================
    // GETTER METHODS
    // ================================================================

    async getImplementation(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_implementation', []);
        return result.stack.readAddress();
    }

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getProtocolVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_protocol_version', []);
        return Number(result.stack.readBigNumber());
    }

    async getLastUpgradeTimestamp(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_last_upgrade_timestamp', []);
        return Number(result.stack.readBigNumber());
    }

    async getTotalPoliciesCreated(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_policies_created', []);
        return result.stack.readBigNumber();
    }

    async hasPolicy(provider: ContractProvider, policyId: bigint): Promise<boolean> {
        const result = await provider.get('has_policy', [
            { type: 'int', value: policyId }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async getProductFactory(provider: ContractProvider, productType: number): Promise<Address | null> {
        const result = await provider.get('get_product_factory', [
            { type: 'int', value: BigInt(productType) }
        ]);

        try {
            return result.stack.readAddress();
        } catch {
            return null;
        }
    }
}
