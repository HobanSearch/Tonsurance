import { toNano, Address, Dictionary } from '@ton/core';
import { LiquidityManager, MIN_FEE_APY_BPS, MAX_POOL_SHARE_BPS } from '../../wrappers/v3/LiquidityManager';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for LiquidityManager V3
 *
 * Purpose: Deploy tranche crossover market maker
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Detects NAV crossovers between adjacent tranches
 * - Deploys LP when fee APY > 15% AND pool share < 30%
 * - Earns trading fees while balancing tranche risk/reward
 * - Reduces overall cost of LP capital for protocol
 *
 * Crossover Example: SNR/MEZZ at t=0.5 years
 *   SNR (Log): NAV = 1.0 + 0.08×log(1.5) = 1.032
 *   MEZZ (Linear): NAV = 1.0 + 0.10×0.5 = 1.050
 *   → MEZZ yields more than SNR = arbitrage opportunity
 *
 * Requirements:
 * - FloatMaster address
 * - MultiTrancheVault address
 * - DeDust router address
 *
 * Post-Deployment:
 * 1. Register with FloatMaster
 * 2. Configure crossover detection (OCaml backend)
 * 3. Test LP deployment and withdrawal
 * 4. Monitor fee earnings
 */

export async function run(provider: NetworkProvider) {
    console.log('=== LiquidityManager V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the LiquidityManager contract');
        console.warn('⚠️  This manages crossover LP positions for fee earning');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling LiquidityManager...');
    const code = await compile('LiquidityManager');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vaultAddress = Address.parse(vaultStr);

    const dedustStr = await provider.ui().input('Enter DeDust router address:');
    const dedustAddress = Address.parse(dedustStr);

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  DeDust Router: ${dedustAddress.toString()}`);
    console.log(`  Min Fee APY: ${MIN_FEE_APY_BPS / 100}%`);
    console.log(`  Max Pool Share: ${MAX_POOL_SHARE_BPS / 100}%`);

    // Step 3: Deploy LiquidityManager
    console.log('\nStep 3: Deploying LiquidityManager...');

    const liquidityManager = provider.open(
        LiquidityManager.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                floatMasterAddress: floatMasterAddress,
                vaultAddress: vaultAddress,
                dedustRouterAddress: dedustAddress,
                totalLpDeployed: 0n,
                accumulatedFees: 0n,
                lpPositions: Dictionary.empty(),
                nextPositionId: 1n,
                detectedCrossovers: Dictionary.empty(),
                paused: false,
            },
            code
        )
    );

    await liquidityManager.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(liquidityManager.address);
    console.log(`✓ LiquidityManager deployed: ${liquidityManager.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await liquidityManager.getAdmin();
    const deployedFloatMaster = await liquidityManager.getFloatMaster();
    const totalLp = await liquidityManager.getTotalLpDeployed();
    const fees = await liquidityManager.getAccumulatedFees();
    const lpCount = await liquidityManager.getActiveLpCount();
    const paused = await liquidityManager.getPaused();
    const version = await liquidityManager.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Float Master: ${deployedFloatMaster.toString()}`);
    console.log(`    Total LP Deployed: ${totalLp}`);
    console.log(`    Accumulated Fees: ${fees}`);
    console.log(`    Active LP Count: ${lpCount}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedFloatMaster.equals(floatMasterAddress)) throw new Error('Float Master mismatch!');
    if (totalLp !== 0n) throw new Error('Total LP should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        liquidityManager: {
            address: liquidityManager.address.toString(),
            admin: deployedAdmin.toString(),
            floatMaster: floatMasterAddress.toString(),
            vault: vaultAddress.toString(),
            dedustRouter: dedustAddress.toString(),
            minFeeAPY: `${MIN_FEE_APY_BPS / 100}%`,
            maxPoolShare: `${MAX_POOL_SHARE_BPS / 100}%`,
            version: 3,
        },
        strategy: {
            purpose: 'Earn trading fees at tranche NAV crossover points',
            minFeeAPY: '15%',
            maxPoolShare: '30%',
            mechanism: 'Automated LP deployment via DeDust',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/liquidity-manager-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('LiquidityManager V3:', liquidityManager.address.toString());

    console.log('\nAdd to .env:');
    console.log(`LIQUIDITY_MANAGER_V3_ADDRESS=${liquidityManager.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register with FloatMaster:');
        console.log(`   floatMaster.sendSetLiquidityManager(admin, {`);
        console.log(`     value: toNano('0.05'),`);
        console.log(`     address: '${liquidityManager.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Configure OCaml backend for crossover detection');
        console.log('3. Test LP deployment and withdrawal');
        console.log('4. Monitor fee earnings from DeDust');
    } else {
        console.log('1. Run tests: npx jest tests/v3/LiquidityManager.spec.ts');
        console.log('2. Test crossover LP deployment:');
        console.log('   await liquidityManager.sendDeployCrossoverLP(admin, {');
        console.log('     tranche1Id: 1, tranche2Id: 2,');
        console.log('     amount: toNano("100"),');
        console.log('     estimatedFeeApyBps: 1800, // 18%');
        console.log('     poolTotalLiquidity: toNano("500")');
        console.log('   })');
        console.log('3. Check active LP positions:');
        console.log('   const count = await liquidityManager.getActiveLpCount()');
        console.log('4. Test withdrawal:');
        console.log('   await liquidityManager.sendWithdrawCrossoverLP(admin, { positionId: 1n })');
        console.log('5. Deploy to mainnet when ready');
    }

    console.log('\nCrossover Strategy:');
    console.log('  Purpose: Earn fees by providing liquidity at NAV crossover points');
    console.log('  Detection: OCaml backend monitors tranche NAVs every 5 seconds');
    console.log('  Deployment Criteria:');
    console.log('    1. Fee APY > 15% (MIN_FEE_APY_BPS)');
    console.log('    2. Pool share < 30% (MAX_POOL_SHARE_BPS)');
    console.log('    3. NAV crossover detected (yield differential > 0)');
    console.log('  Withdrawal: When crossover reverses or fees drop below threshold');

    console.log('\nTranche NAV Formulas:');
    console.log('  Senior (Log Curve):');
    console.log('    NAV(t) = 1.0 + senior_apy × log(1 + t)');
    console.log('    Example: SNR at t=0.5: 1.0 + 0.08 × log(1.5) = 1.032');
    console.log('');
    console.log('  Mezzanine (Linear):');
    console.log('    NAV(t) = 1.0 + mezz_apy × t');
    console.log('    Example: MEZZ at t=0.5: 1.0 + 0.10 × 0.5 = 1.050');
    console.log('');
    console.log('  Junior (Exponential):');
    console.log('    NAV(t) = 1.0 + junior_apy × (exp(t×λ) - 1)');
    console.log('    Example: JNR at t=0.5: 1.0 + 0.15 × (exp(0.5×0.3) - 1) = 1.024');

    console.log('\nCrossover Detection Algorithm:');
    console.log('  1. OCaml backend queries vault NAVs every 5 seconds');
    console.log('  2. Calculate yield differential for each tranche pair:');
    console.log('     Δyield = NAV(MEZZ, t) - NAV(SNR, t)');
    console.log('  3. If Δyield > 0 AND fee APY > 15%:');
    console.log('     - Calculate optimal LP size (limited to 30% pool share)');
    console.log('     - Send deploy_crossover_lp message to LiquidityManager');
    console.log('     - LiquidityManager deploys LP to DeDust pool');
    console.log('  4. If Δyield < 0 OR fee APY < 15%:');
    console.log('     - Send withdraw_crossover_lp message');
    console.log('     - LiquidityManager withdraws LP from DeDust');

    console.log('\nExample Crossover Event:');
    console.log('  Time: t = 0.5 years');
    console.log('  Senior NAV: 1.032 (8% APY × log curve)');
    console.log('  Mezzanine NAV: 1.050 (10% APY × linear)');
    console.log('  Yield Differential: 1.050 - 1.032 = 0.018 (+1.8%)');
    console.log('  DeDust Pool: SNR/MEZZ with 500 TON liquidity');
    console.log('  Pool Fee APY: 18% (high demand for MEZZ → SNR swaps)');
    console.log('  Deployment Decision:');
    console.log('    - Fee APY (18%) > MIN_FEE_APY (15%) ✓');
    console.log('    - Deploy 100 TON LP (100/600 = 16.7% < 30% limit) ✓');
    console.log('    - Expected fee income: 100 TON × 18% = 18 TON/year');
    console.log('  Withdrawal Trigger:');
    console.log('    - After 3 months, t = 0.75 years');
    console.log('    - Senior NAV: 1.045 (catching up via log curve)');
    console.log('    - Mezzanine NAV: 1.075 (still linear growth)');
    console.log('    - Yield differential narrows → trading volume drops');
    console.log('    - Fee APY falls to 12% < 15% threshold');
    console.log('    - LiquidityManager withdraws LP + accumulated fees');

    console.log('\nFee Calculation:');
    console.log('  Trading Fees = LP amount × fee APY × duration');
    console.log('  Example: 100 TON × 18% × 0.25 years = 4.5 TON');
    console.log('');
    console.log('  DeDust Pool Mechanics:');
    console.log('    - Swap fee: 0.3% per trade');
    console.log('    - LPs earn fees proportional to their share');
    console.log('    - High crossover volume → high fee income');
    console.log('    - Fees auto-compound (claimed via DeDust router)');

    console.log('\nCapital Efficiency:');
    console.log('  Allocation: Dynamic (based on crossover opportunities)');
    console.log('  Liquidity: Instant (withdraw from DeDust anytime)');
    console.log('  Risk Profile: Low (balanced tranche exposure)');
    console.log('  Use Case: Reduce net LP cost for protocol');
    console.log('  Example Impact:');
    console.log('    - Protocol LP cost without crossovers: $10M × 5% = $500k/year');
    console.log('    - Crossover fee income: $2M deployed × 18% = $360k/year');
    console.log('    - Net LP cost: $500k - $360k = $140k/year (72% reduction)');

    console.log('\nManagement Commands:');
    console.log('// Deploy crossover LP (admin or FloatMaster)');
    console.log('await liquidityManager.sendDeployCrossoverLP(admin, {');
    console.log('  value: toNano("100.5"),');
    console.log('  tranche1Id: 1, // Senior');
    console.log('  tranche2Id: 2, // Mezzanine');
    console.log('  amount: toNano("100"),');
    console.log('  estimatedFeeApyBps: 1800, // 18% APY');
    console.log('  poolTotalLiquidity: toNano("500")');
    console.log('})');
    console.log('\n// Withdraw crossover LP');
    console.log('await liquidityManager.sendWithdrawCrossoverLP(admin, {');
    console.log('  value: toNano("0.2"),');
    console.log('  positionId: 1n');
    console.log('})');
    console.log('\n// Claim fees (called by DeDust router)');
    console.log('await liquidityManager.sendClaimLPFees(dedustRouter, {');
    console.log('  value: toNano("0.1"),');
    console.log('  positionId: 1n,');
    console.log('  feesEarned: toNano("5")');
    console.log('})');
    console.log('\n// Check LP stats');
    console.log('const totalLp = await liquidityManager.getTotalLpDeployed()');
    console.log('const fees = await liquidityManager.getAccumulatedFees()');
    console.log('const count = await liquidityManager.getActiveLpCount()');
    console.log('console.log(`LP: ${totalLp}, Fees: ${fees}, Count: ${count}`)');
}
