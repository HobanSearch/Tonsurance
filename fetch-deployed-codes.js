// Fetch deployed contract codes from testnet blockchain
// Run with: node fetch-deployed-codes.js

const { TonClient, Address } = require('@ton/ton');
const fs = require('fs');

// Deployed contract addresses from your deployment
const DEPEG_SUBFACTORY_ADDRESS = 'EQAtydPbgSFdXrCwojq2QKZH61LDSPwNj0gE9mD9X8qMYrjc';
const TRADFI_NATCAT_FACTORY_ADDRESS = 'EQCqSONKAyl6LqHy_M78VVw1wXhvh_r3eSXdLI0p5ZaiX8P3';

async function main() {
    console.log('\n📡 Fetching deployed contract codes from testnet...\n');

    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC'
    });

    try {
        // Fetch DepegSubFactory code
        console.log('Fetching DepegSubFactory code...');
        const depegAddr = Address.parse(DEPEG_SUBFACTORY_ADDRESS);
        const depegState = await client.getContractState(depegAddr);

        if (!depegState.code) {
            console.error('❌ DepegSubFactory code not found');
            return;
        }

        // Code is already a Buffer/Cell, convert to base64
        const depegCodeBase64 = Buffer.from(depegState.code).toString('base64');
        const depegCodeHex = Buffer.from(depegState.code).toString('hex');
        console.log('✓ DepegSubFactory code fetched');

        // Fetch TradFiNatCatFactory code
        console.log('Fetching TradFiNatCatFactory code...');
        const tradFiAddr = Address.parse(TRADFI_NATCAT_FACTORY_ADDRESS);
        const tradFiState = await client.getContractState(tradFiAddr);

        if (!tradFiState.code) {
            console.error('❌ TradFiNatCatFactory code not found');
            return;
        }

        const tradFiCodeBase64 = Buffer.from(tradFiState.code).toString('base64');
        const tradFiCodeHex = Buffer.from(tradFiState.code).toString('hex');
        console.log('✓ TradFiNatCatFactory code fetched\n');

        // Save to files
        if (!fs.existsSync('build')) {
            fs.mkdirSync('build', { recursive: true });
        }

        fs.writeFileSync(
            'build/DepegSubFactory.deployed.json',
            JSON.stringify({
                address: DEPEG_SUBFACTORY_ADDRESS,
                codeBase64: depegCodeBase64,
                codeHex: depegCodeHex
            }, null, 2)
        );

        fs.writeFileSync(
            'build/TradFiNatCatFactory.deployed.json',
            JSON.stringify({
                address: TRADFI_NATCAT_FACTORY_ADDRESS,
                codeBase64: tradFiCodeBase64,
                codeHex: tradFiCodeHex
            }, null, 2)
        );

        console.log('✅ Deployed codes saved to build/ directory\n');
        console.log('Files created:');
        console.log('  - build/DepegSubFactory.deployed.json');
        console.log('  - build/TradFiNatCatFactory.deployed.json\n');
        console.log('📋 Next: Create HTML page to send registration transactions\n');

    } catch (error) {
        console.error('❌ Error fetching codes:', error.message);
    }
}

main();
