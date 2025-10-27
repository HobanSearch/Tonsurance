"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedLock = void 0;
const redlock_1 = __importDefault(require("redlock"));
const ioredis_1 = __importDefault(require("ioredis"));
class DistributedLock {
    constructor(config) {
        this.config = config;
        // Create Redis clients for each node
        this.redisClients = config.redis_nodes.map((nodeAddress) => {
            const [host, port] = nodeAddress.split(':');
            return new ioredis_1.default({
                host: host,
                port: parseInt(port, 10),
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
            });
        });
        // Create Redlock instance with retry settings
        this.redlock = new redlock_1.default(this.redisClients, {
            driftFactor: 0.01,
            retryCount: config.retry_count,
            retryDelay: config.retry_delay_ms,
            retryJitter: 200,
            automaticExtensionThreshold: 500,
        });
        // Listen for errors
        this.redlock.on('error', (error) => {
            console.error('Redlock error:', error);
        });
    }
    /**
     * Acquire lock with retry
     * @param resource - Lock name (e.g., "pricing-oracle-keeper")
     * @param ttl_ms - Time to live in milliseconds (defaults to config.lock_ttl_ms)
     * @returns Lock handle or null if failed
     */
    async acquire(resource, ttl_ms) {
        const lockTTL = ttl_ms || this.config.lock_ttl_ms;
        try {
            const lock = await this.redlock.acquire([resource], lockTTL);
            console.log(`Lock acquired for resource: ${resource}, TTL: ${lockTTL}ms`);
            return lock;
        }
        catch (error) {
            console.error(`Failed to acquire lock for resource: ${resource}`, error);
            return null;
        }
    }
    /**
     * Release lock
     * @param lock - Lock handle from acquire()
     */
    async release(lock) {
        try {
            await lock.release();
            console.log(`Lock released for resources: ${lock.resources.join(', ')}`);
        }
        catch (error) {
            console.error('Failed to release lock:', error);
            throw error;
        }
    }
    /**
     * Extend lock TTL (keep-alive)
     * @param lock - Current lock
     * @param ttl_ms - Additional time
     */
    async extend(lock, ttl_ms) {
        try {
            await lock.extend(ttl_ms);
            console.log(`Lock extended for resources: ${lock.resources.join(', ')}, TTL: ${ttl_ms}ms`);
        }
        catch (error) {
            console.error('Failed to extend lock:', error);
            throw error;
        }
    }
    /**
     * Health check - can we connect to Redis?
     */
    async healthCheck() {
        try {
            const pingPromises = this.redisClients.map(async (client) => {
                const result = await client.ping();
                return result === 'PONG';
            });
            const results = await Promise.all(pingPromises);
            const allHealthy = results.every((r) => r === true);
            if (allHealthy) {
                console.log(`Health check passed: All ${this.redisClients.length} Redis nodes are healthy`);
            }
            else {
                console.error(`Health check failed: Some Redis nodes are not responding`);
            }
            return allHealthy;
        }
        catch (error) {
            console.error('Health check error:', error);
            return false;
        }
    }
    /**
     * Close all Redis connections
     */
    async close() {
        await Promise.all(this.redisClients.map((client) => client.quit()));
        console.log('All Redis connections closed');
    }
}
exports.DistributedLock = DistributedLock;
