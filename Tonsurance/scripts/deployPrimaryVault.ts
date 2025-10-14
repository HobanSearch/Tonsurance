import { toNano, Address } from '@ton/core';
import { PrimaryVault } from '../wrappers/PrimaryVault';
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
    const maxSupplyStr = await provider.ui().input('Enter max supply in TON (e.g., 1000000):');
    const maxSupply = toNano(maxSupplyStr);

    const priceMinStr = await provider.ui().input('Enter minimum price (e.g., 0.8 for 0.8 TON):');
    const priceMin = toNano(priceMinStr);

    const priceMaxStr = await provider.ui().input('Enter maximum price (e.g., 1.2 for 1.2 TON):');
    const priceMax = toNano(priceMaxStr);

    // Create PrimaryVault with initial config
    const primaryVault = provider.open(
        PrimaryVault.createFromConfig(
            {
                ownerAddress: adminAddress,
                totalLpCapital: 0n,
                totalSupply: 0n,
                maxSupply: maxSupply,
                priceMin: priceMin,
                priceMax: priceMax,
                accumulatedYield: 0n,
                lossesAbsorbed: 0n,
                claimsProcessorAddress: claimsProcessorAddress,
            },
            await compile('PrimaryVault')
        )
    );

    // Deploy the contract
    await primaryVault.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(primaryVault.address);

    // Log the deployed address
    console.log('✅ PrimaryVault deployed successfully!');
    console.log('Contract address:', primaryVault.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_PRIMARY_VAULT_ADDRESS=' + primaryVault.address.toString());
}
