import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { BridgeSubFactory, ASSET_TON_BRIDGE, ASSET_ORBIT_BRIDGE, ASSET_WORMHOLE, ASSET_AXELAR } from '../../wrappers/v3/BridgeSubFactory';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('BridgeSubFactory', () => {
    let code: Cell;
    let childCode: Cell;

    beforeAll(async () => {
        code = await compileV3('BridgeSubFactory');
        childCode = await compileV3('BridgeChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let bridgeSubFactory: SandboxContract<BridgeSubFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');

        bridgeSubFactory = blockchain.openContract(
            BridgeSubFactory.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    productType: 2, // PRODUCT_BRIDGE
                    children: Dictionary.empty(),
                    childCodes: Dictionary.empty(),
                    totalChildrenDeployed: 0,
                    totalPoliciesCreated: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await bridgeSubFactory.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: bridgeSubFactory.address,
            deploy: true,
            success: true,
        });

        // Set child codes for main bridges (required before policy creation)
        await bridgeSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_TON_BRIDGE,
            childCode: childCode,
        });

        await bridgeSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_ORBIT_BRIDGE,
            childCode: childCode,
        });

        await bridgeSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_WORMHOLE,
            childCode: childCode,
        });

        await bridgeSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_AXELAR,
            childCode: childCode,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const masterAddr = await bridgeSubFactory.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await bridgeSubFactory.getProductType();
            expect(productType).toEqual(2); // PRODUCT_BRIDGE

            const totalChildren = await bridgeSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(0);

            const totalPolicies = await bridgeSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const version = await bridgeSubFactory.getVersion();
            expect(version).toEqual(3);
        });

        it('should not have any children deployed initially', async () => {
            const tonBridgeDeployed = await bridgeSubFactory.isChildDeployed(ASSET_TON_BRIDGE);
            expect(tonBridgeDeployed).toBe(false);

            const orbitDeployed = await bridgeSubFactory.isChildDeployed(ASSET_ORBIT_BRIDGE);
            expect(orbitDeployed).toBe(false);
        });

        it('should return null for non-existent child', async () => {
            const child = await bridgeSubFactory.getChild(ASSET_TON_BRIDGE);
            expect(child).toBeNull();
        });
    });

    describe('Policy Routing from MasterFactory', () => {
        it('should accept policy creation from master factory', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('50000')) // coverage_amount
                .storeUint(60, 32) // duration_days
                .storeUint(100, 16) // trigger_amount (funds locked)
                .endCell();

            const result = await bridgeSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_TON_BRIDGE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: true,
            });

            const totalPolicies = await bridgeSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);
        });

        it('should reject policy creation from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('50000'))
                .storeUint(60, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await bridgeSubFactory.sendCreatePolicyFromMaster(
                nonMaster.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_TON_BRIDGE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: bridgeSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should route policies to correct bridge child', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Register mock children
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');
            const wormholeChild = await blockchain.treasury('wormhole_child');

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_WORMHOLE,
                childAddress: wormholeChild.address,
            });

            // Create policy for TON Bridge
            const tonBridgeParams = beginCell()
                .storeCoins(toNano('25000'))
                .storeUint(30, 32)
                .storeUint(50, 16)
                .endCell();

            const result1 = await bridgeSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user1.address,
                    assetId: ASSET_TON_BRIDGE,
                    policyParams: tonBridgeParams,
                }
            );

            // Should forward to TON Bridge child
            expect(result1.transactions).toHaveTransaction({
                from: bridgeSubFactory.address,
                to: tonBridgeChild.address,
                success: true,
            });

            // Create policy for Wormhole
            const wormholeParams = beginCell()
                .storeCoins(toNano('75000'))
                .storeUint(90, 32)
                .storeUint(150, 16)
                .endCell();

            const result2 = await bridgeSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user2.address,
                    assetId: ASSET_WORMHOLE,
                    policyParams: wormholeParams,
                }
            );

            // Should forward to Wormhole child
            expect(result2.transactions).toHaveTransaction({
                from: bridgeSubFactory.address,
                to: wormholeChild.address,
                success: true,
            });
        });

        it('should reject policy for unsupported bridge', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('50000'))
                .storeUint(60, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await bridgeSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: 999, // Non-existent bridge
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: false,
                exitCode: 405, // err::child_not_found
            });
        });
    });

    describe('Child Contract Management', () => {
        it('should allow master factory to register child', async () => {
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');

            const result = await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: true,
            });

            const totalChildren = await bridgeSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(1);

            const deployedChild = await bridgeSubFactory.getChild(ASSET_TON_BRIDGE);
            expect(deployedChild?.toString()).toEqual(tonBridgeChild.address.toString());

            const isDeployed = await bridgeSubFactory.isChildDeployed(ASSET_TON_BRIDGE);
            expect(isDeployed).toBe(true);
        });

        it('should allow registering multiple children', async () => {
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');
            const orbitChild = await blockchain.treasury('orbit_child');
            const wormholeChild = await blockchain.treasury('wormhole_child');
            const axelarChild = await blockchain.treasury('axelar_child');

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_ORBIT_BRIDGE,
                childAddress: orbitChild.address,
            });

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_WORMHOLE,
                childAddress: wormholeChild.address,
            });

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_AXELAR,
                childAddress: axelarChild.address,
            });

            const totalChildren = await bridgeSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(4);

            const supportedCount = await bridgeSubFactory.getSupportedBridges();
            expect(supportedCount).toBeGreaterThanOrEqual(4);
        });

        it('should reject child registration from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');

            const result = await bridgeSubFactory.sendRegisterChild(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: bridgeSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should allow updating child code', async () => {
            const newChildCode = beginCell()
                .storeUint(0xBEEFCAFE, 32)
                .endCell();

            const result = await bridgeSubFactory.sendSetChildCode(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: true,
            });
        });

        it('should reject child code update from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const newChildCode = beginCell()
                .storeUint(0xBEEFCAFE, 32)
                .endCell();

            const result = await bridgeSubFactory.sendSetChildCode(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: bridgeSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow master factory to pause', async () => {
            const result = await bridgeSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: true,
            });

            const paused = await bridgeSubFactory.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject operations when paused', async () => {
            await bridgeSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('50000'))
                .storeUint(60, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await bridgeSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_TON_BRIDGE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });

        it('should allow master factory to unpause', async () => {
            await bridgeSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));
            let paused = await bridgeSubFactory.getPaused();
            expect(paused).toBe(true);

            const result = await bridgeSubFactory.sendUnpause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: bridgeSubFactory.address,
                success: true,
            });

            paused = await bridgeSubFactory.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');

            const result = await bridgeSubFactory.sendPause(nonMaster.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: bridgeSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Bridge Support', () => {
        it('should support all defined bridges', async () => {
            const supportedCount = await bridgeSubFactory.getSupportedBridges();
            expect(supportedCount).toBeGreaterThanOrEqual(4); // TON Bridge, Orbit, Wormhole, Axelar
        });

        it('should track registered bridges correctly', async () => {
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');
            const wormholeChild = await blockchain.treasury('wormhole_child');

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_WORMHOLE,
                childAddress: wormholeChild.address,
            });

            const tonDeployed = await bridgeSubFactory.isChildDeployed(ASSET_TON_BRIDGE);
            expect(tonDeployed).toBe(true);

            const wormholeDeployed = await bridgeSubFactory.isChildDeployed(ASSET_WORMHOLE);
            expect(wormholeDeployed).toBe(true);

            const axelarDeployed = await bridgeSubFactory.isChildDeployed(ASSET_AXELAR);
            expect(axelarDeployed).toBe(false);
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy routing', async () => {
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');
            await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('50000'))
                .storeUint(60, 32)
                .storeUint(100, 16)
                .endCell();

            const result = await bridgeSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_TON_BRIDGE,
                    policyParams: policyParams,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy routing gas:', tx.totalFees);

            // Should be less than 0.05 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.05'));
        });

        it('should consume reasonable gas for child registration', async () => {
            const tonBridgeChild = await blockchain.treasury('ton_bridge_child');

            const result = await bridgeSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TON_BRIDGE,
                childAddress: tonBridgeChild.address,
            });

            const tx = result.transactions[1];
            console.log('Child registration gas:', tx.totalFees);

            // Should be less than 0.02 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.02'));
        });
    });

    describe('Security', () => {
        it('should reject all admin operations from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const childAddress = await blockchain.treasury('child');
            const childCode = beginCell().storeUint(0xDEAD, 32).endCell();

            const results = await Promise.all([
                bridgeSubFactory.sendRegisterChild(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_TON_BRIDGE,
                    childAddress: childAddress.address,
                }),
                bridgeSubFactory.sendSetChildCode(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_TON_BRIDGE,
                    childCode: childCode,
                }),
                bridgeSubFactory.sendPause(nonMaster.getSender(), toNano('0.05')),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: nonMaster.address,
                    to: bridgeSubFactory.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });

        it('should properly bounce invalid messages', async () => {
            const sender = await blockchain.treasury('sender');

            const result = await bridgeSubFactory.sendDeploy(sender.getSender(), toNano('0.1'));

            // Unknown operation should bounce
            expect(result.transactions).toHaveTransaction({
                from: bridgeSubFactory.address,
                to: sender.address,
                success: true, // Bounce is successful
            });
        });
    });
});
