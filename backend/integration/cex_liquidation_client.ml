(** CEX Liquidation Data Client
 *
 * Fetches real-time liquidation data from major centralized exchanges:
 * - Binance Futures
 * - Bybit
 * - OKX
 * - Deribit
 *
 * Aggregates liquidation volumes by asset to assess market stress.
 * Update frequency: 30 seconds
 *)

open Core
open Types

module CEXLiquidationClient = struct

  (** Exchange identifier *)
  type exchange =
    | Binance
    | Bybit
    | OKX
    | Deribit
  [@@deriving sexp, compare, equal, enumerate]

  let exchange_to_string = function
    | Binance -> "Binance"
    | Bybit -> "Bybit"
    | OKX -> "OKX"
    | Deribit -> "Deribit"

  (** Liquidation event *)
  type liquidation_event = {
    exchange: exchange;
    asset: string; (* BTC, ETH, etc. *)
    side: [`Long | `Short];
    quantity: float;
    price: float;
    value_usd: int64; (* In USD cents *)
    timestamp: float;
  } [@@deriving sexp]

  (** Aggregated liquidation metrics *)
  type liquidation_metrics = {
    exchange: exchange;
    asset: string;
    time_window_seconds: int;
    total_liquidated_usd: int64;
    long_liquidated_usd: int64;
    short_liquidated_usd: int64;
    liquidation_count: int;
    avg_liquidation_size_usd: int64;
    largest_liquidation_usd: int64;
    timestamp: float;
  } [@@deriving sexp]

  (** Client configuration *)
  type client_config = {
    binance_api_key: string option;
    bybit_api_key: string option;
    okx_api_key: string option;
    deribit_api_key: string option;
    aggregation_window_seconds: int; (* How far back to aggregate *)
    rate_limit_per_minute: int;
    timeout_seconds: float;
  } [@@deriving sexp]

  (** Binance liquidation fetcher *)
  module Binance = struct

    let api_base = "https://fapi.binance.com/fapi/v1"

    let fetch_liquidations
        ~(api_key: string option)
        ~(symbol: string)
        ~(time_window_ms: int64)
      : liquidation_event list Lwt.t =

      try%lwt
        let end_time = Int64.of_float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) *. 1000.0) in
        let start_time = Int64.(end_time - time_window_ms) in

        let url = Printf.sprintf "%s/allForceOrders?symbol=%s&startTime=%Ld&endTime=%Ld&limit=1000"
          api_base symbol start_time end_time
        in

        let headers = match api_key with
          | Some key -> Cohttp.Header.of_list [("X-MBX-APIKEY", key)]
          | None -> Cohttp.Header.init ()
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get ~headers (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let liquidations = json |> to_list |> List.filter_map ~f:(fun liq ->
          try
            let side_str = liq |> member "side" |> to_string in
            let side = if String.equal side_str "BUY" then `Long else `Short in

            let quantity = liq |> member "origQty" |> to_string |> Float.of_string in
            let price = liq |> member "price" |> to_string |> Float.of_string in
            let timestamp_ms = liq |> member "time" |> to_int in

            let value_usd = Int64.of_float (quantity *. price *. 100.0) in

            Some {
              exchange = Binance;
              asset = String.sub symbol ~pos:0 ~len:(String.length symbol - 4); (* Remove USDT *)
              side;
              quantity;
              price;
              value_usd;
              timestamp = Float.of_int timestamp_ms /. 1000.0;
            }
          with exn ->
            let () = Logs.warn (fun m ->
              m "Failed to parse Binance liquidation: %s" (Exn.to_string exn)
            ) in
            None
        ) in

        Lwt.return liquidations

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching Binance liquidations: %s" (Exn.to_string exn)
        ) in
        Lwt.return []

  end

  (** Bybit liquidation fetcher *)
  module Bybit = struct

    let api_base = "https://api.bybit.com/v5"

    let fetch_liquidations
        ~(api_key: string option)
        ~(symbol: string)
        ~(time_window_ms: int64)
      : liquidation_event list Lwt.t =

      try%lwt
        let end_time = Int64.of_float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) *. 1000.0) in
        let start_time = Int64.(end_time - time_window_ms) in

        let url = Printf.sprintf "%s/market/liquidation?symbol=%s&startTime=%Ld&endTime=%Ld&limit=1000"
          api_base symbol start_time end_time
        in

        let headers = match api_key with
          | Some key -> Cohttp.Header.of_list [("X-BAPI-API-KEY", key)]
          | None -> Cohttp.Header.init ()
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get ~headers (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let result = json |> member "result" |> member "list" |> to_list in

        let liquidations = List.filter_map result ~f:(fun liq ->
          try
            let side_str = liq |> member "side" |> to_string in
            let side = if String.equal side_str "Buy" then `Long else `Short in

            let quantity = liq |> member "size" |> to_string |> Float.of_string in
            let price = liq |> member "price" |> to_string |> Float.of_string in
            let timestamp_ms = liq |> member "updatedTime" |> to_string |> Int64.of_string in

            let value_usd = Int64.of_float (quantity *. price *. 100.0) in

            Some {
              exchange = Bybit;
              asset = String.sub symbol ~pos:0 ~len:3; (* Extract BTC from BTCUSDT *)
              side;
              quantity;
              price;
              value_usd;
              timestamp = Int64.to_float timestamp_ms /. 1000.0;
            }
          with exn ->
            let () = Logs.warn (fun m ->
              m "Failed to parse Bybit liquidation: %s" (Exn.to_string exn)
            ) in
            None
        ) in

        Lwt.return liquidations

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching Bybit liquidations: %s" (Exn.to_string exn)
        ) in
        Lwt.return []

  end

  (** OKX liquidation fetcher *)
  module OKX = struct

    let api_base = "https://www.okx.com/api/v5"

    let fetch_liquidations
        ~(_api_key: string option)
        ~(inst_id: string)
        ~(time_window_ms: int64)
      : liquidation_event list Lwt.t =

      try%lwt
        (* OKX uses different time format *)
        let url = Printf.sprintf "%s/public/liquidation-orders?instId=%s&state=filled"
          api_base inst_id
        in

        let headers = match _api_key with
          | Some key -> Cohttp.Header.of_list [("OK-ACCESS-KEY", key)]
          | None -> Cohttp.Header.init ()
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get ~headers (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let data = json |> member "data" |> to_list in

        let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        let cutoff_time = current_time -. (Int64.to_float time_window_ms /. 1000.0) in

        let liquidations = List.filter_map data ~f:(fun liq ->
          try
            let side_str = liq |> member "side" |> to_string in
            let side = if String.equal side_str "buy" then `Long else `Short in

            let quantity = liq |> member "sz" |> to_string |> Float.of_string in
            let price = liq |> member "bkPx" |> to_string |> Float.of_string in
            let timestamp_ms = liq |> member "ts" |> to_string |> Int64.of_string in
            let timestamp = Int64.to_float timestamp_ms /. 1000.0 in

            if Float.(timestamp < cutoff_time) then None
            else
              let value_usd = Int64.of_float (quantity *. price *. 100.0) in

              Some {
                exchange = OKX;
                asset = String.sub inst_id ~pos:0 ~len:3; (* Extract BTC from BTC-USDT-SWAP *)
                side;
                quantity;
                price;
                value_usd;
                timestamp;
              }
          with _ -> None
        ) in

        Lwt.return liquidations

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching OKX liquidations: %s" (Exn.to_string exn)
        ) in
        Lwt.return []

  end

  (** Deribit liquidation fetcher *)
  module Deribit = struct

    let api_base = "https://www.deribit.com/api/v2"

    let fetch_liquidations
        ~(_api_key: string option)
        ~(instrument: string)
        ~(time_window_ms: int64)
      : liquidation_event list Lwt.t =

      try%lwt
        let end_timestamp = Int64.of_float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) *. 1000.0) in
        let start_timestamp = Int64.(end_timestamp - time_window_ms) in

        let url = Printf.sprintf "%s/public/get_last_settlements_by_instrument?instrument_name=%s&count=100"
          api_base instrument
        in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let settlements = json |> member "result" |> member "settlements" |> to_list in

        let liquidations = List.filter_map settlements ~f:(fun settlement ->
          try
            let timestamp = settlement |> member "timestamp" |> to_int |> Float.of_int in
            let settlement_type = settlement |> member "type" |> to_string in

            if not (String.equal settlement_type "liquidation") then None
            else if Float.(timestamp < Int64.to_float start_timestamp) then None
            else
              (* Deribit doesn't provide quantity directly in settlements *)
              (* Would need to query trades API for detailed data *)
              let position = settlement |> member "position" |> to_float in
              let mark_price = settlement |> member "mark_price" |> to_float in

              let side = if Float.(position > 0.0) then `Long else `Short in
              let quantity = Float.abs position in
              let value_usd = Int64.of_float (quantity *. mark_price *. 100.0) in

              Some {
                exchange = Deribit;
                asset = if String.is_prefix instrument ~prefix:"BTC" then "BTC" else "ETH";
                side;
                quantity;
                price = mark_price;
                value_usd;
                timestamp = timestamp /. 1000.0;
              }
          with _ -> None
        ) in

        Lwt.return liquidations

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Error fetching Deribit liquidations: %s" (Exn.to_string exn)
        ) in
        Lwt.return []

  end

  (** Fetch liquidations from all exchanges for an asset *)
  let fetch_all_liquidations
      ~(config: client_config)
      ~(asset: string) (* BTC, ETH, etc. *)
    : liquidation_event list Lwt.t =

    let time_window_ms = Int64.of_int (config.aggregation_window_seconds * 1000) in

    let%lwt binance_liqs = Binance.fetch_liquidations
      ~api_key:config.binance_api_key
      ~symbol:(asset ^ "USDT")
      ~time_window_ms
    in

    let%lwt bybit_liqs = Bybit.fetch_liquidations
      ~api_key:config.bybit_api_key
      ~symbol:(asset ^ "USDT")
      ~time_window_ms
    in

    let%lwt okx_liqs = OKX.fetch_liquidations
      ~_api_key:config.okx_api_key
      ~inst_id:(asset ^ "-USDT-SWAP")
      ~time_window_ms
    in

    let%lwt deribit_liqs = Deribit.fetch_liquidations
      ~_api_key:config.deribit_api_key
      ~instrument:(asset ^ "-PERPETUAL")
      ~time_window_ms
    in

    let all_liqs = binance_liqs @ bybit_liqs @ okx_liqs @ deribit_liqs in

    Lwt.return all_liqs

  (** Aggregate liquidations by exchange and asset *)
  let aggregate_liquidations
      ~(events: liquidation_event list)
      ~(exchange: exchange)
      ~(asset: string)
      ~(time_window_seconds: int)
    : liquidation_metrics =

    let exchange_events = List.filter events ~f:(fun e ->
      equal_exchange e.exchange exchange && String.equal e.asset asset
    ) in

    let total_liquidated = List.fold exchange_events ~init:0L ~f:(fun acc e ->
      Int64.(acc + e.value_usd)
    ) in

    let long_liquidated = List.fold exchange_events ~init:0L ~f:(fun acc e ->
      if Poly.equal e.side `Long then Int64.(acc + e.value_usd) else acc
    ) in

    let short_liquidated = List.fold exchange_events ~init:0L ~f:(fun acc e ->
      if Poly.equal e.side `Short then Int64.(acc + e.value_usd) else acc
    ) in

    let liquidation_count = List.length exchange_events in

    let avg_size = if liquidation_count = 0 then 0L
      else Int64.(total_liquidated / of_int liquidation_count)
    in

    let largest = List.fold exchange_events ~init:0L ~f:(fun acc e ->
      Int64.max acc e.value_usd
    ) in

    {
      exchange;
      asset;
      time_window_seconds;
      total_liquidated_usd = total_liquidated;
      long_liquidated_usd = long_liquidated;
      short_liquidated_usd = short_liquidated;
      liquidation_count;
      avg_liquidation_size_usd = avg_size;
      largest_liquidation_usd = largest;
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Fetch aggregated metrics for all exchanges and assets *)
  let fetch_all_metrics
      ~(config: client_config)
      ~(assets: string list)
    : liquidation_metrics list Lwt.t =

    let%lwt all_events =
      Lwt_list.map_s (fun asset ->
        fetch_all_liquidations ~config ~asset
      ) assets
    in

    let flattened_events = List.concat all_events in

    (* Aggregate by exchange and asset *)
    let all_exchanges = all_of_exchange in

    let metrics = List.concat_map all_exchanges ~f:(fun exchange ->
      List.map assets ~f:(fun asset ->
        aggregate_liquidations
          ~events:flattened_events
          ~exchange
          ~asset
          ~time_window_seconds:config.aggregation_window_seconds
      )
    ) in

    Lwt.return metrics

  (** Calculate market stress level from liquidation data *)
  let calculate_market_stress
      (metrics: liquidation_metrics list)
    : market_stress_level =

    (* Sum total liquidations across all exchanges *)
    let total_liquidated = List.fold metrics ~init:0L ~f:(fun acc m ->
      Int64.(acc + m.total_liquidated_usd)
    ) in

    let total_liquidated_usd = Int64.to_float total_liquidated /. 100.0 in

    (* Stress thresholds based on liquidation volume *)
    if Float.(total_liquidated_usd > 1_000_000_000.0) then Extreme (* >$1B liquidated *)
    else if Float.(total_liquidated_usd > 500_000_000.0) then High  (* >$500M *)
    else if Float.(total_liquidated_usd > 100_000_000.0) then Elevated (* >$100M *)
    else Normal

  (** Start continuous liquidation monitoring *)
  let start_liquidation_monitor
      ~(config: client_config)
      ~(assets: string list)
      ~(update_interval_seconds: float)
      ~(on_metrics: liquidation_metrics list -> unit Lwt.t)
    : unit Lwt.t =

    let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Fetching CEX liquidation data for %d assets..." (List.length assets)
      ) in

      let%lwt metrics = fetch_all_metrics ~config ~assets in

      let%lwt () = Logs_lwt.info (fun m ->
        let total = List.fold metrics ~init:0L ~f:(fun acc m -> Int64.(acc + m.total_liquidated_usd)) in
        m "Aggregated %d liquidation events, total: $%s"
          (List.fold metrics ~init:0 ~f:(fun acc m -> acc + m.liquidation_count))
          (Int64.to_string_hum ~delimiter:',' Int64.(total / 100L))
      ) in

      (* Calculate market stress *)
      let stress_level = calculate_market_stress metrics in
      let%lwt () = Logs_lwt.info (fun m ->
        m "Market stress level: %s"
          (match stress_level with
           | Normal -> "NORMAL"
           | Elevated -> "ELEVATED"
           | High -> "HIGH"
           | Extreme -> "EXTREME")
      ) in

      (* Call callback *)
      let%lwt () = on_metrics metrics in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Starting CEX liquidation monitor (interval: %.0fs)" update_interval_seconds
    ) in

    monitor_loop ()

end
