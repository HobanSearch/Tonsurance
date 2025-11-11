import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell, Dictionary } from '@ton/core';
import { MasterFactory } from '../../wrappers/v3/MasterFactory';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('MasterFactory', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('MasterFactory');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let gasWallet: SandboxContract<TreasuryContract>;
    let sbtVerifier: SandboxContract<TreasuryContract>;
    let policyNFTMinter: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<MasterFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        gasWallet = await blockchain.treasury('gas_wallet');
        sbtVerifier = await blockchain.treasury('sbt_verifier');
        policyNFTMinter = await blockchain.treasury('policy_nft_minter');
        vault = await blockchain.treasury('vault');

        masterFactory = blockchain.openContract(
            MasterFactory.createFromConfig(
                {
                    adminAddress: admin.address,
                    gasWalletAddress: gasWallet.address,
                    sbtVerifierAddress: sbtVerifier.address,
                    policyNFTMinterAddress: policyNFTMinter.address,
                    vaultAddress: vault.address,
                    productFactories: Dictionary.empty(),
                    factoryCodes: Dictionary.empty(),
                    totalPoliciesCreated: 0n,
                    paused: false,
                    requiredKycTier: 1,
                    activePolicies: Dictionary.empty(),
                    totalClaimsProcessed: 0n,
                },
                code
            )
        );

        const deployResult = await masterFactory.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterFactory.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load and save data correctly', async () => {
            const adminAddr = await masterFactory.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const gasWalletAddr = await masterFactory.getGasWallet();
            expect(gasWalletAddr.toString()).toEqual(gasWallet.address.toString());

            const sbtVerifierAddr = await masterFactory.getSBTVerifier();
            expect(sbtVerifierAddr.toString()).toEqual(sbtVerifier.address.toString());

            const policyNFTMinterAddr = await masterFactory.getPolicyNFTMinter();
            expect(policyNFTMinterAddr.toString()).toEqual(policyNFTMinter.address.toString());

            const vaultAddr = await masterFactory.getVault();
            expect(vaultAddr.toString()).toEqual(vault.address.toString());
        });

        it('should return correct initial values', async () => {
            const totalPolicies = await masterFactory.getTotalPoliciesCreated();
            expect(totalPolicies).toEqual(0n);

            const totalClaims = await masterFactory.getTotalClaimsProcessed();
            expect(totalClaims).toEqual(0n);

            const paused = await masterFactory.getPaused();
            expect(paused).toBe(false);

            const kycTier = await masterFactory.getRequiredKycTier();
            expect(kycTier).toEqual(1);

            const version = await masterFactory.getVersion();
            expect(version).toEqual(3);
        });

        it('should return false for non-deployed factories', async () => {
            const depegDeployed = await masterFactory.isFactoryDeployed(1);
            expect(depegDeployed).toBe(false);

            const bridgeDeployed = await masterFactory.isFactoryDeployed(2);
            expect(bridgeDeployed).toBe(false);
        });
    });

    describe('Admin Functions - Address Configuration', () => {
        it('should allow admin to set gas wallet address', async () => {
            const newGasWallet = await blockchain.treasury('new_gas_wallet');

            const result = await masterFactory.sendSetGasWallet(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    gasWalletAddress: newGasWallet.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const updatedGasWallet = await masterFactory.getGasWallet();
            expect(updatedGasWallet.toString()).toEqual(newGasWallet.address.toString());
        });

        it('should allow admin to set SBT verifier address', async () => {
            const newSBTVerifier = await blockchain.treasury('new_sbt_verifier');

            const result = await masterFactory.sendSetSBTVerifier(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    sbtVerifierAddress: newSBTVerifier.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const updatedSBTVerifier = await masterFactory.getSBTVerifier();
            expect(updatedSBTVerifier.toString()).toEqual(newSBTVerifier.address.toString());
        });

        it('should allow admin to set policy NFT minter address', async () => {
            const newNFTMinter = await blockchain.treasury('new_nft_minter');

            const result = await masterFactory.sendSetPolicyNFTMinter(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    policyNFTMinterAddress: newNFTMinter.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const updatedNFTMinter = await masterFactory.getPolicyNFTMinter();
            expect(updatedNFTMinter.toString()).toEqual(newNFTMinter.address.toString());
        });

        it('should allow admin to set vault address', async () => {
            const newVault = await blockchain.treasury('new_vault');

            const result = await masterFactory.sendSetVault(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    vaultAddress: newVault.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const updatedVault = await masterFactory.getVault();
            expect(updatedVault.toString()).toEqual(newVault.address.toString());
        });

        it('should allow admin to set required KYC tier', async () => {
            const result = await masterFactory.sendSetRequiredKycTier(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    requiredKycTier: 2,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const updatedTier = await masterFactory.getRequiredKycTier();
            expect(updatedTier).toEqual(2);
        });

        it('should reject address updates from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newGasWallet = await blockchain.treasury('new_gas_wallet');

            const result = await masterFactory.sendSetGasWallet(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    gasWalletAddress: newGasWallet.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: masterFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Factory Management', () => {
        it('should allow admin to register product factory', async () => {
            const depegFactory = await blockchain.treasury('depeg_factory');

            const result = await masterFactory.sendRegisterProductFactory(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    productType: 1, // DEPEG
                    factoryAddress: depegFactory.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const isDeployed = await masterFactory.isFactoryDeployed(1);
            expect(isDeployed).toBe(true);

            const factoryAddr = await masterFactory.getProductFactory(1);
            expect(factoryAddr?.toString()).toEqual(depegFactory.address.toString());
        });

        it('should allow admin to set factory code', async () => {
            const factoryCode = beginCell().endCell(); // Dummy code

            const result = await masterFactory.sendSetFactoryCode(
                admin.getSender(),
                {
                    value: toNano('0.05'),
                    productType: 1, // DEPEG
                    factoryCode: factoryCode,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });
        });

        it('should reject factory registration from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const depegFactory = await blockchain.treasury('depeg_factory');

            const result = await masterFactory.sendRegisterProductFactory(
                nonAdmin.getSender(),
                {
                    value: toNano('0.05'),
                    productType: 1,
                    factoryAddress: depegFactory.address,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: masterFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow admin to pause the factory', async () => {
            const result = await masterFactory.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            const paused = await masterFactory.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause the factory', async () => {
            // First pause
            await masterFactory.sendPause(admin.getSender(), toNano('0.05'));
            let paused = await masterFactory.getPaused();
            expect(paused).toBe(true);

            // Then unpause
            const result = await masterFactory.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: masterFactory.address,
                success: true,
            });

            paused = await masterFactory.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await masterFactory.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: masterFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject policy creation when paused', async () => {
            // Pause the factory
            await masterFactory.sendPause(admin.getSender(), toNano('0.05'));

            const user = await blockchain.treasury('user');
            const policyParams = beginCell()
                .storeCoins(toNano('10000')) // coverage_amount
                .storeUint(30, 16) // duration_days
                .endCell();

            const result = await masterFactory.sendCreatePolicy(
                user.getSender(),
                {
                    value: toNano('0.5'),
                    productType: 1, // DEPEG
                    assetId: 1, // USDT
                    policyParams: policyParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: masterFactory.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Policy Registry', () => {
        it('should allow child contract to register policy', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            const result = await masterFactory.sendRegisterPolicy(
                childContract.getSender(),
                {
                    value: toNano('0.05'),
                    policyId: 1n,
                    productType: 1, // DEPEG
                    assetId: 1, // USDT
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 days
                    childAddress: childContract.address,
                    triggerParam1: 980000, // $0.98
                    triggerParam2: 3600, // 1 hour
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: childContract.address,
                to: masterFactory.address,
                success: true,
            });

            // Verify policy is registered
            const hasPolicy = await masterFactory.hasPolicy(1n);
            expect(hasPolicy).toBe(true);

            const policy = await masterFactory.getPolicy(1n);
            expect(policy).not.toBeNull();
            expect(policy?.productType).toEqual(1);
            expect(policy?.assetId).toEqual(1);
            expect(policy?.userAddress?.toString()).toEqual(user.address.toString());
            expect(policy?.coverage).toEqual(toNano('10000'));
            expect(policy?.claimed).toBe(false);
        });

        it('should return null for non-existent policy', async () => {
            const policy = await masterFactory.getPolicy(999n);
            expect(policy).toBeNull();

            const hasPolicy = await masterFactory.hasPolicy(999n);
            expect(hasPolicy).toBe(false);
        });

        it('should allow registering multiple policies', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user1 = await blockchain.treasury('user1');
            const user2 = await blockchain.treasury('user2');

            // Register policy 1
            await masterFactory.sendRegisterPolicy(
                childContract.getSender(),
                {
                    value: toNano('0.05'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user1.address,
                    coverageAmount: toNano('5000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 30 * 86400,
                    childAddress: childContract.address,
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            // Register policy 2
            await masterFactory.sendRegisterPolicy(
                childContract.getSender(),
                {
                    value: toNano('0.05'),
                    policyId: 2n,
                    productType: 2, // BRIDGE
                    assetId: 1,
                    userAddress: user2.address,
                    coverageAmount: toNano('15000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 60 * 86400,
                    childAddress: childContract.address,
                    triggerParam1: 0,
                    triggerParam2: 86400,
                }
            );

            // Verify both policies exist
            expect(await masterFactory.hasPolicy(1n)).toBe(true);
            expect(await masterFactory.hasPolicy(2n)).toBe(true);

            const policy1 = await masterFactory.getPolicy(1n);
            expect(policy1?.productType).toEqual(1);
            expect(policy1?.coverage).toEqual(toNano('5000'));

            const policy2 = await masterFactory.getPolicy(2n);
            expect(policy2?.productType).toEqual(2);
            expect(policy2?.coverage).toEqual(toNano('15000'));
        });
    });

    describe('Claim Processing', () => {
        beforeEach(async () => {
            // Register a policy first
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            await masterFactory.sendRegisterPolicy(
                childContract.getSender(),
                {
                    value: toNano('0.05'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 30 * 86400,
                    childAddress: childContract.address,
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );
        });

        it('should allow child contract to process claim', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            const result = await masterFactory.sendProcessClaim(
                childContract.getSender(),
                {
                    value: toNano('0.15'), // Includes vault withdrawal gas
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    triggerPrice: 970000, // $0.97 (triggered)
                    triggerTimestamp: Math.floor(Date.now() / 1000),
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: childContract.address,
                to: masterFactory.address,
                success: true,
            });

            // Verify claim was sent to vault
            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: vault.address,
                success: true,
            });

            // Verify policy is marked as claimed
            const policy = await masterFactory.getPolicy(1n);
            expect(policy?.claimed).toBe(true);

            // Verify claim counter incremented
            const totalClaims = await masterFactory.getTotalClaimsProcessed();
            expect(totalClaims).toEqual(1n);
        });

        it('should reject claim from non-child contract', async () => {
            const attacker = await blockchain.treasury('attacker');
            const user = await blockchain.treasury('user');

            const result = await masterFactory.sendProcessClaim(
                attacker.getSender(),
                {
                    value: toNano('0.15'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    triggerPrice: 970000,
                    triggerTimestamp: Math.floor(Date.now() / 1000),
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: attacker.address,
                to: masterFactory.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject duplicate claim for same policy', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            // First claim (should succeed)
            await masterFactory.sendProcessClaim(
                childContract.getSender(),
                {
                    value: toNano('0.15'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    triggerPrice: 970000,
                    triggerTimestamp: Math.floor(Date.now() / 1000),
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            // Second claim (should fail)
            const result = await masterFactory.sendProcessClaim(
                childContract.getSender(),
                {
                    value: toNano('0.15'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    triggerPrice: 970000,
                    triggerTimestamp: Math.floor(Date.now() / 1000),
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: childContract.address,
                to: masterFactory.address,
                success: false,
                exitCode: 408, // err::policy_already_claimed
            });
        });

        it('should reject claim for non-existent policy', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            const result = await masterFactory.sendProcessClaim(
                childContract.getSender(),
                {
                    value: toNano('0.15'),
                    policyId: 999n, // Non-existent
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    triggerPrice: 970000,
                    triggerTimestamp: Math.floor(Date.now() / 1000),
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: childContract.address,
                to: masterFactory.address,
                success: false,
                exitCode: 407, // err::policy_not_found
            });
        });
    });

    describe('Gas Costs', () => {
        it('should consume reasonable gas for policy registration', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            const result = await masterFactory.sendRegisterPolicy(
                childContract.getSender(),
                {
                    value: toNano('0.05'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 30 * 86400,
                    childAddress: childContract.address,
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            const tx = result.transactions[1];
            console.log('Policy registration gas:', tx.totalFees);

            // Should be less than 0.01 TON
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.01'));
        });

        it('should consume reasonable gas for claim processing', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const user = await blockchain.treasury('user');

            // Register policy first
            await masterFactory.sendRegisterPolicy(
                childContract.getSender(),
                {
                    value: toNano('0.05'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 30 * 86400,
                    childAddress: childContract.address,
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            // Process claim
            const result = await masterFactory.sendProcessClaim(
                childContract.getSender(),
                {
                    value: toNano('0.15'),
                    policyId: 1n,
                    productType: 1,
                    assetId: 1,
                    userAddress: user.address,
                    coverageAmount: toNano('10000'),
                    triggerPrice: 970000,
                    triggerTimestamp: Math.floor(Date.now() / 1000),
                    triggerParam1: 980000,
                    triggerParam2: 3600,
                }
            );

            const tx = result.transactions[1];
            console.log('Claim processing gas:', tx.totalFees);

            // Should be less than 0.015 TON (excluding vault withdrawal)
            expect(tx.totalFees.coins).toBeLessThan(toNano('0.015'));
        });
    });
});
