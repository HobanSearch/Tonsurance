import { toNano, Address, Dictionary } from '@ton/core';
import { MultiTrancheVaultProxy, MIN_UPGRADE_INTERVAL } from '../../wrappers/v3/MultiTrancheVaultProxy';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for MultiTrancheVaultProxy V3
 *
 * Purpose: Deploy upgradable proxy for Multi-Tranche Vault system
 * Network: Testnet/Mainnet
 *
 * Proxy Pattern Benefits:
 * - LP tokens point to PERMANENT proxy address (never changes)
 * - Vault logic can be upgraded without LP token redeployment
 * - LP balances preserved across upgrades
 * - Tranche allocations preserved across upgrades
 * - 48-hour time-lock prevents rapid/malicious upgrades
 * - Admin can be transferred to DAO governance
 *
 * Upgrade Flow:
 * 1. Deploy new MultiTrancheVault implementation contract
 * 2. Test new implementation on testnet
 * 3. Governance vote on mainnet upgrade proposal
 * 4. Wait 48 hours after last upgrade
 * 5. Admin calls upgrade_implementation with new address
 * 6. Proxy forwards all future calls to new implementation
 * 7. LP state (balances, allocations, TVL) remains intact
 *
 * Security Features:
 * - MIN_UPGRADE_INTERVAL: 48-hour cooldown between upgrades
 * - Admin-only upgrade function (exitCode 401 for non-admins)
 * - Pause mechanism for emergency stops
 * - Protocol version auto-increments on each upgrade
 *
 * State Preservation Across Upgrades:
 * - lpBalances dictionary (user address → balance)
 * - trancheAllocations dictionary (tranche ID → capital)
 * - totalValueLocked (sum of all LP capital)
 * - protocolVersion (increments on each upgrade)
 * - lastUpgradeTimestamp (enforces 48h cooldown)
 * - paused state
 *
 * Requirements:
 * - MultiTrancheVault implementation address (v1)
 * - Admin address (for upgrade control)
 *
 * Post-Deployment:
 * 1. Deploy LP token contracts pointing to PROXY address (not implementation)
 * 2. Set implementation's proxy address via set_proxy_address()
 * 3. Test deposit/withdraw flows through proxy
 * 4. Verify message forwarding to implementation
 * 5. Test upgrade flow on testnet
 */

