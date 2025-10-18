# Integration Layer Quick Start Guide

## Prerequisites

1. **PostgreSQL** with TimescaleDB:
```bash
# macOS
brew install postgresql@14 timescaledb

# Ubuntu
sudo apt-get install postgresql-14 postgresql-14-timescaledb
```

2. **TON Testnet Access**:
- Get API key from https://toncenter.com/api/v2/
- Deploy test contracts (or use existing testnet addresses)

3. **OCaml Environment**:
```bash
opam install core lwt cohttp-lwt-unix yojson caqti caqti-lwt caqti-driver-postgresql logs logs.lwt
```

## Step 1: Database Setup

```bash
# Create database
createdb tonsurance_test

# Connect and setup
psql tonsurance_test << 'EOF'
-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Run migrations (copy SQL from migrations/ directory)
\i backend/migrations/002_add_multi_dimensional_coverage.sql
\i backend/migrations/003_add_blockchain_event_log.sql

-- Verify tables
\dt
EOF
```

Expected output:
```
                        List of relations
 Schema |             Name             | Type  |  Owner
--------+------------------------------+-------+----------
 public | blockchain_events            | table | postgres
 public | blockchain_sync_state        | table | postgres
 public | chain_risk_metrics           | table | postgres
 public | coverage_types               | table | postgres
 public | hedge_positions              | table | postgres
 public | policies                     | table | postgres
 public | product_exposure             | table | postgres
 public | stablecoins                  | table | postgres
 public | tranche_utilization          | table | postgres
```

## Step 2: Build Integration Layer

```bash
cd backend
dune build integration policy_event_subscriber vault_sync
```

## Step 3: Test Components Individually

### A. Test TON Client

Create `test_ton_client.ml`:
```ocaml
open Lwt.Syntax
open Integration.Ton_client

let () = Lwt_main.run begin
  let config = TonClient.default_config in

  (* Test contract state query *)
  let vault_addr = "EQCMPlOKGV_RXHXqe46u6FHRaRPo7qxBNT0s9W24vldcqUhB" in

  let%lwt state_opt = TonClient.get_contract_state config ~address:vault_addr in

  match state_opt with
  | Some state ->
      Lwt_io.printlf "✅ Contract found!" >>= fun () ->
      Lwt_io.printlf "Balance: %Ld nanoTON" state.balance >>= fun () ->
      Lwt_io.printlf "Last TX: %s"
        (Option.value state.last_transaction_id ~default:"N/A")
  | None ->
      Lwt_io.printlf "❌ Contract not found"
end
```

Run:
```bash
dune exec -- backend/integration/test_ton_client.exe
```

### B. Test Vault Synchronization

Create `test_vault_sync.ml`:
```ocaml
open Lwt.Syntax
open Integration.Vault_sync

let () = Lwt_main.run begin
  let vault_addr = "EQCMPlOKGV_RXHXqe46u6FHRaRPo7qxBNT0s9W24vldcqUhB" in

  let config = VaultSync.default_sync_config vault_addr in

  Lwt_io.printlf "Testing vault synchronization..." >>= fun () ->

  (* One-time sync *)
  VaultSync.sync_now config
end
```

Run:
```bash
dune exec -- backend/integration/test_vault_sync.exe
```

Expected output:
```
Testing vault synchronization...
Syncing SURE_BTC from blockchain...
Syncing SURE_SNR from blockchain...
...
Synced 6 tranches
  SURE_BTC: on-chain=10000000000, backend=0, drift=100.00%
  SURE_SNR: on-chain=8000000000, backend=0, drift=100.00%
```

### C. Test Policy Event Subscription

Create `test_event_subscription.ml`:
```ocaml
open Lwt.Syntax
open Integration.Policy_event_subscriber

let () = Lwt_main.run begin
  let factory_addr = "EQD_v9j1qdLcYZ_WlZ8xqMxb7Jcb2PxnqHqOhJ9J9J9J9J9J" in

  (* Create mock database pool *)
  let db_config = {
    Integration.Database.Database.host = "localhost";
    port = 5432;
    database = "tonsurance_test";
    user = "postgres";
    password = "";
    pool_size = 5;
  } in

  let db_pool = Integration.Database.Database.create_pool db_config in

  let config = PolicyEventSubscriber.default_subscriber_config factory_addr db_pool in

  Lwt_io.printlf "Subscribing to PolicyFactory events..." >>= fun () ->
  Lwt_io.printlf "Press Ctrl+C to stop\n" >>= fun () ->

  (* Run for 60 seconds *)
  Lwt.pick [
    PolicyEventSubscriber.start_subscription config;
    (Lwt_unix.sleep 60.0 >>= fun () -> Lwt_io.printlf "\n✅ Test complete")
  ]
end
```

Run:
```bash
dune exec -- backend/integration/test_event_subscription.exe
```

