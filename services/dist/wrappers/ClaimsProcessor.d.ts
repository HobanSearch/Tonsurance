import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
import { CoverageType, Chain, Stablecoin } from './types/ProductMatrix';
export type ClaimsProcessorConfig = {
    ownerAddress: Address;
    nextClaimId: bigint;
    treasuryAddress: Address;
    multiTrancheVaultAddress: Address;
    priceOracleAddress: Address;
    autoApprovalThreshold: number;
};
export declare function claimsProcessorConfigToCell(config: ClaimsProcessorConfig): Cell;
export declare class ClaimsProcessor implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): ClaimsProcessor;
    static createFromConfig(config: ClaimsProcessorConfig, code: Cell, workchain?: number): ClaimsProcessor;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    /**
     * File a claim with multi-chain support
     * @param provider Contract provider
     * @param via Sender
     * @param opts Claim filing options with chain and stablecoin IDs
     */
    sendFileClaim(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        policyId: bigint;
        coverageType: CoverageType;
        chainId: Chain;
        stablecoinId: Stablecoin;
        coverageAmount: bigint;
        evidence: Cell;
    }): Promise<void>;
    sendAdminApproveClaim(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        claimId: bigint;
    }): Promise<void>;
    sendAdminRejectClaim(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        claimId: bigint;
    }): Promise<void>;
    sendAddVerifiedEvent(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        eventHash: bigint;
    }): Promise<void>;
    getClaimStatus(provider: ContractProvider, claimId: bigint): Promise<{
        status: number;
        autoApproved: boolean;
        coverageAmount: bigint;
    }>;
    /**
     * NEW: Get total losses absorbed by a specific tranche
     */
    getTrancheLosses(provider: ContractProvider, trancheId: number): Promise<bigint>;
    /**
     * NEW: Get total losses across all tranches
     */
    getTotalLosses(provider: ContractProvider): Promise<bigint>;
    /**
     * NEW: Get multi-tranche vault address
     */
    getVaultAddress(provider: ContractProvider): Promise<Address>;
    /**
     * Get chain-specific oracle routing information
     * Helps frontend understand which oracle will verify the claim
     */
    getChainOracleInfo(chainId: Chain): {
        chainName: string;
        oracleType: string;
        estimatedVerificationTime: string;
    };
    /**
     * Check if coverage type supports auto-verification
     */
    isAutoVerifiable(coverageType: CoverageType): boolean;
}
