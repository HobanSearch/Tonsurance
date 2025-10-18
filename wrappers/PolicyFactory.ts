import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Dictionary, Sender, SendMode } from '@ton/core';
import { CoverageType, Chain, Stablecoin, ProductKey, calculateProductHash, validateProduct, calculatePremium } from './types/ProductMatrix';

export type PolicyFactoryConfig = {
    ownerAddress: Address;
    nextPolicyId: bigint;
    totalPoliciesCreated: bigint;
    activePoliciesCount: bigint;
    treasuryAddress: Address;
    paused: number;
};

export function policyFactoryConfigToCell(config: PolicyFactoryConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextPolicyId, 64)
        .storeUint(config.totalPoliciesCreated, 64)
        .storeUint(config.activePoliciesCount, 64)
        .storeAddress(config.treasuryAddress)
        .storeUint(config.paused, 1)
        .storeDict(null)  // policies_dict (empty initially)
        .storeDict(null)  // pending_txs (empty initially)
        .storeUint(0, 32) // seq_no
        .endCell();
}

export class PolicyFactory implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new PolicyFactory(address);
    }

    static createFromConfig(config: PolicyFactoryConfig, code: Cell, workchain = 0) {
        const data = policyFactoryConfigToCell(config);
        const init = { code, data };
        return new PolicyFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    /**
     * Create a new insurance policy with multi-dimensional parameters
     * @param provider Contract provider
     * @param via Sender
     * @param opts Policy creation options
     */
    async sendCreatePolicy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            coverageType: CoverageType;
            chainId: Chain;
            stablecoinId: Stablecoin;
            coverageAmount: bigint;
            duration: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: create_policy (multi-dimensional)
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.chainId, 8)
                .storeUint(opts.stablecoinId, 8)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.duration, 16)
                .endCell(),
        });
    }

    async sendSetTreasury(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x12, 32) // op: set_treasury
                .storeAddress(opts.newAddress)
                .endCell(),
        });
    }

    async sendSetPriceOracle(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x13, 32) // op: set_price_oracle
                .storeAddress(opts.newAddress)
                .endCell(),
        });
    }

    async getTotalPoliciesCreated(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_policies_created', []);
        return result.stack.readBigNumber();
    }

    /**
     * Get policy data (extended with multi-dimensional fields)
     */
    async getPolicyData(provider: ContractProvider, policyId: bigint): Promise<{
        coverageType: CoverageType;
        chainId: Chain;
        stablecoinId: Stablecoin;
        coverageAmount: bigint;
        premium: bigint;
        startTime: number;
        duration: number;
        active: boolean;
    }> {
        const result = await provider.get('get_policy_data', [
            { type: 'int', value: policyId }
        ]);

        return {
            coverageType: result.stack.readNumber() as CoverageType,
            chainId: result.stack.readNumber() as Chain,
            stablecoinId: result.stack.readNumber() as Stablecoin,
            coverageAmount: result.stack.readBigNumber(),
            premium: result.stack.readBigNumber(),
            startTime: result.stack.readNumber(),
            duration: result.stack.readNumber(),
            active: result.stack.readBoolean(),
        };
    }

    /**
     * Calculate premium with multi-dimensional risk factors
     * Uses on-chain calculation (matches risk_multipliers.fc)
     */
    async getCalculatePremium(
        provider: ContractProvider,
        coverageType: CoverageType,
        chainId: Chain,
        stablecoinId: Stablecoin,
        coverageAmount: bigint,
        durationDays: number
    ): Promise<bigint> {
        const result = await provider.get('calculate_premium_external', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }

    /**
     * Get product information for a specific combination
     */
    async getProductInfo(
        provider: ContractProvider,
        coverageType: CoverageType,
        chainId: Chain,
        stablecoinId: Stablecoin
    ): Promise<{
        productHash: number;
        baseRate: number;
        chainMultiplier: number;
    }> {
        const result = await provider.get('get_product_info', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) }
        ]);

        return {
            productHash: result.stack.readNumber(),
            baseRate: result.stack.readNumber(),
            chainMultiplier: result.stack.readNumber(),
        };
    }

    // ================================
    // HELPER METHODS (OFF-CHAIN)
    // ================================

    /**
     * Validate product parameters before creating policy
     * @returns Validation result with error message if invalid
     */
    validateProduct(product: ProductKey): { valid: boolean; error?: string } {
        return validateProduct(product);
    }

    /**
     * Calculate premium off-chain (matches on-chain calculation)
     * Useful for quote generation without blockchain call
     */
    calculatePremiumOffchain(
        product: ProductKey,
        coverageAmount: bigint,
        durationDays: number
    ): bigint {
        return calculatePremium(product, coverageAmount, durationDays);
    }

    /**
     * Calculate product hash for indexing/caching
     */
    calculateProductHash(product: ProductKey): number {
        return calculateProductHash(product);
    }
}
