import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { OracleSubFactory, ASSET_REDSTONE, ASSET_PYTH, ASSET_CHAINLINK, ASSET_DIA } from '../../wrappers/v3/OracleSubFactory';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('OracleSubFactory', () => {
    let code: Cell;
    let childCode: Cell;

    beforeAll(async () => {
        code = await compileV3('OracleSubFactory');
        childCode = await compileV3('OracleChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let oracleSubFactory: SandboxContract<OracleSubFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');

        oracleSubFactory = blockchain.openContract(
            OracleSubFactory.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    productType: 3, // PRODUCT_ORACLE
                    children: Dictionary.empty(),
                    childCodes: Dictionary.empty(),
                    totalChildrenDeployed: 0,
                    totalPoliciesCreated: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await oracleSubFactory.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: oracleSubFactory.address,
            deploy: true,
            success: true,
        });

        // Set child codes for main oracle providers (required before policy creation)
        await oracleSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_REDSTONE,
            childCode: childCode,
        });

        await oracleSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_PYTH,
            childCode: childCode,
        });

        await oracleSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_CHAINLINK,
            childCode: childCode,
        });

        await oracleSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_DIA,
            childCode: childCode,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const masterAddr = await oracleSubFactory.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await oracleSubFactory.getProductType();
            expect(productType).toEqual(3); // PRODUCT_ORACLE

            const totalChildren = await oracleSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(0);

            const totalPolicies = await oracleSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const version = await oracleSubFactory.getVersion();
            expect(version).toEqual(3);
        });

        it('should not have any children deployed initially', async () => {
            const redstoneDeployed = await oracleSubFactory.isChildDeployed(ASSET_REDSTONE);
            expect(redstoneDeployed).toBe(false);

            const pythDeployed = await oracleSubFactory.isChildDeployed(ASSET_PYTH);
            expect(pythDeployed).toBe(false);
        });

        it('should return null for non-existent child', async () => {
            const child = await oracleSubFactory.getChild(ASSET_REDSTONE);
            expect(child).toBeNull();
        });
    });

    describe('Policy Routing from MasterFactory', () => {
        it('should accept policy creation from master factory', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('20000')) // coverage_amount
                .storeUint(90, 32) // duration_days
                .storeUint(300, 16) // downtime_threshold_seconds
                .endCell();

            const result = await oracleSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_REDSTONE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: true,
            });

            const totalPolicies = await oracleSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);
        });

        it('should reject policy creation from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('20000'))
                .storeUint(90, 32)
                .storeUint(300, 16)
                .endCell();

            const result = await oracleSubFactory.sendCreatePolicyFromMaster(
                nonMaster.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_REDSTONE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: oracleSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should route policies to correct oracle child', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Register mock children
            const redstoneChild = await blockchain.treasury('redstone_child');
            const pythChild = await blockchain.treasury('pyth_child');

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
            });

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_PYTH,
                childAddress: pythChild.address,
            });

            // Create policy for RedStone
            const redstoneParams = beginCell()
                .storeCoins(toNano('15000'))
                .storeUint(60, 32)
                .storeUint(180, 16)
                .endCell();

            const result1 = await oracleSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user1.address,
                    assetId: ASSET_REDSTONE,
                    policyParams: redstoneParams,
                }
            );

            // Should forward to RedStone child
            expect(result1.transactions).toHaveTransaction({
                from: oracleSubFactory.address,
                to: redstoneChild.address,
                success: true,
            });

            // Create policy for Pyth
            const pythParams = beginCell()
                .storeCoins(toNano('25000'))
                .storeUint(120, 32)
                .storeUint(600, 16)
                .endCell();

            const result2 = await oracleSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user2.address,
                    assetId: ASSET_PYTH,
                    policyParams: pythParams,
                }
            );

            // Should forward to Pyth child
            expect(result2.transactions).toHaveTransaction({
                from: oracleSubFactory.address,
                to: pythChild.address,
                success: true,
            });
        });

        it('should reject policy for unsupported oracle', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('20000'))
                .storeUint(90, 32)
                .storeUint(300, 16)
                .endCell();

            const result = await oracleSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: 999, // Non-existent oracle
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: false,
                exitCode: 405, // err::child_not_found
            });
        });
    });

    describe('Child Contract Management', () => {
        it('should allow master factory to register child', async () => {
            const redstoneChild = await blockchain.treasury('redstone_child');

            const result = await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: true,
            });

            const totalChildren = await oracleSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(1);

            const deployedChild = await oracleSubFactory.getChild(ASSET_REDSTONE);
            expect(deployedChild?.toString()).toEqual(redstoneChild.address.toString());

            const isDeployed = await oracleSubFactory.isChildDeployed(ASSET_REDSTONE);
            expect(isDeployed).toBe(true);
        });

        it('should allow registering multiple children', async () => {
            const redstoneChild = await blockchain.treasury('redstone_child');
            const pythChild = await blockchain.treasury('pyth_child');
            const chainlinkChild = await blockchain.treasury('chainlink_child');
            const diaChild = await blockchain.treasury('dia_child');

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
            });

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_PYTH,
                childAddress: pythChild.address,
            });

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_CHAINLINK,
                childAddress: chainlinkChild.address,
            });

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DIA,
                childAddress: diaChild.address,
            });

            const totalChildren = await oracleSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(4);

            const supportedCount = await oracleSubFactory.getSupportedOracles();
            expect(supportedCount).toBeGreaterThanOrEqual(4);
        });

        it('should reject child registration from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const redstoneChild = await blockchain.treasury('redstone_child');

            const result = await oracleSubFactory.sendRegisterChild(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: oracleSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should allow updating child code', async () => {
            const newChildCode = beginCell()
                .storeUint(0xFEEDBABE, 32)
                .endCell();

            const result = await oracleSubFactory.sendSetChildCode(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: true,
            });
        });

        it('should reject child code update from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const newChildCode = beginCell()
                .storeUint(0xFEEDBABE, 32)
                .endCell();

            const result = await oracleSubFactory.sendSetChildCode(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: oracleSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow master factory to pause', async () => {
            const result = await oracleSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: true,
            });

            const paused = await oracleSubFactory.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject operations when paused', async () => {
            await oracleSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('20000'))
                .storeUint(90, 32)
                .storeUint(300, 16)
                .endCell();

            const result = await oracleSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_REDSTONE,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });

        it('should allow master factory to unpause', async () => {
            await oracleSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));
            let paused = await oracleSubFactory.getPaused();
            expect(paused).toBe(true);

            const result = await oracleSubFactory.sendUnpause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracleSubFactory.address,
                success: true,
            });

            paused = await oracleSubFactory.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');

            const result = await oracleSubFactory.sendPause(nonMaster.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: oracleSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Oracle Provider Support', () => {
        it('should support all defined oracle providers', async () => {
            const supportedCount = await oracleSubFactory.getSupportedOracles();
            expect(supportedCount).toBeGreaterThanOrEqual(4); // RedStone, Pyth, Chainlink, DIA
        });

        it('should track registered oracle providers correctly', async () => {
            const redstoneChild = await blockchain.treasury('redstone_child');
            const pythChild = await blockchain.treasury('pyth_child');

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
            });

            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_PYTH,
                childAddress: pythChild.address,
            });

            const redstoneDeployed = await oracleSubFactory.isChildDeployed(ASSET_REDSTONE);
            expect(redstoneDeployed).toBe(true);

            const pythDeployed = await oracleSubFactory.isChildDeployed(ASSET_PYTH);
            expect(pythDeployed).toBe(true);

            const chainlinkDeployed = await oracleSubFactory.isChildDeployed(ASSET_CHAINLINK);
            expect(chainlinkDeployed).toBe(false);
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy routing', async () => {
            const redstoneChild = await blockchain.treasury('redstone_child');
            await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
            });

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('20000'))
                .storeUint(90, 32)
                .storeUint(300, 16)
                .endCell();

            const result = await oracleSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_REDSTONE,
                    policyParams: policyParams,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy routing gas:', tx.totalFees);

            // Should be less than 0.05 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.05'));
        });

        it('should consume reasonable gas for child registration', async () => {
            const redstoneChild = await blockchain.treasury('redstone_child');

            const result = await oracleSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_REDSTONE,
                childAddress: redstoneChild.address,
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
                oracleSubFactory.sendRegisterChild(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_REDSTONE,
                    childAddress: childAddress.address,
                }),
                oracleSubFactory.sendSetChildCode(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_REDSTONE,
                    childCode: childCode,
                }),
                oracleSubFactory.sendPause(nonMaster.getSender(), toNano('0.05')),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: nonMaster.address,
                    to: oracleSubFactory.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });

        it('should properly bounce invalid messages', async () => {
            const sender = await blockchain.treasury('sender');

            const result = await oracleSubFactory.sendDeploy(sender.getSender(), toNano('0.1'));

            // Unknown operation should bounce
            expect(result.transactions).toHaveTransaction({
                from: oracleSubFactory.address,
                to: sender.address,
                success: true, // Bounce is successful
            });
        });
    });
});
