# Configuration Management - Quick Reference Card

## Files Created

```
backend/
├── migrations/
│   ├── 006_config_parameters.sql    (Config parameters + audit)
│   ├── 007_historical_depegs.sql    (14 depeg events)
│   └── 008_stress_scenarios.sql     (4 stress scenarios)
├── config/
│   ├── config_loader.ml             (Hot-reload service)
│   └── dune                         (Build config)
├── api/
│   └── admin_api.ml                 (REST API for config management)
├── scripts/
│   └── migrate_config_to_db.ml      (Migration runner)
├── PHASE2_IMPLEMENTATION_GUIDE.md   (500+ lines detailed guide)
└── CONFIG_QUICK_REFERENCE.md        (This file)

PHASE2_SUMMARY_REPORT.md             (Root level, executive summary)
```

## Quick Start

### 1. Run Migrations
```bash
psql -d tonsurance -f backend/migrations/006_config_parameters.sql
psql -d tonsurance -f backend/migrations/007_historical_depegs.sql
psql -d tonsurance -f backend/migrations/008_stress_scenarios.sql
```

### 2. Initialize ConfigLoader in Your Code
```ocaml
(* At application startup *)
let* () = Config.ConfigLoader.init_db_pool
  ~host:"localhost" ~port:5432 ~database:"tonsurance"
  ~user:"app_user" ~password:"secret" ()
in
Config.ConfigLoader.start_auto_reload ~interval_seconds:60;
```

### 3. Use ConfigLoader
```ocaml
(* Get float value *)
let* base_rate = Config.ConfigLoader.get_float
  ~category:"pricing"
  ~key:"base_rate_USDC"
  ~default:0.04
in

(* Or use helper *)
let* base_rate = Config.Helpers.get_base_rate USDC in
```

## Common Admin API Commands

```bash
# Set your admin token
export TOKEN="your-admin-jwt-token"

# List all configs
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/admin/config

# Get specific config
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/admin/config/pricing/base_rate_USDC

# Update config (dry run)
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 0.05, "reason": "Test", "dry_run": true}' \
  http://localhost:3000/admin/config/pricing/base_rate_USDC

# Update config (actual)
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 0.05, "reason": "Market adjustment"}' \
  http://localhost:3000/admin/config/pricing/base_rate_USDC

# Force cache reload
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/admin/config/reload

# View audit log
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/admin/config/audit?limit=50

# Cache stats
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/admin/config/stats
```

## Database Queries

```sql
-- List all configs by category
SELECT category, key, value_data, description
FROM config_parameters
ORDER BY category, key;

-- View recent changes
SELECT category, key, old_value, new_value, changed_by, changed_at, change_reason
FROM config_audit_log
ORDER BY changed_at DESC
LIMIT 20;

-- Get depeg frequency
SELECT asset, COUNT(*) as event_count, MIN(min_price) as worst_depeg
FROM historical_depegs
WHERE verified = TRUE
GROUP BY asset
ORDER BY event_count DESC;

-- Active stress scenarios
SELECT scenario_name, severity_level, probability_annual
FROM stress_scenarios
WHERE enabled = TRUE
ORDER BY severity_level DESC;
```

## Parameter Categories

### Pricing (25 params)
- `base_rate_*` - Asset-specific annual rates
- `risk_weight_*` - Risk adjustment factors
- `size_discount_*` - Tiered discounts
- `utilization_*` - Utilization multipliers
- `duration_base_days`, `trigger_base_price`, etc.

### Risk (7 params)
- `var_confidence_95`, `var_confidence_99`
- `monte_carlo_simulations`
- `historical_data_years`
- `risk_free_rate`
- `reserve_multiplier`, `stress_buffer_multiplier`

### Tranche (30 params)
- Per tranche: `{tranche}_apy_min`, `{tranche}_apy_max`, `{tranche}_curve_type`, `{tranche}_allocation_percent`
- Tranches: SURE_BTC, SURE_SNR, SURE_MEZZ, SURE_JNR, SURE_JNR_PLUS, SURE_EQT

## Code Migration Pattern

**Before:**
```ocaml
let base_rates = [(USDC, 0.04); (USDT, 0.06)]
let get_base_rate asset = List.Assoc.find base_rates asset ~equal:Poly.equal
```

**After:**
```ocaml
let get_base_rate (asset: asset) : float Lwt.t =
  let key = sprintf "base_rate_%s" (Types.asset_to_string asset) in
  Config.ConfigLoader.get_float ~category:"pricing" ~key ~default:0.10
```

## Troubleshooting

### Cache not updating?
```ocaml
(* Force reload *)
let* () = Config.ConfigLoader.reload_cache () in

(* Check stats *)
let stats = Config.ConfigLoader.get_cache_stats () in
print_endline (Yojson.Safe.to_string stats);
```

### Database connection issues?
```ocaml
(* Reconnect *)
let* () = Config.ConfigLoader.init_db_pool
  ~host:"localhost" ~port:5432 ~database:"tonsurance"
  ~user:"app_user" ~password:"secret" ()
in
```

### Pricing not reflecting new config?
1. Check config was updated: `SELECT value_data FROM config_parameters WHERE category='pricing' AND key='base_rate_USDC'`
2. Check cache: `curl http://localhost:3000/admin/config/stats`
3. Force reload: `curl -X POST http://localhost:3000/admin/config/reload`
4. Wait 60s for auto-reload
5. Check function signature is `-> float Lwt.t` (async)

## Performance

- **Cache hit**: ~10ns
- **Cache miss**: ~5-10ms
- **Auto-reload**: Every 60s
- **Target hit rate**: >95%
- **Overhead**: <1ms per pricing calculation

## Security

- **JWT auth** required for all admin endpoints
- **Audit trail** for all changes
- **Dry-run mode** for testing
- **Type validation** on updates
- **Client IP logging** for forensics

## Monitoring

```sql
-- Cache hit rate (last hour)
SELECT
  COUNT(*) FILTER (WHERE cache_hit) * 100.0 / COUNT(*) AS hit_rate_pct
FROM config_access_log
WHERE timestamp > NOW() - INTERVAL '1 hour';

-- Recent updates
SELECT category, key, changed_by, changed_at
FROM config_audit_log
ORDER BY changed_at DESC
LIMIT 10;
```

## Support

- **Implementation Guide**: `backend/PHASE2_IMPLEMENTATION_GUIDE.md`
- **Full Report**: `PHASE2_SUMMARY_REPORT.md`
- **Code Examples**: See implementation guide sections on "Updating Existing Modules"
- **API Docs**: See admin_api.ml header comments
