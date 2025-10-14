import { toNano, Address } from '@ton/core';
import { SimplePremiumDistributor } from '../wrappers/SimplePremiumDistributor';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Admin address not available');
    }

    // Get dependency contract addresses from user
    const primaryVaultAddressStr = await provider.ui().input('Enter PrimaryVault contract address:');
    const primaryVaultAddress = Address.parse(primaryVaultAddressStr);

    const secondaryVaultAddressStr = await provider.ui().input('Enter SecondaryVault contract address:');
    const secondaryVaultAddress = Address.parse(secondaryVaultAddressStr);

    const protocolTreasuryAddressStr = await provider.ui().input('Enter ProtocolTreasury contract address:');
    const protocolTreasuryAddress = Address.parse(protocolTreasuryAddressStr);

    const reserveFundAddressStr = await provider.ui().input('Enter ReserveFund contract address:');
    const reserveFundAddress = Address.parse(reserveFundAddressStr);

    // Create SimplePremiumDistributor with initial config
    const simplePremiumDistributor = provider.open(
        SimplePremiumDistributor.createFromConfig(
            {
                ownerAddress: adminAddress,
                primaryVaultAddress: primaryVaultAddress,
                secondaryVaultAddress: secondaryVaultAddress,
                protocolTreasuryAddress: protocolTreasuryAddress,
                reserveFundAddress: reserveFundAddress,
                totalPremiumsDistributed: 0n,
                distributionCount: 0n,
            },
            await compile('SimplePremiumDistributor')
        )
    );

    // Deploy the contract
    await simplePremiumDistributor.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(simplePremiumDistributor.address);

    // Log the deployed address
    console.log('✅ SimplePremiumDistributor deployed successfully!');
    console.log('Contract address:', simplePremiumDistributor.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_PREMIUM_DISTRIBUTOR_ADDRESS=' + simplePremiumDistributor.address.toString());
}
