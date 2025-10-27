import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type SURETokenConfig = {
    totalSupply: bigint;
    mintable: boolean;
    adminAddress: Address;
    jettonWalletCode: Cell;
    content: Cell;
};
export declare function sureTokenConfigToCell(config: SURETokenConfig): Cell;
export declare class SUREToken implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): SUREToken;
    static createFromConfig(config: SURETokenConfig, code: Cell, workchain?: number): SUREToken;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendMint(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        toAddress: Address;
        amount: bigint;
        responseAddress: Address;
    }): Promise<void>;
    getJettonData(provider: ContractProvider): Promise<{
        totalSupply: bigint;
        mintable: boolean;
        adminAddress: Address;
        content: Cell;
        walletCode: Cell;
    }>;
    getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address>;
}
