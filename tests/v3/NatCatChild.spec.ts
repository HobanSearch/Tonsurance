import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Dictionary, beginCell } from '@ton/core';
import { NatCatChild } from '../../wrappers/v3/NatCatChild';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('NatCatChild', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('NatCatChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let parentFactory: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let nftMinter: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let eventOracle: SandboxContract<TreasuryContract>;

    describe('Hurricane Insurance', () => {
        let hurricaneChild: SandboxContract<NatCatChild>;

        beforeEach(async () => {
            blockchain = await Blockchain.create();

            deployer = await blockchain.treasury('deployer');
            parentFactory = await blockchain.treasury('parent_factory');
            masterFactory = await blockchain.treasury('master_factory');
            nftMinter = await blockchain.treasury('nft_minter');
            floatMaster = await blockchain.treasury('float_master');
            eventOracle = await blockchain.treasury('event_oracle');

            hurricaneChild = blockchain.openContract(
                NatCatChild.createFromConfig(
                    {
                        parentFactoryAddress: parentFactory.address,
                        masterFactoryAddress: masterFactory.address,
                        productType: 5, // PRODUCT_TRADFI_NATCAT
                        assetId: 1, // HURRICANE
                        policyNFTMinterAddress: nftMinter.address,
                        floatMasterAddress: floatMaster.address,
                        eventOracleAddress: eventOracle.address,
                        policyRegistry: Dictionary.empty(),
                        nextPolicyId: 1n,
                        totalPoliciesCreated: 0n,
                        totalCoverageAmount: 0n,
                        paused: false,
                        lastEventId: 0,
                        lastEventTimestamp: 0,
                        activePolicies: Dictionary.empty(),
                    },
                    code
                )
            );

            const deployResult = await hurricaneChild.sendDeploy(deployer.getSender(), toNano('1'));

            expect(deployResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: hurricaneChild.address,
                deploy: true,
                success: true,
            });
        });

        it('should load configuration correctly', async () => {
            const parentAddr = await hurricaneChild.getParentFactory();
            expect(parentAddr.toString()).toEqual(parentFactory.address.toString());

            const masterAddr = await hurricaneChild.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await hurricaneChild.getProductType();
            expect(productType).toEqual(5); // PRODUCT_TRADFI_NATCAT

            const assetId = await hurricaneChild.getAssetId();
            expect(assetId).toEqual(1); // HURRICANE

            const version = await hurricaneChild.getVersion();
            expect(version).toEqual(3);
        });

        it('should calculate hurricane premium at 3% APR', async () => {
            // Test premium calculation: $10,000 × 3% × (720 hours / 8760 hours) = $24.66
            const coverageAmount = toNano('10000');
            const durationHours = 720;  // 30 days

            const premium = await hurricaneChild.getPremiumQuote(coverageAmount, durationHours);

            // Expected: 10000 * 300 * 720 / (10000 * 8760) = 24.657534... TON
            const expectedPremium = toNano('24.657534'); // Allow some precision tolerance
            const diff = premium > expectedPremium ? premium - expectedPremium : expectedPremium - premium;
            expect(diff).toBeLessThan(toNano('0.01')); // Within 0.01 TON
        });

        it('should create policy with geographic parameters', async () => {
            const user = await blockchain.treasury('user');

            // Miami coverage: 25.7617° N, 80.1918° W, 100 km radius
            const result = await hurricaneChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'), // Premium + gas
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 25761700,      // 25.7617 * 1000000
                    longitude: -80191800,    // -80.1918 * 1000000
                    radiusKm: 100,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: hurricaneChild.address,
                success: true,
            });

            const nextPolicyId = await hurricaneChild.getNextPolicyId();
            expect(nextPolicyId).toEqual(2n); // Should have incremented

            const totalPolicies = await hurricaneChild.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);

            // Verify policy data
            const policy = await hurricaneChild.getPolicy(1n);
            expect(policy.userAddress?.toString()).toEqual(user.address.toString());
            expect(policy.assetId).toEqual(1); // Hurricane
            expect(policy.coverageAmount).toEqual(toNano('10000'));
            expect(policy.durationHours).toEqual(720);  // 30 days in hours
            expect(policy.latitude).toEqual(25761700);
            expect(policy.longitude).toEqual(-80191800);
            expect(policy.radiusKm).toEqual(100);
            expect(policy.claimed).toBe(false);
        });

        it('should verify Category 3+ trigger threshold', async () => {
            const thresholds = await hurricaneChild.getTriggerThresholds();
            expect(thresholds.minSeverity).toEqual(3); // Category 3+
        });

        it('should trigger policy when Category 3+ hurricane hits coverage area', async () => {
            const user = await blockchain.treasury('user');

            // Create policy for Miami area
            await hurricaneChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 25761700,      // Miami: 25.7617° N
                    longitude: -80191800,    // -80.1918° W
                    radiusKm: 100,
                }
            );

            // Simulate Category 4 hurricane hitting near Miami (25.5° N, 80.0° W)
            const eventResult = await hurricaneChild.sendEventUpdate(
                eventOracle.getSender(),
                {
                    value: toNano('0.1'),
                    eventId: 1,
                    latitude: 25500000,      // 25.5° N (about 30 km from Miami)
                    longitude: -80000000,    // -80.0° W
                    severity: 4,             // Category 4
                    timestamp: Math.floor(Date.now() / 1000),
                }
            );

            expect(eventResult.transactions).toHaveTransaction({
                from: eventOracle.address,
                to: hurricaneChild.address,
                success: true,
            });

            // Should trigger claim to master factory
            expect(eventResult.transactions).toHaveTransaction({
                from: hurricaneChild.address,
                to: masterFactory.address,
                success: true,
            });
        });

        it('should NOT trigger policy when hurricane is below Category 3', async () => {
            const user = await blockchain.treasury('user');

            await hurricaneChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 25761700,
                    longitude: -80191800,
                    radiusKm: 100,
                }
            );

            // Simulate Category 2 hurricane (below trigger threshold)
            const eventResult = await hurricaneChild.sendEventUpdate(
                eventOracle.getSender(),
                {
                    value: toNano('0.1'),
                    eventId: 1,
                    latitude: 25500000,
                    longitude: -80000000,
                    severity: 2, // Category 2 - below threshold
                    timestamp: Math.floor(Date.now() / 1000),
                }
            );

            expect(eventResult.transactions).toHaveTransaction({
                from: eventOracle.address,
                to: hurricaneChild.address,
                success: true,
            });

            // Should NOT trigger claim (no message to master factory)
            const claimTx = eventResult.transactions.filter(
                tx => tx.inMessage?.info.src?.equals(hurricaneChild.address) &&
                      tx.inMessage?.info.dest?.equals(masterFactory.address)
            );
            expect(claimTx.length).toEqual(0);
        });

        it('should NOT trigger policy when hurricane is outside coverage radius', async () => {
            const user = await blockchain.treasury('user');

            // Policy for Miami with 100 km radius
            await hurricaneChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 25761700,      // Miami
                    longitude: -80191800,
                    radiusKm: 100,
                }
            );

            // Hurricane hits Tampa (far from Miami, ~350 km away)
            const eventResult = await hurricaneChild.sendEventUpdate(
                eventOracle.getSender(),
                {
                    value: toNano('0.1'),
                    eventId: 1,
                    latitude: 27950000,      // Tampa: 27.95° N
                    longitude: -82460000,    // -82.46° W
                    severity: 4,             // Category 4 (meets threshold)
                    timestamp: Math.floor(Date.now() / 1000),
                }
            );

            expect(eventResult.transactions).toHaveTransaction({
                from: eventOracle.address,
                to: hurricaneChild.address,
                success: true,
            });

            // Should NOT trigger claim (outside coverage radius)
            const claimTx = eventResult.transactions.filter(
                tx => tx.inMessage?.info.src?.equals(hurricaneChild.address) &&
                      tx.inMessage?.info.dest?.equals(masterFactory.address)
            );
            expect(claimTx.length).toEqual(0);
        });

        it('should reject invalid geographic parameters', async () => {
            const user = await blockchain.treasury('user');

            // Invalid latitude (> 90°)
            let result = await hurricaneChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 95000000,      // Invalid: > 90°
                    longitude: -80191800,
                    radiusKm: 100,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: hurricaneChild.address,
                success: false,
                exitCode: 403, // err::invalid_params
            });

            // Invalid radius (> 5000 km)
            result = await hurricaneChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 25761700,
                    longitude: -80191800,
                    radiusKm: 10000, // Invalid: > 5000
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: hurricaneChild.address,
                success: false,
                exitCode: 403, // err::invalid_params
            });
        });
    });

    describe('Earthquake Insurance', () => {
        let earthquakeChild: SandboxContract<NatCatChild>;

        beforeEach(async () => {
            blockchain = await Blockchain.create();

            deployer = await blockchain.treasury('deployer');
            parentFactory = await blockchain.treasury('parent_factory');
            masterFactory = await blockchain.treasury('master_factory');
            nftMinter = await blockchain.treasury('nft_minter');
            floatMaster = await blockchain.treasury('float_master');
            eventOracle = await blockchain.treasury('event_oracle');

            earthquakeChild = blockchain.openContract(
                NatCatChild.createFromConfig(
                    {
                        parentFactoryAddress: parentFactory.address,
                        masterFactoryAddress: masterFactory.address,
                        productType: 5, // PRODUCT_TRADFI_NATCAT
                        assetId: 2, // EARTHQUAKE
                        policyNFTMinterAddress: nftMinter.address,
                        floatMasterAddress: floatMaster.address,
                        eventOracleAddress: eventOracle.address,
                        policyRegistry: Dictionary.empty(),
                        nextPolicyId: 1n,
                        totalPoliciesCreated: 0n,
                        totalCoverageAmount: 0n,
                        paused: false,
                        lastEventId: 0,
                        lastEventTimestamp: 0,
                        activePolicies: Dictionary.empty(),
                    },
                    code
                )
            );

            await earthquakeChild.sendDeploy(deployer.getSender(), toNano('1'));
        });

        it('should calculate earthquake premium at 1.5% APR', async () => {
            // Test premium calculation: $10,000 × 1.5% × (720 hours / 8760 hours) = $12.33
            const coverageAmount = toNano('10000');
            const durationHours = 720;  // 30 days

            const premium = await earthquakeChild.getPremiumQuote(coverageAmount, durationHours);

            // Expected: 10000 * 150 * 720 / (10000 * 8760) = 12.328767... TON
            const expectedPremium = toNano('12.328767');
            const diff = premium > expectedPremium ? premium - expectedPremium : expectedPremium - premium;
            expect(diff).toBeLessThan(toNano('0.01')); // Within 0.01 TON
        });

        it('should verify Magnitude 6.0+ trigger threshold', async () => {
            const thresholds = await earthquakeChild.getTriggerThresholds();
            expect(thresholds.minSeverity).toEqual(60); // Magnitude 6.0 (stored as 60 = 6.0 * 10)
        });

        it('should trigger policy when Magnitude 6.0+ earthquake hits coverage area', async () => {
            const user = await blockchain.treasury('user');

            // Create policy for San Francisco area
            await earthquakeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('20'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 37774900,      // SF: 37.7749° N
                    longitude: -122419400,   // -122.4194° W
                    radiusKm: 150,
                }
            );

            // Simulate Magnitude 6.5 earthquake near SF
            const eventResult = await earthquakeChild.sendEventUpdate(
                eventOracle.getSender(),
                {
                    value: toNano('0.1'),
                    eventId: 1,
                    latitude: 37800000,      // 37.8° N (about 3 km from SF)
                    longitude: -122400000,   // -122.4° W
                    severity: 65,            // Magnitude 6.5 (stored as 65 = 6.5 * 10)
                    timestamp: Math.floor(Date.now() / 1000),
                }
            );

            expect(eventResult.transactions).toHaveTransaction({
                from: eventOracle.address,
                to: earthquakeChild.address,
                success: true,
            });

            // Should trigger claim to master factory
            expect(eventResult.transactions).toHaveTransaction({
                from: earthquakeChild.address,
                to: masterFactory.address,
                success: true,
            });
        });

        it('should NOT trigger policy when earthquake is below Magnitude 6.0', async () => {
            const user = await blockchain.treasury('user');

            await earthquakeChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('20'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 37774900,
                    longitude: -122419400,
                    radiusKm: 150,
                }
            );

            // Magnitude 5.5 earthquake (below threshold)
            const eventResult = await earthquakeChild.sendEventUpdate(
                eventOracle.getSender(),
                {
                    value: toNano('0.1'),
                    eventId: 1,
                    latitude: 37800000,
                    longitude: -122400000,
                    severity: 55, // Magnitude 5.5 - below threshold
                    timestamp: Math.floor(Date.now() / 1000),
                }
            );

            expect(eventResult.transactions).toHaveTransaction({
                from: eventOracle.address,
                to: earthquakeChild.address,
                success: true,
            });

            // Should NOT trigger claim
            const claimTx = eventResult.transactions.filter(
                tx => tx.inMessage?.info.src?.equals(earthquakeChild.address) &&
                      tx.inMessage?.info.dest?.equals(masterFactory.address)
            );
            expect(claimTx.length).toEqual(0);
        });
    });

    describe('Admin Functions', () => {
        let natcatChild: SandboxContract<NatCatChild>;

        beforeEach(async () => {
            blockchain = await Blockchain.create();

            deployer = await blockchain.treasury('deployer');
            parentFactory = await blockchain.treasury('parent_factory');
            masterFactory = await blockchain.treasury('master_factory');
            nftMinter = await blockchain.treasury('nft_minter');
            floatMaster = await blockchain.treasury('float_master');
            eventOracle = await blockchain.treasury('event_oracle');

            natcatChild = blockchain.openContract(
                NatCatChild.createFromConfig(
                    {
                        parentFactoryAddress: parentFactory.address,
                        masterFactoryAddress: masterFactory.address,
                        productType: 5,
                        assetId: 1,
                        policyNFTMinterAddress: nftMinter.address,
                        floatMasterAddress: floatMaster.address,
                        eventOracleAddress: eventOracle.address,
                        policyRegistry: Dictionary.empty(),
                        nextPolicyId: 1n,
                        totalPoliciesCreated: 0n,
                        totalCoverageAmount: 0n,
                        paused: false,
                        lastEventId: 0,
                        lastEventTimestamp: 0,
                        activePolicies: Dictionary.empty(),
                    },
                    code
                )
            );

            await natcatChild.sendDeploy(deployer.getSender(), toNano('1'));
        });

        it('should allow parent factory to pause', async () => {
            const result = await natcatChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: natcatChild.address,
                success: true,
            });

            const paused = await natcatChild.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject policy creation when paused', async () => {
            await natcatChild.sendPause(parentFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const result = await natcatChild.sendCreatePolicyFromFactory(
                parentFactory.getSender(),
                {
                    value: toNano('30'),
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    durationHours: 720,  // 30 days
                    latitude: 25761700,
                    longitude: -80191800,
                    radiusKm: 100,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parentFactory.address,
                to: natcatChild.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });
});
