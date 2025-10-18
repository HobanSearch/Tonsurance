import { toNano, Address } from '@ton/core';
import { MultiTrancheVault, createInitialTrancheData } from '../wrappers/MultiTrancheVault';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for Multi-Tranche Vault System
 *
 * Purpose: Deploy MultiTrancheVault and 6 SURE token contracts
 * Network: Testnet/Mainnet
 *
 * Tranches (ordered by risk/return):
 * 1. SURE-BTC:  25% allocation, 4% APY (flat) - Bitcoin-tier safety
 * 2. SURE-SNR:  20% allocation, 6.5-10% APY (log) - Senior tranche
 * 3. SURE-MEZZ: 18% allocation, 9-15% APY (linear) - Mezzanine
 * 4. SURE-JNR:  15% allocation, 12.5-16% APY (sigmoidal) - Junior
 * 5. SURE-JNR+: 12% allocation, 16-22% APY (quadratic) - Junior Plus
 * 6. SURE-EQT:  10% allocation, 15-25% APY (exponential) - Equity
 *
 * Bonding Curves:
 * - Each tranche has unique APY curve based on utilization
 * - Dynamic pricing attracts capital to understaffed tranches
 * - Automatic rebalancing through market incentives
 *
 * Initial Liquidity (if testnet):
 * - Seed each tranche with 1000 TON
 * - Test full waterfall and withdrawal flows
 */

const TRANCHE_CONFIGS = [
    {
        id: 1,
        name: 'SURE-BTC',
        symbol: 'SURE_BTC',
        allocation: 25,
        apyMin: 400,
        apyMax: 400,
        curve: 'FLAT',
    },
    {
        id: 2,
        name: 'SURE-SNR',
        symbol: 'SURE_SNR',
        allocation: 20,
        apyMin: 650,
        apyMax: 1000,
        curve: 'LOG',
    },
    {
        id: 3,
        name: 'SURE-MEZZ',
        symbol: 'SURE_MEZZ',
        allocation: 18,
        apyMin: 900,
        apyMax: 1500,
        curve: 'LINEAR',
    },
    {
        id: 4,
        name: 'SURE-JNR',
        symbol: 'SURE_JNR',
        allocation: 15,
        apyMin: 1250,
        apyMax: 1600,
        curve: 'SIGMOIDAL',
    },
    {
        id: 5,
        name: 'SURE-JNR-PLUS',
        symbol: 'SURE_JNR_PLUS',
        allocation: 12,
        apyMin: 1600,
        apyMax: 2200,
        curve: 'QUADRATIC',
    },
    {
        id: 6,
        name: 'SURE-EQT',
        symbol: 'SURE_EQT',
        allocation: 10,
        apyMin: 1500,
        apyMax: 2500,
        curve: 'EXPONENTIAL',
    },
];

