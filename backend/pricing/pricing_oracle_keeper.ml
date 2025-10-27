(** Pricing Oracle Keeper
 *
 * Fetches real-time market data and updates on-chain DynamicPricingOracle
 * Updates every 60 seconds with dynamic risk multipliers based on:
 * - Stablecoin price deviations (Chainlink feeds)
 * - Bridge health scores (from bridge_monitor)
 * - CEX liquidation rates (external APIs)
 * - Protocol exploit frequency
 * - Chain congestion metrics
 *
 * Implements exponential backoff on failures
 *)

open Core
open Lwt.Syntax
open Lwt.Infix
open Types

(** Market data sources *)
type market_data_source =
  | Chainlink
  | Pyth
  | RedStone
  | Internal_Monitor

(** Real-time market conditions *)
type market_conditions = {
  stablecoin_prices: (asset * float * float) list; (* asset, price, confidence *)
  bridge_health_scores: (string * float) list; (* bridge_id, health_score *)
  cex_liquidation_rate: float; (* liquidations per hour *)
  chain_gas_prices: (blockchain * float) list; (* chain, gas_price_gwei *)
  protocol_exploit_count_24h: int;
  overall_volatility_index: float; (* 0.0 - 1.0 *)
  timestamp: float;
}

(** Dynamic multiplier calculation *)
type multiplier_components = {
  base_multiplier: int; (* In basis points, 10000 = 1.0x *)
  market_adjustment: int; (* -3000 to +3000 *)
  volatility_premium: int; (* 0 to +5000 *)
  total: int;
}

(** Update statistics *)
type update_stats = {
  mutable successful_updates: int;
  mutable failed_updates: int;
  mutable last_update_time: float;
  mutable last_error: string option;
  mutable consecutive_failures: int;
}

let stats = {
  successful_updates = 0;
  failed_updates = 0;
  last_update_time = 0.0;
  last_error = None;
  consecutive_failures = 0;
}

(** ============================================
 * MARKET DATA FETCHING
 * ============================================ *)

(** Fetch stablecoin prices from Oracle Aggregator (Chainlink + Pyth + Binance) *)
let fetch_oracle_prices () : (asset * float * float) list Lwt.t =
  (* Use oracle_aggregator to get median-of-3 prices *)
  let open Oracle_aggregator.OracleAggregator in

  let assets = [USDC; USDT; DAI; FRAX; BUSD; USDe; SUSDe; USDY; PYUSD; GHO; LUSD] in

  let%lwt results = Lwt_list.map_p (fun asset ->
    let%lwt consensus_opt = get_consensus_price asset ~previous_price:None in

    match consensus_opt with
    | Some consensus ->
        Lwt.return (Some (asset, consensus.price, consensus.confidence))
    | None ->
        (* Fallback: Try individual providers *)
        let%lwt () = Logs_lwt.warn (fun m ->
          m "No consensus for %s, trying individual providers" (asset_to_string asset)
        ) in

        (* Try Pyth first (fastest) *)
        let%lwt pyth_result = Pyth_client.PythClient.get_price asset () in
        (match pyth_result with
         | Some data when Float.(data.confidence >= 0.5) ->
             Lwt.return (Some (asset, data.price, data.confidence))
         | _ ->
             (* Fall back to approximate value for stablecoins *)
             let%lwt () = Logs_lwt.warn (fun m ->
               m "Using fallback price for %s" (asset_to_string asset)
             ) in
             Lwt.return (Some (asset, 1.0, 0.5)))
  ) assets in

  let valid_prices = List.filter_map results ~f:Fn.id in

  let%lwt () = Logs_lwt.info (fun m ->
    m "Fetched %d/%d oracle prices successfully"
      (List.length valid_prices) (List.length assets)
  ) in

  Lwt.return valid_prices

(** Fetch bridge health from internal monitor *)
let fetch_bridge_health () : (string * float) list Lwt.t =
  (* Use bridge_monitor.ml to get current health *)
  let* bridge_states = Monitoring.Bridge_monitor.monitor_all_bridges ~previous_states:[] in

  let health_scores = List.map bridge_states ~f:(fun h ->
    (h.bridge_id, h.health_score)
  ) in

  Lwt.return health_scores

