import { toNano, Address } from '@ton/core';
import {
    ParametricEscrow,
    STATUS_PENDING,
    PRODUCT_TYPE_DEPEG,
    DEFAULT_USER_SHARE_BPS,
    DEFAULT_LP_SHARE_BPS,
    DEFAULT_STAKER_SHARE_BPS,
    DEFAULT_PROTOCOL_SHARE_BPS,
    DEFAULT_ARBITER_SHARE_BPS,
    DEFAULT_BUILDER_SHARE_BPS,
    DEFAULT_ADMIN_SHARE_BPS,
    DEFAULT_GAS_REFUND_BPS,
} from '../../wrappers/v3/ParametricEscrow';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for ParametricEscrow V3
 *
 * Purpose: Deploy insurance claims escrow with parametric trigger validation
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Parametric trigger validation (oracle-verified conditions)
 * - 8-party distribution on claim payout (90% user, 10% ecosystem)
 * - Timeout handling (expiry → refund vault)
 * - Dispute resolution (freeze, resolve, emergency withdraw)
 * - Integration with PriceOracle for trigger verification
 *
 * Status Flow:
 * 1. PENDING: Awaiting collateral deposit from vault
 * 2. ACTIVE: Collateral locked, monitoring trigger conditions
 * 3. PAID_OUT: Claim triggered → 8-party distribution executed
 * 4. EXPIRED: Policy expired → collateral refunded to vault
 * 5. DISPUTED: Frozen by admin for investigation
 * 6. CANCELLED: Emergency withdraw after 30+ days disputed
 *
 * 8-Party Distribution (Claim Payout):
 * - User: 90% ($9,000 on $10k claim)
 * - LP Rewards: 3% ($300)
 * - Staker Rewards: 2% ($200)
 * - Protocol Treasury: 1.5% ($150)
 * - Arbiter Rewards: 1% ($100)
 * - Builder Rewards: 1% ($100)
 * - Admin Fee: 1% ($100)
 * - Gas Refund: 0.5% ($50 to oracle)
 *
 * Trigger Validation:
 * - Oracle calls PriceOracle.validate_trigger(product_type, asset_id, threshold, duration)
 * - Returns (is_triggered:bool, proof:cell)
 * - If triggered, oracle calls escrow.trigger_claim(proof)
 * - Escrow validates proof, distributes to 8 parties
 *
 * Deployment Modes:
 * 1. Factory Mode (Recommended):
 *    - MasterFactory deploys escrow per policy
 *    - Escrow address derived from policy_id
 *    - Automatic initialization with collateral
 *
 * 2. Standalone Mode (Testing):
 *    - Manual deployment for testing
 *    - Requires manual initialization
 *    - Used for integration testing
 *
 * Requirements:
 * - Policy owner address
 * - Vault address (MultiTrancheVault)
 * - Oracle address (PriceOracle)
 * - Admin address (MasterFactory)
 * - Coverage amount (e.g., $10k)
 * - Product type (Depeg, Bridge, Oracle, Protocol)
 * - Trigger parameters (threshold, duration)
 * - 6 party reward addresses
 *
 * Post-Deployment:
 * 1. Initialize escrow with collateral from vault
 * 2. Oracle monitors trigger conditions
 * 3. User files claim if trigger occurs
 * 4. Oracle validates trigger via PriceOracle
 * 5. Oracle calls trigger_claim() with proof
 * 6. Escrow distributes to 8 parties
 */

