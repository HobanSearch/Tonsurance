import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Dictionary
} from '@ton/core';

export type SBTVerifierConfig = {
    adminAddress: Address;
    guardianPubkey: bigint;
    sbtRegistry: Dictionary<bigint, number>;     // addr_hash -> kyc_tier
    whitelist: Dictionary<bigint, number>;       // addr_hash -> 1
    blacklist: Dictionary<bigint, number>;       // addr_hash -> 1
    masterFactoryAddress: Address;
    totalSBTsMinted: bigint;
    paused: boolean;
};

export function sbtVerifierConfigToCell(config: SBTVerifierConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeUint(config.guardianPubkey, 256)
        .storeDict(config.sbtRegistry)
        .storeDict(config.whitelist)
        .storeDict(config.blacklist)
        .storeAddress(config.masterFactoryAddress)
        .storeUint(config.totalSBTsMinted, 64)
        .storeBit(config.paused)
        .endCell();
}

export const KYC_TIER_NONE = 0;
export const KYC_TIER_BASIC = 1;
export const KYC_TIER_STANDARD = 2;
export const KYC_TIER_ENHANCED = 3;

export class SBTVerifier implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new SBTVerifier(address);
    }

    static createFromConfig(config: SBTVerifierConfig, code: Cell, workchain = 0) {
        const data = sbtVerifierConfigToCell(config);
        const init = { code, data };
        return new SBTVerifier(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // KYC OPERATIONS
    // ================================================================

    async sendVerifyKYCProof(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
            zkProof: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // op::verify_kyc_proof
                .storeAddress(opts.userAddress)
                .storeRef(opts.zkProof)
                .endCell(),
        });
    }

    async sendRevokeKYC(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x11, 32) // op::revoke_kyc
                .storeAddress(opts.userAddress)
                .endCell(),
        });
    }

    // ================================================================
    // ADMIN FUNCTIONS
    // ================================================================

    async sendSetGuardianPubkey(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            guardianPubkey: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x12, 32) // op::set_guardian_pubkey
                .storeUint(opts.guardianPubkey, 256)
                .endCell(),
        });
    }

    async sendAddToWhitelist(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x13, 32) // op::add_to_whitelist
                .storeAddress(opts.userAddress)
                .endCell(),
        });
    }

    async sendRemoveFromWhitelist(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x14, 32) // op::remove_from_whitelist
                .storeAddress(opts.userAddress)
                .endCell(),
        });
    }

    async sendAddToBlacklist(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x15, 32) // op::add_to_blacklist
                .storeAddress(opts.userAddress)
                .endCell(),
        });
    }

    async sendRemoveFromBlacklist(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x16, 32) // op::remove_from_blacklist
                .storeAddress(opts.userAddress)
                .endCell(),
        });
    }

    async sendSetMasterFactory(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            masterFactoryAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x17, 32) // op::set_master_factory
                .storeAddress(opts.masterFactoryAddress)
                .endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x18, 32) // op::pause
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x19, 32) // op::unpause
                .endCell(),
        });
    }

    // ================================================================
    // GETTER METHODS
    // ================================================================

    async getAdmin(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_admin', []);
        return result.stack.readAddress();
    }

    async getGuardianPubkey(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_guardian_pubkey', []);
        return result.stack.readBigNumber();
    }

    async getMasterFactory(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_master_factory', []);
        return result.stack.readAddress();
    }

    async getTotalSBTsMinted(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_sbts_minted', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getUserTier(provider: ContractProvider, userAddress: Address): Promise<number> {
        const result = await provider.get('get_user_tier', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            }
        ]);
        return Number(result.stack.readBigNumber());
    }

    async checkKYC(provider: ContractProvider, userAddress: Address, requiredTier: number): Promise<boolean> {
        const result = await provider.get('check_kyc', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            },
            { type: 'int', value: BigInt(requiredTier) }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async isWhitelisted(provider: ContractProvider, userAddress: Address): Promise<boolean> {
        const result = await provider.get('is_whitelisted', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async isBlacklisted(provider: ContractProvider, userAddress: Address): Promise<boolean> {
        const result = await provider.get('is_blacklisted', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            }
        ]);
        return result.stack.readBigNumber() === 1n;
    }

    async getTierLimits(provider: ContractProvider, tier: number): Promise<{
        maxCoverageUSD: number;
        maxDurationDays: number;
    }> {
        const result = await provider.get('get_tier_limits', [
            { type: 'int', value: BigInt(tier) }
        ]);

        const maxCoverageUSD = Number(result.stack.readBigNumber());
        const maxDurationDays = Number(result.stack.readBigNumber());

        return { maxCoverageUSD, maxDurationDays };
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

// Helper function to create ZK proof cell (for testing)
export function createZKProof(
    userAddress: Address,
    proofCommitment: bigint,
    kycTier: number,
    timestamp: number,
    signature: Buffer
): Cell {
    return beginCell()
        .storeAddress(userAddress)
        .storeUint(proofCommitment, 256)
        .storeUint(kycTier, 8)
        .storeUint(timestamp, 32)
        .storeBuffer(signature)
        .endCell();
}
