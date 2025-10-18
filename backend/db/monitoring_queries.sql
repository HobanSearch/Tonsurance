-- ========================================
-- DATABASE MONITORING QUERIES
-- ========================================
-- Production-ready SQL queries for monitoring database performance,
-- index health, query patterns, and system resources.
--
-- Usage: Copy and paste these queries into psql, pgAdmin, or your monitoring system
-- ========================================

-- ========================================
-- INDEX HEALTH MONITORING
-- ========================================

-- 1. INDEX USAGE STATISTICS
-- Shows which indices are being used and how frequently
-- Look for indices with 0 scans (unused) or very low usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE
    WHEN idx_scan = 0 THEN '⚠️  UNUSED - Consider dropping'
    WHEN idx_scan < 100 THEN '⚡ Low usage'
    WHEN idx_scan < 1000 THEN '✅ Moderate usage'
    ELSE '🔥 High usage'
  END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- 2. UNUSED INDICES (candidates for removal)
-- Indices that have never been scanned but take up disk space
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as wasted_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'  -- Exclude primary keys
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 3. INDEX BLOAT ESTIMATION
-- Identifies indices with significant bloat (fragmentation)
-- Bloat > 50% means REINDEX is recommended
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  pg_size_pretty(pg_relation_size(indexrelid) *
    (100 - pg_stat_all_indexes.idx_tup_fetch::float /
     NULLIF(pg_stat_all_indexes.idx_tup_read, 0) * 100) / 100) as estimated_bloat,
  CASE
    WHEN (100 - pg_stat_all_indexes.idx_tup_fetch::float /
          NULLIF(pg_stat_all_indexes.idx_tup_read, 0) * 100) > 50 THEN '⚠️  High bloat - REINDEX recommended'
    WHEN (100 - pg_stat_all_indexes.idx_tup_fetch::float /
          NULLIF(pg_stat_all_indexes.idx_tup_read, 0) * 100) > 20 THEN '⚡ Moderate bloat'
    ELSE '✅ Healthy'
  END as status
FROM pg_stat_all_indexes
WHERE schemaname = 'public'
  AND idx_tup_read > 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 4. MISSING INDICES (table scan detection)
-- Tables with high sequential scans relative to index scans
-- These tables may benefit from additional indices
SELECT
  schemaname,
  tablename,
  seq_scan as sequential_scans,
  seq_tup_read as rows_read_sequentially,
  idx_scan as index_scans,
  n_live_tup as live_rows,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  CASE
    WHEN seq_scan > 0 AND n_live_tup > 10000 AND seq_scan > idx_scan * 2 THEN '🚨 NEEDS INDEX URGENTLY'
    WHEN seq_scan > 0 AND n_live_tup > 1000 AND seq_scan > idx_scan THEN '⚠️  Consider adding index'
    WHEN seq_scan > idx_scan THEN '⚡ Monitor'
    ELSE '✅ OK'
  END as recommendation
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;

-- ========================================
-- QUERY PERFORMANCE MONITORING
-- ========================================

-- 5. SLOW QUERIES (requires pg_stat_statements extension)
-- Shows the slowest queries by average execution time
-- Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT
  query,
  calls,
  total_exec_time / 1000 as total_seconds,
  mean_exec_time / 1000 as avg_seconds,
  max_exec_time / 1000 as max_seconds,
  stddev_exec_time / 1000 as stddev_seconds,
  rows,
  100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) as cache_hit_ratio
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND mean_exec_time > 100  -- More than 100ms average
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 6. MOST FREQUENTLY EXECUTED QUERIES
-- Queries that run most often (optimization candidates)
SELECT
  query,
  calls,
  total_exec_time / 1000 as total_seconds,
  mean_exec_time as avg_ms,
  100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) as cache_hit_ratio
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY calls DESC
LIMIT 20;

-- 7. QUERIES WITH LOW CACHE HIT RATIO
-- Queries that frequently read from disk (may need more memory or better indices)
SELECT
  query,
  calls,
  shared_blks_hit,
  shared_blks_read,
  100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) as cache_hit_ratio,
  mean_exec_time / 1000 as avg_seconds
FROM pg_stat_statements
WHERE shared_blks_read > 0
  AND calls > 100
