import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    const MASTER_FACTORY = 'EQACcoHQ5QrxfP8uvOyVdQ3OV54GSC63UWDRpBCRBBwGli6H';
    const masterFactoryAddress = Address.parse(MASTER_FACTORY);

    console.log('\n=== Finding Factory Registration Transactions ===\n');

    // Get user's wallet address
    const sender = provider.sender();
    const senderAddress = sender.address;

    if (!senderAddress) {
        console.log('❌ No wallet address found. Please connect your wallet.');
        return;
    }

    console.log(`📍 Your wallet: ${senderAddress.toString()}`);
    console.log(`🎯 MasterFactory: ${MASTER_FACTORY}\n`);

    try {
        // Get recent transactions from the wallet
        console.log('🔍 Fetching recent transactions...\n');

        const transactions = await client.getTransactions(senderAddress, {
            limit: 50,
        });

        console.log(`Found ${transactions.length} total transactions\n`);

        // Filter for transactions to MasterFactory with 0.05 TON
        const TARGET_AMOUNT = 50000000n; // 0.05 TON in nanotons

        const registrationTxs = transactions.filter(tx => {
            // Check outgoing messages
            if (tx.outMessages.size === 0) return false;

            for (const msg of tx.outMessages.values()) {
                const msgAddress = msg.info.type === 'internal' ? msg.info.dest : null;
                const msgValue = msg.info.type === 'internal' ? msg.info.value.coins : 0n;

                if (
                    msgAddress &&
                    msgAddress.equals(masterFactoryAddress) &&
                    msgValue === TARGET_AMOUNT
                ) {
                    return true;
                }
            }
            return false;
        });

        console.log(`\n✨ Found ${registrationTxs.length} registration transaction(s) to MasterFactory\n`);

        if (registrationTxs.length === 0) {
            console.log('❌ No transactions found with:');
            console.log('   - Destination: MasterFactory');
            console.log('   - Amount: 0.05 TON');
            console.log('\n💡 Possible reasons:');
            console.log('   1. Transactions are still pending (wait 1-2 minutes)');
            console.log('   2. Transactions failed to send from browser');
            console.log('   3. Different wallet was used in browser');
            console.log('\n🔧 Next steps:');
            console.log('   - Check Tonkeeper wallet transaction history');
            console.log('   - Verify you approved the transactions');
            console.log('   - Check browser console for transaction hashes');
            return;
        }

        // Analyze each transaction
        for (let i = 0; i < registrationTxs.length; i++) {
            const tx = registrationTxs[i];
            const txHash = tx.hash().toString('base64');
            const timestamp = new Date(tx.now * 1000);

            console.log(`\n━━━ Transaction ${i + 1} ━━━`);
            console.log(`📋 Hash: ${txHash}`);
            console.log(`⏰ Time: ${timestamp.toLocaleString()}`);
            console.log(`🔗 Link: https://testnet.tonscan.org/tx/${tx.hash().toString('hex')}`);

            // Check transaction result
            const description = tx.description;
            if (description.type === 'generic') {
                const computePhase = description.computePhase;
                const actionPhase = description.actionPhase;

                if (computePhase.type === 'vm') {
                    const exitCode = computePhase.exitCode;
                    const success = computePhase.success;

                    console.log(`\n📊 Compute Phase:`);
                    console.log(`   Success: ${success ? '✅ YES' : '❌ NO'}`);
                    console.log(`   Exit Code: ${exitCode}${exitCode === 0 ? ' ✅' : ' ❌'}`);
                    console.log(`   Gas Used: ${computePhase.gasUsed}`);

                    if (exitCode !== 0) {
                        console.log(`\n⚠️  Transaction FAILED with exit code ${exitCode}`);
                        console.log(getExitCodeExplanation(exitCode));
                    }
                }

                if (actionPhase) {
                    console.log(`\n📤 Action Phase:`);
                    console.log(`   Success: ${actionPhase.success ? '✅ YES' : '❌ NO'}`);
                    console.log(`   Result Code: ${actionPhase.resultCode}`);
                }
            }

            // Check outgoing messages
            for (const msg of tx.outMessages.values()) {
                if (msg.info.type === 'internal') {
                    console.log(`\n💌 Message to MasterFactory:`);
                    console.log(`   Amount: ${Number(msg.info.value.coins) / 1e9} TON`);

                    if (msg.body) {
                        const body = msg.body.beginParse();
                        if (body.remainingBits >= 32) {
                            const op = body.loadUint(32);
                            console.log(`   Operation: 0x${op.toString(16)}${op === 0x22 ? ' ✅ (set_factory_code)' : ''}`);

                            if (op === 0x22 && body.remainingBits >= 8) {
                                const productType = body.loadUint(8);
                                console.log(`   Product Type: ${productType} (${getProductTypeName(productType)})`);
                            }
                        }
                    }
                }
            }
        }

        console.log('\n\n=== Summary ===');
        const successCount = registrationTxs.filter(tx => {
            const description = tx.description;
            if (description.type === 'generic' && description.computePhase.type === 'vm') {
                return description.computePhase.exitCode === 0;
            }
            return false;
        }).length;

        console.log(`✅ Successful: ${successCount}/${registrationTxs.length}`);
        console.log(`❌ Failed: ${registrationTxs.length - successCount}/${registrationTxs.length}`);

        if (successCount === 2) {
            console.log('\n🎉 Both factory codes registered successfully!');
            console.log('✅ You can now create policies on the frontend');
        } else if (successCount > 0) {
            console.log('\n⚠️  Only some transactions succeeded. You may need to retry failed ones.');
        } else {
            console.log('\n❌ All transactions failed. Check exit codes above for details.');
        }

    } catch (error) {
        console.error('\n❌ Error fetching transactions:', error);
        throw error;
    }
}

function getExitCodeExplanation(exitCode: number): string {
    const explanations: { [key: number]: string } = {
        100: '   → Unauthorized: Not the admin of the contract',
        101: '   → Invalid factory code provided',
        102: '   → Factory code already registered',
        130: '   → Invalid incoming message format',
        405: '   → Factory code not found (missing in dictionary)',
        65535: '   → Unrecognized operation code',
    };

    return explanations[exitCode] || `   → Unknown error code ${exitCode}`;
}

function getProductTypeName(productType: number): string {
    const types: { [key: number]: string } = {
        1: 'PRODUCT_DEPEG',
        2: 'PRODUCT_HACK',
        3: 'PRODUCT_SLASHING',
        4: 'PRODUCT_BRIDGE',
        5: 'PRODUCT_TRADFI_NATCAT',
    };

    return types[productType] || 'UNKNOWN';
}
