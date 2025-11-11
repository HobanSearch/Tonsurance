import { toNano, Address, Dictionary } from '@ton/core';
import { DepegSubFactory, ASSET_USDT, ASSET_USDC, ASSET_DAI, ASSET_USDD, ASSET_TUSD, ASSET_FDUSD } from '../../wrappers/v3/DepegSubFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for DepegSubFactory V3
 *
 * Purpose: Deploy stablecoin depeg insurance sub-factory for policy routing
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Routes depeg policies to asset-specific child contracts
 * - Supports 6 major stablecoins (USDT, USDC, DAI, USDD, TUSD, FDUSD)
 * - Dynamic child contract deployment and code management
 * - Policy creation forwarding from MasterFactory
 * - Admin pause controls
 *
 * Requirements:
 * - MasterFactory address (for authorization)
 * - Child contract codes (deployed separately)
 *
 * Post-Deployment:
 * 1. Register this factory with MasterFactory
 * 2. Deploy and register child contracts for each stablecoin
 * 3. Set child codes for future deployments
 * 4. Test policy routing flow
 */

export async function run(provider: NetworkProvider) {
    console.log('=== DepegSubFactory V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the DepegSubFactory contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling DepegSubFactory...');
    const code = await compile('DepegSubFactory');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    console.log('\nConfiguration:');
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  Product Type: 1 (PRODUCT_DEPEG)`);
    console.log(`  Supported Stablecoins: 6`);
    console.log(`    - USDT (asset_id: ${ASSET_USDT})`);
    console.log(`    - USDC (asset_id: ${ASSET_USDC})`);
    console.log(`    - DAI (asset_id: ${ASSET_DAI})`);
    console.log(`    - USDD (asset_id: ${ASSET_USDD})`);
    console.log(`    - TUSD (asset_id: ${ASSET_TUSD})`);
    console.log(`    - FDUSD (asset_id: ${ASSET_FDUSD})`);

    // Step 3: Deploy DepegSubFactory
    console.log('\nStep 3: Deploying DepegSubFactory...');

    const depegSubFactory = provider.open(
        DepegSubFactory.createFromConfig(
            {
                masterFactoryAddress: masterFactoryAddress,
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

    await depegSubFactory.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(depegSubFactory.address);
    console.log(`✓ DepegSubFactory deployed: ${depegSubFactory.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedMaster = await depegSubFactory.getMasterFactory();
    const productType = await depegSubFactory.getProductType();
    const totalChildren = await depegSubFactory.getTotalChildren();
    const totalPolicies = await depegSubFactory.getTotalPolicies();
    const paused = await depegSubFactory.getPaused();
    const supportedStablecoins = await depegSubFactory.getSupportedStablecoins();
    const version = await depegSubFactory.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    MasterFactory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Total Children: ${totalChildren}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Supported Stablecoins: ${supportedStablecoins}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (productType !== 1) throw new Error('Product type should be 1 (DEPEG)!');
    if (totalChildren !== 0) throw new Error('Total children should be 0!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (supportedStablecoins < 6) throw new Error('Should support at least 6 stablecoins!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        depegSubFactory: {
            address: depegSubFactory.address.toString(),
            masterFactory: masterFactoryAddress.toString(),
            productType: 1,
            supportedStablecoins: [
                { name: 'USDT', assetId: ASSET_USDT },
                { name: 'USDC', assetId: ASSET_USDC },
                { name: 'DAI', assetId: ASSET_DAI },
                { name: 'USDD', assetId: ASSET_USDD },
                { name: 'TUSD', assetId: ASSET_TUSD },
                { name: 'FDUSD', assetId: ASSET_FDUSD },
            ],
            version: 3,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/depeg-sub-factory-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('DepegSubFactory V3:', depegSubFactory.address.toString());

    console.log('\nAdd to .env:');
    console.log(`DEPEG_SUB_FACTORY_V3_ADDRESS=${depegSubFactory.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "factories": {`);
    console.log(`    "depegSubFactory": {`);
    console.log(`      "address": "${depegSubFactory.address.toString()}",`);
    console.log(`      "productType": 1,`);
    console.log(`      "description": "Stablecoin depeg insurance sub-factory"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register factory with MasterFactory:');
        console.log(`   masterFactory.sendRegisterProductFactory(admin, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     productType: 1,`);
        console.log(`     factoryAddress: '${depegSubFactory.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Deploy and register child contracts for each stablecoin:');
        console.log('   a) Compile StablecoinChild contract');
        console.log('   b) For each stablecoin (USDT, USDC, DAI, etc.):');
        console.log('      - Deploy child contract');
        console.log('      - Register with: depegSubFactory.sendRegisterChild(masterFactory, {');
        console.log('          value: toNano("0.1"),');
        console.log('          assetId: ASSET_USDT,');
        console.log('          childAddress: usdtChildAddress');
        console.log('        })');
        console.log('3. Set child codes for future deployments:');
        console.log('   depegSubFactory.sendSetChildCode(masterFactory, {');
        console.log('     value: toNano("0.1"),');
        console.log('     assetId: ASSET_USDT,');
        console.log('     childCode: compiledChildCode');
        console.log('   })');
        console.log('4. Test policy routing from MasterFactory');
        console.log('5. Verify gas costs (<0.05 TON per routing)');
        console.log('6. Monitor policy creation events');
    } else {
        console.log('1. Run tests: npx jest tests/v3/DepegSubFactory.spec.ts');
        console.log('2. Register with MasterFactory (if deployed)');
        console.log('3. Deploy child contracts for each stablecoin:');
        console.log('   - StablecoinChild contracts for USDT, USDC, DAI, etc.');
        console.log('4. Register children with factory:');
        console.log('   await depegSubFactory.sendRegisterChild(masterFactory, { assetId, childAddress })');
        console.log('5. Test policy creation flow:');
        console.log('   MasterFactory → DepegSubFactory → StablecoinChild');
        console.log('6. Test pause/unpause controls');
        console.log('7. Verify child code updates work correctly');
        console.log('8. Deploy to mainnet when ready');
    }

    console.log('\nPolicy Routing Flow:');
    console.log('  1. User creates depeg policy via MasterFactory');
    console.log('  2. MasterFactory calls DepegSubFactory.create_policy_from_master()');
    console.log('  3. DepegSubFactory routes to appropriate StablecoinChild based on asset_id');
    console.log('  4. StablecoinChild creates policy and mints NFT');
    console.log('  5. Policy activated, premium sent to Float');

    console.log('\nSupported Stablecoin Coverage:');
    console.log(`  ✓ USDT (Tether) - asset_id: ${ASSET_USDT}`);
    console.log(`  ✓ USDC (USD Coin) - asset_id: ${ASSET_USDC}`);
    console.log(`  ✓ DAI (MakerDAO) - asset_id: ${ASSET_DAI}`);
    console.log(`  ✓ USDD (Tron) - asset_id: ${ASSET_USDD}`);
    console.log(`  ✓ TUSD (TrueUSD) - asset_id: ${ASSET_TUSD}`);
    console.log(`  ✓ FDUSD (First Digital) - asset_id: ${ASSET_FDUSD}`);

    console.log('\nManagement Commands:');
    console.log('// Register child contract');
    console.log('await depegSubFactory.sendRegisterChild(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_USDT,');
    console.log('  childAddress: usdtChildAddress');
    console.log('})');
    console.log('\n// Update child code');
    console.log('await depegSubFactory.sendSetChildCode(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_USDT,');
    console.log('  childCode: newChildCode');
    console.log('})');
    console.log('\n// Pause factory');
    console.log('await depegSubFactory.sendPause(masterFactory, toNano("0.05"))');
    console.log('\n// Check child status');
    console.log('const isDeployed = await depegSubFactory.isChildDeployed(ASSET_USDT)');
    console.log('const childAddress = await depegSubFactory.getChild(ASSET_USDT)');
}
