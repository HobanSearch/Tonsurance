(** API Server using Dream framework

    Exposes REST endpoints for:
    - Policy quotes and purchases
    - Policy information
    - Vault/pool status
    - LP deposits and withdrawals
    - Risk metrics
    - Claims status
*)

open Core
open Lwt.Infix
open Types

(** Server state *)
type server_state = {
  mutable collateral_manager: Collateral_manager.t;
  pricing_config: Pricing_engine.pricing_config;
  claims_config: Claims_engine.claims_config;
  mutable price_cache: (asset * float * float) list; (* asset, price, timestamp *)
}

(** Create initial server state *)
let create_server_state () =
  let pool = Collateral_manager.create_unified_pool () in
  {
    collateral_manager = Collateral_manager.create pool;
    pricing_config = Pricing_engine.default_config;
    claims_config = Claims_engine.default_config;
    price_cache = [];
  }

(** JSON helpers *)
let json_response ~status json =
  Dream.json ~status (Yojson.Safe.to_string json)

let ok_json json = json_response ~status:`OK json
let bad_request_json json = json_response ~status:`Bad_Request json
let internal_error_json json = json_response ~status:`Internal_Server_Error json

let error_response message =
  bad_request_json (`Assoc [("error", `String message)])

let success_response ?data message =
  let base = [("success", `Bool true); ("message", `String message)] in
  let fields = match data with
    | None -> base
    | Some d -> ("data", d) :: base
  in
  ok_json (`Assoc fields)

(** Parse JSON request body *)
let parse_json_body req =
  Dream.body req >>= fun body ->
  try
    Lwt.return (Ok (Yojson.Safe.from_string body))
  with _ ->
    Lwt.return (Error "Invalid JSON")

(** Fetch current price for asset *)
let get_current_price state asset =
  (* Check cache first *)
  let now = Unix.gettimeofday () in
  match List.find state.price_cache ~f:(fun (a, _, ts) ->
    equal_asset a asset && (now -. ts) < 60.0 (* 1 minute cache *)
  ) with
  | Some (_, price, _) -> Lwt.return (Ok price)
  | None ->
      (* In production, fetch from oracle *)
      (* For now, return mock prices *)
      let price = match asset with
        | USDC -> 1.0
        | USDT -> 0.9995
        | USDP -> 0.9998
        | DAI -> 0.9996
        | FRAX -> 0.9997
        | BUSD -> 0.9993
        | BTC -> 65000.0
        | ETH -> 3500.0
      in
      (* Update cache *)
      state.price_cache <- (asset, price, now) :: state.price_cache;
      Lwt.return (Ok price)

(** Endpoints *)

(** GET /health - Health check *)
let health_handler _req =
  ok_json (`Assoc [
    ("status", `String "healthy");
    ("timestamp", `Float (Unix.gettimeofday ()));
  ])

(** POST /api/v1/quote - Get premium quote *)
let quote_handler state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let asset_str = json |> member "asset" |> to_string in
        let coverage_usd = json |> member "coverage_amount_usd" |> to_float in
        let trigger_price = json |> member "trigger_price" |> to_float in
        let floor_price = json |> member "floor_price" |> to_float in
        let duration_days = json |> member "duration_days" |> to_int in

        (* Parse asset *)
        match asset_of_string asset_str with
        | Error err -> Lwt.return (error_response err)
        | Ok asset ->
            (* Get current price *)
            get_current_price state asset >>= function
            | Error err -> Lwt.return (error_response err)
            | Ok current_price ->
                (* Validate inputs *)
                if coverage_usd <= 0.0 then
                  Lwt.return (error_response "Coverage amount must be positive")
                else if trigger_price >= 1.0 then
                  Lwt.return (error_response "Trigger price must be below $1.00")
                else if floor_price >= trigger_price then
                  Lwt.return (error_response "Floor price must be below trigger price")
                else if duration_days < 1 || duration_days > 365 then
                  Lwt.return (error_response "Duration must be between 1-365 days")
                else
                  (* Calculate premium *)
                  let pool_state = Collateral_manager.get_pool_state state.collateral_manager in
                  let vault_state = Collateral_manager.pool_to_vault_state pool_state in

                  let risk_factors = Risk_model.get_risk_factors asset in
                  let market_stress = Risk_model.assess_market_stress [
                    (asset, current_price)
                  ] in

                  let actual_loss_ratio = Risk_model.calculate_loss_ratio
                    ~premiums_collected:1_000_000_00L
                    ~payouts_made:50_000_00L
                  in

                  let premium_cents = Pricing_engine.calculate_premium
                    ~asset
                    ~coverage_amount:(Math.usd_to_cents coverage_usd)
                    ~trigger_price
                    ~floor_price
                    ~duration_days
                    ~vault_state
                    ~market_stress
                    ~risk_factors
                    ~actual_loss_ratio
                  in

                  let premium_usd = Math.cents_to_usd premium_cents in
                  let premium_rate_bps = Float.to_int (premium_usd /. coverage_usd *. 10000.0) in

                  (* Check if pool can underwrite *)
                  let test_policy = {
                    policy_id = 0L;
                    policyholder = "test";
                    beneficiary = None;
                    asset;
                    coverage_amount = Math.usd_to_cents coverage_usd;
                    premium_paid = premium_cents;
                    trigger_price;
                    floor_price;
                    start_time = Unix.gettimeofday ();
                    expiry_time = Unix.gettimeofday () +. (Float.of_int duration_days *. 86400.0);
                    status = Active;
                    payout_amount = None;
                    payout_time = None;
                    is_gift = false;
                    gift_message = None;
                  } in

                  let (can_underwrite, reason) = Collateral_manager.can_underwrite
                    state.collateral_manager test_policy in

                  let response: quote_response = {
                    premium_usd;
                    premium_rate_bps;
                    coverage_usd;
                    duration_days;
                    estimated_roi = 0.0; (* TODO: Calculate based on historical data *)
                    available = can_underwrite;
                    reason = if can_underwrite then None else Some reason;
                  } in

                  Lwt.return (ok_json (quote_response_to_yojson response))

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** POST /api/v1/policy/purchase - Purchase a policy *)
let purchase_policy_handler state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let buyer = json |> member "buyer_address" |> to_string in
        let beneficiary_opt = json |> member "beneficiary_address" |> to_string_option in
        let asset_str = json |> member "asset" |> to_string in
        let coverage_usd = json |> member "coverage_amount_usd" |> to_float in
        let trigger_price = json |> member "trigger_price" |> to_float in
        let floor_price = json |> member "floor_price" |> to_float in
        let duration_days = json |> member "duration_days" |> to_int in
        let is_gift = json |> member "is_gift" |> to_bool_option |> Option.value ~default:false in
        let gift_message = json |> member "gift_message" |> to_string_option in

        match asset_of_string asset_str with
        | Error err -> Lwt.return (error_response err)
        | Ok asset ->
            (* Calculate premium (same logic as quote) *)
            get_current_price state asset >>= function
            | Error err -> Lwt.return (error_response err)
            | Ok _current_price ->
                let pool_state = Collateral_manager.get_pool_state state.collateral_manager in
                let vault_state = Collateral_manager.pool_to_vault_state pool_state in

                let risk_factors = Risk_model.get_risk_factors asset in
                let market_stress = Normal in
                let actual_loss_ratio = 0.05 in

                let premium_cents = Pricing_engine.calculate_premium
                  ~asset
                  ~coverage_amount:(Math.usd_to_cents coverage_usd)
                  ~trigger_price
                  ~floor_price
                  ~duration_days
                  ~vault_state
                  ~market_stress
                  ~risk_factors
                  ~actual_loss_ratio
                in

                (* Create policy *)
                let policy_id = Int64.of_int (Random.int 1_000_000_000) in
                let now = Unix.gettimeofday () in

                let policy: policy = {
                  policy_id;
                  policyholder = buyer;
                  beneficiary = beneficiary_opt;
                  asset;
                  coverage_amount = Math.usd_to_cents coverage_usd;
                  premium_paid = premium_cents;
                  trigger_price;
                  floor_price;
                  start_time = now;
                  expiry_time = now +. (Float.of_int duration_days *. 86400.0);
                  status = Active;
                  payout_amount = None;
                  payout_time = None;
                  is_gift;
                  gift_message;
                } in

                (* Allocate coverage *)
                let updated_mgr = Collateral_manager.allocate_coverage
                  state.collateral_manager policy in

                state.collateral_manager <- updated_mgr;

                (* TODO: Deploy actual smart contract *)
                let contract_address = Printf.sprintf "EQ...%Ld" policy_id in
                let transaction_hash = Printf.sprintf "tx_%Ld" policy_id in

                let response: policy_purchase_response = {
                  policy_id;
                  contract_address;
                  nft_minted = true;
                  premium_paid_usd = Math.cents_to_usd premium_cents;
                  transaction_hash;
                } in

                Lwt.return (ok_json (policy_purchase_response_to_yojson response))

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** GET /api/v1/policy/:id - Get policy information *)
let get_policy_handler state req =
  let policy_id_str = Dream.param req "id" in
  try
    let policy_id = Int64.of_string policy_id_str in
    let pool = Collateral_manager.get_pool_state state.collateral_manager in

    match List.find pool.active_policies ~f:(fun p ->
      Int64.(p.policy_id = policy_id)
    ) with
    | None -> Lwt.return (error_response "Policy not found")
    | Some policy ->
        get_current_price state policy.asset >>= function
        | Error err -> Lwt.return (error_response err)
        | Ok current_price ->
            let now = Unix.gettimeofday () in
            let time_remaining = Int.of_float (policy.expiry_time -. now) in
            let is_triggered = current_price < policy.trigger_price in

            let estimated_payout =
              if is_triggered then
                Some (Claims_engine.estimate_payout policy current_price)
              else
                None
            in

            let response: policy_info_response = {
              policy;
              current_asset_price = current_price;
              is_triggered;
              time_remaining_seconds = time_remaining;
              estimated_payout_usd = estimated_payout;
            } in

            Lwt.return (ok_json (policy_info_response_to_yojson response))

  with exn ->
    Lwt.return (error_response (Exn.to_string exn))

(** GET /api/v1/vault/info - Get vault status *)
let vault_info_handler state _req =
  let pool = Collateral_manager.get_pool_state state.collateral_manager in

  let total_capital = Math.cents_to_usd pool.total_capital_usd in
  let total_coverage = Math.cents_to_usd pool.total_coverage_sold in
  let usd_reserves = Math.cents_to_usd pool.usd_reserves in
  let btc_float_btc = Math.sats_to_btc pool.btc_float_sats in

  (* Get BTC price *)
  get_current_price state BTC >>= function
  | Error _ -> Lwt.return (error_response "Failed to fetch BTC price")
  | Ok btc_price ->
      let btc_float_usd = btc_float_btc *. btc_price in
      let ltv = if total_capital > 0.0 then total_coverage /. total_capital else 0.0 in
      let available_capacity = total_capital *. (1.0 -. ltv) in

      let tranches = List.map pool.virtual_tranches ~f:(fun t ->
        let nav = calculate_tranche_nav t in
        let tvl = Math.cents_to_usd t.allocated_capital in
        let yield_usd = Math.cents_to_usd t.accumulated_yields in
        let loss_usd = Math.cents_to_usd t.accumulated_losses in

        {
          tranche_id = t.tranche_id;
          seniority = t.seniority;
          target_yield_bps = t.target_yield_bps;
          nav;
          tvl_usd = tvl;
          accumulated_yield_usd = yield_usd;
          accumulated_loss_usd = loss_usd;
        }
      ) in

      let response: vault_info_response = {
        total_capital_usd = total_capital;
        total_coverage_sold_usd = total_coverage;
        ltv_ratio = ltv;
        usd_reserves_usd = usd_reserves;
        btc_float_btc;
        btc_float_usd;
        tranches;
        available_capacity_usd = available_capacity;
      } in

      Lwt.return (ok_json (vault_info_response_to_yojson response))

(** POST /api/v1/lp/deposit - LP deposit to tranche *)
let lp_deposit_handler state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let lp_address = json |> member "lp_address" |> to_string in
        let tranche_id = json |> member "tranche_id" |> to_int in
        let amount_usd = json |> member "amount_usd" |> to_float in

        let amount_cents = Math.usd_to_cents amount_usd in

        let (updated_mgr, lp_tokens) = Collateral_manager.add_liquidity
          state.collateral_manager
          ~lp_address
          ~tranche_id
          ~amount:amount_cents
        in

        state.collateral_manager <- updated_mgr;

        let response = `Assoc [
          ("lp_tokens", `Int (Int64.to_int_exn lp_tokens));
          ("tranche_id", `Int tranche_id);
          ("amount_deposited_usd", `Float amount_usd);
          ("transaction_hash", `String (Printf.sprintf "tx_deposit_%s" lp_address));
        ] in

        Lwt.return (ok_json response)

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** POST /api/v1/lp/withdraw - LP withdrawal from tranche *)
let lp_withdraw_handler state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let lp_address = json |> member "lp_address" |> to_string in
        let tranche_id = json |> member "tranche_id" |> to_int in
        let lp_tokens = json |> member "lp_tokens" |> to_int |> Int64.of_int in

        let (updated_mgr, amount_returned) = Collateral_manager.remove_liquidity
          state.collateral_manager
          ~lp_address
          ~tranche_id
          ~lp_tokens
        in

        state.collateral_manager <- updated_mgr;

        let response = `Assoc [
          ("lp_tokens_burned", `Int (Int64.to_int_exn lp_tokens));
          ("tranche_id", `Int tranche_id);
          ("amount_returned_usd", `Float (Math.cents_to_usd amount_returned));
          ("transaction_hash", `String (Printf.sprintf "tx_withdraw_%s" lp_address));
        ] in

        Lwt.return (ok_json response)

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** GET /api/v1/risk/metrics - Get risk metrics *)
let risk_metrics_handler state _req =
  let pool = Collateral_manager.get_pool_state state.collateral_manager in

  (* Fetch current prices *)
  let assets = [USDC; USDT; DAI; USDP] in
  Lwt_list.map_p (fun asset ->
    get_current_price state asset >>= fun price_result ->
    Lwt.return (asset, Result.ok price_result |> Option.value ~default:1.0)
  ) assets >>= fun price_scenarios ->

  (* Calculate risk metrics *)
  let risk_snapshot = Unified_risk_monitor.calculate_risk_metrics
    state.collateral_manager
    ~price_scenarios
    ~price_history:[]
  in

  let response = `Assoc [
    ("var_95", `Float risk_snapshot.var_95);
    ("var_99", `Float risk_snapshot.var_99);
    ("cvar_95", `Float risk_snapshot.cvar_95);
    ("expected_loss", `Float risk_snapshot.expected_loss);
    ("ltv", `Float risk_snapshot.ltv);
    ("reserve_ratio", `Float risk_snapshot.reserve_ratio);
    ("max_concentration", `Float risk_snapshot.max_concentration);
    ("breach_alerts", `Int (List.length risk_snapshot.breach_alerts));
    ("warning_alerts", `Int (List.length risk_snapshot.warning_alerts));
  ] in

  Lwt.return (ok_json response)

(** Router *)
let router state =
  Dream.router [
    Dream.get "/health" health_handler;

    Dream.post "/api/v1/quote" (quote_handler state);
    Dream.post "/api/v1/policy/purchase" (purchase_policy_handler state);
    Dream.get "/api/v1/policy/:id" (get_policy_handler state);

    Dream.get "/api/v1/vault/info" (vault_info_handler state);

    Dream.post "/api/v1/lp/deposit" (lp_deposit_handler state);
    Dream.post "/api/v1/lp/withdraw" (lp_withdraw_handler state);

    Dream.get "/api/v1/risk/metrics" (risk_metrics_handler state);
  ]

(** Start server *)
let start_server ?(port = 8080) () =
  let state = create_server_state () in

  Printf.printf "Starting Tonsurance API server on port %d\n" port;

  Dream.run ~port
  @@ Dream.logger
  @@ Dream.memory_sessions
  @@ Dream.router [
    Dream.scope "/api" [] [router state];
    Dream.get "/health" health_handler;
  ]

(** For testing *)
let create_test_server () =
  let state = create_server_state () in
  router state