export async function run(provider: NetworkProvider) {
    console.log('=== MultiTrancheVaultProxy V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the Multi-Tranche Vault PROXY contract');
        console.warn('⚠️  This is the PERMANENT address LPs will interact with');
        console.warn('⚠️  LP tokens will be bound to this address forever');
        console.warn('⚠️  Estimated cost: ~0.3 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling MultiTrancheVaultProxy...');
    const code = await compile('MultiTrancheVaultProxy');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const implementationStr = await provider.ui().input('Enter MultiTrancheVault implementation address:');
    const implementationAddress = Address.parse(implementationStr);

    const adminStr = await provider.ui().input('Enter admin address (for upgrade control):');
    const adminAddress = Address.parse(adminStr);

    console.log('\nConfiguration:');
    console.log(`  Implementation: ${implementationAddress.toString()}`);
    console.log(`  Admin: ${adminAddress.toString()}`);
    console.log(`  Upgrade Interval: ${MIN_UPGRADE_INTERVAL / 3600} hours`);

    // Step 3: Deploy MultiTrancheVaultProxy
    console.log('\nStep 3: Deploying MultiTrancheVaultProxy...');

    const proxy = provider.open(
        MultiTrancheVaultProxy.createFromConfig(
            {
                implementationAddress: implementationAddress,
                adminAddress: adminAddress,
                paused: false,
                lastUpgradeTimestamp: 0,
                lpBalances: Dictionary.empty(),
                trancheAllocations: Dictionary.empty(),
                totalValueLocked: 0n,
                protocolVersion: 1,
            },
            code
        )
    );

    await proxy.sendDeploy(provider.sender(), toNano('0.3'));
    await provider.waitForDeploy(proxy.address);
    console.log(`✓ MultiTrancheVaultProxy deployed: ${proxy.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const impl = await proxy.getImplementation();
    const admin = await proxy.getAdmin();
    const version = await proxy.getProtocolVersion();
    const tvl = await proxy.getTotalValueLocked();
    const paused = await proxy.getPaused();

    console.log('  Deployed configuration:');
    console.log(`    Implementation: ${impl.toString()}`);
    console.log(`    Admin: ${admin.toString()}`);
    console.log(`    Protocol Version: ${version}`);
    console.log(`    Total Value Locked: ${tvl}`);
    console.log(`    Paused: ${paused}`);

    if (impl.toString() !== implementationAddress.toString()) {
        throw new Error('Implementation address mismatch!');
    }
    if (admin.toString() !== adminAddress.toString()) {
        throw new Error('Admin address mismatch!');
    }
    if (version !== 1) throw new Error('Version should be 1!');
    if (tvl !== 0n) throw new Error('TVL should be 0!');
    if (paused !== false) throw new Error('Proxy should not be paused!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        multiTrancheVaultProxy: {
            address: proxy.address.toString(),
            implementation: implementationAddress.toString(),
            admin: adminAddress.toString(),
            version: 1,
            upgradeInterval: `${MIN_UPGRADE_INTERVAL / 3600}h`,
        },
        upgradeMechanism: {
            cooldown: '48 hours',
            governance: 'Admin-controlled (transfer to DAO later)',
            versionIncrement: 'Automatic on upgrade',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/multi-tranche-vault-proxy-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('MultiTrancheVaultProxy V3:', proxy.address.toString());

    console.log('\nAdd to .env:');
    console.log(`MULTI_TRANCHE_VAULT_PROXY_V3_ADDRESS=${proxy.address.toString()}`);

    console.log('\nNext Steps:');
    console.log('1. Deploy 6 LP token (Jetton) contracts for each tranche');
    console.log('   IMPORTANT: LP tokens must point to PROXY address, not implementation!');
    console.log('   Example: lpToken.setVaultAddress(PROXY_ADDRESS)');
    console.log('');
    console.log('2. Configure implementation to recognize proxy');
    console.log('   multiTrancheVault.setProxyAddress(PROXY_ADDRESS)');
    console.log('');
    console.log('3. Test message forwarding');
    console.log('   User → Proxy → Implementation');
    console.log('   Verify all deposit/withdraw operations work');
    console.log('');
    console.log('4. Test upgrade flow on testnet');
    console.log('   - Deploy new implementation (v2)');
    console.log('   - Wait 48 hours (or use testMode to skip)');
    console.log('   - Call proxy.upgradeImplementation(v2Address)');
    console.log('   - Verify LP balances preserved');
    console.log('   - Verify protocol version = 2');

    console.log('\nProxy Pattern Benefits:');
    console.log('  LP Token Stability:');
    console.log('    - LP tokens bound to proxy address (0x123...)');
    console.log('    - Implementation can change (0xABC → 0xDEF)');
    console.log('    - LP tokens never need redeployment');
    console.log('    - User balances preserved across upgrades');
    console.log('');
    console.log('  Upgrade Flexibility:');
    console.log('    - Fix bugs without disrupting LPs');
    console.log('    - Add new features (e.g., new tranches)');
    console.log('    - Optimize gas costs');
    console.log('    - Improve security');
    console.log('');
    console.log('  Security Mechanisms:');
    console.log('    - 48-hour cooldown prevents rapid changes');
    console.log('    - Admin-only upgrades (no user interference)');
    console.log('    - Pause functionality for emergencies');
    console.log('    - Protocol version tracking (audit trail)');

    console.log('\nUpgrade Flow Example:');
    console.log('  Scenario: Fix bug in loss absorption waterfall');
    console.log('');
    console.log('  1. Developers identify bug in MultiTrancheVault v1');
    console.log('  2. Deploy fixed MultiTrancheVault v2 (new address)');
    console.log('  3. Test v2 on testnet for 2 weeks');
    console.log('  4. Governance proposal: "Upgrade to v2 for waterfall fix"');
    console.log('  5. DAO votes: 85% approval');
    console.log('  6. Wait 48 hours from last upgrade (community review)');
    console.log('  7. Admin calls: proxy.upgradeImplementation(v2Address)');
    console.log('  8. Proxy updates:');
    console.log('     - implementation_address: 0xOLD → 0xNEW');
    console.log('     - protocol_version: 1 → 2');
    console.log('     - last_upgrade_timestamp: NOW');
    console.log('  9. All future calls forwarded to v2');
    console.log(' 10. LP balances, allocations, TVL: UNCHANGED');
    console.log(' 11. Users continue deposits/withdrawals seamlessly');

    console.log('\nMessage Forwarding:');
    console.log('  User calls: proxy.deposit(TRANCHE_BTC, 1000 TON)');
    console.log('  ↓');
    console.log('  Proxy receives message with opcode 0x01');
    console.log('  ↓');
    console.log('  Proxy checks: not paused, valid sender');
    console.log('  ↓');
    console.log('  Proxy forwards message to implementation');
    console.log('  ↓');
    console.log('  Implementation executes deposit logic');
    console.log('  ↓');
    console.log('  Implementation updates LP balance in PROXY storage');
    console.log('  ↓');
    console.log('  Implementation mints LP tokens to user');
    console.log('  ↓');
    console.log('  User receives LP tokens + confirmation');

    console.log('\nAdmin Commands:');
    console.log('  Upgrade implementation (after 48h):');
    console.log('    proxy.sendUpgradeImplementation(admin, {');
    console.log('      value: toNano("0.05"),');
    console.log('      newImplementationAddress: newImplAddress');
    console.log('    })');
    console.log('');
    console.log('  Transfer admin to DAO:');
    console.log('    proxy.sendSetAdmin(admin, {');
    console.log('      value: toNano("0.05"),');
    console.log('      newAdminAddress: daoAddress');
    console.log('    })');
    console.log('');
    console.log('  Emergency pause:');
    console.log('    proxy.sendPause(admin, toNano("0.05"))');
    console.log('');
    console.log('  Resume operations:');
    console.log('    proxy.sendUnpause(admin, toNano("0.05"))');

    console.log('\nGovernance Transition:');
    console.log('  Phase 1 (Launch): Admin = Deployer EOA');
    console.log('    - Fast response to critical bugs');
    console.log('    - 48h cooldown still enforced');
    console.log('    - All upgrades announced publicly');
    console.log('');
    console.log('  Phase 2 (3 months): Admin = Multisig (3-of-5)');
    console.log('    - Requires 3 team members to approve upgrades');
    console.log('    - Added security against single point of failure');
    console.log('    - Community monitoring via Tonscan');
    console.log('');
    console.log('  Phase 3 (6 months): Admin = DAO Contract');
    console.log('    - SURE token holders vote on upgrades');
    console.log('    - 7-day voting period + 48h time-lock');
    console.log('    - Fully decentralized governance');
    console.log('    - Example proposal: "Upgrade to v5 for EIP-4626 compatibility"');

    console.log('\nSecurity Considerations:');
    console.log('  ✓ 48-hour cooldown prevents flash governance attacks');
    console.log('  ✓ Admin-only upgrades (exitCode 401 for non-admins)');
    console.log('  ✓ Pause mechanism for emergency circuit breaker');
    console.log('  ✓ Protocol version tracking (audit trail)');
    console.log('  ✓ LP state preserved (no loss of funds)');
    console.log('  ✓ Implementation address immutable during cooldown');
    console.log('  ⚠ Admin key security is critical (use hardware wallet)');
    console.log('  ⚠ Test upgrades on testnet first (always)');
    console.log('  ⚠ Announce upgrades 1 week in advance (community trust)');
}
