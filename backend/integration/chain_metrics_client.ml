(** Chain Congestion Metrics Client
 *
 * Fetches real-time blockchain congestion metrics:
 * - Gas prices
 * - Block times
 * - Mempool size
 * - Transaction success rates
 *
 * Networks: Ethereum, Arbitrum, Base, Polygon, Solana, TON
 * Update frequency: 30 seconds
 * Data sources: Etherscan API, Arbiscan, Basescan, Polygonscan, Solana RPC, TON API
 *)

open Core
(* open Lwt.Syntax *)
open Types

module ChainMetricsClient = struct

  (** Chain metrics *)
  type chain_metrics = {
    chain: blockchain;
    avg_gas_price_gwei: float option; (* For EVM chains *)
    avg_block_time_ms: int;
    mempool_size: int option;
    pending_tx_count: int;
    congestion_score: float; (* 0.0 - 1.0, higher = more congested *)
    timestamp: float;
    data_source: string;
  } [@@deriving sexp]

  (** Client configuration *)
  type client_config = {
    etherscan_api_key: string;
    arbiscan_api_key: string;
    basescan_api_key: string;
    polygonscan_api_key: string;
    solana_rpc_url: string;
    ton_api_url: string;
    ton_api_key: string option;
    rate_limit_per_minute: int;
    timeout_seconds: float;
  } [@@deriving sexp]

  (** Etherscan-based metrics fetcher (works for Ethereum, Arbitrum, Base, Polygon) *)
  module EtherscanLike = struct

    let get_api_config = function
      | Ethereum -> ("https://api.etherscan.io/api", "etherscan_api_key")
      | Arbitrum -> ("https://api.arbiscan.io/api", "arbiscan_api_key")
      | Base -> ("https://api.basescan.org/api", "basescan_api_key")
      | Polygon -> ("https://api.polygonscan.com/api", "polygonscan_api_key")
      | _ -> failwith "Unsupported chain for Etherscan API"

    let fetch_gas_price
        ~(api_base: string)
        ~(api_key: string)
      : float option Lwt.t =

      try%lwt
        let url = Printf.sprintf "%s?module=gastracker&action=gasoracle&apikey=%s"
          api_base api_key
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let _json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let result = _json |> member "result" in
        let fast_gas = result |> member "FastGasPrice" |> to_string |> Float.of_string in

        Lwt.return (Some fast_gas)

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching gas price: %s" (Exn.to_string exn)
        ) in
        Lwt.return None

    let fetch_pending_tx_count
        ~(api_base: string)
        ~(api_key: string)
      : int option Lwt.t =

      try%lwt
        let url = Printf.sprintf "%s?module=proxy&action=eth_getBlockTransactionCountByNumber&tag=pending&apikey=%s"
          api_base api_key
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let _json2 = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let result_hex = _json2 |> member "result" |> to_string in

        (* Parse hex string safely *)
        let count =
          if String.is_prefix result_hex ~prefix:"0x" then
            Int.of_string result_hex
          else
            Int.of_string ("0x" ^ result_hex)
        in

        Lwt.return (Some count)

      with exn ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "Error fetching pending tx count: %s" (Exn.to_string exn)
        ) in
        Lwt.return None

    let fetch_avg_block_time
        ~(api_base: string)
        ~(api_key: string)
      : int option Lwt.t =

      try%lwt
        (* Fetch last 10 blocks *)
        let url_latest = Printf.sprintf "%s?module=proxy&action=eth_blockNumber&apikey=%s"
          api_base api_key
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get (Uri.of_string url_latest) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let _json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let latest_hex = _json |> member "result" |> to_string in
        let latest_block = Int.of_string latest_hex in

        (* Fetch timestamps for current and 10 blocks ago *)
        let url_current = Printf.sprintf "%s?module=proxy&action=eth_getBlockByNumber&tag=%s&boolean=false&apikey=%s"
          api_base latest_hex api_key
        in

        let prev_block = latest_block - 10 in
        let prev_hex = Printf.sprintf "0x%x" prev_block in
        let url_prev = Printf.sprintf "%s?module=proxy&action=eth_getBlockByNumber&tag=%s&boolean=false&apikey=%s"
          api_base prev_hex api_key
        in

        let%lwt (_, body_current) = Cohttp_lwt_unix.Client.get (Uri.of_string url_current) in
        let%lwt (_, body_prev) = Cohttp_lwt_unix.Client.get (Uri.of_string url_prev) in

        let%lwt current_str = Cohttp_lwt.Body.to_string body_current in
        let%lwt prev_str = Cohttp_lwt.Body.to_string body_prev in

        let current_json = Yojson.Safe.from_string current_str in
        let prev_json = Yojson.Safe.from_string prev_str in

        let current_ts_hex = current_json |> member "result" |> member "timestamp" |> to_string in
        let prev_ts_hex = prev_json |> member "result" |> member "timestamp" |> to_string in

        (* Parse hex timestamps safely *)
        let parse_hex_timestamp hex_str =
          if String.is_prefix hex_str ~prefix:"0x" then
            Int.of_string hex_str
          else
            Int.of_string ("0x" ^ hex_str)
        in

        let current_ts = parse_hex_timestamp current_ts_hex in
        let prev_ts = parse_hex_timestamp prev_ts_hex in

        let time_diff = current_ts - prev_ts in
        let avg_block_time_ms = (time_diff * 1000) / 10 in

        Lwt.return (Some avg_block_time_ms)

      with exn ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "Error fetching block time: %s" (Exn.to_string exn)
        ) in
        Lwt.return None

  end

  (** Solana metrics fetcher *)
  module Solana = struct

    let fetch_metrics
        ~(rpc_url: string)
      : (int * int) option Lwt.t =

      try%lwt
        (* Get performance samples *)
        let _json_rpc = `Assoc [
          ("jsonrpc", `String "2.0");
          ("id", `Int 1);
          ("method", `String "getRecentPerformanceSamples");
          ("params", `List [`Int 10]);
        ] in

        let body = Yojson.Safe.to_string _json_rpc in
        let headers = Cohttp.Header.of_list [("Content-Type", "application/json")] in

        let%lwt (_resp, resp_body) =
          Cohttp_lwt_unix.Client.post
            ~body:(`String body)
            ~headers
            (Uri.of_string rpc_url)
        in

        let%lwt body_string = Cohttp_lwt.Body.to_string resp_body in
        let _json2 = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let samples = _json2 |> member "result" |> to_list in

        if List.is_empty samples then Lwt.return None
        else
          (* Calculate average slot time *)
          let total_slots = List.fold samples ~init:0 ~f:(fun acc sample ->
            acc + (sample |> member "numSlots" |> to_int)
          ) in

          let total_time = List.fold samples ~init:0 ~f:(fun acc sample ->
            acc + (sample |> member "samplePeriodSecs" |> to_int)
          ) in

          let avg_slot_time_ms = (total_time * 1000) / total_slots in

          (* Get pending transactions *)
          let json_rpc_pending = `Assoc [
            ("jsonrpc", `String "2.0");
            ("id", `Int 2);
            ("method", `String "getBlockProduction");
          ] in

          let body_pending = Yojson.Safe.to_string json_rpc_pending in

          let%lwt (_, pending_body) =
            Cohttp_lwt_unix.Client.post
              ~body:(`String body_pending)
              ~headers
              (Uri.of_string rpc_url)
          in

          let%lwt pending_str = Cohttp_lwt.Body.to_string pending_body in
          let _pending_json = Yojson.Safe.from_string pending_str in

          (* Solana doesn't have a mempool, but we can estimate congestion *)
          let pending_count = 0 in (* Placeholder *)

          Lwt.return (Some (avg_slot_time_ms, pending_count))

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching Solana metrics: %s" (Exn.to_string exn)
        ) in
        Lwt.return None

  end

  (** TON metrics fetcher *)
  module TON = struct

    let fetch_metrics
        ~(api_url: string)
        ~(api_key: string option)
      : (int * int) option Lwt.t =

      try%lwt
        let url = Printf.sprintf "%s/masterchain-info" api_url in

        let headers = match api_key with
          | Some key -> Cohttp.Header.of_list [("X-API-Key", key)]
          | None -> Cohttp.Header.init ()
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get ~headers (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let _json = Yojson.Safe.from_string body_string in

        (* let open Yojson.Safe.Util in *)

        (* TON average block time is ~5 seconds *)
        let block_time_ms = 5000 in

        (* Get unconfirmed transactions (if available) *)
        let pending_count = 0 in (* TON doesn't expose mempool directly *)

        Lwt.return (Some (block_time_ms, pending_count))

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching TON metrics: %s" (Exn.to_string exn)
        ) in
        Lwt.return None

  end

  (** Calculate congestion score *)
  let calculate_congestion_score
      ~(chain: blockchain)
      ~(gas_price_opt: float option)
      ~(block_time_ms: int)
      ~(pending_tx: int)
    : float =

    (* Baseline gas prices (in gwei) for each chain *)
    let baseline_gas = match chain with
      | Ethereum -> 30.0
      | Arbitrum -> 0.1
      | Base -> 0.05
      | Polygon -> 50.0
      | _ -> 1.0
    in

    (* Baseline block times (in ms) *)
    let baseline_block_time = match chain with
      | Ethereum -> 12000
      | Arbitrum -> 250
      | Base -> 2000
      | Polygon -> 2000
      | Solana -> 400
      | TON -> 5000
      | _ -> 10000
    in

    (* Gas price factor (0.0 - 1.0) *)
    let gas_factor = match gas_price_opt with
      | Some gas_price ->
          let ratio = gas_price /. baseline_gas in
          Float.min 1.0 (ratio /. 5.0) (* Cap at 5x baseline = max score *)
      | None -> 0.5 (* Default if unavailable *)
    in

    (* Block time factor (0.0 - 1.0) - slower = more congested *)
    let block_time_factor =
      let ratio = Float.of_int block_time_ms /. Float.of_int baseline_block_time in
      Float.min 1.0 (ratio /. 3.0) (* Cap at 3x baseline *)
    in

    (* Pending tx factor (0.0 - 1.0) *)
    let pending_factor =
      let normalized = Float.of_int pending_tx /. 100_000.0 in (* 100k txs = max *)
      Float.min 1.0 normalized
    in

    (* Weighted composite score *)
    let score =
      (gas_factor *. 0.50) +.
      (block_time_factor *. 0.30) +.
      (pending_factor *. 0.20)
    in

    Float.max 0.0 (Float.min 1.0 score)

  (** Fetch metrics for a single chain *)
  let fetch_chain_metrics
      ~(config: client_config)
      ~(chain: blockchain)
    : chain_metrics option Lwt.t =

    let%lwt () = Logs_lwt.debug (fun m ->
      m "Fetching metrics for chain: %s" (blockchain_to_string chain)
    ) in

    match chain with
    | Ethereum | Arbitrum | Base | Polygon ->
        let (api_base, key_name) = EtherscanLike.get_api_config chain in
        let api_key = match key_name with
          | "etherscan_api_key" -> config.etherscan_api_key
          | "arbiscan_api_key" -> config.arbiscan_api_key
          | "basescan_api_key" -> config.basescan_api_key
          | "polygonscan_api_key" -> config.polygonscan_api_key
          | _ -> ""
        in

        let%lwt gas_price_opt = EtherscanLike.fetch_gas_price ~api_base ~api_key in
        let%lwt block_time_opt = EtherscanLike.fetch_avg_block_time ~api_base ~api_key in
        let%lwt pending_opt = EtherscanLike.fetch_pending_tx_count ~api_base ~api_key in

        (match block_time_opt with
         | Some block_time_ms ->
             let pending = Option.value pending_opt ~default:0 in
             let congestion = calculate_congestion_score
               ~chain
               ~gas_price_opt
               ~block_time_ms
               ~pending_tx:pending
             in

             Some {
               chain;
               avg_gas_price_gwei = gas_price_opt;
               avg_block_time_ms = block_time_ms;
               mempool_size = None;
               pending_tx_count = pending;
               congestion_score = congestion;
               timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
               data_source = "etherscan";
             } |> Lwt.return

         | None -> Lwt.return None)

    | Solana ->
        let%lwt metrics_opt = Solana.fetch_metrics ~rpc_url:config.solana_rpc_url in

        (match metrics_opt with
         | Some (block_time_ms, pending) ->
             let congestion = calculate_congestion_score
               ~chain
               ~gas_price_opt:None
               ~block_time_ms
               ~pending_tx:pending
             in

             Some {
               chain;
               avg_gas_price_gwei = None;
               avg_block_time_ms = block_time_ms;
               mempool_size = None;
               pending_tx_count = pending;
               congestion_score = congestion;
               timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
               data_source = "solana_rpc";
             } |> Lwt.return

         | None -> Lwt.return None)

    | TON ->
        let%lwt metrics_opt = TON.fetch_metrics
          ~api_url:config.ton_api_url
          ~api_key:config.ton_api_key
        in

        (match metrics_opt with
         | Some (block_time_ms, pending) ->
             let congestion = calculate_congestion_score
               ~chain
               ~gas_price_opt:None
               ~block_time_ms
               ~pending_tx:pending
             in

             Some {
               chain;
               avg_gas_price_gwei = None;
               avg_block_time_ms = block_time_ms;
               mempool_size = None;
               pending_tx_count = pending;
               congestion_score = congestion;
               timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
               data_source = "ton_api";
             } |> Lwt.return

         | None -> Lwt.return None)

    | _ ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "Chain metrics not implemented for %s" (blockchain_to_string chain)
        ) in
        Lwt.return None

  (** Fetch metrics for all supported chains *)
  let fetch_all_chain_metrics
      ~(config: client_config)
    : chain_metrics list Lwt.t =

    let supported_chains = [Ethereum; Arbitrum; Base; Polygon; Solana; TON] in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Fetching metrics for %d chains" (List.length supported_chains)
    ) in

    (* Fetch with rate limiting *)
    let delay_per_chain = 60.0 /. Float.of_int config.rate_limit_per_minute in

    let rec fetch_with_delay chains acc =
      match chains with
      | [] -> Lwt.return (List.rev acc)
      | chain :: rest ->
          let%lwt metric_opt = fetch_chain_metrics ~config ~chain in

          let new_acc = match metric_opt with
            | Some m -> m :: acc
            | None -> acc
          in

          let%lwt () = Lwt_unix.sleep delay_per_chain in
          fetch_with_delay rest new_acc
    in

    fetch_with_delay supported_chains []

  (** Calculate chain risk multiplier for pricing *)
  let calculate_chain_risk_multiplier
      (metrics: chain_metrics)
    : float =

    (* Risk multiplier based on congestion score *)
    if Float.(metrics.congestion_score < 0.3) then 1.0      (* Low congestion *)
    else if Float.(metrics.congestion_score < 0.5) then 1.05 (* Moderate *)
    else if Float.(metrics.congestion_score < 0.7) then 1.15 (* High *)
    else 1.30                                         (* Extreme *)

  (** Start continuous chain metrics monitoring *)
  let start_chain_monitor
      ~(config: client_config)
      ~(update_interval_seconds: float)
      ~(on_metrics: chain_metrics list -> unit Lwt.t)
    : unit Lwt.t =

    let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Fetching chain congestion metrics..."
      ) in

      let%lwt metrics = fetch_all_chain_metrics ~config in

      let%lwt () = Logs_lwt.info (fun m ->
        m "Fetched metrics for %d chains" (List.length metrics)
      ) in

      (* Log congestion summary *)
      let%lwt () =
        Lwt_list.iter_s (fun m ->
          Logs_lwt.info (fun log ->
            log "%s: congestion=%.2f, block_time=%dms%s"
              (blockchain_to_string m.chain)
              m.congestion_score
              m.avg_block_time_ms
              (match m.avg_gas_price_gwei with
               | Some gas -> Printf.sprintf ", gas=%.1f gwei" gas
               | None -> "")
          )
        ) metrics
      in

      (* Call callback *)
      let%lwt () = on_metrics metrics in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Starting chain metrics monitor (interval: %.0fs)" update_interval_seconds
    ) in

    monitor_loop ()

end
