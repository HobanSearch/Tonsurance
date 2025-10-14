import { toNano, Address } from '@ton/core';
import { TradFiBuffer } from '../wrappers/TradFiBuffer';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;
    if (!adminAddress) {
        throw new Error('Admin address not available');
    }

    // Get dependency contract addresses from user
    const complianceGatewayAddressStr = await provider.ui().input('Enter ComplianceGateway contract address:');
    const complianceGatewayAddress = Address.parse(complianceGatewayAddressStr);

    const shieldInstTokenAddressStr = await provider.ui().input('Enter ShieldInstToken contract address:');
    const shieldInstTokenAddress = Address.parse(shieldInstTokenAddressStr);

    const premiumDistributorAddressStr = await provider.ui().input('Enter PremiumDistributor contract address:');
    const premiumDistributorAddress = Address.parse(premiumDistributorAddressStr);

    // Get buffer parameters
    const minDepositStr = await provider.ui().input('Enter minimum deposit in TON (e.g., 250000):');
    const minDeposit = toNano(minDepositStr);

    const lockPeriodStr = await provider.ui().input('Enter lock period in days (e.g., 180):');
    const lockPeriod = parseInt(lockPeriodStr) * 86400; // Convert days to seconds

    const minApyStr = await provider.ui().input('Enter minimum APY in basis points (e.g., 520 for 5.2%):');
    const minApy = parseInt(minApyStr);

    const maxApyStr = await provider.ui().input('Enter maximum APY in basis points (e.g., 800 for 8.0%):');
    const maxApy = parseInt(maxApyStr);

    // Create TradFiBuffer with initial config
    const tradFiBuffer = provider.open(
        TradFiBuffer.createFromConfig(
            {
                ownerAddress: adminAddress,
                complianceGatewayAddress: complianceGatewayAddress,
                shieldInstTokenAddress: shieldInstTokenAddress,
                premiumDistributorAddress: premiumDistributorAddress,
                totalDeposited: 0n,
                totalWithdrawn: 0n,
                totalInterestPaid: 0n,
                currentTvl: 0n,
                minDeposit: minDeposit,
                lockPeriod: lockPeriod,
                minApy: minApy,
                maxApy: maxApy,
            },
            await compile('TradFiBuffer')
        )
    );

    // Deploy the contract
    await tradFiBuffer.sendDeploy(provider.sender(), toNano('0.05'));

    // Wait for deployment to complete
    await provider.waitForDeploy(tradFiBuffer.address);

    // Log the deployed address
    console.log('✅ TradFiBuffer deployed successfully!');
    console.log('Contract address:', tradFiBuffer.address.toString());
    console.log('\nAdd to your .env file:');
    console.log('VITE_TRADFI_BUFFER_ADDRESS=' + tradFiBuffer.address.toString());
}
