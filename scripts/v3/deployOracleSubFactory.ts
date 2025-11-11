import { toNano, Address, Dictionary } from '@ton/core';
import { OracleSubFactory, ASSET_REDSTONE, ASSET_PYTH, ASSET_CHAINLINK, ASSET_DIA } from '../../wrappers/v3/OracleSubFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for OracleSubFactory V3
 *
 * Purpose: Deploy oracle failure insurance sub-factory for policy routing
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Routes oracle failure policies to provider-specific child contracts
 * - Supports 4 major oracle providers (RedStone, Pyth, Chainlink, DIA)
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
 * 2. Deploy and register child contracts for each oracle provider
 * 3. Set child codes for future deployments
 * 4. Test policy routing flow
 */

export async function run(provider: NetworkProvider) {
    console.log('=== OracleSubFactory V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the OracleSubFactory contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling OracleSubFactory...');
    const code = await compile('OracleSubFactory');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    console.log('\nConfiguration:');
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  Product Type: 3 (PRODUCT_ORACLE)`);
    console.log(`  Supported Oracle Providers: 4`);
    console.log(`    - RedStone Oracle (asset_id: ${ASSET_REDSTONE})`);
    console.log(`    - Pyth Network (asset_id: ${ASSET_PYTH})`);
    console.log(`    - Chainlink (asset_id: ${ASSET_CHAINLINK})`);
    console.log(`    - DIA Data (asset_id: ${ASSET_DIA})`);

    // Step 3: Deploy OracleSubFactory
    console.log('\nStep 3: Deploying OracleSubFactory...');

    const oracleSubFactory = provider.open(
        OracleSubFactory.createFromConfig(
            {
                masterFactoryAddress: masterFactoryAddress,
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

    await oracleSubFactory.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(oracleSubFactory.address);
    console.log(`✓ OracleSubFactory deployed: ${oracleSubFactory.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedMaster = await oracleSubFactory.getMasterFactory();
    const productType = await oracleSubFactory.getProductType();
    const totalChildren = await oracleSubFactory.getTotalChildren();
    const totalPolicies = await oracleSubFactory.getTotalPolicies();
    const paused = await oracleSubFactory.getPaused();
    const supportedOracles = await oracleSubFactory.getSupportedOracles();
    const version = await oracleSubFactory.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    MasterFactory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Total Children: ${totalChildren}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Supported Oracles: ${supportedOracles}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (productType !== 3) throw new Error('Product type should be 3 (ORACLE)!');
    if (totalChildren !== 0) throw new Error('Total children should be 0!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (supportedOracles < 4) throw new Error('Should support at least 4 oracle providers!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        oracleSubFactory: {
            address: oracleSubFactory.address.toString(),
            masterFactory: masterFactoryAddress.toString(),
            productType: 3,
            supportedOracles: [
                { name: 'RedStone Oracle', assetId: ASSET_REDSTONE },
                { name: 'Pyth Network', assetId: ASSET_PYTH },
                { name: 'Chainlink', assetId: ASSET_CHAINLINK },
                { name: 'DIA Data', assetId: ASSET_DIA },
            ],
            version: 3,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/oracle-sub-factory-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('OracleSubFactory V3:', oracleSubFactory.address.toString());

    console.log('\nAdd to .env:');
    console.log(`ORACLE_SUB_FACTORY_V3_ADDRESS=${oracleSubFactory.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "factories": {`);
    console.log(`    "oracleSubFactory": {`);
    console.log(`      "address": "${oracleSubFactory.address.toString()}",`);
    console.log(`      "productType": 3,`);
    console.log(`      "description": "Oracle failure insurance sub-factory"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register factory with MasterFactory:');
        console.log(`   masterFactory.sendRegisterProductFactory(admin, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     productType: 3,`);
        console.log(`     factoryAddress: '${oracleSubFactory.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Deploy and register child contracts for each oracle provider:');
        console.log('   a) Compile OracleChild contract');
        console.log('   b) For each oracle (RedStone, Pyth, Chainlink, DIA):');
        console.log('      - Deploy child contract');
        console.log('      - Register with: oracleSubFactory.sendRegisterChild(masterFactory, {');
        console.log('          value: toNano("0.1"),');
        console.log('          assetId: ASSET_REDSTONE,');
        console.log('          childAddress: redstoneChildAddress');
        console.log('        })');
        console.log('3. Set child codes for future deployments:');
        console.log('   oracleSubFactory.sendSetChildCode(masterFactory, {');
        console.log('     value: toNano("0.1"),');
        console.log('     assetId: ASSET_REDSTONE,');
        console.log('     childCode: compiledChildCode');
        console.log('   })');
        console.log('4. Test policy routing from MasterFactory');
        console.log('5. Verify gas costs (<0.05 TON per routing)');
        console.log('6. Monitor policy creation events');
    } else {
        console.log('1. Run tests: npx jest tests/v3/OracleSubFactory.spec.ts');
        console.log('2. Register with MasterFactory (if deployed)');
        console.log('3. Deploy child contracts for each oracle provider:');
        console.log('   - OracleChild contracts for RedStone, Pyth, Chainlink, DIA');
        console.log('4. Register children with factory:');
        console.log('   await oracleSubFactory.sendRegisterChild(masterFactory, { assetId, childAddress })');
        console.log('5. Test policy creation flow:');
        console.log('   MasterFactory → OracleSubFactory → OracleChild');
        console.log('6. Test pause/unpause controls');
        console.log('7. Verify child code updates work correctly');
        console.log('8. Deploy to mainnet when ready');
    }

    console.log('\nPolicy Routing Flow:');
    console.log('  1. User creates oracle failure policy via MasterFactory');
    console.log('  2. MasterFactory calls OracleSubFactory.create_policy_from_master()');
    console.log('  3. OracleSubFactory routes to appropriate OracleChild based on asset_id');
    console.log('  4. OracleChild creates policy and mints NFT');
    console.log('  5. Policy activated, premium sent to Float');

    console.log('\nSupported Oracle Provider Coverage:');
    console.log(`  ✓ RedStone Oracle (Real-time price feeds) - asset_id: ${ASSET_REDSTONE}`);
    console.log(`  ✓ Pyth Network (Low-latency oracles) - asset_id: ${ASSET_PYTH}`);
    console.log(`  ✓ Chainlink (Decentralized oracles) - asset_id: ${ASSET_CHAINLINK}`);
    console.log(`  ✓ DIA Data (Open-source oracles) - asset_id: ${ASSET_DIA}`);

    console.log('\nUse Cases:');
    console.log('  ✓ Protect against oracle downtime');
    console.log('  ✓ Coverage for stale price data');
    console.log('  ✓ Compensation for oracle manipulation');
    console.log('  ✓ DeFi protocol protection from bad oracle data');

    console.log('\nManagement Commands:');
    console.log('// Register child contract');
    console.log('await oracleSubFactory.sendRegisterChild(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_REDSTONE,');
    console.log('  childAddress: redstoneChildAddress');
    console.log('})');
    console.log('\n// Update child code');
    console.log('await oracleSubFactory.sendSetChildCode(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_REDSTONE,');
    console.log('  childCode: newChildCode');
    console.log('})');
    console.log('\n// Pause factory');
    console.log('await oracleSubFactory.sendPause(masterFactory, toNano("0.05"))');
    console.log('\n// Check child status');
    console.log('const isDeployed = await oracleSubFactory.isChildDeployed(ASSET_REDSTONE)');
    console.log('const childAddress = await oracleSubFactory.getChild(ASSET_REDSTONE)');
}
