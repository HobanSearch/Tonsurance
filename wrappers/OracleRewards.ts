import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type OracleRewardsConfig = {
    ownerAddress: Address;
    premiumDistributorAddress: Address;
    totalRewardsDistributed: bigint;
    totalRewardsPending: bigint;
    minUpdateInterval: number;
    accuracyThreshold: number;
};

export function oracleRewardsConfigToCell(config: OracleRewardsConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.premiumDistributorAddress)
        .storeDict(null) // oracle_registry
        .storeDict(null) // pending_rewards
        .storeCoins(config.totalRewardsDistributed)
        .storeCoins(config.totalRewardsPending)
        .storeUint(config.minUpdateInterval, 32)
        .storeUint(config.accuracyThreshold, 16)
        .endCell();
}

export class OracleRewards implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new OracleRewards(address);
    }

    static createFromConfig(config: OracleRewardsConfig, code: Cell, workchain = 0) {
        const data = oracleRewardsConfigToCell(config);
        const init = { code, data };
        return new OracleRewards(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterOracle(
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
                .storeUint(0x01, 32) // op: register_oracle
                .storeAddress(opts.oracleAddress)
                .endCell(),
        });
    }

    async sendRecordOracleUpdate(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            oracleAddress: Address;
            accuracyScore: number;
            isStale: boolean;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: record_oracle_update
                .storeAddress(opts.oracleAddress)
                .storeUint(opts.accuracyScore, 16)
                .storeUint(opts.isStale ? 1 : 0, 1)
                .endCell(),
        });
    }

    async sendDistributeOracleFee(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32) // op: distribute_oracle_fee
                .storeCoins(opts.amount)
                .endCell(),
        });
    }

    async sendClaimRewards(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: claim_rewards
                .endCell(),
        });
    }

    async getOracleStats(provider: ContractProvider, oracle: Address): Promise<{
        totalEarned: bigint;
        updateCount: number;
        accuracyScore: number;
    }> {
        const result = await provider.get('get_oracle_stats', [
            { type: 'slice', cell: beginCell().storeAddress(oracle).endCell() }
        ]);
        return {
            totalEarned: result.stack.readBigNumber(),
            updateCount: result.stack.readNumber(),
            accuracyScore: result.stack.readNumber(),
        };
    }

    async getPendingRewards(provider: ContractProvider, oracle: Address): Promise<bigint> {
        const result = await provider.get('get_pending_rewards', [
            { type: 'slice', cell: beginCell().storeAddress(oracle).endCell() }
        ]);
        return result.stack.readBigNumber();
    }

    async getRewardsSummary(provider: ContractProvider): Promise<{
        totalDistributed: bigint;
        totalPending: bigint;
    }> {
        const result = await provider.get('get_rewards_summary', []);
        return {
            totalDistributed: result.stack.readBigNumber(),
            totalPending: result.stack.readBigNumber(),
        };
    }
}
