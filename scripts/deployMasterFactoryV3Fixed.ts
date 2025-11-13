import { toNano, Address, Dictionary, Cell } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { MasterFactory, masterFactoryConfigToCell } from '../wrappers/v3/MasterFactory';
import * as fs from 'fs';

/**
 * Deploy V3 MasterFactory with Fixed Factory Deployment
 *
 * This deployment includes the fix for action phase error 34
 * (message format bug in factory_helpers.fc)
 */

export async function run(provider: NetworkProvider) {
    console.log('\n🔧 ===== DEPLOYING FIXED MASTERFACTORY V3 =====\n');

    const isMainnet = provider.network() === 'mainnet';
    if (isMainnet) {
        console.error('❌ This script is for TESTNET only');
        return;
    }

    const deployerAddress = provider.sender().address!;
    console.log(`📍 Deployer: ${deployerAddress.toString()}`);
    console.log(`📍 Network: TESTNET\n`);

    // ============================================================
    // COMPILE CONTRACT
    // ============================================================

    console.log('Step 1: Compiling MasterFactory (with fixes)...\n');

    const masterFactoryCode = await compile('v3/MasterFactory');
    console.log('✅ MasterFactory compiled\n');

    // ============================================================
    // PREPARE CONFIGURATION
    // ============================================================

    console.log('Step 2: Preparing contract configuration...\n');

    // Use deployer as admin
    const adminAddress = deployerAddress;

    // Null addresses for optional components (can be set later)
    const nullAddress = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const config = {
        adminAddress: adminAddress,
        gasWalletAddress: nullAddress,  // Can be set later via set_gas_wallet
        sbtVerifierAddress: nullAddress,  // Can be set later via set_sbt_verifier
        policyNFTMinterAddress: nullAddress,  // Can be set later
        vaultAddress: nullAddress,  // Can be set later via set_vault
        productFactories: Dictionary.empty<number, Address>(),  // Empty initially
        factoryCodes: Dictionary.empty<number, Cell>(),  // Will be registered after deployment
        totalPoliciesCreated: 0n,
        paused: false,  // Active by default
        requiredKycTier: 1,  // Basic KYC (tier 1)
        activePolicies: Dictionary.empty<bigint, Cell>(),  // Empty initially
        totalClaimsProcessed: 0n,
    };

    console.log('✅ Configuration:');
    console.log(`   Admin: ${adminAddress.toString()}`);
    console.log(`   Paused: ${config.paused}`);
    console.log(`   KYC Tier: ${config.requiredKycTier}`);
    console.log('   (Other addresses can be set post-deployment)\n');

    // ============================================================
    // DEPLOY CONTRACT
    // ============================================================

    console.log('Step 3: Deploying MasterFactory...\n');

    const masterFactory = MasterFactory.createFromConfig(config, masterFactoryCode);
    const masterFactoryContract = provider.open(masterFactory);

    await masterFactoryContract.sendDeploy(provider.sender(), toNano('0.5'));

    await provider.waitForDeploy(masterFactory.address, 100);

    console.log('✅ MasterFactory deployed!\n');
    console.log(`📍 Address: ${masterFactory.address.toString()}\n`);

    // ============================================================
    // SAVE DEPLOYMENT INFO
    // ============================================================

    const deploymentInfo = {
        address: masterFactory.address.toString(),
        deployedAt: new Date().toISOString(),
        network: 'testnet',
        admin: adminAddress.toString(),
        version: 'v3-fixed',
        fixes: [
            'Fixed action phase error 34 in factory_helpers.fc',
            'Corrected message format for StateInit deployment'
        ]
    };

    fs.writeFileSync(
        'build/MasterFactoryV3Fixed.deployed.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log('💾 Deployment info saved to: build/MasterFactoryV3Fixed.deployed.json\n');

    // ============================================================
    // NEXT STEPS
    // ============================================================

    console.log('━━━ NEXT STEPS ━━━\n');
    console.log('1️⃣  Register factory codes:');
    console.log('   node build-transaction-payloads.js');
    console.log('   Then use register-factory-codes.html with new address\n');
    console.log('2️⃣  Update frontend configuration:');
    console.log(`   REACT_APP_MASTER_FACTORY=${masterFactory.address.toString()}\n`);
    console.log('3️⃣  Test policy creation:');
    console.log('   Visit https://tonsurance.io and create a policy\n');
    console.log('4️⃣  Optional - Set infrastructure addresses:');
    console.log('   - set_gas_wallet');
    console.log('   - set_sbt_verifier');
    console.log('   - set_vault');
    console.log('   - set_policy_nft_minter\n');

    console.log('🎉 Deployment complete!\n');
}
