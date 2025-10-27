import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type SURE_SNR_Config = {
    total_supply: bigint;
    mintable: boolean;
    admin_address: Address;
    vault_address: Address;
    jetton_wallet_code: Cell;
    content: Cell;
};
export declare function sure_snr_ConfigToCell(config: SURE_SNR_Config): Cell;
export declare class SURE_SNR implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): SURE_SNR;
    static createFromConfig(config: SURE_SNR_Config, code: Cell, workchain?: number): SURE_SNR;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendMint(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        to_address: Address;
        amount: bigint;
        response_address: Address;
        query_id?: number;
    }): Promise<void>;
    getTotalSupply(provider: ContractProvider): Promise<bigint>;
    getLockPeriod(provider: ContractProvider): Promise<number>;
    getUnlockTime(provider: ContractProvider, user: Address): Promise<number>;
    isUnlocked(provider: ContractProvider, user: Address): Promise<boolean>;
}
