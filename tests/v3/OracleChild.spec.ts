import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    OracleChild,
    createPolicyParams,
    calculatePremium,
    BASE_APR_BPS,
    ORACLE_STALENESS_THRESHOLD_SECONDS,
    ORACLE_DEVIATION_THRESHOLD_BPS
} from '../../wrappers/v3/OracleChild';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('OracleChild', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('OracleChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let parentFactory: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let nftMinter: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let oracleMonitor: SandboxContract<TreasuryContract>;
    let oracleChild: SandboxContract<OracleChild>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        parentFactory = await blockchain.treasury('parent_factory');
        masterFactory = await blockchain.treasury('master_factory');
        nftMinter = await blockchain.treasury('nft_minter');
        vault = await blockchain.treasury('vault');
        oracleMonitor = await blockchain.treasury('oracle_monitor');

        oracleChild = blockchain.openContract(
            OracleChild.createFromConfig(
                {
                    parentFactoryAddress: parentFactory.address,
                    masterFactoryAddress: masterFactory.address,
                    productType: 3, // PRODUCT_ORACLE
                    assetId: 1, // RedStone Oracle
                    policyNFTMinterAddress: nftMinter.address,
                    vaultAddress: vault.address,
                    oracleMonitorAddress: oracleMonitor.address,
                    policyRegistry: Dictionary.empty(),
                    nextPolicyId: 1n,
                    totalPoliciesCreated: 0n,
                    totalCoverageAmount: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await oracleChild.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: oracleChild.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const parentAddr = await oracleChild.getParentFactory();
            expect(parentAddr.toString()).toEqual(parentFactory.address.toString());

            const masterAddr = await oracleChild.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await oracleChild.getProductType();
            expect(productType).toEqual(3); // PRODUCT_ORACLE

            const assetId = await oracleChild.getAssetId();
            expect(assetId).toEqual(1); // RedStone Oracle

            const version = await oracleChild.getVersion();
            expect(version).toEqual(3);
        });

        it('should have correct integration addresses', async () => {
            const nftAddr = await oracleChild.getPolicyNFTMinter();
            expect(nftAddr.toString()).toEqual(nftMinter.address.toString());

            const vaultAddr = await oracleChild.getVault();
            expect(vaultAddr.toString()).toEqual(vault.address.toString());

            const monitorAddr = await oracleChild.getOracleMonitor();
            expect(monitorAddr.toString()).toEqual(oracleMonitor.address.toString());
        });

        it('should start with zero policies', async () => {
            const nextId = await oracleChild.getNextPolicyId();
            expect(nextId).toEqual(1n);

            const totalPolicies = await oracleChild.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const totalCoverage = await oracleChild.getTotalCoverage();
            expect(totalCoverage).toEqual(0n);
        });
    });

    describe('Premium Calculation', () => {
        it('should calculate premium correctly with helper function', () => {
            const coverage = toNano('100000');
            const duration = 90;

            const premium = calculatePremium(coverage, duration);

            // Expected: 100000 TON × 0.015 × (90/365) = 369.86 TON
            const expected = (coverage * BigInt(BASE_APR_BPS) * BigInt(duration)) / BigInt(10000 * 365);
            expect(premium).toEqual(expected);
        });

        it('should provide premium quotes via getter', async () => {
            const coverage = toNano('100000');
            const duration = 90;

            const quote = await oracleChild.getPremiumQuote(coverage, duration);
            const offchainCalc = calculatePremium(coverage, duration);

            expect(quote).toEqual(offchainCalc);
        });

        it('should scale premium with coverage amount', async () => {
            const duration = 90;

            const quote50k = await oracleChild.getPremiumQuote(toNano('50000'), duration);
            const quote100k = await oracleChild.getPremiumQuote(toNano('100000'), duration);

            // Allow ±1 nanoton tolerance for integer division rounding
            const expected = quote50k * 2n;
            expect(quote100k).toBeGreaterThanOrEqual(expected - 1n);
            expect(quote100k).toBeLessThanOrEqual(expected + 1n);
        });

        it('should scale premium with duration', async () => {
            const coverage = toNano('100000');

            const quote30d = await oracleChild.getPremiumQuote(coverage, 30);
            const quote60d = await oracleChild.getPremiumQuote(coverage, 60);

            // Allow ±1 nanoton tolerance for integer division rounding
            const expected = quote30d * 2n;
            expect(quote60d).toBeGreaterThanOrEqual(expected - 1n);
            expect(quote60d).toBeLessThanOrEqual(expected + 1n);
        });
    });

    describe('Policy Creation', () => {
        it('should create policy successfully', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: oracleChild.address,
                success: true,
            });

            // Verify policy count incremented
            const totalPolicies = await oracleChild.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);

            const nextId = await oracleChild.getNextPolicyId();
            expect(nextId).toEqual(2n);

            const totalCoverage = await oracleChild.getTotalCoverage();
            expect(totalCoverage).toEqual(coverage);
        });

        it('should send messages to downstream services', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            // Should send to NFT Minter
            expect(result.transactions).toHaveTransaction({
                from: oracleChild.address,
                to: nftMinter.address,
                success: true,
            });

            // Should send to Vault (2 messages: escrow creation + premium deposit)
            const vaultTxs = result.transactions.filter(
                tx => tx.inMessage?.info.dest?.equals(vault.address)
            );
            expect(vaultTxs.length).toBeGreaterThanOrEqual(2);
        });

        it('should store policy data correctly', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            await oracleChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            const policy = await oracleChild.getPolicy(1n);
            expect(policy).not.toBeNull();
            expect(policy?.userAddress?.toString()).toEqual(user.address.toString());
            expect(policy?.assetId).toEqual(1); // RedStone Oracle
            expect(policy?.coverageAmount).toEqual(coverage);
            expect(policy?.durationDays).toEqual(duration);
            expect(policy?.premiumAmount).toEqual(premium);
            expect(policy?.claimed).toBe(false);
        });

        it('should reject policy creation from non-parent', async () => {
            const nonParent = await blockchain.treasury('non_parent');
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
                nonParent.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonParent.address,
                to: oracleChild.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject insufficient premium', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium / 2n, // Only half premium
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: oracleChild.address,
                success: false,
                exitCode: 407, // err::insufficient_premium
            });
        });

        it('should reject invalid duration', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const invalidDuration = 5; // Less than 7 days minimum
            const premium = calculatePremium(coverage, invalidDuration);

            const policyParams = createPolicyParams(coverage, invalidDuration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: oracleChild.address,
                success: false,
                exitCode: 403, // err::invalid_params
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow master factory to update NFT minter', async () => {
            const newMinter = await blockchain.treasury('new_minter');

            const result = await oracleChild.sendSetPolicyNFTMinter(masterFactory.getSender(), {
                value: toNano('0.05'),
                minterAddress: newMinter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleChild.address,
                success: true,
            });

            const updatedMinter = await oracleChild.getPolicyNFTMinter();
            expect(updatedMinter.toString()).toEqual(newMinter.address.toString());
        });

        it('should allow master factory to update vault', async () => {
            const newVault = await blockchain.treasury('new_vault');

            const result = await oracleChild.sendSetVault(masterFactory.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newVault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleChild.address,
                success: true,
            });

            const updatedVault = await oracleChild.getVault();
            expect(updatedVault.toString()).toEqual(newVault.address.toString());
        });

        it('should allow master factory to update oracle monitor', async () => {
            const newMonitor = await blockchain.treasury('new_monitor');

            const result = await oracleChild.sendSetOracleMonitor(masterFactory.getSender(), {
                value: toNano('0.05'),
                monitorAddress: newMonitor.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleChild.address,
                success: true,
            });

            const updatedMonitor = await oracleChild.getOracleMonitor();
            expect(updatedMonitor.toString()).toEqual(newMonitor.address.toString());
        });

        it('should allow parent factory to pause', async () => {
            const result = await oracleChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: oracleChild.address,
                success: true,
            });

            const paused = await oracleChild.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject policy creation when paused', async () => {
            await oracleChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: oracleChild.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Oracle Trigger Parameters', () => {
        it('should return correct trigger parameters', async () => {
            const params = await oracleChild.getTriggerParams();

            expect(params.stalenessThreshold).toEqual(ORACLE_STALENESS_THRESHOLD_SECONDS);
            expect(params.deviationThreshold).toEqual(ORACLE_DEVIATION_THRESHOLD_BPS);
        });

        it('should have correct staleness threshold', async () => {
            const params = await oracleChild.getTriggerParams();
            expect(params.stalenessThreshold).toEqual(1800); // 30 minutes
        });

        it('should have correct deviation threshold', async () => {
            const params = await oracleChild.getTriggerParams();
            expect(params.deviationThreshold).toEqual(500); // 5%
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy creation', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('100000');
            const duration = 90;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await oracleChild.sendCreatePolicyFromFactory(
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
            const result1 = await oracleChild.sendSetPolicyNFTMinter(nonAdmin.getSender(), {
                value: toNano('0.05'),
                minterAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: oracleChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetVault from non-admin
            const result2 = await oracleChild.sendSetVault(nonAdmin.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: oracleChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetOracleMonitor from non-admin
            const result3 = await oracleChild.sendSetOracleMonitor(nonAdmin.getSender(), {
                value: toNano('0.05'),
                monitorAddress: newAddr.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: oracleChild.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct APR', () => {
            expect(BASE_APR_BPS).toEqual(150); // 1.5%
        });

        it('should have correct staleness threshold', () => {
            expect(ORACLE_STALENESS_THRESHOLD_SECONDS).toEqual(1800); // 30 minutes
        });

        it('should have correct deviation threshold', () => {
            expect(ORACLE_DEVIATION_THRESHOLD_BPS).toEqual(500); // 5%
        });
    });
});
