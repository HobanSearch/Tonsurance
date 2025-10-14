import { toNano, Address } from '@ton/core';
import { HedgeCoordinator } from '../wrappers/HedgeCoordinator';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;

    if (!adminAddress) {
        throw new Error('Admin address not found. Make sure wallet is connected.');
    }

    console.log('Deploying HedgeCoordinator with admin:', adminAddress.toString());
    console.log('');

    // Get factory address from user
    const factoryAddressStr = await provider.ui().input(
        'Enter HedgedPolicyFactory address (or press Enter to use admin as placeholder):'
    );

    const factoryAddress = factoryAddressStr
        ? Address.parse(factoryAddressStr)
        : adminAddress; // Use admin as placeholder for now

    if (factoryAddress.equals(adminAddress)) {
        console.warn(
            '⚠️  WARNING: Using admin address as factory placeholder. Update this after deploying HedgedPolicyFactory!'
        );
        console.log('');
    }

    const hedgeCoordinator = provider.open(
        await HedgeCoordinator.fromInit(adminAddress, factoryAddress)
    );

    await hedgeCoordinator.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(hedgeCoordinator.address);

    console.log('✅ HedgeCoordinator deployed at:', hedgeCoordinator.address.toString());
    console.log('');
    console.log('Configuration:');
    console.log('- Admin:', adminAddress.toString());
    console.log('- Factory:', factoryAddress.toString());
    console.log('');
    console.log('Next steps:');
    console.log('1. Add authorized keepers using sendAddKeeper() for:');
    console.log('   - Polymarket keeper');
    console.log('   - Perpetuals keeper');
    console.log('   - Allianz keeper');
    console.log('2. Start keeper services to execute and liquidate hedges');
    console.log('');

    if (factoryAddress.equals(adminAddress)) {
        console.log('⚠️  IMPORTANT: Update factory address after deploying HedgedPolicyFactory:');
        console.log(`   - Current placeholder: ${factoryAddress.toString()}`);
        console.log('   - You may need to redeploy HedgeCoordinator with correct factory address');
    }
}
