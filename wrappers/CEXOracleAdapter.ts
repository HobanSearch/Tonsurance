import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

/**
 * CEX Platform identifiers
 */
export enum CEXPlatform {
    BINANCE = 1,
    OKX = 2,
    BYBIT = 3,
}

export const CEXPlatformName: Record<CEXPlatform, string> = {
    [CEXPlatform.BINANCE]: 'Binance',
    [CEXPlatform.OKX]: 'OKX',
    [CEXPlatform.BYBIT]: 'Bybit',
};

/**
 * Configuration for CEXOracleAdapter contract
 */
export type CEXOracleAdapterConfig = {
    ownerAddress: Address;
    trustedOracle: Address;
    verifiedCexPlatforms: Cell | null;
    liquidationThreshold: number;  // in basis points (e.g., 500 = 5%)
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

export function cexOracleAdapterConfigToCell(config: CEXOracleAdapterConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.trustedOracle)
        .storeMaybeRef(config.verifiedCexPlatforms)
        .storeUint(config.liquidationThreshold, 16)
        .storeMaybeRef(config.liquidationProofs)
        .storeUint(config.totalProofsSubmitted, 64)
        .storeUint(config.totalProofsVerified, 64)
        .endCell();
}

/**
 * CEXOracleAdapter Contract Wrapper
 *
 * Handles verification of CEX liquidation claims through cryptographically signed proofs
 * submitted by a trusted oracle service that monitors Binance, OKX, and Bybit.
 */
