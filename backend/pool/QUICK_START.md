# Utilization Tracker - Quick Start Guide

5-minute guide to using the Utilization Tracker in your code.

## Basic Usage

### 1. Initialize (Once at Startup)

```ocaml
open Pool.Utilization_tracker

let init_backend () =
  let db_config = Integration.Database.{
    host = "localhost";
    port = 5432;
    database = "tonsurance";
    user = "postgres";
    password = System.getenv_or "DB_PASSWORD" "";
    pool_size = 10;
  } in

  let* result = UtilizationTracker.init ~database_config in
  match result with
  | Ok () -> Logs_lwt.info (fun m -> m "✓ Utilization tracker ready")
  | Error e -> Lwt.fail_with (Types.error_to_string e)
```

### 2. Handle Deposits

```ocaml
(* When user deposits to a tranche *)
let handle_deposit ~tranche ~amount_ton =
  let amount_nano = Int64.of_float (amount_ton *. 1e9) in

  UtilizationTracker.update_capital ~tranche ~delta:amount_nano
```

### 3. Handle Withdrawals

```ocaml
(* When user withdraws from a tranche *)
let handle_withdrawal ~tranche ~amount_ton =
  let amount_nano = Int64.of_float (amount_ton *. 1e9) in

  UtilizationTracker.update_capital ~tranche ~delta:(Int64.neg amount_nano)
```

### 4. Create Policy (Check Capacity First)

```ocaml
let create_policy ~tranche ~coverage_amount =
  (* Step 1: Check if vault has capacity *)
  let* can_accept = UtilizationTracker.can_accept_coverage
    ~tranche
    ~amount:coverage_amount
  in

  if not can_accept then
    Lwt.return_error "Vault at capacity"
  else (
    (* Step 2: Create policy on-chain *)
    let* policy_id = create_policy_contract ~coverage:coverage_amount in

    (* Step 3: Update tracker *)
    let* () = UtilizationTracker.update_coverage
      ~tranche
      ~delta:coverage_amount
    in

    Lwt.return_ok policy_id
  )
```

### 5. Policy Expires

```ocaml
let handle_policy_expiry ~tranche ~coverage_amount =
  (* Reduce coverage sold *)
  UtilizationTracker.update_coverage
    ~tranche
    ~delta:(Int64.neg coverage_amount)
```

### 6. Get Real-Time APY

```ocaml
let get_current_apy ~tranche =
  let* util = UtilizationTracker.get_tranche_utilization ~tranche in
  Lwt.return util.current_apy
```

### 7. Get All Vault Stats (Dashboard)

```ocaml
let get_dashboard_data () =
  let* all_utils = UtilizationTracker.get_all_utilizations () in

  let stats = List.map all_utils ~f:(fun util ->
    `Assoc [
      ("tranche", `String (Tranche_pricing.tranche_to_string util.tranche_id));
      ("apy", `Float util.current_apy);
      ("utilization", `Float util.utilization_ratio);
      ("tvl_ton", `Float (Int64.to_float util.total_capital /. 1e9));
    ]
  ) in

  Lwt.return (`Assoc [("tranches", `List stats)])
```

## REST API Integration

### Add to Dream Router

```ocaml
open Dream

