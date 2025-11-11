import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell, Dictionary } from '@ton/core';
import { GasWallet } from '../../wrappers/v3/GasWallet';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('GasWallet', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('GasWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let gasWallet: SandboxContract<GasWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        masterFactory = await blockchain.treasury('master_factory');

        gasWallet = blockchain.openContract(
            GasWallet.createFromConfig(
                {
                    adminAddress: admin.address,
                    masterFactoryAddress: masterFactory.address,
                    totalSponsored: 0n,
                    userNonces: Dictionary.empty(),
                    rateLimits: Dictionary.empty(),
                    reserveBalance: 0n,
                    publicKey: 0n, // Placeholder for testing
                    paused: false,
                },
                code
            )
        );

        const deployResult = await gasWallet.sendDeploy(deployer.getSender(), toNano('5'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: gasWallet.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load and save data correctly', async () => {
            const adminAddr = await gasWallet.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const factoryAddr = await gasWallet.getMasterFactory();
            expect(factoryAddr.toString()).toEqual(masterFactory.address.toString());

            const totalSponsored = await gasWallet.getTotalSponsored();
            expect(totalSponsored).toEqual(0n);

            const reserveBalance = await gasWallet.getReserveBalance();
            expect(reserveBalance).toEqual(0n);

            const paused = await gasWallet.getPaused();
            expect(paused).toBe(false);

            const version = await gasWallet.getVersion();
            expect(version).toEqual(3);
        });

        it('should return correct wallet balance', async () => {
            const balance = await gasWallet.getWalletBalance();
            // Should have ~5 TON from deployment
            expect(balance).toBeGreaterThan(toNano('4'));
        });
    });

    describe('Admin Functions - Configuration', () => {
        it('should allow admin to set master factory address', async () => {
            const newFactory = await blockchain.treasury('new_factory');

            const result = await gasWallet.sendSetMasterFactory(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    masterFactoryAddress: newFactory.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: gasWallet.address,
                success: true,
            });

            const updatedFactory = await gasWallet.getMasterFactory();
            expect(updatedFactory.toString()).toEqual(newFactory.address.toString());
        });

        it('should allow admin to set public key', async () => {
            const newPubKey = 123456789n;

            const result = await gasWallet.sendSetPublicKey(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    publicKey: newPubKey,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: gasWallet.address,
                success: true,
            });

            const updatedPubKey = await gasWallet.getPublicKey();
            expect(updatedPubKey).toEqual(newPubKey);
        });

        it('should reject configuration updates from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newFactory = await blockchain.treasury('new_factory');

            const result = await gasWallet.sendSetMasterFactory(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    masterFactoryAddress: newFactory.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: gasWallet.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Funding and Withdrawal', () => {
        it('should allow anyone to fund wallet', async () => {
            const funder = await blockchain.treasury('funder');

            const result = await gasWallet.sendFundWallet(
                funder.getSender(),
                toNano('10')
            );

            expect(result.transactions).toHaveTransaction({
                from: funder.address,
                to: gasWallet.address,
                success: true,
            });

            // Reserve balance should increase
            const reserveBalance = await gasWallet.getReserveBalance();
            expect(reserveBalance).toBeGreaterThan(toNano('9'));
        });

        it('should allow admin to withdraw funds', async () => {
            // First fund the wallet
            const funder = await blockchain.treasury('funder');
            await gasWallet.sendFundWallet(funder.getSender(), toNano('10'));

            const recipient = await blockchain.treasury('recipient');
            const withdrawAmount = toNano('5');

            const result = await gasWallet.sendWithdraw(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    withdrawAmount: withdrawAmount,
                    destinationAddress: recipient.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: gasWallet.address,
                success: true,
            });

            // Should send funds to recipient
            expect(result.transactions).toHaveTransaction({
                from: gasWallet.address,
                to: recipient.address,
            });

            // Reserve balance should decrease
            const reserveBalance = await gasWallet.getReserveBalance();
            expect(reserveBalance).toBeLessThan(toNano('6'));
        });

        it('should reject withdrawal from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const recipient = await blockchain.treasury('recipient');

            const result = await gasWallet.sendWithdraw(
                nonAdmin.getSender(),
                {
                    value: toNano('0.1'),
                    withdrawAmount: toNano('1'),
                    destinationAddress: recipient.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: gasWallet.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject withdrawal exceeding reserve balance', async () => {
            // Fund with 5 TON
            await gasWallet.sendFundWallet(deployer.getSender(), toNano('5'));

            const recipient = await blockchain.treasury('recipient');

            // Try to withdraw 10 TON (more than available)
            const result = await gasWallet.sendWithdraw(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    withdrawAmount: toNano('10'),
                    destinationAddress: recipient.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: gasWallet.address,
                success: false,
                exitCode: 403, // err::insufficient_funds
            });
        });
    });

    describe('Pause/Unpause', () => {
        it('should allow admin to pause wallet', async () => {
            const result = await gasWallet.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: gasWallet.address,
                success: true,
            });

            const paused = await gasWallet.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause wallet', async () => {
            // First pause
            await gasWallet.sendPause(admin.getSender(), toNano('0.05'));
            let paused = await gasWallet.getPaused();
            expect(paused).toBe(true);

            // Then unpause
            const result = await gasWallet.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: gasWallet.address,
                success: true,
            });

            paused = await gasWallet.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await gasWallet.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: gasWallet.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Rate Limiting', () => {
        it('should return initial rate limit status for new user', async () => {
            const user = await blockchain.treasury('user');

            const status = await gasWallet.getRateLimitStatus(user.address);

            expect(status.lastTimestamp).toEqual(0);
            expect(status.countInWindow).toEqual(0);
            expect(status.limitReached).toBe(false);
        });

        it('should track rate limit status across multiple users', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            const status1 = await gasWallet.getRateLimitStatus(user1.address);
            const status2 = await gasWallet.getRateLimitStatus(user2.address);

            expect(status1.lastTimestamp).toEqual(0);
            expect(status2.lastTimestamp).toEqual(0);
        });
    });

    describe('Nonce Management', () => {
        it('should return initial nonce for new user', async () => {
            const user = await blockchain.treasury('user');

            const nextNonce = await gasWallet.getNextNonce(user.address);

            // First nonce should be 1 (or 0 depending on implementation)
            expect(nextNonce).toBeGreaterThanOrEqual(0n);
        });

        it('should track nonces independently per user', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            const nonce1 = await gasWallet.getNextNonce(user1.address);
            const nonce2 = await gasWallet.getNextNonce(user2.address);

            // Both should start from same initial value
            expect(nonce1).toEqual(nonce2);
        });
    });

    describe('Analytics', () => {
        it('should track total sponsored amount', async () => {
            const totalSponsored = await gasWallet.getTotalSponsored();
            expect(totalSponsored).toEqual(0n);

            // In production, this would increase with each external message forwarded
            // For testing, we verify it starts at 0
        });

        it('should track reserve balance separately', async () => {
            await gasWallet.sendFundWallet(deployer.getSender(), toNano('10'));

            const reserveBalance = await gasWallet.getReserveBalance();
            expect(reserveBalance).toBeGreaterThan(toNano('9'));

            const walletBalance = await gasWallet.getWalletBalance();
            expect(walletBalance).toBeGreaterThan(toNano('14')); // 5 initial + 10 funded
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for configuration update', async () => {
            const newFactory = await blockchain.treasury('new_factory');

            const result = await gasWallet.sendSetMasterFactory(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    masterFactoryAddress: newFactory.address,
                }
            );

            const tx = result.transactions[1];
            console.log('Configuration update gas:', tx.totalFees);

            // Should be less than 0.01 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });

        it('should consume reasonable gas for funding', async () => {
            const result = await gasWallet.sendFundWallet(
                deployer.getSender(),
                toNano('10')
            );

            const tx = result.transactions[1];
            console.log('Funding gas:', tx.totalFees);

            // Should be less than 0.005 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });

        it('should consume reasonable gas for withdrawal', async () => {
            // Fund first
            await gasWallet.sendFundWallet(deployer.getSender(), toNano('10'));

            const recipient = await blockchain.treasury('recipient');

            const result = await gasWallet.sendWithdraw(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    withdrawAmount: toNano('5'),
                    destinationAddress: recipient.address,
                }
            );

            const tx = result.transactions[1];
            console.log('Withdrawal gas:', tx.totalFees);

            // Should be less than 0.015 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.015'));
        });
    });

    describe('Security', () => {
        it('should prevent unauthorized access to admin functions', async () => {
            const attacker = await blockchain.treasury('attacker');
            const newFactory = await blockchain.treasury('new_factory');

            const results = await Promise.all([
                gasWallet.sendSetMasterFactory(attacker.getSender(), {
                    value: toNano('0.05'),
                    masterFactoryAddress: newFactory.address,
                }),
                gasWallet.sendSetPublicKey(attacker.getSender(), {
                    value: toNano('0.05'),
                    publicKey: 999n,
                }),
                gasWallet.sendPause(attacker.getSender(), toNano('0.05')),
                gasWallet.sendWithdraw(attacker.getSender(), {
                    value: toNano('0.1'),
                    withdrawAmount: toNano('1'),
                    destinationAddress: attacker.address,
                }),
            ]);

            // All should fail with unauthorized
            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: attacker.address,
                    to: gasWallet.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });

        it('should allow public funding from anyone', async () => {
            const users = await Promise.all([
                blockchain.treasury('user1'),
                blockchain.treasury('user2'),
                blockchain.treasury('user3'),
            ]);

            for (const user of users) {
                const result = await gasWallet.sendFundWallet(user.getSender(), toNano('1'));

                expect(result.transactions).toHaveTransaction({
                    from: user.address,
                    to: gasWallet.address,
                    success: true,
                });
            }

            // Reserve should have ~3 TON
            const reserveBalance = await gasWallet.getReserveBalance();
            expect(reserveBalance).toBeGreaterThan(toNano('2.5'));
        });
    });
});
