import { toNano, Address, Dictionary } from '@ton/core';
import { ProtocolChild } from '../../wrappers/v3/ProtocolChild';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for ProtocolChild V3
 *
 * Purpose: Deploy smart contract exploit insurance child contract
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Creates and manages protocol exploit policies
 * - Calculates premiums (2.0% APR × duration - highest risk product)
 * - Mints PolicyNFTs for each policy
 * - Creates vault escrows for coverage collateral
 * - Registers policies with MasterFactory
 * - Monitors protocol health and triggers claims automatically
 * - Parametric trigger: Exploit detected OR protocol paused > 24 hours
 *
 * Requirements:
 * - ContractSubFactory address (parent)
 * - MasterFactory address
 * - PolicyNFTMinter address
 * - Vault address (MultiTrancheVault)
 * - ProtocolMonitor address
 *
 * Post-Deployment:
 * 1. Register this child with ContractSubFactory
 * 2. Configure protocol monitor relayer
 * 3. Test policy creation flow
 * 4. Monitor protocol health updates
 */

export async function run(provider: NetworkProvider) {
    console.log('=== ProtocolChild V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy a ProtocolChild contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling ProtocolChild...');
    const code = await compile('ProtocolChild');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const parentFactoryStr = await provider.ui().input('Enter ContractSubFactory address:');
    const parentFactoryAddress = Address.parse(parentFactoryStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const nftMinterStr = await provider.ui().input('Enter PolicyNFTMinter address:');
    const nftMinterAddress = Address.parse(nftMinterStr);

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vaultAddress = Address.parse(vaultStr);

    const protocolMonitorStr = await provider.ui().input('Enter ProtocolMonitor address:');
    const protocolMonitorAddress = Address.parse(protocolMonitorStr);

    const assetIdStr = await provider.ui().input('Enter protocol asset ID (1=DeDust, 2=STON.fi, 3=Megaton, etc.):');
    const assetId = parseInt(assetIdStr);

    console.log('\nConfiguration:');
    console.log(`  Parent Factory: ${parentFactoryAddress.toString()}`);
    console.log(`  Master Factory: ${masterFactoryAddress.toString()}`);
    console.log(`  NFT Minter: ${nftMinterAddress.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  Protocol Monitor: ${protocolMonitorAddress.toString()}`);
    console.log(`  Asset ID: ${assetId}`);
    console.log(`  Product Type: 4 (CONTRACT)`);

    // Step 3: Deploy ProtocolChild
    console.log('\nStep 3: Deploying ProtocolChild...');

    const protocolChild = provider.open(
        ProtocolChild.createFromConfig(
            {
                parentFactoryAddress: parentFactoryAddress,
                masterFactoryAddress: masterFactoryAddress,
                productType: 4, // PRODUCT_CONTRACT
                assetId: assetId,
                policyNFTMinterAddress: nftMinterAddress,
                vaultAddress: vaultAddress,
                protocolMonitorAddress: protocolMonitorAddress,
                policyRegistry: Dictionary.empty(),
                nextPolicyId: 1n,
                totalPoliciesCreated: 0n,
                totalCoverageAmount: 0n,
                paused: false,
            },
            code
        )
    );

    await protocolChild.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(protocolChild.address);
    console.log(`✓ ProtocolChild deployed: ${protocolChild.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedParent = await protocolChild.getParentFactory();
    const deployedMaster = await protocolChild.getMasterFactory();
    const productType = await protocolChild.getProductType();
    const deployedAssetId = await protocolChild.getAssetId();
    const deployedNFTMinter = await protocolChild.getPolicyNFTMinter();
    const deployedVault = await protocolChild.getVault();
    const deployedMonitor = await protocolChild.getProtocolMonitor();
    const nextPolicyId = await protocolChild.getNextPolicyId();
    const totalPolicies = await protocolChild.getTotalPolicies();
    const paused = await protocolChild.getPaused();
    const version = await protocolChild.getVersion();
    const pauseThreshold = await protocolChild.getPauseThreshold();

    console.log('  Deployed configuration:');
    console.log(`    Parent Factory: ${deployedParent.toString()}`);
    console.log(`    Master Factory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Asset ID: ${deployedAssetId}`);
    console.log(`    NFT Minter: ${deployedNFTMinter.toString()}`);
    console.log(`    Vault: ${deployedVault.toString()}`);
    console.log(`    Protocol Monitor: ${deployedMonitor.toString()}`);
    console.log(`    Next Policy ID: ${nextPolicyId}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);
    console.log(`    Pause Threshold: ${pauseThreshold}s (${pauseThreshold / 3600}h)`);

    // Verify configuration
    if (!deployedParent.equals(parentFactoryAddress)) throw new Error('Parent factory mismatch!');
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('Master factory mismatch!');
    if (productType !== 4) throw new Error('Product type should be 4 (CONTRACT)!');
    if (deployedAssetId !== assetId) throw new Error('Asset ID mismatch!');
    if (nextPolicyId !== 1n) throw new Error('Next policy ID should be 1!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const protocolNames: { [key: number]: string } = {
        1: 'DeDust',
        2: 'STON.fi',
        3: 'Megaton Finance',
        4: 'Tonstakers',
        5: 'Bemo',
        6: 'Evaa Protocol',
    };

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        protocolChild: {
            address: protocolChild.address.toString(),
            parentFactory: parentFactoryAddress.toString(),
            masterFactory: masterFactoryAddress.toString(),
            nftMinter: nftMinterAddress.toString(),
            vault: vaultAddress.toString(),
            protocolMonitor: protocolMonitorAddress.toString(),
            productType: 4,
            assetId: assetId,
            assetName: protocolNames[assetId] || 'Unknown Protocol',
            version: 3,
        },
        pricing: {
            baseAPR: '2.0%',
            formula: 'coverage × APR × (days / 365)',
        },
        trigger: {
            pauseThreshold: pauseThreshold,
            description: 'Exploit detected OR protocol paused > 24 hours',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/protocol-child-v3-asset${assetId}-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('ProtocolChild V3:', protocolChild.address.toString());
    console.log('Protocol:', protocolNames[assetId] || `ID ${assetId}`);

    console.log('\nAdd to .env:');
    console.log(`PROTOCOL_CHILD_V3_ASSET${assetId}_ADDRESS=${protocolChild.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register child with ContractSubFactory:');
        console.log(`   contractSubFactory.sendRegisterChild(masterFactory, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     assetId: ${assetId},`);
        console.log(`     childAddress: '${protocolChild.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Configure protocol monitor relayer:');
        console.log('   - Set up health monitoring for protocol');
        console.log('   - Track exploit events via on-chain logs');
        console.log('   - Track protocol pause duration');
        console.log('   - Push health updates every 2 minutes');
        console.log('3. Test policy creation:');
        console.log('   - Create test policy via ContractSubFactory');
        console.log('   - Verify NFT minting');
        console.log('   - Verify Vault escrow creation');
        console.log('   - Verify MasterFactory registration');
        console.log('4. Monitor protocol health metrics');
        console.log('5. Test claim flow when exploit occurs');
    } else {
        console.log('1. Run tests: npx jest tests/v3/ProtocolChild.spec.ts');
        console.log('2. Register with ContractSubFactory (if deployed)');
        console.log('3. Test policy creation flow:');
        console.log('   ContractSubFactory → ProtocolChild → PolicyNFT + Vault + MasterFactory');
        console.log('4. Test protocol monitor updates:');
        console.log('   await child.sendProtocolHealthUpdate(monitor, { exploitDetected, pauseDuration })');
        console.log('5. Test failure trigger:');
        console.log('   - Report exploit detection');
        console.log('   - Report protocol pause > 24 hours');
        console.log('   - Verify claim triggered');
        console.log('6. Verify premium calculation:');
        console.log('   const premium = await child.getPremiumQuote(coverage, days)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nPremium Formula:');
    console.log('  Base APR: 2.0% (200 basis points)');
    console.log('  Formula: coverage × (APR / 10000) × (days / 365)');
    console.log('  Example: $200,000 × 0.020 × (180/365) = $1,972.60');
    console.log('  Note: Highest APR among all products (highest risk)');

    console.log('\nExploit Failure Triggers:');
    console.log(`  Pause Threshold: ${pauseThreshold / 3600} hours`);
    console.log('  Logic: Triggers when EITHER condition met:');
    console.log('    1. Exploit detected (reentrancy, overflow, unauthorized access, etc.)');
    console.log('    2. Protocol paused for 24+ consecutive hours (emergency pause)');
    console.log('  Detection: Monitor checks protocol state every 2 minutes');

    console.log('\nPolicy Flow:');
    console.log('  1. User sends premium → ContractSubFactory → ProtocolChild');
    console.log('  2. ProtocolChild creates policy (validates premium)');
    console.log('  3. Parallel messages sent:');
    console.log('     a) PolicyNFTMinter: Mint NFT certificate');
    console.log('     b) Vault: Create escrow with collateral');
    console.log('     c) MasterFactory: Register policy for claim coordination');
    console.log('  4. Protocol Monitor monitors health → Triggers claim on exploit');
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
    console.log('const premium = await child.getPremiumQuote(toNano("200000"), 180)');
    console.log('\n// Update protocol health');
    console.log('await child.sendProtocolHealthUpdate(monitor, {');
    console.log('  value: toNano("0.05"),');
    console.log('  exploitDetected: true, // Or pauseDuration > 86400');
    console.log('  timestamp: Math.floor(Date.now() / 1000)');
    console.log('})');
    console.log('\n// Check policy');
    console.log('const policy = await child.getPolicy(policyId)');
    console.log('\n// Check pause threshold');
    console.log('const threshold = await child.getPauseThreshold()');
    console.log('\n// Pause child (from parent factory)');
    console.log('await child.sendPause(parentFactory, toNano("0.05"))');
}
