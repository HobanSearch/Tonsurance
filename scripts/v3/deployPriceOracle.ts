import { toNano, Address, Dictionary } from '@ton/core';
import { PriceOracle, MIN_ORACLE_COUNT_DEFAULT, MAX_PRICE_AGE_DEFAULT, MAX_STATUS_AGE_DEFAULT } from '../../wrappers/v3/PriceOracle';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for PriceOracle V3
 *
 * Purpose: Deploy multi-asset price & status oracle for parametric triggers
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Multi-oracle consensus (3/5 keepers, median pricing)
 * - 4 product types: Depeg, Bridge, Oracle, Protocol
 * - Staleness checks (5 min prices, 30 min status)
 * - Keeper management and rewards
 * - Trigger validation for ParametricEscrow
 *
 * Supported Assets:
 * 1. Depeg Products:
 *    - USDT/USD, USDC/USD, DAI/USD price feeds
 *    - Triggers when price < threshold (e.g., $0.98)
 *    - Use case: Stablecoin depeg insurance
 *
 * 2. Bridge Products:
 *    - TON Bridge, Orbit, Wormhole, Axelar online status
 *    - Triggers when bridge offline for duration
 *    - Use case: Bridge failure insurance
 *
 * 3. Oracle Products:
 *    - RedStone, Pyth, Chainlink, DIA staleness/deviation
 *    - Triggers when oracle fails or deviates > threshold
 *    - Use case: Oracle failure insurance
 *
 * 4. Protocol Products:
 *    - DeDust, STON, Tonstakers, Evaa pause detection
 *    - Triggers when protocol pauses for duration
 *    - Use case: Protocol pause insurance
 *
 * Oracle Keeper System:
 * - 5 independent keepers submit data
 * - 3/5 consensus required for validity
 * - Median pricing (depeg) or majority vote (status)
 * - Keeper accuracy tracking and rewards
 * - Staleness penalties
 *
 * Trigger Validation Flow:
 * 1. ParametricEscrow calls validate_trigger()
 * 2. PriceOracle checks latest data vs. threshold
 * 3. Returns (is_triggered:bool, proof:cell)
 * 4. Escrow processes claim if triggered
 *
 * Requirements:
 * - MasterFactory address (admin authority)
 * - Rewards contract address (keeper incentives)
 *
 * Post-Deployment:
 * 1. Register 5 oracle keepers
 * 2. Configure keeper infrastructure (off-chain bots)
 * 3. Test price feeds for all supported assets
 * 4. Test trigger validation for each product type
 * 5. Monitor keeper performance and staleness
 */

