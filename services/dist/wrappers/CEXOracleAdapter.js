"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CEXOracleAdapter = exports.CEXPlatformName = exports.CEXPlatform = void 0;
exports.cexOracleAdapterConfigToCell = cexOracleAdapterConfigToCell;
const core_1 = require("@ton/core");
/**
 * CEX Platform identifiers
 */
var CEXPlatform;
(function (CEXPlatform) {
    CEXPlatform[CEXPlatform["BINANCE"] = 1] = "BINANCE";
    CEXPlatform[CEXPlatform["OKX"] = 2] = "OKX";
    CEXPlatform[CEXPlatform["BYBIT"] = 3] = "BYBIT";
})(CEXPlatform || (exports.CEXPlatform = CEXPlatform = {}));
exports.CEXPlatformName = {
    [CEXPlatform.BINANCE]: 'Binance',
    [CEXPlatform.OKX]: 'OKX',
    [CEXPlatform.BYBIT]: 'Bybit',
};
function cexOracleAdapterConfigToCell(config) {
    return (0, core_1.beginCell)()
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
class CEXOracleAdapter {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new CEXOracleAdapter(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = cexOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new CEXOracleAdapter((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
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
    async sendSubmitLiquidationProof(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x4c495150, 32) // op: submit_liquidation_proof ("LIQP")
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
    async sendUpdateOracle(provider, via, value, newOracle) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x5550444f, 32) // op: update_oracle ("UPDO")
                .storeAddress(newOracle)
                .endCell(),
        });
    }
    /**
     * Add supported CEX platform (owner only)
     */
    async sendAddCexPlatform(provider, via, value, cexName, cexId) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x41444443, 32) // op: add_cex_platform ("ADDC")
                .storeAddress(cexName)
                .storeUint(cexId, 8)
                .endCell(),
        });
    }
    /**
     * Remove CEX platform (owner only)
     */
    async sendRemoveCexPlatform(provider, via, value, cexName) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x52454d43, 32) // op: remove_cex_platform ("REMC")
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
    async verifyClaim(provider, policyId, claimTime) {
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
    async getProof(provider, policyId) {
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
    async isCexSupported(provider, cexName) {
        const result = await provider.get('is_cex_supported', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(cexName).endCell() }
        ]);
        return result.stack.readNumber() === 1;
    }
    /**
     * Get contract statistics
     */
    async getStats(provider) {
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
    async getOwner(provider) {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }
    /**
     * Get trusted oracle address
     */
    async getOracle(provider) {
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
    static hashLiquidationData(policyId, cexPlatform, userCexId, positionId, liquidationPrice, liquidationTime) {
        const dataCell = (0, core_1.beginCell)()
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
    static verifySignature(hash, signature, publicKey) {
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
    static getCexPlatformName(cexId) {
        return exports.CEXPlatformName[cexId] || 'Unknown';
    }
    /**
     * Check if liquidation is within claim window (24 hours)
     */
    static isWithinClaimWindow(liquidationTime, claimTime) {
        const MAX_CLAIM_DELAY = 86400; // 24 hours in seconds
        return (claimTime - liquidationTime) <= MAX_CLAIM_DELAY;
    }
}
exports.CEXOracleAdapter = CEXOracleAdapter;
