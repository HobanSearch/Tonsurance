import { toNano } from '@ton/core';
import { PricingOracle } from '../wrappers/PricingOracle';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const adminAddress = provider.sender().address;

    if (!adminAddress) {
        throw new Error('Admin address not found. Make sure wallet is connected.');
    }

    console.log('Deploying PricingOracle with admin:', adminAddress.toString());

    const pricingOracle = provider.open(await PricingOracle.fromInit(adminAddress));

    await pricingOracle.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(pricingOracle.address);

    console.log('✅ PricingOracle deployed at:', pricingOracle.address.toString());
    console.log('');
    console.log('Next steps:');
    console.log('1. Add authorized keepers using sendAddKeeper()');
    console.log('2. Start PricingOracleKeeper service to update prices every 5 seconds');
    console.log('');
    console.log('Example keeper setup:');
    console.log(`
const keeper = new PricingOracleKeeper({
    oracleAddress: Address.parse('${pricingOracle.address.toString()}'),
    keeperWallet: myWallet,
    polymarketConnector: new PolymarketConnector({ ... }),
    updateInterval: 5000, // 5 seconds
});

keeper.start();
    `);
}
