import { toNano, Address, Dictionary } from '@ton/core';
import { OracleChild } from '../../wrappers/v3/OracleChild';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for OracleChild V3
 *
 * Purpose: Deploy oracle failure insurance child contract
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Creates and manages oracle failure policies
 * - Calculates premiums (1.5% APR × duration)
 * - Mints PolicyNFTs for each policy
 * - Creates vault escrows for coverage collateral
 * - Registers policies with MasterFactory
 * - Monitors oracle health and triggers claims automatically
 * - Parametric trigger: Data stale > 30 min OR deviation > 5%
 *
 * Requirements:
 * - OracleSubFactory address (parent)
 * - MasterFactory address
 * - PolicyNFTMinter address
 * - Vault address (MultiTrancheVault)
 * - OracleMonitor address
 *
 * Post-Deployment:
 * 1. Register this child with OracleSubFactory
 * 2. Configure oracle monitor relayer
 * 3. Test policy creation flow
 * 4. Monitor oracle health updates
 */

export async function run(provider: NetworkProvider) {
    console.log('=== OracleChild V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy an OracleChild contract');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling OracleChild...');
    const code = await compile('OracleChild');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const parentFactoryStr = await provider.ui().input('Enter OracleSubFactory address:');
    const parentFactoryAddress = Address.parse(parentFactoryStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const nftMinterStr = await provider.ui().input('Enter PolicyNFTMinter address:');
    const nftMinterAddress = Address.parse(nftMinterStr);

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vaultAddress = Address.parse(vaultStr);

    const oracleMonitorStr = await provider.ui().input('Enter OracleMonitor address:');
    const oracleMonitorAddress = Address.parse(oracleMonitorStr);

    const assetIdStr = await provider.ui().input('Enter oracle asset ID (1=RedStone, 2=Pyth, 3=Chainlink, etc.):');
    const assetId = parseInt(assetIdStr);

    console.log('\nConfiguration:');
    console.log(`  Parent Factory: ${parentFactoryAddress.toString()}`);
    console.log(`  Master Factory: ${masterFactoryAddress.toString()}`);
    console.log(`  NFT Minter: ${nftMinterAddress.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  Oracle Monitor: ${oracleMonitorAddress.toString()}`);
    console.log(`  Asset ID: ${assetId}`);
    console.log(`  Product Type: 3 (ORACLE)`);

    // Step 3: Deploy OracleChild
    console.log('\nStep 3: Deploying OracleChild...');

    const oracleChild = provider.open(
        OracleChild.createFromConfig(
            {
                parentFactoryAddress: parentFactoryAddress,
                masterFactoryAddress: masterFactoryAddress,
                productType: 3, // PRODUCT_ORACLE
                assetId: assetId,
                policyNFTMinterAddress: nftMinterAddress,
                vaultAddress: vaultAddress,
                oracleMonitorAddress: oracleMonitorAddress,
                policyRegistry: Dictionary.empty(),
                nextPolicyId: 1n,
                totalPoliciesCreated: 0n,
                totalCoverageAmount: 0n,
                paused: false,
            },
            code
        )
    );

    await oracleChild.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(oracleChild.address);
    console.log(`✓ OracleChild deployed: ${oracleChild.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedParent = await oracleChild.getParentFactory();
    const deployedMaster = await oracleChild.getMasterFactory();
    const productType = await oracleChild.getProductType();
    const deployedAssetId = await oracleChild.getAssetId();
    const deployedNFTMinter = await oracleChild.getPolicyNFTMinter();
    const deployedVault = await oracleChild.getVault();
    const deployedMonitor = await oracleChild.getOracleMonitor();
    const nextPolicyId = await oracleChild.getNextPolicyId();
    const totalPolicies = await oracleChild.getTotalPolicies();
    const paused = await oracleChild.getPaused();
    const version = await oracleChild.getVersion();
    const triggerParams = await oracleChild.getTriggerParams();

    console.log('  Deployed configuration:');
    console.log(`    Parent Factory: ${deployedParent.toString()}`);
    console.log(`    Master Factory: ${deployedMaster.toString()}`);
    console.log(`    Product Type: ${productType}`);
    console.log(`    Asset ID: ${deployedAssetId}`);
    console.log(`    NFT Minter: ${deployedNFTMinter.toString()}`);
    console.log(`    Vault: ${deployedVault.toString()}`);
    console.log(`    Oracle Monitor: ${deployedMonitor.toString()}`);
    console.log(`    Next Policy ID: ${nextPolicyId}`);
    console.log(`    Total Policies: ${totalPolicies}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);
    console.log(`    Staleness Threshold: ${triggerParams.stalenessThreshold}s (${triggerParams.stalenessThreshold / 60} min)`);
    console.log(`    Deviation Threshold: ${triggerParams.deviationThreshold / 100}%`);

    // Verify configuration
    if (!deployedParent.equals(parentFactoryAddress)) throw new Error('Parent factory mismatch!');
    if (!deployedMaster.equals(masterFactoryAddress)) throw new Error('Master factory mismatch!');
    if (productType !== 3) throw new Error('Product type should be 3 (ORACLE)!');
    if (deployedAssetId !== assetId) throw new Error('Asset ID mismatch!');
    if (nextPolicyId !== 1n) throw new Error('Next policy ID should be 1!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const oracleNames: { [key: number]: string } = {
        1: 'RedStone',
        2: 'Pyth Network',
        3: 'Chainlink',
        4: 'API3',
        5: 'DIA',
        6: 'Band Protocol',
    };

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        oracleChild: {
            address: oracleChild.address.toString(),
            parentFactory: parentFactoryAddress.toString(),
            masterFactory: masterFactoryAddress.toString(),
            nftMinter: nftMinterAddress.toString(),
            vault: vaultAddress.toString(),
            oracleMonitor: oracleMonitorAddress.toString(),
            productType: 3,
            assetId: assetId,
            assetName: oracleNames[assetId] || 'Unknown Oracle',
            version: 3,
        },
        pricing: {
            baseAPR: '1.5%',
            formula: 'coverage × APR × (days / 365)',
        },
        trigger: {
            stalenessThreshold: triggerParams.stalenessThreshold,
            deviationThreshold: triggerParams.deviationThreshold,
            description: 'Data stale > 30 min OR price deviation > 5%',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/oracle-child-v3-asset${assetId}-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('OracleChild V3:', oracleChild.address.toString());
    console.log('Oracle:', oracleNames[assetId] || `ID ${assetId}`);

    console.log('\nAdd to .env:');
    console.log(`ORACLE_CHILD_V3_ASSET${assetId}_ADDRESS=${oracleChild.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register child with OracleSubFactory:');
        console.log(`   oracleSubFactory.sendRegisterChild(masterFactory, {`);
        console.log(`     value: toNano('0.1'),`);
        console.log(`     assetId: ${assetId},`);
        console.log(`     childAddress: '${oracleChild.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Configure oracle monitor relayer:');
        console.log('   - Set up health monitoring for oracle');
        console.log('   - Track staleness (data age > 30 min)');
        console.log('   - Track deviation (price movement > 5%)');
        console.log('   - Push health updates every 2 minutes');
        console.log('3. Test policy creation:');
        console.log('   - Create test policy via OracleSubFactory');
        console.log('   - Verify NFT minting');
        console.log('   - Verify Vault escrow creation');
        console.log('   - Verify MasterFactory registration');
        console.log('4. Monitor oracle health metrics');
        console.log('5. Test claim flow when oracle fails');
    } else {
        console.log('1. Run tests: npx jest tests/v3/OracleChild.spec.ts');
        console.log('2. Register with OracleSubFactory (if deployed)');
        console.log('3. Test policy creation flow:');
        console.log('   OracleSubFactory → OracleChild → PolicyNFT + Vault + MasterFactory');
        console.log('4. Test oracle monitor updates:');
        console.log('   await child.sendOracleHealthUpdate(monitor, { lastUpdate, deviation })');
        console.log('5. Test failure trigger:');
        console.log('   - Report stale data (> 30 min)');
        console.log('   - Report price deviation (> 5%)');
        console.log('   - Verify claim triggered');
        console.log('6. Verify premium calculation:');
        console.log('   const premium = await child.getPremiumQuote(coverage, days)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nPremium Formula:');
    console.log('  Base APR: 1.5% (150 basis points)');
    console.log('  Formula: coverage × (APR / 10000) × (days / 365)');
    console.log('  Example: $100,000 × 0.015 × (90/365) = $369.86');

    console.log('\nOracle Failure Triggers:');
    console.log(`  Staleness: > ${triggerParams.stalenessThreshold / 60} minutes`);
    console.log(`  Deviation: > ${triggerParams.deviationThreshold / 100}%`);
    console.log('  Logic: Triggers when EITHER condition met:');
    console.log('    1. Oracle data not updated for 30+ minutes (staleness)');
    console.log('    2. Oracle price deviates > 5% from consensus (deviation)');
    console.log('  Detection: Monitor checks health every 2 minutes');

    console.log('\nPolicy Flow:');
    console.log('  1. User sends premium → OracleSubFactory → OracleChild');
    console.log('  2. OracleChild creates policy (validates premium)');
    console.log('  3. Parallel messages sent:');
    console.log('     a) PolicyNFTMinter: Mint NFT certificate');
    console.log('     b) Vault: Create escrow with collateral');
    console.log('     c) MasterFactory: Register policy for claim coordination');
    console.log('  4. Oracle Monitor monitors health → Triggers claim on failure');
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
    console.log('const premium = await child.getPremiumQuote(toNano("100000"), 90)');
    console.log('\n// Update oracle health');
    console.log('await child.sendOracleHealthUpdate(monitor, {');
    console.log('  value: toNano("0.05"),');
    console.log('  lastUpdateTime: Math.floor(Date.now() / 1000) - 1900, // Stale!');
    console.log('  priceDeviation: 600 // 6% deviation (above 5% threshold)');
    console.log('})');
    console.log('\n// Check policy');
    console.log('const policy = await child.getPolicy(policyId)');
    console.log('\n// Check trigger parameters');
    console.log('const params = await child.getTriggerParams()');
    console.log('\n// Pause child (from parent factory)');
    console.log('await child.sendPause(parentFactory, toNano("0.05"))');
}
