import { Lock } from 'redlock';
export interface LockConfig {
    redis_nodes: string[];
    lock_ttl_ms: number;
    retry_count: number;
    retry_delay_ms: number;
}
export declare class DistributedLock {
    private redlock;
    private redisClients;
    private config;
    constructor(config: LockConfig);
    /**
     * Acquire lock with retry
     * @param resource - Lock name (e.g., "pricing-oracle-keeper")
     * @param ttl_ms - Time to live in milliseconds (defaults to config.lock_ttl_ms)
     * @returns Lock handle or null if failed
     */
    acquire(resource: string, ttl_ms?: number): Promise<Lock | null>;
    /**
     * Release lock
     * @param lock - Lock handle from acquire()
     */
    release(lock: Lock): Promise<void>;
    /**
     * Extend lock TTL (keep-alive)
     * @param lock - Current lock
     * @param ttl_ms - Additional time
     */
    extend(lock: Lock, ttl_ms: number): Promise<void>;
    /**
     * Health check - can we connect to Redis?
     */
    healthCheck(): Promise<boolean>;
    /**
     * Close all Redis connections
     */
    close(): Promise<void>;
}
