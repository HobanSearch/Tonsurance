import { toNano, Address } from '@ton/core';
import { DeFiFloat, TARGET_APY_BPS } from '../../wrappers/v3/DeFiFloat';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for DeFiFloat V3
 *
 * Purpose: Deploy DeFi yield manager across TON ecosystem
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Manages 15% of premium float via DeFi protocols
 * - Multi-venue optimization: DeDust (40%), STON.fi (30%), Evaa (30%)
 * - Instant liquidity (<1 minute withdrawals)
 * - Target: 5-10% APY (7% average)
 * - Dynamic rebalancing based on yields
 *
 * Requirements:
 * - FloatMaster address
 * - DeDust router address
 * - STON.fi router address
 * - Evaa market address
 *
 * Post-Deployment:
 * 1. Register this float with FloatMaster
 * 2. Test capital deployment to all 3 venues
 * 3. Monitor venue yields and rebalance as needed
 * 4. Track daily yield performance
 */

export async function run(provider: NetworkProvider) {
    console.log('=== DeFiFloat V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the DeFiFloat contract');
        console.warn('⚠️  This manages 15% of premium float across 3 DeFi venues');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling DeFiFloat...');
    const code = await compile('DeFiFloat');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const dedustStr = await provider.ui().input('Enter DeDust router address:');
    const dedustAddress = Address.parse(dedustStr);

    const stonStr = await provider.ui().input('Enter STON.fi router address:');
    const stonAddress = Address.parse(stonStr);

    const evaaStr = await provider.ui().input('Enter Evaa market address:');
    const evaaAddress = Address.parse(evaaStr);

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  DeDust Router: ${dedustAddress.toString()}`);
    console.log(`  STON Router: ${stonAddress.toString()}`);
    console.log(`  Evaa Market: ${evaaAddress.toString()}`);
    console.log(`  Target APY: ${TARGET_APY_BPS / 100}%`);

    // Step 3: Deploy DeFiFloat
    console.log('\nStep 3: Deploying DeFiFloat...');

    const defiFloat = provider.open(
        DeFiFloat.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                floatMasterAddress: floatMasterAddress,
                dedustRouterAddress: dedustAddress,
                stonRouterAddress: stonAddress,
                evaaMarketAddress: evaaAddress,
                totalDeployed: 0n,
                totalWithdrawn: 0n,
                dedustLiquidity: 0n,
                stonLiquidity: 0n,
                evaaSupplied: 0n,
                paused: false,
            },
            code
        )
    );

    await defiFloat.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(defiFloat.address);
    console.log(`✓ DeFiFloat deployed: ${defiFloat.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await defiFloat.getAdmin();
    const deployedFloatMaster = await defiFloat.getFloatMaster();
    const totalDeployed = await defiFloat.getTotalDeployed();
    const totalBalance = await defiFloat.getTotalBalance();
    const paused = await defiFloat.getPaused();
    const version = await defiFloat.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Float Master: ${deployedFloatMaster.toString()}`);
    console.log(`    Total Deployed: ${totalDeployed}`);
    console.log(`    Total Balance: ${totalBalance}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedFloatMaster.equals(floatMasterAddress)) throw new Error('Float Master mismatch!');
    if (totalDeployed !== 0n) throw new Error('Total deployed should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        defiFloat: {
            address: defiFloat.address.toString(),
            admin: deployedAdmin.toString(),
            floatMaster: floatMasterAddress.toString(),
            dedustRouter: dedustAddress.toString(),
            stonRouter: stonAddress.toString(),
            evaaMarket: evaaAddress.toString(),
            targetAPY: `${TARGET_APY_BPS / 100}%`,
            version: 3,
        },
        allocation: {
            percentage: '15%',
            mechanism: 'Multi-venue DeFi (DeDust 40%, STON 30%, Evaa 30%)',
            liquidityProfile: 'Instant (<1 minute)',
        },
        venues: {
            dedust: {
                allocation: '40%',
                type: 'DEX/AMM',
                liquidity: 'Instant',
            },
            ston: {
                allocation: '30%',
                type: 'AMM',
                liquidity: 'Instant',
            },
            evaa: {
                allocation: '30%',
                type: 'Lending',
                liquidity: 'Instant',
            },
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/defi-float-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('DeFiFloat V3:', defiFloat.address.toString());

    console.log('\nAdd to .env:');
    console.log(`DEFI_FLOAT_V3_ADDRESS=${defiFloat.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register this float with FloatMaster:');
        console.log(`   floatMaster.sendSetDeFiFloat(admin, {`);
        console.log(`     value: toNano('0.05'),`);
        console.log(`     floatAddress: '${defiFloat.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Test capital deployment:');
        console.log('   FloatMaster → DeFiFloat → 3 venues (DeDust, STON, Evaa)');
        console.log('3. Monitor venue yields and rebalance as needed');
        console.log('4. Track daily yield performance');
        console.log('5. Test instant withdrawal flow');
    } else {
        console.log('1. Run tests: npx jest tests/v3/DeFiFloat.spec.ts');
        console.log('2. Test capital deployment:');
        console.log('   await defiFloat.sendDeployDeFi(floatMaster, { amount: toNano("300") })');
        console.log('3. Check venue balances:');
        console.log('   const dedust = await defiFloat.getDedustLiquidity()');
        console.log('   const ston = await defiFloat.getStonLiquidity()');
        console.log('   const evaa = await defiFloat.getEvaaSupplied()');
        console.log('4. Test withdrawal:');
        console.log('   await defiFloat.sendWithdrawDeFi(admin, { amount: toNano("100") })');
        console.log('5. Deploy to mainnet when ready');
    }

    console.log('\nDeFi Venue Details:');
    console.log('  DeDust (40% allocation):');
    console.log('    - Type: Decentralized Exchange / AMM');
    console.log('    - Pool: TON/USDT');
    console.log('    - Expected APY: 6-8%');
    console.log('    - Liquidity: Instant (remove LP anytime)');
    console.log('    - Risk: Low (large liquidity pool)');
    console.log('');
    console.log('  STON.fi (30% allocation):');
    console.log('    - Type: Automated Market Maker');
    console.log('    - Pools: TON/USDT, TON/USDC');
    console.log('    - Expected APY: 5-10%');
    console.log('    - Liquidity: Instant');
    console.log('    - Risk: Low (established protocol)');
    console.log('');
    console.log('  Evaa Protocol (30% allocation):');
    console.log('    - Type: Lending Market');
    console.log('    - Asset: USDT lending');
    console.log('    - Expected APY: 7-12%');
    console.log('    - Liquidity: Instant (up to 80% utilization)');
    console.log('    - Risk: Low-Medium (over-collateralized)');

    console.log('\nDeployment Flow (Multi-Venue):');
    console.log('  1. FloatMaster allocates 15% of premium → DeFiFloat');
    console.log('  2. DeFiFloat splits capital:');
    console.log('     - 40% → DeDust (add liquidity to TON/USDT pool)');
    console.log('     - 30% → STON.fi (add liquidity to AMM pools)');
    console.log('     - 30% → Evaa (supply USDT to lending market)');
    console.log('  3. DeFiFloat receives:');
    console.log('     - DeDust LP tokens (tradeable)');
    console.log('     - STON LP tokens (tradeable)');
    console.log('     - Evaa eUSDT tokens (yield-bearing)');
    console.log('  4. Yield accrues daily across all venues');
    console.log('  5. Total time: <10 seconds');

    console.log('\nWithdrawal Flow (Instant Liquidity):');
    console.log('  1. Admin/FloatMaster requests withdrawal');
    console.log('  2. DeFiFloat calculates proportional withdrawal:');
    console.log('     - Example: Withdraw 100 TON from 300 TON total');
    console.log('     - DeDust: 40 TON (40% of withdrawal)');
    console.log('     - STON: 30 TON (30% of withdrawal)');
    console.log('     - Evaa: 30 TON (30% of withdrawal)');
    console.log('  3. DeFiFloat removes liquidity from each venue:');
    console.log('     - DeDust: Burn LP tokens → receive TON/USDT');
    console.log('     - STON: Remove liquidity → receive TON');
    console.log('     - Evaa: Withdraw USDT → receive USDT');
    console.log('  4. DeFiFloat sends total to FloatMaster');
    console.log('  5. Total time: <1 minute (all instant)');

    console.log('\nYield Calculation:');
    console.log('  Target APY: 7% (average across 3 venues)');
    console.log('  Daily Yield = total_balance × 0.07 / 365');
    console.log('  Example: 1,000 TON × 0.07 / 365 = 0.1918 TON/day');
    console.log('  Annual: 1,000 TON × 0.07 = 70 TON/year');

    console.log('\nDynamic Rebalancing (OCaml Backend):');
    console.log('  OCaml service monitors yields from all 3 venues:');
    console.log('    - DeDust APY: 6.5%');
    console.log('    - STON APY: 8.2%');
    console.log('    - Evaa APY: 9.1%');
    console.log('  If yields change significantly:');
    console.log('    1. Calculate optimal allocation (maximize yield)');
    console.log('    2. Send rebalance transaction to DeFiFloat');
    console.log('    3. DeFiFloat withdraws from low-yield venues');
    console.log('    4. DeFiFloat deploys to high-yield venues');
    console.log('    5. Total rebalance time: 2-5 minutes');

    console.log('\nCapital Efficiency:');
    console.log('  Allocation: 15% of total premium float');
    console.log('  Liquidity: 100% instant (all venues)');
    console.log('  Use Case: Balanced yield + instant liquidity');
    console.log('  Redemption: No waiting period');
    console.log('  Risk Profile: Low (diversified across 3 venues)');

    console.log('\nManagement Commands:');
    console.log('// Deploy capital (called by FloatMaster)');
    console.log('await defiFloat.sendDeployDeFi(floatMaster, {');
    console.log('  value: toNano("300.5"),');
    console.log('  amount: toNano("300")');
    console.log('})');
    console.log('\n// Withdraw capital (admin or FloatMaster)');
    console.log('await defiFloat.sendWithdrawDeFi(admin, {');
    console.log('  value: toNano("0.3"),');
    console.log('  amount: toNano("100")');
    console.log('})');
    console.log('\n// Check venue balances');
    console.log('const dedust = await defiFloat.getDedustLiquidity()');
    console.log('const ston = await defiFloat.getStonLiquidity()');
    console.log('const evaa = await defiFloat.getEvaaSupplied()');
    console.log('console.log(`DeDust: ${dedust}, STON: ${ston}, Evaa: ${evaa}`)');
    console.log('\n// Check daily yield');
    console.log('const dailyYield = await defiFloat.getDailyYield()');
    console.log('console.log(`Daily Yield: ${dailyYield}`)');
    console.log('\n// Update venue addresses (admin only)');
    console.log('await defiFloat.sendSetDedust(admin, {');
    console.log('  value: toNano("0.05"),');
    console.log('  routerAddress: newDedustAddress');
    console.log('})');
    console.log('await defiFloat.sendSetSton(admin, {');
    console.log('  value: toNano("0.05"),');
    console.log('  routerAddress: newStonAddress');
    console.log('})');
    console.log('await defiFloat.sendSetEvaa(admin, {');
    console.log('  value: toNano("0.05"),');
    console.log('  marketAddress: newEvaaAddress');
    console.log('})');
}
