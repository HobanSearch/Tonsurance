import { toNano, Address, Dictionary, beginCell } from '@ton/core';
import { MultiTrancheVault, TRANCHE_BTC, TRANCHE_SNR, TRANCHE_MEZZ, TRANCHE_JNR, TRANCHE_JNR_PLUS, TRANCHE_EQT } from '../../wrappers/v3/MultiTrancheVault';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for MultiTrancheVault V3
 *
 * Purpose: Deploy 6-tier waterfall vault system for LP capital
 * Network: Testnet/Mainnet
 *
 * Features:
 * - 6 tranches with different risk/reward profiles
 * - NAV-based deposit/withdraw with LP token minting
 * - Waterfall loss absorption (EQT → JNR+ → JNR → MEZZ → SNR → BTC)
 * - Circuit breaker (10% max loss per 24h)
 * - Bonding curves for each tranche
 * - EQT 25% cap mechanism (excess → protocol buybacks)
 *
 * Tranche Allocation:
 * - BTC (15%): Super senior, 4% APY, flat curve, lowest risk
 * - SNR (20%): Senior, 4-8% APY, logarithmic curve
 * - MEZZ (25%): Mezzanine, 10% APY, linear curve
 * - JNR (20%): Junior, 8-25% APY, sigmoid curve
 * - JNR+ (15%): Junior Plus, 10-20% APY, quadratic curve
 * - EQT (5%): Equity, 15-25% APY (capped), exponential curve
 *
 * Requirements:
 * - MasterFactory address
 * - ParametricEscrow address (claims processor)
 * - FloatMaster address
 *
 * Post-Deployment:
 * 1. Configure tranche LP tokens (6 Jetton contracts)
 * 2. Test deposit/withdraw flows
 * 3. Monitor NAV calculations
 * 4. Test loss absorption waterfall
 */

