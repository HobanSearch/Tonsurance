import { TonClient, Address } from '@ton/ton';
import { MultiTrancheVault } from '../../wrappers/MultiTrancheVault';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

async function verifyDeployment() {
    // Load deployed addresses
    if (!fs.existsSync('frontend/.env.deployment')) {
        console.error('❌ frontend/.env.deployment not found');
        console.error('   Run deployment scripts first');
        process.exit(1);
    }

    dotenv.config({ path: 'frontend/.env.deployment' });

    const vaultAddr = process.env.VITE_MULTI_TRANCHE_VAULT_ADDRESS;
    const oracleAddr = process.env.VITE_DYNAMIC_PRICING_ORACLE_ADDRESS;
    const factoryAddr = process.env.VITE_POLICY_FACTORY_ADDRESS;
    const claimsAddr = process.env.VITE_CLAIMS_PROCESSOR_ADDRESS;

    if (!vaultAddr || !oracleAddr || !factoryAddr || !claimsAddr) {
        console.error('❌ Deployment addresses not found in frontend/.env.deployment');
        console.error('   Required addresses: VAULT, ORACLE, FACTORY, CLAIMS');
        process.exit(1);
    }

    console.log('🔍 Verifying Deployed Contracts...');
    console.log('');

    // Connect to testnet
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    let allSuccess = true;

    // 1. Verify MultiTrancheVault
    console.log('1️⃣  Verifying MultiTrancheVault');
    console.log('   Address:', vaultAddr);
    try {
        const vault = client.open(MultiTrancheVault.createFromAddress(Address.parse(vaultAddr)));

        // Check if contract is deployed
        const state = await client.getContractState(Address.parse(vaultAddr));
        if (state.state !== 'active') {
            console.error('   ❌ Contract is not active. State:', state.state);
            allSuccess = false;
        } else {
            console.log('   ✅ Contract is active');

            // Try to read contract data
            try {
                const totalCapital = await vault.getTotalCapital();
                const paused = await vault.getPaused();
                console.log('   ✅ Total Capital:', totalCapital.toString());
                console.log('   ✅ Paused:', paused);

                // Check tranches
                for (let i = 1; i <= 6; i++) {
                    try {
                        const info = await vault.getTrancheInfo(i);
                        console.log(`   ✅ Tranche ${i}: Capital=${info.capital}, APY=${info.apyMin}-${info.apyMax}`);
                    } catch (e) {
                        console.log(`   ⚠️  Tranche ${i}: Could not read data`);
                    }
                }
            } catch (error) {
                console.log('   ⚠️  Could not read contract data (may need initialization)');
            }
        }
    } catch (error) {
        console.error('   ❌ Vault verification failed:', error);
        allSuccess = false;
    }
    console.log('');

    // 2. Verify DynamicPricingOracle
    console.log('2️⃣  Verifying DynamicPricingOracle');
    console.log('   Address:', oracleAddr);
    try {
        const state = await client.getContractState(Address.parse(oracleAddr));
        if (state.state !== 'active') {
            console.error('   ❌ Contract is not active. State:', state.state);
            allSuccess = false;
        } else {
            console.log('   ✅ Contract is active');
            console.log('   ⚠️  Manual testing required for oracle data');
        }
    } catch (error) {
        console.error('   ❌ Oracle verification failed:', error);
        allSuccess = false;
    }
    console.log('');

    // 3. Verify PolicyFactory
    console.log('3️⃣  Verifying PolicyFactory');
    console.log('   Address:', factoryAddr);
    try {
        const state = await client.getContractState(Address.parse(factoryAddr));
        if (state.state !== 'active') {
            console.error('   ❌ Contract is not active. State:', state.state);
            allSuccess = false;
        } else {
            console.log('   ✅ Contract is active');
        }
    } catch (error) {
        console.error('   ❌ Factory verification failed:', error);
        allSuccess = false;
    }
    console.log('');

    // 4. Verify ClaimsProcessor
    console.log('4️⃣  Verifying ClaimsProcessor');
    console.log('   Address:', claimsAddr);
    try {
        const state = await client.getContractState(Address.parse(claimsAddr));
        if (state.state !== 'active') {
            console.error('   ❌ Contract is not active. State:', state.state);
            allSuccess = false;
        } else {
            console.log('   ✅ Contract is active');
        }
    } catch (error) {
        console.error('   ❌ Claims verification failed:', error);
        allSuccess = false;
    }
    console.log('');

    // 5. Check PolicyRouter if deployed
    const routerAddr = process.env.VITE_POLICY_ROUTER_ADDRESS;
    if (routerAddr) {
        console.log('5️⃣  Verifying PolicyRouter (Optional)');
        console.log('   Address:', routerAddr);
        try {
            const state = await client.getContractState(Address.parse(routerAddr));
            if (state.state !== 'active') {
                console.error('   ❌ Contract is not active. State:', state.state);
                allSuccess = false;
            } else {
                console.log('   ✅ Contract is active');
            }
        } catch (error) {
            console.error('   ❌ Router verification failed:', error);
            allSuccess = false;
        }
        console.log('');
    }

    // Summary
    console.log('========================================');
    if (allSuccess) {
        console.log('✅ All contracts verified successfully!');
    } else {
        console.log('⚠️  Some contracts failed verification');
        console.log('   Check the errors above for details');
    }
    console.log('========================================');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update frontend/.env:');
    console.log('     cat frontend/.env.deployment >> frontend/.env');
    console.log('2. Start frontend and test integration:');
    console.log('     cd frontend && npm run dev');
    console.log('3. Connect wallet and create a test policy');
    console.log('');
}

verifyDeployment().catch(console.error);
