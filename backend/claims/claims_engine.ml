(** Claims Engine

    Handles policy payout logic:
    - Trigger validation (sustained depeg for 4 hours)
    - Payout calculation (linear interpolation formula)
    - Beneficiary payout execution
    - Loss allocation to tranches (waterfall)
    - Claims processing workflow

    Formula: Payout = Coverage * (Trigger - Current) / (Trigger - Floor)
*)

open Core
open Lwt.Infix
open Types

(** Configuration for claims processing *)
type claims_config = {
  required_samples: int; (* 240 samples = 4 hours at 1 minute intervals *)
  sample_interval_seconds: float; (* 60 seconds *)
  min_trigger_duration_seconds: float; (* 14400 = 4 hours *)
  grace_period_seconds: float; (* Allow 1 hour grace before payout *)
  max_payout_delay_seconds: float; (* Must pay within 24 hours of trigger *)
}

let default_config = {
  required_samples = 240;
  sample_interval_seconds = 60.0;
  min_trigger_duration_seconds = 14400.0; (* 4 hours *)
  grace_period_seconds = 3600.0; (* 1 hour *)
  max_payout_delay_seconds = 86400.0; (* 24 hours *)
}

(** Trigger monitoring state *)
type trigger_state = {
  policy_id: int64;
  first_below_timestamp: float option;
  samples_below: int;
  last_check_timestamp: float;
  price_samples: float list; (* Recent price samples *)
}

(** Check if policy should trigger based on current price *)
let check_trigger
    (policy: policy)
    (current_price: float)
    ~(config: claims_config)
    ~(trigger_state: trigger_state option)
  : trigger_check =

  let is_below = current_price < policy.trigger_price in

  match trigger_state with
  | None ->
      (* First time seeing this policy *)
      if is_below then
        {
          policy_id = policy.policy_id;
          current_price;
          trigger_price = policy.trigger_price;
          is_triggered = true;
          samples_below = 1;
          first_below_time = Some (Unix.gettimeofday ());
          should_payout = false; (* Need more samples *)
        }
      else
        {
          policy_id = policy.policy_id;
          current_price;
          trigger_price = policy.trigger_price;
          is_triggered = false;
          samples_below = 0;
          first_below_time = None;
          should_payout = false;
        }

  | Some state ->
      let now = Unix.gettimeofday () in

      if is_below then
        (* Price still below trigger *)
        let new_samples_below = state.samples_below + 1 in
        let first_time = Option.value state.first_below_timestamp ~default:now in
        let duration = now -. first_time in

        let should_payout =
          new_samples_below >= config.required_samples &&
          duration >= config.min_trigger_duration_seconds
        in

        {
          policy_id = policy.policy_id;
          current_price;
          trigger_price = policy.trigger_price;
          is_triggered = true;
          samples_below = new_samples_below;
          first_below_time = Some first_time;
          should_payout;
        }
      else
        (* Price recovered above trigger - reset *)
        {
          policy_id = policy.policy_id;
          current_price;
          trigger_price = policy.trigger_price;
          is_triggered = false;
          samples_below = 0;
          first_below_time = None;
          should_payout = false;
        }

(** Calculate payout amount using linear interpolation formula *)
let calculate_payout
    (policy: policy)
    (current_price: float)
  : payout_result =

  (* Formula: Payout = Coverage * (Trigger - Current) / (Trigger - Floor) *)
  let trigger = policy.trigger_price in
  let floor = policy.floor_price in
  let coverage = Math.cents_to_usd policy.coverage_amount in

  (* Clamp current price to [floor, trigger] range *)
  let clamped_price = Math.clamp ~value:current_price ~min_val:floor ~max_val:trigger in

  let price_drop = trigger -. clamped_price in
  let total_protection_range = trigger -. floor in

  let interpolation_factor =
    if total_protection_range < Float.epsilon then 1.0
    else price_drop /. total_protection_range
  in

  let payout_usd = coverage *. interpolation_factor in
  let payout_cents = Math.usd_to_cents payout_usd in

  {
    policy_id = policy.policy_id;
    payout_amount = payout_cents;
    beneficiary = get_beneficiary policy;
    trigger_price = trigger;
    floor_price = floor;
    current_price = clamped_price;
    interpolation_factor;
  }

