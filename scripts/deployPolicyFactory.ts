import { toNano, Address } from '@ton/core';
import { PolicyFactory } from '../wrappers/PolicyFactory';
import { ClaimsProcessor } from '../wrappers/ClaimsProcessor';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for PolicyFactory and ClaimsProcessor
 *
 * Purpose: Deploy core insurance contracts
 * Network: Testnet/Mainnet
 *
 * Deployment Order:
 * 1. PolicyFactory (creates and manages policies)
 * 2. ClaimsProcessor (processes and pays claims)
 *
 * Configuration Requirements:
 * - Admin address
 * - Treasury address
 * - Vault addresses (Primary, Secondary, TradFi Buffer)
 * - PriceOracle address
 *
 * Gas Costs (estimated):
 * - PolicyFactory: 0.5 TON
 * - ClaimsProcessor: 0.5 TON
 * - Total: ~1 TON + reserves
 */

export async function run(provider: NetworkProvider) {
    console.log('=== PolicyFactory & ClaimsProcessor Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    // Confirmation for mainnet
    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT DETECTED');
        console.warn('⚠️  This will deploy core insurance contracts');
        console.warn('⚠️  Estimated cost: ~1 TON\n');
    }

    // Step 1: Compile contracts
    console.log('Step 1: Compiling contracts...');
    const policyFactoryCode = await compile('PolicyFactory');
    const claimsProcessorCode = await compile('ClaimsProcessor');
    console.log('✓ Contracts compiled successfully\n');

    // Step 2: Get configuration
    console.log('Step 2: Configuration');

    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const treasuryAddressStr = await provider.ui().input('Enter Treasury address:');
    const treasuryAddress = Address.parse(treasuryAddressStr);

    console.log(`Admin: ${adminAddress.toString()}`);
    console.log(`Treasury: ${treasuryAddress.toString()}\n`);

    // Step 3: Deploy PolicyFactory
    console.log('Step 3: Deploying PolicyFactory...');

    const policyFactory = provider.open(
        PolicyFactory.createFromConfig(
            {
                ownerAddress: adminAddress,
                nextPolicyId: 1n,
                totalPoliciesCreated: 0n,
                activePoliciesCount: 0n,
                treasuryAddress: treasuryAddress,
                paused: 0,
            },
            policyFactoryCode
        )
    );

    await policyFactory.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(policyFactory.address, 100);
    console.log(`✓ PolicyFactory deployed: ${policyFactory.address.toString()}\n`);

    // Step 4: Get vault addresses for ClaimsProcessor
    console.log('Step 4: Vault Configuration for ClaimsProcessor');

    const multiTrancheVaultStr = await provider.ui().input('Enter MultiTrancheVault address:');
    const multiTrancheVaultAddress = Address.parse(multiTrancheVaultStr);

    const priceOracleStr = await provider.ui().input('Enter PriceOracle address:');
    const priceOracleAddress = Address.parse(priceOracleStr);

    console.log(`MultiTrancheVault: ${multiTrancheVaultAddress.toString()}`);
    console.log(`PriceOracle: ${priceOracleAddress.toString()}\n`);

    // Step 5: Deploy ClaimsProcessor
    console.log('Step 5: Deploying ClaimsProcessor...');

    const claimsProcessor = provider.open(
        ClaimsProcessor.createFromConfig(
            {
                ownerAddress: adminAddress,
                nextClaimId: 1n,
                treasuryAddress: treasuryAddress,
                multiTrancheVaultAddress: multiTrancheVaultAddress,
                priceOracleAddress: priceOracleAddress,
                autoApprovalThreshold: 10000, // $10,000 auto-approval threshold
            },
            claimsProcessorCode
        )
    );

    await claimsProcessor.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(claimsProcessor.address, 100);
    console.log(`✓ ClaimsProcessor deployed: ${claimsProcessor.address.toString()}\n`);

    // Step 6: Summary
    console.log('=== Deployment Summary ===');
    console.log(`PolicyFactory: ${policyFactory.address.toString()}`);
    console.log(`ClaimsProcessor: ${claimsProcessor.address.toString()}\n`);

    console.log('Next steps:');
    console.log('1. Configure PolicyFactory permissions');
    console.log('2. Link ClaimsProcessor to PolicyFactory');
    console.log('3. Deploy PolicyRouter + Shards');
    console.log('4. Update frontend .env with addresses\n');

    console.log('✅ Deployment complete!');
}
