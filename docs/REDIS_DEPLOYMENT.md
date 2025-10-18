# Redis Distributed Lock Deployment Guide

This guide covers the deployment and usage of the Redis cluster for distributed locking in the Tonsurance keeper system.

## Overview

The Redis cluster provides distributed locking capabilities using the RedLock algorithm to ensure only one keeper instance runs at a time across multiple deployments.

**Key Features:**
- 3-node Redis cluster for fault tolerance
- Automatic lock expiration (30 seconds TTL)
- Lock extension (keep-alive) mechanism
- Health monitoring
- Graceful shutdown handling

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Redis Node 1  │     │   Redis Node 2  │     │   Redis Node 3  │
│   Port: 6379    │     │   Port: 6380    │     │   Port: 6381    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │   RedLock   │
                          │  Algorithm  │
                          └──────┬──────┘
                                 │
                          ┌──────▼──────┐
                          │   Keeper    │
                          │  Instance   │
                          └─────────────┘
```

## Prerequisites

- Docker and Docker Compose installed
- Redis CLI installed (for health checks)
- Node.js and npm/yarn (for running keepers)

## Quick Start

### 1. Start the Redis Cluster

```bash
# From the project root
docker-compose -f infra/docker/docker-compose.redis.yml up -d
```

This will start three Redis nodes:
- Node 1: `localhost:6379`
- Node 2: `localhost:6380`
- Node 3: `localhost:6381`

### 2. Verify Cluster Health

```bash
# Run the health check script
./scripts/check-redis-cluster.sh
```

Expected output:
```
=======================================
Checking Redis cluster health...
=======================================

Checking Redis node on port 6379... UP
Checking Redis node on port 6380... UP
Checking Redis node on port 6381... UP

=======================================
Health Check Summary
=======================================
Healthy nodes: 3 / 3
Status: ALL NODES HEALTHY

Cluster is ready for distributed locking!
```

### 3. Install Dependencies

```bash
# Install required npm packages
npm install ioredis redlock
# or
yarn add ioredis redlock
```

### 4. Test Distributed Lock

Create a test script to verify locking works:

```typescript
// test-lock.ts
import { DistributedLock } from './services/lib/distributed_lock';

async function testLock() {
  const lock = new DistributedLock({
    redis_nodes: ['localhost:6379', 'localhost:6380', 'localhost:6381'],
    lock_ttl_ms: 10000,
    retry_count: 3,
    retry_delay_ms: 200,
  });

  // Health check
  await lock.healthCheck();

  // Acquire lock
  const lockHandle = await lock.acquire('test-lock', 10000);
  if (lockHandle) {
    console.log('Lock acquired!');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Release lock
    await lock.release(lockHandle);
    console.log('Lock released!');
  }

  await lock.close();
}

testLock();
```

Run the test:
```bash
npx ts-node test-lock.ts
```

## Running Keepers with Distributed Locks

### Basic Usage

```typescript
import { DistributedLock } from './services/lib/distributed_lock';
import { PricingOracleKeeper } from './services/PricingOracleKeeper';

async function main() {
  const lock = new DistributedLock({
    redis_nodes: ['localhost:6379', 'localhost:6380', 'localhost:6381'],
    lock_ttl_ms: 30000,
    retry_count: 3,
    retry_delay_ms: 200,
  });

  // Try to acquire lock
  const lockHandle = await lock.acquire('pricing-oracle-keeper');

  if (!lockHandle) {
    console.log('Another keeper is running');
    process.exit(0);
  }

  // Keep-alive: extend lock every 15 seconds
  const keepAlive = setInterval(async () => {
    await lock.extend(lockHandle, 30000);
  }, 15000);

  try {
    const keeper = new PricingOracleKeeper({/* config */});
    await keeper.start();
  } finally {
    clearInterval(keepAlive);
    await lock.release(lockHandle);
    await lock.close();
  }
}

main();
```

### Run Example

```bash
# Run the keeper with lock example
npx ts-node services/examples/keeper_with_lock.ts
```

### Test Multiple Instances

Open two terminals and run the keeper in both:

**Terminal 1:**
```bash
npx ts-node services/examples/keeper_with_lock.ts
```

**Terminal 2:**
```bash
npx ts-node services/examples/keeper_with_lock.ts
```

You should see:
- Terminal 1: "Lock acquired successfully, starting keeper..."
- Terminal 2: "Another keeper is running, exiting..."

## Configuration

### Lock TTL (Time To Live)

The lock TTL determines how long a lock remains valid before auto-expiring:

```typescript
lock_ttl_ms: 30000  // 30 seconds
```

**Recommendations:**
- Development: 10-30 seconds
- Production: 30-60 seconds
- Adjust based on your keeper's update interval

### Keep-Alive Interval

Extend the lock before it expires:

```typescript
// Extend every 15 seconds (half the TTL)
setInterval(async () => {
  await lock.extend(lockHandle, 30000);
}, 15000);
```

**Best Practice:** Set keep-alive interval to 50% of TTL

### Retry Configuration

Control how aggressively to retry lock acquisition:

```typescript
retry_count: 3,          // Number of retries
retry_delay_ms: 200,     // Delay between retries
```

## Monitoring

### Check Running Containers

```bash
docker-compose -f infra/docker/docker-compose.redis.yml ps
```

### View Container Logs

```bash
# View logs for specific node
docker logs tonsurance-redis-1
docker logs tonsurance-redis-2
docker logs tonsurance-redis-3