export class CEXOracleAdapter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new CEXOracleAdapter(address);
    }

    static createFromConfig(config: CEXOracleAdapterConfig, code: Cell, workchain = 0) {
        const data = cexOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new CEXOracleAdapter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================
    // ORACLE OPERATIONS
    // ================================

    /**
     * Submit liquidation proof (trusted oracle only)
     * @param provider Contract provider
     * @param via Sender (must be trusted oracle)
     * @param opts Liquidation proof details
     */
    async sendSubmitLiquidationProof(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            cexPlatform: Address;  // CEX platform identifier as address
            userCexId: Address;    // User's CEX ID as address
            positionId: bigint;    // 128-bit position identifier
            liquidationPrice: bigint;
            liquidationTime: number;
            liquidationValue: bigint;
            tradeHistoryMerkleRoot: string;  // 256-bit Merkle root
            oracleSignature: string;         // 512-bit Ed25519 signature
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x4c495150, 32)  // op: submit_liquidation_proof ("LIQP")
                .storeUint(opts.policyId, 64)
                .storeAddress(opts.cexPlatform)
                .storeAddress(opts.userCexId)
                .storeUint(opts.positionId, 128)
                .storeCoins(opts.liquidationPrice)
                .storeUint(opts.liquidationTime, 32)
                .storeCoins(opts.liquidationValue)
                .storeUint(BigInt('0x' + opts.tradeHistoryMerkleRoot), 256)
                .storeUint(BigInt('0x' + opts.oracleSignature), 512)
                .endCell(),
        });
    }

    // ================================
    // ADMIN OPERATIONS
    // ================================

    /**
     * Update trusted oracle address (owner only)
     */
    async sendUpdateOracle(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        newOracle: Address
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x5550444f, 32)  // op: update_oracle ("UPDO")
                .storeAddress(newOracle)
                .endCell(),
        });
    }

    /**
     * Add supported CEX platform (owner only)
     */
    async sendAddCexPlatform(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        cexName: Address,
        cexId: CEXPlatform
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x41444443, 32)  // op: add_cex_platform ("ADDC")
                .storeAddress(cexName)
                .storeUint(cexId, 8)
                .endCell(),
        });
    }

    /**
     * Remove CEX platform (owner only)
     */
    async sendRemoveCexPlatform(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        cexName: Address
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x52454d43, 32)  // op: remove_cex_platform ("REMC")
                .storeAddress(cexName)
                .endCell(),
        });
    }

    // ================================
    // GETTER METHODS
    // ================================

    /**
     * Verify if a claim is valid for a given policy
     * Returns (verified, liquidationValue, liquidationTime)
     */
    async verifyClaim(
        provider: ContractProvider,
        policyId: bigint,
        claimTime: number
    ): Promise<{
        verified: boolean;
        liquidationValue: bigint;
        liquidationTime: number;
    }> {
        const result = await provider.get('verify_claim', [
            { type: 'int', value: policyId },
            { type: 'int', value: BigInt(claimTime) }
        ]);

        const verified = result.stack.readNumber() === 1;
        const liquidationValue = result.stack.readBigNumber();
        const liquidationTime = result.stack.readNumber();

        return {
            verified,
            liquidationValue,
            liquidationTime,
        };
    }

    /**
     * Get proof details for a policy
     */
    async getProof(provider: ContractProvider, policyId: bigint): Promise<{
        found: boolean;
        cexPlatform?: Address;
        positionId?: bigint;
        liquidationPrice?: bigint;
        liquidationTime?: number;
        liquidationValue?: bigint;
    }> {
        const result = await provider.get('get_proof', [
            { type: 'int', value: policyId }
        ]);

        const found = result.stack.readNumber() === 1;

        if (!found) {
            return { found: false };
        }

        const cexPlatform = result.stack.readAddress();
        const positionId = result.stack.readBigNumber();
        const liquidationPrice = result.stack.readBigNumber();
        const liquidationTime = result.stack.readNumber();
        const liquidationValue = result.stack.readBigNumber();

        return {
            found: true,
            cexPlatform,
            positionId,
            liquidationPrice,
            liquidationTime,
            liquidationValue,
        };
    }

    /**
     * Check if CEX platform is supported
     */
    async isCexSupported(provider: ContractProvider, cexName: Address): Promise<boolean> {
        const result = await provider.get('is_cex_supported', [
            { type: 'slice', cell: beginCell().storeAddress(cexName).endCell() }
        ]);
        return result.stack.readNumber() === 1;
    }

    /**
     * Get contract statistics
     */
    async getStats(provider: ContractProvider): Promise<{
        totalProofsSubmitted: bigint;
        totalProofsVerified: bigint;
        trustedOracle: Address;
        liquidationThreshold: number;
    }> {
        const result = await provider.get('get_stats', []);

        return {
            totalProofsSubmitted: result.stack.readBigNumber(),
            totalProofsVerified: result.stack.readBigNumber(),
            trustedOracle: result.stack.readAddress(),
            liquidationThreshold: result.stack.readNumber(),
        };
    }

    /**
     * Get owner address
     */
    async getOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }

    /**
     * Get trusted oracle address
     */
    async getOracle(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_oracle', []);
        return result.stack.readAddress();
    }

    // ================================
    // HELPER METHODS (OFF-CHAIN)
    // ================================

    /**
     * Generate liquidation data hash for signature verification
     * Matches on-chain hash_liquidation_data() function
     */
    static hashLiquidationData(
        policyId: bigint,
        cexPlatform: Address,
        userCexId: Address,
        positionId: bigint,
        liquidationPrice: bigint,
        liquidationTime: number
    ): bigint {
        const dataCell = beginCell()
            .storeUint(policyId, 64)
            .storeAddress(cexPlatform)
            .storeAddress(userCexId)
            .storeUint(positionId, 128)
            .storeCoins(liquidationPrice)
            .storeUint(liquidationTime, 32)
            .endCell();

        return BigInt(dataCell.hash().toString('hex'));
    }

    /**
     * Verify Ed25519 signature off-chain (for testing/validation)
     * Note: Actual signature verification requires crypto library
     */
    static verifySignature(
        hash: bigint,
        signature: string,
        publicKey: string
    ): boolean {
        // This is a placeholder for signature verification
        // In production, use a proper Ed25519 library like tweetnacl
        // Example: nacl.sign.detached.verify(hash, signature, publicKey)

        // For now, return true (actual verification happens on-chain)
        console.warn('CEXOracleAdapter.verifySignature() is a placeholder - implement with crypto library');
        return true;
    }

    /**
     * Get CEX platform name from ID
     */
    static getCexPlatformName(cexId: CEXPlatform): string {
        return CEXPlatformName[cexId] || 'Unknown';
    }

    /**
     * Check if liquidation is within claim window (24 hours)
     */
    static isWithinClaimWindow(liquidationTime: number, claimTime: number): boolean {
        const MAX_CLAIM_DELAY = 86400; // 24 hours in seconds
        return (claimTime - liquidationTime) <= MAX_CLAIM_DELAY;
    }
}
