import { toNano, Address } from '@ton/core';
import { SecondaryVault } from '../wrappers/SecondaryVault';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Admin address not available');
    }

    // Get ClaimsProcessor address from user
    const claimsProcessorAddressStr = await provider.ui().input('Enter ClaimsProcessor contract address:');
    const claimsProcessorAddress = Address.parse(claimsProcessorAddressStr);

    // Get vault parameters
    const maxSupplyStr = await provider.ui().input('Enter max supply (e.g., 1000000):');
    const maxSupply = BigInt(maxSupplyStr);

    const priceMinStr = await provider.ui().input('Enter minimum price in nanotons (e.g., 800000000 for 0.8 TON):');
    const priceMin = BigInt(priceMinStr);

    const priceMaxStr = await provider.ui().input('Enter maximum price in nanotons (e.g., 1200000000 for 1.2 TON):');
    const priceMax = BigInt(priceMaxStr);

    // Create SecondaryVault with initial config
    const secondaryVault = provider.open(
        SecondaryVault.createFromConfig(
            {
                ownerAddress: adminAddress,
                totalStaked: 0n,
                accumulatedYield: 0n,
                lossesAbsorbed: 0n,
                claimsProcessorAddress: claimsProcessorAddress,
                totalSupply: 0n,
                maxSupply: maxSupply,
                priceMin: priceMin,
                priceMax: priceMax,
            },
            await compile('SecondaryVault')
        )
    );

    // Deploy the contract
    await secondaryVault.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(secondaryVault.address);

    // Log the deployed address
    console.log('✅ SecondaryVault deployed successfully!');
    console.log('Contract address:', secondaryVault.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_SECONDARY_VAULT_ADDRESS=' + secondaryVault.address.toString());
}
