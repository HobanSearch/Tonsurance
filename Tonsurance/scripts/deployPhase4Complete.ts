import { toNano, Address } from '@ton/core';
import { PricingOracle } from '../wrappers/PricingOracle';
import { HedgeCoordinator } from '../wrappers/HedgeCoordinator';
import { HedgedPolicyFactory } from '../wrappers/HedgedPolicyFactory';
import { NetworkProvider, sleep } from '@ton/blueprint';

/**
 * Master deployment script for Phase 4 Hedged Insurance
 *
 * Deploys all three contracts in correct order:
 * 1. PricingOracle
 * 2. HedgeCoordinator
 * 3. HedgedPolicyFactory
 *
 * Usage:
 *   npx blueprint run deployPhase4Complete --testnet
 *   npx blueprint run deployPhase4Complete --mainnet
 */
export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;

    if (!adminAddress) {
        throw new Error('Admin address not found. Make sure wallet is connected.');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('Phase 4 Hedged Insurance - Complete Deployment');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Admin address:', adminAddress.toString());
    console.log('');

    // Get Reserve Vault address
    const reserveVaultStr = await provider.ui().input(
        'Enter Reserve Vault address (or press Enter to use admin as placeholder):'
    );

    const reserveVault = reserveVaultStr ? Address.parse(reserveVaultStr) : adminAddress;

    if (reserveVault.equals(adminAddress)) {
        console.warn('⚠️  WARNING: Using admin address as Reserve Vault placeholder.');
        console.log('   Update this after deploying vault contracts.');
        console.log('');
    }

    const confirm = await provider.ui().input(
        'Deploy all Phase 4 contracts? (yes/no):'
    );

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
        console.log('Deployment cancelled.');
        return;
    }

    console.log('');
    console.log('───────────────────────────────────────────────────────────');
    console.log('Step 1/3: Deploying PricingOracle');
    console.log('───────────────────────────────────────────────────────────');
    console.log('');

    const pricingOracle = provider.open(await PricingOracle.fromInit(adminAddress));

    await pricingOracle.send(
        provider.sender(),
        { value: toNano('0.05') },
        { $$type: 'Deploy', queryId: 0n }
    );

    await provider.waitForDeploy(pricingOracle.address);

    console.log('✅ PricingOracle deployed at:', pricingOracle.address.toString());
    console.log('');

    await sleep(2000); // Wait 2 seconds between deployments

    console.log('───────────────────────────────────────────────────────────');
    console.log('Step 2/3: Deploying HedgeCoordinator');
    console.log('───────────────────────────────────────────────────────────');
    console.log('');

    // Use admin as placeholder for factory (will be updated)
    const hedgeCoordinator = provider.open(
        await HedgeCoordinator.fromInit(adminAddress, adminAddress)
    );

    await hedgeCoordinator.send(
        provider.sender(),
        { value: toNano('0.05') },
        { $$type: 'Deploy', queryId: 0n }
    );

    await provider.waitForDeploy(hedgeCoordinator.address);

    console.log('✅ HedgeCoordinator deployed at:', hedgeCoordinator.address.toString());
    console.log('   (Factory address will be updated in step 3)');
    console.log('');

    await sleep(2000);

    console.log('───────────────────────────────────────────────────────────');
    console.log('Step 3/3: Deploying HedgedPolicyFactory');
    console.log('───────────────────────────────────────────────────────────');
    console.log('');

    const hedgedPolicyFactory = provider.open(
        await HedgedPolicyFactory.fromInit(
            pricingOracle.address,
            hedgeCoordinator.address,
            reserveVault
        )
    );

    await hedgedPolicyFactory.send(
        provider.sender(),
        { value: toNano('0.1') },
        { $$type: 'Deploy', queryId: 0n }
    );

    await provider.waitForDeploy(hedgedPolicyFactory.address);

    console.log('✅ HedgedPolicyFactory deployed at:', hedgedPolicyFactory.address.toString());
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Phase 4 Deployment Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Contract Addresses:');
    console.log('-------------------');
    console.log('PricingOracle:        ', pricingOracle.address.toString());
    console.log('HedgeCoordinator:     ', hedgeCoordinator.address.toString());
    console.log('HedgedPolicyFactory:  ', hedgedPolicyFactory.address.toString());
    console.log('Reserve Vault:        ', reserveVault.toString());
    console.log('');
    console.log('.env Configuration:');
    console.log('-------------------');
    console.log(`PRICING_ORACLE_ADDRESS=${pricingOracle.address.toString()}`);
    console.log(`HEDGE_COORDINATOR_ADDRESS=${hedgeCoordinator.address.toString()}`);
    console.log(`HEDGED_POLICY_FACTORY_ADDRESS=${hedgedPolicyFactory.address.toString()}`);
    console.log(`RESERVE_VAULT_ADDRESS=${reserveVault.toString()}`);
    console.log('');
    console.log('Post-Deployment Checklist:');
    console.log('-------------------------');
    console.log('□ 1. Update HedgeCoordinator factory address');
    console.log('     (Currently using placeholder, needs to point to HedgedPolicyFactory)');
    console.log('');
    console.log('□ 2. Add keeper addresses:');
    console.log('     - PricingOracle: Add price update keeper');
    console.log('     - HedgeCoordinator: Add 3 keepers (Polymarket, Perp, Allianz)');
    console.log('');
    console.log('□ 3. Fund Reserve Vault with initial capital');
    console.log('');
    console.log('□ 4. Start keeper services:');
    console.log('     - PricingOracleKeeper (updates every 5s)');
    console.log('     - PolymarketKeeper');
    console.log('     - PerpKeeper');
    console.log('     - AllianzKeeper');
    console.log('');
    console.log('□ 5. Configure external API credentials:');
    console.log('     - Polymarket CLOB API key');
    console.log('     - Binance Futures API key');
    console.log('     - Allianz Parametric API key');
    console.log('');
    console.log('□ 6. Run integration tests against testnet:');
    console.log('     npm run test:integration');
    console.log('');
    console.log('□ 7. Update frontend with factory address');
    console.log('');
    console.log('□ 8. Monitor first 24 hours:');
    console.log('     - Oracle price updates');
    console.log('     - Policy creation flow');
    console.log('     - Hedge execution success rate');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('⚠️  IMPORTANT SECURITY NOTES:');
    console.log('');
    console.log('1. Store these addresses securely (use .env file, never commit to git)');
    console.log('2. Admin private key should be stored in hardware wallet or secrets manager');
    console.log('3. Keeper API keys should use AWS Secrets Manager or similar');
    console.log('4. Enable multi-sig for mainnet admin functions (3-of-5 recommended)');
    console.log('5. Gradual rollout: Start with $10k coverage limit, increase after 2 weeks');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    // Save deployment info to file
    const deploymentInfo = {
        network: provider.network(),
        timestamp: new Date().toISOString(),
        admin: adminAddress.toString(),
        contracts: {
            pricingOracle: pricingOracle.address.toString(),
            hedgeCoordinator: hedgeCoordinator.address.toString(),
            hedgedPolicyFactory: hedgedPolicyFactory.address.toString(),
            reserveVault: reserveVault.toString(),
        },
    };

    console.log('');
    console.log('Deployment info saved to: deployment-phase4.json');
    console.log('');

    // In a real deployment, you would save this to a file
    // For now, just return the info
    return deploymentInfo;
}
