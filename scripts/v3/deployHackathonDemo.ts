import { toNano, Address, Dictionary, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { compileV3 } from '../../tests/v3/compile-helper';

/**
 * Hackathon Demo Deployment Script
 *
 * Deploys complete Tonsurance system with 5 products:
 * - DeFi: USDT, USDC, USDe depeg insurance
 * - TradFi: Hurricane and Earthquake parametric insurance
 *
 * Deployment Order:
 * 1. MasterFactory (if not deployed)
 * 2. DepegSubFactory + 3 stablecoin children (USDT, USDC, USDe)
 * 3. TradFiNatCatFactory + 2 catastrophe children (Hurricane, Earthquake)
 *
 * Gas Costs (estimated testnet):
 * - MasterFactory: 1.0 TON
 * - PolicyNFTMinter: 0.5 TON
 * - MultiTrancheVault: 0.5 TON
 * - PriceOracle: 0.5 TON
 * - DepegSubFactory: 0.3 TON
 * - 3 Stablecoin Children: 0.3 TON each = 0.9 TON
 * - TradFiNatCatFactory: 0.3 TON
 * - 2 NatCat Children: 0.5 TON each = 1.0 TON
 * - Total: ~5.0 TON + 1 TON buffer = 6.0 TON
 */

export async function run(provider: NetworkProvider) {
    console.log('\n🎯 ===== TONSURANCE HACKATHON DEMO DEPLOYMENT =====\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.error('❌ This script is for TESTNET only');
        console.error('❌ Do not deploy to mainnet without full security audit');
        return;
    }

    console.log('📍 Network: TESTNET');
    console.log('💰 Required balance: ~6.0 TON\n');

    // ==============================================================
    // CONFIGURATION
    // ==============================================================

    console.log('Step 1: Configuration\n');

    const deployerAddress = provider.sender().address;
    if (!deployerAddress) {
        console.error('❌ Deployer address not found');
        return;
    }

    console.log(`Deployer: ${deployerAddress.toString()}`);

    // Check balance
    const balance = await provider.api().getBalance(deployerAddress);
    const balanceTon = Number(balance) / 1e9;
    console.log(`Balance: ${balanceTon.toFixed(2)} TON`);

    if (balanceTon < 6.0) {
        console.error('❌ Insufficient balance. Need at least 6.0 TON');
        console.error('Get testnet TON from: https://t.me/testgiver_ton_bot');
        return;
    }

    // Use deployer as admin for demo (in production, use multi-sig)
    const adminAddress = deployerAddress;
    const gasWalletAddress = deployerAddress; // Simplified for demo

    // SBT Verifier placeholder (for KYC - optional for hackathon demo)
    const sbtVerifierAddress = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    console.log('\n✓ Configuration complete\n');

    // ==============================================================
    // STEP 2: COMPILE ALL CONTRACTS
    // ==============================================================

    console.log('Step 2: Compiling contracts...\n');

    const masterFactoryCode = await compileV3('MasterFactory');
    const depegSubFactoryCode = await compileV3('DepegSubFactory');
    const stablecoinChildCode = await compileV3('StablecoinChild');
    const tradFiNatCatFactoryCode = await compileV3('TradFiNatCatFactory');
    const natCatChildCode = await compileV3('NatCatChild');

    // Supporting contracts
    const policyNFTMinterCode = await compileV3('PolicyNFTMinter');
    const multiTrancheVaultCode = await compileV3('MultiTrancheVault');
    const priceOracleCode = await compileV3('PriceOracle');

    console.log('✓ All contracts compiled successfully\n');

    // ==============================================================
    // STEP 3: DEPLOY MASTERFACTORY
    // ==============================================================

    console.log('Step 3: Deploying MasterFactory...\n');

    // Build MasterFactory data
    const addresses1Cell = beginCell()
        .storeAddress(adminAddress)
        .storeAddress(gasWalletAddress)
        .storeAddress(sbtVerifierAddress)
        .endCell();

    const addresses2Cell = beginCell()
        .storeAddress(policyNFTMinterAddress)
        .storeAddress(vaultAddress)
        .endCell();

    const masterFactoryData = beginCell()
        .storeRef(addresses1Cell)
        .storeRef(addresses2Cell)
        .storeDict(Dictionary.empty())  // product_factories
        .storeDict(Dictionary.empty())  // factory_codes
        .storeUint(0, 64)               // total_policies_created
        .storeBit(false)                // paused
        .storeUint(1, 8)                // required_kyc_tier (1 = Basic for demo)
        .storeDict(Dictionary.empty())  // active_policies
        .storeUint(0, 64)               // total_claims_processed
        .endCell();

    const masterFactory = provider.open({
        code: masterFactoryCode,
        data: masterFactoryData,
    });

    console.log(`MasterFactory address: ${masterFactory.address.toString()}`);
    console.log('Deploying...');

    await masterFactory.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(masterFactory.address);

    console.log('✓ MasterFactory deployed\n');

    // ==============================================================
    // STEP 3A: DEPLOY SUPPORTING CONTRACTS
    // ==============================================================

    console.log('Step 3A: Deploying Supporting Contracts...\n');

    // Deploy PolicyNFTMinter
    console.log('Deploying PolicyNFTMinter...');

    const nftMinterData = beginCell()
        .storeAddress(adminAddress)                  // admin_address
        .storeAddress(masterFactory.address)         // master_factory_address
        .storeUint(0, 64)                            // next_nft_id
        .storeDict(Dictionary.empty())               // nft_metadata
        .storeDict(Dictionary.empty())               // nft_ownership
        .storeDict(Dictionary.empty())               // user_nfts
        .storeUint(0, 64)                            // total_nfts_minted
        .storeBit(false)                             // paused
        .endCell();

    const policyNFTMinter = provider.open({
        code: policyNFTMinterCode,
        data: nftMinterData,
    });

    console.log(`PolicyNFTMinter address: ${policyNFTMinter.address.toString()}`);
    await policyNFTMinter.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(policyNFTMinter.address);
    console.log('✓ PolicyNFTMinter deployed\n');

    // Deploy MultiTrancheVault
    console.log('Deploying MultiTrancheVault...');

    const vaultData = beginCell()
        .storeAddress(adminAddress)                  // admin_address
        .storeAddress(masterFactory.address)         // master_factory_address
        .storeCoins(0)                               // total_deposits
        .storeCoins(0)                               // total_withdrawn
        .storeDict(Dictionary.empty())               // user_deposits
        .storeBit(false)                             // paused
        .endCell();

    const multiTrancheVault = provider.open({
        code: multiTrancheVaultCode,
        data: vaultData,
    });

    console.log(`MultiTrancheVault address: ${multiTrancheVault.address.toString()}`);
    await multiTrancheVault.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(multiTrancheVault.address);
    console.log('✓ MultiTrancheVault deployed\n');

    // Deploy PriceOracle
    console.log('Deploying PriceOracle...');

    const oracleData = beginCell()
        .storeAddress(adminAddress)                  // admin_address
        .storeDict(Dictionary.empty())               // price_feeds (asset_id -> price)
        .storeUint(0, 32)                            // last_update_time
        .storeBit(false)                             // paused
        .endCell();

    const priceOracle = provider.open({
        code: priceOracleCode,
        data: oracleData,
    });

    console.log(`PriceOracle address: ${priceOracle.address.toString()}`);
    await priceOracle.sendDeploy(provider.sender(), toNano('0.5'));
    await provider.waitForDeploy(priceOracle.address);
    console.log('✓ PriceOracle deployed\n');

    // Update addresses to use real deployed contracts
    const policyNFTMinterAddress = policyNFTMinter.address;
    const vaultAddress = multiTrancheVault.address;
    const floatMasterAddress = multiTrancheVault.address; // Same as vault for demo

    console.log('✓ All supporting contracts deployed\n');

    // ==============================================================
    // STEP 4: DEPLOY DEFI - DEPEGSUBFACTORY
    // ==============================================================

    console.log('Step 4: Deploying DeFi - DepegSubFactory...\n');

    const depegSubFactoryData = beginCell()
        .storeAddress(masterFactory.address)
        .storeUint(1, 8)                // PRODUCT_DEPEG
        .storeDict(Dictionary.empty())  // children
        .storeDict(Dictionary.empty())  // child_codes
        .storeUint(0, 32)               // total_children_deployed
        .storeUint(0, 64)               // total_policies_created
        .storeBit(false)                // paused
        .endCell();

    const depegSubFactory = provider.open({
        code: depegSubFactoryCode,
        data: depegSubFactoryData,
    });

    console.log(`DepegSubFactory address: ${depegSubFactory.address.toString()}`);
    console.log('Deploying...');

    await depegSubFactory.sendDeploy(provider.sender(), toNano('0.3'));
    await provider.waitForDeploy(depegSubFactory.address);

    console.log('✓ DepegSubFactory deployed\n');

    // ==============================================================
    // STEP 5: DEPLOY DEFI - STABLECOIN CHILDREN
    // ==============================================================

    console.log('Step 5: Deploying DeFi - Stablecoin Children...\n');

    const stablecoins = [
        { name: 'USDT', asset_id: 1 },
        { name: 'USDC', asset_id: 2 },
        { name: 'USDe', asset_id: 7 },
    ];

    const stablecoinChildren = [];

    for (const stablecoin of stablecoins) {
        console.log(`Deploying ${stablecoin.name} Child (asset_id=${stablecoin.asset_id})...`);

        // Build address reference cell
        const addrRef = beginCell()
            .storeAddress(policyNFTMinterAddress)
            .storeAddress(floatMasterAddress)
            .storeAddress(priceOracle.address)  // Price oracle for depeg detection
            .endCell();

        const childData = beginCell()
            .storeAddress(depegSubFactory.address)   // parent_factory
            .storeAddress(masterFactory.address)      // master_factory
            .storeUint(1, 8)                          // product_type = PRODUCT_DEPEG
            .storeUint(stablecoin.asset_id, 16)       // asset_id
            .storeRef(addrRef)
            .storeDict(Dictionary.empty())            // policy_registry
            .storeUint(0, 64)                         // next_policy_id
            .storeUint(0, 64)                         // total_policies_created
            .storeCoins(0)                            // total_coverage_amount
            .storeBit(false)                          // paused
            .storeUint(9800, 16)                      // depeg_threshold (0.98 = 9800/10000)
            .storeUint(0, 64)                         // last_price
            .storeUint(0, 32)                         // last_price_update
            .endCell();

        const child = provider.open({
            code: stablecoinChildCode,
            data: childData,
        });

        console.log(`${stablecoin.name} Child address: ${child.address.toString()}`);

        await child.sendDeploy(provider.sender(), toNano('0.3'));
        await provider.waitForDeploy(child.address);

        stablecoinChildren.push({
            name: stablecoin.name,
            asset_id: stablecoin.asset_id,
            address: child.address.toString(),
        });

        console.log(`✓ ${stablecoin.name} Child deployed\n`);
    }

    console.log('✓ All stablecoin children deployed\n');

    // ==============================================================
    // STEP 6: DEPLOY TRADFI - TRADFINATCATFACTORY
    // ==============================================================

    console.log('Step 6: Deploying TradFi - TradFiNatCatFactory...\n');

    const tradFiFactoryData = beginCell()
        .storeAddress(masterFactory.address)
        .storeUint(5, 8)                // PRODUCT_TRADFI_NATCAT
        .storeDict(Dictionary.empty())  // children
        .storeDict(Dictionary.empty())  // child_codes
        .storeUint(0, 32)               // total_children_deployed
        .storeUint(0, 64)               // total_policies_created
        .storeBit(false)                // paused
        .endCell();

    const tradFiFactory = provider.open({
        code: tradFiNatCatFactoryCode,
        data: tradFiFactoryData,
    });

    console.log(`TradFiNatCatFactory address: ${tradFiFactory.address.toString()}`);
    console.log('Deploying...');

    await tradFiFactory.sendDeploy(provider.sender(), toNano('0.3'));
    await provider.waitForDeploy(tradFiFactory.address);

    console.log('✓ TradFiNatCatFactory deployed\n');

    // ==============================================================
    // STEP 7: DEPLOY TRADFI - NATCAT CHILDREN
    // ==============================================================

    console.log('Step 7: Deploying TradFi - NatCat Children...\n');

    const catastrophes = [
        { name: 'Hurricane', asset_id: 1 },
        { name: 'Earthquake', asset_id: 2 },
    ];

    const natCatChildren = [];

    for (const catastrophe of catastrophes) {
        console.log(`Deploying ${catastrophe.name} Child (asset_id=${catastrophe.asset_id})...`);

        // Build address reference cell
        const addrRef = beginCell()
            .storeAddress(policyNFTMinterAddress)
            .storeAddress(floatMasterAddress)
            .storeAddress(sbtVerifierAddress)  // Event oracle (will be set by oracle keeper)
            .endCell();

        const childData = beginCell()
            .storeAddress(tradFiFactory.address)     // parent_factory
            .storeAddress(masterFactory.address)      // master_factory
            .storeUint(5, 8)                          // product_type = PRODUCT_TRADFI_NATCAT
            .storeUint(catastrophe.asset_id, 16)      // asset_id
            .storeRef(addrRef)
            .storeDict(Dictionary.empty())            // policy_registry
            .storeUint(0, 64)                         // next_policy_id
            .storeUint(0, 64)                         // total_policies_created
            .storeCoins(0)                            // total_coverage_amount
            .storeBit(false)                          // paused
            .storeUint(0, 32)                         // last_event_id
            .storeUint(0, 32)                         // last_event_timestamp
            .storeDict(Dictionary.empty())            // active_policies
            .endCell();

        const child = provider.open({
            code: natCatChildCode,
            data: childData,
        });

        console.log(`${catastrophe.name} Child address: ${child.address.toString()}`);

        await child.sendDeploy(provider.sender(), toNano('0.5'));
        await provider.waitForDeploy(child.address);

        natCatChildren.push({
            name: catastrophe.name,
            asset_id: catastrophe.asset_id,
            address: child.address.toString(),
        });

        console.log(`✓ ${catastrophe.name} Child deployed\n`);
    }

    console.log('✓ All NatCat children deployed\n');

    // ==============================================================
    // DEPLOYMENT SUMMARY
    // ==============================================================

    console.log('\n🎉 ===== DEPLOYMENT COMPLETE =====\n');

    console.log('📋 Contract Addresses:\n');

    console.log('Core:');
    console.log(`  MasterFactory: ${masterFactory.address.toString()}`);
    console.log(`  PolicyNFTMinter: ${policyNFTMinter.address.toString()}`);
    console.log(`  MultiTrancheVault: ${multiTrancheVault.address.toString()}`);
    console.log(`  PriceOracle: ${priceOracle.address.toString()}\n`);

    console.log('DeFi Products (Depeg Insurance):');
    console.log(`  DepegSubFactory: ${depegSubFactory.address.toString()}`);
    for (const child of stablecoinChildren) {
        console.log(`    ${child.name} Child: ${child.address}`);
    }
    console.log();

    console.log('TradFi Products (Natural Catastrophe):');
    console.log(`  TradFiNatCatFactory: ${tradFiFactory.address.toString()}`);
    for (const child of natCatChildren) {
        console.log(`    ${child.name} Child: ${child.address}`);
    }
    console.log();

    console.log('🔧 Next Steps:\n');
    console.log('1. Register children with factories:');
    console.log('   - Call depegSubFactory.sendRegisterChild() for USDT, USDC, USDe');
    console.log('   - Call tradFiFactory.sendRegisterChild() for Hurricane, Earthquake');
    console.log();
    console.log('2. Start oracle keeper:');
    console.log(`   export HURRICANE_CHILD_ADDRESS="${natCatChildren[0].address}"`);
    console.log(`   export EARTHQUAKE_CHILD_ADDRESS="${natCatChildren[1].address}"`);
    console.log('   export ORACLE_PRIVATE_KEY="<your_key>"');
    console.log('   ./natcat_oracle_keeper.exe');
    console.log();
    console.log('3. Test policy creation:');
    console.log('   npx ts-node scripts/v3/testPolicyCreation.ts');
    console.log();
    console.log('4. Update frontend with contract addresses');
    console.log();

    console.log('📝 Save these addresses for hackathon demo!\n');
}
