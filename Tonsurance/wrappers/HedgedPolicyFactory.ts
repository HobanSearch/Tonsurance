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

export type HedgedPolicyFactoryConfig = {
    adminAddress: Address;
    pricingOracle: Address;
    hedgeCoordinator: Address;
    primaryVault: Address;
    keepers: {
        polymarket: Address;
        perpetuals: Address;
        allianz: Address;
    };
};

export type PolicyDetails = {
    userAddress: Address;
    coverageType: number;
    coverageAmount: bigint;
    durationDays: number;
    totalPremium: bigint;
    createdAt: number;
    expiryTime: number;
    isActive: boolean;
};

export function hedgedPolicyFactoryConfigToCell(config: HedgedPolicyFactoryConfig): Cell {
    const keepersCell = beginCell()
        .storeAddress(config.keepers.polymarket)
        .storeAddress(config.keepers.perpetuals)
        .storeAddress(config.keepers.allianz)
        .endCell();

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.pricingOracle)
        .storeAddress(config.hedgeCoordinator)
        .storeAddress(config.primaryVault)
        .storeRef(keepersCell)
        .storeUint(1, 64)  // next_policy_id starts at 1
        .storeDict(null)   // policies initially empty
        .storeCoins(0)     // total_coverage starts at 0
        .endCell();
}

export class HedgedPolicyFactory implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new HedgedPolicyFactory(address);
    }

    static createFromConfig(config: HedgedPolicyFactoryConfig, code: Cell, workchain = 0) {
        const data = hedgedPolicyFactoryConfigToCell(config);
        const init = { code, data };
        return new HedgedPolicyFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendCreateHedgedPolicy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            coverageType: number;
            coverageAmount: bigint;
            durationDays: number;
            expectedPremium: bigint;
            quoteTimestamp: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x63726561, 32) // op::create_hedged_policy
                .storeAddress(opts.userAddress)
                .storeUint(opts.coverageType, 8)
                .storeCoins(opts.coverageAmount)
                .storeUint(opts.durationDays, 16)
                .storeCoins(opts.expectedPremium)
                .storeUint(opts.quoteTimestamp, 32)
                .endCell(),
        });
    }

    async sendUpdateOracle(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            oracleAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x75706f72, 32) // op::update_oracle
                .storeAddress(opts.oracleAddress)
                .endCell(),
        });
    }

    async sendUpdateCoordinator(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            coordinatorAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x7570636f, 32) // op::update_coordinator
                .storeAddress(opts.coordinatorAddress)
                .endCell(),
        });
    }

    async sendUpdateVault(
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
                .storeUint(0x75707661, 32) // op::update_vault
                .storeAddress(opts.vaultAddress)
                .endCell(),
        });
    }

    async getPolicy(provider: ContractProvider, policyId: bigint): Promise<PolicyDetails> {
        const result = await provider.get('get_policy', [
            { type: 'int', value: policyId },
        ]);

        return {
            userAddress: result.stack.readAddress(),
            coverageType: Number(result.stack.readBigNumber()),
            coverageAmount: result.stack.readBigNumber(),
            durationDays: Number(result.stack.readBigNumber()),
            totalPremium: result.stack.readBigNumber(),
            createdAt: Number(result.stack.readBigNumber()),
            expiryTime: Number(result.stack.readBigNumber()),
            isActive: result.stack.readBigNumber() === 1n,
        };
    }

    async getNextPolicyId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_next_policy_id', []);
        return result.stack.readBigNumber();
    }

    async getTotalCoverage(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_coverage', []);
        return result.stack.readBigNumber();
    }

    async getPoolUtilization(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_pool_utilization', []);
        return Number(result.stack.readBigNumber());
    }

    async getPricingOracle(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_pricing_oracle', []);
        return result.stack.readAddress();
    }

    async getHedgeCoordinator(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_hedge_coordinator', []);
        return result.stack.readAddress();
    }

    async getAdminAddress(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin_address', []);
        return result.stack.readAddress();
    }
}
