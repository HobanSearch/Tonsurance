import { toNano, Address, Dictionary } from '@ton/core';
import { BridgeSubFactory, ASSET_TON_BRIDGE, ASSET_ORBIT_BRIDGE, ASSET_WORMHOLE, ASSET_AXELAR } from '../../wrappers/v3/BridgeSubFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for BridgeSubFactory V3
 *
 * Purpose: Deploy bridge failure insurance sub-factory for policy routing
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Routes bridge failure policies to bridge-specific child contracts
 * - Supports 4 major bridges (TON Bridge, Orbit, Wormhole, Axelar)
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
 * 2. Deploy and register child contracts for each bridge
 * 3. Set child codes for future deployments
 * 4. Test policy routing flow
 */

export async function run(provider: NetworkProvider) {
    console.log('=== BridgeSubFactory V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the BridgeSubFactory contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling BridgeSubFactory...');
    const code = await compile('BridgeSubFactory');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    console.log('\nConfiguration:');
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  Product Type: 2 (PRODUCT_BRIDGE)`);
    console.log(`  Supported Bridges: 4`);
    console.log(`    - TON Bridge (asset_id: ${ASSET_TON_BRIDGE})`);
    console.log(`    - Orbit Bridge (asset_id: ${ASSET_ORBIT_BRIDGE})`);
    console.log(`    - Wormhole (asset_id: ${ASSET_WORMHOLE})`);
    console.log(`    - Axelar Network (asset_id: ${ASSET_AXELAR})`);

    // Step 3: Deploy BridgeSubFactory
    console.log('\nStep 3: Deploying BridgeSubFactory...');

    const bridgeSubFactory = provider.open(
        BridgeSubFactory.createFromConfig(
            {
                masterFactoryAddress: masterFactoryAddress,
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

    await bridgeSubFactory.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(bridgeSubFactory.address);
    console.log(`✓ BridgeSubFactory deployed: ${bridgeSubFactory.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedMaster = await bridgeSubFactory.getMasterFactory();
    const productType = await bridgeSubFactory.getProductType();
    const totalChildren = await bridgeSubFactory.getTotalChildren();
    const totalPolicies = await bridgeSubFactory.getTotalPolicies();
    const paused = await bridgeSubFactory.getPaused();
    const supportedBridges = await bridgeSubFactory.getSupportedBridges();
    const version = await bridgeSubFactory.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    MasterFactory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Total Children: ${totalChildren}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Supported Bridges: ${supportedBridges}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (productType !== 2) throw new Error('Product type should be 2 (BRIDGE)!');
    if (totalChildren !== 0) throw new Error('Total children should be 0!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (supportedBridges < 4) throw new Error('Should support at least 4 bridges!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        bridgeSubFactory: {
            address: bridgeSubFactory.address.toString(),
            masterFactory: masterFactoryAddress.toString(),
            productType: 2,
            supportedBridges: [
                { name: 'TON Bridge', assetId: ASSET_TON_BRIDGE },
                { name: 'Orbit Bridge', assetId: ASSET_ORBIT_BRIDGE },
                { name: 'Wormhole', assetId: ASSET_WORMHOLE },
                { name: 'Axelar Network', assetId: ASSET_AXELAR },
            ],
            version: 3,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/bridge-sub-factory-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('BridgeSubFactory V3:', bridgeSubFactory.address.toString());

    console.log('\nAdd to .env:');
    console.log(`BRIDGE_SUB_FACTORY_V3_ADDRESS=${bridgeSubFactory.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "factories": {`);
    console.log(`    "bridgeSubFactory": {`);
    console.log(`      "address": "${bridgeSubFactory.address.toString()}",`);
    console.log(`      "productType": 2,`);
    console.log(`      "description": "Bridge failure insurance sub-factory"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register factory with MasterFactory:');
        console.log(`   masterFactory.sendRegisterProductFactory(admin, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     productType: 2,`);
        console.log(`     factoryAddress: '${bridgeSubFactory.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Deploy and register child contracts for each bridge:');
        console.log('   a) Compile BridgeChild contract');
        console.log('   b) For each bridge (TON Bridge, Orbit, Wormhole, Axelar):');
        console.log('      - Deploy child contract');
        console.log('      - Register with: bridgeSubFactory.sendRegisterChild(masterFactory, {');
        console.log('          value: toNano("0.1"),');
        console.log('          assetId: ASSET_TON_BRIDGE,');
        console.log('          childAddress: tonBridgeChildAddress');
        console.log('        })');
        console.log('3. Set child codes for future deployments:');
        console.log('   bridgeSubFactory.sendSetChildCode(masterFactory, {');
        console.log('     value: toNano("0.1"),');
        console.log('     assetId: ASSET_TON_BRIDGE,');
        console.log('     childCode: compiledChildCode');
        console.log('   })');
        console.log('4. Test policy routing from MasterFactory');
        console.log('5. Verify gas costs (<0.05 TON per routing)');
        console.log('6. Monitor policy creation events');
    } else {
        console.log('1. Run tests: npx jest tests/v3/BridgeSubFactory.spec.ts');
        console.log('2. Register with MasterFactory (if deployed)');
        console.log('3. Deploy child contracts for each bridge:');
        console.log('   - BridgeChild contracts for TON Bridge, Orbit, Wormhole, Axelar');
        console.log('4. Register children with factory:');
        console.log('   await bridgeSubFactory.sendRegisterChild(masterFactory, { assetId, childAddress })');
        console.log('5. Test policy creation flow:');
        console.log('   MasterFactory → BridgeSubFactory → BridgeChild');
        console.log('6. Test pause/unpause controls');
        console.log('7. Verify child code updates work correctly');
        console.log('8. Deploy to mainnet when ready');
    }

    console.log('\nPolicy Routing Flow:');
    console.log('  1. User creates bridge failure policy via MasterFactory');
    console.log('  2. MasterFactory calls BridgeSubFactory.create_policy_from_master()');
    console.log('  3. BridgeSubFactory routes to appropriate BridgeChild based on asset_id');
    console.log('  4. BridgeChild creates policy and mints NFT');
    console.log('  5. Policy activated, premium sent to Float');

    console.log('\nSupported Bridge Coverage:');
    console.log(`  ✓ TON Bridge (Official TON) - asset_id: ${ASSET_TON_BRIDGE}`);
    console.log(`  ✓ Orbit Bridge (Cross-chain) - asset_id: ${ASSET_ORBIT_BRIDGE}`);
    console.log(`  ✓ Wormhole (Multi-chain) - asset_id: ${ASSET_WORMHOLE}`);
    console.log(`  ✓ Axelar Network (General Message Passing) - asset_id: ${ASSET_AXELAR}`);

    console.log('\nUse Cases:');
    console.log('  ✓ Protect funds during bridge transfers');
    console.log('  ✓ Coverage for bridge hacks/exploits');
    console.log('  ✓ Compensation for stuck/delayed transfers');
    console.log('  ✓ Smart contract failure protection');

    console.log('\nManagement Commands:');
    console.log('// Register child contract');
    console.log('await bridgeSubFactory.sendRegisterChild(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_TON_BRIDGE,');
    console.log('  childAddress: tonBridgeChildAddress');
    console.log('})');
    console.log('\n// Update child code');
    console.log('await bridgeSubFactory.sendSetChildCode(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_TON_BRIDGE,');
    console.log('  childCode: newChildCode');
    console.log('})');
    console.log('\n// Pause factory');
    console.log('await bridgeSubFactory.sendPause(masterFactory, toNano("0.05"))');
    console.log('\n// Check child status');
    console.log('const isDeployed = await bridgeSubFactory.isChildDeployed(ASSET_TON_BRIDGE)');
    console.log('const childAddress = await bridgeSubFactory.getChild(ASSET_TON_BRIDGE)');
}