export async function run(provider: NetworkProvider) {
    console.log('=== ParametricEscrow V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy a ParametricEscrow contract');
        console.warn('⚠️  This is for TESTING ONLY - use MasterFactory for production');
        console.warn('⚠️  Estimated cost: ~0.2 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling ParametricEscrow...');
    const code = await compile('ParametricEscrow');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const policyOwnerStr = await provider.ui().input('Enter policy owner address:');
    const policyOwner = Address.parse(policyOwnerStr);

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vault = Address.parse(vaultStr);

    const oracleStr = await provider.ui().input('Enter PriceOracle address:');
    const oracle = Address.parse(oracleStr);

    const adminStr = await provider.ui().input('Enter admin (MasterFactory) address:');
    const admin = Address.parse(adminStr);

    const coverageAmountStr = await provider.ui().input('Enter coverage amount in TON (e.g., 10000):');
    const coverageAmount = toNano(coverageAmountStr);

    const expiryDaysStr = await provider.ui().input('Enter policy duration in days (e.g., 30):');
    const expiryDays = parseInt(expiryDaysStr);
    const now = Math.floor(Date.now() / 1000);
    const expiryTimestamp = now + expiryDays * 86400;

    const lpRewardsStr = await provider.ui().input('Enter LP rewards address:');
    const lpRewards = Address.parse(lpRewardsStr);

    const stakerRewardsStr = await provider.ui().input('Enter staker rewards address:');
    const stakerRewards = Address.parse(stakerRewardsStr);

    const protocolTreasuryStr = await provider.ui().input('Enter protocol treasury address:');
    const protocolTreasury = Address.parse(protocolTreasuryStr);

    const arbiterRewardsStr = await provider.ui().input('Enter arbiter rewards address:');
    const arbiterRewards = Address.parse(arbiterRewardsStr);

    const builderRewardsStr = await provider.ui().input('Enter builder rewards address:');
    const builderRewards = Address.parse(builderRewardsStr);

    const adminFeeStr = await provider.ui().input('Enter admin fee address:');
    const adminFee = Address.parse(adminFeeStr);

    console.log('\nConfiguration:');
    console.log(`  Policy Owner: ${policyOwner.toString()}`);
    console.log(`  Vault: ${vault.toString()}`);
    console.log(`  Oracle: ${oracle.toString()}`);
    console.log(`  Admin: ${admin.toString()}`);
    console.log(`  Coverage: ${coverageAmountStr} TON`);
    console.log(`  Duration: ${expiryDays} days`);
    console.log(`  Expiry: ${new Date(expiryTimestamp * 1000).toISOString()}`);

    // Step 3: Deploy ParametricEscrow
    console.log('\nStep 3: Deploying ParametricEscrow...');

    const escrow = provider.open(
        ParametricEscrow.createFromConfig(
            {
                policyId: 1n, // Test policy ID
                policyOwner: policyOwner,
                vaultAddress: vault,
                oracleAddress: oracle,
                adminAddress: admin,
                coverageAmount: coverageAmount,
                collateralAmount: 0n,
                status: STATUS_PENDING,
                createdAt: now,
                expiryTimestamp: expiryTimestamp,
                productType: PRODUCT_TYPE_DEPEG,
                assetId: 1, // USDT
                triggerThreshold: 980000, // $0.98
                triggerDuration: 300, // 5 minutes
                userShareBps: DEFAULT_USER_SHARE_BPS,
                lpShareBps: DEFAULT_LP_SHARE_BPS,
                stakerShareBps: DEFAULT_STAKER_SHARE_BPS,
                protocolShareBps: DEFAULT_PROTOCOL_SHARE_BPS,
                arbiterShareBps: DEFAULT_ARBITER_SHARE_BPS,
                builderShareBps: DEFAULT_BUILDER_SHARE_BPS,
                adminShareBps: DEFAULT_ADMIN_SHARE_BPS,
                gasRefundBps: DEFAULT_GAS_REFUND_BPS,
                lpRewardsAddress: lpRewards,
                stakerRewardsAddress: stakerRewards,
                protocolTreasuryAddress: protocolTreasury,
                arbiterRewardsAddress: arbiterRewards,
                builderRewardsAddress: builderRewards,
                adminFeeAddress: adminFee,
            },
            code
        )
    );

    await escrow.sendDeploy(provider.sender(), toNano('0.2'));
    await provider.waitForDeploy(escrow.address);
    console.log(`✓ ParametricEscrow deployed: ${escrow.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const info = await escrow.getEscrowInfo();
    const status = await escrow.getStatus();
    const distribution = await escrow.getDistribution();
    const version = await escrow.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Policy ID: ${info.policyId}`);
    console.log(`    Owner: ${info.policyOwner.toString()}`);
    console.log(`    Coverage: ${info.coverageAmount}`);
    console.log(`    Status: ${status} (PENDING)`);
    console.log(`    Expiry: ${new Date(info.expiryTimestamp * 1000).toISOString()}`);
    console.log(`    Version: ${version}`);

    console.log('\n  8-Party Distribution:');
    console.log(`    User: ${distribution.userShareBps / 100}%`);
    console.log(`    LP: ${distribution.lpShareBps / 100}%`);
    console.log(`    Staker: ${distribution.stakerShareBps / 100}%`);
    console.log(`    Protocol: ${distribution.protocolShareBps / 100}%`);
    console.log(`    Arbiter: ${distribution.arbiterShareBps / 100}%`);
    console.log(`    Builder: ${distribution.builderShareBps / 100}%`);
    console.log(`    Admin: ${distribution.adminShareBps / 100}%`);
    console.log(`    Gas Refund: ${distribution.gasRefundBps / 100}%`);

    if (status !== STATUS_PENDING) throw new Error('Status should be PENDING!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        parametricEscrow: {
            address: escrow.address.toString(),
            policyId: Number(info.policyId),
            owner: policyOwner.toString(),
            vault: vault.toString(),
            oracle: oracle.toString(),
            admin: admin.toString(),
            coverage: coverageAmountStr,
            expiryDays: expiryDays,
            version: 3,
        },
        distribution: {
            user: `${distribution.userShareBps / 100}%`,
            lp: `${distribution.lpShareBps / 100}%`,
            staker: `${distribution.stakerShareBps / 100}%`,
            protocol: `${distribution.protocolShareBps / 100}%`,
            arbiter: `${distribution.arbiterShareBps / 100}%`,
            builder: `${distribution.builderShareBps / 100}%`,
            admin: `${distribution.adminShareBps / 100}%`,
            gasRefund: `${distribution.gasRefundBps / 100}%`,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/parametric-escrow-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('ParametricEscrow V3:', escrow.address.toString());

    console.log('\nNext Steps:');
    console.log('1. Initialize escrow with collateral from vault');
    console.log('   vault.sendInitializeEscrow(escrow, coverageAmount)');
    console.log('');
    console.log('2. Oracle monitors trigger conditions');
    console.log('   - Depeg: USDT/USD < $0.98 for 5+ minutes');
    console.log('   - Oracle calls PriceOracle.validate_trigger()');
    console.log('');
    console.log('3. If triggered, oracle calls trigger_claim()');
    console.log('   oracle.sendTriggerClaim(escrow, proof)');
    console.log('');
    console.log('4. Escrow distributes to 8 parties');
    console.log(`   User: ${(Number(coverageAmount) / 1e9) * 0.9} TON (90%)`);
    console.log(`   LP: ${(Number(coverageAmount) / 1e9) * 0.03} TON (3%)`);
    console.log(`   Staker: ${(Number(coverageAmount) / 1e9) * 0.02} TON (2%)`);
    console.log(`   Protocol: ${(Number(coverageAmount) / 1e9) * 0.015} TON (1.5%)`);
    console.log(`   Arbiter: ${(Number(coverageAmount) / 1e9) * 0.01} TON (1%)`);
    console.log(`   Builder: ${(Number(coverageAmount) / 1e9) * 0.01} TON (1%)`);
    console.log(`   Admin: ${(Number(coverageAmount) / 1e9) * 0.01} TON (1%)`);
    console.log(`   Gas Refund: ${(Number(coverageAmount) / 1e9) * 0.005} TON (0.5%)`);

    console.log('\nClaim Flow Example:');
    console.log('  Scenario: User buys $10k USDT depeg insurance');
    console.log('');
    console.log('  1. User pays premium: $100 (1% APR × 30 days)');
    console.log('  2. MasterFactory deploys ParametricEscrow');
    console.log('  3. MultiTrancheVault locks $10k collateral in escrow');
    console.log('  4. Escrow status: PENDING → ACTIVE');
    console.log('');
    console.log('  5. Day 15: USDT depegs to $0.965');
    console.log('  6. Oracle detects: price < $0.98 for 5+ minutes');
    console.log('  7. Oracle validates trigger via PriceOracle');
    console.log('  8. PriceOracle returns: is_triggered=true, proof={...}');
    console.log('');
    console.log('  9. Oracle calls escrow.trigger_claim(proof)');
    console.log(' 10. Escrow validates proof (policy_id, product_type, threshold match)');
    console.log(' 11. Escrow distributes $10k:');
    console.log('     - User: $9,000 (immediate payout)');
    console.log('     - LP Rewards: $300');
    console.log('     - Staker Rewards: $200');
    console.log('     - Protocol Treasury: $150');
    console.log('     - Arbiter Rewards: $100');
    console.log('     - Builder Rewards: $100');
    console.log('     - Admin Fee: $100');
    console.log('     - Gas Refund: $50 (to oracle)');
    console.log('');
    console.log(' 12. Escrow status: ACTIVE → PAID_OUT');
    console.log(' 13. Escrow notifies vault to absorb $10k loss via waterfall');

    console.log('\nExpiry Flow:');
    console.log('  Scenario: Policy expires without trigger');
    console.log('');
    console.log('  1. 30 days pass, no depeg event');
    console.log('  2. Anyone calls escrow.handle_expiry()');
    console.log('  3. Escrow refunds $10k collateral to vault');
    console.log('  4. Escrow status: ACTIVE → EXPIRED');
    console.log('  5. Vault marks allocation as released');

    console.log('\nDispute Flow:');
    console.log('  Scenario: Disputed claim (ambiguous trigger)');
    console.log('');
    console.log('  1. Admin calls escrow.freeze_dispute()');
    console.log('  2. Escrow status: ACTIVE → DISPUTED');
    console.log('  3. Investigation period (manual review)');
    console.log('  4. Admin calls escrow.resolve_dispute(resolution)');
    console.log('     - resolution=0: Refund vault (false claim)');
    console.log('     - resolution=1: Pay user (valid claim)');
    console.log('     - resolution=2: Split 50/50 (partial validity)');
    console.log('  5. Escrow executes resolution');
    console.log('  6. Escrow status: DISPUTED → EXPIRED/PAID_OUT');
    console.log('');
    console.log('  Emergency Withdraw (30+ days disputed):');
    console.log('    - Admin calls escrow.emergency_withdraw()');
    console.log('    - Escrow refunds vault, status: DISPUTED → CANCELLED');

    console.log('\n8-Party Rationale:');
    console.log('  User (90%):');
    console.log('    - Primary beneficiary, expects full coverage');
    console.log('    - 90% is standard insurance payout rate');
    console.log('');
    console.log('  LP Rewards (3%):');
    console.log('    - LPs absorb first loss via waterfall');
    console.log('    - Compensates LP risk with 3% of all claims');
    console.log('');
    console.log('  Staker Rewards (2%):');
    console.log('    - SURE stakers provide second-loss coverage');
    console.log('    - Incentivizes staking for protocol security');
    console.log('');
    console.log('  Protocol Treasury (1.5%):');
    console.log('    - Funds development, audits, upgrades');
    console.log('    - Sustains long-term protocol growth');
    console.log('');
    console.log('  Arbiter Rewards (1%):');
    console.log('    - Dispute arbiters earn from all claims');
    console.log('    - Incentivizes fair dispute resolution');
    console.log('');
    console.log('  Builder Rewards (1%):');
    console.log('    - Rewards core developers and contributors');
    console.log('    - Aligns incentives with protocol success');
    console.log('');
    console.log('  Admin Fee (1%):');
    console.log('    - Operational costs (servers, keepers)');
    console.log('    - MasterFactory maintenance');
    console.log('');
    console.log('  Gas Refund (0.5%):');
    console.log('    - Reimburses oracle for trigger gas');
    console.log('    - Ensures oracle profitability');

    console.log('\nProduction Deployment:');
    console.log('  ⚠️  DO NOT deploy escrow contracts manually in production!');
    console.log('  ⚠️  Use MasterFactory.createPolicy() which handles:');
    console.log('    - Policy ID generation');
    console.log('    - Escrow deployment via factory pattern');
    console.log('    - Automatic collateral initialization');
    console.log('    - Policy NFT minting');
    console.log('    - Event logging');
    console.log('');
    console.log('  Example:');
    console.log('    masterFactory.createPolicy({');
    console.log('      product_type: DEPEG,');
    console.log('      asset_id: USDT,');
    console.log('      coverage_amount: 10000,');
    console.log('      duration_days: 30,');
    console.log('      trigger_threshold: 0.98');
    console.log('    })');
}
