import { Address, Cell, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { TonClient } from '@ton/ton';

export async function run(provider: NetworkProvider) {
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    const MASTER_FACTORY = 'EQDsE9sylBzHemAHY1x6D7UO2wk27mjTgM6v6f4j2T2Z3TzG';
    const masterFactoryAddress = Address.parse(MASTER_FACTORY);

    console.log('\n=== Verifying MasterFactory Configuration ===\n');
    console.log(`📍 MasterFactory: ${MASTER_FACTORY}\n`);

    try {
        // Get contract state
        const state = await client.getContractState(masterFactoryAddress);

        if (state.state !== 'active') {
            console.log(`❌ Contract is not active! State: ${state.state}`);
            return;
        }

        console.log('✅ Contract is active\n');

        // Check 1: Get admin address
        console.log('━━━ Admin Verification ━━━\n');

        try {
            const adminResult = await client.runMethod(masterFactoryAddress, 'get_admin');
            const adminSlice = adminResult.stack.readCell().beginParse();
            const adminAddress = adminSlice.loadAddress();

            console.log(`📋 Contract Admin: ${adminAddress.toString()}`);

            // Get sender address
            const sender = provider.sender();
            const senderAddress = sender.address;

            if (senderAddress) {
                console.log(`👤 Your Address:   ${senderAddress.toString()}\n`);

                const isAdmin = adminAddress.equals(senderAddress);
                if (isAdmin) {
                    console.log('✅ You ARE the admin - can register factory codes');
                } else {
                    console.log('❌ You are NOT the admin - cannot register factory codes');
                    console.log('\n⚠️  This is why your transactions failed!');
                    console.log('💡 Solution: Use the admin wallet to send registration transactions');
                }
            }
        } catch (error) {
            console.log(`⚠️  Could not verify admin: ${error}`);
        }

        // Check 2: Verify factory codes registered
        console.log('\n━━━ Factory Code Registration Status ━━━\n');

        const productTypes = [
            { id: 1, name: 'PRODUCT_DEPEG', factory: 'DepegSubFactory' },
            { id: 5, name: 'PRODUCT_TRADFI_NATCAT', factory: 'TradFiNatCatFactory' },
        ];

        let allRegistered = true;

        for (const product of productTypes) {
            try {
                // Call get_factory_code(product_type)
                const stack = beginCell()
                    .storeUint(product.id, 8)
                    .endCell();

                const result = await client.runMethod(
                    masterFactoryAddress,
                    'get_factory_code',
                    [{ type: 'int', value: BigInt(product.id) }]
                );

                const factoryCode = result.stack.readCell();

                if (factoryCode && factoryCode.bits.length > 0) {
                    console.log(`✅ Product Type ${product.id} (${product.name}):`);
                    console.log(`   Factory: ${product.factory}`);
                    console.log(`   Code Hash: ${factoryCode.hash().toString('hex').substring(0, 16)}...`);
                    console.log(`   Code Size: ${factoryCode.bits.length} bits`);
                    console.log(`   Status: REGISTERED ✓\n`);
                } else {
                    console.log(`❌ Product Type ${product.id} (${product.name}):`);
                    console.log(`   Status: NOT REGISTERED\n`);
                    allRegistered = false;
                }
            } catch (error: any) {
                console.log(`❌ Product Type ${product.id} (${product.name}):`);
                console.log(`   Error: ${error.message || error}`);
                console.log(`   Status: NOT REGISTERED\n`);
                allRegistered = false;
            }
        }

        // Summary
        console.log('━━━ Summary ━━━\n');

        if (allRegistered) {
            console.log('🎉 All factory codes are registered!');
            console.log('✅ Policy creation should work on the frontend');
            console.log('\n🧪 Next step: Test policy purchase at https://tonsurance.io');
        } else {
            console.log('⚠️  Some factory codes are missing');
            console.log('❌ Policy creation will fail with exit code 405');
            console.log('\n🔧 Next steps:');
            console.log('   1. Check if registration transactions succeeded (run findRegistrationTxs)');
            console.log('   2. Verify you are the admin');
            console.log('   3. Retry registration with admin wallet');
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        throw error;
    }
}