(** Validate that payout is legitimate *)
let validate_payout
    (policy: policy)
    (payout: payout_result)
    ~(current_time: float)
  : (unit, error) Result.t =

  (* Check policy is active *)
  if not (is_active policy) then
    Error (PolicyAlreadyClaimed policy.policy_id)

  (* Check policy hasn't expired *)
  else if is_expired policy ~current_time then
    Error (PolicyExpired policy.policy_id)

  (* Check payout amount is reasonable *)
  else if Int64.(payout.payout_amount > policy.coverage_amount) then
    Error (InvalidPrice "Payout exceeds coverage amount")

  else if Int64.(payout.payout_amount <= 0L) then
    Error (InvalidPrice "Payout must be positive")

  else
    Ok ()

(** Process a payout through the collateral manager *)
let process_payout
    (collateral_mgr: Collateral_manager.t)
    (policy: policy)
    (payout: payout_result)
  : (Collateral_manager.t, error) Result.t =

  (* Validate pool has sufficient capital *)
  let pool = Collateral_manager.get_pool_state collateral_mgr in

  if Int64.(pool.usd_reserves < payout.payout_amount) then
    Error (InsufficientCapital
      (Printf.sprintf "Insufficient reserves: need %s, have %s"
        (Int64.to_string payout.payout_amount)
        (Int64.to_string pool.usd_reserves)))

  else
    try
      (* Execute payout through collateral manager *)
      (* This will deduct from reserves and allocate losses to tranches *)
      let updated_mgr = Collateral_manager.execute_payout
        collateral_mgr
        ~policy_id:policy.policy_id
        ~payout_amount:payout.payout_amount
      in

      Ok updated_mgr

    with exn ->
      Error (ContractError (Exn.to_string exn))

(** Full claims workflow *)
let process_claim
    (collateral_mgr: Collateral_manager.t)
    (policy: policy)
    (current_price: float)
    ~(config: claims_config)
    ~(trigger_state: trigger_state option)
  : (Collateral_manager.t * payout_result option, error) Result.t =

  let now = Unix.gettimeofday () in

  (* Step 1: Check if trigger conditions met *)
  let trigger_check = check_trigger policy current_price ~config ~trigger_state in

  if not trigger_check.should_payout then
    (* Not ready to payout yet *)
    Ok (collateral_mgr, None)

  else begin
    (* Step 2: Calculate payout *)
    let payout = calculate_payout policy current_price in

    (* Step 3: Validate payout *)
    match validate_payout policy payout ~current_time:now with
    | Error err -> Error err
    | Ok () ->
        (* Step 4: Process through collateral manager *)
        match process_payout collateral_mgr policy payout with
        | Error err -> Error err
        | Ok updated_mgr ->
            Ok (updated_mgr, Some payout)
  end

(** Batch process multiple claims *)
let process_claims_batch
    (collateral_mgr: Collateral_manager.t)
    (claims: (policy * float * trigger_state option) list)
    ~(config: claims_config)
  : (Collateral_manager.t * payout_result list * error list) =

  let initial_state = (collateral_mgr, [], []) in

  let (final_mgr, payouts, errors) =
    List.fold claims ~init:initial_state
      ~f:(fun (mgr, payouts_acc, errors_acc) (policy, price, state) ->
        match process_claim mgr policy price ~config ~trigger_state:state with
        | Error err ->
            (mgr, payouts_acc, err :: errors_acc)
        | Ok (updated_mgr, None) ->
            (updated_mgr, payouts_acc, errors_acc)
        | Ok (updated_mgr, Some payout) ->
            (updated_mgr, payout :: payouts_acc, errors_acc)
      )
  in

  (final_mgr, List.rev payouts, List.rev errors)

(** Monitor all active policies for triggers *)
let monitor_policies
    (collateral_mgr: Collateral_manager.t)
    ~(oracle_prices: (asset * float) list)
    ~(trigger_states: (int64 * trigger_state) list)
    ~(config: claims_config)
  : (Collateral_manager.t * trigger_check list) =

  let pool = Collateral_manager.get_pool_state collateral_mgr in

  (* Check each active policy *)
  let trigger_checks = List.filter_map pool.active_policies ~f:(fun policy ->
    (* Find current price for this asset *)
    match List.Assoc.find oracle_prices ~equal:equal_asset policy.asset with
    | None -> None (* No price data *)
    | Some current_price ->
        (* Find existing trigger state if any *)
        let state = List.Assoc.find trigger_states ~equal:Int64.equal policy.policy_id in

        (* Check trigger *)
        let check = check_trigger policy current_price ~config ~trigger_state:state in
        Some check
  ) in

  (collateral_mgr, trigger_checks)

(** Execute payouts for policies that should be paid *)
let execute_payouts
    (collateral_mgr: Collateral_manager.t)
    ~(trigger_checks: trigger_check list)
    ~(oracle_prices: (asset * float) list)
  : (Collateral_manager.t * payout_result list * error list) =

  let pool = Collateral_manager.get_pool_state collateral_mgr in

  (* Filter to payouts that should execute *)
  let payouts_to_execute = List.filter trigger_checks ~f:(fun check ->
    check.should_payout
  ) in

  (* Build list of (policy, price) *)
  let claims = List.filter_map payouts_to_execute ~f:(fun check ->
    (* Find policy *)
    let policy_opt = List.find pool.active_policies ~f:(fun p ->
      Int64.(p.policy_id = check.policy_id)
    ) in

    (* Find price *)
    match policy_opt with
    | None -> None
    | Some policy ->
        let price_opt = List.Assoc.find oracle_prices ~equal:equal_asset policy.asset in
        Option.map price_opt ~f:(fun price -> (policy, price, None))
  ) in

  (* Process all payouts *)
  process_claims_batch collateral_mgr claims ~config:default_config

(** Continuous monitoring daemon *)
let monitoring_loop
    ~(collateral_manager: Collateral_manager.t ref)
    ~(get_oracle_prices: unit -> (asset * float) list Lwt.t)
    ~(config: claims_config)
  : unit Lwt.t =

  (* Track trigger states *)
  let trigger_states = ref [] in

  let rec loop () =
    Lwt.catch
      (fun () ->
        (* Fetch current prices *)
        get_oracle_prices () >>= fun prices ->

        (* Monitor all policies *)
        let (mgr, checks) = monitor_policies
          !collateral_manager
          ~oracle_prices:prices
          ~trigger_states:!trigger_states
          ~config
        in

        (* Update trigger states *)
        trigger_states := List.map checks ~f:(fun check ->
          let state = {
            policy_id = check.policy_id;
            first_below_timestamp = check.first_below_time;
            samples_below = check.samples_below;
            last_check_timestamp = Unix.gettimeofday ();
            price_samples = [check.current_price];
          } in
          (check.policy_id, state)
        );

        (* Execute payouts for triggered policies *)
        let (updated_mgr, payouts, errors) = execute_payouts
          mgr
          ~trigger_checks:checks
          ~oracle_prices:prices
        in

        (* Update collateral manager *)
        collateral_manager := updated_mgr;

        (* Log results *)
        List.iter payouts ~f:(fun payout ->
          Logs.info (fun m -> m "Payout executed: Policy %Ld, Amount: $%.2f"
            payout.policy_id
            (Math.cents_to_usd payout.payout_amount))
        );

        List.iter errors ~f:(fun err ->
          Logs.err (fun m -> m "Payout error: %s" (error_to_string err))
        );

        Lwt.return_unit
      )
      (fun exn ->
        Logs.err (fun m -> m "Claims monitoring error: %s" (Exn.to_string exn));
        Lwt.return_unit
      )
    >>= fun () ->

    (* Sleep until next check *)
    Lwt_unix.sleep config.sample_interval_seconds >>= fun () ->
    loop ()
  in

  loop ()

(** Get payout estimate without executing *)
let estimate_payout
    (policy: policy)
    (hypothetical_price: float)
  : float =

  let payout = calculate_payout policy hypothetical_price in
  Math.cents_to_usd payout.payout_amount

(** Calculate expected value of policy for LP *)
let calculate_expected_loss
    (policy: policy)
    ~(depeg_probability: float)
    ~(expected_price_if_depeg: float)
  : float =

  (* Expected loss = P(depeg) * E[payout | depeg] *)
  let payout_if_depeg = estimate_payout policy expected_price_if_depeg in
  depeg_probability *. payout_if_depeg

(** Claims statistics *)
type claims_stats = {
  total_claims_processed: int;
  total_payout_usd: float;
  average_payout_usd: float;
  claims_by_asset: (asset * int) list;
  largest_payout_usd: float;
  total_policies_triggered: int;
  total_policies_paid: int;
} [@@deriving sexp, yojson]

let calculate_claims_stats (payouts: payout_result list) : claims_stats =
  let total_claims = List.length payouts in

  let total_payout = List.fold payouts ~init:0L ~f:(fun acc p ->
    Int64.(acc + p.payout_amount)
  ) in

  let total_payout_usd = Math.cents_to_usd total_payout in

  let average_payout_usd =
    if total_claims = 0 then 0.0
    else total_payout_usd /. Float.of_int total_claims
  in

  let largest_payout = List.fold payouts ~init:0L ~f:(fun acc p ->
    Int64.max acc p.payout_amount
  ) in

  {
    total_claims_processed = total_claims;
    total_payout_usd;
    average_payout_usd;
    claims_by_asset = []; (* Would need policy data *)
    largest_payout_usd = Math.cents_to_usd largest_payout;
    total_policies_triggered = total_claims;
    total_policies_paid = total_claims;
  }

(** For testing: simulate a claim *)
let simulate_claim
    (policy: policy)
    (simulated_price: float)
    ~(config: claims_config)
  : trigger_check * payout_result =

  (* Simulate full trigger state *)
  let trigger_state = Some {
    policy_id = policy.policy_id;
    first_below_timestamp = Some (Unix.gettimeofday () -. config.min_trigger_duration_seconds);
    samples_below = config.required_samples;
    last_check_timestamp = Unix.gettimeofday ();
    price_samples = [];
  } in

  let trigger_check = check_trigger policy simulated_price ~config ~trigger_state in
  let payout = calculate_payout policy simulated_price in

  (trigger_check, payout)
