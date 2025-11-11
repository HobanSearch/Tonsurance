import { toNano, Address, Dictionary } from '@ton/core';
import { GasWallet } from '../../wrappers/v3/GasWallet';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for GasWallet V3
 *
 * Purpose: Deploy DoS-resistant gas abstraction layer
 * Network: Testnet/Mainnet
 *
 * Features:
 * - Sponsors user transactions (no gas needed from users)
 * - Signature validation (early rejection of invalid tx)
 * - Rate limiting (5 tx/min per address)
 * - Nonce-based replay protection
 * - 0.05 TON gas buffer for bounce handling
 *
 * Requirements:
 * - Admin wallet (for management)
 * - MasterFactory address (for forwarding)
 * - Public key (for signature validation)
 * - Initial funding (~50-100 TON recommended)
 *
 * Post-Deployment:
 * 1. Fund wallet with TON for gas sponsorship
 * 2. Configure public key for signature validation
 * 3. Test external message flow
 * 4. Monitor reserve balance
 */

export async function run(provider: NetworkProvider) {
    console.log('=== GasWallet V3 Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy the GasWallet contract');
        console.warn('⚠️  Recommended initial funding: 50-100 TON');
        console.warn('⚠️  Estimated deployment cost: ~1 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contract
    console.log('Step 1: Compiling GasWallet...');
    const code = await compile('GasWallet');
    console.log('✓ Contract compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');

    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const masterFactoryStr = await provider.ui().input('Enter MasterFactory address (or press Enter for placeholder):');
    const masterFactoryAddress = masterFactoryStr
        ? Address.parse(masterFactoryStr)
        : Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const publicKeyStr = await provider.ui().input('Enter public key (256-bit hex) or press Enter for 0:');
    const publicKey = publicKeyStr ? BigInt('0x' + publicKeyStr) : 0n;

    const initialFundingStr = await provider.ui().input('Initial funding amount in TON [default: 10]:');
    const initialFunding = initialFundingStr ? parseFloat(initialFundingStr) : 10;

    console.log('\nConfiguration:');
    console.log(`  Admin: ${adminAddress.toString()}`);
    console.log(`  MasterFactory: ${masterFactoryAddress.toString()}`);
    console.log(`  Public Key: ${publicKey.toString()}`);
    console.log(`  Initial Funding: ${initialFunding} TON`);

    if (isMainnet && publicKey === 0n) {
        console.warn('\n⚠️  WARNING: Public key is 0 (placeholder)');
        console.warn('⚠️  Signature validation will fail!');
        console.warn('⚠️  Set valid public key immediately after deployment.\n');

        const confirm = await provider.ui().input('Continue anyway? (yes/no):');
        if (confirm.toLowerCase() !== 'yes') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 3: Deploy GasWallet
    console.log('\nStep 3: Deploying GasWallet...');

    const gasWallet = provider.open(
        GasWallet.createFromConfig(
            {
                adminAddress: adminAddress,
                masterFactoryAddress: masterFactoryAddress,
                totalSponsored: 0n,
                userNonces: Dictionary.empty(),
                rateLimits: Dictionary.empty(),
                reserveBalance: 0n,
                publicKey: publicKey,
                paused: false,
            },
            code
        )
    );

    await gasWallet.sendDeploy(provider.sender(), toNano(initialFunding));
    await provider.waitForDeploy(gasWallet.address);
    console.log(`✓ GasWallet deployed: ${gasWallet.address.toString()}\n`);

    // Step 4: Verification
    console.log('Step 4: Verifying deployment...');

    const deployedAdmin = await gasWallet.getAdmin();
    const deployedFactory = await gasWallet.getMasterFactory();
    const deployedPubKey = await gasWallet.getPublicKey();
    const paused = await gasWallet.getPaused();
    const version = await gasWallet.getVersion();
    const walletBalance = await gasWallet.getWalletBalance();
    const reserveBalance = await gasWallet.getReserveBalance();
    const totalSponsored = await gasWallet.getTotalSponsored();

    console.log('  Deployed configuration:');
    console.log(`    Admin: ${deployedAdmin.toString()}`);
    console.log(`    MasterFactory: ${deployedFactory.toString()}`);
    console.log(`    Public Key: ${deployedPubKey.toString()}`);
    console.log(`    Paused: ${paused}`);
    console.log(`    Version: ${version}`);
    console.log(`    Wallet Balance: ${Number(walletBalance) / 1e9} TON`);
    console.log(`    Reserve Balance: ${Number(reserveBalance) / 1e9} TON`);
    console.log(`    Total Sponsored: ${Number(totalSponsored) / 1e9} TON`);

    // Verify configuration
    if (!deployedAdmin.equals(adminAddress)) throw new Error('Admin address mismatch!');
    if (!deployedFactory.equals(masterFactoryAddress)) throw new Error('MasterFactory address mismatch!');
    if (deployedPubKey !== publicKey) throw new Error('Public key mismatch!');
    if (paused !== false) throw new Error('Wallet should not be paused!');
    if (version !== 3) throw new Error('Version mismatch!');
    if (walletBalance < toNano(initialFunding - 1)) throw new Error('Insufficient wallet balance!');

    console.log('\n✓ Verification complete\n');

    // Step 5: Save deployment manifest
    console.log('Step 5: Saving deployment manifest...');

    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        gasWallet: {
            address: gasWallet.address.toString(),
            admin: adminAddress.toString(),
            masterFactory: masterFactoryAddress.toString(),
            publicKey: publicKey.toString(),
            initialFunding: initialFunding,
            version: 3,
        },
        config: {
            rateLimit: '5 transactions per minute',
            gasBuffer: '0.05 TON',
            forwardCost: '~0.5 TON per transaction',
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/gas-wallet-v3-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 6: Output
    console.log('=== Deployment Complete ===\n');
    console.log('GasWallet V3:', gasWallet.address.toString());
    console.log('Current Balance:', `${Number(walletBalance) / 1e9} TON`);

    console.log('\nAdd to .env:');
    console.log(`GAS_WALLET_V3_ADDRESS=${gasWallet.address.toString()}`);

    console.log('\nAdd to contracts.json:');
    console.log(`{`);
    console.log(`  "core": {`);
    console.log(`    "gasWallet": {`);
    console.log(`      "address": "${gasWallet.address.toString()}",`);
    console.log(`      "description": "DoS-resistant gas abstraction layer"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}`);

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Fund wallet with additional TON for sponsorship:');
        console.log(`   gasWallet.sendFundWallet(sender, toNano('50'))`);
        console.log('2. Set valid public key if using placeholder:');
        console.log(`   gasWallet.sendSetPublicKey(admin, { value: toNano('0.05'), publicKey: validKey })`);
        console.log('3. Monitor reserve balance regularly');
        console.log('4. Set up automatic refilling (below 10 TON)');
        console.log('5. Configure monitoring alerts:');
        console.log('   - Low balance (<10 TON)');
        console.log('   - High rate limit violations');
        console.log('   - Unusual transaction patterns');
        console.log('6. Test external message flow with small amounts');
    } else {
        console.log('1. Run tests: npx jest tests/v3/GasWallet.spec.ts');
        console.log('2. Test funding: gasWallet.sendFundWallet(deployer, toNano(\'10\'))');
        console.log('3. Test external message forwarding (requires signature)');
        console.log('4. Monitor rate limiting behavior');
        console.log('5. Test withdrawal: gasWallet.sendWithdraw(admin, {...})');
        console.log('6. Verify gas costs (<0.005 TON overhead)');
        console.log('7. Deploy to mainnet when ready');
    }

    console.log('\nRate Limiting:');
    console.log('  Window: 60 seconds');
    console.log('  Max Transactions: 5 per address');
    console.log('  Reset: Automatic after window expires');

    console.log('\nMonitoring Commands:');
    console.log('// Check wallet balance');
    console.log('await gasWallet.getWalletBalance()');
    console.log('\n// Check reserve balance');
    console.log('await gasWallet.getReserveBalance()');
    console.log('\n// Check total sponsored');
    console.log('await gasWallet.getTotalSponsored()');
    console.log('\n// Check user rate limit');
    console.log('await gasWallet.getRateLimitStatus(userAddress)');

    console.log('\nFunding Recommendations:');
    if (isMainnet) {
        console.log('  Initial: 50-100 TON');
        console.log('  Refill threshold: <10 TON');
        console.log('  Refill amount: 50 TON');
        console.log('  Expected usage: ~0.5 TON per policy creation');
    } else {
        console.log('  Testnet: 10-20 TON sufficient for testing');
    }
}
