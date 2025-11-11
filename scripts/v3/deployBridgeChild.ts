import { toNano, Address, Dictionary } from '@ton/core';
import { BridgeChild } from '../../wrappers/v3/BridgeChild';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for BridgeChild V3
 *
 * Purpose: Deploy bridge failure insurance child contract
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Creates and manages bridge failure policies
 * - Calculates premiums (1.2% APR × duration)
 * - Mints PolicyNFTs for each policy
 * - Creates vault escrows for coverage collateral
 * - Registers policies with MasterFactory
 * - Monitors bridge availability and triggers claims automatically
 * - Parametric trigger: Bridge offline > 4 hours
 *
 * Requirements:
 * - BridgeSubFactory address (parent)
 * - MasterFactory address
 * - PolicyNFTMinter address
 * - Vault address (MultiTrancheVault)
 * - BridgeMonitor address
 *
 * Post-Deployment:
 * 1. Register this child with BridgeSubFactory
 * 2. Configure bridge monitor relayer
 * 3. Test policy creation flow
 * 4. Monitor bridge availability updates
 */

export async function run(provider: NetworkProvider) {
    console.log('=== BridgeChild V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy a BridgeChild contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling BridgeChild...');
    const code = await compile('BridgeChild');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const parentFactoryStr = await provider.ui().input('Enter BridgeSubFactory address:');
    const parentFactoryAddress = Address.parse(parentFactoryStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const nftMinterStr = await provider.ui().input('Enter PolicyNFTMinter address:');
    const nftMinterAddress = Address.parse(nftMinterStr);

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vaultAddress = Address.parse(vaultStr);

    const bridgeMonitorStr = await provider.ui().input('Enter BridgeMonitor address:');
    const bridgeMonitorAddress = Address.parse(bridgeMonitorStr);

    const assetIdStr = await provider.ui().input('Enter bridge asset ID (1=TON Bridge, 2=Orbit Bridge, etc.):');
    const assetId = parseInt(assetIdStr);

    console.log('\nConfiguration:');
    console.log(`  Parent Factory: ${parentFactoryAddress.toString()}`);
    console.log(`  Master Factory: ${masterFactoryAddress.toString()}`);
    console.log(`  NFT Minter: ${nftMinterAddress.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  Bridge Monitor: ${bridgeMonitorAddress.toString()}`);
    console.log(`  Asset ID: ${assetId}`);
    console.log(`  Product Type: 2 (BRIDGE)`);

    // Step 3: Deploy BridgeChild
    console.log('\nStep 3: Deploying BridgeChild...');

    const bridgeChild = provider.open(
        BridgeChild.createFromConfig(
            {
                parentFactoryAddress: parentFactoryAddress,
                masterFactoryAddress: masterFactoryAddress,
                productType: 2, // PRODUCT_BRIDGE
                assetId: assetId,
                policyNFTMinterAddress: nftMinterAddress,
                vaultAddress: vaultAddress,
                bridgeMonitorAddress: bridgeMonitorAddress,
                policyRegistry: Dictionary.empty(),
                nextPolicyId: 1n,
                totalPoliciesCreated: 0n,
                totalCoverageAmount: 0n,
                paused: false,
            },
            code
        )
    );

    await bridgeChild.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(bridgeChild.address);
    console.log(`✓ BridgeChild deployed: ${bridgeChild.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedParent = await bridgeChild.getParentFactory();
    const deployedMaster = await bridgeChild.getMasterFactory();
    const productType = await bridgeChild.getProductType();
    const deployedAssetId = await bridgeChild.getAssetId();
    const deployedNFTMinter = await bridgeChild.getPolicyNFTMinter();
    const deployedVault = await bridgeChild.getVault();
    const deployedMonitor = await bridgeChild.getBridgeMonitor();
    const nextPolicyId = await bridgeChild.getNextPolicyId();
    const totalPolicies = await bridgeChild.getTotalPolicies();
    const paused = await bridgeChild.getPaused();
    const version = await bridgeChild.getVersion();
    const offlineThreshold = await bridgeChild.getOfflineThreshold();

    console.log('  Deployed configuration:');
    console.log(`    Parent Factory: ${deployedParent.toString()}`);
    console.log(`    Master Factory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Asset ID: ${deployedAssetId}`);
    console.log(`    NFT Minter: ${deployedNFTMinter.toString()}`);
    console.log(`    Vault: ${deployedVault.toString()}`);
    console.log(`    Bridge Monitor: ${deployedMonitor.toString()}`);
    console.log(`    Next Policy ID: ${nextPolicyId}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);
    console.log(`    Offline Threshold: ${offlineThreshold}s (${offlineThreshold / 3600}h)`);

    // Verify configuration
    if (!deployedParent.equals(parentFactoryAddress)) throw new Error('Parent factory mismatch!');
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('Master factory mismatch!');
    if (productType !== 2) throw new Error('Product type should be 2 (BRIDGE)!');
    if (deployedAssetId !== assetId) throw new Error('Asset ID mismatch!');
    if (nextPolicyId !== 1n) throw new Error('Next policy ID should be 1!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const bridgeNames: { [key: number]: string } = {
        1: 'TON Bridge',
        2: 'Orbit Bridge',
        3: 'Wormhole',
        4: 'LayerZero',
        5: 'Stargate',
    };

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        bridgeChild: {
            address: bridgeChild.address.toString(),
            parentFactory: parentFactoryAddress.toString(),
            masterFactory: masterFactoryAddress.toString(),
            nftMinter: nftMinterAddress.toString(),
            vault: vaultAddress.toString(),
            bridgeMonitor: bridgeMonitorAddress.toString(),
            productType: 2,
            assetId: assetId,
            assetName: bridgeNames[assetId] || 'Unknown Bridge',
            version: 3,
        },
        pricing: {
            baseAPR: '1.2%',
            formula: 'coverage × APR × (days / 365)',
        },
        trigger: {
            offlineThreshold: offlineThreshold,
            description: 'Bridge offline > 4 hours',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/bridge-child-v3-asset${assetId}-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('BridgeChild V3:', bridgeChild.address.toString());
    console.log('Bridge:', bridgeNames[assetId] || `ID ${assetId}`);

    console.log('\nAdd to .env:');
    console.log(`BRIDGE_CHILD_V3_ASSET${assetId}_ADDRESS=${bridgeChild.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register child with BridgeSubFactory:');
        console.log(`   bridgeSubFactory.sendRegisterChild(masterFactory, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     assetId: ${assetId},`);
        console.log(`     childAddress: '${bridgeChild.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Configure bridge monitor relayer:');
        console.log('   - Set up availability monitoring for bridge');
        console.log('   - Push availability updates via sendBridgeStatusUpdate()');
        console.log('   - Monitor every 2 minutes');
        console.log('3. Test policy creation:');
        console.log('   - Create test policy via BridgeSubFactory');
        console.log('   - Verify NFT minting');
        console.log('   - Verify Vault escrow creation');
        console.log('   - Verify MasterFactory registration');
        console.log('4. Monitor bridge availability');
        console.log('5. Test claim flow when bridge goes offline');
    } else {
        console.log('1. Run tests: npx jest tests/v3/BridgeChild.spec.ts');
        console.log('2. Register with BridgeSubFactory (if deployed)');
        console.log('3. Test policy creation flow:');
        console.log('   BridgeSubFactory → BridgeChild → PolicyNFT + Vault + MasterFactory');
        console.log('4. Test bridge monitor updates:');
        console.log('   await child.sendBridgeStatusUpdate(monitor, { isOnline: false, timestamp })');
        console.log('5. Test offline trigger:');
        console.log('   - Report bridge offline');
        console.log('   - Wait 4+ hours');
        console.log('   - Verify claim triggered');
        console.log('6. Verify premium calculation:');
        console.log('   const premium = await child.getPremiumQuote(coverage, days)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nPremium Formula:');
    console.log('  Base APR: 1.2% (120 basis points)');
    console.log('  Formula: coverage × (APR / 10000) × (days / 365)');
    console.log('  Example: $50,000 × 0.012 × (60/365) = $98.63');

    console.log('\nBridge Failure Trigger:');
    console.log(`  Offline Threshold: ${offlineThreshold / 3600} hours`);
    console.log('  Logic: Triggers when bridge offline for 4+ consecutive hours');
    console.log('  Detection: Bridge monitor checks API/transaction flow every 2 minutes');

    console.log('\nPolicy Flow:');
    console.log('  1. User sends premium → BridgeSubFactory → BridgeChild');
    console.log('  2. BridgeChild creates policy (validates premium)');
    console.log('  3. Parallel messages sent:');
    console.log('     a) PolicyNFTMinter: Mint NFT certificate');
    console.log('     b) Vault: Create escrow with collateral');
    console.log('     c) MasterFactory: Register policy for claim coordination');
    console.log('  4. Bridge Monitor monitors availability → Triggers claim on failure');
    console.log('  5. Claim → MasterFactory → Vault → User payout');

    console.log('\n8-Party Reward Distribution:');
    console.log('  Premium = 100%');
    console.log('  ├─ Core Protocol (50%):');
    console.log('  │  ├─ Vault Collateral: 45%');
    console.log('  │  └─ Protocol Treasury: 5%');
    console.log('  └─ Ecosystem Rewards (50%):');
    console.log('     ├─ Liquidity Providers: 20%');
    console.log('     ├─ SURE Stakers: 15%');
    console.log('     ├─ DAO Treasury: 5%');
    console.log('     ├─ Developers: 4%');
    console.log('     ├─ Auditors: 3%');
    console.log('     ├─ Oracle Operators: 2%');
    console.log('     └─ Community Referrers: 1%');

    console.log('\nManagement Commands:');
    console.log('// Get premium quote');
    console.log('const premium = await child.getPremiumQuote(toNano("50000"), 60)');
    console.log('\n// Update bridge status');
    console.log('await child.sendBridgeStatusUpdate(monitor, {');
    console.log('  value: toNano("0.05"),');
    console.log('  isOnline: false,');
    console.log('  timestamp: Math.floor(Date.now() / 1000)');
    console.log('})');
    console.log('\n// Check policy');
    console.log('const policy = await child.getPolicy(policyId)');
    console.log('\n// Pause child (from parent factory)');
    console.log('await child.sendPause(parentFactory, toNano("0.05"))');
}
