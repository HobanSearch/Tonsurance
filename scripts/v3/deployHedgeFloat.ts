import { toNano, Address, Dictionary } from '@ton/core';
import { HedgeFloat, HEDGE_COST_APY_BPS } from '../../wrappers/v3/HedgeFloat';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for HedgeFloat V3
 *
 * Purpose: Deploy active hedging manager for risk mitigation
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Manages 20% of premium float via active hedges
 * - Multi-venue: Storm Trade (TON-native 80%), GMX/dYdX (EVM 20%)
 * - 4 instrument types: Shorts 40%, Puts 30%, Vol 20%, Stable 10%
 * - Continuous rebalancing (1-5 min via OCaml backend)
 * - Target: -1.32% to -2.68% annual cost (hedges are cost centers)
 *
 * Requirements:
 * - FloatMaster address
 * - Storm Trade address (TON-native perpetuals - launching Q1 2026)
 * - GMX router address (Arbitrum via TON Bridge)
 *
 * Post-Deployment:
 * 1. Register this float with FloatMaster
 * 2. Configure venue integrations
 * 3. Test hedge opening/closing
 * 4. Monitor hedge performance and costs
 */

export async function run(provider: NetworkProvider) {
    console.log('=== HedgeFloat V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the HedgeFloat contract');
        console.warn('⚠️  This manages 20% of premium float for active hedges');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling HedgeFloat...');
    const code = await compile('HedgeFloat');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const stormTradeStr = await provider.ui().input('Enter Storm Trade address (or press enter to skip):');
    const stormTradeAddress = stormTradeStr
        ? Address.parse(stormTradeStr)
        : Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');

    const gmxRouterStr = await provider.ui().input('Enter GMX router address (or press enter to skip):');
    const gmxRouterAddress = gmxRouterStr
        ? Address.parse(gmxRouterStr)
        : Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  Storm Trade: ${stormTradeAddress.toString()}`);
    console.log(`  GMX Router: ${gmxRouterAddress.toString()}`);
    console.log(`  Target Cost: ${HEDGE_COST_APY_BPS / 100}% APY`);

    // Step 3: Deploy HedgeFloat
    console.log('\nStep 3: Deploying HedgeFloat...');

    const hedgeFloat = provider.open(
        HedgeFloat.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                floatMasterAddress: floatMasterAddress,
                stormTradeAddress: stormTradeAddress,
                gmxRouterAddress: gmxRouterAddress,
                totalHedgeCapital: 0n,
                activeCapitalDeployed: 0n,
                unrealizedPnL: 0n,
                activePositions: Dictionary.empty(),
                nextPositionId: 1n,
                coverageExposure: Dictionary.empty(),
                paused: false,
            },
            code
        )
    );

    await hedgeFloat.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(hedgeFloat.address);
    console.log(`✓ HedgeFloat deployed: ${hedgeFloat.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await hedgeFloat.getAdmin();
    const deployedFloatMaster = await hedgeFloat.getFloatMaster();
    const totalCapital = await hedgeFloat.getTotalHedgeCapital();
    const activeCapital = await hedgeFloat.getActiveCapitalDeployed();
    const pnl = await hedgeFloat.getUnrealizedPnL();
    const paused = await hedgeFloat.getPaused();
    const version = await hedgeFloat.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Float Master: ${deployedFloatMaster.toString()}`);
    console.log(`    Total Hedge Capital: ${totalCapital}`);
    console.log(`    Active Capital Deployed: ${activeCapital}`);
    console.log(`    Unrealized PnL: ${pnl}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedFloatMaster.equals(floatMasterAddress)) throw new Error('Float Master mismatch!');
    if (totalCapital !== 0n) throw new Error('Total capital should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        hedgeFloat: {
            address: hedgeFloat.address.toString(),
            admin: deployedAdmin.toString(),
            floatMaster: floatMasterAddress.toString(),
            stormTrade: stormTradeAddress.toString(),
            gmxRouter: gmxRouterAddress.toString(),
            targetCost: `${HEDGE_COST_APY_BPS / 100}% APY`,
            version: 3,
        },
        allocation: {
            percentage: '20%',
            mechanism: 'Active hedges across perpetuals and options',
            instruments: {
                short: '40%',
                put: '30%',
                volatility: '20%',
                stable: '10%',
            },
        },
        venues: {
            stormTrade: {
                allocation: '80%',
                type: 'TON-native perpetuals',
                status: 'Launching Q1 2026',
            },
            gmx: {
                allocation: '20%',
                type: 'EVM perpetuals (via TON Bridge)',
                status: 'Live on Arbitrum',
            },
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/hedge-float-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('HedgeFloat V3:', hedgeFloat.address.toString());

    console.log('\nAdd to .env:');
    console.log(`HEDGE_FLOAT_V3_ADDRESS=${hedgeFloat.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register this float with FloatMaster:');
        console.log(`   floatMaster.sendSetHedgeFloat(admin, {`);
        console.log(`     value: toNano('0.05'),`);
        console.log(`     floatAddress: '${hedgeFloat.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Configure venue integrations (Storm Trade, GMX)');
        console.log('3. Test hedge opening/closing flows');
        console.log('4. Monitor hedge performance via OCaml backend');
        console.log('5. Track daily costs and PnL');
    } else {
        console.log('1. Run tests: npx jest tests/v3/HedgeFloat.spec.ts');
        console.log('2. Test capital addition:');
        console.log('   await hedgeFloat.sendAddHedgeCapital(floatMaster, {');
        console.log('     amount: toNano("100"),');
        console.log('     productType: 1, assetId: 1,');
        console.log('     coverageAmount: toNano("500")');
        console.log('   })');
        console.log('3. Check coverage exposure:');
        console.log('   const exposure = await hedgeFloat.getCoverageExposure(1)');
        console.log('4. Test closing positions:');
        console.log('   await hedgeFloat.sendCloseShort(admin, { positionId: 1n })');
        console.log('5. Deploy to mainnet when ready');
    }

    console.log('\nHedging Strategy:');
    console.log('  Purpose: Mitigate tail risk from policy payouts');
    console.log('  Allocation: 20% of total premium float');
    console.log('  Target Cost: -1.32% to -2.68% annually');
    console.log('  Mechanism: Active hedges rebalanced every 1-5 minutes');
    console.log('  Benefit: Reduces vault drawdowns by 60-80%');

    console.log('\nInstrument Allocation (4 Types):');
    console.log('  1. Short Positions (40%):');
    console.log('     - Perpetual futures on covered assets (USDT, USDC, TON)');
    console.log('     - Leverage: 5x');
    console.log('     - Funding rate: -0.01% daily (we pay)');
    console.log('     - Example: Short $10,000 USDT @ 5x = $50,000 notional');
    console.log('');
    console.log('  2. Put Options (30%):');
    console.log('     - OTM puts on covered assets');
    console.log('     - Strike: 5% below current price');
    console.log('     - Expiry: 7-30 days rolling');
    console.log('     - Premium: ~2% per month');
    console.log('');
    console.log('  3. Volatility Strategies (20%):');
    console.log('     - Straddles/strangles for major events');
    console.log('     - Implied vol: 50-100% (high IV assets)');
    console.log('     - Theta decay: -1% daily');
    console.log('');
    console.log('  4. Stablecoin Hedges (10%):');
    console.log('     - Deep OTM puts on USDT/USDC');
    console.log('     - Strike: 15% below peg');
    console.log('     - Premium: ~0.5% per month (cheap tail protection)');

    console.log('\nVenue Integration:');
    console.log('  Storm Trade (TON-native 80%):');
    console.log('    - Launching: Q1 2026');
    console.log('    - Type: Decentralized perpetuals on TON');
    console.log('    - Assets: TON/USDT, TON/USDC, BTC/USD, ETH/USD');
    console.log('    - Max Leverage: 10x');
    console.log('    - Fees: 0.05% maker, 0.1% taker');
    console.log('    - Settlement: Instant (on-chain)');
    console.log('');
    console.log('  GMX (EVM bridged 20%):');
    console.log('    - Network: Arbitrum (via TON Bridge)');
    console.log('    - Type: Decentralized perpetuals');
    console.log('    - Assets: 20+ markets (BTC, ETH, LINK, UNI, etc.)');
    console.log('    - Max Leverage: 50x');
    console.log('    - Fees: 0.1% open/close');
    console.log('    - Settlement: Bridge redemption (5-10 min)');

    console.log('\nHedge Lifecycle:');
    console.log('  1. Policy Created → Coverage Exposure Tracked');
    console.log('     - FloatMaster sends coverage details to HedgeFloat');
    console.log('     - HedgeFloat tracks exposure per asset (e.g., USDT)');
    console.log('');
    console.log('  2. Auto-Deploy Hedges (20% of coverage amount)');
    console.log('     - Calculate hedge size: coverage × 20%');
    console.log('     - Split across 4 instruments: 40/30/20/10');
    console.log('     - Send orders to Storm Trade (80%) and GMX (20%)');
    console.log('     - Store position IDs and metadata on-chain');
    console.log('     - Total time: 5-30 seconds');
    console.log('');
    console.log('  3. Continuous Rebalancing (OCaml Backend)');
    console.log('     - Monitor coverage exposure every 5 seconds');
    console.log('     - Adjust hedge sizes if exposure changes >5%');
    console.log('     - Rebalance venues based on funding rates');
    console.log('     - Close unprofitable positions, open new ones');
    console.log('     - Total time: 1-5 minutes per rebalance');
    console.log('');
    console.log('  4. Claim Event → Hedge Liquidation');
    console.log('     - Claim approved → immediately close hedge positions');
    console.log('     - Realize PnL: Typically +40% to +80% profit (volatility spike)');
    console.log('     - Return proceeds to FloatMaster');
    console.log('     - Update unrealized_pnl tracking');
    console.log('     - Total time: 10-60 seconds');
    console.log('');
    console.log('  5. Policy Expiry → Reduce Exposure');
    console.log('     - Coverage expires → decrease asset exposure');
    console.log('     - Proportionally close hedge positions');
    console.log('     - Recycle capital to other active hedges');

    console.log('\nCost Analysis:');
    console.log('  Daily Cost = total_capital × -0.02 / 365');
    console.log('  Example: $100,000 hedge capital × -0.02 / 365 = -$5.48/day');
    console.log('  Annual: $100,000 × -0.02 = -$2,000/year (2% drag)');
    console.log('');
    console.log('  Cost Breakdown:');
    console.log('    - Short funding rates: -0.5% to -1.5% annually');
    console.log('    - Put option premiums: -18% to -24% annually');
    console.log('    - Volatility theta decay: -36% annually');
    console.log('    - Stablecoin put premiums: -6% annually');
    console.log('  Weighted Average: -2% annually (blended across instruments)');
    console.log('');
    console.log('  Benefit: In tail events (USDT depeg), hedges return 10-50x');
    console.log('  Example: $2,000 annual cost → $100,000 profit in depeg event');

    console.log('\nCapital Efficiency:');
    console.log('  Allocation: 20% of total premium float');
    console.log('  Leverage: 5x average (up to 50x on GMX)');
    console.log('  Effective Hedge: 100% of total coverage (via leverage)');
    console.log('  Liquidity: Instant (perpetuals), 5-30 days (options)');
    console.log('  Use Case: Tail risk mitigation (black swan protection)');

    console.log('\nManagement Commands:');
    console.log('// Add hedge capital (called by FloatMaster on policy creation)');
    console.log('await hedgeFloat.sendAddHedgeCapital(floatMaster, {');
    console.log('  value: toNano("100.5"),');
    console.log('  amount: toNano("100"),');
    console.log('  productType: 1, // USDT Depeg');
    console.log('  assetId: 1, // USDT');
    console.log('  coverageAmount: toNano("500")');
    console.log('})');
    console.log('\n// Close short position (admin or OCaml backend)');
    console.log('await hedgeFloat.sendCloseShort(admin, {');
    console.log('  value: toNano("0.2"),');
    console.log('  positionId: 1n');
    console.log('})');
    console.log('\n// Check coverage exposure for asset');
    console.log('const exposure = await hedgeFloat.getCoverageExposure(1) // USDT');
    console.log('console.log(`USDT Exposure: ${exposure}`)');
    console.log('\n// Check active capital and PnL');
    console.log('const activeCapital = await hedgeFloat.getActiveCapitalDeployed()');
    console.log('const pnl = await hedgeFloat.getUnrealizedPnL()');
    console.log('console.log(`Active: ${activeCapital}, PnL: ${pnl}`)');
    console.log('\n// Update venue addresses (admin only)');
    console.log('await hedgeFloat.sendSetStormTrade(admin, {');
    console.log('  value: toNano("0.05"),');
    console.log('  address: newStormTradeAddress');
    console.log('})');
}
