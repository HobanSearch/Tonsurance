import { toNano, Address } from '@ton/core';
import { DepegOracleAdapter } from '../wrappers/DepegOracleAdapter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // TODO: Replace with actual ClaimsProcessor address from deployment manifest
    const claimsProcessorAddress = Address.parse('EQD__________________________________________');
    
    // Keeper address (backend service that updates price data)
    const keeperAddress = provider.sender().address!; // For now, use deployer as keeper
    
    const depegOracleAdapter = provider.open(DepegOracleAdapter.createFromConfig({
        ownerAddress: provider.sender().address!,
        claimsProcessorAddress,
        keeperAddress,
    }, await compile('DepegOracleAdapter')));

    await depegOracleAdapter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(depegOracleAdapter.address);

    console.log('✅ DepegOracleAdapter deployed at:', depegOracleAdapter.address);
    console.log('');
    console.log('Next steps:');
    console.log('1. Register this adapter with ClaimsProcessor:');
    console.log(`   await claimsProcessor.sendSetOracleAdapter(chainId, '${depegOracleAdapter.address}')`);
    console.log('2. Configure keeper backend service with this address');
    console.log('3. Start feeding price data from Chainlink/Pyth/Binance');
}
