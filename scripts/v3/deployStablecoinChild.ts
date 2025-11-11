import { toNano, Address, Dictionary } from '@ton/core';
import { StablecoinChild } from '../../wrappers/v3/StablecoinChild';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for StablecoinChild V3
 *
 * Purpose: Deploy stablecoin depeg insurance child contract
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Creates and manages stablecoin depeg policies
 * - Calculates premiums (0.8% APR × duration)
 * - Mints PolicyNFTs for each policy
 * - Invests premiums via FloatMaster (50% RWA, 15% BTC, 15% DeFi, 20% Hedges)
 * - Registers policies with MasterFactory
 * - Monitors oracle prices and triggers claims automatically
 * - Parametric trigger: Price < $0.98 for 1+ hour
 *
 * Requirements:
 * - DepegSubFactory address (parent)
 * - MasterFactory address
 * - PolicyNFTMinter address
 * - FloatMaster address
 * - PriceOracle address
 *
 * Post-Deployment:
 * 1. Register this child with DepegSubFactory
 * 2. Configure oracle relayer
 * 3. Test policy creation flow
 * 4. Monitor oracle price updates
 */

export async function run(provider: NetworkProvider) {
    console.log('=== StablecoinChild V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy a StablecoinChild contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling StablecoinChild...');
    const code = await compile('StablecoinChild');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const parentFactoryStr = await provider.ui().input('Enter DepegSubFactory address:');
    const parentFactoryAddress = Address.parse(parentFactoryStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const nftMinterStr = await provider.ui().input('Enter PolicyNFTMinter address:');
    const nftMinterAddress = Address.parse(nftMinterStr);

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const priceOracleStr = await provider.ui().input('Enter PriceOracle address:');
    const priceOracleAddress = Address.parse(priceOracleStr);

    const assetIdStr = await provider.ui().input('Enter stablecoin asset ID (1=USDT, 2=USDC, 3=DAI, etc.):');
    const assetId = parseInt(assetIdStr);

    console.log('\nConfiguration:');
    console.log(`  Parent Factory: ${parentFactoryAddress.toString()}`);
    console.log(`  Master Factory: ${masterFactoryAddress.toString()}`);
    console.log(`  NFT Minter: ${nftMinterAddress.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  Price Oracle: ${priceOracleAddress.toString()}`);
    console.log(`  Asset ID: ${assetId}`);
    console.log(`  Product Type: 1 (DEPEG)`);

    // Step 3: Deploy StablecoinChild
    console.log('\nStep 3: Deploying StablecoinChild...');

    const stablecoinChild = provider.open(
        StablecoinChild.createFromConfig(
            {
                parentFactoryAddress: parentFactoryAddress,
                masterFactoryAddress: masterFactoryAddress,
                productType: 1, // PRODUCT_DEPEG
                assetId: assetId,
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

    await stablecoinChild.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(stablecoinChild.address);
    console.log(`✓ StablecoinChild deployed: ${stablecoinChild.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedParent = await stablecoinChild.getParentFactory();
    const deployedMaster = await stablecoinChild.getMasterFactory();
    const productType = await stablecoinChild.getProductType();
    const deployedAssetId = await stablecoinChild.getAssetId();
    const deployedNFTMinter = await stablecoinChild.getPolicyNFTMinter();
    const deployedFloat = await stablecoinChild.getFloatMaster();
    const deployedOracle = await stablecoinChild.getPriceOracle();
    const nextPolicyId = await stablecoinChild.getNextPolicyId();
    const totalPolicies = await stablecoinChild.getTotalPolicies();
    const paused = await stablecoinChild.getPaused();
    const version = await stablecoinChild.getVersion();
    const triggerParams = await stablecoinChild.getDepegTriggerParams();

    console.log('  Deployed configuration:');
    console.log(`    Parent Factory: ${deployedParent.toString()}`);
    console.log(`    Master Factory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Asset ID: ${deployedAssetId}`);
    console.log(`    NFT Minter: ${deployedNFTMinter.toString()}`);
    console.log(`    Float Master: ${deployedFloat.toString()}`);
    console.log(`    Price Oracle: ${deployedOracle.toString()}`);
    console.log(`    Next Policy ID: ${nextPolicyId}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);
    console.log(`    Trigger Price: $${triggerParams.thresholdPrice / 1000000} (${triggerParams.thresholdPrice})`);
    console.log(`    Trigger Duration: ${triggerParams.durationSeconds}s (${triggerParams.durationSeconds / 3600}h)`);

    // Verify configuration
    if (!deployedParent.equals(parentFactoryAddress)) throw new Error('Parent factory mismatch!');
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('Master factory mismatch!');
    if (productType !== 1) throw new Error('Product type should be 1 (DEPEG)!');
    if (deployedAssetId !== assetId) throw new Error('Asset ID mismatch!');
    if (nextPolicyId !== 1n) throw new Error('Next policy ID should be 1!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const stablecoinNames: { [key: number]: string } = {
        1: 'USDT',
        2: 'USDC',
        3: 'DAI',
        4: 'USDD',
        5: 'TUSD',
        6: 'FDUSD',
    };

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        stablecoinChild: {
            address: stablecoinChild.address.toString(),
            parentFactory: parentFactoryAddress.toString(),
            masterFactory: masterFactoryAddress.toString(),
            nftMinter: nftMinterAddress.toString(),
            floatMaster: floatMasterAddress.toString(),
            priceOracle: priceOracleAddress.toString(),
            productType: 1,
            assetId: assetId,
            assetName: stablecoinNames[assetId] || 'Unknown',
            version: 3,
        },
        pricing: {
            baseAPR: '0.8%',
            formula: 'coverage × APR × (days / 365)',
        },
        trigger: {
            thresholdPrice: triggerParams.thresholdPrice,
            durationSeconds: triggerParams.durationSeconds,
            description: 'Price < $0.98 for 1+ hour',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/stablecoin-child-v3-asset${assetId}-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('StablecoinChild V3:', stablecoinChild.address.toString());
    console.log('Asset:', stablecoinNames[assetId] || `ID ${assetId}`);

    console.log('\nAdd to .env:');
    console.log(`STABLECOIN_CHILD_V3_ASSET${assetId}_ADDRESS=${stablecoinChild.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register child with DepegSubFactory:');
        console.log(`   depegSubFactory.sendRegisterChild(masterFactory, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     assetId: ${assetId},`);
        console.log(`     childAddress: '${stablecoinChild.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Configure oracle relayer:');
        console.log('   - Set up price feed for stablecoin');
        console.log('   - Push price updates via sendOraclePriceUpdate()');
        console.log('   - Monitor every 5 minutes');
        console.log('3. Test policy creation:');
        console.log('   - Create test policy via DepegSubFactory');
        console.log('   - Verify NFT minting');
        console.log('   - Verify Float investment');
        console.log('   - Verify MasterFactory registration');
        console.log('4. Monitor oracle triggers');
        console.log('5. Test claim flow when depeg occurs');
    } else {
        console.log('1. Run tests: npx jest tests/v3/StablecoinChild.spec.ts');
        console.log('2. Register with DepegSubFactory (if deployed)');
        console.log('3. Test policy creation flow:');
        console.log('   DepegSubFactory → StablecoinChild → PolicyNFT + Float + MasterFactory');
        console.log('4. Test oracle price updates:');
        console.log('   await child.sendOraclePriceUpdate(oracle, { currentPrice: 990000, timestamp })');
        console.log('5. Test depeg trigger:');
        console.log('   - Send price < $0.98');
        console.log('   - Wait 1 hour');
        console.log('   - Verify claim triggered');
        console.log('6. Verify premium calculation:');
        console.log('   const premium = await child.getPremiumQuote(coverage, days)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nPremium Formula:');
    console.log('  Base APR: 0.8% (80 basis points)');
    console.log('  Formula: coverage × (APR / 10000) × (days / 365)');
    console.log('  Example: $10,000 × 0.008 × (30/365) = $6.58');

    console.log('\nDepeg Trigger:');
    console.log(`  Price Threshold: $${triggerParams.thresholdPrice / 1000000}`);
    console.log(`  Duration: ${triggerParams.durationSeconds / 3600} hour`);
    console.log('  Logic: Triggers when price < $0.98 for 1+ consecutive hour');

    console.log('\nPolicy Flow:');
    console.log('  1. User sends premium → DepegSubFactory → StablecoinChild');
    console.log('  2. StablecoinChild creates policy (validates premium)');
    console.log('  3. Parallel messages sent:');
    console.log('     a) PolicyNFTMinter: Mint NFT certificate');
    console.log('     b) FloatMaster: Invest premium (50% RWA, 15% BTC, 15% DeFi, 20% Hedges)');
    console.log('     c) MasterFactory: Register policy for claim coordination');
    console.log('  4. Oracle monitors price → Triggers claim on depeg');
    console.log('  5. Claim → MasterFactory → Vault → User payout');

    console.log('\nManagement Commands:');
    console.log('// Get premium quote');
    console.log('const premium = await child.getPremiumQuote(toNano("10000"), 30)');
    console.log('\n// Update oracle price');
    console.log('await child.sendOraclePriceUpdate(oracle, {');
    console.log('  value: toNano("0.05"),');
    console.log('  currentPrice: 995000, // $0.995 (6 decimals)');
    console.log('  timestamp: Math.floor(Date.now() / 1000)');
    console.log('})');
    console.log('\n// Check policy');
    console.log('const policy = await child.getPolicy(policyId)');
    console.log('\n// Pause child (from parent factory)');
    console.log('await child.sendPause(parentFactory, toNano("0.05"))');
}
