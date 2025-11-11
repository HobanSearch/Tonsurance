import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import { MultiTrancheVaultProxy, canUpgrade, MIN_UPGRADE_INTERVAL } from '../../wrappers/v3/MultiTrancheVaultProxy';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('MultiTrancheVaultProxy', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('MultiTrancheVaultProxy');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let implementation: SandboxContract<TreasuryContract>;
    let proxy: SandboxContract<MultiTrancheVaultProxy>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        implementation = await blockchain.treasury('implementation');

        proxy = blockchain.openContract(
            MultiTrancheVaultProxy.createFromConfig(
                {
                    implementationAddress: implementation.address,
                    adminAddress: admin.address,
                    paused: false,
                    lastUpgradeTimestamp: 0,
                    lpBalances: Dictionary.empty(),
                    trancheAllocations: Dictionary.empty(),
                    totalValueLocked: 0n,
                    protocolVersion: 1,
                },
                code
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

    describe('Initialization', () => {
        it('should initialize with correct configuration', async () => {
            const impl = await proxy.getImplementation();
            expect(impl.toString()).toEqual(implementation.address.toString());

            const adminAddr = await proxy.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const version = await proxy.getProtocolVersion();
            expect(version).toEqual(1);
        });

        it('should start with zero TVL', async () => {
            const tvl = await proxy.getTotalValueLocked();
            expect(tvl).toEqual(0n);
        });
    });

    describe('Upgrade Logic', () => {
        it('should allow admin to upgrade implementation after 48h', async () => {
            const newImpl = await blockchain.treasury('new_implementation');

            // Fast-forward 48 hours
            blockchain.now = Math.floor(Date.now() / 1000) + MIN_UPGRADE_INTERVAL + 1;

            const result = await proxy.sendUpgradeImplementation(admin.getSender(), {
                value: toNano('0.05'),
                newImplementationAddress: newImpl.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });

            const impl = await proxy.getImplementation();
            expect(impl.toString()).toEqual(newImpl.address.toString());

            const version = await proxy.getProtocolVersion();
            expect(version).toEqual(2); // Incremented
        });

        it('should prevent upgrades within 48h window', async () => {
            const newImpl = await blockchain.treasury('new_implementation');

            // Try to upgrade immediately (< 48h)
            const result = await proxy.sendUpgradeImplementation(admin.getSender(), {
                value: toNano('0.05'),
                newImplementationAddress: newImpl.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: false,
                exitCode: 404, // upgrade_too_soon
            });
        });

        it('should prevent non-admin from upgrading', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newImpl = await blockchain.treasury('new_implementation');

            const result = await proxy.sendUpgradeImplementation(nonAdmin.getSender(), {
                value: toNano('0.05'),
                newImplementationAddress: newImpl.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: proxy.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to set new admin', async () => {
            const newAdmin = await blockchain.treasury('new_admin');

            const result = await proxy.sendSetAdmin(admin.getSender(), {
                value: toNano('0.05'),
                newAdminAddress: newAdmin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: proxy.address,
                success: true,
            });
        });

        it('should allow admin to pause', async () => {
            await proxy.sendPause(admin.getSender(), toNano('0.05'));

            const paused = await proxy.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause', async () => {
            await proxy.sendPause(admin.getSender(), toNano('0.05'));
            await proxy.sendUnpause(admin.getSender(), toNano('0.05'));

            const paused = await proxy.getPaused();
            expect(paused).toBe(false);
        });
    });

    describe('Helper Functions', () => {
        it('should validate upgrade eligibility', () => {
            const now = Math.floor(Date.now() / 1000);

            expect(canUpgrade(now - MIN_UPGRADE_INTERVAL - 1, now)).toBe(true); // 48h+ ago
            expect(canUpgrade(now - 1000, now)).toBe(false); // < 48h ago
        });
    });

    describe('Constants', () => {
        it('should have correct minimum upgrade interval', () => {
            expect(MIN_UPGRADE_INTERVAL).toEqual(172800); // 48 hours
        });
    });
});
