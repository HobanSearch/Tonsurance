import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export type BridgeOracleAdapterConfig = {
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    keeperAddress: Address;
};

export function bridgeOracleAdapterConfigToCell(config: BridgeOracleAdapterConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.keeperAddress)
        .storeDict(null) // bridge_registry
        .storeDict(null) // exploit_events
        .storeUint(0, 32) // total_exploits_tracked
        .endCell();
}

export class BridgeOracleAdapter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new BridgeOracleAdapter(address);
    }

    static createFromConfig(config: BridgeOracleAdapterConfig, code: Cell, workchain = 0) {
        const data = bridgeOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new BridgeOracleAdapter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendReportExploit(
        provider: ContractProvider,
        via: Sender,
        bridgeAddress: Address,
        exploitTimestamp: number,
        stolenAmount: bigint,
        txHashHigh: bigint,
        txHashLow: bigint,
        monitoringSources: number
    ) {
        await provider.internal(via, {
            value: toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x12, 32) // OP_REPORT_EXPLOIT
                .storeAddress(bridgeAddress)
                .storeUint(exploitTimestamp, 32)
                .storeCoins(stolenAmount)
                .storeUint(txHashHigh, 128)
                .storeUint(txHashLow, 128)
                .storeUint(monitoringSources, 8)
                .endCell(),
        });
    }

    async sendUpdateBridgeStatus(
        provider: ContractProvider,
        via: Sender,
        bridgeAddress: Address,
        status: number,
        currentTvl: bigint
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x13, 32) // OP_UPDATE_BRIDGE_STATUS
                .storeAddress(bridgeAddress)
                .storeUint(status, 8)
                .storeCoins(currentTvl)
                .endCell(),
        });
    }

    async getOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }

    async getTotalExploits(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_total_exploits', []);
        return result.stack.readNumber();
    }

    async getBridgeInfo(provider: ContractProvider, bridgeAddress: Address): Promise<{
        status: number;
        tvl: bigint;
        lastUpdate: number;
        found: boolean;
    }> {
        const result = await provider.get('get_bridge_info', [
            { type: 'slice', cell: beginCell().storeAddress(bridgeAddress).endCell() }
        ]);

        const status = result.stack.readNumber();
        const tvl = result.stack.readBigNumber();
        const lastUpdate = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;

        return { status, tvl, lastUpdate, found };
    }

    async getExploitInfo(provider: ContractProvider, bridgeAddress: Address, timestamp: number): Promise<{
        stolenAmount: bigint;
        monitoringSources: number;
        reportedAt: number;
        found: boolean;
    }> {
        const result = await provider.get('get_exploit_info', [
            { type: 'slice', cell: beginCell().storeAddress(bridgeAddress).endCell() },
            { type: 'int', value: BigInt(timestamp) }
        ]);

        const stolenAmount = result.stack.readBigNumber();
        const monitoringSources = result.stack.readNumber();
        const reportedAt = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;

        return { stolenAmount, monitoringSources, reportedAt, found };
    }
}