Expected output:
```
Subscribing to PolicyFactory events...
Press Ctrl+C to stop

╔════════════════════════════════════════╗
║  Policy Event Subscriber Started       ║
╚════════════════════════════════════════╝

Factory: EQD_v9j1qdLcYZ_WlZ8xqMxb7Jcb2PxnqHqOhJ9J9J9J9J9J
Poll interval: 10 seconds

📋 PolicyCreated: ID=1, type=0, chain=0, stablecoin=0, coverage=1000000000
📊 Event Stats: total=1, policies=1, payouts=0, errors=0, last_event=5s ago
...
```

## Step 4: Run Integration Daemon

### Development Mode (Testnet)

```bash
# Set environment variables
export VAULT_ADDRESS="EQCMPlOKGV_RXHXqe46u6FHRaRPo7qxBNT0s9W24vldcqUhB"
export FACTORY_ADDRESS="EQD_v9j1qdLcYZ_WlZ8xqMxb7Jcb2PxnqHqOhJ9J9J9J9J9J"

# Run daemon
dune exec -- backend/daemons/integration_daemon.exe \
  --vault "$VAULT_ADDRESS" \
  --factory "$FACTORY_ADDRESS" \
  --db-host localhost \
  --db-port 5432 \
  --db-name tonsurance_test \
  --db-user postgres \
  --network testnet
```

Expected output:
```
╔════════════════════════════════════════╗
║    TONSURANCE INTEGRATION DAEMON       ║
╚════════════════════════════════════════╝

Network: Testnet
Vault: EQCMPlOKGV_RXHXqe46u6FHRaRPo7qxBNT0s9W24vldcqUhB
PolicyFactory: EQD_v9j1qdLcYZ_WlZ8xqMxb7Jcb2PxnqHqOhJ9J9J9J9J9J
Database: localhost:5432/tonsurance_test

✅ Daemon initialized successfully

╔════════════════════════════════════════╗
║  Vault Synchronization Started         ║
╚════════════════════════════════════════╝

Vault: EQCMPlOKGV_RXHXqe46u6FHRaRPo7qxBNT0s9W24vldcqUhB
Sync interval: 300 seconds

╔════════════════════════════════════════╗
║  Policy Event Subscriber Started       ║
╚════════════════════════════════════════╝

Factory: EQD_v9j1qdLcYZ_WlZ8xqMxb7Jcb2PxnqHqOhJ9J9J9J9J9J
Poll interval: 10 seconds

[2025-10-15 15:00:00] Starting vault synchronization...
=== Vault Sync Summary ===
  SURE_BTC: capital=10000000000 (drift: 0.12%), coverage=7000000000 (drift: 0.05%)
  SURE_SNR: capital=8000000000 (drift: 2.34%), coverage=5600000000 (drift: 1.87%)
  ...
=========================

📊 Event Stats: total=0, policies=0, payouts=0, errors=0, last_event=0s ago

╔════════════════════════════════════════╗
║  Integration Daemon Health Check       ║
╚════════════════════════════════════════╝
Uptime: 0.08 hours
Vault syncs: 1
Events processed: 0
Errors: 0
Status: ✅ HEALTHY

Utilization: 68.42% | Capital: 50000000000 nanoTON | Coverage: 34210000000 nanoTON | Cached: 6 tranches
```

## Step 5: Verify Database Updates

```bash
psql tonsurance_test
```

### Check Sync State
```sql
SELECT * FROM blockchain_sync_state;
```

Expected:
```
        contract_address         | contract_type | last_synced_lt | total_events_synced
---------------------------------+---------------+----------------+---------------------
 EQD_v9j1qdLcYZ_WlZ8xqMxb7...    | PolicyFactory |     1234567890 |                  15
```

### Check Recent Events
```sql
SELECT event_type, policy_id, created_at, metadata->>'coverage_amount' as coverage
FROM blockchain_events
ORDER BY created_at DESC
LIMIT 10;
```

Expected:
```
  event_type   | policy_id |         created_at         |  coverage
---------------+-----------+----------------------------+-------------
 policy_created|         1 | 2025-10-15 15:05:23.123456 | 1000000000
 policy_created|         2 | 2025-10-15 15:06:45.789012 | 2500000000
```

### Check Product Exposure
```sql
SELECT
  ct.type_name,
  crm.chain_name,
  sc.coin_symbol,
  pe.policy_count,
  pe.total_coverage / 100000000 as coverage_ton
FROM product_exposure pe
JOIN coverage_types ct ON pe.coverage_type = ct.type_id
JOIN chain_risk_metrics crm ON pe.chain_id = crm.chain_id
JOIN stablecoins sc ON pe.stablecoin_id = sc.coin_id
WHERE pe.policy_count > 0
ORDER BY pe.total_coverage DESC;
```

Expected:
```
 type_name | chain_name | coin_symbol | policy_count | coverage_ton
-----------+------------+-------------+--------------+--------------
 depeg     | Ethereum   | USDC        |           42 |       105.50
 depeg     | Arbitrum   | USDT        |           28 |        67.30
 bridge    | Ethereum   | USDC        |           15 |        42.10
```

