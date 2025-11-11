import { toNano, Address, Dictionary } from '@ton/core';
import { ContractSubFactory, ASSET_DEDUST, ASSET_STONFI, ASSET_TONSTAKERS, ASSET_EVAA } from '../../wrappers/v3/ContractSubFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for ContractSubFactory V3
 *
 * Purpose: Deploy smart contract exploit insurance sub-factory for policy routing
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Routes smart contract exploit policies to protocol-specific child contracts
 * - Supports 4 major DeFi protocols (DeDust, STON.fi, Tonstakers, Evaa)
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
 * 2. Deploy and register child contracts for each protocol
 * 3. Set child codes for future deployments
 * 4. Test policy routing flow
 */

export async function run(provider: NetworkProvider) {
    console.log('=== ContractSubFactory V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the ContractSubFactory contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling ContractSubFactory...');
    const code = await compile('ContractSubFactory');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    console.log('\nConfiguration:');
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  Product Type: 4 (PRODUCT_CONTRACT)`);
    console.log(`  Supported DeFi Protocols: 4`);
    console.log(`    - DeDust AMM (asset_id: ${ASSET_DEDUST})`);
    console.log(`    - STON.fi AMM (asset_id: ${ASSET_STONFI})`);
    console.log(`    - Tonstakers (asset_id: ${ASSET_TONSTAKERS})`);
    console.log(`    - Evaa Protocol (asset_id: ${ASSET_EVAA})`);

    // Step 3: Deploy ContractSubFactory
    console.log('\nStep 3: Deploying ContractSubFactory...');

    const contractSubFactory = provider.open(
        ContractSubFactory.createFromConfig(
            {
                masterFactoryAddress: masterFactoryAddress,
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

    await contractSubFactory.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(contractSubFactory.address);
    console.log(`✓ ContractSubFactory deployed: ${contractSubFactory.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedMaster = await contractSubFactory.getMasterFactory();
    const productType = await contractSubFactory.getProductType();
    const totalChildren = await contractSubFactory.getTotalChildren();
    const totalPolicies = await contractSubFactory.getTotalPolicies();
    const paused = await contractSubFactory.getPaused();
    const supportedProtocols = await contractSubFactory.getSupportedProtocols();
    const version = await contractSubFactory.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    MasterFactory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Total Children: ${totalChildren}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Supported Protocols: ${supportedProtocols}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (productType !== 4) throw new Error('Product type should be 4 (CONTRACT)!');
    if (totalChildren !== 0) throw new Error('Total children should be 0!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (supportedProtocols < 4) throw new Error('Should support at least 4 protocols!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        contractSubFactory: {
            address: contractSubFactory.address.toString(),
            masterFactory: masterFactoryAddress.toString(),
            productType: 4,
            supportedProtocols: [
                { name: 'DeDust AMM', assetId: ASSET_DEDUST },
                { name: 'STON.fi AMM', assetId: ASSET_STONFI },
                { name: 'Tonstakers', assetId: ASSET_TONSTAKERS },
                { name: 'Evaa Protocol', assetId: ASSET_EVAA },
            ],
            version: 3,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/contract-sub-factory-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('ContractSubFactory V3:', contractSubFactory.address.toString());

    console.log('\nAdd to .env:');
    console.log(`CONTRACT_SUB_FACTORY_V3_ADDRESS=${contractSubFactory.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "factories": {`);
    console.log(`    "contractSubFactory": {`);
    console.log(`      "address": "${contractSubFactory.address.toString()}",`);
    console.log(`      "productType": 4,`);
    console.log(`      "description": "Smart contract exploit insurance sub-factory"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register factory with MasterFactory:');
        console.log(`   masterFactory.sendRegisterProductFactory(admin, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     productType: 4,`);
        console.log(`     factoryAddress: '${contractSubFactory.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Deploy and register child contracts for each protocol:');
        console.log('   a) Compile ProtocolChild contract');
        console.log('   b) For each protocol (DeDust, STON.fi, Tonstakers, Evaa):');
        console.log('      - Deploy child contract');
        console.log('      - Register with: contractSubFactory.sendRegisterChild(masterFactory, {');
        console.log('          value: toNano("0.1"),');
        console.log('          assetId: ASSET_DEDUST,');
        console.log('          childAddress: dedustChildAddress');
        console.log('        })');
        console.log('3. Set child codes for future deployments:');
        console.log('   contractSubFactory.sendSetChildCode(masterFactory, {');
        console.log('     value: toNano("0.1"),');
        console.log('     assetId: ASSET_DEDUST,');
        console.log('     childCode: compiledChildCode');
        console.log('   })');
        console.log('4. Test policy routing from MasterFactory');
        console.log('5. Verify gas costs (<0.05 TON per routing)');
        console.log('6. Monitor policy creation events');
    } else {
        console.log('1. Run tests: npx jest tests/v3/ContractSubFactory.spec.ts');
        console.log('2. Register with MasterFactory (if deployed)');
        console.log('3. Deploy child contracts for each protocol:');
        console.log('   - ProtocolChild contracts for DeDust, STON.fi, Tonstakers, Evaa');
        console.log('4. Register children with factory:');
        console.log('   await contractSubFactory.sendRegisterChild(masterFactory, { assetId, childAddress })');
        console.log('5. Test policy creation flow:');
        console.log('   MasterFactory → ContractSubFactory → ProtocolChild');
        console.log('6. Test pause/unpause controls');
        console.log('7. Verify child code updates work correctly');
        console.log('8. Deploy to mainnet when ready');
    }

    console.log('\nPolicy Routing Flow:');
    console.log('  1. User creates smart contract exploit policy via MasterFactory');
    console.log('  2. MasterFactory calls ContractSubFactory.create_policy_from_master()');
    console.log('  3. ContractSubFactory routes to appropriate ProtocolChild based on asset_id');
    console.log('  4. ProtocolChild creates policy and mints NFT');
    console.log('  5. Policy activated, premium sent to Float');

    console.log('\nSupported Protocol Coverage:');
    console.log(`  ✓ DeDust (DEX AMM) - asset_id: ${ASSET_DEDUST}`);
    console.log(`  ✓ STON.fi (DEX AMM) - asset_id: ${ASSET_STONFI}`);
    console.log(`  ✓ Tonstakers (Liquid Staking) - asset_id: ${ASSET_TONSTAKERS}`);
    console.log(`  ✓ Evaa Protocol (Lending/Borrowing) - asset_id: ${ASSET_EVAA}`);

    console.log('\nUse Cases:');
    console.log('  ✓ Protect against smart contract exploits');
    console.log('  ✓ Coverage for protocol hacks');
    console.log('  ✓ Compensation for TVL loss');
    console.log('  ✓ Flash loan attack protection');
    console.log('  ✓ Reentrancy vulnerability coverage');

    console.log('\nManagement Commands:');
    console.log('// Register child contract');
    console.log('await contractSubFactory.sendRegisterChild(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_DEDUST,');
    console.log('  childAddress: dedustChildAddress');
    console.log('})');
    console.log('\n// Update child code');
    console.log('await contractSubFactory.sendSetChildCode(masterFactory, {');
    console.log('  value: toNano("0.1"),');
    console.log('  assetId: ASSET_DEDUST,');
    console.log('  childCode: newChildCode');
    console.log('})');
    console.log('\n// Pause factory');
    console.log('await contractSubFactory.sendPause(masterFactory, toNano("0.05"))');
    console.log('\n// Check child status');
    console.log('const isDeployed = await contractSubFactory.isChildDeployed(ASSET_DEDUST)');
    console.log('const childAddress = await contractSubFactory.getChild(ASSET_DEDUST)');
}
