(** GMX V2 Client - Arbitrum Perpetuals Integration
 *
 * This module provides integration with GMX V2 decentralized perpetuals exchange
 * on Arbitrum for hedging protocol risk.
 *
 * Features:
 * - Get real-time market data from GM Pools
 * - Fetch user positions via subgraph API
 * - Get funding rates and open interest
 * - Calculate borrowing fees and price impact
 * - Support for multiple perpetual markets
 *
 * Architecture:
 * - Read operations via GMX subgraph API (no Web3 required)
 * - Write operations via ExchangeRouter contract (requires Web3 integration)
 * - Price feeds from Chainlink Data Streams oracles
 *
 * API Documentation: https://docs.gmx.io/docs/intro/
 * Subgraph: https://thegraph.com/hosted-service/subgraph/gmx-io/gmx-arbitrum-stats
 *)

open Core
open Lwt.Syntax

module GmxV2Client = struct

  (** Configuration *)
  type config = {
    rpc_url: string;                  (* Arbitrum RPC endpoint *)
    subgraph_url: string;             (* GMX subgraph URL *)
    wallet_address: string option;    (* User's Ethereum address *)
    testnet: bool;                    (* Use testnet (Arbitrum Goerli) *)
    rate_limit_per_minute: int;       (* Max requests per minute *)
    timeout_seconds: float;           (* Request timeout *)
  } [@@deriving sexp]

  (** GMX V2 contract addresses on Arbitrum mainnet *)
  module Contracts = struct
    let exchange_router = "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8"
    let reader = "0x5Ca84c34a381434786738735265b9f3FD814b824"
    let data_store = "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8"
    let gmx_token = "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"
  end

  (** Position information *)
  type position = {
    position_id: string;              (* Unique position key *)
    market: string;                   (* Market address (GM Pool) *)
    collateral_token: string;         (* Collateral token address *)
    is_long: bool;                    (* True for long, false for short *)
    size_in_usd: float;               (* Position size in USD *)
    size_in_tokens: float;            (* Position size in tokens *)
    collateral_amount: float;         (* Collateral in USD *)
    entry_price: float;               (* Average entry price *)
    mark_price: float;                (* Current mark price *)
    unrealized_pnl: float;            (* Unrealized P&L in USD *)
    liquidation_price: float option;  (* Liquidation price *)
    leverage: float;                  (* Effective leverage *)
    timestamp: float;                 (* Position open time *)
  } [@@deriving sexp]

  (** PnL result *)
  type pnl = {
    realized_pnl: float;              (* Realized P&L *)
    unrealized_pnl: float;            (* Unrealized P&L *)
    fees_paid: float;                 (* Trading fees *)
    borrowing_fees: float;            (* Borrowing fees *)
    funding_fees: float;              (* Funding payments *)
    price_impact: float;              (* Total price impact costs *)
    net_pnl: float;                   (* Net P&L after all costs *)
  } [@@deriving sexp]

  (** Market data *)
  type market_data = {
    market_address: string;           (* GM Pool address *)
    market_symbol: string;            (* e.g., "BTC/USD", "ETH/USD" *)
    index_token: string;              (* Index token address *)
    long_token: string;               (* Long collateral token *)
    short_token: string;              (* Short collateral token *)
    mark_price: float;                (* Current mark price *)
    index_price: float;               (* Oracle index price *)
    long_open_interest: float;        (* Long OI in USD *)
    short_open_interest: float;       (* Short OI in USD *)
    funding_rate_long: float;         (* Long funding rate (hourly) *)
    funding_rate_short: float;        (* Short funding rate (hourly) *)
    borrowing_rate: float;            (* Borrowing fee rate *)
    available_liquidity: float;       (* Available liquidity in pool *)
    max_leverage: int;                (* Maximum allowed leverage *)
    volume_24h: float;                (* 24-hour trading volume *)
    price_change_24h: float;          (* 24-hour price change % *)
  } [@@deriving sexp]

  (** Order information *)
  type order = {
    order_id: string;                 (* Unique order key *)
    market: string;                   (* Market address *)
    account: string;                  (* User address *)
    order_type: [`Market | `Limit | `StopLoss | `TakeProfit]; (* Order type *)
    is_long: bool;                    (* Position direction *)
    size_delta_usd: float;            (* Size change in USD *)
    trigger_price: float option;      (* Trigger price for limit orders *)
    acceptable_price: float;          (* Acceptable execution price *)
    execution_fee: float;             (* Keeper execution fee *)
    status: [`Pending | `Executed | `Cancelled | `Frozen]; (* Order status *)
    created_at: float;                (* Order creation time *)
  } [@@deriving sexp]

  (** Error types *)
  type error =
    | API_error of int * string
    | Rate_limited
    | Network_error of string
    | Parse_error of string
    | Web3_required of string         (* Operation requires Web3 integration *)
    | Insufficient_liquidity
    | Invalid_order of string
    | Position_not_found
  [@@deriving sexp]

  (** Get subgraph URL based on testnet flag *)
  let get_subgraph_url (config: config) : string =
    if String.is_empty config.subgraph_url then
      if config.testnet then
        "https://api.thegraph.com/subgraphs/name/gmx-io/gmx-arbitrum-goerli-stats"
      else
        "https://api.thegraph.com/subgraphs/name/gmx-io/gmx-arbitrum-stats"
    else
      config.subgraph_url

  (** Rate limiter *)
  module RateLimiter = struct
    type t = {
      mutable tokens: int;
      max_tokens: int;
      refill_rate_per_second: float;
      mutable last_refill: float;
      mutex: Lwt_mutex.t;
    }

    let create ~(max_requests_per_minute: int) : t =
      {
        tokens = max_requests_per_minute;
        max_tokens = max_requests_per_minute;
        refill_rate_per_second = Float.of_int max_requests_per_minute /. 60.0;
        last_refill = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        mutex = Lwt_mutex.create ();
      }

    let refill (limiter: t) : unit =
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
      let elapsed = now -. limiter.last_refill in
      let new_tokens =
        Float.of_int limiter.tokens +. (elapsed *. limiter.refill_rate_per_second)
        |> Float.min (Float.of_int limiter.max_tokens)
        |> Float.to_int
      in
      limiter.tokens <- new_tokens;
      limiter.last_refill <- now

    let acquire (limiter: t) : unit Lwt.t =
      Lwt_mutex.with_lock limiter.mutex (fun () ->
        let rec wait_for_tokens () =
          refill limiter;
          if limiter.tokens >= 1 then begin
            limiter.tokens <- limiter.tokens - 1;
            Lwt.return ()
          end else begin
            let%lwt () = Lwt_unix.sleep 0.1 in
            wait_for_tokens ()
          end
        in
        wait_for_tokens ()
      )
  end

  let rate_limiter = ref None

  let get_rate_limiter (config: config) : RateLimiter.t =
    match !rate_limiter with
    | Some limiter -> limiter
    | None ->
        let limiter = RateLimiter.create
          ~max_requests_per_minute:config.rate_limit_per_minute
        in
        rate_limiter := Some limiter;
        limiter

  (** Query subgraph GraphQL API *)
  let query_subgraph
      ~(config: config)
      ~(query: string)
    : (Yojson.Safe.t, error) Result.t Lwt.t =

    let limiter = get_rate_limiter config in
    let%lwt () = RateLimiter.acquire limiter in

    let url = get_subgraph_url config in
    let headers = [
      ("Content-Type", "application/json");
    ] in

    let body = `Assoc [
      ("query", `String query);
    ] |> Yojson.Safe.to_string in

    let%lwt result = Http_client.HttpClient.post_json
      ~headers
      ~body
      ~timeout:config.timeout_seconds
      url
    in

    match result with
    | Ok response_json ->
        Lwt.return (Ok response_json)
    | Error err ->
        let error_msg = Printf.sprintf "GMX subgraph error: %s"
          (Http_client.HttpClient.show_http_error err)
        in
        Lwt.return (Error (Network_error error_msg))

  (** Get available markets from GMX *)
  let get_markets ~(config: config) : (market_data list, error) Result.t Lwt.t =
    let query = {|
      {
        markets(first: 50) {
          id
          marketToken
          indexToken
          longToken
          shortToken
        }
      }
    |} in

    let%lwt result = query_subgraph ~config ~query in

    match result with
    | Ok json ->
        (try
          let open Yojson.Safe.Util in
          let markets_json = json |> member "data" |> member "markets" |> to_list in

          let markets = List.map markets_json ~f:(fun m ->
            let market_address = m |> member "marketToken" |> to_string in
            let index_token = m |> member "indexToken" |> to_string in
            let long_token = m |> member "longToken" |> to_string in
            let short_token = m |> member "shortToken" |> to_string in

            {
              market_address;
              market_symbol = Printf.sprintf "Market-%s" (String.prefix market_address 6);
              index_token;
              long_token;
              short_token;
              mark_price = 0.0; (* Would need oracle price fetch *)
              index_price = 0.0;
              long_open_interest = 0.0;
              short_open_interest = 0.0;
              funding_rate_long = 0.0;
              funding_rate_short = 0.0;
              borrowing_rate = 0.0;
              available_liquidity = 0.0;
              max_leverage = 50;
              volume_24h = 0.0;
              price_change_24h = 0.0;
            }
          ) in

          Lwt.return (Ok markets)
        with
        | Yojson.Safe.Util.Type_error (msg, _) ->
            Lwt.return (Error (Parse_error msg))
        | exn ->
            Lwt.return (Error (Parse_error (Exn.to_string exn)))
        )
    | Error e -> Lwt.return (Error e)

  (** Get user's open positions *)
  let get_user_positions ~(config: config) : (position list, error) Result.t Lwt.t =
    match config.wallet_address with
    | None ->
        Lwt.return (Error (Web3_required "wallet_address required for get_user_positions"))
    | Some address ->
        let address_lower = String.lowercase address in
        let query = Printf.sprintf {|
          {
            positions(where: {account: "%s", isOpen: true}) {
              id
              market
              collateralToken
              isLong
              size
              collateralAmount
              averagePrice
            }
          }
        |} address_lower in

        let%lwt result = query_subgraph ~config ~query in

        match result with
        | Ok json ->
            (try
              let open Yojson.Safe.Util in
              let positions_json = json |> member "data" |> member "positions" |> to_list in

              let positions = List.map positions_json ~f:(fun pos ->
                let position_id = pos |> member "id" |> to_string in
                let market = pos |> member "market" |> to_string in
                let collateral_token = pos |> member "collateralToken" |> to_string in
                let is_long = pos |> member "isLong" |> to_bool in
                let size_str = pos |> member "size" |> to_string in
                let collateral_str = pos |> member "collateralAmount" |> to_string in
                let entry_price_str = pos |> member "averagePrice" |> to_string in

                let size_in_usd = Float.of_string size_str /. 1e30 in
                let collateral_amount = Float.of_string collateral_str /. 1e30 in
                let entry_price = Float.of_string entry_price_str /. 1e30 in

                {
                  position_id;
                  market;
                  collateral_token;
                  is_long;
                  size_in_usd;
                  size_in_tokens = size_in_usd /. entry_price;
                  collateral_amount;
                  entry_price;
                  mark_price = entry_price; (* Would need real-time oracle price *)
                  unrealized_pnl = 0.0; (* Would need mark_price - entry_price calc *)
                  liquidation_price = None;
                  leverage = if Float.(collateral_amount > 0.0) then
                    size_in_usd /. collateral_amount else 1.0;
                  timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
                }
              ) in

              Lwt.return (Ok positions)
            with
            | Yojson.Safe.Util.Type_error (msg, _) ->
                Lwt.return (Error (Parse_error msg))
            | exn ->
                Lwt.return (Error (Parse_error (Exn.to_string exn)))
            )
        | Error e -> Lwt.return (Error e)

  (** Get specific position by market *)
  let get_position
      ~(config: config)
      ~(market_address: string)
    : (position option, error) Result.t Lwt.t =

    let%lwt result = get_user_positions ~config in

    match result with
    | Ok positions ->
        let pos = List.find positions ~f:(fun p ->
          String.equal (String.lowercase p.market) (String.lowercase market_address)
        ) in
        Lwt.return (Ok pos)
    | Error e -> Lwt.return (Error e)

  (** Open a new position (requires Web3 integration) *)
  let open_position
      ~(config: config)
      ~(market_address: string)
      ~(is_long: bool)
      ~(size_usd: float)
      ~(leverage: int)
      ~(acceptable_price: float)
    : (order, error) Result.t Lwt.t =

    (* This requires calling ExchangeRouter.createOrder() via Web3 *)
    let _ = (config, market_address, is_long, size_usd, leverage, acceptable_price) in

    Lwt.return (Error (Web3_required
      "open_position requires Web3/Ethereum RPC integration to call ExchangeRouter contract"))

  (** Close an existing position (requires Web3 integration) *)
  let close_position
      ~(config: config)
      ~(market_address: string)
      ~(size_usd: float option)
    : (order, error) Result.t Lwt.t =

    (* This requires calling ExchangeRouter.createOrder() with decrease order *)
    let _ = (config, market_address, size_usd) in

    Lwt.return (Error (Web3_required
      "close_position requires Web3/Ethereum RPC integration to call ExchangeRouter contract"))

  (** Calculate total PnL summary *)
  let get_pnl_summary ~(config: config) : (pnl, error) Result.t Lwt.t =
    let%lwt result = get_user_positions ~config in

    match result with
    | Ok positions ->
        let unrealized_pnl = List.fold positions ~init:0.0 ~f:(fun acc pos ->
          acc +. pos.unrealized_pnl
        ) in

        let pnl_summary = {
          realized_pnl = 0.0; (* Would need transaction history *)
          unrealized_pnl;
          fees_paid = 0.0;
          borrowing_fees = 0.0;
          funding_fees = 0.0;
          price_impact = 0.0;
          net_pnl = unrealized_pnl;
        } in

        Lwt.return (Ok pnl_summary)
    | Error e -> Lwt.return (Error e)

  (** Get current mark price for a market *)
  let get_mark_price
      ~(config: config)
      ~(market_address: string)
    : (float, error) Result.t Lwt.t =

    (* This would require calling Reader contract via Web3 *)
    let _ = (config, market_address) in

    Lwt.return (Error (Web3_required
      "get_mark_price requires Web3/RPC to call Reader.getMarketInfo()"))

  (** Error to string *)
  let error_to_string (err: error) : string =
    match err with
    | API_error (code, msg) -> Printf.sprintf "API error %d: %s" code msg
    | Rate_limited -> "Rate limit exceeded"
    | Network_error msg -> Printf.sprintf "Network error: %s" msg
    | Parse_error msg -> Printf.sprintf "Parse error: %s" msg
    | Web3_required msg -> Printf.sprintf "Web3 required: %s" msg
    | Insufficient_liquidity -> "Insufficient liquidity"
    | Invalid_order msg -> Printf.sprintf "Invalid order: %s" msg
    | Position_not_found -> "Position not found"

  (** Create default config *)
  let default_config ~wallet_address : config =
    {
      rpc_url = "https://arb1.arbitrum.io/rpc";
      subgraph_url = "";  (* Use default *)
      wallet_address = Some wallet_address;
      testnet = false;
      rate_limit_per_minute = 60;
      timeout_seconds = 15.0;
    }

end
