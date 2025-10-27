import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type ComplianceGatewayConfig = {
    ownerAddress: Address;
    tradfiBufferAddress: Address;
    totalApproved: number;
    totalRejected: number;
    totalExpired: number;
};
export declare function complianceGatewayConfigToCell(config: ComplianceGatewayConfig): Cell;
export declare class ComplianceGateway implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): ComplianceGateway;
    static createFromConfig(config: ComplianceGatewayConfig, code: Cell, workchain?: number): ComplianceGateway;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendSubmitKycApplication(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        tier: number;
        kycProviderId: number;
        kycDataHash: Cell;
    }): Promise<void>;
    sendApproveKyc(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        applicant: Address;
    }): Promise<void>;
    sendRejectKyc(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        applicant: Address;
        reasonCode: number;
    }): Promise<void>;
    sendRevokeCompliance(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        investor: Address;
        reasonCode: number;
    }): Promise<void>;
    getComplianceStatus(provider: ContractProvider, investor: Address): Promise<{
        status: number;
        tier: number;
        approvalTime: number;
        expiryTime: number;
    }>;
    isCompliant(provider: ContractProvider, investor: Address): Promise<boolean>;
    getComplianceStats(provider: ContractProvider): Promise<{
        totalApproved: number;
        totalRejected: number;
        totalExpired: number;
    }>;
}