export async function run(provider: NetworkProvider) {
    console.log('=== PriceOracle V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the PriceOracle contract');
        console.warn('⚠️  This is the core oracle for parametric triggers');
        console.warn('⚠️  All insurance claims depend on this oracle');
        console.warn('⚠️  Estimated cost: ~0.3 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling PriceOracle...');
    const code = await compile('PriceOracle');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address:');
    const masterFactoryAddress = Address.parse(masterFactoryStr);

    const rewardsStr = await provider.ui().input('Enter Rewards contract address (or press Enter to skip):');
    const rewardsAddress = rewardsStr
        ? Address.parse(rewardsStr)
        : Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');

    console.log('\nConfiguration:');
    console.log(`  Master Factory: ${masterFactoryAddress.toString()}`);
    console.log(`  Rewards: ${rewardsAddress.toString()}`);
    console.log(`  Min Oracle Count: ${MIN_ORACLE_COUNT_DEFAULT} (3/5 consensus)`);
    console.log(`  Max Price Age: ${MAX_PRICE_AGE_DEFAULT}s (5 min)`);
    console.log(`  Max Status Age: ${MAX_STATUS_AGE_DEFAULT}s (30 min)`);

    // Step 3: Deploy PriceOracle
    console.log('\nStep 3: Deploying PriceOracle...');

    const oracle = provider.open(
        PriceOracle.createFromConfig(
            {
                masterFactoryAddress: masterFactoryAddress,
                rewardsAddress: rewardsAddress,
                priceFeeds: Dictionary.empty(),
                bridgeStatus: Dictionary.empty(),
                oracleStatus: Dictionary.empty(),
                protocolStatus: Dictionary.empty(),
                oracleKeepers: Dictionary.empty(),
                minOracleCount: MIN_ORACLE_COUNT_DEFAULT,
                maxPriceAge: MAX_PRICE_AGE_DEFAULT,
                maxStatusAge: MAX_STATUS_AGE_DEFAULT,
            },
            code
        )
    );

    await oracle.sendDeploy(provider.sender(), toNano('0.3'));
    await provider.waitForDeploy(oracle.address);
    console.log(`✓ PriceOracle deployed: ${oracle.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const minOracleCount = await oracle.getMinOracleCount();
    const maxPriceAge = await oracle.getMaxPriceAge();
    const version = await oracle.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Min Oracle Count: ${minOracleCount}`);
    console.log(`    Max Price Age: ${maxPriceAge}s`);
    console.log(`    Version: ${version}`);

    if (minOracleCount !== MIN_ORACLE_COUNT_DEFAULT) {
        throw new Error('Min oracle count mismatch!');
    }
    if (maxPriceAge !== MAX_PRICE_AGE_DEFAULT) {
        throw new Error('Max price age mismatch!');
    }
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        priceOracle: {
            address: oracle.address.toString(),
            masterFactory: masterFactoryAddress.toString(),
            rewards: rewardsAddress.toString(),
            version: 3,
        },
        consensus: {
            minOracleCount: MIN_ORACLE_COUNT_DEFAULT,
            maxPriceAge: `${MAX_PRICE_AGE_DEFAULT}s`,
            maxStatusAge: `${MAX_STATUS_AGE_DEFAULT}s`,
        },
        supportedAssets: {
            depeg: ['USDT', 'USDC', 'DAI', 'USDD', 'TUSD', 'FDUSD'],
            bridge: ['TON', 'ORBIT', 'WORMHOLE', 'AXELAR'],
            oracle: ['REDSTONE', 'PYTH', 'CHAINLINK', 'DIA'],
            protocol: ['DEDUST', 'STON', 'TONSTAKERS', 'EVAA'],
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/price-oracle-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('PriceOracle V3:', oracle.address.toString());

    console.log('\nAdd to .env:');
    console.log(`PRICE_ORACLE_V3_ADDRESS=${oracle.address.toString()}`);

    console.log('\nNext Steps:');
    console.log('1. Register 5 oracle keepers via registerKeeper()');
    console.log('   Example: oracle.registerKeeper(keeper1Address)');
    console.log('');
    console.log('2. Deploy keeper infrastructure (off-chain bots)');
    console.log('   - Depeg keepers: Monitor Binance/Coinbase USDT/USD prices');
    console.log('   - Bridge keepers: Monitor TON Bridge deposits/withdrawals');
    console.log('   - Oracle keepers: Monitor RedStone/Pyth uptime and deviation');
    console.log('   - Protocol keepers: Monitor DeDust/STON pause events');
    console.log('');
    console.log('3. Test price feed updates');
    console.log('   oracle.updatePrice(ASSET_USDT, 995000, timestamp, signature)');
    console.log('   // $0.995 USDT/USD');
    console.log('');
    console.log('4. Test trigger validation');
    console.log('   const { isTriggered } = await oracle.validateTrigger(');
    console.log('     PRODUCT_TYPE_DEPEG, ASSET_USDT, 980000, 0');
    console.log('   )');
    console.log('   // Returns true if USDT < $0.98');

    console.log('\nSupported Products:');
    console.log('  1. Depeg Insurance:');
    console.log('     - Covers: USDT, USDC, DAI depeg events');
    console.log('     - Trigger: Price < $0.98 for 5 minutes');
    console.log('     - Example: USDT drops to $0.965');
    console.log('     - Claim: Validated via 3/5 keepers (median price)');
    console.log('');
    console.log('  2. Bridge Insurance:');
    console.log('     - Covers: TON Bridge, Orbit, Wormhole, Axelar');
    console.log('     - Trigger: Bridge offline for 30 minutes');
    console.log('     - Example: Wormhole bridge halted');
    console.log('     - Claim: Validated via 3/5 keepers (majority vote)');
    console.log('');
    console.log('  3. Oracle Insurance:');
    console.log('     - Covers: RedStone, Pyth, Chainlink, DIA');
    console.log('     - Trigger: Oracle stale > 60 min OR deviation > 5%');
    console.log('     - Example: Pyth price feed 3 hours stale');
    console.log('     - Claim: Validated via 3/5 keepers (majority vote)');
    console.log('');
    console.log('  4. Protocol Insurance:');
    console.log('     - Covers: DeDust, STON, Tonstakers, Evaa');
    console.log('     - Trigger: Protocol paused for 1 hour');
    console.log('     - Example: DeDust emergency pause activated');
    console.log('     - Claim: Validated via 3/5 keepers (majority vote)');

    console.log('\nKeeper Registration:');
    console.log('  masterFactory.sendRegisterKeeper(oracle, keeper1Address)');
    console.log('  masterFactory.sendRegisterKeeper(oracle, keeper2Address)');
    console.log('  masterFactory.sendRegisterKeeper(oracle, keeper3Address)');
    console.log('  masterFactory.sendRegisterKeeper(oracle, keeper4Address)');
    console.log('  masterFactory.sendRegisterKeeper(oracle, keeper5Address)');
    console.log('');
    console.log('  Keeper Stats:');
    console.log('    - is_active: true (can submit updates)');
    console.log('    - last_update_time: 0 (timestamp of last submission)');
    console.log('    - update_count: 0 (total updates submitted)');
    console.log('    - accuracy_score: 10000 (100%, decreases if stale/wrong)');

    console.log('\nPrice Update Flow (Depeg):');
    console.log('  1. 5 keepers fetch USDT/USD from Binance/Coinbase');
    console.log('     Keeper 1: $0.995, Keeper 2: $0.993, Keeper 3: $0.997');
    console.log('     Keeper 4: $0.994, Keeper 5: $0.996');
    console.log('');
    console.log('  2. Keepers submit prices to PriceOracle');
    console.log('     oracle.updatePrice(ASSET_USDT, price, timestamp, signature)');
    console.log('');
    console.log('  3. PriceOracle calculates median: $0.995');
    console.log('     Sorted: [$0.993, $0.994, $0.995, $0.996, $0.997]');
    console.log('     Median (5 keepers): $0.995 (middle value)');
    console.log('');
    console.log('  4. PriceOracle checks staleness:');
    console.log('     - All 5 timestamps within 5 min? ✓ Not stale');
    console.log('     - At least 3 keepers submitted? ✓ Consensus reached');
    console.log('');
    console.log('  5. PriceOracle stores:');
    console.log('     price_feeds[USDT] = {');
    console.log('       median_price: 995000 ($0.995)');
    console.log('       timestamp: NOW');
    console.log('       is_stale: false');
    console.log('       price_count: 5');
    console.log('     }');
    console.log('');
    console.log('  6. User buys USDT depeg insurance ($0.98 threshold)');
    console.log('');
    console.log('  7. USDT depegs to $0.965 (5 keepers confirm)');
    console.log('');
    console.log('  8. User files claim → ParametricEscrow calls:');
    console.log('     oracle.validateTrigger(DEPEG, USDT, $0.98, 0)');
    console.log('');
    console.log('  9. PriceOracle returns:');
    console.log('     is_triggered = true ($0.965 < $0.98)');
    console.log('     proof = { asset_id: USDT, price: 965000, timestamp }');
    console.log('');
    console.log(' 10. ParametricEscrow approves claim → payout to user');

    console.log('\nBridge Status Flow:');
    console.log('  1. 5 keepers monitor TON Bridge deposits/withdrawals');
    console.log('  2. Bridge goes offline (no deposits for 30 min)');
    console.log('  3. Keepers report offline status:');
    console.log('     Keeper 1: offline, Keeper 2: offline, Keeper 3: offline');
    console.log('     Keeper 4: online (stale data), Keeper 5: offline');
    console.log('  4. PriceOracle consensus: 4/5 offline → OFFLINE');
    console.log('  5. User with bridge insurance files claim');
    console.log('  6. ParametricEscrow validates: offline > 30 min → PAY');

    console.log('\nOracle Health Flow:');
    console.log('  1. 5 keepers monitor Pyth oracle uptime');
    console.log('  2. Pyth feed goes stale (last update 3 hours ago)');
    console.log('  3. Keepers report unhealthy status');
    console.log('  4. PriceOracle consensus: 3/5 unhealthy → UNHEALTHY');
    console.log('  5. User with oracle insurance files claim');
    console.log('  6. ParametricEscrow validates: stale > 60 min → PAY');

    console.log('\nProtocol Pause Flow:');
    console.log('  1. 5 keepers monitor DeDust contract events');
    console.log('  2. DeDust emits PauseEvent (emergency halt)');
    console.log('  3. Keepers report paused status');
    console.log('  4. PriceOracle consensus: 5/5 paused → PAUSED');
    console.log('  5. User with protocol insurance files claim');
    console.log('  6. ParametricEscrow validates: paused > 1 hour → PAY');

    console.log('\nKeeper Rewards:');
    console.log('  - Accurate update: 0.01 SURE per submission');
    console.log('  - Stale update: 0 SURE (penalty)');
    console.log('  - Outlier price: 0 SURE (too far from median)');
    console.log('  - Accuracy score tracked: 100% → 95% → 90%');
    console.log('  - Low accuracy (<80%): Automatic deactivation');

    console.log('\nAdmin Commands:');
    console.log('  Set min oracle count (governance):');
    console.log('    oracle.sendSetMinOracleCount(masterFactory, { minOracleCount: 4 })');
    console.log('');
    console.log('  Set max price age (emergency):');
    console.log('    oracle.sendSetMaxPriceAge(masterFactory, { maxPriceAge: 600 })');
    console.log('    // Allow 10 min staleness during high volatility');
    console.log('');
    console.log('  Deactivate malicious keeper:');
    console.log('    oracle.sendDeactivateKeeper(masterFactory, { keeperAddress })');

    console.log('\nSecurity Considerations:');
    console.log('  ✓ 3/5 consensus prevents single keeper manipulation');
    console.log('  ✓ Median pricing eliminates outliers');
    console.log('  ✓ Staleness checks prevent stale data attacks');
    console.log('  ✓ Keeper signatures prevent impersonation');
    console.log('  ✓ Master factory admin prevents unauthorized config changes');
    console.log('  ⚠ Keeper collusion (3+ keepers) can manipulate prices');
    console.log('  ⚠ Keeper infrastructure must be geographically distributed');
    console.log('  ⚠ Off-chain data sources must be reliable (Binance, Coinbase)');
}
