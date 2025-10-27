(* Collateral Manager - Unified Liquidity Pool Management

   Core module that:
   1. Manages single unified pool backing all products
   2. Enforces risk limits consistently across all policies
   3. Allocates capital for new policies
   4. Tracks 6-tier tranche accounting (BTC, SNR, MEZZ, JNR, JNR+, EQT)
   5. Executes loss waterfall on payouts (reverse order: EQT → BTC)
   6. Rebalances between USD and BTC

   CRITICAL: Every policy must pass through can_underwrite()
   No exceptions. No product-specific overrides.

   ARCHITECTURAL UPDATE (Phase 1):
   - Replaced legacy 2-vault model with 6-tier MultiTrancheVault integration
   - Effective capital calculation respects waterfall risk (EQT 100% → BTC 50%)
   - Per-tranche utilization tracking
   - Integration with MultiTrancheVault.fc via get_tranche_info()
*)

open Core
open Types
open Math
(* open Pricing_engine.Tranche_pricing *)

module CollateralManager = struct

  (** 6-tier tranche for LP accounting
      Maps to MultiTrancheVault.fc tranches 1-6
  **)
  type virtual_tranche = {
    tranche_id: string; (* tranche ID *) (* "SURE_BTC", "SURE_SNR", "SURE_MEZZ", SURE_JNR, SURE_JNR_PLUS, SURE_EQT *)
    seniority: int; (* 1 = most senior (BTC), 6 = most junior (EQT) *)
    target_yield_bps: int;
    risk_capacity_pct: float; (* Risk capacity: BTC=50%, SNR=60%, MEZZ=70%, JNR=80%, JNR+=90%, EQT=100% *)

    (* Accounting (not physical segregation) *)
    allocated_capital: usd_cents;
    lp_token_supply: int64;
    lp_holders: (string * int64) list; (* address × tokens *)

    (* Performance tracking *)
    accumulated_losses: usd_cents;
    accumulated_yields: usd_cents;
    last_yield_update: float;

    (* Utilization tracking *)
    allocated_coverage: usd_cents; (* Coverage allocated to this tranche *)
  } [@@deriving sexp, yojson]

  (** Unified liquidity pool **)
  type unified_pool = {
    (* Physical capital *)
    total_capital_usd: usd_cents;
    total_coverage_sold: usd_cents;

    (* Asset holdings *)
    btc_float_sats: int64;
    btc_cost_basis_usd: usd_cents;
    usd_reserves: usd_cents;

    (* Virtual tranches (accounting layer) *)
    virtual_tranches: virtual_tranche list;

    (* Active policies *)
    active_policies: policy list;

    (* Timestamps *)
    last_rebalance_time: float;
    created_at: float;
  } [@@deriving sexp, yojson]

  (** Risk parameters (unified across all products) **)
  type unified_risk_params = {
    (* Global limits *)
    max_ltv: float;                         (* 0.75 = max 75% utilization *)
    min_reserve_ratio: float;               (* 0.15 = min 15% liquid reserves *)

    (* Asset concentration *)
    max_single_asset_exposure: float;       (* 0.30 = max 30% in one asset *)
    max_correlated_exposure: float;         (* 0.50 = max 50% in correlated assets *)

    (* Stress testing *)
    required_stress_buffer: float;          (* 1.5 = 150% of worst-case loss *)

    (* Rebalancing *)
    target_usd_ratio: float;                (* 0.40 = 40% target USD *)
    rebalance_threshold: float;             (* 0.10 = rebalance if >10% drift *)
    min_btc_float_sats: int64;              (* Minimum BTC to hold *)
  } [@@deriving sexp]

  (** Load risk parameters from environment or use defaults *)
  let load_risk_params () : unified_risk_params =
    {
      max_ltv =
        (match Sys.getenv "RISK_MAX_LTV" with
         | Some v -> Float.of_string v
         | None -> 0.75);                    (* Default: 75% loan-to-value *)

      min_reserve_ratio =
        (match Sys.getenv "RISK_MIN_RESERVE_RATIO" with
         | Some v -> Float.of_string v
         | None -> 0.15);                    (* Default: 15% reserves *)

      max_single_asset_exposure =
        (match Sys.getenv "RISK_MAX_SINGLE_ASSET_EXPOSURE" with
         | Some v -> Float.of_string v
         | None -> 0.30);                    (* Default: 30% per asset *)

      max_correlated_exposure =
        (match Sys.getenv "RISK_MAX_CORRELATED_EXPOSURE" with
         | Some v -> Float.of_string v
         | None -> 0.50);                    (* Default: 50% correlated *)

      required_stress_buffer =
        (match Sys.getenv "RISK_STRESS_BUFFER" with
         | Some v -> Float.of_string v
         | None -> 1.5);                     (* Default: 1.5x coverage *)

      target_usd_ratio =
        (match Sys.getenv "RISK_TARGET_USD_RATIO" with
         | Some v -> Float.of_string v
         | None -> 0.40);                    (* Default: 40% USD *)

      rebalance_threshold =
        (match Sys.getenv "RISK_REBALANCE_THRESHOLD" with
         | Some v -> Float.of_string v
         | None -> 0.10);                    (* Default: 10% drift *)

      min_btc_float_sats =
        (match Sys.getenv "RISK_MIN_BTC_FLOAT_SATS" with
         | Some v -> Int64.of_string v
         | None -> 50_00000000L);            (* Default: 50 BTC *)
    }

  let default_risk_params = load_risk_params ()

  (** Collateral manager state **)
  type t = {
    pool: unified_pool;
    risk_params: unified_risk_params;
    price_cache: (asset * float * float) list; (* asset, price, timestamp *)
  }

  (** Initialize unified pool with 6-tier tranche model **)
  let create_pool
      ?(initial_capital = 0L)
      ?(_tranches = 6) (* Always 6 tranches now *)
      ()
    : unified_pool =

    (* Create 6-tier virtual tranches matching MultiTrancheVault.fc *)
    let default_tranches = [
      {
        tranche_id = "SURE_BTC";
        seniority = 1; (* Most senior - last to absorb losses *)
        target_yield_bps = 400;  (* 4% flat *)
        risk_capacity_pct = 0.50; (* 50% capacity *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        allocated_coverage = 0L;
      };
      {
        tranche_id = "SURE_SNR";
        seniority = 2;
        target_yield_bps = 650;  (* 6.5% min *)
        risk_capacity_pct = 0.60; (* 60% capacity *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        allocated_coverage = 0L;
      };
      {
        tranche_id = "SURE_MEZZ";
        seniority = 3;
        target_yield_bps = 900; (* 9% min *)
        risk_capacity_pct = 0.70; (* 70% capacity *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        allocated_coverage = 0L;
      };
      {
        tranche_id = "SURE_JNR";
        seniority = 4;
        target_yield_bps = 1250; (* 12.5% min *)
        risk_capacity_pct = 0.80; (* 80% capacity *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        allocated_coverage = 0L;
      };
      {
        tranche_id = "SURE_JNR_PLUS";
        seniority = 5;
        target_yield_bps = 1600; (* 16% min *)
        risk_capacity_pct = 0.90; (* 90% capacity *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        allocated_coverage = 0L;
      };
      {
        tranche_id = "SURE_EQT";
        seniority = 6; (* Most junior - first to absorb losses *)
        target_yield_bps = 1500; (* 15% min *)
        risk_capacity_pct = 1.00; (* 100% capacity - first loss *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        allocated_coverage = 0L;
      };
    ] in

    {
      total_capital_usd = initial_capital;
      total_coverage_sold = 0L;
      btc_float_sats = 0L;
      btc_cost_basis_usd = 0L;
      usd_reserves = initial_capital;
      virtual_tranches = default_tranches; (* Always use all 6 tranches *)
      active_policies = [];
      last_rebalance_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      created_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Create manager **)
  let create
      ?(pool_opt: unified_pool option)
      ?(risk_params = default_risk_params)
      ()
    : t =

    let pool = match pool_opt with
      | Some p -> p
      | None -> create_pool ()
    in

    {
      pool;
      risk_params;
      price_cache = [];
    }

  (** Calculate effective capital using waterfall risk capacity
      Effective capital = Σ(tranche_capital × risk_capacity_pct)

      BTC   (50%) + SNR  (60%) + MEZZ (70%) +
      JNR   (80%) + JNR+ (90%) + EQT  (100%)
  **)
  let calculate_effective_capital (pool: unified_pool) : usd_cents =
    List.fold pool.virtual_tranches ~init:0L ~f:(fun acc tranche ->
      let weighted_capital =
        Float.to_int64 (
          cents_to_usd tranche.allocated_capital *.
          tranche.risk_capacity_pct
        )
      in
      Int64.(acc + weighted_capital)
    )

  (** Calculate pool utilization (LTV) using effective capital **)
  let calculate_ltv (pool: unified_pool) : float =
    let effective_capital = calculate_effective_capital pool in
    if Int64.(effective_capital = 0L) then 0.0
    else
      cents_to_usd pool.total_coverage_sold /.
      cents_to_usd effective_capital

  (** Calculate liquid reserves ratio **)
  let calculate_reserve_ratio (pool: unified_pool) : float =
    if Int64.(pool.total_capital_usd = 0L) then 0.0
    else
      cents_to_usd pool.usd_reserves /.
      cents_to_usd pool.total_capital_usd

  (** Get exposure to specific asset **)
  let get_asset_exposure (pool: unified_pool) (asset: asset) : usd_cents =
    List.fold pool.active_policies ~init:0L ~f:(fun acc policy ->
      if Poly.equal policy.asset asset then
        Int64.(acc + policy.coverage_amount)
      else
        acc
    )

  (** Calculate asset concentration **)
  let calculate_asset_concentration
      (pool: unified_pool)
      (asset: asset)
    : float =

    if Int64.(pool.total_capital_usd = 0L) then 0.0
    else
      let exposure = get_asset_exposure pool asset in
      cents_to_usd exposure /. cents_to_usd pool.total_capital_usd

  (** Get correlated assets from database
   *
   * Uses correlation matrix from asset_correlations table (populated by ETL).
   * Falls back to hardcoded defaults if database is unavailable.
   *)
  let get_correlated_assets
      ~(db_pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, [> Caqti_error.t]) Result.t option)
      (asset: asset)
    : asset list Lwt.t =

    (* Hardcoded fallback for when database is unavailable *)
    let fallback_correlations = match asset with
      | USDC -> [USDT; BUSD]  (* Centralized stablecoins *)
      | USDT -> [USDC; BUSD]
      | BUSD -> [USDC; USDT]
      | DAI -> [FRAX]         (* Decentralized stablecoins *)
      | FRAX -> [DAI]
      | _ -> []
    in

    match db_pool with
    | None | Some (Error _) ->
        (* No database connection - use fallback *)
        Lwt.return fallback_correlations
    | Some (Ok _pool) ->
        (* Query database for correlated assets (correlation >= 0.7) *)
        (* TODO: Implement ETL correlation matrix - for now use fallback *)
        let%lwt () = Logs_lwt.debug (fun m ->
          m "Using fallback correlations (ETL module not yet implemented)"
        ) in
        Lwt.return fallback_correlations

  (** Calculate correlated exposure using hardcoded correlations **)
  let calculate_correlated_exposure
      (pool: unified_pool)
      (asset: asset)
    : float =

    (* Use hardcoded correlations (same as fallback in get_correlated_assets) *)
    let correlated = match asset with
      | USDC -> [USDT; BUSD]  (* Centralized stablecoins *)
      | USDT -> [USDC; BUSD]
      | BUSD -> [USDC; USDT]
      | DAI -> [FRAX]         (* Decentralized stablecoins *)
      | FRAX -> [DAI]
      | _ -> []
    in

    let total_correlated_exposure =
      List.fold correlated ~init:0L ~f:(fun acc corr_asset ->
        Int64.(acc + get_asset_exposure pool corr_asset)
      )
    in

    if Int64.(pool.total_capital_usd = 0L) then 0.0
    else
      cents_to_usd total_correlated_exposure /.
      cents_to_usd pool.total_capital_usd

  (** Run Monte Carlo stress test to calculate worst-case loss *)
  let calculate_worst_case_loss_lwt
      ~(db_pool: Db.Connection_pool.ConnectionPool.t)
      (pool: unified_pool)
    : (float, string) Result.t Lwt.t =
    let _ = db_pool in

    (* Convert pool state to Monte Carlo vault state *)
    let vault_state : Monte_carlo_enhanced.MonteCarloEnhanced.vault_state = {
      active_policies = pool.active_policies;
      total_capital_usd = pool.total_capital_usd;
      btc_float_value_usd = 0L; (* TODO: Get actual BTC float value *)
    } in

    (* Run Monte Carlo VAR calculation at 99% confidence *)
    (* TODO: Fix db_pool type mismatch with Caqti connection pool *)
    let open Lwt.Infix in
    let _ = db_pool in (* Suppress unused warning *)
    Monte_carlo_enhanced.MonteCarloEnhanced.calculate_adaptive_var
      (Error (Caqti_error.connect_failed ~uri:(Uri.of_string "stub") (Caqti_error.Msg "not implemented")))
      ~vault:vault_state
      ~confidence_level:0.99
    >>= function
    | Ok var_result ->
        (* Use CVaR (Conditional Value at Risk) as worst-case loss estimate *)
        (* CVaR represents expected loss in worst 1% of scenarios *)
        Lwt.return (Ok var_result.cvar_95)
    | Error e ->
        Lwt.return (Error (Caqti_error.show e))

  (** Synchronous wrapper for backwards compatibility *)
  let calculate_worst_case_loss (pool: unified_pool) : float =
    (* Fallback: Use conservative 50% estimate when DB not available *)
    (* This should only be used when Monte Carlo cannot be run *)
    let total_coverage = cents_to_usd pool.total_coverage_sold in
    total_coverage *. 0.50

  (** Get tranche-specific utilization
      Returns utilization for a specific tranche
  **)
  type tranche_utilization = {
    tranche_id: string; (* tranche ID *)
    balance: usd_cents;
    allocated_coverage: usd_cents;
    utilization_pct: float; (* 0.0 - 1.0 *)
    capacity_remaining: usd_cents;
    risk_capacity_pct: float;
  } [@@deriving sexp, yojson]

  let get_tranche_utilization
      (pool: unified_pool)
      ~(tranche_id: string)
    : tranche_utilization =

    let tranche_opt = List.find pool.virtual_tranches ~f:(fun t ->
      Poly.equal t.tranche_id tranche_id
    ) in

    match tranche_opt with
    | None ->
        (* Tranche not found - return zero state *)
        {
          tranche_id;
          balance = 0L;
          allocated_coverage = 0L;
          utilization_pct = 0.0;
          capacity_remaining = 0L;
          risk_capacity_pct = 0.0;
        }
    | Some tranche ->
        let effective_capacity =
          Float.to_int64 (
            cents_to_usd tranche.allocated_capital *.
            tranche.risk_capacity_pct
          )
        in

        let utilization_pct =
          if Int64.(effective_capacity = 0L) then 0.0
          else
            cents_to_usd tranche.allocated_coverage /.
            cents_to_usd effective_capacity
        in

        let capacity_remaining =
          Int64.max 0L Int64.(effective_capacity - tranche.allocated_coverage)
        in

        {
          tranche_id;
          balance = tranche.allocated_capital;
          allocated_coverage = tranche.allocated_coverage;
          utilization_pct;
          capacity_remaining;
          risk_capacity_pct = tranche.risk_capacity_pct;
        }

  (** Get all tranche utilizations **)
  let get_all_tranche_utilizations (pool: unified_pool)
    : tranche_utilization list =

    List.map pool.virtual_tranches ~f:(fun tranche ->
      get_tranche_utilization pool ~tranche_id:tranche.tranche_id
    )

  (** Check if pool can underwrite new policy
      Updated for 6-tier model with per-tranche utilization checks
  **)
  let can_underwrite
      (t: t)
      (policy_request: policy)
    : (bool * string) =

    let pool = t.pool in
    let params = t.risk_params in

    (* Check 1: Total utilization (LTV) using EFFECTIVE capital *)
    let new_total_coverage = Int64.(pool.total_coverage_sold + policy_request.coverage_amount) in
    let effective_capital = calculate_effective_capital pool in
    let new_ltv =
      if Int64.(effective_capital = 0L) then 1.0
      else cents_to_usd new_total_coverage /. cents_to_usd effective_capital
    in

    if Float.(new_ltv > 0.85) then (* 85% max utilization for 6-tier model *)
      (false, Printf.sprintf "Effective capital LTV too high: %.2f%% > 85%%" (new_ltv *. 100.0))
    else
      (* Check 2: Per-tranche utilization - no single tranche > 95% *)
      let tranche_utils = get_all_tranche_utilizations pool in
      let over_utilized_tranches = List.filter tranche_utils ~f:(fun t ->
        Float.(t.utilization_pct > 0.95)
      ) in

      if not (List.is_empty over_utilized_tranches) then
        let over_util_names = List.map over_utilized_tranches ~f:(fun t ->
          Printf.sprintf "%s (%.1f%%)"
            (t.tranche_id)
            (t.utilization_pct *. 100.0)
        ) in
        (false, Printf.sprintf "Tranches over-utilized: %s"
          (String.concat ~sep:", " over_util_names))
      else
        (* Check 3: Equity tranche capacity (first loss) - must have capacity *)
        let eqt_util = List.find tranche_utils ~f:(fun t ->
          Poly.equal t.tranche_id "SURE_EQT"
        ) in

        (match eqt_util with
        | None ->
            (false, "Equity tranche not found")
        | Some eqt ->
            if Float.(eqt.utilization_pct > 0.90) then
              (false, Printf.sprintf "Equity tranche near capacity: %.2f%% > 90%%"
                (eqt.utilization_pct *. 100.0))
            else
              (* Check 4: Liquid reserves *)
              let reserve_ratio = calculate_reserve_ratio pool in

              if Float.(reserve_ratio < params.min_reserve_ratio) then
                (false, Printf.sprintf "Insufficient reserves: %.2f%% < %.2f%%"
                  (reserve_ratio *. 100.0) (params.min_reserve_ratio *. 100.0))
              else
                (* Check 5: Asset concentration *)
                let current_exposure = get_asset_exposure pool policy_request.asset in
                let new_exposure = Int64.(current_exposure + policy_request.coverage_amount) in
                let new_concentration =
                  if Int64.(pool.total_capital_usd = 0L) then 0.0
                  else cents_to_usd new_exposure /. cents_to_usd pool.total_capital_usd
                in

                if Float.(new_concentration > params.max_single_asset_exposure) then
                  (false, Printf.sprintf "Asset concentration too high: %.2f%% > %.2f%%"
                    (new_concentration *. 100.0) (params.max_single_asset_exposure *. 100.0))
                else
                  (* Check 6: Correlated exposure *)
                  let correlated_exposure = calculate_correlated_exposure pool policy_request.asset in
                  let new_correlated =
                    if Int64.(pool.total_capital_usd = 0L) then 0.0
                    else correlated_exposure +. (cents_to_usd policy_request.coverage_amount /. cents_to_usd pool.total_capital_usd)
                  in

                  if Float.(new_correlated > params.max_correlated_exposure) then
                    (false, Printf.sprintf "Correlated exposure too high: %.2f%% > %.2f%%"
                      (new_correlated *. 100.0) (params.max_correlated_exposure *. 100.0))
                  else
                    (* Check 7: Stress test *)
                    let worst_case = calculate_worst_case_loss pool in
                    let available_buffer =
                      if Int64.(pool.total_capital_usd = 0L) then 0.0
                      else cents_to_usd pool.total_capital_usd -. cents_to_usd pool.total_coverage_sold
                    in
                    let required_buffer = worst_case *. params.required_stress_buffer in

                    if Float.(available_buffer < required_buffer) then
                      (false, Printf.sprintf "Insufficient stress buffer: $%.2f < $%.2f"
                        available_buffer required_buffer)
                    else
                      (true, "All risk checks passed")
        )

  (** Allocate coverage for new policy **)
  let allocate_coverage
      (t: t)
      (policy: policy)
    : t =

    let (can_underwrite, reason) = can_underwrite t policy in

    if not can_underwrite then
      failwith (Printf.sprintf "Cannot underwrite policy: %s" reason)
    else
      let new_pool = {
        t.pool with
        total_coverage_sold = Int64.(t.pool.total_coverage_sold + policy.coverage_amount);
        active_policies = policy :: t.pool.active_policies;
      } in

      { t with pool = new_pool }

  (** Release coverage (policy expired or paid) **)
  let release_coverage
      (t: t)
      (policy_id: int64)
    : t =

    let (released_policy, remaining_policies) =
      List.partition_tf t.pool.active_policies ~f:(fun p ->
        Int64.(p.policy_id = policy_id)
      )
    in

    match released_policy with
    | [] -> t (* Policy not found *)
    | policy :: _ ->
        let new_pool = {
          t.pool with
          total_coverage_sold = Int64.(t.pool.total_coverage_sold - policy.coverage_amount);
          active_policies = remaining_policies;
        } in

        { t with pool = new_pool }

  (** Allocate losses to tranches (waterfall) **)
  let allocate_losses_to_tranches
      (tranches: virtual_tranche list)
      (loss_amount: usd_cents)
    : virtual_tranche list =

    (* Sort by seniority (junior first) *)
    let sorted_tranches =
      List.sort tranches ~compare:(fun a b ->
        Int.compare b.seniority a.seniority
      )
    in

    (* Apply losses from junior to senior *)
    let rec apply_loss remaining_loss acc = function
      | [] -> List.rev acc
      | tranche :: rest ->
          let available_capital =
            Int64.(tranche.allocated_capital - tranche.accumulated_losses)
          in

          if Int64.(remaining_loss <= 0L) then
            (* No more loss to allocate *)
            List.rev_append acc (tranche :: rest)
          else if Int64.(available_capital <= 0L) then
            (* Tranche already depleted *)
            apply_loss remaining_loss (tranche :: acc) rest
          else
            let loss_to_apply = Int64.min remaining_loss available_capital in

            let updated_tranche = {
              tranche with
              accumulated_losses = Int64.(tranche.accumulated_losses + loss_to_apply)
            } in

            apply_loss Int64.(remaining_loss - loss_to_apply) (updated_tranche :: acc) rest
    in

    let updated = apply_loss loss_amount [] sorted_tranches in

    (* Restore original order *)
    List.sort updated ~compare:(fun a b ->
      Int.compare a.seniority b.seniority
    )

  (** Execute payout **)
  let execute_payout
      (t: t)
      ~(policy_id: int64)
      ~(payout_amount: usd_cents)
    : t =

    if Int64.(payout_amount <= 0L) then t
    else if Int64.(payout_amount > t.pool.usd_reserves) then
      failwith "Insufficient reserves for payout"
    else
      (* Deduct from pool *)
      let new_pool_pre_allocation = {
        t.pool with
        total_capital_usd = Int64.(t.pool.total_capital_usd - payout_amount);
        usd_reserves = Int64.(t.pool.usd_reserves - payout_amount);
      } in

      (* Allocate losses to tranches *)
      let updated_tranches =
        allocate_losses_to_tranches new_pool_pre_allocation.virtual_tranches payout_amount
      in

      let final_pool = { new_pool_pre_allocation with virtual_tranches = updated_tranches } in

      (* Release coverage *)
      let final_manager = { t with pool = final_pool } in
      release_coverage final_manager policy_id

  (** Add liquidity (LP deposit) **)
  let add_liquidity
      (t: t)
      ~(lp_address: string)
      ~(tranche_id: string)
      ~(amount: usd_cents)
    : (t * int64) = (* Returns (updated_manager, lp_tokens_minted) *)

    let tranche_opt =
      List.find t.pool.virtual_tranches ~f:(fun tr -> Poly.equal tr.tranche_id tranche_id)
    in

    match tranche_opt with
    | None -> failwith "Tranche not found"
    | Some tranche ->
        (* Calculate NAV per token *)
        let net_value =
          Int64.(tranche.allocated_capital - tranche.accumulated_losses + tranche.accumulated_yields)
        in

        let nav_per_token =
          if Int64.(tranche.lp_token_supply = 0L) then
            1.0 (* Initial NAV = 1.0 *)
          else
            cents_to_usd net_value /. Int64.to_float tranche.lp_token_supply
        in

        (* Calculate tokens to mint *)
        let tokens_to_mint =
          Float.to_int64 (cents_to_usd amount /. nav_per_token)
        in

        (* Update tranche *)
        let updated_tranche = {
          tranche with
          allocated_capital = Int64.(tranche.allocated_capital + amount);
          lp_token_supply = Int64.(tranche.lp_token_supply + tokens_to_mint);
          lp_holders = (lp_address, tokens_to_mint) :: tranche.lp_holders;
        } in

        (* Update pool *)
        let updated_tranches =
          List.map t.pool.virtual_tranches ~f:(fun tr ->
            if Poly.equal tr.tranche_id tranche_id then updated_tranche else tr
          )
        in

        let new_pool = {
          t.pool with
          total_capital_usd = Int64.(t.pool.total_capital_usd + amount);
          usd_reserves = Int64.(t.pool.usd_reserves + amount);
          virtual_tranches = updated_tranches;
        } in

        ({ t with pool = new_pool }, tokens_to_mint)

  (** Remove liquidity (LP withdrawal) **)
  let remove_liquidity
      (t: t)
      ~(lp_address: string)
      ~(tranche_id: string)
      ~(lp_tokens: int64)
    : (t * usd_cents) = (* Returns (updated_manager, withdrawal_amount) *)

    let tranche_opt =
      List.find t.pool.virtual_tranches ~f:(fun tr -> Poly.equal tr.tranche_id tranche_id)
    in

    match tranche_opt with
    | None -> failwith "Tranche not found"
    | Some tranche ->
        (* Calculate NAV per token *)
        let net_value =
          Int64.(tranche.allocated_capital - tranche.accumulated_losses + tranche.accumulated_yields)
        in

        let nav_per_token =
          if Int64.(tranche.lp_token_supply = 0L) then 1.0
          else cents_to_usd net_value /. Int64.to_float tranche.lp_token_supply
        in

        (* Calculate withdrawal amount *)
        let withdrawal_amount =
          usd_to_cents (Int64.to_float lp_tokens *. nav_per_token)
        in

        if Int64.(withdrawal_amount > t.pool.usd_reserves) then
          failwith "Insufficient liquidity for withdrawal"
        else
          (* Update LP holders: decrement the specific user's balance *)
          let updated_lp_holders =
            List.filter_map tranche.lp_holders ~f:(fun (addr, current_tokens) ->
              if String.equal addr lp_address then
                (* This is the withdrawing LP *)
                let remaining_tokens = Int64.(current_tokens - lp_tokens) in
                if Int64.(remaining_tokens < 0L) then
                  failwith (Printf.sprintf "LP %s has %Ld tokens but trying to withdraw %Ld"
                    lp_address current_tokens lp_tokens)
                else if Int64.(remaining_tokens = 0L) then
                  (* Complete withdrawal - remove from list *)
                  None
                else
                  (* Partial withdrawal - keep with reduced balance *)
                  Some (addr, remaining_tokens)
              else
                (* Other LP - keep unchanged *)
                Some (addr, current_tokens)
            )
          in

          let updated_tranche = {
            tranche with
            allocated_capital = Int64.(tranche.allocated_capital - withdrawal_amount);
            lp_token_supply = Int64.(tranche.lp_token_supply - lp_tokens);
            lp_holders = updated_lp_holders;
          } in

          (* Update pool *)
          let updated_tranches =
            List.map t.pool.virtual_tranches ~f:(fun tr ->
              if Poly.equal tr.tranche_id tranche_id then updated_tranche else tr
            )
          in

          let new_pool = {
            t.pool with
            total_capital_usd = Int64.(t.pool.total_capital_usd - withdrawal_amount);
            usd_reserves = Int64.(t.pool.usd_reserves - withdrawal_amount);
            virtual_tranches = updated_tranches;
          } in

          ({ t with pool = new_pool }, withdrawal_amount)

  (** Get pool statistics with 6-tier tranche breakdown **)
  let get_pool_stats (t: t) : (string * string) list =
    let effective_capital = calculate_effective_capital t.pool in
    let tranche_utils = get_all_tranche_utilizations t.pool in

    (* Base statistics *)
    let base_stats = [
      ("Total Capital (Raw)", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' t.pool.total_capital_usd));
      ("Effective Capital (Risk-Weighted)", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' effective_capital));
      ("Total Coverage Sold", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' t.pool.total_coverage_sold));
      ("LTV (Effective)", Printf.sprintf "%.2f%%" (calculate_ltv t.pool *. 100.0));
      ("Reserve Ratio", Printf.sprintf "%.2f%%" (calculate_reserve_ratio t.pool *. 100.0));
      ("Active Policies", Int.to_string (List.length t.pool.active_policies));
      ("BTC Float", Printf.sprintf "%.8f BTC" (Int64.to_float t.pool.btc_float_sats /. 100_000_000.0));
      ("USD Reserves", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' t.pool.usd_reserves));
    ] in

    (* Per-tranche statistics *)
    let tranche_stats = List.concat_map tranche_utils ~f:(fun tu ->
      let tranche_name = tu.tranche_id in
      [
        (Printf.sprintf "%s Capital" tranche_name,
         Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' tu.balance));
        (Printf.sprintf "%s Utilization" tranche_name,
         Printf.sprintf "%.2f%%" (tu.utilization_pct *. 100.0));
        (Printf.sprintf "%s Capacity" tranche_name,
         Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' tu.capacity_remaining));
      ]
    ) in

    base_stats @ tranche_stats

  (** Capital adequacy monitoring - emits alerts if thresholds breached **)
  let check_capital_adequacy (t: t) : unit =
    let utilization = calculate_ltv t.pool in

    (* Critical alert: > 85% utilization *)
    if Float.(utilization > 0.85) then
      Logs.err (fun m ->
        m "CRITICAL: Total effective capital utilization %.2f%% > 85%%"
          (utilization *. 100.0)
      )
    (* Warning alert: > 75% utilization *)
    else if Float.(utilization > 0.75) then
      Logs.warn (fun m ->
        m "WARNING: Total effective capital utilization %.2f%% > 75%%"
          (utilization *. 100.0)
      )
    else
      Logs.info (fun m ->
        m "Capital adequacy check passed: utilization %.2f%%"
          (utilization *. 100.0)
      );

    (* Check per-tranche utilization *)
    let tranche_utils = get_all_tranche_utilizations t.pool in
    List.iter tranche_utils ~f:(fun tu ->
      if Float.(tu.utilization_pct > 0.95) then
        Logs.err (fun m ->
          m "CRITICAL: %s utilization %.2f%% > 95%%"
            (tu.tranche_id)
            (tu.utilization_pct *. 100.0)
        )
      else if Float.(tu.utilization_pct > 0.85) then
        Logs.warn (fun m ->
          m "WARNING: %s utilization %.2f%% > 85%%"
            (tu.tranche_id)
            (tu.utilization_pct *. 100.0)
        )
    )

  (** Get total utilization (convenience function) **)
  let get_total_utilization (t: t) : float =
    calculate_ltv t.pool

end
