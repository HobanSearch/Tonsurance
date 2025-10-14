(**
 * OCaml Price API - REST endpoints for oracle consensus prices
 *
 * Exposes multi-chain oracle aggregation to external services
 * Used by TypeScript PricingOracleKeeper to update TON contracts
 *)

open Lwt.Syntax
open Dream
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
          Integration.Oracle_aggregator.OracleAggregator.get_consensus_price
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
              (Yojson.Safe.to_string
                (Integration.Oracle_aggregator.OracleAggregator.consensus_price_to_yojson consensus))

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
          Integration.Oracle_aggregator.MultiChainOracle.fetch_all_chain_prices
            ~chains:[Ethereum; Arbitrum; Base; Polygon; Bitcoin; Lightning; TON]
            ~assets:[asset]
            ~previous_state:None
        in

        (* Extract prices for this asset *)
        let prices_json =
          List.filter_map (fun (chain, a, price) ->
            if a = asset then
              Some (`Assoc [
                ("chain", `String (blockchain_to_string chain));
                ("asset", `String asset_str);
                ("price", `Float price.price);
                ("timestamp", `Float price.timestamp);
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

    (* Fetch bridge health from monitor *)
    (* TODO: Integrate with bridge_monitor.ml state *)

    Dream.json
      (Yojson.Safe.to_string (`Assoc [
        ("bridge_id", `String bridge_id);
        ("health_score", `Float 0.92);
        ("tvl_usd", `Int 50_000_000);
        ("status", `String "healthy");
        ("last_updated", `Float (Unix.time ()));
      ]))

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
    flush stdout;

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

  Lwt_main.run (
    PriceAPI.start_server ~port ()
  )
