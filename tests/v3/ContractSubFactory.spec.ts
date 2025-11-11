import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { ContractSubFactory, ASSET_DEDUST, ASSET_STONFI, ASSET_TONSTAKERS, ASSET_EVAA } from '../../wrappers/v3/ContractSubFactory';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('ContractSubFactory', () => {
    let code: Cell;
    let childCode: Cell;

    beforeAll(async () => {
        code = await compileV3('ContractSubFactory');
        childCode = await compileV3('ProtocolChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let contractSubFactory: SandboxContract<ContractSubFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');

        contractSubFactory = blockchain.openContract(
            ContractSubFactory.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    productType: 4, // PRODUCT_CONTRACT
                    children: Dictionary.empty(),
                    childCodes: Dictionary.empty(),
                    totalChildrenDeployed: 0,
                    totalPoliciesCreated: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await contractSubFactory.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: contractSubFactory.address,
            deploy: true,
            success: true,
        });

        // Set child codes for main DeFi protocols (required before policy creation)
        await contractSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_DEDUST,
            childCode: childCode,
        });

        await contractSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_STONFI,
            childCode: childCode,
        });

        await contractSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_TONSTAKERS,
            childCode: childCode,
        });

        await contractSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_EVAA,
            childCode: childCode,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const masterAddr = await contractSubFactory.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await contractSubFactory.getProductType();
            expect(productType).toEqual(4); // PRODUCT_CONTRACT

            const totalChildren = await contractSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(0);

            const totalPolicies = await contractSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const version = await contractSubFactory.getVersion();
            expect(version).toEqual(3);
        });

        it('should not have any children deployed initially', async () => {
            const dedustDeployed = await contractSubFactory.isChildDeployed(ASSET_DEDUST);
            expect(dedustDeployed).toBe(false);

            const stonfiDeployed = await contractSubFactory.isChildDeployed(ASSET_STONFI);
            expect(stonfiDeployed).toBe(false);
        });

        it('should return null for non-existent child', async () => {
            const child = await contractSubFactory.getChild(ASSET_DEDUST);
            expect(child).toBeNull();
        });
    });

    describe('Policy Routing from MasterFactory', () => {
        it('should accept policy creation from master factory', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('100000')) // coverage_amount
                .storeUint(180, 32) // duration_days
                .storeCoins(toNano('50000')) // tvl_locked
                .endCell();

            const result = await contractSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_DEDUST,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: true,
            });

            const totalPolicies = await contractSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);
        });

        it('should reject policy creation from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('100000'))
                .storeUint(180, 32)
                .storeCoins(toNano('50000'))
                .endCell();

            const result = await contractSubFactory.sendCreatePolicyFromMaster(
                nonMaster.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_DEDUST,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: contractSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should route policies to correct protocol child', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Register mock children
            const dedustChild = await blockchain.treasury('dedust_child');
            const evaaChild = await blockchain.treasury('evaa_child');

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
            });

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_EVAA,
                childAddress: evaaChild.address,
            });

            // Create policy for DeDust
            const dedustParams = beginCell()
                .storeCoins(toNano('75000'))
                .storeUint(90, 32)
                .storeCoins(toNano('30000'))
                .endCell();

            const result1 = await contractSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user1.address,
                    assetId: ASSET_DEDUST,
                    policyParams: dedustParams,
                }
            );

            // Should forward to DeDust child
            expect(result1.transactions).toHaveTransaction({
                from: contractSubFactory.address,
                to: dedustChild.address,
                success: true,
            });

            // Create policy for Evaa
            const evaaParams = beginCell()
                .storeCoins(toNano('150000'))
                .storeUint(365, 32)
                .storeCoins(toNano('100000'))
                .endCell();

            const result2 = await contractSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user2.address,
                    assetId: ASSET_EVAA,
                    policyParams: evaaParams,
                }
            );

            // Should forward to Evaa child
            expect(result2.transactions).toHaveTransaction({
                from: contractSubFactory.address,
                to: evaaChild.address,
                success: true,
            });
        });

        it('should reject policy for unsupported protocol', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('100000'))
                .storeUint(180, 32)
                .storeCoins(toNano('50000'))
                .endCell();

            const result = await contractSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: 999, // Non-existent protocol
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: false,
                exitCode: 405, // err::child_not_found
            });
        });
    });

    describe('Child Contract Management', () => {
        it('should allow master factory to register child', async () => {
            const dedustChild = await blockchain.treasury('dedust_child');

            const result = await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: true,
            });

            const totalChildren = await contractSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(1);

            const deployedChild = await contractSubFactory.getChild(ASSET_DEDUST);
            expect(deployedChild?.toString()).toEqual(dedustChild.address.toString());

            const isDeployed = await contractSubFactory.isChildDeployed(ASSET_DEDUST);
            expect(isDeployed).toBe(true);
        });

        it('should allow registering multiple children', async () => {
            const dedustChild = await blockchain.treasury('dedust_child');
            const stonfiChild = await blockchain.treasury('stonfi_child');
            const tonstakersChild = await blockchain.treasury('tonstakers_child');
            const evaaChild = await blockchain.treasury('evaa_child');

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
            });

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_STONFI,
                childAddress: stonfiChild.address,
            });

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_TONSTAKERS,
                childAddress: tonstakersChild.address,
            });

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_EVAA,
                childAddress: evaaChild.address,
            });

            const totalChildren = await contractSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(4);

            const supportedCount = await contractSubFactory.getSupportedProtocols();
            expect(supportedCount).toBeGreaterThanOrEqual(4);
        });

        it('should reject child registration from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const dedustChild = await blockchain.treasury('dedust_child');

            const result = await contractSubFactory.sendRegisterChild(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: contractSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should allow updating child code', async () => {
            const newChildCode = beginCell()
                .storeUint(0xC0FFEE, 32)
                .endCell();

            const result = await contractSubFactory.sendSetChildCode(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: true,
            });
        });

        it('should reject child code update from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const newChildCode = beginCell()
                .storeUint(0xC0FFEE, 32)
                .endCell();

            const result = await contractSubFactory.sendSetChildCode(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: contractSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow master factory to pause', async () => {
            const result = await contractSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: true,
            });

            const paused = await contractSubFactory.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject operations when paused', async () => {
            await contractSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('100000'))
                .storeUint(180, 32)
                .storeCoins(toNano('50000'))
                .endCell();

            const result = await contractSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_DEDUST,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });

        it('should allow master factory to unpause', async () => {
            await contractSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));
            let paused = await contractSubFactory.getPaused();
            expect(paused).toBe(true);

            const result = await contractSubFactory.sendUnpause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: contractSubFactory.address,
                success: true,
            });

            paused = await contractSubFactory.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');

            const result = await contractSubFactory.sendPause(nonMaster.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: contractSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Protocol Support', () => {
        it('should support all defined protocols', async () => {
            const supportedCount = await contractSubFactory.getSupportedProtocols();
            expect(supportedCount).toBeGreaterThanOrEqual(4); // DeDust, STON.fi, Tonstakers, Evaa
        });

        it('should track registered protocols correctly', async () => {
            const dedustChild = await blockchain.treasury('dedust_child');
            const evaaChild = await blockchain.treasury('evaa_child');

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
            });

            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_EVAA,
                childAddress: evaaChild.address,
            });

            const dedustDeployed = await contractSubFactory.isChildDeployed(ASSET_DEDUST);
            expect(dedustDeployed).toBe(true);

            const evaaDeployed = await contractSubFactory.isChildDeployed(ASSET_EVAA);
            expect(evaaDeployed).toBe(true);

            const stonfiDeployed = await contractSubFactory.isChildDeployed(ASSET_STONFI);
            expect(stonfiDeployed).toBe(false);
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy routing', async () => {
            const dedustChild = await blockchain.treasury('dedust_child');
            await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
            });

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('100000'))
                .storeUint(180, 32)
                .storeCoins(toNano('50000'))
                .endCell();

            const result = await contractSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_DEDUST,
                    policyParams: policyParams,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy routing gas:', tx.totalFees);

            // Should be less than 0.05 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.05'));
        });

        it('should consume reasonable gas for child registration', async () => {
            const dedustChild = await blockchain.treasury('dedust_child');

            const result = await contractSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DEDUST,
                childAddress: dedustChild.address,
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
                contractSubFactory.sendRegisterChild(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_DEDUST,
                    childAddress: childAddress.address,
                }),
                contractSubFactory.sendSetChildCode(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_DEDUST,
                    childCode: childCode,
                }),
                contractSubFactory.sendPause(nonMaster.getSender(), toNano('0.05')),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: nonMaster.address,
                    to: contractSubFactory.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });

        it('should properly bounce invalid messages', async () => {
            const sender = await blockchain.treasury('sender');

            const result = await contractSubFactory.sendDeploy(sender.getSender(), toNano('0.1'));

            // Unknown operation should bounce
            expect(result.transactions).toHaveTransaction({
                from: contractSubFactory.address,
                to: sender.address,
                success: true, // Bounce is successful
            });
        });
    });
});
