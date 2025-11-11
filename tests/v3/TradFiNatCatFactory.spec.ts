import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { TradFiNatCatFactory, ASSET_HURRICANE, ASSET_EARTHQUAKE } from '../../wrappers/v3/TradFiNatCatFactory';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('TradFiNatCatFactory', () => {
    let code: Cell;
    let childCode: Cell;

    beforeAll(async () => {
        code = await compileV3('TradFiNatCatFactory');
        childCode = await compileV3('NatCatChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let tradFiFactory: SandboxContract<TradFiNatCatFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');

        tradFiFactory = blockchain.openContract(
            TradFiNatCatFactory.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    productType: 5, // PRODUCT_TRADFI_NATCAT
                    children: Dictionary.empty(),
                    childCodes: Dictionary.empty(),
                    totalChildrenDeployed: 0,
                    totalPoliciesCreated: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await tradFiFactory.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tradFiFactory.address,
            deploy: true,
            success: true,
        });

        // Set child codes for catastrophe types
        await tradFiFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_HURRICANE,
            childCode: childCode,
        });

        await tradFiFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_EARTHQUAKE,
            childCode: childCode,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const masterAddr = await tradFiFactory.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await tradFiFactory.getProductType();
            expect(productType).toEqual(5); // PRODUCT_TRADFI_NATCAT

            const totalChildren = await tradFiFactory.getTotalChildren();
            expect(totalChildren).toEqual(0);

            const totalPolicies = await tradFiFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const version = await tradFiFactory.getVersion();
            expect(version).toEqual(3);
        });

        it('should not have any children deployed initially', async () => {
            const hurricaneDeployed = await tradFiFactory.isChildDeployed(ASSET_HURRICANE);
            expect(hurricaneDeployed).toBe(false);

            const earthquakeDeployed = await tradFiFactory.isChildDeployed(ASSET_EARTHQUAKE);
            expect(earthquakeDeployed).toBe(false);
        });

        it('should return null for non-existent child', async () => {
            const child = await tradFiFactory.getChild(ASSET_HURRICANE);
            expect(child).toBeNull();
        });
    });

    describe('Policy Routing from MasterFactory', () => {
        it('should accept policy creation from master factory', async () => {
            // Pre-register hurricane child (pre-deployment architecture)
            const hurricaneChild = await blockchain.treasury('hurricane_child');
            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            const user = await blockchain.treasury('user');
            // Policy params: coverage, duration, lat, lon, radius
            const policyParams = beginCell()
                .storeCoins(toNano('10000')) // coverage_amount
                .storeUint(30, 16)            // duration_days
                .storeInt(25761700, 32)       // Miami latitude (25.7617° * 1000000)
                .storeInt(-80191800, 32)      // Miami longitude (-80.1918° * 1000000)
                .storeUint(100, 16)           // 100 km radius
                .endCell();

            const result = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_HURRICANE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: true,
            });

            const totalPolicies = await tradFiFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);
        });

        it('should reject policy creation from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .storeInt(25761700, 32)
                .storeInt(-80191800, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await tradFiFactory.sendCreatePolicyFromMaster(
                nonMaster.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_HURRICANE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: tradFiFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should route policies to correct catastrophe child', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Register mock children
            const hurricaneChild = await blockchain.treasury('hurricane_child');
            const earthquakeChild = await blockchain.treasury('earthquake_child');

            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_EARTHQUAKE,
                childAddress: earthquakeChild.address,
            });

            // Create hurricane policy (Miami)
            const hurricaneParams = beginCell()
                .storeCoins(toNano('5000'))
                .storeUint(30, 16)
                .storeInt(25761700, 32)
                .storeInt(-80191800, 32)
                .storeUint(100, 16)
                .endCell();

            const result1 = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user1.address,
                    assetId: ASSET_HURRICANE,
                    policyParams: hurricaneParams,
                }
            );

            // Should forward to hurricane child
            expect(result1.transactions).toHaveTransaction({
                from: tradFiFactory.address,
                to: hurricaneChild.address,
                success: true,
            });

            // Create earthquake policy (San Francisco)
            const earthquakeParams = beginCell()
                .storeCoins(toNano('15000'))
                .storeUint(60, 16)
                .storeInt(37774900, 32)       // SF latitude
                .storeInt(-122419400, 32)     // SF longitude
                .storeUint(200, 16)
                .endCell();

            const result2 = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user2.address,
                    assetId: ASSET_EARTHQUAKE,
                    policyParams: earthquakeParams,
                }
            );

            // Should forward to earthquake child
            expect(result2.transactions).toHaveTransaction({
                from: tradFiFactory.address,
                to: earthquakeChild.address,
                success: true,
            });
        });

        it('should reject policy for non-registered child', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .storeInt(25761700, 32)
                .storeInt(-80191800, 32)
                .storeUint(100, 16)
                .endCell();

            // Try to create policy without registering child first
            const result = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_HURRICANE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: false,
                exitCode: 405, // err::child_not_found - Pre-deployment architecture
            });
        });

        it('should reject policy for invalid catastrophe type', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .storeInt(25761700, 32)
                .storeInt(-80191800, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: 999, // Invalid catastrophe type
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: false,
                exitCode: 403, // err::invalid_asset
            });
        });
    });

    describe('Child Contract Management', () => {
        it('should allow master factory to register child', async () => {
            const hurricaneChild = await blockchain.treasury('hurricane_child');

            const result = await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: true,
            });

            const totalChildren = await tradFiFactory.getTotalChildren();
            expect(totalChildren).toEqual(1);

            const deployedChild = await tradFiFactory.getChild(ASSET_HURRICANE);
            expect(deployedChild?.toString()).toEqual(hurricaneChild.address.toString());

            const isDeployed = await tradFiFactory.isChildDeployed(ASSET_HURRICANE);
            expect(isDeployed).toBe(true);
        });

        it('should allow registering multiple children', async () => {
            const hurricaneChild = await blockchain.treasury('hurricane_child');
            const earthquakeChild = await blockchain.treasury('earthquake_child');

            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_EARTHQUAKE,
                childAddress: earthquakeChild.address,
            });

            const totalChildren = await tradFiFactory.getTotalChildren();
            expect(totalChildren).toEqual(2);

            const supportedCount = await tradFiFactory.getSupportedCatastrophes();
            expect(supportedCount).toBeGreaterThanOrEqual(2);
        });

        it('should reject child registration from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const hurricaneChild = await blockchain.treasury('hurricane_child');

            const result = await tradFiFactory.sendRegisterChild(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: tradFiFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow master factory to pause', async () => {
            const result = await tradFiFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: true,
            });

            const paused = await tradFiFactory.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject operations when paused', async () => {
            // Pre-register child
            const hurricaneChild = await blockchain.treasury('hurricane_child');
            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            // Pause factory
            await tradFiFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .storeInt(25761700, 32)
                .storeInt(-80191800, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_HURRICANE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });

        it('should allow master factory to unpause', async () => {
            await tradFiFactory.sendPause(masterFactory.getSender(), toNano('0.05'));
            let paused = await tradFiFactory.getPaused();
            expect(paused).toBe(true);

            const result = await tradFiFactory.sendUnpause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: tradFiFactory.address,
                success: true,
            });

            paused = await tradFiFactory.getPaused();
            expect(paused).toBe(false);
        });
    });

    describe('Catastrophe Support', () => {
        it('should support all defined catastrophe types', async () => {
            const supportedCount = await tradFiFactory.getSupportedCatastrophes();
            expect(supportedCount).toBeGreaterThanOrEqual(2); // Hurricane, Earthquake
        });

        it('should track registered catastrophe children correctly', async () => {
            const hurricaneChild = await blockchain.treasury('hurricane_child');
            const earthquakeChild = await blockchain.treasury('earthquake_child');

            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_EARTHQUAKE,
                childAddress: earthquakeChild.address,
            });

            const hurricaneDeployed = await tradFiFactory.isChildDeployed(ASSET_HURRICANE);
            expect(hurricaneDeployed).toBe(true);

            const earthquakeDeployed = await tradFiFactory.isChildDeployed(ASSET_EARTHQUAKE);
            expect(earthquakeDeployed).toBe(true);
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy routing', async () => {
            const hurricaneChild = await blockchain.treasury('hurricane_child');
            await tradFiFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_HURRICANE,
                childAddress: hurricaneChild.address,
            });

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 16)
                .storeInt(25761700, 32)
                .storeInt(-80191800, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await tradFiFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_HURRICANE,
                    policyParams: policyParams,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy routing gas:', tx.totalFees);

            // Should be less than 0.05 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.05'));
        });
    });
});
