/**
 * Example of how to integrate distributed locking with a keeper service
 *
 * This ensures only ONE keeper instance runs at a time across multiple deployments.
 * If this process crashes, the lock will auto-expire after TTL, allowing another keeper to take over.
 */
declare function main(): Promise<void>;
export { main };
