import { toNano, Address } from '@ton/core';
import { PricingOracle, CoverageType } from '../wrappers/PricingOracle';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for PricingOracle
 *
 * Purpose: Deploy the PricingOracle contract for hedged insurance pricing
 * Network: Testnet/Mainnet
 *
 * Configuration:
 * - Admin address (multi-sig on mainnet)
 * - Authorized keepers (PricingOracleKeeper service wallets)
 * - Initial hedge prices (optional)
 *
 * Deployment Steps:
 * 1. Compile PricingOracle.fc
 * 2. Prompt for admin and keeper addresses
 * 3. Deploy contract with initial configuration
 * 4. Initialize hedge prices for each coverage type
 * 5. Verify deployment and data freshness
 * 6. Output contract address for keeper configuration
 */

export async function run(provider: NetworkProvider) {
    console.log('=== PricingOracle Deployment ===\n');

    // Step 1: Compile contract
    console.log('Step 1: Compiling PricingOracle.fc...');
    const pricingOracleCode = await compile('PricingOracle');
    console.log('✓ Contract compiled successfully\n');

    // Step 2: Get configuration
    console.log('Step 2: Configuration');
    const isMainnet = provider.network() === 'mainnet';

    // Admin address (multi-sig on mainnet)
    let adminAddressStr: string;
    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT - Multi-sig admin required!');
        adminAddressStr = await provider.ui().input(
            'Enter multi-sig admin address (3-of-5 required):'
        );
    } else {
        adminAddressStr = await provider.ui().input(
            'Enter admin address (your wallet for testnet):'
        );
    }
    const adminAddress = Address.parse(adminAddressStr);
    console.log(`Admin address: ${adminAddress.toString()}\n`);

    // Keeper addresses
    const keeperAddresses: Address[] = [];
    const keeperCount = isMainnet ? 3 : 1; // 3 keepers on mainnet for redundancy

    console.log(`Configuring ${keeperCount} authorized keeper(s):`);
    for (let i = 0; i < keeperCount; i++) {
        const keeperAddr = await provider.ui().input(
            `Enter keeper #${i + 1} address:`
        );
        keeperAddresses.push(Address.parse(keeperAddr));
        console.log(`  Keeper #${i + 1}: ${keeperAddr}`);
    }
    console.log('');

    // Step 3: Deploy contract
    console.log('Step 3: Deploying PricingOracle...');
    const pricingOracle = provider.open(
        PricingOracle.createFromConfig(
            {
                adminAddress,
                authorizedKeepers: keeperAddresses,
            },
            pricingOracleCode
        )
    );

    const deploymentCost = toNano('0.5');
    console.log(`Deployment cost: ${deploymentCost} TON`);

    await pricingOracle.sendDeploy(provider.sender(), deploymentCost);
    await provider.waitForDeploy(pricingOracle.address, 100); // 100 attempts
    console.log(`✓ PricingOracle deployed at: ${pricingOracle.address.toString()}\n`);

    // Step 4: Initialize keeper authorization
    console.log('Step 4: Authorizing keepers...');
    for (let i = 0; i < keeperAddresses.length; i++) {
        console.log(`  Authorizing keeper #${i + 1}: ${keeperAddresses[i].toString()}`);
        await pricingOracle.sendAddKeeper(
            provider.sender(),
            {
                value: toNano('0.1'),
                keeperAddress: keeperAddresses[i],
            }
        );
        await sleep(2000); // Wait 2 seconds between transactions
    }
    console.log('✓ All keepers authorized\n');

    // Step 5: Initialize default hedge prices (if testnet)
    if (!isMainnet) {
        console.log('Step 5: Initializing default hedge prices for testnet...');

        const coverageTypes = [
            { type: CoverageType.DEPEG, name: 'DEPEG' },
            { type: CoverageType.EXPLOIT, name: 'EXPLOIT' },
            { type: CoverageType.BRIDGE, name: 'BRIDGE' },
        ];

        for (const coverage of coverageTypes) {
            console.log(`  Initializing ${coverage.name} prices...`);
            await pricingOracle.sendUpdateHedgePrices(
                provider.sender(),
                {
                    value: toNano('0.1'),
                    coverageType: coverage.type,
                    polymarketOdds: 250,      // 2.5%
                    perpFundingRate: -50,     // -0.5% per day
                    allianzQuote: 450,        // $4.50 per $1000
                }
            );
            await sleep(2000);
        }
        console.log('✓ Default prices initialized\n');
    } else {
        console.log('Step 5: Skipped (mainnet - keepers will set prices)\n');
    }

    // Step 6: Verification
    console.log('Step 6: Verifying deployment...');

    // Check admin
    const actualAdmin = await pricingOracle.getAdminAddress();
    console.log(`  Admin: ${actualAdmin.toString()}`);
    if (!actualAdmin.equals(adminAddress)) {
        throw new Error('Admin address mismatch!');
    }

    // Check keeper authorization
    for (let i = 0; i < keeperAddresses.length; i++) {
        const isAuthorized = await pricingOracle.checkKeeperAuthorized(
            keeperAddresses[i]
        );
        console.log(`  Keeper #${i + 1} authorized: ${isAuthorized}`);
        if (!isAuthorized) {
            throw new Error(`Keeper #${i + 1} not authorized!`);
        }
    }

    // Check data freshness (if initialized)
    if (!isMainnet) {
        const isFresh = await pricingOracle.isDataFresh();
        console.log(`  Data fresh: ${isFresh}`);

        // Display initial prices
        for (const coverage of [
            { type: CoverageType.DEPEG, name: 'DEPEG' },
            { type: CoverageType.EXPLOIT, name: 'EXPLOIT' },
            { type: CoverageType.BRIDGE, name: 'BRIDGE' },
        ]) {
            const prices = await pricingOracle.getHedgePrices(coverage.type);
            console.log(`  ${coverage.name} prices: Polymarket=${prices.polymarketOdds}bp, Perp=${prices.perpFundingRate}bp/day, Allianz=${prices.allianzQuote}¢/$1k`);
        }
    }

    console.log('✓ Verification complete\n');

    // Step 7: Output configuration for services
    console.log('=== Deployment Complete ===\n');
    console.log('Contract Address:', pricingOracle.address.toString());
    console.log('\nAdd to .env:');
    console.log(`PRICING_ORACLE_ADDRESS=${pricingOracle.address.toString()}`);
    console.log('\nKeeper Configuration:');
    keeperAddresses.forEach((addr, i) => {
        console.log(`KEEPER_${i + 1}_ADDRESS=${addr.toString()}`);
    });
    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Update PricingOracleKeeper service with contract address');
        console.log('2. Deploy keeper service: npm run deploy:keeper');
        console.log('3. Verify keeper updates within 5 minutes');
        console.log('4. Monitor Grafana dashboard for oracle health');
        console.log('5. Set up AlertManager for oracle failure alerts');
    } else {
        console.log('1. Test oracle updates: npm run test:oracle');
        console.log('2. Verify data freshness: npm run verify:oracle');
        console.log('3. Deploy to mainnet when ready');
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
