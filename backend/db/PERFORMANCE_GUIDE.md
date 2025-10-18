# PostgreSQL Performance Guide for Tonsurance

## Table of Contents
1. [Index Strategy](#index-strategy)
2. [Query Optimization](#query-optimization)
3. [Connection Pooling](#connection-pooling)
4. [EXPLAIN ANALYZE Usage](#explain-analyze-usage)
5. [Monitoring Slow Queries](#monitoring-slow-queries)
6. [Database Maintenance](#database-maintenance)
7. [Configuration Tuning](#configuration-tuning)
8. [Scaling Strategies](#scaling-strategies)

---

## Index Strategy

### When to Add an Index

**Add an index if:**
- ✅ Column is frequently used in `WHERE` clauses
- ✅ Column is used in `JOIN` conditions
- ✅ Column is used in `ORDER BY` or `GROUP BY`
- ✅ Table has > 1000 rows and growing
- ✅ Sequential scans are slow (> 100ms)

**Don't add an index if:**
- ❌ Table has < 1000 rows
- ❌ Column has low cardinality (< 10 unique values)
- ❌ Table has heavy write traffic (indices slow down INSERTs/UPDATEs)
- ❌ Column is rarely queried

### Index Types

#### 1. B-tree Index (Default)
Best for equality and range queries.

```sql
-- Standard B-tree index
CREATE INDEX idx_policies_user ON policies(user_address);

-- Query patterns this optimizes:
SELECT * FROM policies WHERE user_address = 'UQAbc...';
SELECT * FROM policies WHERE user_address IN ('UQAbc...', 'UQDef...');
```

#### 2. Partial Index
Indexes only a subset of rows, reducing index size.

```sql
-- Only index active policies (reduces index size by ~80%)
CREATE INDEX idx_policies_active ON policies(status)
  WHERE active = true;

-- Query patterns this optimizes:
SELECT * FROM policies WHERE active = true AND status = 'active';
```

#### 3. Composite Index (Multi-column)
Optimizes queries filtering on multiple columns.

```sql
-- Order matters! Most selective column first
CREATE INDEX idx_policies_composite ON policies(
  coverage_type,    -- Most selective (5 types)
  chain_id,         -- Moderately selective (8 chains)
  stablecoin_id     -- Less selective (14 coins)
);

-- Query patterns this optimizes:
SELECT * FROM policies WHERE coverage_type = 0 AND chain_id = 1 AND stablecoin_id = 0;
SELECT * FROM policies WHERE coverage_type = 0 AND chain_id = 1;  -- Also works!
SELECT * FROM policies WHERE coverage_type = 0;                    -- Also works!
```

**⚠️ Column order matters:**
- PostgreSQL can use composite indices for left-prefix queries
- `(A, B, C)` index can optimize queries on `A`, `A,B`, or `A,B,C`
- But NOT queries on just `B` or `C` alone

#### 4. GIN Index (JSONB)
For JSONB columns with nested queries.

```sql
-- GIN index for JSONB metadata
CREATE INDEX idx_blockchain_events_metadata ON blockchain_events USING GIN(metadata);

-- Query patterns this optimizes:
SELECT * FROM blockchain_events WHERE metadata @> '{"coverage_type": 0}';
SELECT * FROM blockchain_events WHERE metadata ? 'policy_id';
```

#### 5. Expression Index
Indexes computed values.

```sql
-- Index on computed column
CREATE INDEX idx_policies_premium_rate ON policies(
  (premium_paid::FLOAT / coverage_amount)
);

-- Query patterns this optimizes:
SELECT * FROM policies WHERE (premium_paid::FLOAT / coverage_amount) > 0.01;
```

### Index Maintenance

#### VACUUM ANALYZE
Updates table statistics and reclaims dead tuple space.

```sql
-- Full vacuum (reclaims space)
VACUUM ANALYZE policies;

-- Auto-vacuum should handle this, but run manually if:
-- - Dead tuple ratio > 20%
-- - After bulk DELETE/UPDATE operations
-- - Query planner is using bad plans
```

#### REINDEX
Rebuilds indices to remove bloat and improve performance.

```sql
-- Rebuild index without locking table (PostgreSQL 12+)
REINDEX INDEX CONCURRENTLY idx_policies_user_address;

-- Rebuild all indices on a table
REINDEX TABLE CONCURRENTLY policies;

-- Run REINDEX if:
-- - Index bloat > 50%
-- - Query performance degrades over time
-- - After major data changes
```

#### Monitoring Index Health

```sql
-- Check index usage
SELECT * FROM v_index_usage_stats
WHERE usage_level = 'UNUSED';

-- Check index bloat
SELECT * FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = 'public';

-- Drop unused index
DROP INDEX CONCURRENTLY idx_unused_index;
```

---

## Query Optimization

### 1. Avoid SELECT *

**Bad:**
```sql
SELECT * FROM policies WHERE user_address = 'UQAbc...';
```

**Good:**
```sql
SELECT policy_id, coverage_amount, premium_paid, status
FROM policies
WHERE user_address = 'UQAbc...';
```

**Why:** Fetching unused columns wastes I/O, network bandwidth, and application memory.

### 2. Use LIMIT for Large Result Sets

**Bad:**
```sql
SELECT * FROM policies ORDER BY created_at DESC;
```

**Good:**
```sql
SELECT * FROM policies
ORDER BY created_at DESC
LIMIT 100 OFFSET 0;
```

**Why:** Avoids loading millions of rows into memory.

### 3. Avoid OR Conditions (Use UNION or IN)

**Bad:**
```sql
SELECT * FROM policies
WHERE user_address = 'UQAbc...'
   OR user_address = 'UQDef...';
```

**Better:**
```sql
SELECT * FROM policies
WHERE user_address IN ('UQAbc...', 'UQDef...');
```

**Best (if different columns):**
```sql
SELECT * FROM policies WHERE user_address = 'UQAbc...'
UNION ALL
SELECT * FROM policies WHERE user_address = 'UQDef...';
```

### 4. Use Exists Instead of Count

**Bad:**
```sql
SELECT COUNT(*) > 0 FROM claims WHERE policy_id = 123;
```

**Good:**
```sql
SELECT EXISTS(SELECT 1 FROM claims WHERE policy_id = 123);
```

**Why:** `EXISTS` stops scanning after finding the first match.

### 5. Avoid Functions on Indexed Columns

**Bad:**
```sql
SELECT * FROM policies
WHERE LOWER(user_address) = 'uqabc...';
```

**Good:**
```sql
-- Create expression index
CREATE INDEX idx_policies_user_lower ON policies(LOWER(user_address));

-- Then query:
SELECT * FROM policies WHERE LOWER(user_address) = 'uqabc...';
```

**Or better (avoid function entirely):**
```sql
SELECT * FROM policies WHERE user_address = 'UQAbc...';
```

### 6. Use JOIN Instead of Subqueries

**Bad:**
```sql
SELECT *
FROM policies p
WHERE p.policy_id IN (
  SELECT policy_id FROM claims WHERE status = 'approved'
);
```

**Good:**
```sql
SELECT p.*
FROM policies p
INNER JOIN claims c ON p.policy_id = c.policy_id
WHERE c.status = 'approved';
```

### 7. Batch INSERTs

**Bad:**
```sql
INSERT INTO policies (user_address, amount) VALUES ('UQAbc...', 10000);
INSERT INTO policies (user_address, amount) VALUES ('UQDef...', 20000);
INSERT INTO policies (user_address, amount) VALUES ('UQGhi...', 30000);
-- 1000 separate INSERT statements
```

**Good:**
```sql
INSERT INTO policies (user_address, amount) VALUES
  ('UQAbc...', 10000),
  ('UQDef...', 20000),
  ('UQGhi...', 30000);
  -- Up to 1000 rows in a single statement
```

**Why:** Reduces transaction overhead by 1000x.

### 8. Use Prepared Statements

**Bad (using string interpolation):**
```javascript
const userId = 'UQAbc...';
const query = `SELECT * FROM policies WHERE user_address = '${userId}'`;
db.query(query);  // Vulnerable to SQL injection + no query plan caching
```

**Good:**
```javascript
const query = 'SELECT * FROM policies WHERE user_address = $1';
db.query(query, [userId]);  // Safe + query plan is cached
```

---

## Connection Pooling

### Why Connection Pooling?

PostgreSQL creates a new process for each connection (~10MB memory overhead per connection). Without pooling:
- ❌ Each HTTP request creates a new DB connection
- ❌ Connection setup takes 10-50ms
- ❌ Max connections exhausted under load (default: 100)

With pooling:
- ✅ Connections reused across requests
- ✅ Near-zero connection overhead
- ✅ Handles 1000s of concurrent requests

### Configuration (Node.js with pg)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'tonsurance',
  user: 'tonsurance_user',
  password: process.env.DB_PASSWORD,

  // Connection pool settings
  max: 20,              // Max connections in pool
  min: 5,               // Minimum idle connections
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 2000,  // Fail if can't connect in 2s

  // Statement timeout (prevent runaway queries)
  statement_timeout: 30000,  // 30 seconds

  // Connection health checks
  allowExitOnIdle: true,
});

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end().then(() => console.log('Pool closed'));
});
```

### Recommended Pool Sizes

| Scenario | Max Pool Size | Min Pool Size |
|----------|--------------|--------------|
| Development | 5 | 2 |
| Staging | 20 | 5 |
| Production (single server) | 50 | 10 |
| Production (multiple servers) | 20 per server | 5 per server |

**Formula:** `max_connections = (max_pool_size × num_app_servers) + admin_connections`

**Example:** 3 app servers × 20 pool size + 10 admin = 70 total connections needed

### PostgreSQL Configuration

Edit `postgresql.conf`:

```ini
# Maximum number of connections
max_connections = 100

# Connection pooling with PgBouncer (recommended)
# Install PgBouncer and set:
# max_client_conn = 1000  (application connections)
# default_pool_size = 20  (per database)
```

---

## EXPLAIN ANALYZE Usage

### Basic Usage

```sql
EXPLAIN ANALYZE
SELECT * FROM policies
WHERE user_address = 'UQAbc...';
```

**Output:**
```
Index Scan using idx_policies_user_address on policies  (cost=0.42..8.44 rows=1 width=123) (actual time=0.015..0.016 rows=1 loops=1)
  Index Cond: (user_address = 'UQAbc...'::text)
Planning Time: 0.082 ms
Execution Time: 0.031 ms
```

### Reading EXPLAIN Output

#### Key Metrics

1. **Cost**: Estimated cost (arbitrary units)
   - `cost=0.42..8.44` means startup cost = 0.42, total cost = 8.44
   - Lower is better

2. **Rows**: Estimated vs actual rows
   - `rows=1` (estimated) vs `actual ... rows=1`
   - Large mismatch → outdated statistics (run `ANALYZE`)

3. **Width**: Average row size in bytes
   - `width=123` means 123 bytes per row

4. **Time**: Actual execution time
   - `actual time=0.015..0.016 ms`
   - This is the real performance metric

5. **Loops**: Number of times node was executed
   - `loops=1` is good
   - `loops=1000` means nested loop (may be slow)

#### Scan Types (Best to Worst)

1. **Index Scan** ✅ (Best)
   ```
   Index Scan using idx_policies_user on policies
   ```
   Uses index to find specific rows. O(log n) time.

2. **Index Only Scan** ✅ (Best for covering indices)
   ```
   Index Only Scan using idx_policies_composite on policies
   ```
   Reads data directly from index without touching table.

3. **Bitmap Index Scan** ⚡ (Good for OR conditions)
   ```
   Bitmap Heap Scan on policies
     -> Bitmap Index Scan on idx_policies_user
   ```
   Scans index first, then fetches matching rows.

4. **Sequential Scan** ⚠️ (Slow for large tables)
   ```
   Seq Scan on policies  (cost=0.00..10832.40 rows=500000 width=123)
   ```
   Scans entire table. O(n) time. Add an index!

### Advanced EXPLAIN Options

```sql
-- Show buffer usage (I/O statistics)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM policies WHERE user_address = 'UQAbc...';

-- Show JSON output (easier to parse programmatically)
EXPLAIN (ANALYZE, FORMAT JSON)
SELECT * FROM policies WHERE user_address = 'UQAbc...';

-- Show query planning time
EXPLAIN (ANALYZE, VERBOSE, TIMING)
SELECT * FROM policies WHERE user_address = 'UQAbc...';
```

### Optimization Examples

#### Example 1: Missing Index

**Query:**
```sql
EXPLAIN ANALYZE
SELECT * FROM policies WHERE coverage_type = 0;
```

**Bad Output:**
```
Seq Scan on policies  (cost=0.00..18532.00 rows=50000 width=123) (actual time=0.015..421.832 rows=50000 loops=1)
  Filter: (coverage_type = 0)
  Rows Removed by Filter: 450000
Planning Time: 0.102 ms
Execution Time: 423.184 ms
```

**Problem:** Sequential scan on 500k rows, 423ms execution time.

**Solution:** Add index
```sql
CREATE INDEX idx_policies_coverage_type ON policies(coverage_type);
```

**Good Output:**
```
Index Scan using idx_policies_coverage_type on policies  (cost=0.42..1842.95 rows=50000 width=123) (actual time=0.018..12.443 rows=50000 loops=1)
  Index Cond: (coverage_type = 0)
Planning Time: 0.081 ms
Execution Time: 14.223 ms
```

**Result:** 423ms → 14ms (30x faster)

#### Example 2: Outdated Statistics

**Query:**
```sql
EXPLAIN ANALYZE
SELECT * FROM policies WHERE user_address = 'UQAbc...';
```

**Bad Output:**
```
Index Scan using idx_policies_user on policies  (cost=0.42..8.44 rows=100 width=123) (actual time=0.015..142.832 rows=50000 loops=1)
```

**Problem:** Estimated 100 rows, actually returned 50k rows. Query planner chose wrong plan.

**Solution:** Update statistics
```sql
ANALYZE policies;
```

#### Example 3: Inefficient JOIN

**Query:**
```sql
EXPLAIN ANALYZE
SELECT p.*, c.*
FROM policies p
LEFT JOIN claims c ON p.policy_id = c.policy_id;
```

**Bad Output:**
```
Nested Loop Left Join  (cost=0.42..500000.00 rows=100000 width=246) (actual time=0.023..8234.442 rows=100000 loops=1)
  -> Seq Scan on policies p  (cost=0.00..18532.00 rows=100000 width=123)
  -> Index Scan using idx_claims_policy on claims c  (cost=0.42..4.81 rows=1 width=123) (actual time=0.002..0.003 rows=1 loops=100000)
```

**Problem:** Nested loop with 100k iterations. Slow sequential scan on policies.

**Solution:** Add index on policies, rewrite query
```sql
CREATE INDEX idx_policies_id ON policies(policy_id);

-- Better: Only fetch what you need
SELECT p.policy_id, p.user_address, c.claim_id, c.status
FROM policies p
LEFT JOIN claims c ON p.policy_id = c.policy_id
WHERE p.active = true;  -- Filter reduces rows
```

---

## Monitoring Slow Queries

### Enable pg_stat_statements

```sql
-- Add to postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000

-- Restart PostgreSQL, then:
CREATE EXTENSION pg_stat_statements;
```

### Query pg_stat_statements

```sql
-- Top 20 slowest queries by average time
SELECT
  query,
  calls,
  mean_exec_time / 1000 as avg_seconds,
  total_exec_time / 1000 as total_seconds
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Most frequently executed queries
SELECT
  query,
  calls,
  mean_exec_time as avg_ms
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;

-- Reset statistics (after optimization)
SELECT pg_stat_statements_reset();
```

### Logging Slow Queries

Edit `postgresql.conf`:

```ini
# Log queries slower than 100ms
log_min_duration_statement = 100

# Log file rotation
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB

# What to log
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_statement = 'none'  # Don't log all statements, just slow ones
```

Tail logs:
```bash
tail -f /var/log/postgresql/postgresql-2025-10-16.log | grep "duration"
```

---

## Database Maintenance

### Daily Maintenance

```bash
#!/bin/bash
# Run at 3 AM daily (low traffic period)

# Update table statistics
psql -U tonsurance_user -d tonsurance -c "ANALYZE policies;"
psql -U tonsurance_user -d tonsurance -c "ANALYZE claims;"
psql -U tonsurance_user -d tonsurance -c "ANALYZE escrows;"
```

### Weekly Maintenance

```bash
#!/bin/bash
# Run Sunday at 2 AM

# VACUUM to reclaim space
psql -U tonsurance_user -d tonsurance -c "VACUUM ANALYZE policies;"
psql -U tonsurance_user -d tonsurance -c "VACUUM ANALYZE claims;"
psql -U tonsurance_user -d tonsurance -c "VACUUM ANALYZE pricing_oracle_updates;"

# Check index health
psql -U tonsurance_user -d tonsurance -f /path/to/backend/db/monitoring_queries.sql
```

### Monthly Maintenance

```bash
#!/bin/bash
# Run first Sunday of month at 1 AM

# REINDEX to reduce bloat (use CONCURRENTLY to avoid locks)
psql -U tonsurance_user -d tonsurance -c "REINDEX INDEX CONCURRENTLY idx_policies_user_address;"
psql -U tonsurance_user -d tonsurance -c "REINDEX INDEX CONCURRENTLY idx_claims_policy;"

# VACUUM FULL (requires downtime, reclaims max space)
# psql -U tonsurance_user -d tonsurance -c "VACUUM FULL policies;"
```

### Automating with Cron

```bash
# Edit crontab
crontab -e

# Daily ANALYZE at 3 AM
0 3 * * * /path/to/daily_maintenance.sh >> /var/log/db_maintenance.log 2>&1

# Weekly VACUUM at 2 AM on Sunday
0 2 * * 0 /path/to/weekly_maintenance.sh >> /var/log/db_maintenance.log 2>&1

# Monthly REINDEX at 1 AM on first Sunday
0 1 1-7 * 0 /path/to/monthly_maintenance.sh >> /var/log/db_maintenance.log 2>&1
```

---

## Configuration Tuning

### PostgreSQL Configuration (`postgresql.conf`)

```ini
# ===========================
# MEMORY SETTINGS
# ===========================

# Shared buffers: 25% of system RAM (for dedicated DB server)
# Example: 16GB RAM → 4GB shared_buffers
shared_buffers = 4GB

# Effective cache size: 50-75% of system RAM
# This tells PostgreSQL how much RAM is available for disk caching
effective_cache_size = 12GB

# Work memory: RAM per query operation (sort, hash)
# Formula: (Total RAM - shared_buffers) / max_connections / 2
# Example: (16GB - 4GB) / 100 / 2 = 60MB
work_mem = 64MB

# Maintenance work memory: For VACUUM, CREATE INDEX
maintenance_work_mem = 1GB

# ===========================
# QUERY PLANNING
# ===========================

# Cost-based optimizer settings
random_page_cost = 1.1          # Lower for SSD (default: 4.0)
effective_io_concurrency = 200  # Higher for SSD (default: 1)
default_statistics_target = 100 # Higher = better query plans, slower ANALYZE

# ===========================
# WRITE-AHEAD LOG (WAL)
# ===========================

# WAL settings for durability vs performance
wal_buffers = 16MB
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB

# Synchronous commit (trade durability for speed)
synchronous_commit = on  # Use 'off' for 10x write speed (risk: lose last few transactions on crash)

# ===========================
# LOGGING
# ===========================

# Log slow queries
log_min_duration_statement = 100  # Log queries > 100ms
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a '
log_statement = 'none'
log_duration = off

# ===========================
# AUTOVACUUM
# ===========================

# Autovacuum settings (automatic VACUUM)
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 10s  # Check every 10 seconds

# Trigger autovacuum when 10% of table changes
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05

# ===========================
# CONNECTIONS
# ===========================

max_connections = 100  # Use PgBouncer for more connections
```

### Applying Configuration Changes

```bash
# Edit config
sudo nano /etc/postgresql/15/main/postgresql.conf

# Reload without downtime (for most settings)
sudo systemctl reload postgresql

# Full restart required for shared_buffers, max_connections
sudo systemctl restart postgresql
```

---

## Scaling Strategies

### Vertical Scaling (Scale Up)

**When to scale up:**
- Database CPU consistently > 70%
- Memory swapping (check `free -h`)
- Slow queries despite optimization

**Hardware recommendations:**

| Scenario | CPU | RAM | Storage |
|----------|-----|-----|---------|
| Development | 2 cores | 4 GB | 50 GB SSD |
| Staging | 4 cores | 16 GB | 200 GB SSD |
| Production (1-10k users) | 8 cores | 32 GB | 500 GB NVMe SSD |
| Production (10k-100k users) | 16 cores | 64 GB | 1 TB NVMe SSD |
| Production (100k+ users) | 32 cores | 128 GB | 2 TB NVMe SSD (RAID 10) |

### Horizontal Scaling (Scale Out)

#### 1. Read Replicas

Offload read traffic to replicas.

```
Master (writes)
  ├─ Replica 1 (reads)
  ├─ Replica 2 (reads)
  └─ Replica 3 (reads)
```

**Setup with Streaming Replication:**

```bash
# On master
# Edit postgresql.conf
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10

# Create replication user
psql -U postgres -c "CREATE USER replicator REPLICATION LOGIN ENCRYPTED PASSWORD 'strong_password';"

# On replica
# Stop PostgreSQL
pg_basebackup -h master_ip -D /var/lib/postgresql/15/main -U replicator -P -v

# Create standby.signal file
touch /var/lib/postgresql/15/main/standby.signal

# Edit postgresql.auto.conf
primary_conninfo = 'host=master_ip port=5432 user=replicator password=strong_password'

# Start replica
systemctl start postgresql
```

**Application changes:**

```javascript
const masterPool = new Pool({ host: 'master.db.com', ...config });
const replicaPool = new Pool({ host: 'replica.db.com', ...config });

// Writes go to master
app.post('/api/policies', async (req, res) => {
  await masterPool.query('INSERT INTO policies ...');
});

// Reads go to replica
app.get('/api/policies', async (req, res) => {
  const result = await replicaPool.query('SELECT * FROM policies ...');
});
```

#### 2. Connection Pooling (PgBouncer)

Handles 10,000+ connections with only 50 database connections.

```bash
# Install PgBouncer
sudo apt install pgbouncer

# Edit /etc/pgbouncer/pgbouncer.ini
[databases]
tonsurance = host=localhost port=5432 dbname=tonsurance

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction  # Or 'session' for compatibility
max_client_conn = 10000
default_pool_size = 50

# Start PgBouncer
sudo systemctl start pgbouncer
```

**Application changes:**

```javascript
// Change port from 5432 → 6432
const pool = new Pool({
  host: 'localhost',
  port: 6432,  // PgBouncer port
  database: 'tonsurance',
  user: 'tonsurance_user',
  password: process.env.DB_PASSWORD,
  max: 50,  // Can handle 10k concurrent clients
});
```

#### 3. Partitioning

Split large tables across multiple partitions.

```sql
-- Partition policies table by created_at (monthly)
CREATE TABLE policies_2025_10 PARTITION OF policies
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE policies_2025_11 PARTITION OF policies
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Queries automatically use correct partition
SELECT * FROM policies WHERE created_at >= '2025-10-15';
-- ↑ Only scans policies_2025_10 partition
```

#### 4. Caching Layer (Redis)

Cache frequently accessed data.

```javascript
const redis = require('redis').createClient();

// Cache policy lookups
app.get('/api/policies/:id', async (req, res) => {
  const cacheKey = `policy:${req.params.id}`;

  // Check cache first
  let policy = await redis.get(cacheKey);

  if (!policy) {
    // Cache miss: query database
    const result = await pool.query('SELECT * FROM policies WHERE policy_id = $1', [req.params.id]);
    policy = result.rows[0];

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(policy));
  } else {
    policy = JSON.parse(policy);
  }

  res.json(policy);
});
```

---

## Quick Reference: Performance Checklist

### Before Deploying

- [ ] All frequently queried columns have indices
- [ ] Composite indices use correct column order (most selective first)
- [ ] Partial indices for large tables with filtered queries
- [ ] GIN indices for JSONB columns
- [ ] Connection pooling configured (min=5, max=20)
- [ ] Prepared statements used (not string interpolation)
- [ ] EXPLAIN ANALYZE run on critical queries
- [ ] pg_stat_statements extension enabled
- [ ] Slow query logging enabled (> 100ms)

### Weekly Monitoring

- [ ] Check index usage: `SELECT * FROM v_index_usage_stats;`
- [ ] Check table bloat: Run query #10 from monitoring_queries.sql
- [ ] Check slow queries: `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;`
- [ ] Check cache hit ratio: Should be > 99%
- [ ] Check dead tuple ratio: Should be < 10%

### Monthly Maintenance

- [ ] Run REINDEX on large tables
- [ ] Review and drop unused indices
- [ ] Archive old data (policies > 1 year old)
- [ ] Review pg_stat_statements for new slow queries
- [ ] Update autovacuum settings if needed

---

## Getting Help

### Debugging Slow Queries

1. Run `EXPLAIN ANALYZE` on the query
2. Check if index is being used (look for "Index Scan")
3. If "Seq Scan", add missing index
4. If index exists but not used, run `ANALYZE table_name`
5. If still slow, check table bloat and run `VACUUM`

### Monitoring Resources

- **Grafana + Prometheus:** Real-time metrics
- **pgAdmin:** GUI for PostgreSQL management
- **pg_stat_statements:** Built-in query statistics
- **Datadog / New Relic:** APM with database monitoring

### Community Resources

- PostgreSQL Wiki: https://wiki.postgresql.org/wiki/Performance_Optimization
- Explain.depesz.com: Visual EXPLAIN ANALYZE tool
- PgTune: https://pgtune.leopard.in.ua/ (config generator)
- PostgreSQL Slack: https://postgres-slack.herokuapp.com/

---

**Last Updated:** 2025-10-16
**Maintained By:** Tonsurance Backend Team
