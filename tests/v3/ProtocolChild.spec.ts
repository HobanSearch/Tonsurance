import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    ProtocolChild,
    createPolicyParams,
    calculatePremium,
    BASE_APR_BPS,
    PROTOCOL_PAUSE_THRESHOLD_SECONDS
} from '../../wrappers/v3/ProtocolChild';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('ProtocolChild', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('ProtocolChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let parentFactory: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let nftMinter: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let protocolMonitor: SandboxContract<TreasuryContract>;
    let protocolChild: SandboxContract<ProtocolChild>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        parentFactory = await blockchain.treasury('parent_factory');
        masterFactory = await blockchain.treasury('master_factory');
        nftMinter = await blockchain.treasury('nft_minter');
        vault = await blockchain.treasury('vault');
        protocolMonitor = await blockchain.treasury('protocol_monitor');

        protocolChild = blockchain.openContract(
            ProtocolChild.createFromConfig(
                {
                    parentFactoryAddress: parentFactory.address,
                    masterFactoryAddress: masterFactory.address,
                    productType: 4, // PRODUCT_CONTRACT
                    assetId: 1, // DeDust Protocol
                    policyNFTMinterAddress: nftMinter.address,
                    vaultAddress: vault.address,
                    protocolMonitorAddress: protocolMonitor.address,
                    policyRegistry: Dictionary.empty(),
                    nextPolicyId: 1n,
                    totalPoliciesCreated: 0n,
                    totalCoverageAmount: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await protocolChild.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: protocolChild.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const parentAddr = await protocolChild.getParentFactory();
            expect(parentAddr.toString()).toEqual(parentFactory.address.toString());

            const masterAddr = await protocolChild.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await protocolChild.getProductType();
            expect(productType).toEqual(4); // PRODUCT_CONTRACT

            const assetId = await protocolChild.getAssetId();
            expect(assetId).toEqual(1); // DeDust Protocol

            const version = await protocolChild.getVersion();
            expect(version).toEqual(3);
        });

        it('should have correct integration addresses', async () => {
            const nftAddr = await protocolChild.getPolicyNFTMinter();
            expect(nftAddr.toString()).toEqual(nftMinter.address.toString());

            const vaultAddr = await protocolChild.getVault();
            expect(vaultAddr.toString()).toEqual(vault.address.toString());

            const monitorAddr = await protocolChild.getProtocolMonitor();
            expect(monitorAddr.toString()).toEqual(protocolMonitor.address.toString());
        });

        it('should start with zero policies', async () => {
            const nextId = await protocolChild.getNextPolicyId();
            expect(nextId).toEqual(1n);

            const totalPolicies = await protocolChild.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const totalCoverage = await protocolChild.getTotalCoverage();
            expect(totalCoverage).toEqual(0n);
        });
    });

    describe('Premium Calculation', () => {
        it('should calculate premium correctly with helper function', () => {
            const coverage = toNano('200000');
            const duration = 180;

            const premium = calculatePremium(coverage, duration);

            // Expected: 200000 TON × 0.020 × (180/365) = 1972.60 TON
            const expected = (coverage * BigInt(BASE_APR_BPS) * BigInt(duration)) / BigInt(10000 * 365);
            expect(premium).toEqual(expected);
        });

        it('should provide premium quotes via getter', async () => {
            const coverage = toNano('200000');
            const duration = 180;

            const quote = await protocolChild.getPremiumQuote(coverage, duration);
            const offchainCalc = calculatePremium(coverage, duration);

            expect(quote).toEqual(offchainCalc);
        });

        it('should scale premium with coverage amount', async () => {
            const duration = 180;

            const quote100k = await protocolChild.getPremiumQuote(toNano('100000'), duration);
            const quote200k = await protocolChild.getPremiumQuote(toNano('200000'), duration);

            expect(quote200k).toEqual(quote100k * 2n);
        });

        it('should scale premium with duration', async () => {
            const coverage = toNano('200000');

            const quote90d = await protocolChild.getPremiumQuote(coverage, 90);
            const quote180d = await protocolChild.getPremiumQuote(coverage, 180);

            expect(quote180d).toEqual(quote90d * 2n);
        });

        it('should have highest APR among all products', () => {
            // Protocol insurance is highest risk: 2.0% vs 1.5% (oracle), 1.2% (bridge), 0.8% (depeg)
            expect(BASE_APR_BPS).toEqual(200);
            expect(BASE_APR_BPS).toBeGreaterThan(150); // Higher than oracle (150)
            expect(BASE_APR_BPS).toBeGreaterThan(120); // Higher than bridge (120)
            expect(BASE_APR_BPS).toBeGreaterThan(80);  // Higher than depeg (80)
        });
    });

    describe('Policy Creation', () => {
        it('should create policy successfully', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: protocolChild.address,
                success: true,
            });

            // Verify policy count incremented
            const totalPolicies = await protocolChild.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);

            const nextId = await protocolChild.getNextPolicyId();
            expect(nextId).toEqual(2n);

            const totalCoverage = await protocolChild.getTotalCoverage();
            expect(totalCoverage).toEqual(coverage);
        });

        it('should send messages to downstream services', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            // Should send to NFT Minter
            expect(result.transactions).toHaveTransaction({
                from: protocolChild.address,
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
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            await protocolChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            const policy = await protocolChild.getPolicy(1n);
            expect(policy).not.toBeNull();
            expect(policy?.userAddress?.toString()).toEqual(user.address.toString());
            expect(policy?.assetId).toEqual(1); // DeDust Protocol
            expect(policy?.coverageAmount).toEqual(coverage);
            expect(policy?.durationDays).toEqual(duration);
            expect(policy?.premiumAmount).toEqual(premium);
            expect(policy?.claimed).toBe(false);
        });

        it('should reject policy creation from non-parent', async () => {
            const nonParent = await blockchain.treasury('non_parent');
            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
                nonParent.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonParent.address,
                to: protocolChild.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject insufficient premium', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium / 2n, // Only half premium
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: protocolChild.address,
                success: false,
                exitCode: 407, // err::insufficient_premium
            });
        });

        it('should reject invalid duration', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const invalidDuration = 5; // Less than 7 days minimum
            const premium = calculatePremium(coverage, invalidDuration);

            const policyParams = createPolicyParams(coverage, invalidDuration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: protocolChild.address,
                success: false,
                exitCode: 403, // err::invalid_params
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow master factory to update NFT minter', async () => {
            const newMinter = await blockchain.treasury('new_minter');

            const result = await protocolChild.sendSetPolicyNFTMinter(masterFactory.getSender(), {
                value: toNano('0.05'),
                minterAddress: newMinter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: protocolChild.address,
                success: true,
            });

            const updatedMinter = await protocolChild.getPolicyNFTMinter();
            expect(updatedMinter.toString()).toEqual(newMinter.address.toString());
        });

        it('should allow master factory to update vault', async () => {
            const newVault = await blockchain.treasury('new_vault');

            const result = await protocolChild.sendSetVault(masterFactory.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newVault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: protocolChild.address,
                success: true,
            });

            const updatedVault = await protocolChild.getVault();
            expect(updatedVault.toString()).toEqual(newVault.address.toString());
        });

        it('should allow master factory to update protocol monitor', async () => {
            const newMonitor = await blockchain.treasury('new_monitor');

            const result = await protocolChild.sendSetProtocolMonitor(masterFactory.getSender(), {
                value: toNano('0.05'),
                monitorAddress: newMonitor.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: protocolChild.address,
                success: true,
            });

            const updatedMonitor = await protocolChild.getProtocolMonitor();
            expect(updatedMonitor.toString()).toEqual(newMonitor.address.toString());
        });

        it('should allow parent factory to pause', async () => {
            const result = await protocolChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: protocolChild.address,
                success: true,
            });

            const paused = await protocolChild.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject policy creation when paused', async () => {
            await protocolChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.3'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: protocolChild.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Protocol Pause Trigger', () => {
        it('should return correct pause threshold', async () => {
            const threshold = await protocolChild.getPauseThreshold();
            expect(threshold).toEqual(PROTOCOL_PAUSE_THRESHOLD_SECONDS);
        });

        it('should have 24 hour pause threshold', async () => {
            const threshold = await protocolChild.getPauseThreshold();
            expect(threshold).toEqual(86400); // 24 hours in seconds
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy creation', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('200000');
            const duration = 180;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await protocolChild.sendCreatePolicyFromFactory(
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
            const result1 = await protocolChild.sendSetPolicyNFTMinter(nonAdmin.getSender(), {
                value: toNano('0.05'),
                minterAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: protocolChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetVault from non-admin
            const result2 = await protocolChild.sendSetVault(nonAdmin.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: protocolChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetProtocolMonitor from non-admin
            const result3 = await protocolChild.sendSetProtocolMonitor(nonAdmin.getSender(), {
                value: toNano('0.05'),
                monitorAddress: newAddr.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: protocolChild.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct APR', () => {
            expect(BASE_APR_BPS).toEqual(200); // 2.0%
        });

        it('should have correct pause threshold', () => {
            expect(PROTOCOL_PAUSE_THRESHOLD_SECONDS).toEqual(86400); // 24 hours
        });
    });
});
