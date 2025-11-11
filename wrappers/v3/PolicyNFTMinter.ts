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

export type PolicyNFTMinterConfig = {
    adminAddress: Address;
    masterFactoryAddress: Address;
    nextNFTId: bigint;
    nftMetadata: Dictionary<bigint, Cell>;     // nft_id -> metadata_cell
    nftOwnership: Dictionary<bigint, Address>; // nft_id -> owner
    userNFTs: Dictionary<bigint, Cell>;        // user_hash -> nft_id_list
    totalNFTsMinted: bigint;
    paused: boolean;
};

export function policyNFTMinterConfigToCell(config: PolicyNFTMinterConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .storeAddress(config.masterFactoryAddress)
        .storeUint(config.nextNFTId, 64)
        .storeDict(config.nftMetadata)
        .storeDict(config.nftOwnership)
        .storeDict(config.userNFTs)
        .storeUint(config.totalNFTsMinted, 64)
        .storeBit(config.paused)
        .endCell();
}

export class PolicyNFTMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new PolicyNFTMinter(address);
    }

    static createFromConfig(config: PolicyNFTMinterConfig, code: Cell, workchain = 0) {
        const data = policyNFTMinterConfigToCell(config);
        const init = { code, data };
        return new PolicyNFTMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // ================================================================
    // NFT OPERATIONS
    // ================================================================

    async sendMintPolicyNFT(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            metadata: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x50, 32) // op::mint_policy_nft
                .storeRef(opts.metadata)
                .endCell(),
        });
    }

    async sendTransferNFT(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            nftId: bigint;
            toAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x51, 32) // op::transfer_nft
                .storeUint(opts.nftId, 64)
                .storeAddress(opts.toAddress)
                .endCell(),
        });
    }

    async sendBurnNFT(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            nftId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x52, 32) // op::burn_nft
                .storeUint(opts.nftId, 64)
                .endCell(),
        });
    }

    async sendUpdateMetadata(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            nftId: bigint;
            newMetadata: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x53, 32) // op::update_metadata
                .storeUint(opts.nftId, 64)
                .storeRef(opts.newMetadata)
                .endCell(),
        });
    }

    // ================================================================
    // ADMIN FUNCTIONS
    // ================================================================

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
                .storeUint(0x54, 32) // op::set_master_factory
                .storeAddress(opts.masterFactoryAddress)
                .endCell(),
        });
    }

    async sendPause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x55, 32) // op::pause
                .endCell(),
        });
    }

    async sendUnpause(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x56, 32) // op::unpause
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

    async getMasterFactory(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_master_factory', []);
        return result.stack.readAddress();
    }

    async getNextNFTId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_next_nft_id', []);
        return result.stack.readBigNumber();
    }

    async getTotalNFTsMinted(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total_nfts_minted', []);
        return result.stack.readBigNumber();
    }

    async getPaused(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('get_paused', []);
        return result.stack.readBigNumber() === 1n;
    }

    async getNFTMetadata(provider: ContractProvider, nftId: bigint): Promise<{
        policyId: bigint;
        productType: number;
        assetId: number;
        ownerAddress: Address | null;
        coverageAmount: bigint;
        expiryTimestamp: number;
    } | null> {
        const result = await provider.get('get_nft_metadata', [
            { type: 'int', value: nftId }
        ]);

        const policyId = result.stack.readBigNumber();

        // Check if NFT exists (policyId = 0 means not found)
        if (policyId === 0n) {
            return null;
        }

        const productType = Number(result.stack.readBigNumber());
        const assetId = Number(result.stack.readBigNumber());
        const ownerAddress = result.stack.readAddress();
        const coverageAmount = result.stack.readBigNumber();
        const expiryTimestamp = Number(result.stack.readBigNumber());

        return {
            policyId,
            productType,
            assetId,
            ownerAddress,
            coverageAmount,
            expiryTimestamp,
        };
    }

    async getNFTOwner(provider: ContractProvider, nftId: bigint): Promise<Address | null> {
        const result = await provider.get('get_nft_owner', [
            { type: 'int', value: nftId }
        ]);

        try {
            return result.stack.readAddress();
        } catch {
            return null;
        }
    }

    async doesUserOwnNFT(provider: ContractProvider, userAddress: Address, nftId: bigint): Promise<boolean> {
        const result = await provider.get('does_user_own_nft', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            },
            { type: 'int', value: nftId }
        ]);

        return result.stack.readBigNumber() === 1n;
    }

    async getUserNFTCount(provider: ContractProvider, userAddress: Address): Promise<number> {
        const result = await provider.get('get_user_nft_count', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(userAddress).endCell()
            }
        ]);

        return Number(result.stack.readBigNumber());
    }

    async getVersion(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_version', []);
        return Number(result.stack.readBigNumber());
    }
}

// Helper function to create policy NFT metadata cell
export function createPolicyMetadata(
    policyId: bigint,
    productType: number,
    assetId: number,
    ownerAddress: Address,
    coverageAmount: bigint,
    expiryTimestamp: number
): Cell {
    return beginCell()
        .storeUint(policyId, 64)
        .storeUint(productType, 8)
        .storeUint(assetId, 16)
        .storeAddress(ownerAddress)
        .storeCoins(coverageAmount)
        .storeUint(expiryTimestamp, 32)
        .endCell();
}