export async function run(provider: NetworkProvider) {
    console.log('=== Multi-Tranche Vault Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';

    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT');
        console.warn('⚠️  This will deploy 7 contracts:');
        console.warn('    - 1 MultiTrancheVault');
        console.warn('    - 6 SURE token contracts');
        console.warn('⚠️  Estimated cost: ~5 TON\n');

        const confirm = await provider.ui().input('Type "DEPLOY" to continue:');
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contracts
    console.log('Step 1: Compiling contracts...');
    const vaultCode = await compile('MultiTrancheVault');
    const tokenCodes: { [key: string]: any } = {};

    for (const tranche of TRANCHE_CONFIGS) {
        console.log(`  Compiling ${tranche.symbol}...`);
        tokenCodes[tranche.symbol] = await compile(tranche.symbol);
    }
    console.log('✓ All contracts compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');
    const ownerAddressStr = await provider.ui().input('Enter owner address:');
    const ownerAddress = Address.parse(ownerAddressStr);

    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const claimsProcessorStr = await provider.ui().input('Enter ClaimsProcessor address:');
    const claimsProcessorAddress = Address.parse(claimsProcessorStr);

    console.log(`Owner: ${ownerAddress.toString()}`);
    console.log(`Admin: ${adminAddress.toString()}`);
    console.log(`ClaimsProcessor: ${claimsProcessorAddress.toString()}\n`);

    // Step 3: Deploy MultiTrancheVault
    console.log('Step 3: Deploying MultiTrancheVault...');

    const vault = provider.open(
        MultiTrancheVault.createFromConfig(
            {
                ownerAddress,
                totalCapital: 0n,
                totalCoverageSold: 0n,
                accumulatedPremiums: 0n,
                accumulatedLosses: 0n,
                trancheData: createInitialTrancheData(),
                depositorBalances: null,
                paused: false,
                adminAddress,
                claimsProcessorAddress,
                reentrancyGuard: false,
                seqNo: 0,
                circuitBreakerWindowStart: 0,
                circuitBreakerLosses: 0n,
            },
            vaultCode
        )
    );

    await vault.sendDeploy(provider.sender(), toNano('1.0'));
    await provider.waitForDeploy(vault.address);
    console.log(`✓ MultiTrancheVault deployed: ${vault.address.toString()}\n`);

    // Step 4: Deploy SURE token contracts
    console.log('Step 4: Deploying SURE token contracts...');
    const tokenAddresses: { [key: number]: Address } = {};

    for (const tranche of TRANCHE_CONFIGS) {
        console.log(`  Deploying ${tranche.name} (${tranche.symbol})...`);

        const tokenConfig = {
            ownerAddress: vault.address, // Vault owns the tokens
            name: tranche.name,
            symbol: tranche.symbol,
            decimals: 9,
            totalSupply: 0n,
            trancheId: tranche.id,
        };

        const token = await deployToken(
            provider,
            tokenCodes[tranche.symbol],
            tokenConfig
        );

        tokenAddresses[tranche.id] = token;
        console.log(`    ✓ ${tranche.symbol}: ${token.toString()}`);

        await sleep(2000); // 2 second delay between deployments
    }
    console.log('✓ All tokens deployed\n');

    // Step 5: Register tokens with vault
    console.log('Step 5: Registering tokens with vault...');

    for (const tranche of TRANCHE_CONFIGS) {
        console.log(`  Registering ${tranche.symbol}...`);

        await vault.sendSetTrancheToken(
            provider.sender(),
            toNano('0.1'),
            tranche.id,
            tokenAddresses[tranche.id]
        );

        await sleep(2000);
    }
    console.log('✓ All tokens registered\n');

    // Step 6: Initialize with seed capital (testnet only)
    if (!isMainnet) {
        console.log('Step 6: Seeding tranches with initial capital...');

        const seedCapital = toNano('1000'); // 1000 TON per tranche

        for (const tranche of TRANCHE_CONFIGS) {
            console.log(`  Depositing ${seedCapital} to ${tranche.symbol}...`);

            await vault.sendDeposit(
                provider.sender(),
                tranche.id,
                seedCapital
            );

            await sleep(2000);
        }

        console.log('✓ All tranches seeded\n');
    } else {
        console.log('Step 6: Skipped (mainnet - liquidity will come from LPs)\n');
    }

    // Step 7: Verification
    console.log('Step 7: Verifying deployment...');

    // Check vault configuration
    const vaultOwner = await vault.getOwner();
    const vaultAdmin = await vault.getAdmin();
    const vaultClaimsProcessor = await vault.getClaimsProcessor();

    console.log('  Vault configuration:');
    console.log(`    Owner: ${vaultOwner.toString()}`);
    console.log(`    Admin: ${vaultAdmin.toString()}`);
    console.log(`    ClaimsProcessor: ${vaultClaimsProcessor.toString()}`);

    if (!vaultOwner.equals(ownerAddress)) throw new Error('Owner mismatch!');
    if (!vaultAdmin.equals(adminAddress)) throw new Error('Admin mismatch!');
    if (!vaultClaimsProcessor.equals(claimsProcessorAddress)) {
        throw new Error('ClaimsProcessor mismatch!');
    }

    // Check tranche configuration
    console.log('\n  Tranche configuration:');
    for (const tranche of TRANCHE_CONFIGS) {
        const info = await vault.getTrancheInfo(tranche.id);
        const registeredToken = await vault.getTrancheTokenAddress(tranche.id);

        console.log(`    ${tranche.symbol}:`);
        console.log(`      Token: ${registeredToken.toString()}`);
        console.log(`      APY: ${info.apyMin}bp - ${info.apyMax}bp`);
        console.log(`      Allocation: ${info.allocationPercent}%`);
        console.log(`      Capital: ${info.capital} (${isMainnet ? '0 expected' : '1000 TON expected'})`);

        if (!registeredToken.equals(tokenAddresses[tranche.id])) {
            throw new Error(`Token address mismatch for ${tranche.symbol}!`);
        }

        if (info.apyMin !== BigInt(tranche.apyMin)) {
            throw new Error(`APY min mismatch for ${tranche.symbol}!`);
        }

        if (info.apyMax !== BigInt(tranche.apyMax)) {
            throw new Error(`APY max mismatch for ${tranche.symbol}!`);
        }
    }

    console.log('\n✓ Verification complete\n');

    // Step 8: Save deployment manifest
    console.log('Step 8: Saving deployment manifest...');
    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        vault: {
            address: vault.address.toString(),
            owner: ownerAddress.toString(),
            admin: adminAddress.toString(),
            claimsProcessor: claimsProcessorAddress.toString(),
        },
        tranches: TRANCHE_CONFIGS.map(t => ({
            id: t.id,
            name: t.name,
            symbol: t.symbol,
            tokenAddress: tokenAddresses[t.id].toString(),
            allocation: t.allocation,
            apyMin: t.apyMin,
            apyMax: t.apyMax,
            curve: t.curve,
        })),
    };

    const fs = require('fs');
    const manifestPath = `./deployments/multi-tranche-vault-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 9: Output
    console.log('=== Deployment Complete ===\n');
    console.log('MultiTrancheVault:', vault.address.toString());
    console.log('\nTranche Tokens:');
    TRANCHE_CONFIGS.forEach(t => {
        console.log(`  ${t.symbol}: ${tokenAddresses[t.id].toString()}`);
    });

    console.log('\nAdd to .env:');
    console.log(`MULTI_TRANCHE_VAULT_ADDRESS=${vault.address.toString()}`);
    TRANCHE_CONFIGS.forEach(t => {
        console.log(`${t.symbol}_ADDRESS=${tokenAddresses[t.id].toString()}`);
    });

    console.log('\nTranche Risk/Return Profile:');
    TRANCHE_CONFIGS.forEach(t => {
        console.log(`  ${t.symbol}: ${t.allocation}% allocation, ${t.apyMin / 100}%-${t.apyMax / 100}% APY (${t.curve})`);
    });

    console.log('\nNext Steps:');
    if (isMainnet) {
        console.log('1. Announce LP incentive program');
        console.log('2. Open deposits for all tranches');
        console.log('3. Monitor tranche utilization');
        console.log('4. Set up rebalancing alerts (>80% util)');
        console.log('5. Integrate with PolicyFactory for premium distribution');
    } else {
        console.log('1. Test deposit/withdraw flows: npm run test:vault');
        console.log('2. Test waterfall loss absorption: npm run test:waterfall');
        console.log('3. Test bonding curve pricing: npm run test:bonding');
        console.log('4. Verify NAV calculations');
        console.log('5. Deploy to mainnet when ready');
    }
}

async function deployToken(
    provider: NetworkProvider,
    code: any,
    config: any
): Promise<Address> {
    // Token deployment logic (simplified - use actual wrapper)
    const initData = beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(config.trancheId, 8)
        .storeCoins(config.totalSupply)
        .endCell();

    const token = {
        address: contractAddress(0, { code, data: initData }),
        init: { code, data: initData },
    };

    await provider.internal(provider.sender(), {
        to: token.address,
        value: toNano('0.5'),
        body: beginCell().endCell(),
    });

    await provider.waitForDeploy(token.address);

    return token.address;
}

function contractAddress(workchain: number, init: { code: any; data: any }): Address {
    const { beginCell, Cell } = require('@ton/core');
    const stateInit = beginCell()
        .storeBit(0)
        .storeBit(0)
        .storeBit(1)
        .storeRef(init.code)
        .storeBit(1)
        .storeRef(init.data)
        .storeBit(0)
        .endCell();

    const hash = stateInit.hash();
    return new Address(workchain, hash);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
