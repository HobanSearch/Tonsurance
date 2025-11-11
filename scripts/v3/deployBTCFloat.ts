import { toNano, Address } from '@ton/core';
import { BTCFloat, TARGET_APY_BPS } from '../../wrappers/v3/BTCFloat';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for BTCFloat V3
 *
 * Purpose: Deploy BTC/TON liquid staking manager
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Manages 15% of premium float via Tonstakers liquid staking
 * - Liquid staking through Tonstakers protocol (tsTON tokens)
 * - Instant liquidity (no unbonding period)
 * - Target: 15-25% APY (20% average)
 * - Auto-compounding rewards
 *
 * Requirements:
 * - FloatMaster address
 * - Tonstakers protocol address
 *
 * Post-Deployment:
 * 1. Register this float with FloatMaster
 * 2. Fund with initial capital for testing
 * 3. Monitor staking performance
 * 4. Track daily yields
 */

export async function run(provider: NetworkProvider) {
    console.log('=== BTCFloat V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the BTCFloat contract');
        console.warn('⚠️  This manages 15% of premium float');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling BTCFloat...');
    const code = await compile('BTCFloat');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const tonstakersStr = await provider.ui().input('Enter Tonstakers protocol address:');
    const tonstakersAddress = Address.parse(tonstakersStr);

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  Tonstakers: ${tonstakersAddress.toString()}`);
    console.log(`  Target APY: ${TARGET_APY_BPS / 100}%`);

    // Step 3: Deploy BTCFloat
    console.log('\nStep 3: Deploying BTCFloat...');

    const btcFloat = provider.open(
        BTCFloat.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                floatMasterAddress: floatMasterAddress,
                tonstakersAddress: tonstakersAddress,
                totalStaked: 0n,
                totalUnstaked: 0n,
                tsTONHoldings: 0n,
                accumulatedRewards: 0n,
                paused: false,
            },
            code
        )
    );

    await btcFloat.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(btcFloat.address);
    console.log(`✓ BTCFloat deployed: ${btcFloat.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await btcFloat.getAdmin();
    const deployedFloatMaster = await btcFloat.getFloatMaster();
    const deployedTonstakers = await btcFloat.getTonstakers();
    const totalStaked = await btcFloat.getTotalStaked();
    const holdings = await btcFloat.getTsTONHoldings();
    const paused = await btcFloat.getPaused();
    const version = await btcFloat.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Float Master: ${deployedFloatMaster.toString()}`);
    console.log(`    Tonstakers: ${deployedTonstakers.toString()}`);
    console.log(`    Total Staked: ${totalStaked}`);
    console.log(`    tsTON Holdings: ${holdings}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedFloatMaster.equals(floatMasterAddress)) throw new Error('Float Master mismatch!');
    if (!deployedTonstakers.equals(tonstakersAddress)) throw new Error('Tonstakers mismatch!');
    if (totalStaked !== 0n) throw new Error('Total staked should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        btcFloat: {
            address: btcFloat.address.toString(),
            admin: deployedAdmin.toString(),
            floatMaster: floatMasterAddress.toString(),
            tonstakers: tonstakersAddress.toString(),
            targetAPY: `${TARGET_APY_BPS / 100}%`,
            version: 3,
        },
        allocation: {
            percentage: '15%',
            mechanism: 'Tonstakers liquid staking',
            liquidityProfile: 'Instant (tsTON)',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/btc-float-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('BTCFloat V3:', btcFloat.address.toString());

    console.log('\nAdd to .env:');
    console.log(`BTC_FLOAT_V3_ADDRESS=${btcFloat.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register this float with FloatMaster:');
        console.log(`   floatMaster.sendSetBTCFloat(admin, {`);
        console.log(`     value: toNano('0.05'),`);
        console.log(`     floatAddress: '${btcFloat.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Test staking flow:');
        console.log('   FloatMaster → BTCFloat → Tonstakers → tsTON');
        console.log('3. Monitor tsTON holdings and exchange rate');
        console.log('4. Track daily yield accrual');
        console.log('5. Test unstaking (instant via tsTON liquidity)');
    } else {
        console.log('1. Run tests: npx jest tests/v3/BTCFloat.spec.ts');
        console.log('2. Test staking:');
        console.log('   await btcFloat.sendStakeBTC(floatMaster, { amount: toNano("100") })');
        console.log('3. Check holdings:');
        console.log('   const holdings = await btcFloat.getTsTONHoldings()');
        console.log('4. Check daily yield:');
        console.log('   const yield = await btcFloat.getDailyYield()');
        console.log('5. Test unstaking:');
        console.log('   await btcFloat.sendUnstakeBTC(admin, { amount: toNano("50") })');
        console.log('6. Deploy to mainnet when ready');
    }

    console.log('\nStaking Mechanism:');
    console.log('  Provider: Tonstakers (liquid staking protocol)');
    console.log('  Token: tsTON (liquid staking derivative)');
    console.log('  Exchange Rate: ~1:1 (TON ↔ tsTON)');
    console.log('  Liquidity: Instant (no unbonding period)');
    console.log('  Target APY: 15-25% (20% average)');
    console.log('  Yield Source: BTC-correlated staking rewards');

    console.log('\nStaking Flow:');
    console.log('  1. FloatMaster allocates 15% of premium → BTCFloat');
    console.log('  2. BTCFloat stakes TON → Tonstakers protocol');
    console.log('  3. Tonstakers issues tsTON tokens (1:1 ratio)');
    console.log('  4. BTCFloat holds tsTON (liquid, tradeable)');
    console.log('  5. tsTON accrues value (auto-compounding rewards)');
    console.log('  6. BTCFloat tracks tsTON exchange rate for yield calculation');

    console.log('\nUnstaking Flow (Instant Liquidity):');
    console.log('  1. Admin/FloatMaster requests unstake');
    console.log('  2. BTCFloat burns tsTON → Tonstakers');
    console.log('  3. Tonstakers returns TON instantly (no waiting period)');
    console.log('  4. BTCFloat sends TON back to FloatMaster');
    console.log('  5. Total time: <10 seconds (vs 7-14 days for traditional staking)');

    console.log('\nYield Calculation:');
    console.log('  Daily Yield = tsTON_holdings × 20% APY / 365');
    console.log('  Example: 1,000 tsTON × 0.20 / 365 = 0.5479 TON/day');
    console.log('  Annual: 1,000 tsTON × 0.20 = 200 TON/year');

    console.log('\nCapital Efficiency:');
    console.log('  Allocation: 15% of total premium float');
    console.log('  Liquidity: 100% instant (via tsTON)');
    console.log('  Use Case: Balanced yield + liquidity');
    console.log('  Redemption: No unbonding period required');
    console.log('  Risk Profile: Low (liquid staking, instant exit)');

    console.log('\nManagement Commands:');
    console.log('// Stake TON (called by FloatMaster)');
    console.log('await btcFloat.sendStakeBTC(floatMaster, {');
    console.log('  value: toNano("100.1"),');
    console.log('  amount: toNano("100")');
    console.log('})');
    console.log('\n// Unstake TON (admin or FloatMaster)');
    console.log('await btcFloat.sendUnstakeBTC(admin, {');
    console.log('  value: toNano("0.1"),');
    console.log('  amount: toNano("50")');
    console.log('})');
    console.log('\n// Check holdings');
    console.log('const holdings = await btcFloat.getTsTONHoldings()');
    console.log('console.log(`tsTON Holdings: ${holdings}`)');
    console.log('\n// Check daily yield');
    console.log('const dailyYield = await btcFloat.getDailyYield()');
    console.log('console.log(`Daily Yield: ${dailyYield}`)');
    console.log('\n// Update Tonstakers address');
    console.log('await btcFloat.sendSetTonstakers(admin, {');
    console.log('  value: toNano("0.05"),');
    console.log('  tonstakersAddress: newAddress');
    console.log('})');
}
