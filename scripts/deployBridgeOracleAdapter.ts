import { toNano, Address } from '@ton/core';
import { BridgeOracleAdapter } from '../wrappers/BridgeOracleAdapter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const claimsProcessorAddress = Address.parse('EQD__________________________________________');
    const keeperAddress = provider.sender().address!;
    
    const bridgeOracleAdapter = provider.open(BridgeOracleAdapter.createFromConfig({
        ownerAddress: provider.sender().address!,
        claimsProcessorAddress,
        keeperAddress,
    }, await compile('BridgeOracleAdapter')));

    await bridgeOracleAdapter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(bridgeOracleAdapter.address);

    console.log('✅ BridgeOracleAdapter deployed at:', bridgeOracleAdapter.address);
    console.log('');
    console.log('Next steps:');
    console.log('1. Register this adapter with ClaimsProcessor for bridge coverage');
    console.log('2. Configure bridge monitoring service');
    console.log('3. Feed bridge health and exploit data');
}
