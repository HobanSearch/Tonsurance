import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type RiskMultipliersTestConfig = {
    ownerAddress: Address;
};

export function riskMultipliersTestConfigToCell(config: RiskMultipliersTestConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .endCell();
}

export class RiskMultipliersTest implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new RiskMultipliersTest(address);
    }

    static createFromConfig(config: RiskMultipliersTestConfig, code: Cell, workchain = 0) {
        const data = riskMultipliersTestConfigToCell(config);
        const init = { code, data };
        return new RiskMultipliersTest(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ===== GETTER METHODS =====

    async getChainRiskMultiplier(provider: ContractProvider, chainId: number): Promise<number> {
        const result = await provider.get('get_chain_risk_multiplier_test', [{ type: 'int', value: BigInt(chainId) }]);
        return result.stack.readNumber();
    }

    async getStablecoinRiskAdjustment(provider: ContractProvider, stablecoinId: number): Promise<number> {
        const result = await provider.get('get_stablecoin_risk_adjustment_test', [{ type: 'int', value: BigInt(stablecoinId) }]);
        return result.stack.readNumber();
    }

    async getCoverageTypeBaseRate(provider: ContractProvider, coverageType: number): Promise<number> {
        const result = await provider.get('get_coverage_type_base_rate_test', [{ type: 'int', value: BigInt(coverageType) }]);
        return result.stack.readNumber();
    }

    async getStablecoinRiskTier(provider: ContractProvider, stablecoinId: number): Promise<number> {
        const result = await provider.get('get_stablecoin_risk_tier_test', [{ type: 'int', value: BigInt(stablecoinId) }]);
        return result.stack.readNumber();
    }

    async validateChainStablecoinPair(provider: ContractProvider, chainId: number, stablecoinId: number): Promise<boolean> {
        const result = await provider.get('validate_chain_stablecoin_pair_test', [
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) }
        ]);
        return result.stack.readNumber() === 1;
    }

    async calculateProductHash(provider: ContractProvider, coverageType: number, chainId: number, stablecoinId: number): Promise<number> {
        const result = await provider.get('calculate_product_hash_test', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) }
        ]);
        return result.stack.readNumber();
    }

    async decomposeProductHash(provider: ContractProvider, productHash: number): Promise<{ coverageType: number; chainId: number; stablecoinId: number }> {
        const result = await provider.get('decompose_product_hash_test', [{ type: 'int', value: BigInt(productHash) }]);
        return {
            coverageType: result.stack.readNumber(),
            chainId: result.stack.readNumber(),
            stablecoinId: result.stack.readNumber(),
        };
    }

    async calculateMultiDimensionalPremium(
        provider: ContractProvider,
        coverageType: number,
        chainId: number,
        stablecoinId: number,
        coverageAmount: bigint,
        durationDays: number
    ): Promise<bigint> {
        const result = await provider.get('calculate_multi_dimensional_premium_test', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: BigInt(chainId) },
            { type: 'int', value: BigInt(stablecoinId) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }

    async validateChainId(provider: ContractProvider, chainId: number): Promise<boolean> {
        try {
            const result = await provider.get('validate_chain_id_test', [{ type: 'int', value: BigInt(chainId) }]);
            return result.stack.readNumber() === 1;
        } catch {
            return false;
        }
    }

    async validateStablecoinId(provider: ContractProvider, stablecoinId: number): Promise<boolean> {
        try {
            const result = await provider.get('validate_stablecoin_id_test', [{ type: 'int', value: BigInt(stablecoinId) }]);
            return result.stack.readNumber() === 1;
        } catch {
            return false;
        }
    }

    async validateCoverageType(provider: ContractProvider, coverageType: number): Promise<boolean> {
        try {
            const result = await provider.get('validate_coverage_type_test', [{ type: 'int', value: BigInt(coverageType) }]);
            return result.stack.readNumber() === 1;
        } catch {
            return false;
        }
    }
}
