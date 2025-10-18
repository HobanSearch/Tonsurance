import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export type SmartContractOracleAdapterConfig = {
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    keeperAddress: Address;
};

export function smartContractOracleAdapterConfigToCell(config: SmartContractOracleAdapterConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.keeperAddress)
        .storeDict(null) // contract_registry
        .storeDict(null) // exploit_events
        .storeUint(0, 32) // total_exploits_tracked
        .endCell();
}

export class SmartContractOracleAdapter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new SmartContractOracleAdapter(address);
    }

    static createFromConfig(config: SmartContractOracleAdapterConfig, code: Cell, workchain = 0) {
        const data = smartContractOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new SmartContractOracleAdapter(contractAddress(workchain, init), init);
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
        contractAddress: Address,
        chainId: number,
        exploitTimestamp: number,
        stolenAmount: bigint,
        txHashHigh: bigint,
        txHashLow: bigint,
        monitoringSources: number,
        contractType: number
    ) {
        await provider.internal(via, {
            value: toNano('0.1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x12, 32) // OP_REPORT_EXPLOIT
                .storeAddress(contractAddress)
                .storeUint(chainId, 8)
                .storeUint(exploitTimestamp, 32)
                .storeCoins(stolenAmount)
                .storeUint(txHashHigh, 128)
                .storeUint(txHashLow, 128)
                .storeUint(monitoringSources, 8)
                .storeUint(contractType, 8)
                .endCell(),
        });
    }

    async sendUpdateContractStatus(
        provider: ContractProvider,
        via: Sender,
        contractAddress: Address,
        status: number,
        currentTvl: bigint
    ) {
        await provider.internal(via, {
            value: toNano('0.05'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x13, 32) // OP_UPDATE_CONTRACT_STATUS
                .storeAddress(contractAddress)
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

    async getContractInfo(provider: ContractProvider, contractAddress: Address): Promise<{
        status: number;
        tvl: bigint;
        lastUpdate: number;
        found: boolean;
    }> {
        const result = await provider.get('get_contract_info', [
            { type: 'slice', cell: beginCell().storeAddress(contractAddress).endCell() }
        ]);

        const status = result.stack.readNumber();
        const tvl = result.stack.readBigNumber();
        const lastUpdate = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;

        return { status, tvl, lastUpdate, found };
    }
}