export async function run(provider: NetworkProvider) {
    console.log('=== MultiTrancheVault V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the Multi-Tranche Vault contract');
        console.warn('⚠️  This is the core LP capital management system');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling MultiTrancheVault...');
    const code = await compile('MultiTrancheVault');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const claimsProcessorStr = await provider.ui().input('Enter ParametricEscrow (claims processor) address:');
    const claimsProcessorAddress = Address.parse(claimsProcessorStr);

    const floatManagerStr = await provider.ui().input('Enter FloatMaster address:');
    const floatManagerAddress = Address.parse(floatManagerStr);

    console.log('\nConfiguration:');
    console.log(`  Master Factory: ${masterFactoryAddress.toString()}`);
    console.log(`  Claims Processor: ${claimsProcessorAddress.toString()}`);
    console.log(`  Float Manager: ${floatManagerAddress.toString()}`);

    // Step 3: Create tranche data
    console.log('\nStep 3: Creating tranche data...');

    const tranches = Dictionary.empty<number, any>();
    const nullAddress = Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');

    const trancheConfigs = [
        { id: TRANCHE_BTC, apyMin: 400, apyMax: 400, curve: 1, allocation: 15, name: 'BTC' },
        { id: TRANCHE_SNR, apyMin: 400, apyMax: 800, curve: 2, allocation: 20, name: 'Senior' },
        { id: TRANCHE_MEZZ, apyMin: 1000, apyMax: 1000, curve: 3, allocation: 25, name: 'Mezzanine' },
        { id: TRANCHE_JNR, apyMin: 800, apyMax: 2500, curve: 4, allocation: 20, name: 'Junior' },
        { id: TRANCHE_JNR_PLUS, apyMin: 1000, apyMax: 2000, curve: 5, allocation: 15, name: 'Junior+' },
        { id: TRANCHE_EQT, apyMin: 1500, apyMax: 2500, curve: 6, allocation: 5, name: 'Equity' },
    ];

    for (const t of trancheConfigs) {
        const trancheCell = beginCell()
            .storeCoins(0n)
            .storeUint(t.apyMin, 16)
            .storeUint(t.apyMax, 16)
            .storeUint(t.curve, 8)
            .storeUint(t.allocation, 8)
            .storeCoins(0n)
            .storeAddress(nullAddress)
            .storeCoins(0n)
            .endCell();
        tranches.set(t.id, trancheCell);
        console.log(`  ✓ ${t.name} (${t.allocation}%): ${t.apyMin / 100}-${t.apyMax / 100}% APY`);
    }

    const trancheData = beginCell().storeDictDirect(tranches).endCell();

    // Step 4: Deploy MultiTrancheVault
    console.log('\nStep 4: Deploying MultiTrancheVault...');

    const vault = provider.open(
        MultiTrancheVault.createFromConfig(
            {
                masterFactoryAddress: masterFactoryAddress,
                claimsProcessorAddress: claimsProcessorAddress,
                floatManagerAddress: floatManagerAddress,
                totalCapital: 0n,
                totalCoverageSold: 0n,
                accumulatedPremiums: 0n,
                accumulatedLosses: 0n,
                protocolEarnedCapital: 0n,
                trancheData: trancheData,
                depositorBalances: Dictionary.empty(),
                paused: false,
                reentrancyGuard: false,
                seqNo: 0,
                circuitBreakerWindowStart: 0,
                circuitBreakerLosses: 0n,
                trancheDepositTimes: Dictionary.empty(),
                pendingTxs: Dictionary.empty(),
                trancheLocks: Dictionary.empty(),
                testMode: false,
            },
            code
        )
    );

    await vault.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(vault.address);
    console.log(`✓ MultiTrancheVault deployed: ${vault.address.toString()}\n`);

    // Step 5: Verification
    console.log('Step 5: Verifying deployment...');

    const totalCapital = await vault.getTotalCapital();
    const paused = await vault.getPaused();
    const version = await vault.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Total Capital: ${totalCapital}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify tranches
    for (const t of trancheConfigs) {
        const capital = await vault.getTrancheCapital(t.id);
        const apy = await vault.getTrancheApy(t.id);
        console.log(`    ${t.name}: Capital=${capital}, APY=${apy.min / 100}-${apy.max / 100}%`);
    }

    if (totalCapital !== 0n) throw new Error('Total capital should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 6: Save deployment manifest
    console.log('Step 6: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        multiTrancheVault: {
            address: vault.address.toString(),
            masterFactory: masterFactoryAddress.toString(),
            claimsProcessor: claimsProcessorAddress.toString(),
            floatManager: floatManagerAddress.toString(),
            version: 3,
        },
        tranches: trancheConfigs.map((t) => ({
            id: t.id,
            name: t.name,
            allocation: `${t.allocation}%`,
            apyRange: `${t.apyMin / 100}-${t.apyMax / 100}%`,
            curve: t.curve,
        })),
    };

    const fs = require('fs');
    const manifestPath = `./deployments/multi-tranche-vault-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 7: Output
    console.log('=== Deployment Complete ===\n');
    console.log('MultiTrancheVault V3:', vault.address.toString());

    console.log('\nAdd to .env:');
    console.log(`MULTI_TRANCHE_VAULT_V3_ADDRESS=${vault.address.toString()}`);

    console.log('\nNext Steps:');
    console.log('1. Deploy 6 LP token (Jetton) contracts for each tranche');
    console.log('2. Set tranche token addresses via set_tranche_token');
    console.log('3. Test deposit/withdraw flows for each tranche');
    console.log('4. Monitor NAV calculations and bonding curves');
    console.log('5. Test loss absorption waterfall mechanism');

    console.log('\n6-Tranche System:');
    console.log('  BTC (15%): Super Senior, 4% APY');
    console.log('    - Lowest risk, flat curve');
    console.log('    - Last to absorb losses (99.9% safety)');
    console.log('    - NAV = 1.0 + 0.04 × t');
    console.log('');
    console.log('  SNR (20%): Senior, 4-8% APY');
    console.log('    - Low risk, logarithmic curve');
    console.log('    - Early commitment incentive');
    console.log('    - NAV = 1.0 + 0.08 × log(1 + t)');
    console.log('');
    console.log('  MEZZ (25%): Mezzanine, 10% APY');
    console.log('    - Medium risk, linear curve');
    console.log('    - Largest tranche (balanced)');
    console.log('    - NAV = 1.0 + 0.10 × t');
    console.log('');
    console.log('  JNR (20%): Junior, 8-25% APY');
    console.log('    - High risk, sigmoid curve');
    console.log('    - Steep growth after 6 months');
    console.log('    - NAV = 1.0 + 0.30 / (1 + e^(-5×(t-0.5)))');
    console.log('');
    console.log('  JNR+ (15%): Junior Plus, 10-20% APY');
    console.log('    - Higher risk, quadratic curve');
    console.log('    - Accelerating growth');
    console.log('    - NAV = 1.0 + 0.21 × t²');
    console.log('');
    console.log('  EQT (5%): Equity, 15-25% APY (capped)');
    console.log('    - Highest risk, capped exponential');
    console.log('    - 25% profit cap, excess → protocol');
    console.log('    - NAV = min(1.25, 1.0 + 0.15 × (e^t - 1))');

    console.log('\nWaterfall Loss Absorption:');
    console.log('  Claim payout of $100k with $10M total capital:');
    console.log('  1. EQT absorbs first $500k (5% × $10M)');
    console.log('  2. JNR+ absorbs next $1.5M (15%)');
    console.log('  3. JNR absorbs next $2M (20%)');
    console.log('  4. MEZZ absorbs next $2.5M (25%)');
    console.log('  5. SNR absorbs next $2M (20%)');
    console.log('  6. BTC absorbs final $1.5M (15%)');
    console.log('  Result: EQT LPs lose 20%, all others unaffected');

    console.log('\nCircuit Breaker:');
    console.log('  - Max 10% loss per 24h window');
    console.log('  - Halts withdrawals if threshold exceeded');
    console.log('  - Protects against bank runs');
    console.log('  - Automatically resets after 24h');
}
