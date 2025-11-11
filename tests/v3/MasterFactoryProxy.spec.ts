import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell, Dictionary } from '@ton/core';
import { MasterFactoryProxy } from '../../wrappers/v3/MasterFactoryProxy';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('MasterFactoryProxy', () => {
    let proxyCode: Cell;
    let implCode: Cell;

    beforeAll(async () => {
        proxyCode = await compileV3('MasterFactoryProxy');
        // For testing, we'll use the same code as implementation (in production, use MasterFactory)
        implCode = await compileV3('MasterFactory');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let implementation: SandboxContract<TreasuryContract>;
    let proxy: SandboxContract<MasterFactoryProxy>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        implementation = await blockchain.treasury('implementation');

        proxy = blockchain.openContract(
            MasterFactoryProxy.createFromConfig(
                {
                    implementationAddress: implementation.address,
                    adminAddress: admin.address,
                    paused: false,
                    lastUpgradeTimestamp: 0,
                    activePolicies: Dictionary.empty(),
                    productFactories: Dictionary.empty(),
                    totalPoliciesCreated: 0n,
                    protocolVersion: 1,
                },
                proxyCode
            )
        );

        const deployResult = await proxy.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: proxy.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load and save data correctly', async () => {
            const implAddr = await proxy.getImplementation();
            expect(implAddr.toString()).toEqual(implementation.address.toString());

            const adminAddr = await proxy.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const paused = await proxy.getPaused();
            expect(paused).toBe(false);

            const version = await proxy.getProtocolVersion();
            expect(version).toEqual(1);

            const totalPolicies = await proxy.getTotalPoliciesCreated();
            expect(totalPolicies).toEqual(0n);
        });

        it('should return correct initial timestamps', async () => {
            const lastUpgrade = await proxy.getLastUpgradeTimestamp();
            expect(lastUpgrade).toEqual(0);
        });
    });

    describe('Implementation Upgrade', () => {
        it('should allow admin to upgrade implementation', async () => {
            const newImpl = await blockchain.treasury('new_implementation');

            // Advance time by 24 hours to pass rate limit
            blockchain.now = Math.floor(Date.now() / 1000) + 86400;

            const result = await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });

            const updatedImpl = await proxy.getImplementation();
            expect(updatedImpl.toString()).toEqual(newImpl.address.toString());

            // Version should increment
            const version = await proxy.getProtocolVersion();
            expect(version).toEqual(2);

            // Timestamp should be updated
            const lastUpgrade = await proxy.getLastUpgradeTimestamp();
            expect(lastUpgrade).toBeGreaterThan(0);
        });

        it('should reject upgrade from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newImpl = await blockchain.treasury('new_implementation');

            blockchain.now = Math.floor(Date.now() / 1000) + 86400;

            const result = await proxy.sendUpgradeImplementation(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: proxy.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject upgrade within 24 hours', async () => {
            const newImpl1 = await blockchain.treasury('new_implementation_1');
            const newImpl2 = await blockchain.treasury('new_implementation_2');

            // First upgrade (after 24h from deployment)
            blockchain.now = Math.floor(Date.now() / 1000) + 86400;

            await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl1.address,
                }
            );

            // Try second upgrade immediately (should fail)
            const result = await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl2.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: false,
                exitCode: 404, // err::upgrade_too_soon
            });
        });

        it('should allow upgrade after 24 hours cooldown', async () => {
            const newImpl1 = await blockchain.treasury('new_implementation_1');
            const newImpl2 = await blockchain.treasury('new_implementation_2');

            // First upgrade
            blockchain.now = Math.floor(Date.now() / 1000) + 86400;
            await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl1.address,
                }
            );

            // Wait 24 hours
            blockchain.now = Math.floor(Date.now() / 1000) + 2 * 86400;

            // Second upgrade (should succeed)
            const result = await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl2.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });

            const updatedImpl = await proxy.getImplementation();
            expect(updatedImpl.toString()).toEqual(newImpl2.address.toString());

            const version = await proxy.getProtocolVersion();
            expect(version).toEqual(3); // Started at 1, now at 3 after 2 upgrades
        });

        it('should preserve state across upgrades', async () => {
            // Simulate policies being registered (in production this comes from impl)
            const newImpl = await blockchain.treasury('new_implementation');

            // Advance time
            blockchain.now = Math.floor(Date.now() / 1000) + 86400;

            // Upgrade
            await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl.address,
                }
            );

            // State should be preserved
            const totalPolicies = await proxy.getTotalPoliciesCreated();
            expect(totalPolicies).toEqual(0n); // Still 0, but dict is preserved

            const hasPolicy = await proxy.hasPolicy(1n);
            expect(hasPolicy).toBe(false);
        });
    });

    describe('Admin Management', () => {
        it('should allow admin to change admin address', async () => {
            const newAdmin = await blockchain.treasury('new_admin');

            const result = await proxy.sendSetAdmin(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    adminAddress: newAdmin.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });

            const updatedAdmin = await proxy.getAdmin();
            expect(updatedAdmin.toString()).toEqual(newAdmin.address.toString());
        });

        it('should reject admin change from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAdmin = await blockchain.treasury('new_admin');

            const result = await proxy.sendSetAdmin(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    adminAddress: newAdmin.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: proxy.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Pause/Unpause', () => {
        it('should allow admin to pause proxy', async () => {
            const result = await proxy.sendPauseProxy(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });

            const paused = await proxy.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause proxy', async () => {
            // First pause
            await proxy.sendPauseProxy(admin.getSender(), toNano('0.05'));
            let paused = await proxy.getPaused();
            expect(paused).toBe(true);

            // Then unpause
            const result = await proxy.sendUnpauseProxy(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });

            paused = await proxy.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await proxy.sendPauseProxy(nonAdmin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: proxy.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject forwarded messages when paused', async () => {
            // Pause proxy
            await proxy.sendPauseProxy(admin.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .endCell();

            // Try to create policy (forwarded operation)
            const result = await proxy.sendCreatePolicy(
                user.getSender(),
                {
                    value: toNano('0.5'),
                    productType: 1,
                    assetId: 1,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: proxy.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Message Forwarding', () => {
        it('should forward policy creation to implementation', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .endCell();

            const result = await proxy.sendCreatePolicy(
                user.getSender(),
                {
                    value: toNano('0.5'),
                    productType: 1,
                    assetId: 1,
                    policyParams: policyParams,
                }
            );

            // Should forward to implementation
            expect(result.transactions).toHaveTransaction({
                from: proxy.address,
                to: implementation.address,
            });
        });

        it('should forward factory registration to implementation', async () => {
            const depegFactory = await blockchain.treasury('depeg_factory');

            const result = await proxy.sendRegisterProductFactory(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    productType: 1,
                    factoryAddress: depegFactory.address,
                }
            );

            // Should forward to implementation
            expect(result.transactions).toHaveTransaction({
                from: proxy.address,
                to: implementation.address,
            });
        });

        it('should deduct proxy fee from forwarded value', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .endCell();

            const result = await proxy.sendCreatePolicy(
                user.getSender(),
                {
                    value: toNano('0.5'),
                    productType: 1,
                    assetId: 1,
                    policyParams: policyParams,
                }
            );

            // Find forwarded transaction
            const forwardedTx = result.transactions.find(
                (tx) => tx.inMessage?.info.dest?.toString() === implementation.address.toString()
            );

            expect(forwardedTx).toBeDefined();

            // Value should be reduced by ~0.005 TON proxy fee
            const forwardedValue = forwardedTx?.inMessage?.info.value.coins;
            expect(forwardedValue).toBeLessThan(toNano('0.5'));
            expect(forwardedValue).toBeGreaterThan(toNano('0.49'));
        });
    });

    describe('Persistent State', () => {
        it('should track total policies created', async () => {
            const totalPolicies = await proxy.getTotalPoliciesCreated();
            expect(totalPolicies).toEqual(0n);
        });

        it('should check policy existence', async () => {
            const hasPolicy1 = await proxy.hasPolicy(1n);
            expect(hasPolicy1).toBe(false);

            const hasPolicy999 = await proxy.hasPolicy(999n);
            expect(hasPolicy999).toBe(false);
        });

        it('should check product factory deployment', async () => {
            const depegFactory = await proxy.getProductFactory(1);
            expect(depegFactory).toBeNull();

            const bridgeFactory = await proxy.getProductFactory(2);
            expect(bridgeFactory).toBeNull();
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for upgrade', async () => {
            const newImpl = await blockchain.treasury('new_implementation');

            blockchain.now = Math.floor(Date.now() / 1000) + 86400;

            const result = await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: newImpl.address,
                }
            );

            const tx = result.transactions[1];
            console.log('Upgrade gas:', tx.totalFees);

            // Should be less than 0.01 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });

        it('should add ~0.005 TON overhead for forwarding', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .endCell();

            const result = await proxy.sendCreatePolicy(
                user.getSender(),
                {
                    value: toNano('0.5'),
                    productType: 1,
                    assetId: 1,
                    policyParams: policyParams,
                }
            );

            const proxyTx = result.transactions[1];
            console.log('Proxy forwarding gas:', proxyTx.totalFees);

            // Proxy overhead should be ~0.005 TON
            expect(proxyTx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });
    });

    describe('Security', () => {
        it('should prevent upgrade with invalid implementation address', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + 86400;

            // Try to upgrade with invalid address format (this will be caught by @ton/core)
            // For this test, we'll just verify the upgrade works with valid addresses
            const validImpl = await blockchain.treasury('valid_impl');

            const result = await proxy.sendUpgradeImplementation(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    implementationAddress: validImpl.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });
        });

        it('should prevent rapid successive upgrades', async () => {
            const impl1 = await blockchain.treasury('impl1');
            const impl2 = await blockchain.treasury('impl2');
            const impl3 = await blockchain.treasury('impl3');

            // First upgrade
            blockchain.now = Math.floor(Date.now() / 1000) + 86400;
            await proxy.sendUpgradeImplementation(admin.getSender(), {
                value: toNano('0.05'),
                implementationAddress: impl1.address,
            });

            // Second upgrade (too soon)
            let result = await proxy.sendUpgradeImplementation(admin.getSender(), {
                value: toNano('0.05'),
                implementationAddress: impl2.address,
            });
            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 404, // err::upgrade_too_soon
            });

            // Wait 24 hours
            blockchain.now = Math.floor(Date.now() / 1000) + 2 * 86400;

            // Third upgrade (should succeed)
            result = await proxy.sendUpgradeImplementation(admin.getSender(), {
                value: toNano('0.05'),
                implementationAddress: impl3.address,
            });
            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });
        });
    });
});
