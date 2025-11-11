import { toNano, Address, Dictionary } from '@ton/core';
import { EQTBuybackManager, MIN_PROTOCOL_RESERVE, MIN_MATURITY_RATIO_FP, MIN_HEDGE_COVERAGE_BPS } from '../../wrappers/v3/EQTBuybackManager';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for EQTBuybackManager V3
 *
 * Purpose: Deploy EQT token buyback executor with 4-condition safety checks
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Executes EQT buybacks ONLY when protocol is financially healthy
 * - 4 mandatory conditions before buyback execution
 * - Priority waterfall: Hedging > Vault yields > Market making > Buybacks
 * - Aligns LP and protocol incentives via 25% EQT cap mechanism
 *
 * 4 Buyback Conditions:
 * 1. Protocol maturity ratio > 4.0 (float / active_coverage)
 * 2. Protocol reserve > $10M
 * 3. All vault tranches have sufficient yields for promised APYs
 * 4. Hedges cover >95% of active policy exposure
 *
 * Requirements:
 * - FloatMaster address
 * - MultiTrancheVault address
 * - HedgeFloat address
 * - EQT token (Jetton Master) address
 * - DeDust router address
 *
 * Post-Deployment:
 * 1. Register with FloatMaster
 * 2. Configure OCaml backend for automated buyback monitoring
 * 3. Test eligibility checks
 * 4. Monitor buyback execution
 */

