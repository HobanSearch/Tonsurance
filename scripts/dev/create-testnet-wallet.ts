import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4, TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import * as fs from 'fs';

async function createWallet() {
    // Generate new mnemonic
    const mnemonics = await mnemonicNew();
    console.log('🔐 Generated Mnemonic (SAVE THIS SECURELY):');
    console.log(mnemonics.join(' '));
    console.log('');

    // Get keypair
    const keyPair = await mnemonicToPrivateKey(mnemonics);

    // Create wallet contract
    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });

    console.log('📍 Wallet Address:', wallet.address.toString());
    console.log('');
    console.log('Next steps:');
    console.log('1. Send testnet TON to this address: https://t.me/testgiver_ton_bot');
    console.log('   Or use: https://faucet.toncoin.org/');
    console.log('2. Save mnemonic to .env.deployment (DO NOT COMMIT)');
    console.log('3. Run deployment scripts');

    // Save to .env.deployment template
    const envContent = `# Deployment Wallet - KEEP SECRET, DO NOT COMMIT
DEPLOYMENT_MNEMONIC="${mnemonics.join(' ')}"
DEPLOYMENT_ADDRESS="${wallet.address.toString()}"
`;

    fs.writeFileSync('.env.deployment.example', envContent);
    console.log('');
    console.log('✅ Template saved to .env.deployment.example');
    console.log('   Copy to .env.deployment and keep it secure!');
}

createWallet().catch(console.error);
