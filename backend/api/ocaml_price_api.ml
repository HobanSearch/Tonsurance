(**
 * OCaml Price API - REST endpoints for oracle consensus prices
 *
 * Exposes multi-chain oracle aggregation to external services
 * Used by TypeScript PricingOracleKeeper to update TON contracts
 *)

open Types

module PriceAPI = struct

  (** Get consensus price for asset *)
  let get_consensus_price_handler req =
    let asset_str = Dream.param req "asset" in

    match asset_of_string asset_str with
    | Error msg ->
        Dream.json ~status:`Bad_Request
          (Yojson.Safe.to_string (`Assoc [
            ("error", `String msg);
          ]))

    | Ok asset ->
        (* Fetch consensus price from oracle aggregator *)
        let%lwt consensus_opt =
          Oracle_aggregator.OracleAggregator.get_consensus_price
            asset
            ~previous_price:None
        in

        match consensus_opt with
        | None ->
            Dream.json ~status:`Service_Unavailable
              (Yojson.Safe.to_string (`Assoc [
                ("error", `String "Unable to fetch consensus price");
                ("asset", `String asset_str);
              ]))

        | Some consensus ->
            Dream.json
              (Yojson.Safe.to_string (`Assoc [
                ("asset", `String (asset_to_string consensus.asset));
                ("price", `Float consensus.price);
                ("weighted_price", `Float consensus.weighted_price);
                ("median_price", `Float consensus.median_price);
                ("std_deviation", `Float consensus.std_deviation);
                ("num_sources", `Int consensus.num_sources);
                ("timestamp", `Float consensus.timestamp);
                ("confidence", `Float consensus.confidence);
                ("is_stale", `Bool consensus.is_stale);
              ]))

  (** Get cross-chain prices for asset across all blockchains *)
  let get_cross_chain_prices_handler req =
    let asset_str = Dream.param req "asset" in

    match asset_of_string asset_str with
    | Error msg ->
        Dream.json ~status:`Bad_Request
          (Yojson.Safe.to_string (`Assoc [
            ("error", `String msg);
          ]))

    | Ok asset ->
        (* Fetch prices across all chains *)
        let%lwt state =
          Oracle_aggregator.MultiChainOracle.fetch_all_chain_prices
            ~chains:[Ethereum; Arbitrum; Base; Polygon; Bitcoin; Lightning; TON]
            ~assets:[asset]
            ~previous_state:None
            ()
        in

        (* Extract prices for this asset *)
        let prices_json =
          List.filter_map (fun (chain, a, (price_data : Oracle_aggregator.MultiChainOracle.chain_price)) ->
            if a = asset then
              Some (`Assoc [
                ("chain", `String (blockchain_to_string chain));
                ("asset", `String asset_str);
                ("price", `Float price_data.price);
                ("timestamp", `Float price_data.timestamp);
              ])
            else
              None
          ) state.prices
        in

        Dream.json
          (Yojson.Safe.to_string (`Assoc [
            ("asset", `String asset_str);
            ("prices", `List prices_json);
            ("last_updated", `Float state.last_updated);
          ]))

  (** Get bridge health status *)
  let get_bridge_health_handler req =
    let bridge_id = Dream.param req "bridge_id" in

    (* Fetch latest bridge health from database using GlobalPool *)
    let%lwt health_data =
      try%lwt
        (* Define Caqti query *)
        let open Caqti_request.Infix in
        let _query =
          Caqti_type.string ->?
          Caqti_type.(t4 float int64 int int) @@
          {|SELECT health_score::float, tvl_usd, failed_tx_count, total_tx_count
            FROM bridge_health_history
            WHERE bridge_id = $1
            ORDER BY time DESC
            LIMIT 1|}
        in

        (* Execute query using database connection *)
        (* TODO: Implement get_db_pool or use dependency injection *)
        (* Stub: Return empty result for now *)
        let result = Ok None in

        match result with
        | Ok (Some (health_score, tvl_usd, failed_tx, total_tx)) ->
            let status = if health_score > 0.9 then "healthy"
                         else if health_score > 0.7 then "degraded"
                         else "critical"
            in

            Lwt.return (`Assoc [
              ("bridge_id", `String bridge_id);
              ("health_score", `Float health_score);
              ("tvl_usd", `Int (Int64.to_int tvl_usd));
              ("failed_tx_count", `Int failed_tx);
              ("total_tx_count", `Int total_tx);
              ("success_rate", `Float (if total_tx > 0 then
                Float.of_int (total_tx - failed_tx) /. Float.of_int total_tx else 1.0));
              ("status", `String status);
              ("last_updated", `Float (Core.Time_ns.now () |> Core.Time_ns.to_span_since_epoch |> Core.Time_ns.Span.to_sec));
            ])

        | Ok None ->
            Lwt.return (`Assoc [
              ("bridge_id", `String bridge_id);
              ("error", `String "No health data available");
              ("health_score", `Float 0.0);
              ("status", `String "unknown");
            ])

        | Error err ->
            Logs.warn (fun m -> m "[API] Database error for bridge %s: %s" bridge_id err);
            Lwt.return (`Assoc [
              ("bridge_id", `String bridge_id);
              ("error", `String err);
              ("health_score", `Float 0.0);
              ("status", `String "error");
            ])

      with exn ->
        Logs.err (fun m -> m "[API] Exception fetching bridge health: %s" (Printexc.to_string exn));
        Lwt.return (`Assoc [
          ("bridge_id", `String bridge_id);
          ("error", `String (Printexc.to_string exn));
          ("health_score", `Float 0.0);
        ])
    in

    Dream.json (Yojson.Safe.to_string health_data)

  (** Health check endpoint *)
  let health_check_handler _req =
    Dream.json
      (Yojson.Safe.to_string (`Assoc [
        ("status", `String "ok");
        ("service", `String "tonsurance-ocaml-api");
        ("timestamp", `Float (Unix.time ()));
        ("version", `String "1.0.0");
      ]))

  (** Setup API routes *)
  let routes = [
    Dream.get "/health"
      health_check_handler;

    Dream.get "/api/v1/consensus-price/:asset"
      get_consensus_price_handler;

    Dream.get "/api/v1/oracle/cross-chain/:asset"
      get_cross_chain_prices_handler;

    Dream.get "/api/v1/bridge/health/:bridge_id"
      get_bridge_health_handler;
  ]

  (** Start API server *)
  let start_server ?(port = 8080) () =
    Printf.printf "Starting Tonsurance OCaml API on port %d\n" port;
    Out_channel.flush Out_channel.stdout;

    Dream.run ~port
      @@ Dream.logger
      @@ Dream.router routes

end

(** CLI entry point *)
let () =
  let port =
    try
      int_of_string (Sys.getenv "PORT")
    with Not_found ->
      8080
  in

  PriceAPI.start_server ~port ()