### Check Tranche Utilization
```sql
SELECT
  tranche_id,
  total_capital_nanoton / 1000000000 as capital_ton,
  coverage_sold_nanoton / 1000000000 as coverage_ton,
  ROUND(utilization_ratio * 100, 2) as utilization_pct,
  ROUND(current_apy, 2) as apy_pct,
  updated_at
FROM tranche_utilization
ORDER BY tranche_id;
```

Expected:
```
 tranche_id | capital_ton | coverage_ton | utilization_pct | apy_pct |         updated_at
------------+-------------+--------------+-----------------+---------+----------------------------
 SURE_BTC   |        10.0 |          7.0 |           70.00 |    4.00 | 2025-10-15 15:00:15.123456
 SURE_SNR   |         8.0 |          5.6 |           70.00 |    8.25 | 2025-10-15 15:00:15.234567
 SURE_MEZZ  |         7.2 |          5.0 |           69.44 |   12.31 | 2025-10-15 15:00:15.345678
```

## Step 6: Monitor in Real-Time

### Terminal 1: Daemon Logs
```bash
dune exec -- backend/daemons/integration_daemon.exe ... | tee integration.log
```

### Terminal 2: Database Queries
```bash
# Watch event count
watch -n 5 'psql tonsurance_test -c "SELECT COUNT(*) FROM blockchain_events"'

# Watch product exposure
watch -n 10 'psql tonsurance_test -c "SELECT * FROM product_exposure ORDER BY total_coverage DESC LIMIT 5"'
```

### Terminal 3: Trigger Test Events
```bash
# Using TON SDK (if you have test wallet)
npx blueprint run createTestPolicy
```

You should see:
1. **Terminal 1**: Log line `📋 PolicyCreated: ID=X...`
2. **Terminal 2**: Event count increments
3. **Database**: New row in `policies` and `blockchain_events`

## Step 7: Stopping the Daemon

```bash
# Graceful shutdown
Ctrl+C

# Check final state
psql tonsurance_test -c "SELECT * FROM blockchain_sync_state"
```

The daemon will save the last synced logical time, so restarting will resume from where it left off.

## Common Issues

### Issue: "Connection refused" to PostgreSQL
**Solution**:
```bash
# Start PostgreSQL
brew services start postgresql@14  # macOS
sudo systemctl start postgresql    # Linux

# Verify
psql -l
```

### Issue: "Failed to fetch on-chain state"
**Solution**:
```bash
# Check contract address is valid
curl "https://testnet.toncenter.com/api/v2/getAddressInformation?address=$VAULT_ADDRESS"

# Check network (mainnet vs testnet)
# Testnet: https://testnet.toncenter.com
# Mainnet: https://toncenter.com
```

### Issue: "No events processed"
**Solution**:
- Verify PolicyFactory address is correct
- Check if there's actual activity on the contract
- Try creating a test policy via frontend or SDK

### Issue: "Drift detected: 100%"
**Solution**:
- This is normal on first sync (backend starts at 0)
- After first sync completes, drift should drop to <5%
- If persistent high drift, check if vault contract is being used by other systems

## Next Steps

1. **Deploy to Production**:
   - Update addresses to mainnet contracts
   - Set up systemd service (see main README)
   - Configure monitoring/alerting

2. **Integration with Frontend**:
   - Frontend creates policies → Events captured automatically
   - Backend API can query real-time exposure from `product_exposure`
   - WebSocket notifications for high-value events

3. **Risk Monitoring**:
   - Connect `unified_risk_monitor` to query product exposure
   - Set up alerts for concentration limits
   - Generate daily risk reports

4. **Performance Optimization**:
   - Tune `poll_interval_seconds` based on traffic
   - Add Redis cache layer for hot queries
   - Implement connection pooling for PostgreSQL

## Troubleshooting Checklist

- [ ] PostgreSQL running and accessible
- [ ] Database migrations applied successfully
- [ ] TON testnet API reachable
- [ ] Contract addresses valid (check on explorer)
- [ ] OCaml dependencies installed (`opam list`)
- [ ] Correct network selected (testnet vs mainnet)
- [ ] Database credentials correct
- [ ] Port 5432 not blocked by firewall

## Success Criteria

After following this guide, you should have:

✅ Integration daemon running continuously
✅ Vault state syncing every 5 minutes
✅ Policy events captured within 10 seconds
✅ PostgreSQL tables populated with real data
✅ Drift detection working (alerts on >5% mismatch)
✅ Health checks reporting status every 5 minutes

## Resources

- **TON Center API**: https://toncenter.com/api/v2/
- **TON Explorer (Testnet)**: https://testnet.tonviewer.com/
- **Tonsurance Contracts**: See `contracts/` directory
- **Full Documentation**: `INTEGRATION_LAYER_README.md`
