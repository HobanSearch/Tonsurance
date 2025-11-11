import { toNano, Address, Dictionary } from '@ton/core';
import { RWAFloat, TARGET_APY_BPS, REDEMPTION_PERIOD_SECONDS } from '../../wrappers/v3/RWAFloat';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for RWAFloat V3
 *
 * Purpose: Deploy Real World Asset investment manager
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Manages 50% of premium float (largest allocation)
 * - Cross-chain RWA deployment via TON Bridge → Plume Network
 * - 7-day redemption window for liquidity management
 * - Target: 8-12% APY (10% average)
 * - Only deploys expired coverage capital (illiquid-friendly)
 *
 * Requirements:
 * - FloatMaster address
 * - TON Bridge address
 * - Plume Nest Credit protocol address (on Plume network)
 *
 * Post-Deployment:
 * 1. Register with FloatMaster
 * 2. Configure TON Bridge integration
 * 3. Test cross-chain investment flow
 * 4. Monitor Plume holdings and yields
 */

export async function run(provider: NetworkProvider) {
    console.log('=== RWAFloat V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the RWAFloat contract');
        console.warn('⚠️  This manages 50% of premium float (largest allocation)');
        console.warn('⚠️  Estimated cost: ~0.5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling RWAFloat...');
    const code = await compile('RWAFloat');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const floatMasterStr = await provider.ui().input('Enter FloatMaster address:');
    const floatMasterAddress = Address.parse(floatMasterStr);

    const tonBridgeStr = await provider.ui().input('Enter TON Bridge address:');
    const tonBridgeAddress = Address.parse(tonBridgeStr);

    const plumeNestCreditStr = await provider.ui().input('Enter Plume Nest Credit address (Plume network):');
    const plumeNestCreditAddress = Address.parse(plumeNestCreditStr);

    console.log('\nConfiguration:');
    console.log(`  Admin: ${provider.sender().address?.toString()}`);
    console.log(`  Float Master: ${floatMasterAddress.toString()}`);
    console.log(`  TON Bridge: ${tonBridgeAddress.toString()}`);
    console.log(`  Plume Nest Credit: ${plumeNestCreditAddress.toString()}`);
    console.log(`  Target APY: ${TARGET_APY_BPS / 100}%`);
    console.log(`  Redemption Period: ${REDEMPTION_PERIOD_SECONDS / 86400} days`);

    // Step 3: Deploy RWAFloat
    console.log('\nStep 3: Deploying RWAFloat...');

    const rwaFloat = provider.open(
        RWAFloat.createFromConfig(
            {
                adminAddress: provider.sender().address!,
                floatMasterAddress: floatMasterAddress,
                tonBridgeAddress: tonBridgeAddress,
                plumeNestCreditAddress: plumeNestCreditAddress,
                totalInvested: 0n,
                totalRedeemed: 0n,
                plumeHoldings: 0n,
                pendingRedemptions: 0n,
                redemptionQueue: Dictionary.empty(),
                nextRedemptionId: 1n,
                paused: false,
            },
            code
        )
    );

    await rwaFloat.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(rwaFloat.address);
    console.log(`✓ RWAFloat deployed: ${rwaFloat.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await rwaFloat.getAdmin();
    const deployedFloatMaster = await rwaFloat.getFloatMaster();
    const deployedBridge = await rwaFloat.getTonBridge();
    const deployedPlume = await rwaFloat.getPlumeNestCredit();
    const totalInvested = await rwaFloat.getTotalInvested();
    const holdings = await rwaFloat.getPlumeHoldings();
    const paused = await rwaFloat.getPaused();
    const version = await rwaFloat.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Float Master: ${deployedFloatMaster.toString()}`);
    console.log(`    TON Bridge: ${deployedBridge.toString()}`);
    console.log(`    Plume Nest Credit: ${deployedPlume.toString()}`);
    console.log(`    Total Invested: ${totalInvested}`);
    console.log(`    Plume Holdings: ${holdings}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(provider.sender().address!)) throw new Error('Admin mismatch!');
    if (!deployedFloatMaster.equals(floatMasterAddress)) throw new Error('Float Master mismatch!');
    if (!deployedBridge.equals(tonBridgeAddress)) throw new Error('TON Bridge mismatch!');
    if (!deployedPlume.equals(plumeNestCreditAddress)) throw new Error('Plume Nest Credit mismatch!');
    if (totalInvested !== 0n) throw new Error('Total invested should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        rwaFloat: {
            address: rwaFloat.address.toString(),
            admin: deployedAdmin.toString(),
            floatMaster: floatMasterAddress.toString(),
            tonBridge: tonBridgeAddress.toString(),
            plumeNestCredit: plumeNestCreditAddress.toString(),
            targetAPY: `${TARGET_APY_BPS / 100}%`,
            redemptionPeriod: `${REDEMPTION_PERIOD_SECONDS / 86400} days`,
            version: 3,
        },
        allocation: {
            percentage: '50%',
            mechanism: 'Cross-chain RWA via Plume Network',
            liquidityProfile: '7-day redemption window',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/rwa-float-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('RWAFloat V3:', rwaFloat.address.toString());

    console.log('\nAdd to .env:');
    console.log(`RWA_FLOAT_V3_ADDRESS=${rwaFloat.address.toString()}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register with FloatMaster:');
        console.log(`   floatMaster.sendSetRWAFloat(admin, { floatAddress: '${rwaFloat.address.toString()}' })`);
        console.log('2. Configure TON Bridge whitelist');
        console.log('3. Test cross-chain investment:');
        console.log('   FloatMaster → RWAFloat → TON Bridge → Plume Network');
        console.log('4. Monitor Plume holdings and exchange rates');
        console.log('5. Test 7-day redemption flow');
    } else {
        console.log('1. Run tests: npx jest tests/v3/RWAFloat.spec.ts');
        console.log('2. Test investment: await rwaFloat.sendInvestRWA(floatMaster, { amount })');
        console.log('3. Test redemption: await rwaFloat.sendRedeemRWA(admin, { amount })');
        console.log('4. Check yields: const yield = await rwaFloat.getDailyYield()');
        console.log('5. Deploy to mainnet when ready');
    }

    console.log('\nRWA Investment Mechanism:');
    console.log('  Provider: Plume Network (Nest Credit protocol)');
    console.log('  Asset Type: Tokenized T-Bills, MMFs, Corporate Bonds');
    console.log('  Bridge: TON Bridge (cross-chain messaging)');
    console.log('  Liquidity: 7-day redemption window');
    console.log('  Target APY: 8-12% (10% average)');
    console.log('  Yield Source: Fixed income securities (RWAs)');

    console.log('\nInvestment Flow (Cross-Chain):');
    console.log('  1. FloatMaster allocates 50% of premium → RWAFloat');
    console.log('  2. RWAFloat bridges TON → Plume via TON Bridge');
    console.log('  3. Plume Nest Credit invests in RWAs:');
    console.log('     - US Treasury Bills (60%)');
    console.log('     - Money Market Funds (30%)');
    console.log('     - Investment-grade Corporate Bonds (10%)');
    console.log('  4. RWAFloat receives yield-bearing tokens on Plume');
    console.log('  5. Yield accrues daily (10% APY target)');

    console.log('\nRedemption Flow (7-Day Window):');
    console.log('  1. Admin/FloatMaster requests redemption');
    console.log('  2. RWAFloat creates redemption request in queue');
    console.log('  3. RWAFloat bridges redemption message → Plume');
    console.log('  4. Plume Nest Credit initiates RWA liquidation (7 days)');
    console.log('  5. After 7 days: Plume bridges TON back via TON Bridge');
    console.log('  6. RWAFloat completes redemption, sends TON to FloatMaster');
    console.log('  7. Total time: 7-10 days (illiquid, high-yield)');

    console.log('\nCapital Maturity Strategy:');
    console.log('  Only Expired Coverage: RWAs deployed ONLY for expired policy coverage');
    console.log('  Active Coverage: Kept in liquid assets (BTC, DeFi)');
    console.log('  Maturity Tracking: FloatMaster tracks active vs expired capital');
    console.log('  Example: $10M active coverage → keep liquid');
    console.log('           $5M expired coverage → deploy to RWAs (7-day redemption OK)');

    console.log('\nManagement Commands:');
    console.log('// Invest (called by FloatMaster)');
    console.log('await rwaFloat.sendInvestRWA(floatMaster, {');
    console.log('  value: toNano("500.3"),');
    console.log('  amount: toNano("500")');
    console.log('})');
    console.log('\n// Initiate redemption (7-day queue)');
    console.log('await rwaFloat.sendRedeemRWA(admin, {');
    console.log('  value: toNano("0.2"),');
    console.log('  amount: toNano("200")');
    console.log('})');
    console.log('\n// Check holdings');
    console.log('const holdings = await rwaFloat.getPlumeHoldings()');
    console.log('const pending = await rwaFloat.getPendingRedemptions()');
    console.log('console.log(`Holdings: ${holdings}, Pending: ${pending}`)');
}
