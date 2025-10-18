import { TonClient, Address, toNano } from '@ton/ton';
import { MultiTrancheVault } from '../../wrappers/MultiTrancheVault';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

async function testIntegration() {
    // Load deployed addresses
    if (!fs.existsSync('frontend/.env.deployment')) {
        console.error('❌ frontend/.env.deployment not found');
        console.error('   Run deployment scripts first');
        process.exit(1);
    }

    dotenv.config({ path: 'frontend/.env.deployment' });

    const vaultAddr = process.env.VITE_MULTI_TRANCHE_VAULT_ADDRESS;
    if (!vaultAddr) {
        console.error('❌ Vault address not found');
        process.exit(1);
    }

    console.log('🧪 Testing Integration...');
    console.log('');

    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    const vault = client.open(MultiTrancheVault.createFromAddress(Address.parse(vaultAddr)));

    // Test 1: Read Vault State
    console.log('Test 1: Reading vault state...');
    try {
        const totalCapital = await vault.getTotalCapital();
        console.log('   ✅ Total Capital:', totalCapital.toString(), 'nanoTON');

        const paused = await vault.getPaused();
        console.log('   ✅ Paused:', paused ? 'Yes' : 'No');
    } catch (error) {
        console.error('   ❌ Failed to read vault state:', error);
    }
    console.log('');

    // Test 2: Read Tranche Info
    console.log('Test 2: Reading tranche info...');
    for (let i = 1; i <= 6; i++) {
        try {
            const info = await vault.getTrancheInfo(i);
            console.log(`   ✅ Tranche ${i}:`);
            console.log(`      Capital: ${info.capital} nanoTON`);
            console.log(`      APY Range: ${info.apyMin}-${info.apyMax} bps`);
            console.log(`      Allocation: ${info.allocation}%`);
        } catch (error) {
            console.error(`   ❌ Failed to read tranche ${i}:`, error);
        }
    }
    console.log('');

    // Test 3: Read Tranche States (utilization)
    console.log('Test 3: Reading tranche states...');
    for (let i = 1; i <= 6; i++) {
        try {
            const state = await vault.getTrancheState(i);
            console.log(`   ✅ Tranche ${i} State:`);
            console.log(`      Total Capital: ${state.totalCapital} nanoTON`);
            console.log(`      Active Capital: ${state.activeCapital} nanoTON`);
            console.log(`      Utilization: ${state.utilization}%`);
            console.log(`      Current APY: ${state.currentApy} bps`);
        } catch (error) {
            console.error(`   ⚠️  Could not read tranche ${i} state (may not be initialized)`);
        }
    }
    console.log('');

    // Test 4: Manual Testing Instructions
    console.log('========================================');
    console.log('Test 4: Manual Integration Testing');
    console.log('========================================');
    console.log('');
    console.log('The following tests require wallet interaction:');
    console.log('');
    console.log('1. Policy Purchase:');
    console.log('   a. Open http://localhost:5173');
    console.log('   b. Connect your TON wallet (Tonkeeper/TonHub)');
    console.log('   c. Navigate to "Policy Purchase" page');
    console.log('   d. Select coverage type, chain, stablecoin');
    console.log('   e. Enter coverage amount and duration');
    console.log('   f. Review premium calculation');
    console.log('   g. Click "Purchase Policy"');
    console.log('   h. Approve transaction in wallet');
    console.log('   i. Verify transaction on testnet.tonscan.org');
    console.log('');
    console.log('2. Vault Staking:');
    console.log('   a. Navigate to "Vault Staking" page');
    console.log('   b. Select a tranche (e.g., SURE-SNR)');
    console.log('   c. Enter stake amount (min 10 TON)');
    console.log('   d. Click "Stake"');
    console.log('   e. Approve transaction');
    console.log('   f. Verify stake on Analytics page');
    console.log('');
    console.log('3. Claims Filing (requires active policy):');
    console.log('   a. Navigate to "Claims" page');
    console.log('   b. Select your policy');
    console.log('   c. Upload evidence (transaction hash, depeg proof)');
    console.log('   d. Submit claim');
    console.log('   e. Wait for oracle verification');
    console.log('   f. Check claim status');
    console.log('');
    console.log('4. Analytics Dashboard:');
    console.log('   a. Navigate to "Analytics" page');
    console.log('   b. Verify total TVL displays correctly');
    console.log('   c. Check policy volume chart');
    console.log('   d. Review tranche utilization rates');
    console.log('   e. Verify premium income tracking');
    console.log('');
    console.log('========================================');
    console.log('');
    console.log('✅ Automated tests complete!');
    console.log('   Please proceed with manual testing above.');
    console.log('');
}

testIntegration().catch(console.error);
