(* Collateral Manager - Unified Liquidity Pool Management

   Core module that:
   1. Manages single unified pool backing all products
   2. Enforces risk limits consistently across all policies
   3. Allocates capital for new policies
   4. Tracks virtual tranche accounting
   5. Executes loss waterfall on payouts
   6. Rebalances between USD and BTC

   CRITICAL: Every policy must pass through can_underwrite()
   No exceptions. No product-specific overrides.
*)

open Core
open Types
open Math

module CollateralManager = struct

  (** Virtual tranche for LP accounting **)
  type virtual_tranche = {
    tranche_id: int;
    name: string;
    seniority: int; (* 1 = most senior, higher = more junior *)
    target_yield_bps: int;

    (* Accounting (not physical segregation) *)
    allocated_capital: usd_cents;
    lp_token_supply: int64;
    lp_holders: (string * int64) list; (* address × tokens *)

    (* Performance tracking *)
    accumulated_losses: usd_cents;
    accumulated_yields: usd_cents;
    last_yield_update: float;
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

  let default_risk_params = {
    max_ltv = 0.75;
    min_reserve_ratio = 0.15;
    max_single_asset_exposure = 0.30;
    max_correlated_exposure = 0.50;
    required_stress_buffer = 1.5;
    target_usd_ratio = 0.40;
    rebalance_threshold = 0.10;
    min_btc_float_sats = 50_00000000L; (* 50 BTC *)
  }

  (** Collateral manager state **)
  type t = {
    pool: unified_pool;
    risk_params: unified_risk_params;
    price_cache: (asset * float * float) list; (* asset, price, timestamp *)
  }

  (** Initialize unified pool **)
  let create_pool
      ?(initial_capital = 0L)
      ?(tranches = 3)
      ()
    : unified_pool =

    (* Create default virtual tranches *)
    let default_tranches = [
      {
        tranche_id = 1;
        name = "Senior";
        seniority = 1;
        target_yield_bps = 800;  (* 8% *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Unix.time ();
      };
      {
        tranche_id = 2;
        name = "Mezzanine";
        seniority = 2;
        target_yield_bps = 1200; (* 12% *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Unix.time ();
      };
      {
        tranche_id = 3;
        name = "Junior";
        seniority = 3;
        target_yield_bps = 2000; (* 20% *)
        allocated_capital = 0L;
        lp_token_supply = 0L;
        lp_holders = [];
        accumulated_losses = 0L;
        accumulated_yields = 0L;
        last_yield_update = Unix.time ();
      };
    ] in

    {
      total_capital_usd = initial_capital;
      total_coverage_sold = 0L;
      btc_float_sats = 0L;
      btc_cost_basis_usd = 0L;
      usd_reserves = initial_capital;
      virtual_tranches = List.take default_tranches tranches;
      active_policies = [];
      last_rebalance_time = Unix.time ();
      created_at = Unix.time ();
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

  (** Calculate pool utilization (LTV) **)
  let calculate_ltv (pool: unified_pool) : float =
    if pool.total_capital_usd = 0L then 0.0
    else
      cents_to_usd pool.total_coverage_sold /.
      cents_to_usd pool.total_capital_usd

  (** Calculate liquid reserves ratio **)
  let calculate_reserve_ratio (pool: unified_pool) : float =
    if pool.total_capital_usd = 0L then 0.0
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

    if pool.total_capital_usd = 0L then 0.0
    else
      let exposure = get_asset_exposure pool asset in
      cents_to_usd exposure /. cents_to_usd pool.total_capital_usd

  (** Get correlated assets (hardcoded for now) **)
  let get_correlated_assets (asset: asset) : asset list =
    match asset with
    | USDC -> [USDT; BUSD]  (* Centralized stablecoins *)
    | USDT -> [USDC; BUSD]
    | BUSD -> [USDC; USDT]
    | DAI -> [FRAX]         (* Decentralized stablecoins *)
    | FRAX -> [DAI]
    | _ -> []

  (** Calculate correlated exposure **)
  let calculate_correlated_exposure
      (pool: unified_pool)
      (asset: asset)
    : float =

    let correlated = get_correlated_assets asset in

    let total_correlated_exposure =
      List.fold correlated ~init:0L ~f:(fun acc corr_asset ->
        Int64.(acc + get_asset_exposure pool corr_asset)
      )
    in

    if pool.total_capital_usd = 0L then 0.0
    else
      cents_to_usd total_correlated_exposure /.
      cents_to_usd pool.total_capital_usd

  (** Run simplified stress test **)
  let calculate_worst_case_loss (pool: unified_pool) : float =
    (* Simplified: assume 50% of coverage triggers simultaneously *)
    (* Real implementation would use Risk_model.StressTest *)

    let total_coverage = cents_to_usd pool.total_coverage_sold in
    total_coverage *. 0.50

  (** Check if pool can underwrite new policy **)
  let can_underwrite
      (t: t)
      (policy_request: policy)
    : (bool * string) =

    let pool = t.pool in
    let params = t.risk_params in

    (* Check 1: Total utilization (LTV) *)
    let new_total_coverage = Int64.(pool.total_coverage_sold + policy_request.coverage_amount) in
    let new_ltv = cents_to_usd new_total_coverage /. cents_to_usd pool.total_capital_usd in

    if new_ltv > params.max_ltv then
      (false, Printf.sprintf "LTV too high: %.2f%% > %.2f%%" (new_ltv *. 100.0) (params.max_ltv *. 100.0))
    else
      (* Check 2: Liquid reserves *)
      let reserve_ratio = calculate_reserve_ratio pool in

      if reserve_ratio < params.min_reserve_ratio then
        (false, Printf.sprintf "Insufficient reserves: %.2f%% < %.2f%%" (reserve_ratio *. 100.0) (params.min_reserve_ratio *. 100.0))
      else
        (* Check 3: Asset concentration *)
        let current_exposure = get_asset_exposure pool policy_request.asset in
        let new_exposure = Int64.(current_exposure + policy_request.coverage_amount) in
        let new_concentration = cents_to_usd new_exposure /. cents_to_usd pool.total_capital_usd in

        if new_concentration > params.max_single_asset_exposure then
          (false, Printf.sprintf "Asset concentration too high: %.2f%% > %.2f%%"
            (new_concentration *. 100.0) (params.max_single_asset_exposure *. 100.0))
        else
          (* Check 4: Correlated exposure *)
          let correlated_exposure = calculate_correlated_exposure pool policy_request.asset in
          let new_correlated = correlated_exposure +. (cents_to_usd policy_request.coverage_amount /. cents_to_usd pool.total_capital_usd) in

          if new_correlated > params.max_correlated_exposure then
            (false, Printf.sprintf "Correlated exposure too high: %.2f%% > %.2f%%"
              (new_correlated *. 100.0) (params.max_correlated_exposure *. 100.0))
          else
            (* Check 5: Stress test *)
            let worst_case = calculate_worst_case_loss pool in
            let available_buffer = cents_to_usd pool.total_capital_usd -. cents_to_usd pool.total_coverage_sold in
            let required_buffer = worst_case *. params.required_stress_buffer in

            if available_buffer < required_buffer then
              (false, Printf.sprintf "Insufficient stress buffer: $%.2f < $%.2f"
                available_buffer required_buffer)
            else
              (true, "All risk checks passed")

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
        p.policy_id = policy_id
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

          if remaining_loss <= 0L then
            (* No more loss to allocate *)
            List.rev_append acc (tranche :: rest)
          else if available_capital <= 0L then
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

    if payout_amount <= 0L then t
    else if payout_amount > t.pool.usd_reserves then
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
      ~(tranche_id: int)
      ~(amount: usd_cents)
    : (t * int64) = (* Returns (updated_manager, lp_tokens_minted) *)

    let tranche_opt =
      List.find t.pool.virtual_tranches ~f:(fun tr -> tr.tranche_id = tranche_id)
    in

    match tranche_opt with
    | None -> failwith "Tranche not found"
    | Some tranche ->
        (* Calculate NAV per token *)
        let net_value =
          Int64.(tranche.allocated_capital - tranche.accumulated_losses + tranche.accumulated_yields)
        in

        let nav_per_token =
          if tranche.lp_token_supply = 0L then
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
            if tr.tranche_id = tranche_id then updated_tranche else tr
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
      ~(tranche_id: int)
      ~(lp_tokens: int64)
    : (t * usd_cents) = (* Returns (updated_manager, withdrawal_amount) *)

    let tranche_opt =
      List.find t.pool.virtual_tranches ~f:(fun tr -> tr.tranche_id = tranche_id)
    in

    match tranche_opt with
    | None -> failwith "Tranche not found"
    | Some tranche ->
        (* Calculate NAV per token *)
        let net_value =
          Int64.(tranche.allocated_capital - tranche.accumulated_losses + tranche.accumulated_yields)
        in

        let nav_per_token =
          if tranche.lp_token_supply = 0L then 1.0
          else cents_to_usd net_value /. Int64.to_float tranche.lp_token_supply
        in

        (* Calculate withdrawal amount *)
        let withdrawal_amount =
          usd_to_cents (Int64.to_float lp_tokens *. nav_per_token)
        in

        if withdrawal_amount > t.pool.usd_reserves then
          failwith "Insufficient liquidity for withdrawal"
        else
          (* Update tranche *)
          let updated_lp_holders =
            List.filter tranche.lp_holders ~f:(fun (addr, _) ->
              not (String.equal addr lp_address)
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
              if tr.tranche_id = tranche_id then updated_tranche else tr
            )
          in

          let new_pool = {
            t.pool with
            total_capital_usd = Int64.(t.pool.total_capital_usd - withdrawal_amount);
            usd_reserves = Int64.(t.pool.usd_reserves - withdrawal_amount);
            virtual_tranches = updated_tranches;
          } in

          ({ t with pool = new_pool }, withdrawal_amount)

  (** Get pool statistics **)
  let get_pool_stats (t: t) : (string * string) list =
    [
      ("Total Capital", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' t.pool.total_capital_usd));
      ("Total Coverage Sold", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' t.pool.total_coverage_sold));
      ("LTV", Printf.sprintf "%.2f%%" (calculate_ltv t.pool *. 100.0));
      ("Reserve Ratio", Printf.sprintf "%.2f%%" (calculate_reserve_ratio t.pool *. 100.0));
      ("Active Policies", Int.to_string (List.length t.pool.active_policies));
      ("BTC Float", Printf.sprintf "%.8f BTC" (Int64.to_float t.pool.btc_float_sats /. 100_000_000.0));
      ("USD Reserves", Printf.sprintf "$%s" (Int64.to_string_hum ~delimiter:',' t.pool.usd_reserves));
    ]

end
