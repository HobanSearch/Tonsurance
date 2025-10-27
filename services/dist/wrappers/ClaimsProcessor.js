"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimsProcessor = void 0;
exports.claimsProcessorConfigToCell = claimsProcessorConfigToCell;
const core_1 = require("@ton/core");
const ProductMatrix_1 = require("./types/ProductMatrix");
function claimsProcessorConfigToCell(config) {
    // Store vault addresses in first reference cell
    const vaultsCell = (0, core_1.beginCell)()
        .storeAddress(config.treasuryAddress)
        .storeAddress(config.multiTrancheVaultAddress) // NEW: MultiTrancheVault only
        .endCell();
    // Store oracle address in second reference cell
    const oraclesCell = (0, core_1.beginCell)()
        .storeAddress(config.priceOracleAddress)
        .endCell();
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextClaimId, 64)
        .storeDict(null) // claims_dict
        .storeRef(vaultsCell)
        .storeRef(oraclesCell)
        .storeUint(config.autoApprovalThreshold, 16)
        .storeDict(null) // verified_events
        .storeDict(null) // pending_payouts (HIGH-4 FIX)
        .storeUint(0n, 64) // seq_no (HIGH-4 FIX)
        .storeDict(null) // tranche_losses (NEW)
        .endCell();
}
class ClaimsProcessor {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new ClaimsProcessor(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = claimsProcessorConfigToCell(config);
        const init = { code, data };
        return new ClaimsProcessor((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    /**
     * File a claim with multi-chain support
     * @param provider Contract provider
     * @param via Sender
     * @param opts Claim filing options with chain and stablecoin IDs
     */
    async sendFileClaim(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: file_claim (multi-chain)
                .storeUint(opts.policyId, 64)
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.chainId, 8) // NEW: Chain for verification routing
                .storeUint(opts.stablecoinId, 8) // NEW: Stablecoin for risk assessment
                .storeCoins(opts.coverageAmount)
                .storeRef(opts.evidence)
                .endCell(),
        });
    }
    async sendAdminApproveClaim(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x02, 32) // op: admin_approve_claim
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }
    async sendAdminRejectClaim(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x03, 32) // op: admin_reject_claim
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }
    async sendAddVerifiedEvent(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x10, 32) // op: add_verified_event
                .storeUint(opts.eventHash, 256)
                .endCell(),
        });
    }
    async getClaimStatus(provider, claimId) {
        const result = await provider.get('get_claim_status', [
            { type: 'int', value: claimId }
        ]);
        return {
            status: result.stack.readNumber(),
            autoApproved: result.stack.readBoolean(),
            coverageAmount: result.stack.readBigNumber(),
        };
    }
    /**
     * NEW: Get total losses absorbed by a specific tranche
     */
    async getTrancheLosses(provider, trancheId) {
        const result = await provider.get('get_tranche_losses', [
            { type: 'int', value: BigInt(trancheId) }
        ]);
        return result.stack.readBigNumber();
    }
    /**
     * NEW: Get total losses across all tranches
     */
    async getTotalLosses(provider) {
        const result = await provider.get('get_total_losses', []);
        return result.stack.readBigNumber();
    }
    /**
     * NEW: Get multi-tranche vault address
     */
    async getVaultAddress(provider) {
        const result = await provider.get('get_vault_address', []);
        return result.stack.readAddress();
    }
    // ================================
    // HELPER METHODS
    // ================================
    /**
     * Get chain-specific oracle routing information
     * Helps frontend understand which oracle will verify the claim
     */
    getChainOracleInfo(chainId) {
        const chainOracleMap = {
            [ProductMatrix_1.Chain.ETHEREUM]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [ProductMatrix_1.Chain.ARBITRUM]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [ProductMatrix_1.Chain.BASE]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [ProductMatrix_1.Chain.POLYGON]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [ProductMatrix_1.Chain.BITCOIN]: { oracleType: 'Blockstream API', estimatedTime: '10-20 minutes' },
            [ProductMatrix_1.Chain.LIGHTNING]: { oracleType: 'Lightning Network Graph', estimatedTime: '5-15 minutes' },
            [ProductMatrix_1.Chain.TON]: { oracleType: 'Native TON Oracles', estimatedTime: '2-5 minutes' },
            [ProductMatrix_1.Chain.SOLANA]: { oracleType: 'Pyth Network', estimatedTime: '3-8 minutes' },
        };
        const chainNames = {
            [ProductMatrix_1.Chain.ETHEREUM]: 'Ethereum',
            [ProductMatrix_1.Chain.ARBITRUM]: 'Arbitrum',
            [ProductMatrix_1.Chain.BASE]: 'Base',
            [ProductMatrix_1.Chain.POLYGON]: 'Polygon',
            [ProductMatrix_1.Chain.BITCOIN]: 'Bitcoin',
            [ProductMatrix_1.Chain.LIGHTNING]: 'Lightning Network',
            [ProductMatrix_1.Chain.TON]: 'TON',
            [ProductMatrix_1.Chain.SOLANA]: 'Solana',
        };
        const info = chainOracleMap[chainId];
        return {
            chainName: chainNames[chainId],
            oracleType: info.oracleType,
            estimatedVerificationTime: info.estimatedTime,
        };
    }
    /**
     * Check if coverage type supports auto-verification
     */
    isAutoVerifiable(coverageType) {
        // All coverage types support auto-verification (0-4)
        // Depeg, Smart Contract, Oracle, Bridge, CEX Liquidation
        return coverageType >= ProductMatrix_1.CoverageType.DEPEG && coverageType <= ProductMatrix_1.CoverageType.CEX_LIQUIDATION;
    }
}
exports.ClaimsProcessor = ClaimsProcessor;
