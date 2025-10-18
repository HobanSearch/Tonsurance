import { toNano, Address } from '@ton/core';
import { SmartContractOracleAdapter } from '../wrappers/SmartContractOracleAdapter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const claimsProcessorAddress = Address.parse('EQD__________________________________________');
    const keeperAddress = provider.sender().address!;
    
    const smartContractOracleAdapter = provider.open(SmartContractOracleAdapter.createFromConfig({
        ownerAddress: provider.sender().address!,
        claimsProcessorAddress,
        keeperAddress,
    }, await compile('SmartContractOracleAdapter')));

    await smartContractOracleAdapter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(smartContractOracleAdapter.address);

    console.log('✅ SmartContractOracleAdapter deployed at:', smartContractOracleAdapter.address);
    console.log('');
    console.log('Next steps:');
    console.log('1. Register this adapter with ClaimsProcessor for smart contract coverage');
    console.log('2. Configure security monitoring integrations (CertiK, PeckShield, etc.)');
    console.log('3. Feed contract exploit data');
}
