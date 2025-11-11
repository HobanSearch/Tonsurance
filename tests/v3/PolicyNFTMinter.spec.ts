import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import { PolicyNFTMinter, createPolicyMetadata } from '../../wrappers/v3/PolicyNFTMinter';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('PolicyNFTMinter', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('PolicyNFTMinter');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let minter: SandboxContract<PolicyNFTMinter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        masterFactory = await blockchain.treasury('master_factory');

        minter = blockchain.openContract(
            PolicyNFTMinter.createFromConfig(
                {
                    adminAddress: admin.address,
                    masterFactoryAddress: masterFactory.address,
                    nextNFTId: 1n,
                    nftMetadata: Dictionary.empty(),
                    nftOwnership: Dictionary.empty(),
                    userNFTs: Dictionary.empty(),
                    totalNFTsMinted: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await minter.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: minter.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await minter.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const factoryAddr = await minter.getMasterFactory();
            expect(factoryAddr.toString()).toEqual(masterFactory.address.toString());

            const nextId = await minter.getNextNFTId();
            expect(nextId).toEqual(1n);

            const totalMinted = await minter.getTotalNFTsMinted();
            expect(totalMinted).toEqual(0n);

            const version = await minter.getVersion();
            expect(version).toEqual(3);
        });
    });

    describe('NFT Minting', () => {
        it('should mint policy NFT successfully', async () => {
            const user = await blockchain.treasury('user');
            const metadata = createPolicyMetadata(
                1n, // policy_id
                1, // product_type (DEPEG)
                1, // asset_id (USDT)
                user.address,
                toNano('10000'), // coverage
                Math.floor(Date.now() / 1000) + 30 * 86400 // 30 days
            );

            const result = await minter.sendMintPolicyNFT(
                deployer.getSender(),
                {
                    value: toNano('0.1'),
                    metadata: metadata,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: minter.address,
                success: true,
            });

            // Verify NFT was minted
            const totalMinted = await minter.getTotalNFTsMinted();
            expect(totalMinted).toEqual(1n);

            const nextId = await minter.getNextNFTId();
            expect(nextId).toEqual(2n); // Incremented

            const owner = await minter.getNFTOwner(1n);
            expect(owner?.toString()).toEqual(user.address.toString());
        });

        it('should store NFT metadata correctly', async () => {
            const user = await blockchain.treasury('user');
            const expiry = Math.floor(Date.now() / 1000) + 30 * 86400;
            const metadata = createPolicyMetadata(
                123n,
                1,
                1,
                user.address,
                toNano('10000'),
                expiry
            );

            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: metadata,
            });

            const nftMetadata = await minter.getNFTMetadata(1n);
            expect(nftMetadata).not.toBeNull();
            expect(nftMetadata?.policyId).toEqual(123n);
            expect(nftMetadata?.productType).toEqual(1);
            expect(nftMetadata?.assetId).toEqual(1);
            expect(nftMetadata?.ownerAddress?.toString()).toEqual(user.address.toString());
            expect(nftMetadata?.coverageAmount).toEqual(toNano('10000'));
            expect(nftMetadata?.expiryTimestamp).toEqual(expiry);
        });

        it('should mint multiple NFTs independently', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Mint first NFT
            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: createPolicyMetadata(1n, 1, 1, user1.address, toNano('5000'), 0),
            });

            // Mint second NFT
            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: createPolicyMetadata(2n, 2, 1, user2.address, toNano('15000'), 0),
            });

            const totalMinted = await minter.getTotalNFTsMinted();
            expect(totalMinted).toEqual(2n);

            const owner1 = await minter.getNFTOwner(1n);
            const owner2 = await minter.getNFTOwner(2n);

            expect(owner1?.toString()).toEqual(user1.address.toString());
            expect(owner2?.toString()).toEqual(user2.address.toString());
        });

        it('should reject minting when paused', async () => {
            // Pause minter
            await minter.sendPause(admin.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const metadata = createPolicyMetadata(1n, 1, 1, user.address, toNano('10000'), 0);

            const result = await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: metadata,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: minter.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('NFT Transfer', () => {
        beforeEach(async () => {
            // Mint an NFT for transfer tests
            const user = await blockchain.treasury('user');
            const metadata = createPolicyMetadata(1n, 1, 1, user.address, toNano('10000'), 0);
            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: metadata,
            });
        });

        it('should transfer NFT to another user', async () => {
            const user = await blockchain.treasury('user');
            const recipient = await blockchain.treasury('recipient');

            const result = await minter.sendTransferNFT(user.getSender(), {
                value: toNano('0.1'),
                nftId: 1n,
                toAddress: recipient.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: minter.address,
                success: true,
            });

            // Verify ownership changed
            const newOwner = await minter.getNFTOwner(1n);
            expect(newOwner?.toString()).toEqual(recipient.address.toString());
        });

        it('should reject transfer from non-owner', async () => {
            const nonOwner = await blockchain.treasury('non_owner');
            const recipient = await blockchain.treasury('recipient');

            const result = await minter.sendTransferNFT(nonOwner.getSender(), {
                value: toNano('0.1'),
                nftId: 1n,
                toAddress: recipient.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonOwner.address,
                to: minter.address,
                success: false,
                exitCode: 404, // err::not_owner
            });
        });

        it('should reject transfer of non-existent NFT', async () => {
            const user = await blockchain.treasury('user');
            const recipient = await blockchain.treasury('recipient');

            const result = await minter.sendTransferNFT(user.getSender(), {
                value: toNano('0.1'),
                nftId: 999n, // Non-existent
                toAddress: recipient.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: minter.address,
                success: false,
                exitCode: 403, // err::nft_not_found
            });
        });
    });

    describe('NFT Burning', () => {
        beforeEach(async () => {
            const user = await blockchain.treasury('user');
            const metadata = createPolicyMetadata(1n, 1, 1, user.address, toNano('10000'), 0);
            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: metadata,
            });
        });

        it('should allow admin to burn NFT', async () => {
            const result = await minter.sendBurnNFT(admin.getSender(), {
                value: toNano('0.05'),
                nftId: 1n,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: minter.address,
                success: true,
            });

            // Verify NFT no longer exists
            const metadata = await minter.getNFTMetadata(1n);
            expect(metadata).toBeNull();

            const owner = await minter.getNFTOwner(1n);
            expect(owner).toBeNull();
        });

        it('should reject burn from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await minter.sendBurnNFT(nonAdmin.getSender(), {
                value: toNano('0.05'),
                nftId: 1n,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: minter.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update master factory', async () => {
            const newFactory = await blockchain.treasury('new_factory');

            const result = await minter.sendSetMasterFactory(admin.getSender(), {
                value: toNano('0.05'),
                masterFactoryAddress: newFactory.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: minter.address,
                success: true,
            });

            const updatedFactory = await minter.getMasterFactory();
            expect(updatedFactory.toString()).toEqual(newFactory.address.toString());
        });

        it('should allow admin to pause and unpause', async () => {
            await minter.sendPause(admin.getSender(), toNano('0.05'));
            let paused = await minter.getPaused();
            expect(paused).toBe(true);

            await minter.sendUnpause(admin.getSender(), toNano('0.05'));
            paused = await minter.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const results = await Promise.all([
                minter.sendPause(nonAdmin.getSender(), toNano('0.05')),
                minter.sendBurnNFT(nonAdmin.getSender(), { value: toNano('0.05'), nftId: 1n }),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: nonAdmin.address,
                    to: minter.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });
    });

    describe('User NFT Queries', () => {
        it('should track user NFT count correctly', async () => {
            const user = await blockchain.treasury('user');

            // Initially 0
            let count = await minter.getUserNFTCount(user.address);
            expect(count).toEqual(0);

            // Mint first NFT
            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: createPolicyMetadata(1n, 1, 1, user.address, toNano('5000'), 0),
            });

            count = await minter.getUserNFTCount(user.address);
            expect(count).toEqual(1);

            // Mint second NFT
            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: createPolicyMetadata(2n, 1, 1, user.address, toNano('10000'), 0),
            });

            count = await minter.getUserNFTCount(user.address);
            expect(count).toEqual(2);
        });

        it('should verify NFT ownership correctly', async () => {
            const user = await blockchain.treasury('user');
            const otherUser = await blockchain.treasury('other_user');

            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: createPolicyMetadata(1n, 1, 1, user.address, toNano('5000'), 0),
            });

            const userOwns = await minter.doesUserOwnNFT(user.address, 1n);
            expect(userOwns).toBe(true);

            const otherUserOwns = await minter.doesUserOwnNFT(otherUser.address, 1n);
            expect(otherUserOwns).toBe(false);
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for minting', async () => {
            const user = await blockchain.treasury('user');
            const metadata = createPolicyMetadata(1n, 1, 1, user.address, toNano('10000'), 0);

            const result = await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: metadata,
            });

            const tx = result.transactions[1];
            console.log('NFT minting gas:', tx.totalFees);

            // Should be less than 0.05 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.05'));
        });

        it('should consume reasonable gas for transfer', async () => {
            const user = await blockchain.treasury('user');
            const recipient = await blockchain.treasury('recipient');

            await minter.sendMintPolicyNFT(deployer.getSender(), {
                value: toNano('0.1'),
                metadata: createPolicyMetadata(1n, 1, 1, user.address, toNano('10000'), 0),
            });

            const result = await minter.sendTransferNFT(user.getSender(), {
                value: toNano('0.1'),
                nftId: 1n,
                toAddress: recipient.address,
            });

            const tx = result.transactions[1];
            console.log('NFT transfer gas:', tx.totalFees);

            // Should be less than 0.02 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.02'));
        });
    });
});
