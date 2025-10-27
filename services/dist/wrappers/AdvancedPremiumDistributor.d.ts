import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type AdvancedPremiumDistributorConfig = {
    ownerAddress: Address;
    multiTrancheVaultAddress: Address;
    referralManagerAddress: Address;
    oracleRewardsAddress: Address;
    protocolTreasuryAddress: Address;
};
export declare function advancedPremiumDistributorConfigToCell(config: AdvancedPremiumDistributorConfig): Cell;
export declare class AdvancedPremiumDistributor implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): AdvancedPremiumDistributor;
    static createFromConfig(config: AdvancedPremiumDistributorConfig, code: Cell, workchain?: number): AdvancedPremiumDistributor;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendDistributePremium(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        premiumAmount: bigint;
    }): Promise<void>;
    getDistributionPercentages(provider: ContractProvider): Promise<{
        lpShare: number;
        referrer: number;
        oracle: number;
        protocol: number;
    }>;
}