ORDER BY cache_hit_ratio ASC
LIMIT 20;

-- ========================================
-- TABLE HEALTH MONITORING
-- ========================================

-- 8. TABLE SIZE AND ROW COUNTS
-- Shows table sizes and row counts for capacity planning
SELECT
  schemaname,
  tablename,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio_pct,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
  CASE
    WHEN n_dead_tup > n_live_tup * 0.2 THEN '⚠️  High dead tuples - Run VACUUM'
    WHEN n_dead_tup > n_live_tup * 0.1 THEN '⚡ Moderate dead tuples'
    ELSE '✅ Healthy'
  END as status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 9. VACUUM STATISTICS
-- Shows when tables were last vacuumed and analyzed
SELECT
  schemaname,
  tablename,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  n_dead_tup,
  n_live_tup,
  CASE
    WHEN last_vacuum IS NULL AND last_autovacuum IS NULL THEN '🚨 NEVER VACUUMED'
    WHEN GREATEST(last_vacuum, last_autovacuum) < NOW() - INTERVAL '7 days' THEN '⚠️  Vacuum overdue'
    ELSE '✅ OK'
  END as vacuum_status,
  CASE
    WHEN last_analyze IS NULL AND last_autoanalyze IS NULL THEN '🚨 NEVER ANALYZED'
    WHEN GREATEST(last_analyze, last_autoanalyze) < NOW() - INTERVAL '7 days' THEN '⚠️  Analyze overdue'
    ELSE '✅ OK'
  END as analyze_status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY GREATEST(last_vacuum, last_autovacuum) ASC NULLS FIRST;

-- 10. TABLE BLOAT ESTIMATION
-- Estimates wasted space in tables due to dead tuples
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  ROUND(100 * n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0), 2) as bloat_pct,
  pg_size_pretty((pg_total_relation_size(schemaname||'.'||tablename) *
    n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0))::BIGINT) as estimated_bloat_size,
  CASE
    WHEN n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0) > 0.3 THEN '🚨 Critical bloat - Run VACUUM FULL'
    WHEN n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0) > 0.15 THEN '⚠️  High bloat - Run VACUUM'
    ELSE '✅ Healthy'
  END as status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 0
ORDER BY n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0) DESC;

-- ========================================
-- DATABASE-LEVEL METRICS
-- ========================================

-- 11. DATABASE SIZE
-- Total database size and growth tracking
SELECT
  pg_database.datname as database_name,
  pg_size_pretty(pg_database_size(pg_database.datname)) as size,
  pg_database_size(pg_database.datname) as size_bytes
FROM pg_database
WHERE datname = current_database();

-- 12. CACHE HIT RATIO
-- Overall cache hit ratio (should be > 99% in production)
SELECT
  sum(heap_blks_read) as heap_read,
  sum(heap_blks_hit) as heap_hit,
  ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as cache_hit_ratio,
  CASE
    WHEN ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) < 95 THEN '⚠️  Low cache hit - Increase shared_buffers'
    WHEN ROUND(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) < 99 THEN '⚡ Moderate cache hit'
    ELSE '✅ Excellent'
  END as status
FROM pg_statio_user_tables;

-- 13. ACTIVE CONNECTIONS
-- Shows current database connections by state
SELECT
  state,
  COUNT(*) as connections,
  MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_age_seconds
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY connections DESC;

-- 14. LONG-RUNNING QUERIES
-- Queries that have been running for more than 30 seconds
SELECT
  pid,
  NOW() - query_start as duration,
  state,
  query,
  usename,
  application_name,
  client_addr
FROM pg_stat_activity
WHERE state != 'idle'
  AND NOW() - query_start > INTERVAL '30 seconds'
  AND datname = current_database()
ORDER BY duration DESC;

-- 15. LOCKS AND BLOCKING
-- Shows locks and which queries are blocking others
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS blocking_statement,
  blocked_activity.application_name AS blocked_application
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- ========================================
-- TONSURANCE-SPECIFIC QUERIES
-- ========================================

