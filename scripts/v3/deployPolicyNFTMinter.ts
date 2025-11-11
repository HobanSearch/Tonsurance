import { toNano, Address, Dictionary } from '@ton/core';
import { PolicyNFTMinter } from '../../wrappers/v3/PolicyNFTMinter';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for PolicyNFTMinter V3
 *
 * Purpose: Deploy TEP-62/74 compliant NFT minter for policy certificates
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Mints NFTs representing insurance policies
 * - Stores policy metadata (coverage, expiry, product info)
 * - Supports transfers (policy trading)
 * - Admin burn for expired/claimed policies
 * - User NFT portfolio tracking
 *
 * Requirements:
 * - Admin wallet (for management)
 * - MasterFactory address (for integration)
 *
 * Post-Deployment:
 * 1. Register minter address with MasterFactory
 * 2. Test NFT minting flow
 * 3. Configure frontend NFT display
 * 4. Set up metadata indexer
 */

export async function run(provider: NetworkProvider) {
    console.log('=== PolicyNFTMinter V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the PolicyNFTMinter contract');
        console.warn('⚠️  Estimated cost: ~1 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling PolicyNFTMinter...');
    const code = await compile('PolicyNFTMinter');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address (or press Enter for placeholder):');
    const masterFactoryAddress = masterFactoryStr
        ? Address.parse(masterFactoryStr)
        : Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const startingNFTIdStr = await provider.ui().input('Starting NFT ID [default: 1]:');
    const startingNFTId = startingNFTIdStr ? BigInt(startingNFTIdStr) : 1n;

    console.log('\nConfiguration:');
    console.log(`  Admin: ${adminAddress.toString()}`);
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  Starting NFT ID: ${startingNFTId}`);

    // Step 3: Deploy PolicyNFTMinter
    console.log('\nStep 3: Deploying PolicyNFTMinter...');

    const minter = provider.open(
        PolicyNFTMinter.createFromConfig(
            {
                adminAddress: adminAddress,
                masterFactoryAddress: masterFactoryAddress,
                nextNFTId: startingNFTId,
                nftMetadata: Dictionary.empty(),
                nftOwnership: Dictionary.empty(),
                userNFTs: Dictionary.empty(),
                totalNFTsMinted: 0n,
                paused: false,
            },
            code
        )
    );

    await minter.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(minter.address);
    console.log(`✓ PolicyNFTMinter deployed: ${minter.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await minter.getAdmin();
    const deployedFactory = await minter.getMasterFactory();
    const nextNFTId = await minter.getNextNFTId();
    const totalMinted = await minter.getTotalNFTsMinted();
    const paused = await minter.getPaused();
    const version = await minter.getVersion();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    MasterFactory: ${deployedFactory.toString()}`);
    console.log(`    Next NFT ID: ${nextNFTId}`);
    console.log(`    Total Minted: ${totalMinted}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);

    // Verify configuration
    if (!deployedAdmin.equals(adminAddress)) throw new Error('Admin address mismatch!');
    if (!deployedFactory.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (nextNFTId !== startingNFTId) throw new Error('Starting NFT ID mismatch!');
    if (totalMinted !== 0n) throw new Error('Total minted should be 0!');
    if (paused !== false) throw new Error('Contract should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        policyNFTMinter: {
            address: minter.address.toString(),
            admin: adminAddress.toString(),
            masterFactory: masterFactoryAddress.toString(),
            startingNFTId: startingNFTId.toString(),
            version: 3,
        },
        standard: 'TEP-62/74',
        features: ['minting', 'transfer', 'burn', 'metadata'],
    };

    const fs = require('fs');
    const manifestPath = `./deployments/policy-nft-minter-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('PolicyNFTMinter V3:', minter.address.toString());

    console.log('\nAdd to .env:');
    console.log(`POLICY_NFT_MINTER_V3_ADDRESS=${minter.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "core": {`);
    console.log(`    "policyNFTMinter": {`);
    console.log(`      "address": "${minter.address.toString()}",`);
    console.log(`      "description": "TEP-62 NFT minter for policy certificates",`);
    console.log(`      "standard": "TEP-62/74"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Register minter with MasterFactory:');
        console.log(`   masterFactory.sendSetPolicyNFTMinter(admin, {`);
        console.log(`     value: toNano('0.05'),`);
        console.log(`     policyNFTMinterAddress: '${minter.address.toString()}'`);
        console.log(`   })`);
        console.log('2. Test NFT minting from child contracts');
        console.log('3. Configure frontend NFT display:');
        console.log('   - Fetch user NFTs via getUserNFTCount()');
        console.log('   - Display policy details from metadata');
        console.log('   - Show transfer history');
        console.log('4. Set up NFT marketplace integration (optional)');
        console.log('5. Configure metadata indexer for search');
        console.log('6. Monitor NFT minting events');
    } else {
        console.log('1. Run tests: npx jest tests/v3/PolicyNFTMinter.spec.ts');
        console.log('2. Test minting flow with child contracts');
        console.log('3. Test NFT transfer between users');
        console.log('4. Test burn functionality (expired policies)');
        console.log('5. Verify gas costs (<0.05 TON per mint)');
        console.log('6. Test metadata queries and user portfolio');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nNFT Metadata Structure:');
    console.log('  policy_id: uint64 - Unique policy identifier');
    console.log('  product_type: uint8 - 1=DEPEG, 2=BRIDGE, 3=ORACLE, 4=CONTRACT');
    console.log('  asset_id: uint16 - Asset identifier');
    console.log('  owner_address: slice - Policy holder');
    console.log('  coverage_amount: coins - Coverage in TON');
    console.log('  expiry_timestamp: uint32 - Policy expiration');

    console.log('\nUse Cases:');
    console.log('✓ Policy certificates (proof of coverage)');
    console.log('✓ Policy trading (transfer NFT = transfer policy)');
    console.log('✓ Portfolio tracking (user\'s active policies)');
    console.log('✓ Claim history (burned after claim)');
    console.log('✓ Marketplace integration (policy secondary market)');

    console.log('\nManagement Commands:');
    console.log('// Mint NFT (from child contract)');
    console.log('await minter.sendMintPolicyNFT(child, { value: toNano(\'0.1\'), metadata })');
    console.log('\n// Transfer NFT');
    console.log('await minter.sendTransferNFT(owner, { value: toNano(\'0.1\'), nftId: 1n, toAddress })');
    console.log('\n// Burn NFT (admin only)');
    console.log('await minter.sendBurnNFT(admin, { value: toNano(\'0.05\'), nftId: 1n })');
    console.log('\n// Query user portfolio');
    console.log('const count = await minter.getUserNFTCount(userAddress)');
    console.log('const metadata = await minter.getNFTMetadata(nftId)');
}
