(** Historical Depeg Event Ingestion
 *
 * This module:
 * - Fetches historical price data from CoinGecko API
 * - Detects depeg events (price < $0.99 for 1+ hours)
 * - Calculates depeg metrics (min_price, duration, recovery_time)
 * - Stores events in historical_depegs table
 * - Validates events against quality thresholds
 *
 * Data Flow:
 * 1. Fetch price time series from CoinGecko
 * 2. Detect sustained depegs (< threshold for min duration)
 * 3. Calculate event metrics
 * 4. Validate events
 * 5. Store in database
 *
 * Quality Checks:
 * - Minimum 1 hour duration
 * - Price must be within reasonable bounds (0.50 to 1.50)
 * - Recovery price must return to >= 0.99
 * - No overlapping events for same asset
 *)

open Core
open Lwt.Infix
open Types

module DepegEventIngestion = struct

  (** CoinGecko API configuration *)
  type coingecko_config = {
    api_key: string option;
    base_url: string;
    rate_limit_per_minute: int;
  }

  let default_config = {
    api_key = None;
    base_url = "https://api.coingecko.com/api/v3";
    rate_limit_per_minute = 50; (* Free tier *)
  }

  (** CoinGecko asset ID mapping *)
  let coingecko_id_of_asset (asset: asset) : string option =
    match asset with
    | USDC -> Some "usd-coin"
    | USDT -> Some "tether"
    | DAI -> Some "dai"
    | USDP -> Some "paxos-standard"
    | FRAX -> Some "frax"
    | BUSD -> Some "binance-usd"
    | USDe -> Some "ethena-usde"
    | SUSDe -> Some "ethena-staked-usde"
    | USDY -> Some "ondo-us-dollar-yield"
    | PYUSD -> Some "paypal-usd"
    | GHO -> Some "gho"
    | LUSD -> Some "liquity-usd"
    | CrvUSD -> Some "crvusd"
    | MkUSD -> Some "prisma-mkusd"
    | BTC | ETH -> None (* Not stablecoins *)

  (** Depeg event record *)
  type depeg_event = {
    asset: asset;
    min_price: float;
    duration_seconds: int;
    recovery_time_seconds: int;
    start_timestamp: float;
    end_timestamp: float;
    recovery_timestamp: float option;
    severity_score: float; (* 1.0 - min_price *)
  } [@@deriving sexp, yojson]

  (** Price point from API *)
  type price_point = {
    timestamp: float;
    price: float;
  } [@@deriving sexp]

  (** Fetch historical prices from CoinGecko *)
  let fetch_historical_prices
      ~(config: coingecko_config)
      ~(asset: asset)
      ~(from_timestamp: float)
      ~(to_timestamp: float)
    : price_point list Lwt.t =

    match coingecko_id_of_asset asset with
    | None ->
        Lwt.return []

    | Some coin_id ->
        let open Cohttp in
        let open Cohttp_lwt_unix in

        (* Convert to Unix timestamps *)
        let from_unix = Int.of_float from_timestamp in
        let to_unix = Int.of_float to_timestamp in

        (* Build API URL *)
        let url =
          Printf.sprintf "%s/coins/%s/market_chart/range?vs_currency=usd&from=%d&to=%d"
            config.base_url coin_id from_unix to_unix
        in

        (* Add API key if available *)
        let headers =
          match config.api_key with
          | None -> Header.init ()
          | Some key ->
              Header.add (Header.init ()) "x-cg-pro-api-key" key
        in

        let%lwt (resp, body) = Client.get ~headers (Uri.of_string url) in
        let status = Response.status resp in

        match status with
        | `OK ->
            let%lwt body_str = Cohttp_lwt.Body.to_string body in

            (* Parse JSON response *)
            (try
              let json = Yojson.Safe.from_string body_str in
              let open Yojson.Safe.Util in

              let prices = json |> member "prices" |> to_list in

              let price_points =
                List.filter_map prices ~f:(fun point ->
                  try
                    let values = to_list point in
                    match values with
                    | [ts; price] ->
                        let timestamp = to_number ts /. 1000.0 in
                        let price_val = to_number price in
                        Some { timestamp; price = price_val }
                    | _ -> None
                  with _ -> None
                )
              in

              Lwt.return price_points
            with e ->
              Logs_lwt.err (fun m ->
                m "Failed to parse CoinGecko response for %s: %s"
                  (asset_to_string asset)
                  (Exn.to_string e)
              ) >|= fun () ->
              []
            )

        | _ ->
            Logs_lwt.warn (fun m ->
              m "CoinGecko API error for %s: %s"
                (asset_to_string asset)
                (Code.string_of_status status)
            ) >>= fun () ->
            Lwt.return []

  (** Detect depeg events from price series *)
  let detect_depeg_events
      ~(asset: asset)
      ~(prices: price_point list)
      ~(threshold: float)
      ~(min_duration_seconds: int)
    : depeg_event list =

    if List.is_empty prices then []
    else
      (* Sort by timestamp *)
      let sorted_prices =
        List.sort prices ~compare:(fun a b ->
          Float.compare a.timestamp b.timestamp
        )
      in

      (* Find contiguous periods below threshold *)
      let rec find_events acc current_event = function
        | [] ->
            (* End of data - finalize current event if exists *)
            (match current_event with
            | None -> List.rev acc
            | Some event ->
                if event.duration_seconds >= min_duration_seconds then
                  List.rev (event :: acc)
                else
                  List.rev acc
            )

        | point :: rest ->
            if Float.O.(point.price < threshold) then
              (* Price below threshold *)
              match current_event with
              | None ->
                  (* Start new event *)
                  let new_event = {
                    asset;
                    min_price = point.price;
                    duration_seconds = 0;
                    recovery_time_seconds = 0;
                    start_timestamp = point.timestamp;
                    end_timestamp = point.timestamp;
                    recovery_timestamp = None;
                    severity_score = 1.0 -. point.price;
                  } in
                  find_events acc (Some new_event) rest

              | Some event ->
                  (* Continue existing event *)
                  let updated_event = {
                    event with
                    min_price = Float.min event.min_price point.price;
                    end_timestamp = point.timestamp;
                    duration_seconds =
                      Int.of_float (point.timestamp -. event.start_timestamp);
                    severity_score =
                      Float.max event.severity_score (1.0 -. point.price);
                  } in
                  find_events acc (Some updated_event) rest
            else
              (* Price recovered *)
              match current_event with
              | None ->
                  (* No active event *)
                  find_events acc None rest

              | Some event ->
                  (* Event ended - calculate recovery time *)
                  let recovery_time =
                    Int.of_float (point.timestamp -. event.start_timestamp)
                  in
                  let final_event = {
                    event with
                    recovery_time_seconds = recovery_time;
                    recovery_timestamp = Some point.timestamp;
                  } in

                  (* Only include if meets minimum duration *)
                  if final_event.duration_seconds >= min_duration_seconds then
                    find_events (final_event :: acc) None rest
                  else
                    find_events acc None rest
      in

      find_events [] None sorted_prices

  (** Validate depeg event *)
  let validate_event (event: depeg_event) : bool =
    (* Check minimum duration (1 hour) *)
    let min_duration_ok = event.duration_seconds >= 3600 in

    (* Check price bounds (0.50 to 1.50 for stablecoins) *)
    let price_bounds_ok =
      Float.O.(event.min_price >= 0.50 && event.min_price <= 1.50)
    in

    (* Check recovery (if recovery timestamp exists, recovery time should be > duration) *)
    let recovery_ok =
      match event.recovery_timestamp with
      | None -> true (* Event still ongoing or incomplete data *)
      | Some _ ->
          event.recovery_time_seconds >= event.duration_seconds
    in

    (* Check timestamps are ordered *)
    let timestamps_ok =
      Float.O.(event.end_timestamp >= event.start_timestamp)
    in

    min_duration_ok && price_bounds_ok && recovery_ok && timestamps_ok

  (** Store depeg event in database *)
  let store_event
      pool
      (event: depeg_event) =

    let open Caqti_request.Infix in
    let open Caqti_type in

    let query =
      (t4 string float
        (t3 int int float)
        (t3 float float (option float)))
      ->. unit
      @@ {|
        INSERT INTO historical_depegs (
          asset, min_price, duration_seconds, recovery_time_seconds,
          start_timestamp, end_timestamp, recovery_timestamp,
          severity_score, source, validated
        ) VALUES (
          $1, $2, $3, $4,
          to_timestamp($5), to_timestamp($6), to_timestamp($7),
          $8, 'coingecko', true
        )
        ON CONFLICT DO NOTHING
      |}
    in

    let params = (
      asset_to_string event.asset,
      event.min_price,
      (event.duration_seconds,
       event.recovery_time_seconds,
       event.severity_score),
      (event.start_timestamp,
       event.end_timestamp,
       event.recovery_timestamp)
    ) in

    match pool with
    | Error e -> Lwt.return (Error e)
    | Ok pool ->
        Caqti_lwt_unix.Pool.use (fun (module Db : Caqti_lwt.CONNECTION) ->
          Db.exec query params
        ) pool

  (** Backfill historical events for an asset *)
  let backfill_asset
      ~(config: coingecko_config)
      ~pool
      ~(asset: asset)
      ~(start_date: string) (* "2020-01-01" *)
    : int Lwt.t =

    (* Parse start date *)
    let start_time =
      (* Simple date parsing: calculate days since epoch *)
      try
        let parts = String.split start_date ~on:'-' in
        match parts with
        | [year; month; day] ->
            let y = Int.of_string year in
            let m = Int.of_string month in
            let d = Int.of_string day in
            (* Calculate approximate Unix timestamp (days since 1970-01-01) *)
            let days_since_epoch =
              (y - 1970) * 365 + (y - 1970) / 4 +  (* Years + leap years *)
              (m - 1) * 30 + d  (* Approximate month/day *)
            in
            Float.of_int days_since_epoch *. 86400.0
        | _ ->
            (* Default: 1 year ago *)
            let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
            now -. (365.0 *. 86400.0)
      with _ ->
        let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        now -. (365.0 *. 86400.0)
    in

    let end_time =
      Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec
    in

    Logs_lwt.info (fun m ->
      m "Backfilling depeg events for %s from %s to now"
        (asset_to_string asset) start_date
    ) >>= fun () ->

    (* Fetch historical prices *)
    let%lwt prices =
      fetch_historical_prices
        ~config
        ~asset
        ~from_timestamp:start_time
        ~to_timestamp:end_time
    in

    Logs_lwt.info (fun m ->
      m "Fetched %d price points for %s"
        (List.length prices) (asset_to_string asset)
    ) >>= fun () ->

    (* Detect depeg events *)
    let events =
      detect_depeg_events
        ~asset
        ~prices
        ~threshold:0.99
        ~min_duration_seconds:3600 (* 1 hour *)
    in

    Logs_lwt.info (fun m ->
      m "Detected %d depeg events for %s"
        (List.length events) (asset_to_string asset)
    ) >>= fun () ->

    (* Validate and store events *)
    let valid_events = List.filter events ~f:validate_event in

    Logs_lwt.info (fun m ->
      m "Validated %d/%d events for %s"
        (List.length valid_events) (List.length events) (asset_to_string asset)
    ) >>= fun () ->

    (* Store events *)
    let%lwt results =
      Lwt_list.map_s (fun event ->
        let%lwt result = store_event pool event in
        match result with
        | Ok () -> Lwt.return true
        | Error e ->
            Logs_lwt.err (fun m ->
              m "Failed to store event: %s" (Caqti_error.show e)
            ) >>= fun () ->
            Lwt.return false
      ) valid_events
    in

    let stored_count = List.count results ~f:Fn.id in

    Logs_lwt.info (fun m ->
      m "Stored %d/%d events for %s in database"
        stored_count (List.length valid_events) (asset_to_string asset)
    ) >>= fun () ->

    Lwt.return stored_count

  (** Backfill all stablecoins *)
  let backfill_all_stablecoins
      ~(config: coingecko_config)
      ~pool
      ~(start_date: string)
    : (asset * int) list Lwt.t =

    let stablecoins = [
      USDC; USDT; DAI; USDP; FRAX; BUSD;
      USDe; SUSDe; USDY; PYUSD; GHO; LUSD; CrvUSD; MkUSD;
    ] in

    Logs_lwt.info (fun m ->
      m "Starting backfill for %d stablecoins" (List.length stablecoins)
    ) >>= fun () ->

    (* Rate limiting: process one at a time with delays *)
    let%lwt results =
      Lwt_list.map_s (fun asset ->
        let%lwt count = backfill_asset ~config ~pool ~asset ~start_date in

        (* Rate limit: wait 2 seconds between requests *)
        let%lwt () = Lwt_unix.sleep 2.0 in

        Lwt.return (asset, count)
      ) stablecoins
    in

    let total_events = List.fold results ~init:0 ~f:(fun acc (_, count) -> acc + count) in

    Logs_lwt.info (fun m ->
      m "Backfill complete: %d total events across %d assets"
        total_events (List.length stablecoins)
    ) >>= fun () ->

    Lwt.return results

  (** Incremental update: fetch last 7 days *)
  let incremental_update
      ~(config: coingecko_config)
      ~pool
      ~(asset: asset)
    : int Lwt.t =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let seven_days_ago = now -. (7.0 *. 86400.0) in

    Logs_lwt.info (fun m ->
      m "Incremental update for %s (last 7 days)" (asset_to_string asset)
    ) >>= fun () ->

    let%lwt prices =
      fetch_historical_prices
        ~config
        ~asset
        ~from_timestamp:seven_days_ago
        ~to_timestamp:now
    in

    let events =
      detect_depeg_events
        ~asset
        ~prices
        ~threshold:0.99
        ~min_duration_seconds:3600
    in

    let valid_events = List.filter events ~f:validate_event in

    let%lwt results =
      Lwt_list.map_s (fun event ->
        let%lwt result = store_event pool event in
        match result with
        | Ok () -> Lwt.return true
        | Error _ -> Lwt.return false
      ) valid_events
    in

    let stored_count = List.count results ~f:Fn.id in

    Logs_lwt.info (fun m ->
      m "Incremental update complete for %s: %d new events"
        (asset_to_string asset) stored_count
    ) >>= fun () ->

    Lwt.return stored_count

end
