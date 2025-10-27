import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
/**
 * CEX Platform identifiers
 */
export declare enum CEXPlatform {
    BINANCE = 1,
    OKX = 2,
    BYBIT = 3
}
export declare const CEXPlatformName: Record<CEXPlatform, string>;
/**
 * Configuration for CEXOracleAdapter contract
 */
export type CEXOracleAdapterConfig = {
    ownerAddress: Address;
    trustedOracle: Address;
    verifiedCexPlatforms: Cell | null;
    liquidationThreshold: number;
    liquidationProofs: Cell | null;
    totalProofsSubmitted: bigint;
    totalProofsVerified: bigint;
};
/**
 * Liquidation proof data structure
 */
export interface LiquidationProof {
    cexId: CEXPlatform;
    cexPlatform: string;
    userCexId: string;
    positionId: bigint;
    liquidationPrice: bigint;
    liquidationTime: number;
    liquidationValue: bigint;
    tradeHistoryMerkleRoot: string;
    verified: boolean;
    verificationTimestamp: number;
}
export declare function cexOracleAdapterConfigToCell(config: CEXOracleAdapterConfig): Cell;
/**
 * CEXOracleAdapter Contract Wrapper
 *
 * Handles verification of CEX liquidation claims through cryptographically signed proofs
 * submitted by a trusted oracle service that monitors Binance, OKX, and Bybit.
 */
export declare class CEXOracleAdapter implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): CEXOracleAdapter;
    static createFromConfig(config: CEXOracleAdapterConfig, code: Cell, workchain?: number): CEXOracleAdapter;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    /**
     * Submit liquidation proof (trusted oracle only)
     * @param provider Contract provider
     * @param via Sender (must be trusted oracle)
     * @param opts Liquidation proof details
     */
    sendSubmitLiquidationProof(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        policyId: bigint;
        cexPlatform: Address;
        userCexId: Address;
        positionId: bigint;
        liquidationPrice: bigint;
        liquidationTime: number;
        liquidationValue: bigint;
        tradeHistoryMerkleRoot: string;
        oracleSignature: string;
    }): Promise<void>;
    /**
     * Update trusted oracle address (owner only)
     */
    sendUpdateOracle(provider: ContractProvider, via: Sender, value: bigint, newOracle: Address): Promise<void>;
    /**
     * Add supported CEX platform (owner only)
     */
    sendAddCexPlatform(provider: ContractProvider, via: Sender, value: bigint, cexName: Address, cexId: CEXPlatform): Promise<void>;
    /**
     * Remove CEX platform (owner only)
     */
    sendRemoveCexPlatform(provider: ContractProvider, via: Sender, value: bigint, cexName: Address): Promise<void>;
    /**
     * Verify if a claim is valid for a given policy
     * Returns (verified, liquidationValue, liquidationTime)
     */
    verifyClaim(provider: ContractProvider, policyId: bigint, claimTime: number): Promise<{
        verified: boolean;
        liquidationValue: bigint;
        liquidationTime: number;
    }>;
    /**
     * Get proof details for a policy
     */
    getProof(provider: ContractProvider, policyId: bigint): Promise<{
        found: boolean;
        cexPlatform?: Address;
        positionId?: bigint;
        liquidationPrice?: bigint;
        liquidationTime?: number;
        liquidationValue?: bigint;
    }>;
    /**
     * Check if CEX platform is supported
     */
    isCexSupported(provider: ContractProvider, cexName: Address): Promise<boolean>;
    /**
     * Get contract statistics
     */
    getStats(provider: ContractProvider): Promise<{
        totalProofsSubmitted: bigint;
        totalProofsVerified: bigint;
        trustedOracle: Address;
        liquidationThreshold: number;
    }>;
    /**
     * Get owner address
     */
    getOwner(provider: ContractProvider): Promise<Address>;
    /**
     * Get trusted oracle address
     */
    getOracle(provider: ContractProvider): Promise<Address>;
    /**
     * Generate liquidation data hash for signature verification
     * Matches on-chain hash_liquidation_data() function
     */
    static hashLiquidationData(policyId: bigint, cexPlatform: Address, userCexId: Address, positionId: bigint, liquidationPrice: bigint, liquidationTime: number): bigint;
    /**
     * Verify Ed25519 signature off-chain (for testing/validation)
     * Note: Actual signature verification requires crypto library
     */
    static verifySignature(hash: bigint, signature: string, publicKey: string): boolean;
    /**
     * Get CEX platform name from ID
     */
    static getCexPlatformName(cexId: CEXPlatform): string;
    /**
     * Check if liquidation is within claim window (24 hours)
     */
    static isWithinClaimWindow(liquidationTime: number, claimTime: number): boolean;
}