# Follow logs in real-time
docker logs -f tonsurance-redis-1
```

### Check Redis Memory Usage

```bash
redis-cli -p 6379 INFO memory
```

### Monitor Lock Activity

```bash
# Connect to Redis CLI
redis-cli -p 6379

# List all keys (locks)
KEYS *

# Get TTL of a lock
TTL redlock:pricing-oracle-keeper

# Get lock value
GET redlock:pricing-oracle-keeper
```

## Troubleshooting

### Problem: Health check fails

**Symptoms:**
```
Checking Redis node on port 6379... DOWN
```

**Solutions:**

1. Check if containers are running:
```bash
docker-compose -f infra/docker/docker-compose.redis.yml ps
```

2. Check if ports are in use:
```bash
lsof -i :6379
lsof -i :6380
lsof -i :6381
```

3. Restart the cluster:
```bash
docker-compose -f infra/docker/docker-compose.redis.yml down
docker-compose -f infra/docker/docker-compose.redis.yml up -d
```

### Problem: Lock acquisition always fails

**Symptoms:**
```
Failed to acquire lock for resource: pricing-oracle-keeper
```

**Solutions:**

1. Check if lock is stuck:
```bash
redis-cli -p 6379 KEYS "redlock:*"
redis-cli -p 6379 TTL redlock:pricing-oracle-keeper
```

2. If TTL is -1 (no expiry), manually delete:
```bash
redis-cli -p 6379 DEL redlock:pricing-oracle-keeper
```

3. Check if another keeper is holding the lock:
```bash
# Check lock value (contains unique identifier)
redis-cli -p 6379 GET redlock:pricing-oracle-keeper
```

### Problem: Lock extends but keeper crashes

**Symptoms:** Lock remains held even after keeper process dies

**Solution:** This is expected behavior. Lock will auto-expire after TTL. To speed up recovery, reduce the TTL or manually delete the lock:

```bash
redis-cli -p 6379 DEL redlock:pricing-oracle-keeper
```

### Problem: Multiple keepers are running

**Symptoms:** Both keeper instances claim to have the lock

**Investigation:**

1. Check Redis cluster health:
```bash
./scripts/check-redis-cluster.sh
```

2. Verify clock synchronization:
```bash
# Redlock requires synchronized clocks
date
```

3. Check network connectivity between nodes

**Solution:** Ensure all 3 Redis nodes are healthy and accessible. The RedLock algorithm requires majority (2/3) to acquire a lock.

### Problem: Connection refused

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solutions:**

1. Start Redis cluster:
```bash
docker-compose -f infra/docker/docker-compose.redis.yml up -d
```

2. Check firewall rules

3. Verify network configuration in Docker Compose

## Maintenance

### Backup Redis Data

```bash
# Redis uses AOF (Append Only File) for persistence
# Backup volumes
docker run --rm -v tonsurance_redis-1-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-1-backup.tar.gz /data
```

### Clear All Locks (Development Only)

```bash
# WARNING: This will delete ALL keys in Redis
redis-cli -p 6379 FLUSHALL
redis-cli -p 6380 FLUSHALL
redis-cli -p 6381 FLUSHALL
```

### Stop the Cluster

```bash
# Stop containers
docker-compose -f infra/docker/docker-compose.redis.yml down

# Stop and remove volumes (delete all data)
docker-compose -f infra/docker/docker-compose.redis.yml down -v
```

### Restart a Single Node

```bash
docker restart tonsurance-redis-1
```

## Production Considerations

### High Availability

For production deployments:

1. **Use Redis Sentinel** or **Redis Cluster** mode for automatic failover
2. **Deploy across multiple availability zones**
3. **Monitor node health** with automated alerts
4. **Set up replication** for data durability

### Security

1. **Enable authentication:**
```yaml
command: redis-server --requirepass your-strong-password
```

2. **Use TLS/SSL** for network encryption
3. **Restrict network access** to keeper nodes only
4. **Regular security updates** of Redis Docker images

### Performance Tuning

1. **Adjust TTL** based on keeper update frequency
2. **Monitor memory usage** and set `maxmemory` policies
3. **Enable persistence** (AOF or RDB) based on durability needs
4. **Benchmark** lock acquisition latency

### Logging

Set up centralized logging:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## API Reference

### DistributedLock Class

#### Constructor
```typescript
constructor(config: LockConfig)
```

#### Methods

**acquire(resource: string, ttl_ms?: number): Promise<Redlock.Lock | null>**
- Acquires a distributed lock
- Returns lock handle or null if failed

**release(lock: Redlock.Lock): Promise<void>**
- Releases the lock
- Throws error if release fails

**extend(lock: Redlock.Lock, ttl_ms: number): Promise<void>**
- Extends lock TTL
- Throws error if extension fails

**healthCheck(): Promise<boolean>**
- Checks if all Redis nodes are healthy
- Returns true if all nodes respond to PING

**close(): Promise<void>**
- Closes all Redis connections
- Call before process exit

## Support

For issues or questions:
1. Check this documentation
2. Review container logs
3. Run health check script
4. Check Redis CLI for lock status

## Additional Resources

- [Redlock Algorithm](https://redis.io/docs/reference/patterns/distributed-locks/)
- [Redis Cluster Tutorial](https://redis.io/docs/management/scaling/)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redlock NPM Package](https://github.com/mike-marcacci/node-redlock)
