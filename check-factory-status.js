// Standalone script to check factory registration status
// Run with: node check-factory-status.js

const { TonClient, Address } = require('@ton/ton');

const MASTER_FACTORY = 'EQDsE9sylBzHemAHY1x6D7UO2wk27mjTgM6v6f4j2T2Z3TzG';
// Your wallet address from Tonkeeper (the one shown in the HTML page console)
const YOUR_WALLET = '0:6483a2466779bf242c89cb40c129c47c03f7e8f307a5f8da962a520183aca2ec';

async function main() {
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    const masterFactoryAddress = Address.parse(MASTER_FACTORY);
    const yourWalletAddress = Address.parse(YOUR_WALLET);

    console.log('\n=== MasterFactory Status Check ===\n');
    console.log(`📍 MasterFactory: ${MASTER_FACTORY}`);
    console.log(`👤 Your Wallet:   ${YOUR_WALLET}\n`);

    try {
        // Check 1: Get admin
        console.log('━━━ Admin Check ━━━\n');

        try {
            const adminResult = await client.runMethod(masterFactoryAddress, 'get_admin');
            const adminSlice = adminResult.stack.readCell().beginParse();
            const adminAddress = adminSlice.loadAddress();

            console.log(`📋 Contract Admin: ${adminAddress.toString()}`);
            console.log(`👤 Your Address:   ${yourWalletAddress.toString()}\n`);

            const isAdmin = adminAddress.equals(yourWalletAddress);
            if (isAdmin) {
                console.log('✅ You ARE the admin\n');
            } else {
                console.log('❌ You are NOT the admin');
                console.log('⚠️  This explains why registration failed!\n');
            }
        } catch (error) {
            console.log(`⚠️  Could not get admin: ${error.message}\n`);
        }

        // Check 2: Get factory codes
        console.log('━━━ Factory Code Status ━━━\n');

        const productTypes = [
            { id: 1, name: 'PRODUCT_DEPEG (DepegSubFactory)' },
            { id: 5, name: 'PRODUCT_TRADFI_NATCAT (TradFiNatCatFactory)' },
        ];

        let registeredCount = 0;

        for (const product of productTypes) {
            try {
                const result = await client.runMethod(
                    masterFactoryAddress,
                    'get_factory_code',
                    [{ type: 'int', value: BigInt(product.id) }]
                );

                const factoryCode = result.stack.readCell();

                if (factoryCode && factoryCode.bits.length > 0) {
                    console.log(`✅ Product Type ${product.id} - ${product.name}`);
                    console.log(`   Code Size: ${factoryCode.bits.length} bits`);
                    console.log(`   Hash: ${factoryCode.hash().toString('hex').substring(0, 20)}...`);
                    console.log(`   Status: REGISTERED ✓\n`);
                    registeredCount++;
                } else {
                    console.log(`❌ Product Type ${product.id} - ${product.name}`);
                    console.log(`   Status: NOT REGISTERED\n`);
                }
            } catch (error) {
                console.log(`❌ Product Type ${product.id} - ${product.name}`);
                console.log(`   Error: ${error.message}`);
                console.log(`   Status: NOT REGISTERED\n`);
            }
        }

        // Check 3: Get recent transactions to MasterFactory
        console.log('━━━ Recent Transactions ━━━\n');

        try {
            const transactions = await client.getTransactions(yourWalletAddress, {
                limit: 50,
            });

            console.log(`Checking last ${transactions.length} transactions from your wallet...\n`);

            const TARGET_AMOUNT = 50000000n; // 0.05 TON
            let foundCount = 0;

            for (const tx of transactions) {
                if (tx.outMessages.size === 0) continue;

                for (const msg of tx.outMessages.values()) {
                    if (msg.info.type !== 'internal') continue;

                    const msgDest = msg.info.dest;
                    const msgValue = msg.info.value.coins;

                    if (msgDest.equals(masterFactoryAddress) && msgValue === TARGET_AMOUNT) {
                        foundCount++;
                        const txHash = tx.hash().toString('hex');
                        const timestamp = new Date(tx.now * 1000);

                        console.log(`📋 Transaction ${foundCount}:`);
                        console.log(`   Hash: ${txHash}`);
                        console.log(`   Time: ${timestamp.toLocaleString()}`);
                        console.log(`   Link: https://testnet.tonscan.org/tx/${txHash}`);

                        // Check exit code
                        const description = tx.description;
                        if (description.type === 'generic' && description.computePhase.type === 'vm') {
                            const exitCode = description.computePhase.exitCode;
                            const success = exitCode === 0;

                            console.log(`   Exit Code: ${exitCode}${success ? ' ✅' : ' ❌'}`);

                            if (!success) {
                                console.log(`   Reason: ${getExitCodeReason(exitCode)}`);
                            }
                        }

                        // Check operation code
                        if (msg.body) {
                            const body = msg.body.beginParse();
                            if (body.remainingBits >= 32) {
                                const op = body.loadUint(32);
                                console.log(`   Operation: 0x${op.toString(16)}${op === 0x22 ? ' (set_factory_code)' : ''}`);

                                if (op === 0x22 && body.remainingBits >= 8) {
                                    const productType = body.loadUint(8);
                                    console.log(`   Product: ${productType}`);
                                }
                            }
                        }

                        console.log('');
                    }
                }
            }

            if (foundCount === 0) {
                console.log('❌ No 0.05 TON transactions found to MasterFactory');
                console.log('\n💡 Possible reasons:');
                console.log('   - Transactions still pending (wait a few minutes)');
                console.log('   - Transactions failed to send from browser');
                console.log('   - Different wallet used in browser');
            } else {
                console.log(`Found ${foundCount} registration transaction(s)`);
            }
        } catch (error) {
            console.log(`⚠️  Could not fetch transactions: ${error.message}`);
        }

        // Summary
        console.log('\n━━━ Summary ━━━\n');

        if (registeredCount === 2) {
            console.log('🎉 Both factory codes are registered!');
            console.log('✅ Policy creation should work');
            console.log('\n🧪 Test it at: https://tonsurance.io\n');
        } else if (registeredCount === 1) {
            console.log('⚠️  Only 1 of 2 factory codes registered');
            console.log('❌ Need to register the missing one\n');
        } else {
            console.log('❌ No factory codes registered yet');
            console.log('🔧 Registration transactions must be sent by the admin wallet\n');
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

function getExitCodeReason(exitCode) {
    const reasons = {
        100: 'Unauthorized (not admin)',
        101: 'Invalid factory code',
        102: 'Already registered',
        130: 'Invalid message format',
        405: 'Factory code not found',
        65535: 'Unrecognized operation',
    };

    return reasons[exitCode] || `Unknown error (${exitCode})`;
}

main().catch(console.error);
