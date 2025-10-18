import { toNano, Address, Cell, beginCell } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for Policy Sharding System
 *
 * Purpose: Deploy PolicyRouter and 256 PolicyShard contracts for horizontal scaling
 * Network: Testnet/Mainnet
 *
 * Architecture:
 * - 1 PolicyRouter (routes policies to shards by policy_id % 256)
 * - 256 PolicyShard contracts (each handles ~400 policies)
 * - Total capacity: ~100,000 concurrent policies
 *
 * Deployment Strategy:
 * - Deploy in batches of 10 shards to avoid rate limiting
 * - 5-second delay between batches
 * - Total deployment time: ~20-25 minutes
 *
 * Gas Costs (estimated):
 * - PolicyRouter: 0.5 TON
 * - Each PolicyShard: 0.3 TON
 * - Total: ~77 TON + gas reserves
 */

interface ShardDeploymentStatus {
    shardId: number;
    address: string;
    deployed: boolean;
    verified: boolean;
}

export async function run(provider: NetworkProvider) {
    console.log('=== Policy Sharding System Deployment ===\n');

    const isMainnet = provider.network() === 'mainnet';
    const SHARD_COUNT = 256;
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 5000;

    // Confirmation for mainnet
    if (isMainnet) {
        console.warn('⚠️  MAINNET DEPLOYMENT DETECTED');
        console.warn('⚠️  This will deploy 257 contracts (1 router + 256 shards)');
        console.warn('⚠️  Estimated cost: ~80 TON');
        console.warn('⚠️  Estimated time: ~25 minutes\n');

        const confirm = await provider.ui().input(
            'Type "DEPLOY" to continue:'
        );
        if (confirm !== 'DEPLOY') {
            console.log('Deployment cancelled.');
            return;
        }
    }

    // Step 1: Compile contracts
    console.log('Step 1: Compiling contracts...');
    const policyRouterCode = await compile('PolicyRouter');
    const policyShardCode = await compile('PolicyShard');
    console.log('✓ Contracts compiled\n');

    // Step 2: Configuration
    console.log('Step 2: Configuration');
    const adminAddressStr = await provider.ui().input('Enter admin address:');
    const adminAddress = Address.parse(adminAddressStr);

    const claimsProcessorStr = await provider.ui().input('Enter ClaimsProcessor address:');
    const claimsProcessorAddress = Address.parse(claimsProcessorStr);

    const policyFactoryStr = await provider.ui().input('Enter PolicyFactory address:');
    const policyFactoryAddress = Address.parse(policyFactoryStr);

    console.log(`Admin: ${adminAddress.toString()}`);
    console.log(`ClaimsProcessor: ${claimsProcessorAddress.toString()}`);
    console.log(`PolicyFactory: ${policyFactoryAddress.toString()}\n`);

    // Step 3: Deploy PolicyRouter
    console.log('Step 3: Deploying PolicyRouter...');

    const routerInitData = beginCell()
        .storeAddress(adminAddress)
        .storeAddress(policyFactoryAddress)
        .storeDict(null) // shard_addresses (will be populated after shard deployment)
        .storeUint(SHARD_COUNT, 16)
        .storeUint(0, 64) // total_policies
        .endCell();

    const policyRouter = provider.open({
        address: contractAddress(0, { code: policyRouterCode, data: routerInitData }),
        init: { code: policyRouterCode, data: routerInitData },
    });

    await provider.internal(provider.sender(), {
        to: policyRouter.address,
        value: toNano('0.5'),
        body: beginCell().endCell(),
    });
    await provider.waitForDeploy(policyRouter.address);
    console.log(`✓ PolicyRouter deployed: ${policyRouter.address.toString()}\n`);

    // Step 4: Deploy PolicyShards in batches
    console.log(`Step 4: Deploying ${SHARD_COUNT} PolicyShards...`);
    const shardStatus: ShardDeploymentStatus[] = [];
    const shardAddresses: Address[] = [];

    for (let batch = 0; batch < Math.ceil(SHARD_COUNT / BATCH_SIZE); batch++) {
        const batchStart = batch * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, SHARD_COUNT);
        const batchNum = batch + 1;
        const totalBatches = Math.ceil(SHARD_COUNT / BATCH_SIZE);

        console.log(`\nBatch ${batchNum}/${totalBatches}: Deploying shards ${batchStart}-${batchEnd - 1}...`);

        // Deploy shards in parallel within batch
        const batchDeployments = [];
        for (let shardId = batchStart; shardId < batchEnd; shardId++) {
            batchDeployments.push(deployShard(
                provider,
                policyShardCode,
                shardId,
                adminAddress,
                policyRouter.address,
                claimsProcessorAddress
            ));
        }

        const deployedShards = await Promise.all(batchDeployments);

        // Record status
        deployedShards.forEach(({ shardId, address }) => {
            shardStatus.push({
                shardId,
                address: address.toString(),
                deployed: true,
                verified: false,
            });
            shardAddresses.push(address);
            console.log(`  ✓ Shard ${shardId}: ${address.toString()}`);
        });

        console.log(`✓ Batch ${batchNum}/${totalBatches} complete`);

        // Rate limiting delay (except for last batch)
        if (batchEnd < SHARD_COUNT) {
            console.log(`  Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
            await sleep(BATCH_DELAY_MS);
        }
    }

    console.log(`\n✓ All ${SHARD_COUNT} shards deployed\n`);

    // Step 5: Register shards with router
    console.log('Step 5: Registering shards with router...');

    // Register in batches to avoid transaction size limits
    const REGISTER_BATCH_SIZE = 50;
    for (let batch = 0; batch < Math.ceil(SHARD_COUNT / REGISTER_BATCH_SIZE); batch++) {
        const batchStart = batch * REGISTER_BATCH_SIZE;
        const batchEnd = Math.min(batchStart + REGISTER_BATCH_SIZE, SHARD_COUNT);

        console.log(`  Registering shards ${batchStart}-${batchEnd - 1}...`);

        const shardBatch = shardAddresses.slice(batchStart, batchEnd);
        await registerShardBatch(
            provider,
            policyRouter.address,
            batchStart,
            shardBatch
        );

        await sleep(3000); // 3 second delay between registration batches
    }
    console.log('✓ All shards registered\n');

    // Step 6: Verification
    console.log('Step 6: Verifying deployment...');

    // Verify router configuration
    console.log('  Verifying router...');
    const routerAdmin = await getRouterAdmin(provider, policyRouter.address);
    if (!routerAdmin.equals(adminAddress)) {
        throw new Error('Router admin mismatch!');
    }
    console.log('    ✓ Router admin verified');

    // Verify shard sample (first, middle, last)
    const sampleShardIds = [0, Math.floor(SHARD_COUNT / 2), SHARD_COUNT - 1];
    console.log('  Verifying sample shards...');

    for (const shardId of sampleShardIds) {
        const shardAddr = shardAddresses[shardId];
        const shardAdmin = await getShardAdmin(provider, shardAddr);

        if (!shardAdmin.equals(adminAddress)) {
            throw new Error(`Shard ${shardId} admin mismatch!`);
        }

        shardStatus[shardId].verified = true;
        console.log(`    ✓ Shard ${shardId} verified`);
    }

    console.log('✓ Verification complete\n');

    // Step 7: Save deployment manifest
    console.log('Step 7: Saving deployment manifest...');
    const manifest = {
        network: provider.network(),
        deployedAt: new Date().toISOString(),
        router: {
            address: policyRouter.address.toString(),
            admin: adminAddress.toString(),
        },
        shards: shardStatus,
        stats: {
            totalShards: SHARD_COUNT,
            deploymentDuration: 'See logs',
            estimatedCapacity: SHARD_COUNT * 400,
        },
    };

    const fs = require('fs');
    const manifestPath = `./deployments/policy-sharding-${provider.network()}-${Date.now()}.json`;
    fs.mkdirSync('./deployments', { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest saved: ${manifestPath}\n`);

    // Step 8: Output
    console.log('=== Deployment Complete ===\n');
    console.log('PolicyRouter:', policyRouter.address.toString());
    console.log(`PolicyShards: ${SHARD_COUNT} deployed`);
    console.log(`First Shard: ${shardAddresses[0].toString()}`);
    console.log(`Last Shard: ${shardAddresses[SHARD_COUNT - 1].toString()}`);
    console.log('\nAdd to .env:');
    console.log(`POLICY_ROUTER_ADDRESS=${policyRouter.address.toString()}`);
    console.log('\nNext Steps:');
    console.log('1. Update PolicyFactory to use PolicyRouter');
    console.log('2. Run integration tests: npm run test:sharding');
    console.log('3. Monitor shard utilization: npm run monitor:shards');
    console.log('4. Set up shard rebalancing cron job');
}

async function deployShard(
    provider: NetworkProvider,
    code: Cell,
    shardId: number,
    adminAddress: Address,
    routerAddress: Address,
    claimsProcessorAddress: Address
): Promise<{ shardId: number; address: Address }> {
    const shardInitData = beginCell()
        .storeAddress(adminAddress)
        .storeAddress(routerAddress)
        .storeAddress(claimsProcessorAddress)
        .storeUint(shardId, 8)
        .storeDict(null) // policies
        .storeUint(0, 32) // policy_count
        .storeUint(0, 32) // seq_no
        .endCell();

    const shard = {
        address: contractAddress(0, { code, data: shardInitData }),
        init: { code, data: shardInitData },
    };

    await provider.internal(provider.sender(), {
        to: shard.address,
        value: toNano('0.3'),
        body: beginCell().endCell(),
    });

    await provider.waitForDeploy(shard.address);

    return { shardId, address: shard.address };
}

async function registerShardBatch(
    provider: NetworkProvider,
    routerAddress: Address,
    startIndex: number,
    shardAddresses: Address[]
): Promise<void> {
    const body = beginCell()
        .storeUint(0x72656773, 32) // op::register_shards
        .storeUint(startIndex, 16)
        .storeUint(shardAddresses.length, 16);

    // Store addresses
    for (const addr of shardAddresses) {
        body.storeAddress(addr);
    }

    await provider.internal(provider.sender(), {
        to: routerAddress,
        value: toNano('0.2'),
        body: body.endCell(),
    });
}

async function getRouterAdmin(provider: NetworkProvider, address: Address): Promise<Address> {
    const result = await provider.get(address, 'get_admin');
    return result.stack.readAddress();
}

async function getShardAdmin(provider: NetworkProvider, address: Address): Promise<Address> {
    const result = await provider.get(address, 'get_admin');
    return result.stack.readAddress();
}

function contractAddress(workchain: number, init: { code: Cell; data: Cell }): Address {
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
