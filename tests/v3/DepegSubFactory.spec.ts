import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import { DepegSubFactory, ASSET_USDT, ASSET_USDC, ASSET_DAI, ASSET_USDE } from '../../wrappers/v3/DepegSubFactory';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('DepegSubFactory', () => {
    let code: Cell;
    let childCode: Cell;

    beforeAll(async () => {
        code = await compileV3('DepegSubFactory');
        childCode = await compileV3('StablecoinChild');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let depegSubFactory: SandboxContract<DepegSubFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');

        depegSubFactory = blockchain.openContract(
            DepegSubFactory.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    productType: 1, // PRODUCT_DEPEG
                    children: Dictionary.empty(),
                    childCodes: Dictionary.empty(),
                    totalChildrenDeployed: 0,
                    totalPoliciesCreated: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await depegSubFactory.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: depegSubFactory.address,
            deploy: true,
            success: true,
        });

        // Set child codes for main stablecoins (required before policy creation)
        await depegSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_USDT,
            childCode: childCode,
        });

        await depegSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_USDC,
            childCode: childCode,
        });

        await depegSubFactory.sendSetChildCode(masterFactory.getSender(), {
            value: toNano('0.05'),
            assetId: ASSET_DAI,
            childCode: childCode,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const masterAddr = await depegSubFactory.getMasterFactory();
            expect(masterAddr.toString()).toEqual(masterFactory.address.toString());

            const productType = await depegSubFactory.getProductType();
            expect(productType).toEqual(1); // PRODUCT_DEPEG

            const totalChildren = await depegSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(0);

            const totalPolicies = await depegSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(0n);

            const version = await depegSubFactory.getVersion();
            expect(version).toEqual(3);
        });

        it('should not have any children deployed initially', async () => {
            const usdtDeployed = await depegSubFactory.isChildDeployed(ASSET_USDT);
            expect(usdtDeployed).toBe(false);

            const usdcDeployed = await depegSubFactory.isChildDeployed(ASSET_USDC);
            expect(usdcDeployed).toBe(false);
        });

        it('should return null for non-existent child', async () => {
            const child = await depegSubFactory.getChild(ASSET_USDT);
            expect(child).toBeNull();
        });
    });

    describe('Policy Routing from MasterFactory', () => {
        it('should accept policy creation from master factory', async () => {
            // Pre-register child (pre-deployment architecture)
            const usdtChild = await blockchain.treasury('usdt_child');
            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000')) // coverage_amount
                .storeUint(30, 32) // duration_days
                .storeUint(98, 16) // trigger_price (0.98)
                .endCell();

            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_USDT,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: true,
            });

            const totalPolicies = await depegSubFactory.getTotalPolicies();
            expect(totalPolicies).toEqual(1n);
        });

        it('should reject policy creation from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                nonMaster.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_USDT,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should route policies to correct stablecoin child', async () => {
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Register mock children
            const usdtChild = await blockchain.treasury('usdt_child');
            const usdcChild = await blockchain.treasury('usdc_child');

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDC,
                childAddress: usdcChild.address,
            });

            // Create policy for USDT
            const usdtParams = beginCell()
                .storeCoins(toNano('5000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            const result1 = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user1.address,
                    assetId: ASSET_USDT,
                    policyParams: usdtParams,
                }
            );

            // Should forward to USDT child
            expect(result1.transactions).toHaveTransaction({
                from: depegSubFactory.address,
                to: usdtChild.address,
                success: true,
            });

            // Create policy for USDC
            const usdcParams = beginCell()
                .storeCoins(toNano('15000'))
                .storeUint(60, 32)
                .storeUint(98, 16)
                .endCell();

            const result2 = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user2.address,
                    assetId: ASSET_USDC,
                    policyParams: usdcParams,
                }
            );

            // Should forward to USDC child
            expect(result2.transactions).toHaveTransaction({
                from: depegSubFactory.address,
                to: usdcChild.address,
                success: true,
            });
        });

        it('should reject policy for non-registered child', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            // Try to create policy without registering child first
            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_USDT, // Valid asset_id, but child not registered
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 405, // err::child_not_found - Pre-deployment architecture requires children to be registered first
            });
        });

        it('should reject policy for invalid asset_id', async () => {
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: 999, // Invalid asset_id (out of range 1-255)
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 403, // err::invalid_asset (validation fails before child lookup)
            });
        });
    });

    describe('Child Contract Management', () => {
        it('should allow master factory to register child', async () => {
            const usdtChild = await blockchain.treasury('usdt_child');

            const result = await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: true,
            });

            const totalChildren = await depegSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(1);

            const deployedChild = await depegSubFactory.getChild(ASSET_USDT);
            expect(deployedChild?.toString()).toEqual(usdtChild.address.toString());

            const isDeployed = await depegSubFactory.isChildDeployed(ASSET_USDT);
            expect(isDeployed).toBe(true);
        });

        it('should allow registering multiple children', async () => {
            const usdtChild = await blockchain.treasury('usdt_child');
            const usdcChild = await blockchain.treasury('usdc_child');
            const daiChild = await blockchain.treasury('dai_child');

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDC,
                childAddress: usdcChild.address,
            });

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_DAI,
                childAddress: daiChild.address,
            });

            const totalChildren = await depegSubFactory.getTotalChildren();
            expect(totalChildren).toEqual(3);

            const supportedCount = await depegSubFactory.getSupportedStablecoins();
            expect(supportedCount).toBeGreaterThanOrEqual(3);
        });

        it('should reject child registration from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const usdtChild = await blockchain.treasury('usdt_child');

            const result = await depegSubFactory.sendRegisterChild(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should allow updating child code', async () => {
            const newChildCode = beginCell()
                .storeUint(0xDEADBEEF, 32)
                .endCell();

            const result = await depegSubFactory.sendSetChildCode(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: true,
            });
        });

        it('should reject child code update from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');
            const newChildCode = beginCell()
                .storeUint(0xDEADBEEF, 32)
                .endCell();

            const result = await depegSubFactory.sendSetChildCode(nonMaster.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childCode: newChildCode,
            });

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow master factory to pause', async () => {
            const result = await depegSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: true,
            });

            const paused = await depegSubFactory.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject operations when paused', async () => {
            // Pre-register child
            const usdtChild = await blockchain.treasury('usdt_child');
            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            // Pause factory
            await depegSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_USDT,
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });

        it('should allow master factory to unpause', async () => {
            await depegSubFactory.sendPause(masterFactory.getSender(), toNano('0.05'));
            let paused = await depegSubFactory.getPaused();
            expect(paused).toBe(true);

            const result = await depegSubFactory.sendUnpause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: depegSubFactory.address,
                success: true,
            });

            paused = await depegSubFactory.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-master', async () => {
            const nonMaster = await blockchain.treasury('non_master');

            const result = await depegSubFactory.sendPause(nonMaster.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonMaster.address,
                to: depegSubFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Stablecoin Support', () => {
        it('should support all defined stablecoins', async () => {
            const supportedCount = await depegSubFactory.getSupportedStablecoins();
            expect(supportedCount).toBeGreaterThanOrEqual(7); // USDT, USDC, DAI, USDD, TUSD, FDUSD, USDe
        });

        it('should track registered stablecoins correctly', async () => {
            const usdtChild = await blockchain.treasury('usdt_child');
            const usdcChild = await blockchain.treasury('usdc_child');

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDC,
                childAddress: usdcChild.address,
            });

            const usdtDeployed = await depegSubFactory.isChildDeployed(ASSET_USDT);
            expect(usdtDeployed).toBe(true);

            const usdcDeployed = await depegSubFactory.isChildDeployed(ASSET_USDC);
            expect(usdcDeployed).toBe(true);

            const daiDeployed = await depegSubFactory.isChildDeployed(ASSET_DAI);
            expect(daiDeployed).toBe(false);
        });

        it('should support USDe (Ethena) for hackathon', async () => {
            // Verify USDe constant is defined
            expect(ASSET_USDE).toEqual(7);

            // Register USDe child
            const usdeChild = await blockchain.treasury('usde_child');
            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDE,
                childAddress: usdeChild.address,
            });

            // Verify registration
            const usdeDeployed = await depegSubFactory.isChildDeployed(ASSET_USDE);
            expect(usdeDeployed).toBe(true);

            const registeredChild = await depegSubFactory.getChild(ASSET_USDE);
            expect(registeredChild?.toString()).toEqual(usdeChild.address.toString());

            // Create policy for USDe
            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_USDE,
                    policyParams: policyParams,
                }
            );

            // Should forward to USDe child
            expect(result.transactions).toHaveTransaction({
                from: depegSubFactory.address,
                to: usdeChild.address,
                success: true,
            });
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy routing', async () => {
            const usdtChild = await blockchain.treasury('usdt_child');
            await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
            });

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000'))
                .storeUint(30, 32)
                .storeUint(98, 16)
                .endCell();

            const result = await depegSubFactory.sendCreatePolicyFromMaster(
                masterFactory.getSender(),
                {
                    value: toNano('1.0'),
                    userAddress: user.address,
                    assetId: ASSET_USDT,
                    policyParams: policyParams,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy routing gas:', tx.totalFees);

            // Should be less than 0.05 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.05'));
        });

        it('should consume reasonable gas for child registration', async () => {
            const usdtChild = await blockchain.treasury('usdt_child');

            const result = await depegSubFactory.sendRegisterChild(masterFactory.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                childAddress: usdtChild.address,
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
                depegSubFactory.sendRegisterChild(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_USDT,
                    childAddress: childAddress.address,
                }),
                depegSubFactory.sendSetChildCode(nonMaster.getSender(), {
                    value: toNano('0.05'),
                    assetId: ASSET_USDT,
                    childCode: childCode,
                }),
                depegSubFactory.sendPause(nonMaster.getSender(), toNano('0.05')),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: nonMaster.address,
                    to: depegSubFactory.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });

        it('should properly bounce invalid messages', async () => {
            const sender = await blockchain.treasury('sender');

            const result = await depegSubFactory.sendDeploy(sender.getSender(), toNano('0.1'));

            // Unknown operation should bounce
            expect(result.transactions).toHaveTransaction({
                from: depegSubFactory.address,
                to: sender.address,
                success: true, // Bounce is successful
            });
        });
    });
});
