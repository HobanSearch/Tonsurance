# Redis Distributed Lock - Quick Reference

## Quick Start Commands

### Start Redis Cluster
```bash
docker-compose -f infra/docker/docker-compose.redis.yml up -d
```

### Check Cluster Health
```bash
./scripts/check-redis-cluster.sh
```

### Stop Redis Cluster
```bash
docker-compose -f infra/docker/docker-compose.redis.yml down
```

### Stop and Remove All Data
```bash
docker-compose -f infra/docker/docker-compose.redis.yml down -v
```

---

## Package.json Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "redis:start": "docker-compose -f infra/docker/docker-compose.redis.yml up -d",
    "redis:stop": "docker-compose -f infra/docker/docker-compose.redis.yml down",
    "redis:restart": "npm run redis:stop && npm run redis:start",
    "redis:health": "./scripts/check-redis-cluster.sh",
    "redis:logs": "docker-compose -f infra/docker/docker-compose.redis.yml logs -f",
    "test:lock": "ts-node services/examples/test_distributed_lock.ts",
    "keeper:start": "ts-node services/examples/keeper_with_lock.ts"
  }
}
```

Then use:
```bash
npm run redis:start        # Start cluster
npm run redis:health       # Health check
npm run test:lock          # Test distributed lock
npm run keeper:start       # Run keeper with lock
```

---

## NPM Dependencies

Install required packages:

```bash
npm install ioredis redlock
# or
yarn add ioredis redlock
```

Type definitions (if using TypeScript):
```bash
npm install --save-dev @types/ioredis
# or
yarn add --dev @types/ioredis
```

---

## Common Operations

### Check Running Containers
```bash
docker ps | grep redis
```

### View Logs
```bash
# All nodes
docker-compose -f infra/docker/docker-compose.redis.yml logs -f

# Specific node
docker logs -f tonsurance-redis-1
```

### Connect to Redis CLI
```bash
# Node 1
redis-cli -p 6379

# Node 2
redis-cli -p 6380

# Node 3
redis-cli -p 6381
```

### Check Locks in Redis
```bash
# List all locks
redis-cli -p 6379 KEYS "redlock:*"

# Get lock TTL
redis-cli -p 6379 TTL redlock:pricing-oracle-keeper

# Delete a stuck lock
redis-cli -p 6379 DEL redlock:pricing-oracle-keeper
```

---

## Code Examples

### Basic Lock Usage
```typescript
import { DistributedLock } from './services/lib/distributed_lock';

const lock = new DistributedLock({
  redis_nodes: ['localhost:6379', 'localhost:6380', 'localhost:6381'],
  lock_ttl_ms: 30000,
  retry_count: 3,
  retry_delay_ms: 200,
});

// Acquire
const handle = await lock.acquire('my-lock');
if (handle) {
  // Do work
  await lock.release(handle);
}

await lock.close();
```

### With Keep-Alive
```typescript
const handle = await lock.acquire('my-lock', 30000);

if (handle) {
  // Extend every 15 seconds
  const interval = setInterval(async () => {
    await lock.extend(handle, 30000);
  }, 15000);

  try {
    // Do work
  } finally {
    clearInterval(interval);
    await lock.release(handle);
  }
}
```

---

## Troubleshooting

### Problem: Cannot connect to Redis
```bash
# Check if containers are running
docker ps | grep redis

# Start containers if not running
npm run redis:start
```

### Problem: Lock stuck (won't acquire)
```bash
# Check if lock exists
redis-cli -p 6379 KEYS "redlock:*"

# Check TTL (-1 means no expiry, -2 means doesn't exist)
redis-cli -p 6379 TTL redlock:my-lock

# Delete stuck lock
redis-cli -p 6379 DEL redlock:my-lock
```

### Problem: Port already in use
```bash
# Check what's using the port
lsof -i :6379

# Kill the process or change the port in docker-compose.yml
```

---

## Environment Variables

For production, use environment variables:

```bash
# .env file
REDIS_NODES=redis1.example.com:6379,redis2.example.com:6379,redis3.example.com:6379
REDIS_LOCK_TTL_MS=30000
REDIS_RETRY_COUNT=3
REDIS_RETRY_DELAY_MS=200
```

```typescript
// In your code
const lock = new DistributedLock({
  redis_nodes: process.env.REDIS_NODES!.split(','),
  lock_ttl_ms: parseInt(process.env.REDIS_LOCK_TTL_MS || '30000'),
  retry_count: parseInt(process.env.REDIS_RETRY_COUNT || '3'),
  retry_delay_ms: parseInt(process.env.REDIS_RETRY_DELAY_MS || '200'),
});
```

---

## Architecture Overview

```
Keeper Instance A                  Keeper Instance B
       |                                  |
       v                                  v
   Try Acquire Lock              Try Acquire Lock
       |                                  |
       v                                  v
+------+------+------+          +------+------+------+
| R1   | R2   | R3   |          | R1   | R2   | R3   |
+------+------+------+          +------+------+------+
       |                                  |
       v                                  v
  SUCCESS (2/3 nodes)              FAIL (0/3 nodes)
       |                                  |
       v                                  v
  Runs Keeper                    Exits Gracefully
```

Only ONE keeper gets the lock and runs at a time.

---

## Key Metrics to Monitor

1. **Lock Acquisition Rate**: How often locks are acquired successfully
2. **Lock Hold Duration**: How long locks are held
3. **Lock Extension Failures**: Failed keep-alive attempts
4. **Redis Node Health**: PING response times
5. **Lock Conflicts**: How often lock acquisition fails due to conflict

---

## Security Considerations

### Development (Current Setup)
- No authentication
- No encryption
- Local network only

### Production (Recommended)
- Enable Redis AUTH: `--requirepass your-password`
- Use TLS/SSL encryption
- Network isolation (VPC)
- Regular security updates
- Monitoring and alerting

---

## Performance Characteristics

- **Lock Acquisition**: ~10-50ms (3 nodes)
- **Lock Release**: ~10-30ms
- **Lock Extension**: ~10-30ms
- **Network Overhead**: 3x (one request per node)

**RedLock Algorithm Guarantees:**
- Safety: At most one lock holder at any time
- Liveness: Eventually locks are acquired
- Fault Tolerance: Works with N/2+1 nodes available (2 out of 3)

---

## File Locations

| File | Path |
|------|------|
| Docker Compose | `/infra/docker/docker-compose.redis.yml` |
| Lock Implementation | `/services/lib/distributed_lock.ts` |
| Keeper Example | `/services/examples/keeper_with_lock.ts` |
| Test Script | `/services/examples/test_distributed_lock.ts` |
| Health Check | `/scripts/check-redis-cluster.sh` |
| Full Documentation | `/docs/REDIS_DEPLOYMENT.md` |

---

## Support & Resources

- [Full Documentation](./REDIS_DEPLOYMENT.md)
- [RedLock Algorithm](https://redis.io/docs/reference/patterns/distributed-locks/)
- [Redis Documentation](https://redis.io/docs/)
- [ioredis GitHub](https://github.com/redis/ioredis)
- [Redlock NPM](https://github.com/mike-marcacci/node-redlock)
