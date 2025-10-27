"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const distributed_lock_1 = require("../lib/distributed_lock");
// import { PricingOracleKeeper } from '../PricingOracleKeeper';
/**
 * Example of how to integrate distributed locking with a keeper service
 *
 * This ensures only ONE keeper instance runs at a time across multiple deployments.
 * If this process crashes, the lock will auto-expire after TTL, allowing another keeper to take over.
 */
async function main() {
    console.log('Starting keeper with distributed lock coordination...');
    // Initialize distributed lock
    const lock = new distributed_lock_1.DistributedLock({
        redis_nodes: [
            'localhost:6379',
            'localhost:6380',
            'localhost:6381',
        ],
        lock_ttl_ms: 30000, // Lock expires after 30 seconds
        retry_count: 3, // Retry 3 times if lock acquisition fails
        retry_delay_ms: 200, // Wait 200ms between retries
    });
    // Health check - verify Redis cluster is available
    const isHealthy = await lock.healthCheck();
    if (!isHealthy) {
        console.error('Redis cluster is not healthy, exiting...');
        process.exit(1);
    }
    // Try to acquire lock
    const lockHandle = await lock.acquire('pricing-oracle-keeper', 30000);
    if (!lockHandle) {
        console.log('Another keeper is running, exiting...');
        await lock.close();
        process.exit(0);
    }
    console.log('Lock acquired successfully, starting keeper...');
    // Set up keep-alive mechanism to extend lock before it expires
    // Extend every 15 seconds (half the TTL to be safe)
    const keepAliveInterval = setInterval(async () => {
        try {
            await lock.extend(lockHandle, 30000);
            console.log('Lock extended successfully');
        }
        catch (error) {
            console.error('Failed to extend lock, keeper may lose coordination:', error);
            // In production, you might want to gracefully shut down if extension fails
        }
    }, 15000);
    // Graceful shutdown handler
    const shutdown = async (signal) => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        clearInterval(keepAliveInterval);
        try {
            await lock.release(lockHandle);
            console.log('Lock released successfully');
        }
        catch (error) {
            console.error('Error releasing lock:', error);
        }
        await lock.close();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    try {
        // Initialize and start keeper
        // const keeper = new PricingOracleKeeper({
        //   ton_client_config: {
        //     endpoint: process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
        //     api_key: process.env.TON_API_KEY,
        //   },
        //   oracle_contract_address: process.env.ORACLE_ADDRESS || '',
        //   keeper_wallet_mnemonic: process.env.KEEPER_MNEMONIC || '',
        //   update_interval_ms: 60000, // 1 minute
        //   price_deviation_threshold: 0.01, // 1%
        // });
        // await keeper.start();
        // For this example, just simulate keeper work
        console.log('Keeper is running (simulated)...');
        console.log('Press Ctrl+C to stop');
        // Keep process alive
        await new Promise(() => { });
    }
    catch (error) {
        console.error('Keeper error:', error);
    }
    finally {
        // Cleanup
        clearInterval(keepAliveInterval);
        try {
            await lock.release(lockHandle);
        }
        catch (error) {
            console.error('Error during cleanup:', error);
        }
        await lock.close();
    }
}
// Run if executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
