import { toNano, Address, Dictionary } from '@ton/core';
import { MasterFactoryProxy } from '../../wrappers/v3/MasterFactoryProxy';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for MasterFactoryProxy V3
 *
 * Purpose: Deploy the upgradable proxy for MasterFactory
 * Network: Testnet/Mainnet
 *
 * Benefits:
 * - Permanent address (users/integrations never need to update)
 * - Upgradable business logic (deploy new impl, update pointer)
 * - State preservation (policy registry, factories preserved)
 * - Rate limiting (24h between upgrades for safety)
 *
 * Requirements:
 * - MasterFactory implementation contract (deployed first)
 * - Admin wallet (for upgrades and management)
 *
 * Post-Deployment:
 * 1. Register product factory codes via proxy
 * 2. Configure dependencies (GasWallet, SBTVerifier, etc.)
 * 3. Deploy sub-factories
 * 4. Test upgrade flow on testnet
 */

export async function run(provider: NetworkProvider) {
    console.log('=== MasterFactoryProxy V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the MasterFactoryProxy contract');
        console.warn('⚠️  This address will be PERMANENT (used for all integrations)');
        console.warn('⚠️  Estimated cost: ~1 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile proxy contract
    console.log('Step 1: Compiling MasterFactoryProxy...');
    const proxyCode = await compile('MasterFactoryProxy');
    console.log('✓ Proxy contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const implAddressStr = await provider.ui().input('Enter MasterFactory implementation address:');
    const implementationAddress = Address.parse(implAddressStr);

    const adminAddressStr = await provider.ui().input('Enter admin address (recommend multi-sig):');
    const adminAddress = Address.parse(adminAddressStr);

    const protocolVersionStr = await provider.ui().input('Enter initial protocol version [default: 1]:');
    const protocolVersion = protocolVersionStr ? parseInt(protocolVersionStr) : 1;

    console.log('\nConfiguration:');
    console.log(`  Implementation: ${implementationAddress.toString()}`);
    console.log(`  Admin: ${adminAddress.toString()}`);
    console.log(`  Protocol Version: ${protocolVersion}`);
    console.log(`  Paused: false`);
    console.log(`  Last Upgrade: 0 (never)`);

    if (isMainnet) {
        console.log('\n⚠️  Security Recommendations:');
        console.log('  - Use 3-of-5 multi-sig for admin');
        console.log('  - Test upgrade flow on testnet first');
        console.log('  - Prepare emergency pause procedure');
        console.log('  - Document upgrade process for team\n');

        const confirm = await provider.ui().input('Confirm mainnet deployment? (yes/no):');
        if (confirm.toLowerCase() !== 'yes') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 3: Deploy MasterFactoryProxy
    console.log('\nStep 3: Deploying MasterFactoryProxy...');

    const proxy = provider.open(
        MasterFactoryProxy.createFromConfig(
            {
                implementationAddress: implementationAddress,
                adminAddress: adminAddress,
                paused: false,
                lastUpgradeTimestamp: 0,
                activePolicies: Dictionary.empty(),
                productFactories: Dictionary.empty(),
                totalPoliciesCreated: 0n,
                protocolVersion: protocolVersion,
            },
            proxyCode
        )
    );

    await proxy.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(proxy.address);
    console.log(`✓ MasterFactoryProxy deployed: ${proxy.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedImpl = await proxy.getImplementation();
    const deployedAdmin = await proxy.getAdmin();
    const deployedVersion = await proxy.getProtocolVersion();
    const deployedPaused = await proxy.getPaused();
    const lastUpgrade = await proxy.getLastUpgradeTimestamp();
    const totalPolicies = await proxy.getTotalPoliciesCreated();

    console.log('  Deployed configuration:');
    console.log(`    Implementation: ${deployedImpl.toString()}`);
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Protocol Version: ${deployedVersion}`);
    console.log(`    Paused: ${deployedPaused}`);
    console.log(`    Last Upgrade: ${lastUpgrade}`);
    console.log(`    Total Policies: ${totalPolicies}`);

    // Verify configuration
    if (!deployedImpl.equals(implementationAddress)) throw new Error('Implementation address mismatch!');
    if (!deployedAdmin.equals(adminAddress)) throw new Error('Admin address mismatch!');
    if (deployedVersion !== protocolVersion) throw new Error('Protocol version mismatch!');
    if (deployedPaused !== false) throw new Error('Proxy should not be paused!');
    if (lastUpgrade !== 0) throw new Error('Last upgrade timestamp should be 0!');
    if (totalPolicies !== 0n) throw new Error('Total policies should be 0!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Test basic operations
    console.log('Step 5: Testing basic operations...');

    // Test get methods
    const hasPolicy = await proxy.hasPolicy(1n);
    console.log(`  hasPolicy(1): ${hasPolicy}`);

    const depegFactory = await proxy.getProductFactory(1);
    console.log(`  getProductFactory(DEPEG): ${depegFactory || 'Not deployed'}`);

    console.log('✓ Basic operations working\n');

    // Step 6: Save deployment manifest
    console.log('Step 6: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        proxy: {
            address: proxy.address.toString(),
            implementation: implementationAddress.toString(),
            admin: adminAddress.toString(),
            protocolVersion: protocolVersion,
            paused: false,
            type: 'MasterFactoryProxy',
        },
        upgradePolicy: {
            minTimeBetweenUpgrades: '24 hours',
            adminType: isMainnet ? 'Multi-sig (recommended)' : 'Single wallet',
            emergencyPause: true,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/master-factory-proxy-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 7: Output
    console.log('=== Deployment Complete ===\n');
    console.log('MasterFactoryProxy:', proxy.address.toString());
    console.log('Implementation:', implementationAddress.toString());
    console.log('Admin:', adminAddress.toString());

    console.log('\n⚠️  IMPORTANT: Save this address permanently!');
    console.log('This is the ONLY address users/integrations should use.');
    console.log('The implementation can be upgraded without changing this address.\n');

    console.log('Add to .env:');
    console.log(`MASTER_FACTORY_PROXY_ADDRESS=${proxy.address.toString()}`);
    console.log(`MASTER_FACTORY_IMPL_ADDRESS=${implementationAddress.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "core": {`);
    console.log(`    "masterFactoryProxy": {`);
    console.log(`      "address": "${proxy.address.toString()}",`);
    console.log(`      "description": "Main entry point for policy creation (upgradable)"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Update frontend to use PROXY address (not implementation)');
        console.log('2. Configure dependencies via proxy:');
        console.log('   - sendRegisterProductFactory (for each product type)');
        console.log('   - sendSetFactoryCode (for each product type)');
        console.log('3. Test policy creation flow');
        console.log('4. Monitor for 24 hours before first upgrade');
        console.log('5. Prepare upgrade procedure:');
        console.log('   a. Deploy new implementation');
        console.log('   b. Test on testnet');
        console.log('   c. Wait 24h from last upgrade');
        console.log('   d. sendUpgradeImplementation via admin');
        console.log('6. Document upgrade process for team');
    } else {
        console.log('1. Run tests: npx jest tests/v3/MasterFactoryProxy.spec.ts');
        console.log('2. Test upgrade flow:');
        console.log('   a. Deploy new implementation contract');
        console.log('   b. Call sendUpgradeImplementation (admin only)');
        console.log('   c. Verify protocol version incremented');
        console.log('   d. Verify state preserved (policies, factories)');
        console.log('3. Test forwarding:');
        console.log('   - sendCreatePolicy (forwarded to impl)');
        console.log('   - sendRegisterProductFactory (forwarded to impl)');
        console.log('4. Verify gas overhead (~0.005 TON per forward)');
        console.log('5. Test emergency pause/unpause');
        console.log('6. Deploy to mainnet when ready');
    }

    console.log('\nUpgrade Commands:');
    console.log('// To upgrade implementation (admin only, 24h cooldown):');
    console.log(`proxy.sendUpgradeImplementation(admin.getSender(), {`);
    console.log(`  value: toNano('0.05'),`);
    console.log(`  implementationAddress: newImplAddress,`);
    console.log(`});`);

    console.log('\n// To emergency pause (admin only):');
    console.log(`proxy.sendPauseProxy(admin.getSender(), toNano('0.05'));`);

    console.log('\n// To change admin (current admin only):');
    console.log(`proxy.sendSetAdmin(admin.getSender(), {`);
    console.log(`  value: toNano('0.05'),`);
    console.log(`  adminAddress: newAdminAddress,`);
    console.log(`});`);

    console.log('\nProxy Benefits:');
    console.log('✓ Permanent address (never changes for users)');
    console.log('✓ Upgradable logic (fix bugs, add features)');
    console.log('✓ State preservation (policy registry intact)');
    console.log('✓ Rate limiting (24h between upgrades)');
    console.log('✓ Emergency pause (admin protection)');
}
