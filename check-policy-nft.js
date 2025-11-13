// Check if PolicyNFT was minted for the recent policy creation
const { TonClient, Address } = require('@ton/ton');

const MASTER_FACTORY = 'EQDsE9sylBzHemAHY1x6D7UO2wk27mjTgM6v6f4j2T2Z3TzG';
const POLICY_TX_HASH = '1b478a923c005ca1983c3cbd63f3f57e736cd8a49505ac5b831080589b149027';

async function main() {
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    });

    const masterFactoryAddress = Address.parse(MASTER_FACTORY);

    console.log('\n=== Policy NFT Minting Check ===\n');
    console.log(`📋 Policy Creation TX: ${POLICY_TX_HASH}`);
    console.log(`🔗 View: https://testnet.tonscan.org/tx/${POLICY_TX_HASH}\n`);

    try {
        // Get the policy creation transaction
        const transactions = await client.getTransactions(masterFactoryAddress, {
            limit: 50,
        });

        // Find our specific transaction
        let policyTx = null;
        for (const tx of transactions) {
            if (tx.hash().toString('hex') === POLICY_TX_HASH) {
                policyTx = tx;
                break;
            }
        }

        if (!policyTx) {
            console.log('❌ Could not find policy creation transaction');
            console.log('💡 Checking recent transactions instead...\n');

            // Just check the most recent policy creation
            for (const tx of transactions) {
                if (tx.inMessages.size === 0) continue;

                for (const inMsg of tx.inMessages.values()) {
                    if (inMsg.info.type !== 'internal') continue;
                    if (!inMsg.body) continue;

                    const body = inMsg.body.beginParse();
                    if (body.remainingBits < 32) continue;

                    const op = body.loadUint(32);
                    if (op === 0x20) { // create_policy
                        policyTx = tx;
                        console.log('📍 Found most recent create_policy transaction\n');
                        break;
                    }
                }
                if (policyTx) break;
            }
        }

        if (!policyTx) {
            console.log('❌ No policy creation transaction found\n');
            return;
        }

        const txHash = policyTx.hash().toString('hex');
        console.log(`━━━ Transaction Analysis ━━━\n`);
        console.log(`Hash: ${txHash}`);
        console.log(`Time: ${new Date(policyTx.now * 1000).toLocaleString()}\n`);

        // Check outgoing messages from MasterFactory
        console.log(`📤 Outgoing Messages: ${policyTx.outMessages.size}\n`);

        if (policyTx.outMessages.size === 0) {
            console.log('⚠️  No outgoing messages from MasterFactory');
            console.log('💡 This means the transaction was accepted but no downstream actions were triggered\n');
        } else {
            let msgNum = 0;
            for (const outMsg of policyTx.outMessages.values()) {
                msgNum++;
                console.log(`━━━ Message ${msgNum} ━━━`);

                if (outMsg.info.type === 'internal') {
                    const dest = outMsg.info.dest;
                    const value = outMsg.info.value.coins;

                    console.log(`📍 To: ${dest.toString()}`);
                    console.log(`💰 Amount: ${Number(value) / 1e9} TON`);

                    if (outMsg.body) {
                        const body = outMsg.body.beginParse();
                        if (body.remainingBits >= 32) {
                            const op = body.loadUint(32);
                            console.log(`🔧 Operation: 0x${op.toString(16)}`);

                            if (op === 0x30) {
                                console.log(`   → subfactory_create_policy`);
                                console.log(`   ✅ MasterFactory forwarded to SubFactory`);
                            } else if (op === 0x25) {
                                console.log(`   → Minting PolicyNFT`);
                                console.log(`   ✅ NFT minting triggered!`);
                            }
                        }
                    }
                } else if (outMsg.info.type === 'external-out') {
                    console.log(`📢 External Event (log)`);
                }

                console.log('');
            }
        }

        // Check PolicyNFT minter address in contract state
        console.log('━━━ Contract Configuration ━━━\n');

        try {
            const nftMinterResult = await client.runMethod(masterFactoryAddress, 'get_policy_nft_minter');
            const nftMinterSlice = nftMinterResult.stack.readCell().beginParse();
            const nftMinterAddress = nftMinterSlice.loadAddress();

            console.log(`📍 PolicyNFT Minter: ${nftMinterAddress.toString()}`);

            // Check if it's a valid address or null
            if (nftMinterAddress.toString().includes('Ef8')) {
                console.log(`⚠️  PolicyNFT Minter is NULL (not configured)`);
                console.log(`💡 This means NFTs will NOT be minted for policies`);
            } else {
                console.log(`✅ PolicyNFT Minter is configured`);

                // Check if there were any transactions to the NFT minter
                console.log(`\n🔍 Checking NFT Minter activity...\n`);

                const nftMinterTxs = await client.getTransactions(nftMinterAddress, {
                    limit: 10,
                });

                if (nftMinterTxs.length > 0) {
                    console.log(`📊 Recent NFT Minter transactions: ${nftMinterTxs.length}`);

                    for (const tx of nftMinterTxs.slice(0, 3)) {
                        const timestamp = new Date(tx.now * 1000);
                        console.log(`   - ${timestamp.toLocaleString()}`);
                    }
                } else {
                    console.log(`⚠️  No transactions to NFT Minter found`);
                }
            }
        } catch (error) {
            console.log(`⚠️  Could not fetch PolicyNFT minter: ${error.message}`);
            console.log(`💡 PolicyNFT minter may not be configured`);
        }

        // Check if sub-factory was deployed
        console.log(`\n━━━ Sub-Factory Check ━━━\n`);

        try {
            const factoryResult = await client.runMethod(
                masterFactoryAddress,
                'get_product_factory',
                [{ type: 'int', value: BigInt(1) }]
            );

            const factorySlice = factoryResult.stack.readCell().beginParse();
            const factoryAddress = factorySlice.loadAddress();

            console.log(`📍 DepegSubFactory: ${factoryAddress.toString()}`);
            console.log(`✅ Sub-factory is deployed`);

            // Check if sub-factory received messages
            console.log(`\n🔍 Checking SubFactory activity...\n`);

            const subFactoryTxs = await client.getTransactions(factoryAddress, {
                limit: 10,
            });

            if (subFactoryTxs.length > 0) {
                console.log(`📊 Recent SubFactory transactions: ${subFactoryTxs.length}`);

                let policyCreations = 0;
                for (const tx of subFactoryTxs) {
                    if (tx.inMessages.size === 0) continue;

                    for (const inMsg of tx.inMessages.values()) {
                        if (inMsg.info.type !== 'internal') continue;
                        if (!inMsg.body) continue;

                        const body = inMsg.body.beginParse();
                        if (body.remainingBits < 32) continue;

                        const op = body.loadUint(32);
                        if (op === 0x30) { // subfactory_create_policy
                            policyCreations++;
                        }
                    }
                }

                if (policyCreations > 0) {
                    console.log(`✅ SubFactory received ${policyCreations} policy creation request(s)`);
                    console.log(`   ✅ This means the policy routing worked!`);
                } else {
                    console.log(`⚠️  No policy creation messages found in SubFactory`);
                }
            } else {
                console.log(`⚠️  No transactions to SubFactory found`);
            }
        } catch (error) {
            console.log(`⚠️  Could not fetch SubFactory: ${error.message}`);
        }

        console.log('');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

main().catch(console.error);
