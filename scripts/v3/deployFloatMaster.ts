import { toNano, Address, Dictionary } from '@ton/core';
import { FloatMaster, ALLOCATION_RWA, ALLOCATION_BTC, ALLOCATION_DEFI, ALLOCATION_HEDGES } from '../../wrappers/v3/FloatMaster';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for FloatMaster V3
 *
 * Purpose: Deploy central treasury and investment manager
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Receives premiums from all child contracts
 * - Immediate 4-pillar allocation: 50% RWA, 15% BTC, 15% DeFi, 20% Hedges
 * - Capital maturity tracking (active vs expired coverage)
 * - Protocol earned capital management (EQT 25% cap overflow)
 * - Daily yield aggregation from 4 sub-floats
 * - Yield distribution to vault tranches
 *
 * Requirements:
 * - MultiTrancheVault address
 * - RWAFloat address
 * - BTCFloat address
 * - DeFiFloat address
 * - HedgeFloat address
 *
 * Post-Deployment:
 * 1. Configure all child contracts to send premiums here
 * 2. Set up OCaml backend for daily operations:
 *    - Release expired coverage capital
 *    - Aggregate daily yields
 *    - Distribute yields to vault
 * 3. Monitor capital maturity ratio (target: 4-5x)
 */

export async function run(provider: NetworkProvider) {
    console.log('=== FloatMaster V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the FloatMaster contract');
        console.warn('⚠️  This is a CRITICAL system component');
        console.warn('⚠️  Estimated cost: ~1.0 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling FloatMaster...');
    const code = await compile('FloatMaster');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');
    console.log('FloatMaster requires 5 contract addresses:\n');

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vaultAddress = Address.parse(vaultStr);

    const rwaFloatStr = await provider.ui().input('Enter RWAFloat address:');
    const rwaFloatAddress = Address.parse(rwaFloatStr);

    const btcFloatStr = await provider.ui().input('Enter BTCFloat address:');
    const btcFloatAddress = Address.parse(btcFloatStr);

    const defiFloatStr = await provider.ui().input('Enter DeFiFloat address:');
    const defiFloatAddress = Address.parse(defiFloatStr);

    const hedgeFloatStr = await provider.ui().input('Enter HedgeFloat address:');
    const hedgeFloatAddress = Address.parse(hedgeFloatStr);

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  RWA Float: ${rwaFloatAddress.toString()}`);
    console.log(`  BTC Float: ${btcFloatAddress.toString()}`);
    console.log(`  DeFi Float: ${defiFloatAddress.toString()}`);
    console.log(`  Hedge Float: ${hedgeFloatAddress.toString()}`);

    // Step 3: Deploy FloatMaster
    console.log('\nStep 3: Deploying FloatMaster...');

    const floatMaster = provider.open(
        FloatMaster.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                vaultAddress: vaultAddress,
                rwaFloatAddress: rwaFloatAddress,
                btcFloatAddress: btcFloatAddress,
                defiFloatAddress: defiFloatAddress,
                hedgeFloatAddress: hedgeFloatAddress,
                totalPremiumsCollected: 0n,
                totalClaimsPaid: 0n,
                protocolEarnedCapital: 0n,
                activePolicies: Dictionary.empty(),
                totalActiveCoverage: 0n,
                activeCoverageCapital: 0n,
                expiredCoverageCapital: 0n,
                coverageMaturities: Dictionary.empty(),
                rwaAllocated: 0n,
                btcAllocated: 0n,
                defiAllocated: 0n,
                hedgeAllocated: 0n,
                illiquidDeployment: 0n,
                paused: false,
            },
            code
        )
    );

    await floatMaster.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(floatMaster.address);
    console.log(`✓ FloatMaster deployed: ${floatMaster.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await floatMaster.getAdmin();
    const deployedVault = await floatMaster.getVault();
    const deployedRWA = await floatMaster.getRWAFloat();
    const deployedBTC = await floatMaster.getBTCFloat();
    const deployedDeFi = await floatMaster.getDeFiFloat();
    const deployedHedge = await floatMaster.getHedgeFloat();
    const totalPremiums = await floatMaster.getTotalPremiumsCollected();
    const floatBalance = await floatMaster.getTotalFloatBalance();
    const paused = await floatMaster.getPaused();
    const version = await floatMaster.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Vault: ${deployedVault.toString()}`);
    console.log(`    RWA Float: ${deployedRWA.toString()}`);
    console.log(`    BTC Float: ${deployedBTC.toString()}`);
    console.log(`    DeFi Float: ${deployedDeFi.toString()}`);
    console.log(`    Hedge Float: ${deployedHedge.toString()}`);
    console.log(`    Total Premiums: ${totalPremiums}`);
    console.log(`    Float Balance: ${floatBalance}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedVault.equals(vaultAddress)) throw new Error('Vault mismatch!');
    if (!deployedRWA.equals(rwaFloatAddress)) throw new Error('RWA Float mismatch!');
    if (!deployedBTC.equals(btcFloatAddress)) throw new Error('BTC Float mismatch!');
    if (!deployedDeFi.equals(defiFloatAddress)) throw new Error('DeFi Float mismatch!');
    if (!deployedHedge.equals(hedgeFloatAddress)) throw new Error('Hedge Float mismatch!');
    if (totalPremiums !== 0n) throw new Error('Total premiums should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        floatMaster: {
            address: floatMaster.address.toString(),
            admin: deployedAdmin.toString(),
            vault: vaultAddress.toString(),
            rwaFloat: rwaFloatAddress.toString(),
            btcFloat: btcFloatAddress.toString(),
            defiFloat: defiFloatAddress.toString(),
            hedgeFloat: hedgeFloatAddress.toString(),
            version: 3,
        },
        allocation: {
            rwa: `${ALLOCATION_RWA / 100}%`,
            btc: `${ALLOCATION_BTC / 100}%`,
            defi: `${ALLOCATION_DEFI / 100}%`,
            hedges: `${ALLOCATION_HEDGES / 100}%`,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/float-master-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('FloatMaster V3:', floatMaster.address.toString());

    console.log('\nAdd to .env:');
    console.log(`FLOAT_MASTER_V3_ADDRESS=${floatMaster.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Configure all child contracts to use this FloatMaster');
        console.log('2. Set up OCaml backend cron jobs:');
        console.log('   - Daily yield aggregation (00:00 UTC)');
        console.log('   - Expired coverage release (every hour)');
        console.log('3. Monitor capital maturity ratio (target: 4-5x)');
        console.log('4. Test premium allocation flow:');
        console.log('   Child → FloatMaster → 4 Sub-Floats');
        console.log('5. Verify yield distribution:');
        console.log('   4 Sub-Floats → FloatMaster → Vault Tranches');
    } else {
        console.log('1. Run tests: npx jest tests/v3/FloatMaster.spec.ts');
        console.log('2. Test premium allocation:');
        console.log('   await floatMaster.sendReceivePremium(child, { policyId, premium, ... })');
        console.log('3. Test yield aggregation:');
        console.log('   await floatMaster.sendAggregateDailyYield(admin, { rwaYield, btcYield, ... })');
        console.log('4. Test expired coverage release:');
        console.log('   await floatMaster.sendReleaseExpiredCoverage(admin, { expiryTimestamp })');
        console.log('5. Deploy to mainnet when ready');
    }

    console.log('\n4-Pillar Allocation:');
    console.log(`  RWA Float: ${ALLOCATION_RWA / 100}% (Liquid RWAs: T-Bills, MMFs)`);
    console.log(`  BTC Float: ${ALLOCATION_BTC / 100}% (Bitcoin staking via Babylon)`);
    console.log(`  DeFi Float: ${ALLOCATION_DEFI / 100}% (DEX LPs, Lending)`);
    console.log(`  Hedge Float: ${ALLOCATION_HEDGES / 100}% (External hedges: Polymarket, Perps, Allianz)`);
    console.log('  Total: 100%');

    console.log('\nPremium Flow:');
    console.log('  1. Child contract receives policy premium');
    console.log('  2. Child sends premium → FloatMaster (op::receive_premium)');
    console.log('  3. FloatMaster IMMEDIATELY allocates to 4 sub-floats:');
    console.log('     a) RWAFloat: 50% → Invest in liquid RWAs');
    console.log('     b) BTCFloat: 15% → Stake BTC via Babylon');
    console.log('     c) DeFiFloat: 15% → Deploy to DEX/Lending');
    console.log('     d) HedgeFloat: 20% → Execute external hedges');
    console.log('  4. FloatMaster tracks policy coverage for maturity calculation');

    console.log('\nDaily Yield Flow:');
    console.log('  1. OCaml backend queries 4 sub-floats for daily yield:');
    console.log('     - RWAFloat: Accrued interest from T-Bills/MMFs');
    console.log('     - BTCFloat: BTC staking rewards');
    console.log('     - DeFiFloat: LP fees + lending interest');
    console.log('     - HedgeFloat: Hedge PnL (positive/negative)');
    console.log('  2. Backend calls FloatMaster.sendAggregateDailyYield()');
    console.log('  3. FloatMaster distributes to 6 vault tranches:');
    console.log('     - BTC: 15% (first-loss backstop)');
    console.log('     - SNR: 20% (senior tranche)');
    console.log('     - MEZZ: 25% (mezzanine)');
    console.log('     - JNR: 20% (junior)');
    console.log('     - JNR+: 15% (junior plus)');
    console.log('     - EQT: 5% (equity tranche, protocol earned)');

    console.log('\nCapital Maturity Tracking:');
    console.log('  Active Coverage: Sum of all active policy coverage amounts');
    console.log('  Expired Coverage: Policies that have expired but capital still deployed');
    console.log('  Maturity Ratio: total_float_balance / active_coverage_capital');
    console.log('  Target Ratio: 4-5x (protocol is overcollateralized)');
    console.log('  Example: $10M active coverage, $45M float = 4.5x ratio ✓');

    console.log('\nManagement Commands:');
    console.log('// Receive premium (called by child contracts)');
    console.log('await floatMaster.sendReceivePremium(childContract, {');
    console.log('  value: premium + toNano("0.5"),');
    console.log('  policyId: 1n,');
    console.log('  premiumAmount: toNano("100"),');
    console.log('  productType: 1, // DEPEG');
    console.log('  assetId: 1,');
    console.log('  coverageAmount: toNano("10000"),');
    console.log('  expiryTimestamp: now + 30 * 86400');
    console.log('})');
    console.log('\n// Aggregate daily yield (called by OCaml backend)');
    console.log('await floatMaster.sendAggregateDailyYield(admin, {');
    console.log('  value: toNano("0.2"),');
    console.log('  rwaYield: toNano("10"),');
    console.log('  btcYield: toNano("5"),');
    console.log('  defiYield: toNano("8"),');
    console.log('  hedgePnL: toNano("2") // Can be negative');
    console.log('})');
    console.log('\n// Release expired coverage');
    console.log('await floatMaster.sendReleaseExpiredCoverage(admin, {');
    console.log('  value: toNano("0.1"),');
    console.log('  expiryTimestamp: 1704067200 // Unix timestamp');
    console.log('})');
    console.log('\n// Check maturity ratio');
    console.log('const ratio = await floatMaster.getMaturityRatio()');
    console.log('console.log(`Maturity: ${ratio / 1000000000n}x`)');
}
