import { toNano, Address, Dictionary } from '@ton/core';
import { StablecoinChild } from '../../wrappers/v3/StablecoinChild';
import { DepegSubFactory } from '../../wrappers/v3/DepegSubFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for StablecoinChildren V3 (Hackathon Batch)
 *
 * Purpose: Deploy and register 3 stablecoin children for hackathon demo
 * Network: Testnet/Mainnet
 *
 * Deploys:
 * - USDT (asset_id: 1)
 * - USDC (asset_id: 2)
 * - USDe (asset_id: 7)
 *
 * Features:
 * - Batch deployment with single code compilation
 * - Automatic registration with DepegSubFactory
 * - Pre-deployment architecture (children registered before policy creation)
 *
 * Requirements:
 * - DepegSubFactory address (must be deployed first)
 * - MasterFactory address
 * - PolicyNFTMinter address
 * - FloatMaster address
 * - PriceOracle address
 *
 * Post-Deployment:
 * 1. Update tests to use pre-deployed children addresses
 * 2. Test policy creation flow
 * 3. Verify child registration in factory
 */

export async function run(provider: NetworkProvider) {
    console.log('=== StablecoinChildren V3 Batch Deployment (Hackathon) ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy 3 StablecoinChild contracts');
        console.warn('⚠️  Estimated cost: ~1.8 TON (3 × 0.6 TON)\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract (once for all 3 children)
    console.log('Step 1: Compiling StablecoinChild...');
    const code = await compile('StablecoinChild');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const depegSubFactoryStr = await provider.ui().input('Enter DepegSubFactory address:');
    const depegSubFactoryAddress = Address.parse(depegSubFactoryStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const nftMinterStr = await provider.ui().input('Enter PolicyNFTMinter address:');
    const nftMinterAddress = Address.parse(nftMinterStr);

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const priceOracleStr = await provider.ui().input('Enter PriceOracle address:');
    const priceOracleAddress = Address.parse(priceOracleStr);

    console.log('\nConfiguration:');
    console.log(`  DepegSubFactory: ${depegSubFactoryAddress.toString()}`);
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  NFT Minter: ${nftMinterAddress.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  Price Oracle: ${priceOracleAddress.toString()}`);
    console.log(`  Product Type: 1 (DEPEG)`);

    // Stablecoin configurations
    const stablecoins = [
        { name: 'USDT', assetId: 1, ticker: 'Tether' },
        { name: 'USDC', assetId: 2, ticker: 'USD Coin' },
        { name: 'USDe', assetId: 7, ticker: 'Ethena USDe' },
    ];

    console.log(`\nStablecoins to deploy: ${stablecoins.length}`);
    stablecoins.forEach((coin) => {
        console.log(`  - ${coin.name} (${coin.ticker}): asset_id=${coin.assetId}`);
    });

    const deployedChildren: Array<{
        name: string;
        assetId: number;
        address: Address;
    }> = [];

    // Step 3: Deploy all 3 children
    console.log('\nStep 3: Deploying StablecoinChildren...');

    for (const coin of stablecoins) {
        console.log(`\n--- Deploying ${coin.name} Child ---`);

        const child = provider.open(
            StablecoinChild.createFromConfig(
                {
                    parentFactoryAddress: depegSubFactoryAddress,
                    masterFactoryAddress: masterFactoryAddress,
                    productType: 1, // PRODUCT_DEPEG
                    assetId: coin.assetId,
                    policyNFTMinterAddress: nftMinterAddress,
                    floatMasterAddress: floatMasterAddress,
                    priceOracleAddress: priceOracleAddress,
                    policyRegistry: Dictionary.empty(),
                    nextPolicyId: 1n,
                    totalPoliciesCreated: 0n,
                    totalCoverageAmount: 0n,
                    paused: false,
                    lastOraclePrice: 1000000, // $1.00 (6 decimals)
                    lastOracleTimestamp: 0,
                    depegStartTimestamp: 0,
                    activePolicies: Dictionary.empty(),
                },
                code
            )
        );

        await child.sendDeploy(provider.sender(), toNano('0.6'));
        await provider.waitForDeploy(child.address);
        console.log(`✓ ${coin.name} Child deployed: ${child.address.toString()}`);

        // Quick verification
        const deployedAssetId = await child.getAssetId();
        const productType = await child.getProductType();
        if (deployedAssetId !== coin.assetId) {
            throw new Error(`${coin.name}: Asset ID mismatch! Expected ${coin.assetId}, got ${deployedAssetId}`);
        }
        if (productType !== 1) {
            throw new Error(`${coin.name}: Product type mismatch! Expected 1, got ${productType}`);
        }

        deployedChildren.push({
            name: coin.name,
            assetId: coin.assetId,
            address: child.address,
        });
    }

    console.log('\n✓ All children deployed successfully\n');

    // Step 4: Register children with DepegSubFactory
    console.log('Step 4: Registering children with DepegSubFactory...');

    const depegSubFactory = provider.open(DepegSubFactory.createFromAddress(depegSubFactoryAddress));

    for (const child of deployedChildren) {
        console.log(`  Registering ${child.name} (asset_id=${child.assetId})...`);

        await depegSubFactory.sendRegisterChild(provider.sender(), {
            value: toNano('0.1'),
            assetId: child.assetId,
            childAddress: child.address,
        });

        // Wait a bit for registration to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify registration
        const registeredChild = await depegSubFactory.getChild(child.assetId);
        if (!registeredChild.equals(child.address)) {
            throw new Error(`${child.name}: Registration failed! Child not found in factory.`);
        }

        console.log(`  ✓ ${child.name} registered successfully`);
    }

    console.log('\n✓ All children registered with DepegSubFactory\n');

    // Step 5: Final Verification
    console.log('Step 5: Final verification...');

    const totalChildren = await depegSubFactory.getTotalChildren();
    console.log(`  Total children in factory: ${totalChildren}`);

    for (const child of deployedChildren) {
        const isDeployed = await depegSubFactory.isChildDeployed(child.assetId);
        console.log(`  ${child.name} (asset_id=${child.assetId}): ${isDeployed ? '✓ Registered' : '✗ NOT REGISTERED'}`);
        if (!isDeployed) {
            throw new Error(`${child.name} registration verification failed!`);
        }
    }

    console.log('\n✓ All verifications passed\n');

    // Step 6: Save deployment manifest
    console.log('Step 6: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        depegSubFactory: depegSubFactoryAddress.toString(),
        masterFactory: masterFactoryAddress.toString(),
        nftMinter: nftMinterAddress.toString(),
        floatMaster: floatMasterAddress.toString(),
        priceOracle: priceOracleAddress.toString(),
        children: deployedChildren.map((child) => ({
            name: child.name,
            assetId: child.assetId,
            address: child.address.toString(),
        })),
        productType: 1,
        version: 3,
    };

    const fs = require('fs');
    const manifestPath = `./deployments/stablecoin-children-hackathon-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 7: Output
    console.log('=== Deployment Complete ===\n');

    console.log('Deployed StablecoinChildren:');
    deployedChildren.forEach((child) => {
        console.log(`  ${child.name} (asset_id=${child.assetId}): ${child.address.toString()}`);
    });

    console.log('\nAdd to .env:');
    deployedChildren.forEach((child) => {
        console.log(`STABLECOIN_CHILD_V3_${child.name}_ADDRESS=${child.address.toString()}`);
    });

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "children": {`);
    console.log(`    "depeg": {`);
    deployedChildren.forEach((child, index) => {
        const comma = index < deployedChildren.length - 1 ? ',' : '';
        console.log(`      "${child.name.toLowerCase()}": {`);
        console.log(`        "address": "${child.address.toString()}",`);
        console.log(`        "assetId": ${child.assetId},`);
        console.log(`        "productType": 1`);
        console.log(`      }${comma}`);
    });
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Update frontend contracts.json with deployed addresses');
        console.log('2. Configure oracle relayers for all 3 stablecoins:');
        deployedChildren.forEach((child) => {
            console.log(`   - ${child.name}: Price feed → ${child.address.toString()}`);
        });
        console.log('3. Test policy creation flow:');
        console.log('   MasterFactory → DepegSubFactory → StablecoinChild');
        console.log('4. Monitor oracle price updates for all stablecoins');
        console.log('5. Test depeg trigger and claim flow');
    } else {
        console.log('1. Update DepegSubFactory.spec.ts with deployed addresses:');
        deployedChildren.forEach((child) => {
            console.log(`   const ${child.name.toLowerCase()}ChildAddress = Address.parse('${child.address.toString()}');`);
        });
        console.log('2. Run tests: npx jest tests/v3/DepegSubFactory.spec.ts');
        console.log('3. Test policy creation for all 3 stablecoins:');
        deployedChildren.forEach((child) => {
            console.log(`   - ${child.name}: Create policy, verify NFT minting, Float investment`);
        });
        console.log('4. Test oracle price updates and depeg triggers');
        console.log('5. Deploy to mainnet when ready');
    }

    console.log('\nPolicy Flow (Pre-Deployment Architecture):');
    console.log('  1. Children pre-deployed and registered with DepegSubFactory ✓');
    console.log('  2. User creates policy via MasterFactory');
    console.log('  3. MasterFactory → DepegSubFactory.create_policy_from_master()');
    console.log('  4. DepegSubFactory routes to registered child (no auto-deploy)');
    console.log('  5. Child creates policy, mints NFT, invests premium, registers with master');
    console.log('  6. Oracle monitors price → Triggers claim on depeg');

    console.log('\nDeployed Stablecoin Coverage:');
    deployedChildren.forEach((child) => {
        console.log(`  ✓ ${child.name} - asset_id: ${child.assetId}`);
        console.log(`    Address: ${child.address.toString()}`);
        console.log(`    Trigger: Price < $0.98 for 1+ hour`);
        console.log(`    Premium: 0.8% APR × duration`);
    });

    console.log('\nManagement Commands:');
    console.log('// Create policy for USDT');
    console.log('await masterFactory.sendCreatePolicy(user, {');
    console.log('  value: toNano("10.07"), // Premium + gas');
    console.log('  productType: 1, // PRODUCT_DEPEG');
    console.log('  assetId: 1, // USDT');
    console.log('  coverageAmount: toNano("10000"),');
    console.log('  durationDays: 30');
    console.log('})');
    console.log('\n// Check child registration');
    deployedChildren.forEach((child) => {
        console.log(`const ${child.name.toLowerCase()}Child = await depegSubFactory.getChild(${child.assetId})`);
    });
}
