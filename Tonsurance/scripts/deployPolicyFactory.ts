import { toNano, Address } from '@ton/core';
import { PolicyFactory } from '../wrappers/PolicyFactory';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Admin address not available');
    }

    // Get Treasury address from user
    const treasuryAddressStr = await provider.ui().input('Enter Treasury contract address:');
    const treasuryAddress = Address.parse(treasuryAddressStr);

    // Create PolicyFactory with initial config
    const policyFactory = provider.open(
        PolicyFactory.createFromConfig(
            {
                ownerAddress: adminAddress,
                nextPolicyId: 1n,
                totalPoliciesCreated: 0n,
                activePoliciesCount: 0n,
                treasuryAddress: treasuryAddress,
                paused: 0,
            },
            await compile('PolicyFactory')
        )
    );

    // Deploy the contract
    await policyFactory.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(policyFactory.address);

    // Log the deployed address
    console.log('✅ PolicyFactory deployed successfully!');
    console.log('Contract address:', policyFactory.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_POLICY_FACTORY_ADDRESS=' + policyFactory.address.toString());
}
