import { toNano, Address } from '@ton/core';
import { ClaimsProcessor } from '../wrappers/ClaimsProcessor';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Admin address not available');
    }

    // Get dependency contract addresses from user
    const treasuryAddressStr = await provider.ui().input('Enter Treasury contract address:');
    const treasuryAddress = Address.parse(treasuryAddressStr);

    const primaryVaultAddressStr = await provider.ui().input('Enter PrimaryVault contract address:');
    const primaryVaultAddress = Address.parse(primaryVaultAddressStr);

    const secondaryVaultAddressStr = await provider.ui().input('Enter SecondaryVault contract address:');
    const secondaryVaultAddress = Address.parse(secondaryVaultAddressStr);

    const tradfiBufferAddressStr = await provider.ui().input('Enter TradFiBuffer contract address:');
    const tradfiBufferAddress = Address.parse(tradfiBufferAddressStr);

    const priceOracleAddressStr = await provider.ui().input('Enter PriceOracle contract address:');
    const priceOracleAddress = Address.parse(priceOracleAddressStr);

    // Get auto-approval threshold
    const autoApprovalThresholdStr = await provider.ui().input('Enter auto-approval threshold in basis points (e.g., 500 for 5%):');
    const autoApprovalThreshold = parseInt(autoApprovalThresholdStr);

    // Create ClaimsProcessor with initial config
    const claimsProcessor = provider.open(
        ClaimsProcessor.createFromConfig(
            {
                ownerAddress: adminAddress,
                nextClaimId: 1n,
                treasuryAddress: treasuryAddress,
                primaryVaultAddress: primaryVaultAddress,
                secondaryVaultAddress: secondaryVaultAddress,
                tradfiBufferAddress: tradfiBufferAddress,
                priceOracleAddress: priceOracleAddress,
                autoApprovalThreshold: autoApprovalThreshold,
            },
            await compile('ClaimsProcessor')
        )
    );

    // Deploy the contract
    await claimsProcessor.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(claimsProcessor.address);

    // Log the deployed address
    console.log('✅ ClaimsProcessor deployed successfully!');
    console.log('Contract address:', claimsProcessor.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_CLAIMS_PROCESSOR_ADDRESS=' + claimsProcessor.address.toString());
}
