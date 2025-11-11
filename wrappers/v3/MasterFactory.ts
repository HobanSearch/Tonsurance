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
    TupleBuilder
} from '@ton/core';

export type MasterFactoryConfig = {
    adminAddress: Address;
    gasWalletAddress: Address;
    sbtVerifierAddress: Address;
    policyNFTMinterAddress: Address;
    vaultAddress: Address;
    productFactories: Dictionary<number, Address>;  // product_type -> factory_address
    factoryCodes: Dictionary<number, Cell>;         // product_type -> factory_code
    totalPoliciesCreated: bigint;
    paused: boolean;
    requiredKycTier: number;
    activePolicies: Dictionary<bigint, Cell>;       // policy_id -> policy_data
    totalClaimsProcessed: bigint;
};

export function masterFactoryConfigToCell(config: MasterFactoryConfig): Cell {
    // Store addresses in 2 references (5 addresses = 1335 bits > 1023 limit)
    // First ref: admin, gas_wallet, sbt_verifier (3 × 267 = 801 bits)
    const addresses1Cell = beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.gasWalletAddress)
        .storeAddress(config.sbtVerifierAddress)
        .endCell();

    // Second ref: policy_nft_minter, vault (2 × 267 = 534 bits)
    const addresses2Cell = beginCell()
        .storeAddress(config.policyNFTMinterAddress)
        .storeAddress(config.vaultAddress)
        .endCell();

    return beginCell()
        .storeRef(addresses1Cell)
        .storeRef(addresses2Cell)
        .storeDict(config.productFactories)
        .storeDict(config.factoryCodes)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeBit(config.paused)
        .storeUint(config.requiredKycTier, 8)
        .storeDict(config.activePolicies)
        .storeUint(config.totalClaimsProcessed, 64)
        .endCell();
}

export class MasterFactory implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new MasterFactory(address);
    }

    static createFromConfig(config: MasterFactoryConfig, code: Cell, workchain = 0) {
        const data = masterFactoryConfigToCell(config);
        const init = { code, data };
        return new MasterFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // POLICY CREATION
    // ================================================================

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
                .storeUint(0x20, 32) // op::create_policy
                .storeUint(opts.productType, 8)
                .storeUint(opts.assetId, 16)
                .storeRef(opts.policyParams)
                .endCell(),
        });
    }

    // ================================================================
    // ADMIN FUNCTIONS
    // ================================================================

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
                .storeUint(0x21, 32) // op::register_product_factory
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
                .storeUint(0x22, 32) // op::set_factory_code
                .storeUint(opts.productType, 8)
                .storeRef(opts.factoryCode)
                .endCell(),
        });
    }

    async sendSetGasWallet(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            gasWalletAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x23, 32) // op::set_gas_wallet
                .storeAddress(opts.gasWalletAddress)
                .endCell(),
        });
    }

    async sendSetSBTVerifier(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            sbtVerifierAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x24, 32) // op::set_sbt_verifier
                .storeAddress(opts.sbtVerifierAddress)
                .endCell(),
        });
    }

    async sendSetPolicyNFTMinter(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyNFTMinterAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x25, 32) // op::set_policy_nft_minter
                .storeAddress(opts.policyNFTMinterAddress)
                .endCell(),
        });
    }

    async sendSetVault(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            vaultAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x26, 32) // op::set_vault
                .storeAddress(opts.vaultAddress)
                .endCell(),
        });
    }

    async sendSetRequiredKycTier(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            requiredKycTier: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x27, 32) // op::set_required_kyc_tier
                .storeUint(opts.requiredKycTier, 8)
                .endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x28, 32) // op::pause
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x29, 32) // op::unpause
                .endCell(),
        });
    }

    // ================================================================
    // POLICY REGISTRY (INTERNAL - FROM CHILD CONTRACTS)
    // ================================================================

    async sendRegisterPolicy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            productType: number;
            assetId: number;
            userAddress: Address;
            coverageAmount: bigint;
            expiryTimestamp: number;
            childAddress: Address;
            triggerParam1: number;
            triggerParam2: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x51, 32) // op::register_policy
                .storeUint(opts.policyId, 64)
                .storeUint(opts.productType, 8)
                .storeUint(opts.assetId, 16)
                .storeAddress(opts.userAddress)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.expiryTimestamp, 32)
                .storeAddress(opts.childAddress)
                .storeUint(opts.triggerParam1, 32)
                .storeUint(opts.triggerParam2, 32)
                .endCell(),
        });
    }

    // ================================================================
    // CLAIM PROCESSING (INTERNAL - FROM CHILD CONTRACTS)
    // ================================================================

    async sendProcessClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            productType: number;
            assetId: number;
            userAddress: Address;
            coverageAmount: bigint;
            triggerPrice: number;
            triggerTimestamp: number;
            triggerParam1: number;
            triggerParam2: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x53, 32) // op::process_claim
                .storeUint(opts.policyId, 64)
                .storeUint(opts.productType, 8)
                .storeUint(opts.assetId, 16)
                .storeAddress(opts.userAddress)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.triggerPrice, 32)
                .storeUint(opts.triggerTimestamp, 32)
                .storeUint(opts.triggerParam1, 32)
                .storeUint(opts.triggerParam2, 32)
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

    async getGasWallet(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_gas_wallet', []);
        return result.stack.readAddress();
    }

    async getSBTVerifier(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_sbt_verifier', []);
        return result.stack.readAddress();
    }

    async getPolicyNFTMinter(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_policy_nft_minter', []);
        return result.stack.readAddress();
    }

    async getVault(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_vault', []);
        return result.stack.readAddress();
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

    async getTotalPoliciesCreated(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_policies_created', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getRequiredKycTier(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_required_kyc_tier', []);
        return Number(result.stack.readBigNumber());
    }

    async isFactoryDeployed(provider: ContractProvider, productType: number): Promise<boolean> {
        const result = await provider.get('is_factory_deployed', [
            { type: 'int', value: BigInt(productType) }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }

    async getPolicy(provider: ContractProvider, policyId: bigint): Promise<{
        productType: number;
        assetId: number;
        userAddress: Address | null;
        coverage: bigint;
        expiry: number;
        childAddress: Address | null;
        claimed: boolean;
        createdAt: number;
    } | null> {
        const result = await provider.get('get_policy', [
            { type: 'int', value: policyId }
        ]);

        const productType = Number(result.stack.readBigNumber());

        // Check if policy exists (productType = 0 means not found)
        if (productType === 0) {
            return null;
        }

        const assetId = Number(result.stack.readBigNumber());
        const userAddress = result.stack.readAddress();
        const coverage = result.stack.readBigNumber();
        const expiry = Number(result.stack.readBigNumber());
        const childAddress = result.stack.readAddress();
        const claimed = result.stack.readBigNumber() === 1n;
        const createdAt = Number(result.stack.readBigNumber());

        return {
            productType,
            assetId,
            userAddress,
            coverage,
            expiry,
            childAddress,
            claimed,
            createdAt,
        };
    }

    async hasPolicy(provider: ContractProvider, policyId: bigint): Promise<boolean> {
        const result = await provider.get('has_policy', [
            { type: 'int', value: policyId }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async getTotalClaimsProcessed(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_claims_processed', []);
        return result.stack.readBigNumber();
    }
}