export async function run(provider: NetworkProvider) {
    console.log('=== EQTBuybackManager V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the EQTBuybackManager contract');
        console.warn('⚠️  This manages EQT token buybacks with strict safety checks');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling EQTBuybackManager...');
    const code = await compile('EQTBuybackManager');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const vaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const vaultAddress = Address.parse(vaultStr);

    const hedgeFloatStr = await provider.ui().input('Enter HedgeFloat address:');
    const hedgeFloatAddress = Address.parse(hedgeFloatStr);

    const eqtTokenStr = await provider.ui().input('Enter EQT token (Jetton Master) address:');
    const eqtTokenAddress = Address.parse(eqtTokenStr);

    const dexRouterStr = await provider.ui().input('Enter DeDust router address:');
    const dexRouterAddress = Address.parse(dexRouterStr);

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  Vault: ${vaultAddress.toString()}`);
    console.log(`  Hedge Float: ${hedgeFloatAddress.toString()}`);
    console.log(`  EQT Token: ${eqtTokenAddress.toString()}`);
    console.log(`  DEX Router: ${dexRouterAddress.toString()}`);
    console.log(`  Min Protocol Reserve: $${Number(MIN_PROTOCOL_RESERVE) / 1e12}M`);
    console.log(`  Min Maturity Ratio: ${Number(MIN_MATURITY_RATIO_FP) / 1e9}x`);
    console.log(`  Min Hedge Coverage: ${MIN_HEDGE_COVERAGE_BPS / 100}%`);

    // Step 3: Deploy EQTBuybackManager
    console.log('\nStep 3: Deploying EQTBuybackManager...');

    const eqtBuybackManager = provider.open(
        EQTBuybackManager.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                floatMasterAddress: floatMasterAddress,
                vaultAddress: vaultAddress,
                hedgeFloatAddress: hedgeFloatAddress,
                eqtTokenAddress: eqtTokenAddress,
                dexRouterAddress: dexRouterAddress,
                totalBuybacksExecuted: 0,
                totalEqtBought: 0n,
                totalSpent: 0n,
                buybackHistory: Dictionary.empty(),
                nextBuybackId: 1n,
                paused: false,
            },
            code
        )
    );

    await eqtBuybackManager.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(eqtBuybackManager.address);
    console.log(`✓ EQTBuybackManager deployed: ${eqtBuybackManager.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await eqtBuybackManager.getAdmin();
    const deployedFloatMaster = await eqtBuybackManager.getFloatMaster();
    const buybacksExecuted = await eqtBuybackManager.getTotalBuybacksExecuted();
    const eqtBought = await eqtBuybackManager.getTotalEqtBought();
    const spent = await eqtBuybackManager.getTotalSpent();
    const paused = await eqtBuybackManager.getPaused();
    const version = await eqtBuybackManager.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Float Master: ${deployedFloatMaster.toString()}`);
    console.log(`    Total Buybacks: ${buybacksExecuted}`);
    console.log(`    Total EQT Bought: ${eqtBought}`);
    console.log(`    Total Spent: ${spent}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedFloatMaster.equals(floatMasterAddress)) throw new Error('Float Master mismatch!');
    if (buybacksExecuted !== 0) throw new Error('Buybacks should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        eqtBuybackManager: {
            address: eqtBuybackManager.address.toString(),
            admin: deployedAdmin.toString(),
            floatMaster: floatMasterAddress.toString(),
            vault: vaultAddress.toString(),
            hedgeFloat: hedgeFloatAddress.toString(),
            eqtToken: eqtTokenAddress.toString(),
            dexRouter: dexRouterAddress.toString(),
            minProtocolReserve: `$${Number(MIN_PROTOCOL_RESERVE) / 1e12}M`,
            minMaturityRatio: `${Number(MIN_MATURITY_RATIO_FP) / 1e9}x`,
            minHedgeCoverage: `${MIN_HEDGE_COVERAGE_BPS / 100}%`,
            version: 3,
        },
        strategy: {
            purpose: 'EQT token buybacks when protocol is financially healthy',
            conditions: 4,
            priorityWaterfall: ['Hedging', 'Vault yields', 'Market making', 'Buybacks'],
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/eqt-buyback-manager-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('EQTBuybackManager V3:', eqtBuybackManager.address.toString());

    console.log('\nAdd to .env:');
    console.log(`EQT_BUYBACK_MANAGER_V3_ADDRESS=${eqtBuybackManager.address.toString()}`);

    console.log('\nNext Steps:');
    console.log('1. Register with FloatMaster');
    console.log('2. Configure OCaml backend for buyback monitoring');
    console.log('3. Test eligibility checks');
    console.log('4. Monitor buyback execution');

    console.log('\n4 Buyback Conditions (ALL must be met):');
    console.log('  1. Protocol Maturity Ratio > 4.0');
    console.log('     Calculation: total_float / active_coverage');
    console.log('     Example: $40M float / $10M coverage = 4.0x ✓');
    console.log('     Purpose: Ensure protocol is mature with sufficient capital');
    console.log('');
    console.log('  2. Protocol Reserve > $10M');
    console.log('     Source: EQT tranche excess (NAV > 1.25 cap)');
    console.log('     Example: $12M reserve > $10M threshold ✓');
    console.log('     Purpose: Ensure protocol has emergency buffer');
    console.log('');
    console.log('  3. All Vault Tranches Have Sufficient Yields');
    console.log('     Check: All 6 tranches accumulated promised APYs');
    console.log('     Example: SNR needs 8% APY, has 9.2% ✓');
    console.log('     Purpose: Prioritize LP returns before buybacks');
    console.log('');
    console.log('  4. Hedges Cover >95% of Active Exposure');
    console.log('     Calculation: hedged_exposure / total_exposure');
    console.log('     Example: $9.6M hedged / $10M exposure = 96% ✓');
    console.log('     Purpose: Ensure tail risk is covered before buybacks');

    console.log('\nPriority Waterfall (Capital Allocation):');
    console.log('  Tier 1 (HIGHEST): Efficient Hedging');
    console.log('    - Match policy exposure with perpetual shorts');
    console.log('    - Required: >95% hedge coverage');
    console.log('    - Cost: -1.32% to -2.68% annually');
    console.log('');
    console.log('  Tier 2: LP Vault Yield Funding');
    console.log('    - Ensure all 6 tranches earn promised APYs');
    console.log('    - Required: Senior 8%, Mezz 10%, Junior 15%, EQT 25%');
    console.log('    - Source: Float yields (BTC 20%, RWA 10%, DeFi 7%)');
    console.log('');
    console.log('  Tier 3: Market Making (Crossover Arbitrage)');
    console.log('    - Deploy LP at tranche NAV crossover points');
    console.log('    - Required: Fee APY >15%, pool share <30%');
    console.log('    - Benefit: Reduce net LP cost by 72%');
    console.log('');
    console.log('  Tier 4 (LOWEST): EQT Token Buybacks');
    console.log('    - Execute ONLY when all above tiers satisfied');
    console.log('    - Source: Protocol reserve from EQT tranche cap');
    console.log('    - Purpose: Return value to protocol and LPs');

    console.log('\nEQT 25% Cap Mechanism:');
    console.log('  EQT Tranche = Junior tranche with 25% upside cap');
    console.log('  When EQT NAV > 1.25:');
    console.log('    - Cap: LPs receive up to 25% profit');
    console.log('    - Excess: Flows to protocol reserve');
    console.log('    - Use: Protocol reserve funds buybacks');
    console.log('  Example:');
    console.log('    - EQT NAV = 1.40 (40% profit)');
    console.log('    - LPs get: 1.25 (25% profit capped)');
    console.log('    - Protocol reserve: 0.15 (excess above cap)');
    console.log('    - Buyback source: Accumulated excess → $10M+ reserve');

    console.log('\nBuyback Execution Flow:');
    console.log('  1. OCaml Backend Monitoring (every 5 seconds)');
    console.log('     - Query FloatMaster, Vault, HedgeFloat for metrics');
    console.log('     - Calculate: maturity ratio, reserve, yields, hedge coverage');
    console.log('  2. Eligibility Check');
    console.log('     - Condition 1: maturity_ratio > 4.0 ✓/✗');
    console.log('     - Condition 2: protocol_reserve > $10M ✓/✗');
    console.log('     - Condition 3: vault_yields_sufficient = true ✓/✗');
    console.log('     - Condition 4: hedge_coverage > 95% ✓/✗');
    console.log('  3. Execute Buyback (if all 4 conditions met)');
    console.log('     - Determine buyback amount (e.g., 10% of reserve)');
    console.log('     - Send execute_buyback message to EQTBuybackManager');
    console.log('     - EQTBuybackManager re-checks all 4 conditions on-chain');
    console.log('     - If pass: Send TON to DeDust router');
    console.log('     - DeDust: Market buy EQT tokens (TON → EQT swap)');
    console.log('     - EQT tokens: Burn or hold in treasury');
    console.log('     - Record buyback in history (amount, conditions, EQT bought)');

    console.log('\nExample Buyback Scenario:');
    console.log('  Time: 6 months after protocol launch');
    console.log('  Metrics:');
    console.log('    - Total Float: $40M');
    console.log('    - Active Coverage: $10M');
    console.log('    - Maturity Ratio: 4.0x ✓');
    console.log('    - Protocol Reserve: $12M ✓');
    console.log('    - Vault Yields: All tranches 1.5x promised APYs ✓');
    console.log('    - Hedge Coverage: 96% ✓');
    console.log('  Decision: ALL 4 conditions met → Execute buyback');
    console.log('  Buyback Amount: $1.2M (10% of reserve)');
    console.log('  EQT Price: $0.80 (DeDust pool)');
    console.log('  EQT Bought: 1,500,000 EQT tokens');
    console.log('  Action: Burn 1,500,000 EQT (reduce supply, increase value)');

    console.log('\nManagement Commands:');
    console.log('// Execute buyback (admin only, after OCaml check)');
    console.log('await eqtBuybackManager.sendExecuteBuyback(admin, {');
    console.log('  value: toNano("100.5"),');
    console.log('  amount: toNano("100"),');
    console.log('  maturityRatioFp: 5000000000n, // 5.0');
    console.log('  protocolReserve: 12000000000000n, // $12M');
    console.log('  vaultYieldsSufficient: true,');
    console.log('  totalExposure: toNano("1000"),');
    console.log('  hedgedExposure: toNano("960") // 96%');
    console.log('})');
    console.log('\n// Check eligibility (public)');
    console.log('await eqtBuybackManager.sendCheckBuybackEligibility(user, {');
    console.log('  value: toNano("0.1"),');
    console.log('  maturityRatioFp: 5000000000n,');
    console.log('  protocolReserve: 12000000000000n,');
    console.log('  vaultYieldsSufficient: true,');
    console.log('  totalExposure: toNano("1000"),');
    console.log('  hedgedExposure: toNano("960")');
    console.log('})');
    console.log('\n// Get buyback stats');
    console.log('const count = await eqtBuybackManager.getTotalBuybacksExecuted()');
    console.log('const eqtBought = await eqtBuybackManager.getTotalEqtBought()');
    console.log('const spent = await eqtBuybackManager.getTotalSpent()');
    console.log('console.log(`Buybacks: ${count}, EQT: ${eqtBought}, Spent: ${spent}`)');
    console.log('\n// Get buyback details');
    console.log('const buyback = await eqtBuybackManager.getBuyback(1n)');
    console.log('console.log(`Amount: ${buyback.amount}, EQT: ${buyback.eqtBought}`)');
}
