import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, TupleBuilder } from '@ton/core';
import { CoverageType, Chain, Stablecoin } from './types/ProductMatrix';

export type ClaimsProcessorConfig = {
    ownerAddress: Address;
    nextClaimId: bigint;
    treasuryAddress: Address;
    multiTrancheVaultAddress: Address;  // NEW: Reference to 6-tier vault
    priceOracleAddress: Address;
    autoApprovalThreshold: number;
};

export function claimsProcessorConfigToCell(config: ClaimsProcessorConfig): Cell {
    // Store vault addresses in first reference cell
    const vaultsCell = beginCell()
        .storeAddress(config.treasuryAddress)
        .storeAddress(config.multiTrancheVaultAddress)  // NEW: MultiTrancheVault only
        .endCell();

    // Store oracle address in second reference cell
    const oraclesCell = beginCell()
        .storeAddress(config.priceOracleAddress)
        .endCell();

    return beginCell()
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

export class ClaimsProcessor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ClaimsProcessor(address);
    }

    static createFromConfig(config: ClaimsProcessorConfig, code: Cell, workchain = 0) {
        const data = claimsProcessorConfigToCell(config);
        const init = { code, data };
        return new ClaimsProcessor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    /**
     * File a claim with multi-chain support
     * @param provider Contract provider
     * @param via Sender
     * @param opts Claim filing options with chain and stablecoin IDs
     */
    async sendFileClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            coverageType: CoverageType;
            chainId: Chain;
            stablecoinId: Stablecoin;
            coverageAmount: bigint;
            evidence: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: file_claim (multi-chain)
                .storeUint(opts.policyId, 64)
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.chainId, 8)        // NEW: Chain for verification routing
                .storeUint(opts.stablecoinId, 8)   // NEW: Stablecoin for risk assessment
                .storeCoins(opts.coverageAmount)
                .storeRef(opts.evidence)
                .endCell(),
        });
    }

    async sendAdminApproveClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: admin_approve_claim
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }

    async sendAdminRejectClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: admin_reject_claim
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }

    async sendAddVerifiedEvent(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            eventHash: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // op: add_verified_event
                .storeUint(opts.eventHash, 256)
                .endCell(),
        });
    }

    async getClaimStatus(provider: ContractProvider, claimId: bigint): Promise<{
        status: number;
        autoApproved: boolean;
        coverageAmount: bigint;
    }> {
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
    async getTrancheLosses(provider: ContractProvider, trancheId: number): Promise<bigint> {
        const result = await provider.get('get_tranche_losses', [
            { type: 'int', value: BigInt(trancheId) }
        ]);
        return result.stack.readBigNumber();
    }

    /**
     * NEW: Get total losses across all tranches
     */
    async getTotalLosses(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_losses', []);
        return result.stack.readBigNumber();
    }

    /**
     * NEW: Get multi-tranche vault address
     */
    async getVaultAddress(provider: ContractProvider): Promise<Address> {
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
    getChainOracleInfo(chainId: Chain): {
        chainName: string;
        oracleType: string;
        estimatedVerificationTime: string;
    } {
        const chainOracleMap: Record<Chain, { oracleType: string; estimatedTime: string }> = {
            [Chain.ETHEREUM]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [Chain.ARBITRUM]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [Chain.BASE]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [Chain.POLYGON]: { oracleType: 'Chainlink', estimatedTime: '5-10 minutes' },
            [Chain.BITCOIN]: { oracleType: 'Blockstream API', estimatedTime: '10-20 minutes' },
            [Chain.LIGHTNING]: { oracleType: 'Lightning Network Graph', estimatedTime: '5-15 minutes' },
            [Chain.TON]: { oracleType: 'Native TON Oracles', estimatedTime: '2-5 minutes' },
            [Chain.SOLANA]: { oracleType: 'Pyth Network', estimatedTime: '3-8 minutes' },
        };

        const chainNames: Record<Chain, string> = {
            [Chain.ETHEREUM]: 'Ethereum',
            [Chain.ARBITRUM]: 'Arbitrum',
            [Chain.BASE]: 'Base',
            [Chain.POLYGON]: 'Polygon',
            [Chain.BITCOIN]: 'Bitcoin',
            [Chain.LIGHTNING]: 'Lightning Network',
            [Chain.TON]: 'TON',
            [Chain.SOLANA]: 'Solana',
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
    isAutoVerifiable(coverageType: CoverageType): boolean {
        // All coverage types support auto-verification (0-4)
        // Depeg, Smart Contract, Oracle, Bridge, CEX Liquidation
        return coverageType >= CoverageType.DEPEG && coverageType <= CoverageType.CEX_LIQUIDATION;
    }
}