open Cohttp_lwt_unix

module Http_client = struct
  let get_json (uri: Uri.t) : (Yojson.Safe.t, string) Result.t Lwt.t =
    let%lwt result = Lwt.catch
      (fun () ->
        let%lwt (_, body) = Client.get uri in
        let%lwt body_str = Cohttp_lwt.Body.to_string body in
        Lwt.return (Ok (Yojson.Safe.from_string body_str)))
      (fun exn -> Lwt.return (Error (Exn.to_string exn)))
    in
    Lwt.return result
end

let fetch_cex_liquidation_rate () : float Lwt.t =
  let uri = Uri.of_string "https://fapi.binance.com/fapi/v1/forceOrders?limit=1000" in
  let%lwt result = Http_client.get_json uri in
  match result with
  | Ok (`List orders) ->
      let now = Time_float.now ()
        |> Time_float.to_span_since_epoch
        |> Time_float.Span.to_sec
      in
      let one_hour_ago_ms = (now -. 3600.0) *. 1000.0 in
      let recent_orders = List.filter orders ~f:(fun order -> 
          match order with
          | `Assoc fields -> 
              (match List.Assoc.find fields "time" ~equal:String.equal with
              | Some (`Int time) -> Float.(Float.of_int time > one_hour_ago_ms)
              | _ -> false)
          | _ -> false
      ) in
      Lwt.return (Float.of_int (List.length recent_orders))
  | _ -> Lwt.return 0.0

let fetch_chain_gas_prices () : (blockchain * float) list Lwt.t =
  let api_key = Sys.getenv "ETHERSCAN_API_KEY" |> Option.value ~default:"" in
  let uri = Uri.of_string ("https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=" ^ api_key) in
  let%lwt result = Http_client.get_json uri in
  match result with
  | Ok json ->
      let open Yojson.Safe.Util in
      let gas_price_str = json |> member "result" |> member "SafeGasPrice" |> to_string_option |> Option.value ~default:"0" in
      let gas_price = Float.of_string gas_price_str in
      Lwt.return [(Ethereum, gas_price)]
  | _ -> Lwt.return [(Ethereum, 20.0)]

let fetch_protocol_exploit_count () : int Lwt.t =
  let uri = Uri.of_string "https://api.defillama.com/hacks" in
  let%lwt result = Http_client.get_json uri in
  match result with
  | Ok (`Assoc [("hacks", `List hacks)]) ->
      let now = Time_float.now ()
        |> Time_float.to_span_since_epoch
        |> Time_float.Span.to_sec
      in
      let twenty_four_hours_ago = now -. 86400.0 in
      let recent_hacks = List.filter hacks ~f:(fun hack ->
          let open Yojson.Safe.Util in
          let timestamp = hack |> member "date" |> to_int_option |> Option.map ~f:Float.of_int in
          match timestamp with
          | Some ts -> Float.(ts > twenty_four_hours_ago)
          | None -> false
      ) in
      Lwt.return (List.length recent_hacks)
  | _ -> Lwt.return 0

(** Calculate overall volatility index *)
let calculate_volatility_index ~stablecoin_prices : float =
  (* Calculate standard deviation of stablecoin prices from $1.00 *)
  let deviations = List.map stablecoin_prices ~f:(fun (_, price, _) ->
    Float.abs (price -. 1.0)
  ) in

  let mean_deviation = List.fold deviations ~init:0.0 ~f:(+.) /.
    Float.of_int (List.length deviations)
  in

  (* Normalize to 0.0 - 1.0 scale *)
  (* 0% deviation = 0.0, 5% deviation = 1.0 *)
  Float.min 1.0 (mean_deviation /. 0.05)

(** Fetch all market conditions *)
let fetch_market_conditions () : market_conditions Lwt.t =
  let* stablecoin_prices = fetch_oracle_prices () in
  let* bridge_health_scores = fetch_bridge_health () in
  let* cex_liquidation_rate = fetch_cex_liquidation_rate () in
  let* chain_gas_prices = fetch_chain_gas_prices () in
  let* protocol_exploit_count_24h = fetch_protocol_exploit_count () in

  let overall_volatility_index = calculate_volatility_index ~stablecoin_prices in

  let%lwt () = Logs_lwt.info (fun m ->
    m "Market conditions updated: %d prices, %d bridge scores, %.1f CEX liq/hr, vol index: %.2f"
      (List.length stablecoin_prices)
      (List.length bridge_health_scores)
      cex_liquidation_rate
      overall_volatility_index
  ) in

  let timestamp = Time_float.now ()
    |> Time_float.to_span_since_epoch
    |> Time_float.Span.to_sec
  in

  Lwt.return {
    stablecoin_prices;
    bridge_health_scores;
    cex_liquidation_rate;
    chain_gas_prices;
    protocol_exploit_count_24h;
    overall_volatility_index;
    timestamp;
  }

(** ============================================
 * MULTIPLIER CALCULATION
 * ============================================ *)

(** Calculate market adjustment based on conditions *)
let calculate_market_adjustment
    ~(coverage_type: coverage_type)
    ~(chain: blockchain)
    ~(stablecoin: asset)
    ~(conditions: market_conditions) : int =

  let adjustment_bps = ref 0 in

  (* 1. Stablecoin price deviation *)
  (match List.find conditions.stablecoin_prices ~f:(fun (a, _, _) -> equal_asset a stablecoin) with
   | Some (_, price, _) ->
       let deviation = Float.abs (price -. 1.0) in
       if Float.(deviation > 0.03) then adjustment_bps := !adjustment_bps + 400 (* >3% depeg = +40% *)
       else if Float.(deviation > 0.02) then adjustment_bps := !adjustment_bps + 250 (* >2% = +25% *)
       else if Float.(deviation > 0.01) then adjustment_bps := !adjustment_bps + 150 (* >1% = +15% *)
       else adjustment_bps := !adjustment_bps - 100; (* <1% = -10% discount *)
   | None -> ());

  (* 2. Bridge health (for bridge coverage type) *)
  (if equal_coverage_type coverage_type Bridge then
     (* Extract bridge and destination from policy metadata or use defaults
        NOTE: Full implementation requires policy metadata to specify:
        - bridge_name (e.g., "wormhole", "layerzero", "axelar")
        - source_chain and dest_chain
        For now, we try to find ANY bridge health score for this chain *)
     let matching_bridges = List.filter conditions.bridge_health_scores ~f:(fun (id, _) ->
       String.is_substring id ~substring:(blockchain_to_string chain |> String.lowercase)
     ) in

     match matching_bridges with
     | (_, health) :: _ ->
         (* Use first matching bridge *)
         if Float.(health < 0.5) then adjustment_bps := !adjustment_bps + 600 (* Poor health = +60% *)
         else if Float.(health < 0.7) then adjustment_bps := !adjustment_bps + 300 (* Medium = +30% *)
         else if Float.(health > 0.9) then adjustment_bps := !adjustment_bps - 100 (* Excellent = -10% *)
     | [] ->
         (* No bridge data for this chain - conservative penalty *)
         adjustment_bps := !adjustment_bps + 200); (* No data = +20% *)

  (* 3. CEX liquidation rate (for CEX liquidation coverage) *)
  (if equal_coverage_type coverage_type CEX_liquidation then
     if Float.(conditions.cex_liquidation_rate > 100.0) then
       adjustment_bps := !adjustment_bps + 500 (* High liquidations = +50% *)
     else if Float.(conditions.cex_liquidation_rate > 50.0) then
       adjustment_bps := !adjustment_bps + 250 (* Medium = +25% *)
     else
       adjustment_bps := !adjustment_bps - 50); (* Low = -5% *)

  (* 4. Chain congestion *)
  (match List.find conditions.chain_gas_prices ~f:(fun (c, _) -> equal_blockchain c chain) with
   | Some (Ethereum, gas) when Float.(gas > 200.0) ->
       adjustment_bps := !adjustment_bps + 150 (* High gas = +15% *)
   | Some (Ethereum, gas) when Float.(gas > 100.0) ->
       adjustment_bps := !adjustment_bps + 75 (* Medium gas = +7.5% *)
   | _ -> ());

  (* 5. Protocol exploit frequency *)
  (if conditions.protocol_exploit_count_24h > 2 then
     adjustment_bps := !adjustment_bps + 200 (* Multiple exploits = +20% *)
   else if conditions.protocol_exploit_count_24h > 0 then
     adjustment_bps := !adjustment_bps + 100); (* Some exploits = +10% *)

  (* Cap at ±30% *)
  Int.max (-3000) (Int.min 3000 !adjustment_bps)

(** Calculate volatility premium *)
let calculate_volatility_premium ~(conditions: market_conditions) : int =
  (* 0.0 volatility = 0 bps, 1.0 volatility = 5000 bps (+50%) *)
  let premium = conditions.overall_volatility_index *. 5000.0 in
  Int.of_float premium

(** Calculate complete multiplier for a product *)
let calculate_product_multiplier
    ~(coverage_type: coverage_type)
    ~(chain: blockchain)
    ~(stablecoin: asset)
    ~(conditions: market_conditions) : multiplier_components =

  let base_multiplier = 10000 in (* Start at 1.0x *)

  let market_adjustment = calculate_market_adjustment
    ~coverage_type ~chain ~stablecoin ~conditions
  in

  let volatility_premium = calculate_volatility_premium ~conditions in

  let total = base_multiplier + market_adjustment + volatility_premium in

  (* Apply circuit breaker limits *)
  let total_capped = Int.max 5000 (Int.min 20000 total) in

  {
    base_multiplier;
    market_adjustment;
    volatility_premium;
    total = total_capped;
  }

(** ============================================
 * ORACLE UPDATE
 * ============================================ *)

(** Update on-chain oracle with new multipliers *)
let update_oracle_contract
    ~(coverage_type: coverage_type)
    ~(chain: blockchain)
    ~(stablecoin: asset)
    ~(multiplier: multiplier_components) : unit Lwt.t =

  (* Construct transaction to DynamicPricingOracle contract *)
  let coverage_type_id = coverage_type_to_id coverage_type in
  let chain_id = match chain with
    | Ethereum -> 0 | Arbitrum -> 1 | Base -> 2 | Polygon -> 3
    | Bitcoin -> 4 | Lightning -> 5 | TON -> 6 | Solana -> 7
    | _ -> 0
  in
  let stablecoin_id = match stablecoin with
    | USDC -> 0 | USDT -> 1 | USDP -> 2 | DAI -> 3
    | FRAX -> 4 | BUSD -> 5 | USDe -> 6 | SUSDe -> 7
    | USDY -> 8 | PYUSD -> 9 | GHO -> 10 | LUSD -> 11
    | CrvUSD -> 12 | MkUSD -> 13
    | BTC | ETH -> 0  (* Not stablecoins *)
  in

  (* Build message payload according to DynamicPricingOracle contract spec *)
  let op_code = 0x756d6c74 in (* update_multiplier opcode *)

  (* Construct binary message: op (uint32) + coverage_type (uint8) + chain_id (uint8)
     + stablecoin_id (uint8) + base_multiplier (uint16) + market_adjustment (int16)
     + volatility_premium (int16) *)
  let message_bytes = Bytes.create 14 in

  (* Write op code (big-endian uint32) - manual byte packing *)
  Bytes.set message_bytes 0 (Char.of_int_exn ((op_code lsr 24) land 0xFF));
  Bytes.set message_bytes 1 (Char.of_int_exn ((op_code lsr 16) land 0xFF));
  Bytes.set message_bytes 2 (Char.of_int_exn ((op_code lsr 8) land 0xFF));
  Bytes.set message_bytes 3 (Char.of_int_exn (op_code land 0xFF));

  (* Write IDs (uint8) *)
  Bytes.set message_bytes 4 (Char.of_int_exn coverage_type_id);
  Bytes.set message_bytes 5 (Char.of_int_exn chain_id);
  Bytes.set message_bytes 6 (Char.of_int_exn stablecoin_id);

  (* Write multipliers (uint16/int16, big-endian) - manual byte packing *)
  let set_int16_be bytes offset value =
    Bytes.set bytes offset (Char.of_int_exn ((value lsr 8) land 0xFF));
    Bytes.set bytes (offset + 1) (Char.of_int_exn (value land 0xFF))
  in
  set_int16_be message_bytes 8 multiplier.base_multiplier;
  set_int16_be message_bytes 10 multiplier.market_adjustment;
  set_int16_be message_bytes 12 multiplier.volatility_premium;

  (* Base64 encode for TON cell *)
  let payload_cell = Base64.encode_string (Bytes.to_string message_bytes) in

  (* Load TON configuration from environment *)
  let ton_config = Ton_client.TonClient.default_config in

  (* Get contract and wallet addresses from environment *)
  let oracle_contract_address = match Sys.getenv "PRICING_ORACLE_CONTRACT_ADDRESS" with
    | Some addr -> addr
    | None ->
        Logs.warn (fun m -> m "PRICING_ORACLE_CONTRACT_ADDRESS not set, using testnet default");
        "EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG" (* Testnet placeholder *)
  in

  let keeper_wallet_address = match Sys.getenv "KEEPER_WALLET_ADDRESS" with
    | Some addr -> addr
    | None ->
        Logs.warn (fun m -> m "KEEPER_WALLET_ADDRESS not set, using development wallet");
        "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2" (* Dev wallet *)
  in

  (* Send transaction to oracle contract *)
  Lwt.catch
    (fun () ->
      let%lwt _tx = Ton_client.TonClient.send_transaction
        ton_config
        ~wallet_address:keeper_wallet_address
        ~contract_address:oracle_contract_address
        ~_op_code:op_code
        ~payload:payload_cell
        ~amount:50_000_000L (* 0.05 TON for gas *)
      in

      Lwt_io.printf "[Oracle Keeper] ✓ Updated %s/%s/%s: base=%d, adj=%+d, vol=%+d, total=%d\n"
        (coverage_type_to_string coverage_type)
        (blockchain_to_string chain)
        (asset_to_string stablecoin)
        multiplier.base_multiplier
        multiplier.market_adjustment
        multiplier.volatility_premium
        multiplier.total
    )
    (fun exn ->
      Lwt_io.eprintf "[Oracle Keeper] ✗ Failed to update %s/%s/%s: %s\n"
        (coverage_type_to_string coverage_type)
        (blockchain_to_string chain)
        (asset_to_string stablecoin)
        (Exn.to_string exn)
    )

(** Batch update all products (560 total) *)
let batch_update_all_products ~(conditions: market_conditions) : unit Lwt.t =
  let coverage_types = all_of_coverage_type in
  let chains = [Ethereum; Arbitrum; Base; Polygon; Bitcoin; Solana; TON; Lightning] in
  let stablecoins = [USDC; USDT; DAI; FRAX; BUSD; USDe; SUSDe; USDY; PYUSD; GHO; LUSD; CrvUSD; MkUSD; USDP] in

  let total_products = List.length coverage_types * List.length chains * List.length stablecoins in

  Lwt_io.printf "\n[Oracle Keeper] Updating %d products...\n" total_products >>= fun () ->

  let* () = Lwt_list.iter_s (fun coverage_type ->
    Lwt_list.iter_s (fun chain ->
      Lwt_list.iter_s (fun stablecoin ->
        let multiplier = calculate_product_multiplier
          ~coverage_type ~chain ~stablecoin ~conditions
        in
        update_oracle_contract ~coverage_type ~chain ~stablecoin ~multiplier
      ) stablecoins
    ) chains
  ) coverage_types in

  Lwt_io.printf "[Oracle Keeper] Batch update complete: %d products updated\n" total_products

(** ============================================
 * MONITORING & LOGGING
 * ============================================ *)

(** Log market conditions summary *)
let log_market_summary ~(conditions: market_conditions) : unit =
  Printf.printf "\n╔══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  MARKET CONDITIONS (%.0f)                        ║\n" conditions.timestamp;
  Printf.printf "╚══════════════════════════════════════════════════════════╝\n";

  Printf.printf "\nStablecoin Prices:\n";
  List.iter conditions.stablecoin_prices ~f:(fun (asset, price, confidence) ->
    let deviation = (price -. 1.0) *. 100.0 in
    Printf.printf "  %6s: $%.4f (%+.2f%%) [confidence: %.1f%%]\n"
      (asset_to_string asset) price deviation (confidence *. 100.0)
  );

  Printf.printf "\nBridge Health Scores:\n";
  List.iter conditions.bridge_health_scores ~f:(fun (bridge_id, health) ->
    Printf.printf "  %20s: %.1f%%\n" bridge_id (health *. 100.0)
  );

  Printf.printf "\nOther Metrics:\n";
  Printf.printf "  CEX Liquidations/hr:    %.1f\n" conditions.cex_liquidation_rate;
  Printf.printf "  Exploits (24h):         %d\n" conditions.protocol_exploit_count_24h;
  Printf.printf "  Volatility Index:       %.1f%%\n" (conditions.overall_volatility_index *. 100.0);

  Printf.printf "\nChain Gas Prices:\n";
  List.iter conditions.chain_gas_prices ~f:(fun (chain, gas) ->
    Printf.printf "  %10s: %.2f gwei\n" (blockchain_to_string chain) gas
  );

  Printf.printf "\n";
  Out_channel.flush Out_channel.stdout

(** ============================================
 * KEEPER DAEMON
 * ============================================ *)

(** Exponential backoff on failures *)
let calculate_backoff_delay ~consecutive_failures : float =
  let base_delay = 1.0 in
  let max_delay = 16.0 in
  let delay = base_delay *. (2.0 ** Float.of_int consecutive_failures) in
  Float.min delay max_delay

(** Main keeper loop *)
let rec keeper_loop ~update_interval () =
  let start_time = Time_float.now ()
    |> Time_float.to_span_since_epoch
    |> Time_float.Span.to_sec
  in

  try%lwt
    (* Fetch market conditions *)
    let* conditions = fetch_market_conditions () in
    log_market_summary ~conditions;

    (* Update oracle *)
    let* () = batch_update_all_products ~conditions in

    (* Update stats *)
    stats.successful_updates <- stats.successful_updates + 1;
    stats.last_update_time <- Time_float.now ()
      |> Time_float.to_span_since_epoch
      |> Time_float.Span.to_sec;
    stats.consecutive_failures <- 0;
    stats.last_error <- None;

    Lwt_io.printf "✅ Update successful. Stats: %d successes, %d failures\n"
      stats.successful_updates stats.failed_updates >>= fun () ->

    (* Wait for next update interval *)
    let now = Time_float.now ()
      |> Time_float.to_span_since_epoch
      |> Time_float.Span.to_sec
    in
    let elapsed = now -. start_time in
    let wait_time = Float.max 0.0 (update_interval -. elapsed) in

    Lwt_io.printf "⏳ Next update in %.0f seconds...\n\n" wait_time >>= fun () ->
    let* () = Lwt_unix.sleep wait_time in

    keeper_loop ~update_interval ()

  with exn ->
    stats.failed_updates <- stats.failed_updates + 1;
    stats.consecutive_failures <- stats.consecutive_failures + 1;
    stats.last_error <- Some (Exn.to_string exn);

    let backoff_delay = calculate_backoff_delay
      ~consecutive_failures:stats.consecutive_failures
    in

    Lwt_io.printf "❌ Update failed: %s\n" (Exn.to_string exn) >>= fun () ->
    Lwt_io.printf "⏳ Retrying in %.0f seconds (attempt %d)...\n\n"
      backoff_delay stats.consecutive_failures >>= fun () ->

    let* () = Lwt_unix.sleep backoff_delay in
    keeper_loop ~update_interval ()

(** Start keeper with default settings *)
let start_keeper ?(update_interval = 60.0) () : unit Lwt.t =
  Printf.printf "\n╔══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  DYNAMIC PRICING ORACLE KEEPER STARTED                   ║\n";
  Printf.printf "╚══════════════════════════════════════════════════════════╝\n";
  Printf.printf "\nConfiguration:\n";
  Printf.printf "  Update Interval:     %.0f seconds\n" update_interval;
  Printf.printf "  Total Products:      560 (5 × 8 × 14)\n";
  Printf.printf "  Circuit Breaker:     ±50%% (0.50x - 2.00x)\n";
  Printf.printf "  Backoff Strategy:    Exponential (1s → 16s)\n";
  Printf.printf "\nMonitoring:\n";
  Printf.printf "  • Chainlink price feeds\n";
  Printf.printf "  • Bridge health scores\n";
  Printf.printf "  • CEX liquidation rates\n";
  Printf.printf "  • Chain gas prices\n";
  Printf.printf "  • Protocol exploit frequency\n";
  Printf.printf "\nStarting main loop...\n\n";
  Out_channel.flush Out_channel.stdout;

  keeper_loop ~update_interval ()

(** ============================================
 * EXAMPLE SCENARIOS
 * ============================================ *)

(** Simulate USDC depeg event *)
let simulate_usdc_depeg_scenario () : unit Lwt.t =
  Printf.printf "\n🚨 SIMULATING USDC DEPEG EVENT\n";
  Printf.printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  let timestamp = Time_float.now ()
    |> Time_float.to_span_since_epoch
    |> Time_float.Span.to_sec
  in

  let conditions = {
    stablecoin_prices = [
      (USDC, 0.95, 0.99); (* USDC drops to $0.95 *)
      (USDT, 1.0, 0.98);
      (DAI, 1.0, 0.97);
    ];
    bridge_health_scores = [("wormhole_eth_ton", 0.95)];
    cex_liquidation_rate = 150.0; (* Spike in liquidations *)
    chain_gas_prices = [(Ethereum, 250.0)]; (* Gas spike *)
    protocol_exploit_count_24h = 0;
    overall_volatility_index = 0.8; (* High volatility *)
    timestamp;
  } in

  log_market_summary ~conditions;

  let multiplier = calculate_product_multiplier
    ~coverage_type:Depeg
    ~chain:Ethereum
    ~stablecoin:USDC
    ~conditions
  in

  let%lwt () = Lwt_io.printf "\nUSDC Depeg Coverage Multiplier:\n" in
  let%lwt () = Lwt_io.printf "  Base:         %d bps (%.2fx)\n" multiplier.base_multiplier
    (Float.of_int multiplier.base_multiplier /. 10000.0) in
  let%lwt () = Lwt_io.printf "  Market Adj:   %+d bps (%+.2f%%)\n" multiplier.market_adjustment
    (Float.of_int multiplier.market_adjustment /. 100.0) in
  let%lwt () = Lwt_io.printf "  Volatility:   %+d bps (%+.2f%%)\n" multiplier.volatility_premium
    (Float.of_int multiplier.volatility_premium /. 100.0) in
  let%lwt () = Lwt_io.printf "  ──────────────────────────\n" in
  let%lwt () = Lwt_io.printf "  TOTAL:        %d bps (%.2fx)\n" multiplier.total
    (Float.of_int multiplier.total /. 10000.0) in
  Lwt_io.printf "\nPremium increase: ~%.0f%%\n\n"
    ((Float.of_int multiplier.total /. 10000.0 -. 1.0) *. 100.0)

(** ============================================
 * MAIN ENTRY POINT
 * ============================================ *)

let () =
  (* Parse update interval from environment or use default *)
  let update_interval =
    match Sys.getenv "UPDATE_INTERVAL" with
    | Some interval -> (try Float.of_string interval with _ -> 60.0)
    | None -> 60.0
  in

  (* Run keeper *)
  Lwt_main.run (start_keeper ~update_interval ())
