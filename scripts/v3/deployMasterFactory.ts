import { toNano, Address, Dictionary } from '@ton/core';
import { MasterFactory } from '../../wrappers/v3/MasterFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for MasterFactory V3
 *
 * Purpose: Deploy the central policy routing and claim coordination contract
 * Network: Testnet/Mainnet
 *
 * Requirements:
 * - Admin wallet (for contract management)
 * - GasWallet address (for DoS protection)
 * - SBTVerifier address (for KYC checks)
 * - PolicyNFTMinter address (for policy certificates)
 * - MultiTrancheVault address (for claim payouts)
 *
 * Post-Deployment:
 * 1. Register product factory codes (op::set_factory_code)
 * 2. Configure KYC requirements (op::set_required_kyc_tier)
 * 3. Deploy sub-factories (DepegSubFactory, BridgeSubFactory, etc.)
 * 4. Test policy routing flow
 */

export async function run(provider: NetworkProvider) {
    console.log('=== MasterFactory V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the MasterFactory contract');
        console.warn('⚠️  Estimated cost: ~1 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling MasterFactory...');
    const code = await compile('MasterFactory');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const gasWalletStr = await provider.ui().input('Enter GasWallet address (or press Enter to use deployer):');
    const gasWalletAddress = gasWalletStr
        ? Address.parse(gasWalletStr)
        : provider.sender().address;

    const sbtVerifierStr = await provider.ui().input('Enter SBTVerifier address (or press Enter for placeholder):');
    const sbtVerifierAddress = sbtVerifierStr
        ? Address.parse(sbtVerifierStr)
        : Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const policyNFTMinterStr = await provider.ui().input('Enter PolicyNFTMinter address (or press Enter for placeholder):');
    const policyNFTMinterAddress = policyNFTMinterStr
        ? Address.parse(policyNFTMinterStr)
        : Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address (or press Enter for placeholder):');
    const vaultAddress = vaultStr
        ? Address.parse(vaultStr)
        : Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const kycTierStr = await provider.ui().input('Enter required KYC tier (1=Basic, 2=Standard, 3=Enhanced) [default: 1]:');
    const requiredKycTier = kycTierStr ? parseInt(kycTierStr) : 1;

    console.log('\nConfiguration:');
    console.log(`  Admin: ${adminAddress.toString()}`);
    console.log(`  GasWallet: ${gasWalletAddress.toString()}`);
    console.log(`  SBTVerifier: ${sbtVerifierAddress.toString()}`);
    console.log(`  PolicyNFTMinter: ${policyNFTMinterAddress.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  Required KYC Tier: ${requiredKycTier}\n`);

    // Step 3: Deploy MasterFactory
    console.log('Step 3: Deploying MasterFactory...');

    const masterFactory = provider.open(
        MasterFactory.createFromConfig(
            {
                adminAddress: adminAddress,
                gasWalletAddress: gasWalletAddress,
                sbtVerifierAddress: sbtVerifierAddress,
                policyNFTMinterAddress: policyNFTMinterAddress,
                vaultAddress: vaultAddress,
                productFactories: Dictionary.empty(),
                factoryCodes: Dictionary.empty(),
                totalPoliciesCreated: 0n,
                paused: false,
                requiredKycTier: requiredKycTier,
                activePolicies: Dictionary.empty(),
                totalClaimsProcessed: 0n,
            },
            code
        )
    );

    await masterFactory.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(masterFactory.address);
    console.log(`✓ MasterFactory deployed: ${masterFactory.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await masterFactory.getAdmin();
    const deployedGasWallet = await masterFactory.getGasWallet();
    const deployedSBTVerifier = await masterFactory.getSBTVerifier();
    const deployedNFTMinter = await masterFactory.getPolicyNFTMinter();
    const deployedVault = await masterFactory.getVault();
    const deployedKycTier = await masterFactory.getRequiredKycTier();
    const version = await masterFactory.getVersion();
    const paused = await masterFactory.getPaused();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    GasWallet: ${deployedGasWallet.toString()}`);
    console.log(`    SBTVerifier: ${deployedSBTVerifier.toString()}`);
    console.log(`    PolicyNFTMinter: ${deployedNFTMinter.toString()}`);
    console.log(`    Vault: ${deployedVault.toString()}`);
    console.log(`    Required KYC Tier: ${deployedKycTier}`);
    console.log(`    Version: ${version}`);
    console.log(`    Paused: ${paused}`);

    // Verify addresses match
    if (!deployedAdmin.equals(adminAddress)) throw new Error('Admin address mismatch!');
    if (!deployedGasWallet.equals(gasWalletAddress)) throw new Error('GasWallet address mismatch!');
    if (!deployedSBTVerifier.equals(sbtVerifierAddress)) throw new Error('SBTVerifier address mismatch!');
    if (!deployedNFTMinter.equals(policyNFTMinterAddress)) throw new Error('PolicyNFTMinter address mismatch!');
    if (!deployedVault.equals(vaultAddress)) throw new Error('Vault address mismatch!');
    if (deployedKycTier !== requiredKycTier) throw new Error('KYC tier mismatch!');
    if (version !== 3) throw new Error('Version mismatch!');
    if (paused !== false) throw new Error('Contract should not be paused!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Check product factories
    console.log('Step 5: Checking product factories...');
    const productTypes = [
        { id: 1, name: 'DEPEG' },
        { id: 2, name: 'BRIDGE' },
        { id: 3, name: 'ORACLE' },
        { id: 4, name: 'CONTRACT' },
    ];

    for (const product of productTypes) {
        const isDeployed = await masterFactory.isFactoryDeployed(product.id);
        console.log(`  ${product.name} (type ${product.id}): ${isDeployed ? '✓ Deployed' : '✗ Not deployed'}`);
    }

    console.log('\n');

    // Step 6: Save deployment manifest
    console.log('Step 6: Saving deployment manifest...');
    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        masterFactory: {
            address: masterFactory.address.toString(),
            admin: adminAddress.toString(),
            gasWallet: gasWalletAddress.toString(),
            sbtVerifier: sbtVerifierAddress.toString(),
            policyNFTMinter: policyNFTMinterAddress.toString(),
            vault: vaultAddress.toString(),
            requiredKycTier: requiredKycTier,
            version: 3,
        },
        productFactories: productTypes.map(p => ({
            type: p.id,
            name: p.name,
            deployed: false,
            address: null,
        })),
    };

    const fs = require('fs');
    const manifestPath = `./deployments/master-factory-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 7: Output
    console.log('=== Deployment Complete ===\n');
    console.log('MasterFactory V3:', masterFactory.address.toString());

    console.log('\nAdd to .env:');
    console.log(`MASTER_FACTORY_V3_ADDRESS=${masterFactory.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "core": {`);
    console.log(`    "masterFactory": {`);
    console.log(`      "address": "${masterFactory.address.toString()}",`);
    console.log(`      "admin": "${adminAddress.toString()}",`);
    console.log(`      "version": 3`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register product factory codes (use sendSetFactoryCode)');
        console.log('2. Deploy product sub-factories (DepegSubFactory, BridgeSubFactory, etc.)');
        console.log('3. Register deployed factories (use sendRegisterProductFactory)');
        console.log('4. Configure KYC requirements if needed');
        console.log('5. Test policy routing flow with small amounts');
        console.log('6. Monitor logs for PolicyRouted events');
    } else {
        console.log('1. Run tests: npx jest tests/v3/MasterFactory.spec.ts');
        console.log('2. Register factory codes for all 4 product types');
        console.log('3. Deploy product sub-factories');
        console.log('4. Test policy creation flow');
        console.log('5. Test claim processing flow');
        console.log('6. Verify gas costs (<0.045 TON per policy)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nProduct Types:');
    console.log('  1. DEPEG - Stablecoin depeg insurance');
    console.log('  2. BRIDGE - Bridge failure insurance');
    console.log('  3. ORACLE - Oracle failure insurance');
    console.log('  4. CONTRACT - Smart contract exploit insurance');

    console.log('\nTarget Shards (for optimal routing):');
    console.log('  DEPEG: 0x10');
    console.log('  BRIDGE: 0x20');
    console.log('  ORACLE: 0x30');
    console.log('  CONTRACT: 0x40');
}
