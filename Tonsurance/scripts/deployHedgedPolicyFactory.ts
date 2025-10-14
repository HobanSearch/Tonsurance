import { toNano, Address } from '@ton/core';
import { HedgedPolicyFactory } from '../wrappers/HedgedPolicyFactory';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;

    if (!adminAddress) {
        throw new Error('Admin address not found. Make sure wallet is connected.');
    }

    console.log('Deploying HedgedPolicyFactory with admin:', adminAddress.toString());
    console.log('');

    // Get PricingOracle address
    const oracleAddressStr = await provider.ui().input(
        'Enter PricingOracle address (deployed in previous step):'
    );

    if (!oracleAddressStr) {
        throw new Error('PricingOracle address is required');
    }

    const oracleAddress = Address.parse(oracleAddressStr);

    // Get HedgeCoordinator address
    const coordinatorAddressStr = await provider.ui().input(
        'Enter HedgeCoordinator address (deployed in previous step):'
    );

    if (!coordinatorAddressStr) {
        throw new Error('HedgeCoordinator address is required');
    }

    const coordinatorAddress = Address.parse(coordinatorAddressStr);

    // Get Reserve Vault address
    const reserveVaultStr = await provider.ui().input(
        'Enter Reserve Vault address (or press Enter to use admin as placeholder):'
    );

    const reserveVault = reserveVaultStr ? Address.parse(reserveVaultStr) : adminAddress;

    if (reserveVault.equals(adminAddress)) {
        console.warn('⚠️  WARNING: Using admin address as Reserve Vault placeholder.');
        console.log('');
    }

    const hedgedPolicyFactory = provider.open(
        await HedgedPolicyFactory.fromInit(oracleAddress, coordinatorAddress, reserveVault)
    );

    await hedgedPolicyFactory.send(
        provider.sender(),
        {
            value: toNano('0.1'), // Higher gas for factory initialization
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(hedgedPolicyFactory.address);

    console.log('✅ HedgedPolicyFactory deployed at:', hedgedPolicyFactory.address.toString());
    console.log('');
    console.log('Configuration:');
    console.log('- Admin:', adminAddress.toString());
    console.log('- PricingOracle:', oracleAddress.toString());
    console.log('- HedgeCoordinator:', coordinatorAddress.toString());
    console.log('- Reserve Vault:', reserveVault.toString());
    console.log('');
    console.log('✅ Phase 4 Hedged Insurance deployment complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Fund Reserve Vault with initial capital');
    console.log('2. Add keeper addresses to PricingOracle and HedgeCoordinator');
    console.log('3. Start keeper services:');
    console.log('   - PricingOracleKeeper (updates prices every 5s)');
    console.log('   - PolymarketKeeper (executes Polymarket hedges)');
    console.log('   - PerpKeeper (executes Perpetual hedges)');
    console.log('   - AllianzKeeper (executes Allianz hedges)');
    console.log('4. Configure API endpoints with factory address');
    console.log('5. Run integration tests against testnet');
    console.log('');
    console.log('Contract Addresses Summary:');
    console.log('---------------------------');
    console.log('PricingOracle:', oracleAddress.toString());
    console.log('HedgeCoordinator:', coordinatorAddress.toString());
    console.log('HedgedPolicyFactory:', hedgedPolicyFactory.address.toString());
    console.log('Reserve Vault:', reserveVault.toString());
    console.log('');
    console.log('Save these addresses to your .env file:');
    console.log(`PRICING_ORACLE_ADDRESS=${oracleAddress.toString()}`);
    console.log(`HEDGE_COORDINATOR_ADDRESS=${coordinatorAddress.toString()}`);
    console.log(`HEDGED_POLICY_FACTORY_ADDRESS=${hedgedPolicyFactory.address.toString()}`);
    console.log(`RESERVE_VAULT_ADDRESS=${reserveVault.toString()}`);
}