let routes = [
  (* Get APY for specific tranche *)
  Dream.get "/api/v1/tranche/:id/apy" (fun req ->
    let tranche_str = Dream.param req "id" in

    match Tranche_pricing.tranche_of_string tranche_str with
    | Error msg -> Dream.json ~status:`Bad_Request (error_json msg)
    | Ok tranche ->
        let* util = UtilizationTracker.get_tranche_utilization ~tranche in

        Dream.json (Yojson.Safe.to_string (`Assoc [
          ("tranche", `String tranche_str);
          ("apy", `Float util.current_apy);
          ("utilization", `Float util.utilization_ratio);
        ]))
  );

  (* Get dashboard data *)
  Dream.get "/api/v1/dashboard/vaults" (fun _req ->
    let* data = get_dashboard_data () in
    Dream.json (Yojson.Safe.to_string data)
  );

  (* Check capacity *)
  Dream.get "/api/v1/tranche/:id/capacity" (fun req ->
    let tranche_str = Dream.param req "id" in

    match Tranche_pricing.tranche_of_string tranche_str with
    | Error msg -> Dream.json ~status:`Bad_Request (error_json msg)
    | Ok tranche ->
        let* capacity = UtilizationTracker.get_available_capacity ~tranche in

        Dream.json (Yojson.Safe.to_string (`Assoc [
          ("available_ton", `Float (Int64.to_float capacity /. 1e9));
          ("available_nanoton", `String (Int64.to_string capacity));
        ]))
  );
]
```

## Sync from Chain (Periodic Task)

```ocaml
(* Run every 5 minutes to reconcile with on-chain state *)
let rec sync_loop () =
  let* () = Logs_lwt.info (fun m -> m "Syncing from chain...") in

  (* Read from MultiTrancheVault contract *)
  let* chain_state = read_vault_state_from_chain () in

  (* Update tracker *)
  let* () = Lwt_list.iter_s (fun (tranche, capital, coverage) ->
    UtilizationTracker.sync_from_chain ~tranche ~total_capital:capital ~coverage_sold:coverage
  ) chain_state in

  let* () = Logs_lwt.info (fun m -> m "✓ Sync complete") in

  (* Wait 5 minutes *)
  let* () = Lwt_unix.sleep 300.0 in
  sync_loop ()
```

## Monitoring

### Log Risk Alerts

```ocaml
(* Automatically logs when utilization > 90% *)
UtilizationTracker.update_coverage ~tranche ~delta
(* Output: ⚠️  HIGH UTILIZATION: SURE-MEZZ at 92.50% (threshold: 90.00%) *)
```

### Custom Monitoring

```ocaml
let monitor_vaults () =
  let* all_utils = UtilizationTracker.get_all_utilizations () in

  Lwt_list.iter_s (fun util ->
    if util.utilization_ratio > 0.85 then
      send_slack_alert (sprintf "⚠️ %s approaching capacity: %.2f%%"
        (Tranche_pricing.tranche_to_string util.tranche_id)
        (util.utilization_ratio *. 100.0)
      )
    else
      Lwt.return_unit
  ) all_utils
```

## Testing

### Mock for Tests

```ocaml
(* In test setup *)
UtilizationTracker.clear_caches ()  (* Reset state *)

(* Simulate chain state *)
let* () = UtilizationTracker.sync_from_chain
  ~tranche:SURE_BTC
  ~total_capital:1000_000_000_000L  (* 1000 TON *)
  ~coverage_sold:500_000_000_000L   (* 500 TON *)
in

(* Test behavior *)
let* util = UtilizationTracker.get_tranche_utilization ~tranche:SURE_BTC in
assert Float.(abs (util.utilization_ratio - 0.50) < 0.01)
```

## Common Patterns

### Pattern 1: Check Before Create

```ocaml
let safe_policy_creation ~tranche ~coverage =
  let* can_accept = UtilizationTracker.can_accept_coverage ~tranche ~amount:coverage in

  if can_accept then
    create_policy_on_chain ()
  else
    Lwt.return_error "Insufficient capacity"
```

### Pattern 2: Batch Updates

```ocaml
(* Instead of N updates *)
List.iter policies ~f:(fun p ->
  update_coverage ~delta:p.coverage
)

(* Do 1 update *)
let total_coverage = List.fold policies ~init:0L ~f:(fun acc p ->
  Int64.(acc + p.coverage)
) in
update_coverage ~tranche ~delta:total_coverage
```

### Pattern 3: Async Updates

```ocaml
(* Don't block user response *)
let* policy_id = create_policy () in
let* () = send_user_confirmation policy_id in

(* Update tracker in background *)
Lwt.async (fun () ->
  UtilizationTracker.update_coverage ~tranche ~delta:coverage_amount
)
```

## Troubleshooting

### Problem: "Database not initialized"

```ocaml
(* Solution: Call init first *)
let* () = UtilizationTracker.init ~database_config in
```

### Problem: Stale data

```ocaml
(* Solution: Invalidate cache *)
UtilizationTracker.invalidate_cache tranche
```

### Problem: Capacity always rejected

```ocaml
(* Debug: Check available capacity *)
let* capacity = UtilizationTracker.get_available_capacity ~tranche in
Printf.printf "Available: %Ld nanoTON\n" capacity;

(* Check collateralization *)
let* ratio = UtilizationTracker.get_collateralization_ratio ~tranche in
Printf.printf "Collateralization: %.2fx\n" ratio;
```

## Performance Tips

1. **Cache warm-up**: Call `get_all_utilizations()` at startup
2. **Batch updates**: Combine multiple coverage changes
3. **Async updates**: Don't block user transactions
4. **Monitor stats**: Call `get_statistics()` periodically

## Next Steps

1. Read full docs: `UTILIZATION_TRACKER_README.md`
2. See examples: `utilization_tracker_example.ml`
3. Review implementation: `utilization_tracker.ml`
4. Run tests: `dune test`

## Support

- Implementation: `backend/pool/utilization_tracker.ml`
- Tests: `backend/test/utilization_tracker_test.ml`
- Docs: `backend/pool/UTILIZATION_TRACKER_README.md`
