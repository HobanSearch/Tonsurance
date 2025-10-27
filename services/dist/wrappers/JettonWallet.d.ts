import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type JettonWalletConfig = {
    balance: bigint;
    ownerAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
};
export declare function jettonWalletConfigToCell(config: JettonWalletConfig): Cell;
export declare class JettonWallet implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): JettonWallet;
    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain?: number): JettonWallet;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendTransfer(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        queryId?: bigint;
        amount: bigint;
        toAddress: Address;
        responseAddress?: Address;
        forwardAmount?: bigint;
        forwardPayload?: Cell;
    }): Promise<void>;
    sendBurn(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        queryId?: bigint;
        amount: bigint;
        responseAddress?: Address;
    }): Promise<void>;
    getWalletData(provider: ContractProvider): Promise<{
        balance: bigint;
        ownerAddress: Address;
        jettonMasterAddress: Address;
        jettonWalletCode: Cell;
    }>;
}