-- 16. POLICY TABLE HEALTH
-- Monitors the most critical table
SELECT
  'policies' as table_name,
  COUNT(*) as total_policies,
  COUNT(*) FILTER (WHERE active = true) as active_policies,
  COUNT(*) FILTER (WHERE claimed = true) as claimed_policies,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_policies,
  pg_size_pretty(pg_total_relation_size('policies')) as total_size,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'policies') as index_count
FROM policies;

-- 17. CLAIMS PROCESSING PERFORMANCE
-- Monitors claim processing throughput
SELECT
  DATE_TRUNC('hour', claim_time) as hour,
  COUNT(*) as claims_filed,
  COUNT(*) FILTER (WHERE status = 'approved') as claims_approved,
  COUNT(*) FILTER (WHERE status = 'paid') as claims_paid,
  AVG(payout_amount) as avg_payout,
  SUM(payout_amount) as total_payout
FROM claims
WHERE claim_time >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', claim_time)
ORDER BY hour DESC;

-- 18. ESCROW ACTIVITY METRICS
-- Monitors escrow creation and resolution rates
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as escrows_created,
  COUNT(*) FILTER (WHERE status = 'released') as escrows_released,
  COUNT(*) FILTER (WHERE status = 'disputed') as escrows_disputed,
  AVG(amount) as avg_escrow_amount,
  SUM(amount) FILTER (WHERE status = 'released') as total_released
FROM escrows
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- 19. PRICING ORACLE UPDATE FREQUENCY
-- Monitors oracle keeper health (should update every 5 seconds)
SELECT
  keeper_address,
  COUNT(*) as updates_last_hour,
  MAX(timestamp) as last_update,
  EXTRACT(EPOCH FROM (NOW() - MAX(timestamp))) as seconds_since_last_update,
  CASE
    WHEN MAX(timestamp) < NOW() - INTERVAL '10 minutes' THEN '🚨 CRITICAL - Oracle down'
    WHEN MAX(timestamp) < NOW() - INTERVAL '2 minutes' THEN '⚠️  Warning - Oracle lag'
    ELSE '✅ Healthy'
  END as status
FROM pricing_oracle_updates
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY keeper_address
ORDER BY last_update DESC;

-- 20. HEDGE POSITION DRIFT MONITORING
-- Monitors hedge position drift (should be < 10%)
SELECT
  coverage_type,
  chain_id,
  stablecoin_id,
  SUM(CASE WHEN status = 'open' THEN position_size ELSE 0 END) as total_open_positions,
  COUNT(*) FILTER (WHERE status = 'open') as open_position_count,
  AVG(pnl) FILTER (WHERE status = 'closed') as avg_closed_pnl,
  SUM(pnl) FILTER (WHERE status = 'closed') as total_closed_pnl
FROM hedge_positions
GROUP BY coverage_type, chain_id, stablecoin_id
ORDER BY total_open_positions DESC;

-- ========================================
-- MAINTENANCE COMMANDS
-- ========================================

-- Run these commands periodically for database health

-- VACUUM all tables (reclaim space from dead tuples)
-- VACUUM ANALYZE policies;
-- VACUUM ANALYZE claims;
-- VACUUM ANALYZE escrows;
-- VACUUM ANALYZE pricing_oracle_updates;
-- VACUUM ANALYZE hedge_positions;

-- REINDEX for index health (run during low-traffic periods)
-- REINDEX TABLE CONCURRENTLY policies;
-- REINDEX TABLE CONCURRENTLY claims;
-- REINDEX TABLE CONCURRENTLY escrows;

-- Update table statistics (for query planner optimization)
-- ANALYZE policies;
-- ANALYZE claims;
-- ANALYZE escrows;

-- Reset pg_stat_statements (after analyzing slow queries)
-- SELECT pg_stat_statements_reset();

-- ========================================
-- ALERTING THRESHOLDS
-- ========================================

-- Set up monitoring alerts for these conditions:
-- 1. Cache hit ratio < 95%
-- 2. Sequential scans on tables > 10k rows
-- 3. Dead tuple ratio > 20%
-- 4. Index bloat > 50%
-- 5. Long-running queries > 60 seconds
-- 6. Pricing oracle updates > 2 minutes old
-- 7. Blocking locks > 10 seconds
-- 8. Table bloat > 30%
-- 9. Unused indices > 100MB
-- 10. Database size growth > 10GB/day
