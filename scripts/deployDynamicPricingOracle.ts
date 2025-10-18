import { toNano, Address, Dictionary, beginCell } from '@ton/core';
import { DynamicPricingOracle } from '../wrappers/DynamicPricingOracle';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for DynamicPricingOracle
 *
 * Purpose: Deploy the advanced multi-dimensional pricing oracle
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Multi-dimensional product matrix (Coverage Type × Chain × Stablecoin)
 * - Dynamic multiplier adjustments based on market conditions
 * - Multi-sig authorization for critical operations
 * - Circuit breaker protection
 * - Keeper-based price updates
 *
 * Configuration:
 * - Admin address (multi-sig on mainnet)
 * - Authorized keepers (price update services)
 * - Multi-sig signers and threshold
 *
 * Deployment Steps:
 * 1. Compile DynamicPricingOracle.fc
 * 2. Configure admin, keepers, and multi-sig
 * 3. Deploy contract with initial configuration
 * 4. Verify deployment
 * 5. Output contract address for keeper configuration
 */

export async function run(provider: NetworkProvider) {
    console.log('=== DynamicPricingOracle Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    // Step 1: Compile contract
    console.log('Step 1: Compiling DynamicPricingOracle.fc...');
    const oracleCode = await compile('DynamicPricingOracle');
    console.log('✓ Contract compiled successfully\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    // Admin address
    let adminAddressStr: string;
    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT - Multi-sig admin required!');
        adminAddressStr = await provider.ui().input(
            'Enter multi-sig admin address (3-of-5 required):'
        );
    } else {
        adminAddressStr = await provider.ui().input(
            'Enter admin address (your wallet for testnet):'
        );
    }
    const adminAddress = Address.parse(adminAddressStr);
    console.log(`Admin: ${adminAddress.toString()}\n`);

    // Keeper addresses
    const keeperCount = isMainnet ? 3 : 1;
    const keeperAddresses: Address[] = [];

    console.log(`Configuring ${keeperCount} authorized keeper(s):`);
    for (let i = 0; i < keeperCount; i++) {
        const keeperAddr = await provider.ui().input(
            `Enter keeper #${i + 1} address:`
        );
        keeperAddresses.push(Address.parse(keeperAddr));
        console.log(`  Keeper #${i + 1}: ${keeperAddr}`);
    }
    console.log('');

    // Multi-sig configuration (for critical operations)
    let multisigSigners: Address[] = [];
    let multisigThreshold = 0;

    if (isMainnet) {
        console.log('Multi-sig configuration (for circuit breaker, etc.):');
        const signerCount = parseInt(await provider.ui().input('Enter number of signers (3-5):'));
        multisigThreshold = parseInt(await provider.ui().input('Enter threshold (e.g., 3 for 3-of-5):'));

        for (let i = 0; i < signerCount; i++) {
            const signerAddr = await provider.ui().input(`Enter signer #${i + 1} address:`);
            multisigSigners.push(Address.parse(signerAddr));
            console.log(`  Signer #${i + 1}: ${signerAddr}`);
        }
        console.log('');
    }

    // Build authorized keepers dictionary
    const keepersDict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(1));
    for (const keeper of keeperAddresses) {
        const hash = BigInt('0x' + keeper.hash.toString('hex'));
        keepersDict.set(hash, 1);
    }

    // Build multi-sig signers dictionary
    let signersDict = null;
    if (multisigSigners.length > 0) {
        signersDict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(1));
        for (const signer of multisigSigners) {
            const hash = BigInt('0x' + signer.hash.toString('hex'));
            signersDict.set(hash, 1);
        }
    }

    // Step 3: Deploy contract
    console.log('Step 3: Deploying DynamicPricingOracle...');

    const oracle = provider.open(
        DynamicPricingOracle.createFromConfig(
            {
                adminAddress,
                authorizedKeepers: beginCell().storeDictDirect(keepersDict).endCell(),
                multisigSigners: signersDict ? beginCell().storeDictDirect(signersDict).endCell() : null,
                multisigThreshold: multisigThreshold,
                productMultipliers: null, // Empty initially
                globalCircuitBreaker: false,
                lastUpdateTime: Math.floor(Date.now() / 1000),
                totalUpdates: 0,
            },
            oracleCode
        )
    );

    const deploymentCost = toNano('0.5');
    console.log(`Deployment cost: ${deploymentCost} TON`);

    await oracle.sendDeploy(provider.sender(), deploymentCost);
    await provider.waitForDeploy(oracle.address, 100);
    console.log(`✓ DynamicPricingOracle deployed: ${oracle.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');
    try {
        const state = await provider.api().getContractState(oracle.address);
        if (state.state === 'active') {
            console.log('✓ Contract is active');
        } else {
            console.warn(`⚠️  Contract state: ${state.state}`);
        }
    } catch (error) {
        console.error('❌ Verification failed:', error);
    }
    console.log('');

    // Step 5: Output configuration
    console.log('=== Deployment Complete ===\n');
    console.log('Contract Address:', oracle.address.toString());
    console.log('\nAdd to frontend/.env:');
    console.log(`VITE_DYNAMIC_PRICING_ORACLE_ADDRESS=${oracle.address.toString()}`);
    console.log('\nAdd to services/.env:');
    console.log(`DYNAMIC_PRICING_ORACLE_ADDRESS=${oracle.address.toString()}`);

    if (keeperAddresses.length > 0) {
        console.log('\nKeeper Addresses:');
        keeperAddresses.forEach((addr, i) => {
            console.log(`KEEPER_${i + 1}_ADDRESS=${addr.toString()}`);
        });
    }

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Update keeper services with contract address');
        console.log('2. Deploy keeper infrastructure');
        console.log('3. Verify first price update within 5 minutes');
        console.log('4. Monitor oracle health dashboard');
        console.log('5. Test circuit breaker with multi-sig');
    } else {
        console.log('1. Initialize test multipliers for common products');
        console.log('2. Test price update flow with keeper');
        console.log('3. Verify pricing on frontend');
        console.log('4. Test circuit breaker functionality');
    }

    console.log('\n✅ Deployment successful!');
}
