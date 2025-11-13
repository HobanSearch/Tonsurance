// Check recent policy creation transactions
const { TonClient, Address } = require('@ton/ton');

const MASTER_FACTORY = 'EQDsE9sylBzHemAHY1x6D7UO2wk27mjTgM6v6f4j2T2Z3TzG';
const YOUR_WALLET = '0:6483a2466779bf242c89cb40c129c47c03f7e8f307a5f8da962a520183aca2ec';

async function main() {
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    const masterFactoryAddress = Address.parse(MASTER_FACTORY);
    const yourWalletAddress = Address.parse(YOUR_WALLET);

    console.log('\n=== Recent Policy Creation Attempts ===\n');
    console.log(`📍 MasterFactory: ${MASTER_FACTORY}`);
    console.log(`👤 Your Wallet:   ${YOUR_WALLET}\n`);

    try {
        // Get recent transactions from your wallet
        const transactions = await client.getTransactions(yourWalletAddress, {
            limit: 20,
        });

        console.log(`Checking last ${transactions.length} transactions...\n`);

        let policyTxCount = 0;

        for (const tx of transactions) {
            if (tx.outMessages.size === 0) continue;

            for (const msg of tx.outMessages.values()) {
                if (msg.info.type !== 'internal') continue;

                const msgDest = msg.info.dest;
                const msgValue = msg.info.value.coins;

                // Check if this is a transaction to MasterFactory
                if (msgDest.equals(masterFactoryAddress)) {
                    policyTxCount++;
                    const txHash = tx.hash().toString('hex');
                    const timestamp = new Date(tx.now * 1000);

                    console.log(`━━━ Transaction ${policyTxCount} to MasterFactory ━━━`);
                    console.log(`⏰ Time: ${timestamp.toLocaleString()}`);
                    console.log(`💰 Amount: ${Number(msgValue) / 1e9} TON`);
                    console.log(`📋 Hash: ${txHash}`);
                    console.log(`🔗 Link: https://testnet.tonscan.org/tx/${txHash}`);

                    // Check exit code
                    const description = tx.description;
                    if (description.type === 'generic' && description.computePhase.type === 'vm') {
                        const exitCode = description.computePhase.exitCode;
                        const success = exitCode === 0;

                        console.log(`📊 Exit Code: ${exitCode}${success ? ' ✅ SUCCESS' : ' ❌ FAILED'}`);

                        if (!success) {
                            console.log(`⚠️  Error: ${getExitCodeMeaning(exitCode)}`);
                        }
                    }

                    // Check operation code
                    if (msg.body) {
                        const body = msg.body.beginParse();
                        if (body.remainingBits >= 32) {
                            const op = body.loadUint(32);
                            console.log(`🔧 Operation: 0x${op.toString(16)}`);

                            if (op === 0x20) {
                                console.log(`   → create_policy (direct policy creation)`);

                                if (body.remainingBits >= 24) {
                                    const productType = body.loadUint(8);
                                    const assetId = body.loadUint(16);
                                    console.log(`   → Product Type: ${productType} (${getProductName(productType)})`);
                                    console.log(`   → Asset ID: ${assetId}`);
                                }
                            } else if (op === 0x22) {
                                console.log(`   → set_factory_code (factory registration)`);
                            } else if (op === 0x01) {
                                console.log(`   → forward_from_wallet (via GasWallet)`);
                            }
                        }
                    }

                    console.log('');
                }
            }
        }

        if (policyTxCount === 0) {
            console.log('❌ No transactions to MasterFactory found in recent history\n');
        } else {
            console.log(`\n✅ Found ${policyTxCount} transaction(s) to MasterFactory\n`);
        }

        // Check MasterFactory stats
        console.log('━━━ MasterFactory Statistics ━━━\n');

        try {
            const totalPolicies = await client.runMethod(masterFactoryAddress, 'get_total_policies_created');
            const policiesCount = totalPolicies.stack.readNumber();
            console.log(`📊 Total Policies Created: ${policiesCount}`);
        } catch (error) {
            console.log(`⚠️  Could not fetch total policies: ${error.message}`);
        }

        try {
            const pausedResult = await client.runMethod(masterFactoryAddress, 'get_paused');
            const paused = pausedResult.stack.readNumber();
            console.log(`⏸️  Contract Paused: ${paused === 1 ? 'YES ⚠️' : 'NO ✅'}`);
        } catch (error) {
            console.log(`⚠️  Could not fetch paused status: ${error.message}`);
        }

        console.log('');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

function getExitCodeMeaning(exitCode) {
    const meanings = {
        100: 'Unauthorized (not admin)',
        401: 'Unauthorized',
        402: 'Contract is paused',
        403: 'Invalid product type',
        404: 'KYC verification failed',
        405: 'Factory deployment failed (factory code not registered)',
        406: 'SBT verifier not set',
        407: 'Policy not found',
        408: 'Policy already claimed',
        409: 'Vault not set',
        65535: 'Unrecognized operation code',
    };

    return meanings[exitCode] || `Unknown error code ${exitCode}`;
}

function getProductName(productType) {
    const names = {
        1: 'PRODUCT_DEPEG (Stablecoin Depeg)',
        2: 'PRODUCT_BRIDGE (Bridge Failure)',
        3: 'PRODUCT_ORACLE (Oracle Failure)',
        4: 'PRODUCT_CONTRACT (Smart Contract Exploit)',
        5: 'PRODUCT_TRADFI_NATCAT (Natural Catastrophe)',
    };

    return names[productType] || `Unknown product ${productType}`;
}

main().catch(console.error);
