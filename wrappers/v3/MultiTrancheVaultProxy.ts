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
    TupleBuilder,
} from '@ton/core';

export type MultiTrancheVaultProxyConfig = {
    implementationAddress: Address;
    adminAddress: Address;
    paused: boolean;
    lastUpgradeTimestamp: number;
    lpBalances: Dictionary<bigint, bigint>;
    trancheAllocations: Dictionary<number, bigint>;
    totalValueLocked: bigint;
    protocolVersion: number;
};

export function multiTrancheVaultProxyConfigToCell(config: MultiTrancheVaultProxyConfig): Cell {
    return beginCell()
        .storeAddress(config.implementationAddress)
        .storeAddress(config.adminAddress)
        .storeBit(config.paused)
        .storeUint(config.lastUpgradeTimestamp, 32)
        .storeDict(config.lpBalances)
        .storeDict(config.trancheAllocations)
        .storeCoins(config.totalValueLocked)
        .storeUint(config.protocolVersion, 16)
        .endCell();
}

export const MIN_UPGRADE_INTERVAL = 172800; // 48 hours in seconds

export class MultiTrancheVaultProxy implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new MultiTrancheVaultProxy(address);
    }

    static createFromConfig(config: MultiTrancheVaultProxyConfig, code: Cell, workchain = 0) {
        const data = multiTrancheVaultProxyConfigToCell(config);
        const init = { code, data };
        return new MultiTrancheVaultProxy(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendUpgradeImplementation(provider: ContractProvider, via: Sender, opts: { value: bigint; newImplementationAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xFF, 32).storeAddress(opts.newImplementationAddress).endCell(),
        });
    }

    async sendSetAdmin(provider: ContractProvider, via: Sender, opts: { value: bigint; newAdminAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xFE, 32).storeAddress(opts.newAdminAddress).endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xFD, 32).endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xFC, 32).endCell(),
        });
    }

    async getImplementation(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_implementation', []);
        return result.stack.readAddress();
    }

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getProtocolVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_protocol_version', []);
        return Number(result.stack.readBigNumber());
    }

    async getLastUpgradeTimestamp(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_last_upgrade_timestamp', []);
        return Number(result.stack.readBigNumber());
    }

    async getTotalValueLocked(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_value_locked', []);
        return result.stack.readBigNumber();
    }

    async getTrancheAllocation(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const args = new TupleBuilder();
        args.writeNumber(trancheId);
        const result = await provider.get('get_tranche_allocation', args.build());
        return result.stack.readBigNumber();
    }

    async getAllTrancheAllocations(
        provider: ContractProvider
    ): Promise<{ btc: bigint; snr: bigint; mezz: bigint; jnr: bigint; jnrPlus: bigint; eqt: bigint }> {
        const result = await provider.get('get_all_tranche_allocations', []);
        return {
            btc: result.stack.readBigNumber(),
            snr: result.stack.readBigNumber(),
            mezz: result.stack.readBigNumber(),
            jnr: result.stack.readBigNumber(),
            jnrPlus: result.stack.readBigNumber(),
            eqt: result.stack.readBigNumber(),
        };
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }
}

export function canUpgrade(lastUpgradeTimestamp: number, currentTimestamp: number): boolean {
    return currentTimestamp - lastUpgradeTimestamp >= MIN_UPGRADE_INTERVAL;
}
