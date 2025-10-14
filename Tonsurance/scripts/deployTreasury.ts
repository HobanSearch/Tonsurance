import { toNano, Address } from '@ton/core';
import { Treasury } from '../wrappers/Treasury';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Admin address not available');
    }

    // Get dependency contract addresses from user
    const claimsProcessorAddressStr = await provider.ui().input('Enter ClaimsProcessor contract address:');
    const claimsProcessorAddress = Address.parse(claimsProcessorAddressStr);

    const premiumDistributorAddressStr = await provider.ui().input('Enter PremiumDistributor contract address:');
    const premiumDistributorAddress = Address.parse(premiumDistributorAddressStr);

    const stakingPoolAddressStr = await provider.ui().input('Enter StakingPool contract address:');
    const stakingPoolAddress = Address.parse(stakingPoolAddressStr);

    // Create Treasury with initial config
    const treasury = provider.open(
        Treasury.createFromConfig(
            {
                ownerAddress: adminAddress,
                totalPremiumsCollected: 0n,
                totalPayoutsMade: 0n,
                reserveBalance: 0n,
                claimsProcessorAddress: claimsProcessorAddress,
                premiumDistributorAddress: premiumDistributorAddress,
                stakingPoolAddress: stakingPoolAddress,
            },
            await compile('Treasury')
        )
    );

    // Deploy the contract
    await treasury.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(treasury.address);

    // Log the deployed address
    console.log('✅ Treasury deployed successfully!');
    console.log('Contract address:', treasury.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_TREASURY_ADDRESS=' + treasury.address.toString());
}
