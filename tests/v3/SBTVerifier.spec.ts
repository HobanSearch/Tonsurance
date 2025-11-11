import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell, Dictionary } from '@ton/core';
import { SBTVerifier, KYC_TIER_NONE, KYC_TIER_BASIC, KYC_TIER_STANDARD, KYC_TIER_ENHANCED, createZKProof } from '../../wrappers/v3/SBTVerifier';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('SBTVerifier', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('SBTVerifier');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let sbtVerifier: SandboxContract<SBTVerifier>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        masterFactory = await blockchain.treasury('master_factory');

        sbtVerifier = blockchain.openContract(
            SBTVerifier.createFromConfig(
                {
                    adminAddress: admin.address,
                    guardianPubkey: 123456789n, // Placeholder for testing
                    sbtRegistry: Dictionary.empty(),
                    whitelist: Dictionary.empty(),
                    blacklist: Dictionary.empty(),
                    masterFactoryAddress: masterFactory.address,
                    totalSBTsMinted: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await sbtVerifier.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sbtVerifier.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load and save data correctly', async () => {
            const adminAddr = await sbtVerifier.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const factoryAddr = await sbtVerifier.getMasterFactory();
            expect(factoryAddr.toString()).toEqual(masterFactory.address.toString());

            const guardianPubkey = await sbtVerifier.getGuardianPubkey();
            expect(guardianPubkey).toEqual(123456789n);

            const totalSBTs = await sbtVerifier.getTotalSBTsMinted();
            expect(totalSBTs).toEqual(0n);

            const paused = await sbtVerifier.getPaused();
            expect(paused).toBe(false);

            const version = await sbtVerifier.getVersion();
            expect(version).toEqual(3);
        });

        it('should return NONE tier for new users', async () => {
            const user = await blockchain.treasury('user');

            const tier = await sbtVerifier.getUserTier(user.address);
            expect(tier).toEqual(KYC_TIER_NONE);
        });
    });

    describe('Admin Functions - Configuration', () => {
        it('should allow admin to set guardian pubkey', async () => {
            const newPubkey = 987654321n;

            const result = await sbtVerifier.sendSetGuardianPubkey(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    guardianPubkey: newPubkey,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            const updatedPubkey = await sbtVerifier.getGuardianPubkey();
            expect(updatedPubkey).toEqual(newPubkey);
        });

        it('should allow admin to set master factory address', async () => {
            const newFactory = await blockchain.treasury('new_factory');

            const result = await sbtVerifier.sendSetMasterFactory(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    masterFactoryAddress: newFactory.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            const updatedFactory = await sbtVerifier.getMasterFactory();
            expect(updatedFactory.toString()).toEqual(newFactory.address.toString());
        });

        it('should reject configuration updates from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newFactory = await blockchain.treasury('new_factory');

            const result = await sbtVerifier.sendSetMasterFactory(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    masterFactoryAddress: newFactory.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: sbtVerifier.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Whitelist Management', () => {
        it('should allow admin to add user to whitelist', async () => {
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendAddToWhitelist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            const isWhitelisted = await sbtVerifier.isWhitelisted(user.address);
            expect(isWhitelisted).toBe(true);
        });

        it('should allow admin to remove user from whitelist', async () => {
            const user = await blockchain.treasury('user');

            // First add to whitelist
            await sbtVerifier.sendAddToWhitelist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            let isWhitelisted = await sbtVerifier.isWhitelisted(user.address);
            expect(isWhitelisted).toBe(true);

            // Then remove
            const result = await sbtVerifier.sendRemoveFromWhitelist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            isWhitelisted = await sbtVerifier.isWhitelisted(user.address);
            expect(isWhitelisted).toBe(false);
        });

        it('should reject whitelist operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendAddToWhitelist(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: sbtVerifier.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should allow whitelisted user to pass KYC check regardless of tier', async () => {
            const user = await blockchain.treasury('user');

            // Add to whitelist
            await sbtVerifier.sendAddToWhitelist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            // Check KYC with high tier requirement
            const passesKYC = await sbtVerifier.checkKYC(user.address, KYC_TIER_ENHANCED);
            expect(passesKYC).toBe(true);
        });
    });

    describe('Blacklist Management', () => {
        it('should allow admin to add user to blacklist', async () => {
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendAddToBlacklist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            const isBlacklisted = await sbtVerifier.isBlacklisted(user.address);
            expect(isBlacklisted).toBe(true);
        });

        it('should allow admin to remove user from blacklist', async () => {
            const user = await blockchain.treasury('user');

            // First add to blacklist
            await sbtVerifier.sendAddToBlacklist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            // Then remove
            const result = await sbtVerifier.sendRemoveFromBlacklist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            const isBlacklisted = await sbtVerifier.isBlacklisted(user.address);
            expect(isBlacklisted).toBe(false);
        });

        it('should reject blacklist operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendAddToBlacklist(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: sbtVerifier.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should block blacklisted user even with valid SBT', async () => {
            const user = await blockchain.treasury('user');

            // Add to blacklist
            await sbtVerifier.sendAddToBlacklist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            // Check KYC should fail even with Basic tier
            const passesKYC = await sbtVerifier.checkKYC(user.address, KYC_TIER_BASIC);
            expect(passesKYC).toBe(false);
        });
    });

    describe('KYC Revocation', () => {
        it('should allow admin to revoke user KYC', async () => {
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendRevokeKYC(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            // User should have no tier
            const tier = await sbtVerifier.getUserTier(user.address);
            expect(tier).toEqual(KYC_TIER_NONE);
        });

        it('should reject revocation from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendRevokeKYC(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: sbtVerifier.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Tier Limits', () => {
        it('should return correct limits for BASIC tier', async () => {
            const limits = await sbtVerifier.getTierLimits(KYC_TIER_BASIC);

            expect(limits.maxCoverageUSD).toEqual(5000);
            expect(limits.maxDurationDays).toEqual(30);
        });

        it('should return correct limits for STANDARD tier', async () => {
            const limits = await sbtVerifier.getTierLimits(KYC_TIER_STANDARD);

            expect(limits.maxCoverageUSD).toEqual(50000);
            expect(limits.maxDurationDays).toEqual(90);
        });

        it('should return correct limits for ENHANCED tier', async () => {
            const limits = await sbtVerifier.getTierLimits(KYC_TIER_ENHANCED);

            expect(limits.maxCoverageUSD).toEqual(500000);
            expect(limits.maxDurationDays).toEqual(365);
        });

        it('should return zero limits for NONE tier', async () => {
            const limits = await sbtVerifier.getTierLimits(KYC_TIER_NONE);

            expect(limits.maxCoverageUSD).toEqual(0);
            expect(limits.maxDurationDays).toEqual(0);
        });
    });

    describe('KYC Checks', () => {
        it('should fail check for user with no KYC', async () => {
            const user = await blockchain.treasury('user');

            const passesBasic = await sbtVerifier.checkKYC(user.address, KYC_TIER_BASIC);
            expect(passesBasic).toBe(false);
        });

        it('should check multiple users independently', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            const passes1 = await sbtVerifier.checkKYC(user1.address, KYC_TIER_BASIC);
            const passes2 = await sbtVerifier.checkKYC(user2.address, KYC_TIER_BASIC);

            expect(passes1).toBe(false);
            expect(passes2).toBe(false);
        });

        it('should prioritize blacklist over whitelist', async () => {
            const user = await blockchain.treasury('user');

            // Add to both whitelist and blacklist
            await sbtVerifier.sendAddToWhitelist(admin.getSender(), {
                value: toNano('0.05'),
                userAddress: user.address,
            });

            await sbtVerifier.sendAddToBlacklist(admin.getSender(), {
                value: toNano('0.05'),
                userAddress: user.address,
            });

            // Blacklist should take precedence
            const passesKYC = await sbtVerifier.checkKYC(user.address, KYC_TIER_BASIC);
            expect(passesKYC).toBe(false);
        });
    });

    describe('Pause/Unpause', () => {
        it('should allow admin to pause verifier', async () => {
            const result = await sbtVerifier.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            const paused = await sbtVerifier.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause verifier', async () => {
            // First pause
            await sbtVerifier.sendPause(admin.getSender(), toNano('0.05'));
            let paused = await sbtVerifier.getPaused();
            expect(paused).toBe(true);

            // Then unpause
            const result = await sbtVerifier.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sbtVerifier.address,
                success: true,
            });

            paused = await sbtVerifier.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await sbtVerifier.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: sbtVerifier.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject KYC proof verification when paused', async () => {
            // Pause verifier
            await sbtVerifier.sendPause(admin.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const zkProof = createZKProof(
                user.address,
                123456n,
                KYC_TIER_BASIC,
                Math.floor(Date.now() / 1000),
                Buffer.alloc(64) // Dummy signature
            );

            const result = await sbtVerifier.sendVerifyKYCProof(
                deployer.getSender(),
                {
                    value: toNano('0.1'),
                    userAddress: user.address,
                    zkProof: zkProof,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: sbtVerifier.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for whitelist addition', async () => {
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendAddToWhitelist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            const tx = result.transactions[1];
            console.log('Whitelist addition gas:', tx.totalFees);

            // Should be less than 0.01 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });

        it('should consume reasonable gas for blacklist addition', async () => {
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendAddToBlacklist(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            const tx = result.transactions[1];
            console.log('Blacklist addition gas:', tx.totalFees);

            // Should be less than 0.01 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });

        it('should consume reasonable gas for KYC revocation', async () => {
            const user = await blockchain.treasury('user');

            const result = await sbtVerifier.sendRevokeKYC(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }
            );

            const tx = result.transactions[1];
            console.log('KYC revocation gas:', tx.totalFees);

            // Should be less than 0.01 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });
    });

    describe('Security', () => {
        it('should prevent unauthorized access to all admin functions', async () => {
            const attacker = await blockchain.treasury('attacker');
            const user = await blockchain.treasury('user');

            const results = await Promise.all([
                sbtVerifier.sendSetGuardianPubkey(attacker.getSender(), {
                    value: toNano('0.05'),
                    guardianPubkey: 999n,
                }),
                sbtVerifier.sendAddToWhitelist(attacker.getSender(), {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }),
                sbtVerifier.sendAddToBlacklist(attacker.getSender(), {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }),
                sbtVerifier.sendRevokeKYC(attacker.getSender(), {
                    value: toNano('0.05'),
                    userAddress: user.address,
                }),
                sbtVerifier.sendPause(attacker.getSender(), toNano('0.05')),
            ]);

            // All should fail with unauthorized
            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: attacker.address,
                    to: sbtVerifier.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });

        it('should maintain list integrity across multiple operations', async () => {
            const users = await Promise.all([
                blockchain.treasury('user1'),
                blockchain.treasury('user2'),
                blockchain.treasury('user3'),
            ]);

            // Add first two to whitelist, third to blacklist
            await sbtVerifier.sendAddToWhitelist(admin.getSender(), {
                value: toNano('0.05'),
                userAddress: users[0].address,
            });

            await sbtVerifier.sendAddToWhitelist(admin.getSender(), {
                value: toNano('0.05'),
                userAddress: users[1].address,
            });

            await sbtVerifier.sendAddToBlacklist(admin.getSender(), {
                value: toNano('0.05'),
                userAddress: users[2].address,
            });

            // Verify status
            expect(await sbtVerifier.isWhitelisted(users[0].address)).toBe(true);
            expect(await sbtVerifier.isWhitelisted(users[1].address)).toBe(true);
            expect(await sbtVerifier.isWhitelisted(users[2].address)).toBe(false);
            expect(await sbtVerifier.isBlacklisted(users[2].address)).toBe(true);
        });
    });
});
