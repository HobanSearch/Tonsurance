import { toNano, Address } from '@ton/core';
import { NetworkProvider, compile } from '@ton/blueprint';
import { MasterFactory } from '../wrappers/v3/MasterFactory';

/**
 * Register Factory Codes in MasterFactory
 *
 * This script registers the compiled factory codes in the MasterFactory's
 * factory_codes dictionary so it can deploy sub-factories on-demand.
 *
 * Product Types:
 * - 1: DEPEG (DepegSubFactory)
 * - 5: TRADFI_NATCAT (TradFiNatCatFactory)
 */

export async function run(provider: NetworkProvider) {
    console.log('\n🔧 ===== REGISTER FACTORY CODES =====\n');

    const isMainnet = provider.network() === 'mainnet';
    if (isMainnet) {
        console.error('❌ This script is for TESTNET only');
        return;
    }

    console.log('📍 Network: TESTNET\n');

    // MasterFactory address from deployment
    const masterFactoryAddress = 'EQACcoHQ5QrxfP8uvOyVdQ3OV54GSC63UWDRpBCRBBwGli6H';

    console.log(`MasterFactory: ${masterFactoryAddress}\n`);

    // ============================================================
    // STEP 1: COMPILE FACTORY CODES
    // ============================================================

    console.log('Step 1: Compiling factory codes...\n');

    const depegSubFactoryCode = await compile('DepegSubFactory');
    console.log('✓ DepegSubFactory compiled');

    const tradFiNatCatFactoryCode = await compile('TradFiNatCatFactory');
    console.log('✓ TradFiNatCatFactory compiled\n');

    // ============================================================
    // STEP 2: CONNECT TO MASTERFACTORY
    // ============================================================

    console.log('Step 2: Connecting to MasterFactory...\n');

    const masterFactory = provider.open(
        MasterFactory.createFromAddress(
            Address.parse(masterFactoryAddress)
        )
    );

    // Verify connection by checking admin
    try {
        const admin = await masterFactory.getAdmin();
        console.log(`✓ Connected to MasterFactory`);
        console.log(`  Admin: ${admin.toString()}\n`);
    } catch (error) {
        console.error('❌ Failed to connect to MasterFactory');
        console.error(error);
        return;
    }

    // ============================================================
    // STEP 3: REGISTER DEPEG SUBFACTORY CODE (Product Type 1)
    // ============================================================

    console.log('Step 3: Registering DepegSubFactory code (product_type=1)...\n');

    const confirm1 = await provider.ui().confirm(
        'Register DepegSubFactory code (product_type=1)?\nCost: ~0.05 TON'
    );

    if (confirm1) {
        await masterFactory.sendSetFactoryCode(provider.sender(), {
            value: toNano('0.05'),
            productType: 1, // PRODUCT_DEPEG
            factoryCode: depegSubFactoryCode
        });

        console.log('✓ Transaction sent for DepegSubFactory');
        console.log('  Waiting for confirmation...\n');

        await provider.waitForDeploy(masterFactory.address, 20);
        console.log('✓ DepegSubFactory code registered!\n');
    } else {
        console.log('⏭️  Skipped DepegSubFactory registration\n');
    }

    // ============================================================
    // STEP 4: REGISTER TRADFI NATCAT FACTORY CODE (Product Type 5)
    // ============================================================

    console.log('Step 4: Registering TradFiNatCatFactory code (product_type=5)...\n');

    const confirm2 = await provider.ui().confirm(
        'Register TradFiNatCatFactory code (product_type=5)?\nCost: ~0.05 TON'
    );

    if (confirm2) {
        await masterFactory.sendSetFactoryCode(provider.sender(), {
            value: toNano('0.05'),
            productType: 5, // PRODUCT_TRADFI_NATCAT
            factoryCode: tradFiNatCatFactoryCode
        });

        console.log('✓ Transaction sent for TradFiNatCatFactory');
        console.log('  Waiting for confirmation...\n');

        await provider.waitForDeploy(masterFactory.address, 20);
        console.log('✓ TradFiNatCatFactory code registered!\n');
    } else {
        console.log('⏭️  Skipped TradFiNatCatFactory registration\n');
    }

    // ============================================================
    // STEP 5: VERIFY REGISTRATION
    // ============================================================

    console.log('Step 5: Verifying registration...\n');

    try {
        const depegFactoryDeployed = await masterFactory.isFactoryDeployed(1);
        console.log(`✓ DEPEG factory code registered: ${depegFactoryDeployed ? 'YES' : 'NO'}`);

        const tradFiFactoryDeployed = await masterFactory.isFactoryDeployed(5);
        console.log(`✓ TRADFI_NATCAT factory code registered: ${tradFiFactoryDeployed ? 'YES' : 'NO'}\n`);

        if (depegFactoryDeployed && tradFiFactoryDeployed) {
            console.log('🎉 ===== FACTORY CODES SUCCESSFULLY REGISTERED =====\n');
            console.log('✅ MasterFactory is now ready to create policies!');
            console.log('✅ When users purchase policies, sub-factories will be deployed automatically\n');
        } else {
            console.log('⚠️  Warning: Some factory codes may not be registered properly');
            console.log('   Please check transaction status on testnet explorer\n');
        }
    } catch (error) {
        console.error('❌ Failed to verify registration');
        console.error(error);
    }

    console.log('\n📋 Next Steps:');
    console.log('1. Test policy creation from the frontend');
    console.log('2. Check testnet explorer for sub-factory deployment');
    console.log('3. Verify NFT minting after policy creation\n');
}
