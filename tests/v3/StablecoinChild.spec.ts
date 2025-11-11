import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import {
    StablecoinChild,
    createPolicyParams,
    calculatePremium,
    BASE_APR_BPS,
    DEPEG_THRESHOLD_PRICE,
    DEPEG_DURATION_SECONDS
} from '../../wrappers/v3/StablecoinChild';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('StablecoinChild', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('StablecoinChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let parentFactory: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let nftMinter: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let priceOracle: SandboxContract<TreasuryContract>;
    let stablecoinChild: SandboxContract<StablecoinChild>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        parentFactory = await blockchain.treasury('parent_factory');
        masterFactory = await blockchain.treasury('master_factory');
        nftMinter = await blockchain.treasury('nft_minter');
        floatMaster = await blockchain.treasury('float_master');
        priceOracle = await blockchain.treasury('price_oracle');

        stablecoinChild = blockchain.openContract(
            StablecoinChild.createFromConfig(
                {
                    parentFactoryAddress: parentFactory.address,
                    masterFactoryAddress: masterFactory.address,
                    productType: 1, // PRODUCT_DEPEG
                    assetId: 1, // USDT
                    policyNFTMinterAddress: nftMinter.address,
                    floatMasterAddress: floatMaster.address,
                    priceOracleAddress: priceOracle.address,
                    policyRegistry: Dictionary.empty(),
                    nextPolicyId: 1n,
                    totalPoliciesCreated: 0n,
                    totalCoverageAmount: 0n,
                    paused: false,
                    lastOraclePrice: 1000000, // $1.00
                    lastOracleTimestamp: 0,
                    depegStartTimestamp: 0,
                    activePolicies: Dictionary.empty(),
                },
                code
            )
        );

        const deployResult = await stablecoinChild.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: stablecoinChild.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const parentAddr = await stablecoinChild.getParentFactory();
            expect(parentAddr.toString()).toEqual(parentFactory.address.toString());

            const masterAddr = await stablecoinChild.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await stablecoinChild.getProductType();
            expect(productType).toEqual(1); // PRODUCT_DEPEG

            const assetId = await stablecoinChild.getAssetId();
            expect(assetId).toEqual(1); // USDT

            const version = await stablecoinChild.getVersion();
            expect(version).toEqual(3);
        });

        it('should have correct integration addresses', async () => {
            const nftAddr = await stablecoinChild.getPolicyNFTMinter();
            expect(nftAddr.toString()).toEqual(nftMinter.address.toString());

            const floatAddr = await stablecoinChild.getFloatMaster();
            expect(floatAddr.toString()).toEqual(floatMaster.address.toString());

            const oracleAddr = await stablecoinChild.getPriceOracle();
            expect(oracleAddr.toString()).toEqual(priceOracle.address.toString());
        });

        it('should start with zero policies', async () => {
            const nextId = await stablecoinChild.getNextPolicyId();
            expect(nextId).toEqual(1n);

            const totalPolicies = await stablecoinChild.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const totalCoverage = await stablecoinChild.getTotalCoverage();
            expect(totalCoverage).toEqual(0n);
        });
    });

    describe('Premium Calculation', () => {
        it('should calculate premium correctly with helper function', () => {
            const coverage = toNano('10000');
            const duration = 30;

            const premium = calculatePremium(coverage, duration);

            // Expected: 10000 TON × 0.008 × (30/365) = 6.575 TON
            const expected = (coverage * BigInt(BASE_APR_BPS) * BigInt(duration)) / BigInt(10000 * 365);
            expect(premium).toEqual(expected);
        });

        it('should provide premium quotes via getter', async () => {
            const coverage = toNano('10000');
            const duration = 30;

            const quote = await stablecoinChild.getPremiumQuote(coverage, duration);
            const offchainCalc = calculatePremium(coverage, duration);

            expect(quote).toEqual(offchainCalc);
        });

        it('should scale premium with coverage amount', async () => {
            const duration = 30;

            const quote5k = await stablecoinChild.getPremiumQuote(toNano('5000'), duration);
            const quote10k = await stablecoinChild.getPremiumQuote(toNano('10000'), duration);

            // Allow ±1 nanoton tolerance for integer division rounding
            const expected = quote5k * 2n;
            expect(quote10k).toBeGreaterThanOrEqual(expected - 1n);
            expect(quote10k).toBeLessThanOrEqual(expected + 1n);
        });

        it('should scale premium with duration', async () => {
            const coverage = toNano('10000');

            const quote30d = await stablecoinChild.getPremiumQuote(coverage, 30);
            const quote60d = await stablecoinChild.getPremiumQuote(coverage, 60);

            // Allow ±1 nanoton tolerance for integer division rounding
            const expected = quote30d * 2n;
            expect(quote60d).toBeGreaterThanOrEqual(expected - 1n);
            expect(quote60d).toBeLessThanOrEqual(expected + 1n);
        });
    });

    describe('Policy Creation', () => {
        it('should create policy successfully', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.2'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: stablecoinChild.address,
                success: true,
            });

            // Verify policy count incremented
            const totalPolicies = await stablecoinChild.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);

            const nextId = await stablecoinChild.getNextPolicyId();
            expect(nextId).toEqual(2n);

            const totalCoverage = await stablecoinChild.getTotalCoverage();
            expect(totalCoverage).toEqual(coverage);
        });

        it('should send messages to downstream services', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.2'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            // Should send to NFT Minter
            expect(result.transactions).toHaveTransaction({
                from: stablecoinChild.address,
                to: nftMinter.address,
                success: true,
            });

            // Should send to Float Master
            expect(result.transactions).toHaveTransaction({
                from: stablecoinChild.address,
                to: floatMaster.address,
                success: true,
            });

            // Should send to Master Factory
            expect(result.transactions).toHaveTransaction({
                from: stablecoinChild.address,
                to: masterFactory.address,
                success: true,
            });
        });

        it('should store policy data correctly', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            await stablecoinChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.2'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            const policy = await stablecoinChild.getPolicy(1n);
            expect(policy).not.toBeNull();
            expect(policy?.userAddress?.toString()).toEqual(user.address.toString());
            expect(policy?.assetId).toEqual(1); // USDT
            expect(policy?.coverageAmount).toEqual(coverage);
            expect(policy?.durationDays).toEqual(duration);
            expect(policy?.premiumAmount).toEqual(premium);
            expect(policy?.claimed).toBe(false);
        });

        it('should reject policy creation from non-parent', async () => {
            const nonParent = await blockchain.treasury('non_parent');
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
                nonParent.getSender(),
                {
                    value: premium + toNano('0.2'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonParent.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject insufficient premium', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium / 2n, // Only half premium
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 407, // err::insufficient_premium
            });
        });

        it('should reject invalid duration', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const invalidDuration = 5; // Less than 7 days minimum
            const premium = calculatePremium(coverage, invalidDuration);

            const policyParams = createPolicyParams(coverage, invalidDuration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.2'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 403, // err::invalid_params
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow master factory to update NFT minter', async () => {
            const newMinter = await blockchain.treasury('new_minter');

            const result = await stablecoinChild.sendSetPolicyNFTMinter(masterFactory.getSender(), {
                value: toNano('0.05'),
                minterAddress: newMinter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: stablecoinChild.address,
                success: true,
            });

            const updatedMinter = await stablecoinChild.getPolicyNFTMinter();
            expect(updatedMinter.toString()).toEqual(newMinter.address.toString());
        });

        it('should allow master factory to update float master', async () => {
            const newFloat = await blockchain.treasury('new_float');

            const result = await stablecoinChild.sendSetFloatMaster(masterFactory.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newFloat.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: stablecoinChild.address,
                success: true,
            });

            const updatedFloat = await stablecoinChild.getFloatMaster();
            expect(updatedFloat.toString()).toEqual(newFloat.address.toString());
        });

        it('should allow parent factory to pause', async () => {
            const result = await stablecoinChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: stablecoinChild.address,
                success: true,
            });

            const paused = await stablecoinChild.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject policy creation when paused', async () => {
            await stablecoinChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: premium + toNano('0.2'),
                    userAddress: user.address,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Oracle Integration', () => {
        it('should accept oracle price updates', async () => {
            const currentPrice = 995000; // $0.995
            const timestamp = Math.floor(Date.now() / 1000);

            const result = await stablecoinChild.sendOraclePriceUpdate(priceOracle.getSender(), {
                value: toNano('0.05'),
                currentPrice: currentPrice,
                timestamp: timestamp,
            });

            expect(result.transactions).toHaveTransaction({
                from: priceOracle.address,
                to: stablecoinChild.address,
                success: true,
            });
        });

        it('should get depeg trigger parameters', async () => {
            const params = await stablecoinChild.getDepegTriggerParams();

            expect(params.thresholdPrice).toEqual(DEPEG_THRESHOLD_PRICE);
            expect(params.durationSeconds).toEqual(DEPEG_DURATION_SECONDS);
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy creation', async () => {
            const user = await blockchain.treasury('user');
            const coverage = toNano('10000');
            const duration = 30;
            const premium = calculatePremium(coverage, duration);

            const policyParams = createPolicyParams(coverage, duration);

            const result = await stablecoinChild.sendCreatePolicyFromFactory(
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
            const newMinter = await blockchain.treasury('new_minter');

            // Test sendSetPolicyNFTMinter from non-admin
            const result1 = await stablecoinChild.sendSetPolicyNFTMinter(nonAdmin.getSender(), {
                value: toNano('0.05'),
                minterAddress: newMinter.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetFloatMaster from non-admin
            const result2 = await stablecoinChild.sendSetFloatMaster(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newMinter.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetPriceOracle from non-admin
            const result3 = await stablecoinChild.sendSetPriceOracle(nonAdmin.getSender(), {
                value: toNano('0.05'),
                oracleAddress: newMinter.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: stablecoinChild.address,
                success: false,
                exitCode: 401,
            });
        });
    });
});
