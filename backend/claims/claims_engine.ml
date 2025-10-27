open Core
open Lwt.Infix
open Lwt.Syntax
open Types
open Db

(** Module alias for cleaner database access *)
module ClaimsDb = Claims_db.ClaimsDb

(** Claims configuration *)
type claims_config = {
  sample_interval_seconds: float;
  confirmation_samples_required: int; (* Number of consecutive samples below trigger *)
  max_payout_retry_attempts: int;
  ton_config: Ton_client.TonClient.ton_config;
  claims_processor_address: string; (* Address that sends payouts *)
} [@@deriving sexp]

(** Check if a policy's trigger condition is met *)
let check_policy_trigger
    ~(policy: policy)
    ~(current_price: float)
    ~(previous_state: Claims_db.trigger_state_record option)
  : trigger_check =

  let is_triggered = Float.(current_price < policy.trigger_price) in

  let (samples_below, first_below_time) = match previous_state with
    | None when is_triggered ->
        (1, Some (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec))
    | None ->
        (0, None)
    | Some state when is_triggered ->
        let new_samples = state.samples_below + 1 in
        let first_time = match state.first_below_timestamp with
          | Some t -> Some t
          | None -> Some (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec)
        in
        (new_samples, first_time)
    | Some _state ->
        (* Price recovered above trigger - reset *)
        (0, None)
  in

  {
    policy_id = policy.policy_id;
    current_price;
    trigger_price = policy.trigger_price;
    is_triggered;
    samples_below;
    first_below_time;
    should_payout = samples_below >= 0; (* Immediate payout when triggered *)
  }

(** Calculate payout amount using linear interpolation between trigger and floor *)
let calculate_payout_amount
    ~(coverage_amount: usd_cents)
    ~(trigger_price: float)
    ~(floor_price: float)
    ~(current_price: float)
  : usd_cents =

  if Float.(current_price >= trigger_price) then
    0L (* Not triggered *)
  else if Float.(current_price <= floor_price) then
    coverage_amount (* Maximum payout *)
  else
    (* Linear interpolation between trigger and floor *)
    let price_range = trigger_price -. floor_price in
    let price_drop = trigger_price -. current_price in
    let interpolation_factor = price_drop /. price_range in

    let payout_float = (Int64.to_float coverage_amount) *. interpolation_factor in
    Int64.of_float payout_float

(** Monitor active policies and check trigger conditions *)
let monitor_policies
    (mgr: Pool.Collateral_manager.CollateralManager.t ref)
    ~(oracle_prices: (asset * float) list)
    ~(trigger_states: (int64 * Claims_db.trigger_state_record) list)
    ~(_config: claims_config)
  : (Pool.Collateral_manager.CollateralManager.t ref * trigger_check list) =

  let trigger_states_map = Int64.Table.of_alist_exn trigger_states in
  (* Use String.Map with asset_to_string as key to avoid comparator witness issues *)
  let oracle_prices_map = List.fold oracle_prices ~init:(String.Map.empty)
    ~f:(fun acc (asset, price) -> Map.set acc ~key:(asset_to_string asset) ~data:price)
  in

  (* Get active policies from collateral manager *)
  let active_policies = (!mgr).pool.active_policies in

  (* Check each policy against current prices *)
  let checks = List.filter_map active_policies ~f:(fun policy ->
    match Map.find oracle_prices_map (asset_to_string policy.asset) with
    | None ->
        Logs.warn (fun m -> m "No oracle price for policy %Ld asset %s"
          policy.policy_id (asset_to_string policy.asset));
        None
    | Some current_price ->
        let previous_state = Hashtbl.find trigger_states_map policy.policy_id in
        let check = check_policy_trigger ~policy ~current_price ~previous_state in
        Some check
  ) in

  (mgr, checks)

(** Execute payouts for triggered policies *)
let execute_payouts
    (mgr: Pool.Collateral_manager.CollateralManager.t ref)
    ~(trigger_checks: trigger_check list)
    ~(oracle_prices: (asset * float) list)
  : (Pool.Collateral_manager.CollateralManager.t ref * payout_result list * error list) =

  (* Use String.Map with asset_to_string as key to avoid comparator witness issues *)
  let oracle_prices_map = List.fold oracle_prices ~init:(String.Map.empty)
    ~f:(fun acc (asset, price) -> Map.set acc ~key:(asset_to_string asset) ~data:price)
  in

  (* Filter for policies that should receive payout *)
  let triggered_policies = List.filter trigger_checks ~f:(fun check -> check.should_payout) in

  (* Process each triggered policy *)
  let (payouts, errors) = List.fold triggered_policies
    ~init:([], [])
    ~f:(fun (payouts_acc, errors_acc) check ->

      (* Find the corresponding policy *)
      let policy_opt = List.find (!mgr).pool.active_policies ~f:(fun p ->
        Int64.equal p.policy_id check.policy_id
      ) in

      match policy_opt with
      | None ->
          let err = PolicyNotFound check.policy_id in
          (payouts_acc, err :: errors_acc)

      | Some policy ->
          (* Get current price for the asset *)
          let current_price_opt = Map.find oracle_prices_map (asset_to_string policy.asset) in

          match current_price_opt with
          | None ->
              let err = OracleError (Printf.sprintf "No price for asset %s"
                (asset_to_string policy.asset)) in
              (payouts_acc, err :: errors_acc)

          | Some current_price ->
              (* Calculate payout amount *)
              let payout_amount = calculate_payout_amount
                ~coverage_amount:policy.coverage_amount
                ~trigger_price:policy.trigger_price
                ~floor_price:policy.floor_price
                ~current_price
              in

              (* Check if sufficient capital exists *)
              if Int64.(payout_amount > (!mgr).pool.total_capital_usd) then
                let err = InsufficientCapital (Printf.sprintf
                  "Policy %Ld requires %Ld cents, only %Ld available"
                  policy.policy_id payout_amount (!mgr).pool.total_capital_usd) in
                (payouts_acc, err :: errors_acc)
              else begin
                (* Reserve capital from collateral manager *)
                let updated_pool = {
                  (!mgr).pool with
                  total_capital_usd = Int64.(!mgr.pool.total_capital_usd - payout_amount);
                  total_coverage_sold = Int64.(!mgr.pool.total_coverage_sold - policy.coverage_amount);
                  active_policies = List.filter (!mgr).pool.active_policies
                    ~f:(fun p -> not (Int64.equal p.policy_id policy.policy_id));
                } in
                mgr := { !mgr with pool = updated_pool };

                (* Create payout result *)
                let interpolation_factor =
                  if Float.(current_price >= policy.trigger_price) then 0.0
                  else if Float.(current_price <= policy.floor_price) then 1.0
                  else
                    let price_range = policy.trigger_price -. policy.floor_price in
                    let price_drop = policy.trigger_price -. current_price in
                    price_drop /. price_range
                in

                let payout = {
                  policy_id = policy.policy_id;
                  payout_amount;
                  beneficiary = Option.value policy.beneficiary ~default:policy.policyholder;
                  trigger_price = policy.trigger_price;
                  floor_price = policy.floor_price;
                  current_price;
                  interpolation_factor;
                } in

                Logs.info (fun m -> m "Reserved payout: Policy %Ld, Amount: $%.2f"
                  policy.policy_id (Math.cents_to_usd payout_amount));

                (payout :: payouts_acc, errors_acc)
              end
    )
  in

  (mgr, List.rev payouts, List.rev errors)

let monitoring_loop
    ~(db_pool: Connection_pool.ConnectionPool.t)
    ~(collateral_manager: Pool.Collateral_manager.CollateralManager.t ref)
    ~(get_oracle_prices: unit -> (asset * float) list Lwt.t)
    ~(config: claims_config)
  : unit Lwt.t =

  let rec loop mgr () =
    Lwt.catch
      (fun () ->
        let* prices = get_oracle_prices () in
        let* db_trigger_states_res = ClaimsDb.get_all_trigger_states db_pool () in
        
        let db_trigger_states = 
            match db_trigger_states_res with
            | Ok states -> states
            | Error e -> 
                Logs.err (fun m -> m "[Claims Engine] DB Error fetching trigger states: %s" (Caqti_error.show e));
                []
        in

        let trigger_states_ht = Hashtbl.of_alist_exn (module Int64) (List.map db_trigger_states ~f:(fun r -> (r.policy_id, r))) in

        let (mgr_after_monitor, checks) = monitor_policies
          mgr
          ~oracle_prices:prices
          ~trigger_states:(Hashtbl.to_alist trigger_states_ht)
          ~_config:config
        in

        (* Persist updated trigger states *)
        let%lwt () = Lwt_list.iter_s (fun (check: trigger_check) ->
            let new_state: Claims_db.trigger_state_record = {
                policy_id = check.policy_id;
                first_below_timestamp = check.first_below_time;
                samples_below = check.samples_below;
                last_check_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
            } in
            let%lwt res = Claims_db.ClaimsDb.upsert_trigger_state db_pool new_state in
            (match res with
            | Ok () -> Lwt.return_unit
            | Error e -> Logs_lwt.err (fun m -> m "[Claims Engine] DB Error upserting trigger state: %s" (Caqti_error.show e)))
        ) checks in

        let (final_mgr, payouts, errors) = execute_payouts
          mgr_after_monitor
          ~trigger_checks:checks
          ~oracle_prices:prices
        in

        List.iter payouts ~f:(fun payout ->
          Logs.info (fun m -> m "Payout executed: Policy %Ld, Amount: $%.2f"
            payout.policy_id
            (Math.cents_to_usd payout.payout_amount))
        );

        List.iter errors ~f:(fun err ->
          Logs.err (fun m -> m "Payout error: %s" (error_to_string err))
        );

        Lwt.return final_mgr
      )
      (fun exn ->
        Logs.err (fun m -> m "Claims monitoring error: %s" (Exn.to_string exn));
        Lwt.return mgr
      )
    >>= fun final_mgr ->

    Lwt_unix.sleep config.sample_interval_seconds >>= loop final_mgr
  in

  loop collateral_manager ()
