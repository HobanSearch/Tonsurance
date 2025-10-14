import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Dictionary, Sender, SendMode } from '@ton/core';

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
        .storeDict(null)  // Empty dictionary initially
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

    async sendCreatePolicy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            coverageType: number;
            coverageAmount: bigint;
            duration: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: create_policy
                .storeUint(opts.coverageType, 8)
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

    async getPolicyData(provider: ContractProvider, policyId: bigint): Promise<{
        coverageType: number;
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
            coverageType: result.stack.readNumber(),
            coverageAmount: result.stack.readBigNumber(),
            premium: result.stack.readBigNumber(),
            startTime: result.stack.readNumber(),
            duration: result.stack.readNumber(),
            active: result.stack.readBoolean(),
        };
    }

    async getCalculatePremium(
        provider: ContractProvider,
        coverageType: number,
        coverageAmount: bigint,
        durationDays: number
    ): Promise<bigint> {
        const result = await provider.get('calculate_premium_external', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) }
        ]);
        return result.stack.readBigNumber();
    }
}
