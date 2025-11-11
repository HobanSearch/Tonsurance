import { toNano, Address, Dictionary } from '@ton/core';
import { SBTVerifier, KYC_TIER_BASIC, KYC_TIER_STANDARD, KYC_TIER_ENHANCED } from '../../wrappers/v3/SBTVerifier';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for SBTVerifier V3
 *
 * Purpose: Deploy KYC verification contract with zero-knowledge proofs
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Privacy-preserving KYC via ZK proofs
 * - Soulbound tokens (SBTs) - non-transferable NFTs
 * - Tiered access control (Basic, Standard, Enhanced)
 * - Whitelist/blacklist management
 * - Guardian service integration
 *
 * Requirements:
 * - Admin wallet (for management)
 * - Guardian service public key (for ZK proof validation)
 * - MasterFactory address (for integration)
 *
 * Post-Deployment:
 * 1. Configure guardian service endpoint
 * 2. Test ZK proof generation and validation
 * 3. Set up tier limits in frontend
 * 4. Monitor SBT minting
 */

export async function run(provider: NetworkProvider) {
    console.log('=== SBTVerifier V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the SBTVerifier contract');
        console.warn('⚠️  Estimated cost: ~1 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling SBTVerifier...');
    const code = await compile('SBTVerifier');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const guardianPubkeyStr = await provider.ui().input('Enter guardian public key (256-bit hex) or press Enter for 0:');
    const guardianPubkey = guardianPubkeyStr ? BigInt('0x' + guardianPubkeyStr) : 0n;

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address (or press Enter for placeholder):');
    const masterFactoryAddress = masterFactoryStr
        ? Address.parse(masterFactoryStr)
        : Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    console.log('\nConfiguration:');
    console.log(`  Admin: ${adminAddress.toString()}`);
    console.log(`  Guardian Pubkey: ${guardianPubkey.toString()}`);
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);

    if (isMainnet && guardianPubkey === 0n) {
        console.warn('\n⚠️  WARNING: Guardian public key is 0 (placeholder)');
        console.warn('⚠️  ZK proof validation will fail!');
        console.warn('⚠️  Set valid public key immediately after deployment.\n');

        const confirm = await provider.ui().input('Continue anyway? (yes/no):');
        if (confirm.toLowerCase() !== 'yes') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 3: Deploy SBTVerifier
    console.log('\nStep 3: Deploying SBTVerifier...');

    const sbtVerifier = provider.open(
        SBTVerifier.createFromConfig(
            {
                adminAddress: adminAddress,
                guardianPubkey: guardianPubkey,
                sbtRegistry: Dictionary.empty(),
                whitelist: Dictionary.empty(),
                blacklist: Dictionary.empty(),
                masterFactoryAddress: masterFactoryAddress,
                totalSBTsMinted: 0n,
                paused: false,
            },
            code
        )
    );

    await sbtVerifier.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(sbtVerifier.address);
    console.log(`✓ SBTVerifier deployed: ${sbtVerifier.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await sbtVerifier.getAdmin();
    const deployedPubkey = await sbtVerifier.getGuardianPubkey();
    const deployedFactory = await sbtVerifier.getMasterFactory();
    const totalSBTs = await sbtVerifier.getTotalSBTsMinted();
    const paused = await sbtVerifier.getPaused();
    const version = await sbtVerifier.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    Guardian Pubkey: ${deployedPubkey.toString()}`);
    console.log(`    MasterFactory: ${deployedFactory.toString()}`);
    console.log(`    Total SBTs Minted: ${totalSBTs}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(adminAddress)) throw new Error('Admin address mismatch!');
    if (deployedPubkey !== guardianPubkey) throw new Error('Guardian pubkey mismatch!');
    if (!deployedFactory.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (totalSBTs !== 0n) throw new Error('Total SBTs should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Verify tier limits
    console.log('Step 5: Verifying KYC tier limits...');

    const basicLimits = await sbtVerifier.getTierLimits(KYC_TIER_BASIC);
    const standardLimits = await sbtVerifier.getTierLimits(KYC_TIER_STANDARD);
    const enhancedLimits = await sbtVerifier.getTierLimits(KYC_TIER_ENHANCED);

    console.log('  Tier Limits:');
    console.log(`    BASIC (1): $${basicLimits.maxCoverageUSD} max, ${basicLimits.maxDurationDays} days`);
    console.log(`    STANDARD (2): $${standardLimits.maxCoverageUSD} max, ${standardLimits.maxDurationDays} days`);
    console.log(`    ENHANCED (3): $${enhancedLimits.maxCoverageUSD} max, ${enhancedLimits.maxDurationDays} days`);

    // Verify limits
    if (basicLimits.maxCoverageUSD !== 5000 || basicLimits.maxDurationDays !== 30) {
        throw new Error('BASIC tier limits incorrect!');
    }
    if (standardLimits.maxCoverageUSD !== 50000 || standardLimits.maxDurationDays !== 90) {
        throw new Error('STANDARD tier limits incorrect!');
    }
    if (enhancedLimits.maxCoverageUSD !== 500000 || enhancedLimits.maxDurationDays !== 365) {
        throw new Error('ENHANCED tier limits incorrect!');
    }

    console.log('\n✓ Tier limits verified\n');

    // Step 6: Save deployment manifest
    console.log('Step 6: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        sbtVerifier: {
            address: sbtVerifier.address.toString(),
            admin: adminAddress.toString(),
            guardianPubkey: guardianPubkey.toString(),
            masterFactory: masterFactoryAddress.toString(),
            version: 3,
        },
        tiers: {
            basic: { id: 1, maxCoverage: 5000, maxDuration: 30, requirements: ['email', 'phone'] },
            standard: { id: 2, maxCoverage: 50000, maxDuration: 90, requirements: ['governmentId'] },
            enhanced: { id: 3, maxCoverage: 500000, maxDuration: 365, requirements: ['proofOfAddress'] },
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/sbt-verifier-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 7: Output
    console.log('=== Deployment Complete ===\n');
    console.log('SBTVerifier V3:', sbtVerifier.address.toString());

    console.log('\nAdd to .env:');
    console.log(`SBT_VERIFIER_V3_ADDRESS=${sbtVerifier.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "core": {`);
    console.log(`    "sbtVerifier": {`);
    console.log(`      "address": "${sbtVerifier.address.toString()}",`);
    console.log(`      "description": "KYC verification via zero-knowledge proofs"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Set valid guardian public key:');
        console.log(`   sbtVerifier.sendSetGuardianPubkey(admin, { value: toNano('0.05'), guardianPubkey: validKey })`);
        console.log('2. Deploy guardian service (ZK proof generation)');
        console.log('3. Configure guardian endpoint in frontend');
        console.log('4. Test full KYC flow:');
        console.log('   a. User submits KYC data to guardian');
        console.log('   b. Guardian generates ZK proof');
        console.log('   c. Frontend submits proof to SBTVerifier');
        console.log('   d. SBT minted on successful verification');
        console.log('5. Monitor SBT minting events');
        console.log('6. Set up emergency procedures:');
        console.log('   - Revoke compromised SBTs');
        console.log('   - Blacklist suspicious addresses');
        console.log('   - Update guardian key rotation');
    } else {
        console.log('1. Run tests: npx jest tests/v3/SBTVerifier.spec.ts');
        console.log('2. Test whitelist/blacklist management');
        console.log('3. Test tier limits enforcement');
        console.log('4. Test KYC check integration with MasterFactory');
        console.log('5. Test ZK proof validation (requires guardian service)');
        console.log('6. Verify gas costs (<0.01 TON per verification)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nKYC Tiers:');
    console.log('  BASIC (1):');
    console.log('    Requirements: Email verification + Phone number');
    console.log('    Max Coverage: $5,000');
    console.log('    Max Duration: 30 days');
    console.log('    Use Case: Small policies, testing');
    console.log('\n  STANDARD (2):');
    console.log('    Requirements: Government ID (passport, driver\'s license)');
    console.log('    Max Coverage: $50,000');
    console.log('    Max Duration: 90 days');
    console.log('    Use Case: Medium policies, most users');
    console.log('\n  ENHANCED (3):');
    console.log('    Requirements: Proof of address + Enhanced due diligence');
    console.log('    Max Coverage: $500,000+');
    console.log('    Max Duration: 365 days');
    console.log('    Use Case: Large policies, institutional');

    console.log('\nWhitelist/Blacklist Management:');
    console.log('// Add to whitelist (bypass KYC)');
    console.log('await sbtVerifier.sendAddToWhitelist(admin, { value: toNano(\'0.05\'), userAddress })');
    console.log('\n// Add to blacklist (block completely)');
    console.log('await sbtVerifier.sendAddToBlacklist(admin, { value: toNano(\'0.05\'), userAddress })');
    console.log('\n// Revoke KYC');
    console.log('await sbtVerifier.sendRevokeKYC(admin, { value: toNano(\'0.05\'), userAddress })');

    console.log('\nZero-Knowledge Proof Flow:');
    console.log('1. User submits KYC documents to guardian service (off-chain)');
    console.log('2. Guardian validates documents and generates ZK proof');
    console.log('3. Proof contains: user_addr, proof_commitment (hash), tier, timestamp, signature');
    console.log('4. Frontend submits proof to SBTVerifier contract');
    console.log('5. Contract validates:');
    console.log('   - Guardian signature is valid');
    console.log('   - Proof is fresh (<24 hours)');
    console.log('   - Tier is valid (1-3)');
    console.log('6. SBT minted and stored in sbt_registry');
    console.log('7. User can now create policies up to tier limits');

    console.log('\nPrivacy Benefits:');
    console.log('✓ KYC data never stored on-chain');
    console.log('✓ Only hash commitment is public');
    console.log('✓ Guardian cannot access user funds');
    console.log('✓ Soulbound tokens (non-transferable)');
    console.log('✓ Tier upgrades allowed');
}
