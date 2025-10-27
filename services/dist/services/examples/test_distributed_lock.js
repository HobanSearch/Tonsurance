"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDistributedLock = testDistributedLock;
const distributed_lock_1 = require("../lib/distributed_lock");
/**
 * Simple test script to verify distributed lock functionality
 *
 * This demonstrates:
 * 1. Health check
 * 2. Lock acquisition
 * 3. Lock extension
 * 4. Lock release
 */
async function testDistributedLock() {
    console.log('='.repeat(50));
    console.log('Testing Distributed Lock System');
    console.log('='.repeat(50));
    console.log('');
    // Initialize distributed lock
    const lock = new distributed_lock_1.DistributedLock({
        redis_nodes: [
            'localhost:6379',
            'localhost:6380',
            'localhost:6381',
        ],
        lock_ttl_ms: 10000, // 10 seconds for testing
        retry_count: 3,
        retry_delay_ms: 200,
    });
    try {
        // Step 1: Health Check
        console.log('Step 1: Running health check...');
        const isHealthy = await lock.healthCheck();
        if (!isHealthy) {
            console.error('FAIL: Redis cluster is not healthy');
            process.exit(1);
        }
        console.log('SUCCESS: All Redis nodes are healthy');
        console.log('');
        // Step 2: Acquire Lock
        console.log('Step 2: Acquiring lock...');
        const lockHandle = await lock.acquire('test-lock', 10000);
        if (!lockHandle) {
            console.error('FAIL: Could not acquire lock');
            process.exit(1);
        }
        console.log('SUCCESS: Lock acquired');
        console.log(`Lock resources: ${lockHandle.resources.join(', ')}`);
        console.log('');
        // Step 3: Extend Lock
        console.log('Step 3: Extending lock TTL...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        await lock.extend(lockHandle, 10000);
        console.log('SUCCESS: Lock extended');
        console.log('');
        // Step 4: Release Lock
        console.log('Step 4: Releasing lock...');
        await lock.release(lockHandle);
        console.log('SUCCESS: Lock released');
        console.log('');
        // Step 5: Test Lock Conflict
        console.log('Step 5: Testing lock conflict (acquire two locks simultaneously)...');
        const lock1 = await lock.acquire('conflict-test', 5000);
        const lock2 = await lock.acquire('conflict-test', 5000);
        if (lock1 && !lock2) {
            console.log('SUCCESS: Only one lock acquired (as expected)');
            await lock.release(lock1);
        }
        else if (lock1 && lock2) {
            console.error('FAIL: Two locks acquired for same resource (should not happen)');
            await lock.release(lock1);
            await lock.release(lock2);
            process.exit(1);
        }
        else {
            console.error('FAIL: No locks acquired');
            process.exit(1);
        }
        console.log('');
        // All tests passed
        console.log('='.repeat(50));
        console.log('ALL TESTS PASSED');
        console.log('='.repeat(50));
        console.log('');
        console.log('Distributed lock system is working correctly!');
    }
    catch (error) {
        console.error('ERROR:', error);
        process.exit(1);
    }
    finally {
        await lock.close();
    }
}
// Run the test
if (require.main === module) {
    testDistributedLock().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
