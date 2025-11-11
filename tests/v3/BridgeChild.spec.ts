import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    BridgeChild,
    createPolicyParams,
    calculatePremium,
    BASE_APR_BPS,
    BRIDGE_OFFLINE_THRESHOLD_SECONDS
} from '../../wrappers/v3/BridgeChild';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('BridgeChild', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('BridgeChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let parentFactory: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let nftMinter: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let bridgeMonitor: SandboxContract<TreasuryContract>;
    let bridgeChild: SandboxContract<BridgeChild>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        parentFactory = await blockchain.treasury('parent_factory');
        masterFactory = await blockchain.treasury('master_factory');
        nftMinter = await blockchain.treasury('nft_minter');
        vault = await blockchain.treasury('vault');
        bridgeMonitor = await blockchain.treasury('bridge_monitor');

        bridgeChild = blockchain.openContract(
            BridgeChild.createFromConfig(
                {
                    parentFactoryAddress: parentFactory.address,
                    masterFactoryAddress: masterFactory.address,
                    productType: 2, // PRODUCT_BRIDGE
                    assetId: 1, // TON Bridge
                    policyNFTMinterAddress: nftMinter.address,
                    vaultAddress: vault.address,
                    bridgeMonitorAddress: bridgeMonitor.address,
                    policyRegistry: Dictionary.empty(),
                    nextPolicyId: 1n,
                    totalPoliciesCreated: 0n,
                    totalCoverageAmount: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await bridgeChild.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: bridgeChild.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const parentAddr = await bridgeChild.getParentFactory();
            expect(parentAddr.toString()).toEqual(parentFactory.address.toString());

            const masterAddr = await bridgeChild.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await bridgeChild.getProductType();
            expect(productType).toEqual(2); // PRODUCT_BRIDGE

            const assetId = await bridgeChild.getAssetId();
            expect(assetId).toEqual(1); // TON Bridge

            const version = await bridgeChild.getVersion();
            expect(version).toEqual(3);
        });

        it('should have correct integration addresses', async () => {
            const nftAddr = await bridgeChild.getPolicyNFTMinter();
            expect(nftAddr.toString()).toEqual(nftMinter.address.toString());

            const vaultAddr = await bridgeChild.getVault();
            expect(vaultAddr.toString()).toEqual(vault.address.toString());

            const monitorAddr = await bridgeChild.getBridgeMonitor();
            expect(monitorAddr.toString()).toEqual(bridgeMonitor.address.toString());
        });

        it('should start with zero policies', async () => {
            const nextId = await bridgeChild.getNextPolicyId();
            expect(nextId).toEqual(1n);

            const totalPolicies = await bridgeChild.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const totalCoverage = await bridgeChild.getTotalCoverage();
            expect(totalCoverage).toEqual(0n);
        });
    });

    describe('Premium Calculation', () => {
        it('should calculate premium correctly with helper function', () => {
            const coverage = toNano('50000');
            const duration = 60;

            const premium = calculatePremium(coverage, duration);

            // Expected: 50000 TON × 0.012 × (60/365) = 98.63 TON
            const expected = (coverage * BigInt(BASE_APR_BPS) * BigInt(duration)) / BigInt(10000 * 365);
            expect(premium).toEqual(expected);
        });

        it('should provide premium quotes via getter', async () => {
            const coverage = toNano('50000');
            const duration = 60;

            const quote = await bridgeChild.getPremiumQuote(coverage, duration);
            const offchainCalc = calculatePremium(coverage, duration);

            expect(quote).toEqual(offchainCalc);
        });

        it('should scale premium with coverage amount', async () => {
            const duration = 60;

            const quote25k = await bridgeChild.getPremiumQuote(toNano('25000'), duration);
            const quote50k = await bridgeChild.getPremiumQuote(toNano('50000'), duration);

            expect(quote50k).toEqual(quote25k * 2n);
        });

        it('should scale premium with duration', async () => {
            const coverage = toNano('50000');

            const quote30d = await bridgeChild.getPremiumQuote(coverage, 30);
            const quote60d = await bridgeChild.getPremiumQuote(coverage, 60);

            expect(quote60d).toEqual(quote30d * 2n);
        });
    });

    describe('Policy Creation', () => {
        it('should create policy successfully', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const duration = 60;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: bridgeChild.address,
                success: true,
            });

            // Verify policy count incremented
            const totalPolicies = await bridgeChild.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);

            const nextId = await bridgeChild.getNextPolicyId();
            expect(nextId).toEqual(2n);

            const totalCoverage = await bridgeChild.getTotalCoverage();
            expect(totalCoverage).toEqual(coverage);
        });

        it('should send messages to downstream services', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const duration = 60;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            // Should send to NFT Minter
            expect(result.transactions).toHaveTransaction({
                from: bridgeChild.address,
                to: nftMinter.address,
                success: true,
            });

            // Should send to Vault (2 messages: escrow creation + premium deposit)
            const vaultTxs = result.transactions.filter(
                tx => tx.inMessage?.info.dest?.equals(vault.address)
            );
            expect(vaultTxs.length).toBeGreaterThanOrEqual(2);
        });

        it('should reject policy creation from non-parent', async () => {
            const nonParent = await blockchain.treasury('non_parent');
            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const duration = 60;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                nonParent.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonParent.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject insufficient premium', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const duration = 60;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium / 2n, // Only half premium
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 407, // err::insufficient_premium
            });
        });

        it('should reject invalid duration', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const invalidDuration = 5; // Less than 7 days minimum
            const premium = calculatePremium(coverage, invalidDuration);

            const policyParams = createPolicyParams(coverage, invalidDuration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 403, // err::invalid_params
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow master factory to update NFT minter', async () => {
            const newMinter = await blockchain.treasury('new_minter');

            const result = await bridgeChild.sendSetPolicyNFTMinter(masterFactory.getSender(), {
                value: toNano('0.05'),
                minterAddress: newMinter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeChild.address,
                success: true,
            });

            const updatedMinter = await bridgeChild.getPolicyNFTMinter();
            expect(updatedMinter.toString()).toEqual(newMinter.address.toString());
        });

        it('should allow master factory to update vault', async () => {
            const newVault = await blockchain.treasury('new_vault');

            const result = await bridgeChild.sendSetVault(masterFactory.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newVault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeChild.address,
                success: true,
            });

            const updatedVault = await bridgeChild.getVault();
            expect(updatedVault.toString()).toEqual(newVault.address.toString());
        });

        it('should allow master factory to update bridge monitor', async () => {
            const newMonitor = await blockchain.treasury('new_monitor');

            const result = await bridgeChild.sendSetBridgeMonitor(masterFactory.getSender(), {
                value: toNano('0.05'),
                monitorAddress: newMonitor.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeChild.address,
                success: true,
            });

            const updatedMonitor = await bridgeChild.getBridgeMonitor();
            expect(updatedMonitor.toString()).toEqual(newMonitor.address.toString());
        });

        it('should allow parent factory to pause', async () => {
            const result = await bridgeChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: bridgeChild.address,
                success: true,
            });

            const paused = await bridgeChild.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject policy creation when paused', async () => {
            await bridgeChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const duration = 60;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy creation', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('50000');
            const duration = 60;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await bridgeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy creation gas:', tx.totalFees);

            // Should be less than 0.2 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.2'));
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetPolicyNFTMinter from non-admin
            const result1 = await bridgeChild.sendSetPolicyNFTMinter(nonAdmin.getSender(), {
                value: toNano('0.05'),
                minterAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetVault from non-admin
            const result2 = await bridgeChild.sendSetVault(nonAdmin.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetBridgeMonitor from non-admin
            const result3 = await bridgeChild.sendSetBridgeMonitor(nonAdmin.getSender(), {
                value: toNano('0.05'),
                monitorAddress: newAddr.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: bridgeChild.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct APR', () => {
            expect(BASE_APR_BPS).toEqual(120); // 1.2%
        });

        it('should have correct offline threshold', () => {
            expect(BRIDGE_OFFLINE_THRESHOLD_SECONDS).toEqual(14400); // 4 hours
        });
    });
});
