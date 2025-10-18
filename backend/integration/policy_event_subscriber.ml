(* Policy Event Subscriber
 *
 * Subscribes to PolicyFactory contract events and updates backend systems:
 * - Unified risk monitor (exposure tracking)
 * - PostgreSQL (policy records)
 * - Product exposure aggregation
 *
 * Handles all 560 product combinations (5 types × 8 chains × 14 stablecoins)
 *)

open Core
open Lwt.Syntax
open Types
open Integration.Database
open Integration.Ton_client
open Monitoring.Unified_risk_monitor

module PolicyEventSubscriber = struct

  (** Subscription configuration *)
  type subscriber_config = {
    ton_config: TonClient.ton_config;
    policy_factory_address: TonClient.ton_address;
    poll_interval_seconds: float;
    db_pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result;
  }

  let default_subscriber_config factory_address db_pool = {
    ton_config = TonClient.default_config;
    policy_factory_address = factory_address;
    poll_interval_seconds = 10.0; (* Poll every 10 seconds *)
    db_pool;
  }

  (** Event statistics *)
  type event_stats = {
    total_events_processed: int ref;
    policy_created_count: int ref;
    payout_executed_count: int ref;
    last_event_time: float ref;
    errors: int ref;
  }

  let create_stats () = {
    total_events_processed = ref 0;
    policy_created_count = ref 0;
    payout_executed_count = ref 0;
    last_event_time = ref 0.0;
    errors = ref 0;
  }

  (** Map on-chain IDs to backend enums *)
  let coverage_type_of_id = function
    | 0 -> Depeg
    | 1 -> Bridge
    | 2 -> Smart_contract
    | 3 -> Oracle
    | 4 -> CEX_liquidation
    | _ -> Depeg (* Default *)

  let chain_of_id = function
    | 0 -> Ethereum
    | 1 -> Arbitrum
    | 2 -> Base
    | 3 -> Polygon
    | 4 -> Optimism
    | 5 -> Bitcoin
    | 6 -> Lightning
    | 7 -> Solana
    | 8 -> TON
    | _ -> Ethereum (* Default *)

  let stablecoin_of_id = function
    | 0 -> USDC
    | 1 -> USDT
    | 2 -> USDP
    | 3 -> DAI
    | 4 -> FRAX
    | 5 -> BUSD
    | 6 -> USDe
    | 7 -> sUSDe
    | 8 -> USDY
    | 9 -> PYUSD
    | 10 -> GHO
    | 11 -> LUSD
    | 12 -> crvUSD
    | 13 -> mkUSD
    | _ -> USDC (* Default *)

  (** Store event in database audit log *)
  let store_event_log
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(event_type: string)
      ~(policy_id: int64)
      ~(metadata: (string * string) list)
    : unit Lwt.t =

    let query = {|
      INSERT INTO blockchain_events (
        event_type, policy_id, metadata, created_at
      ) VALUES (
        $1, $2, $3, NOW()
      )
    |} in

    let metadata_json = `Assoc (List.map metadata ~f:(fun (k, v) -> (k, `String v)))
      |> Yojson.Safe.to_string
    in

    let request = Caqti_request.exec
      Caqti_type.(tup3 string int64 string)
      query
    in

    match pool with
    | Error _ -> Lwt.return_unit
    | Ok pool ->
        let* _ = Database.with_connection (Ok pool) (fun (module Db : Database.CONNECTION) ->
          Db.exec request (event_type, policy_id, metadata_json)
        ) in
        Lwt.return_unit

  (** Update product exposure aggregation *)
  let update_product_exposure
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(coverage_type: int)
      ~(chain_id: int)
      ~(stablecoin_id: int)
    : unit Lwt.t =

    (* The PostgreSQL trigger handles this automatically *)
    (* But we can also manually refresh the materialized view *)
    let query = "SELECT refresh_hedge_requirements()" in

    match pool with
    | Error _ -> Lwt.return_unit
    | Ok pool ->
        let request = Caqti_request.exec Caqti_type.unit query in
        let* _ = Database.with_connection (Ok pool) (fun (module Db : Database.CONNECTION) ->
          Db.exec request ()
        ) in
        Lwt.return_unit

  (** Handle PolicyCreated event *)
  let handle_policy_created
      (config: subscriber_config)
      ~(stats: event_stats)
      ~(event: TonClient.Events.event_type)
    : unit Lwt.t =

    match event with
    | PolicyCreated { policy_id; buyer; coverage_type; chain_id; stablecoin_id;
                     coverage_amount; premium; duration } ->

        let%lwt () = Logs_lwt.info (fun m ->
          m "📋 PolicyCreated: ID=%Ld, type=%d, chain=%d, stablecoin=%d, coverage=%Ld"
            policy_id coverage_type chain_id stablecoin_id coverage_amount
        ) in

        (* Update statistics *)
        stats.policy_created_count := !(stats.policy_created_count) + 1;
        stats.total_events_processed := !(stats.total_events_processed) + 1;
        stats.last_event_time := Unix.time ();

        (* Map to backend types *)
        let coverage_type_enum = coverage_type_of_id coverage_type in
        let chain_enum = chain_of_id chain_id in
        let stablecoin_enum = stablecoin_of_id stablecoin_id in

        (* Create product key for exposure tracking *)
        let product_key = {
          UnifiedRiskMonitor.coverage_type = coverage_type_to_string coverage_type_enum;
          chain = chain_enum;
          stablecoin = stablecoin_enum;
        } in

        (* Store in database *)
        let%lwt _ = Database.insert_policy config.db_pool
          ~buyer
          ~beneficiary:buyer (* Default to buyer as beneficiary *)
          ~asset:(asset_to_string stablecoin_enum)
          ~coverage:coverage_amount
          ~premium
          ~trigger:0.97  (* Default depeg trigger *)
          ~floor:0.90    (* Default floor *)
          ~start_time:(Unix.time ())
          ~expiry_time:(Unix.time () +. (Float.of_int duration *. 86400.0))
        in

        (* Update exposure aggregation *)
        let%lwt () = update_product_exposure config.db_pool
          ~coverage_type
          ~chain_id
          ~stablecoin_id
        in

        (* Store event in audit log *)
        let%lwt () = store_event_log config.db_pool
          ~event_type:"policy_created"
          ~policy_id
          ~metadata:[
            ("buyer", buyer);
            ("coverage_type", Int.to_string coverage_type);
            ("chain_id", Int.to_string chain_id);
            ("stablecoin_id", Int.to_string stablecoin_id);
            ("coverage_amount", Int64.to_string coverage_amount);
            ("premium", Int64.to_string premium);
          ]
        in

        Lwt.return_unit

    | _ -> Lwt.return_unit

  (** Handle PayoutExecuted event *)
  let handle_payout_executed
      (config: subscriber_config)
      ~(stats: event_stats)
      ~(event: TonClient.Events.event_type)
    : unit Lwt.t =

    match event with
    | PayoutExecuted { policy_id; beneficiary; amount } ->

        let%lwt () = Logs_lwt.info (fun m ->
          m "💰 PayoutExecuted: policy=%Ld, beneficiary=%s, amount=%Ld"
            policy_id beneficiary amount
        ) in

        stats.payout_executed_count := !(stats.payout_executed_count) + 1;
        stats.total_events_processed := !(stats.total_events_processed) + 1;

        (* Update policy status in database *)
        (* Would need to implement Database.update_policy_status *)

        (* Store event in audit log *)
        let%lwt () = store_event_log config.db_pool
          ~event_type:"payout_executed"
          ~policy_id
          ~metadata:[
            ("beneficiary", beneficiary);
            ("amount", Int64.to_string amount);
          ]
        in

        Lwt.return_unit

    | _ -> Lwt.return_unit

  (** Main event handler *)
  let handle_event
      (config: subscriber_config)
      ~(stats: event_stats)
      (event: TonClient.Events.event_type)
    : unit Lwt.t =

    try%lwt
      match event with
      | PolicyCreated _ ->
          handle_policy_created config ~stats ~event
      | PayoutExecuted _ ->
          handle_payout_executed config ~stats ~event
      | _ ->
          (* Other events (deposits, withdrawals, etc.) *)
          Lwt.return_unit
    with exn ->
      stats.errors := !(stats.errors) + 1;
      Lwt_io.eprintlf "Error handling event: %s" (Exn.to_string exn)

  (** Start subscription loop *)
  let start_subscription (config: subscriber_config) : unit Lwt.t =
    let stats = create_stats () in

    let event_callback = handle_event config ~stats in

    (* Log statistics periodically *)
    let log_stats_loop () =
      let rec loop () =
        let%lwt () = Lwt_unix.sleep 60.0 in (* Every minute *)

        let%lwt () = Logs_lwt.info (fun m ->
          m "📊 Event Stats: total=%d, policies=%d, payouts=%d, errors=%d, last_event=%.0fs ago"
            !(stats.total_events_processed)
            !(stats.policy_created_count)
            !(stats.payout_executed_count)
            !(stats.errors)
            (Unix.time () -. !(stats.last_event_time))
        ) in

        loop ()
      in
      loop ()
    in

    (* Start stats logging in background *)
    Lwt.async log_stats_loop;

    (* Start event subscription *)
    Lwt_io.printlf "\n╔════════════════════════════════════════╗" >>= fun () ->
    Lwt_io.printlf "║  Policy Event Subscriber Started       ║" >>= fun () ->
    Lwt_io.printlf "╚════════════════════════════════════════╝\n" >>= fun () ->
    Lwt_io.printlf "Factory: %s" config.policy_factory_address >>= fun () ->
    Lwt_io.printlf "Poll interval: %.0f seconds\n" config.poll_interval_seconds >>= fun () ->

    TonClient.Events.subscribe
      config.ton_config
      ~contract_address:config.policy_factory_address
      ~initial_lt:None
      ~poll_interval_seconds:config.poll_interval_seconds
      ~callback:event_callback

end
