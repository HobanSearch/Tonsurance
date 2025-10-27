(** Unit tests for Bitcoin Float Manager
 *  Tests allocation strategies, rebalancing signals, and yield sustainability
 *)

open Bitcoin_float.Bitcoin_float_manager.BitcoinFloatManager

(** Test: Allocation calculation *)
let test_allocation_calculation () =
  let rule = AllocationStrategy.default_rule in

  let (to_usd, to_btc) = AllocationStrategy.calculate_allocation
    ~premiums_collected:(Math.usd_to_cents 5_000_000.0)
    ~required_yield_usd:(Math.usd_to_cents 3_000_000.0)
    ~claims_reserve:(Math.usd_to_cents 1_000_000.0)
    ~rule
  in

  (* Available: $5M - $3M - $1M = $1M *)
  (* Should split: 40% USD ($400k), 60% BTC ($600k) *)
  let to_usd_float = Math.cents_to_usd to_usd in
  let to_btc_float = Math.cents_to_usd to_btc in

  Alcotest.(check bool) "USD allocation ~40%"
    (to_usd_float > 350_000.0 && to_usd_float < 450_000.0) true;
  Alcotest.(check bool) "BTC allocation ~60%"
    (to_btc_float > 550_000.0 && to_btc_float < 650_000.0) true

(** Test: Rebalancing signal generation *)
let test_rebalancing_signal () =
  let rule = AllocationStrategy.default_rule in

  (* Vault with too much USD (95%), needs rebalancing to BTC *)
  let vault = {
    total_capital_usd = Math.usd_to_cents 100_000_000.0;
    btc_float_sats = Math.btc_to_sats 100.0;
    btc_float_value_usd = Math.usd_to_cents 5_000_000.0;  (* 5% in BTC *)
    usd_reserves = Math.usd_to_cents 95_000_000.0;         (* 95% in USD *)
    total_coverage_sold = Math.usd_to_cents 50_000_000.0;
  } in

  let signal = TradingEngine.generate_signal vault
    ~btc_price:50_000.0
    ~rule
  in

  (* Should signal to buy BTC since allocation is too low *)
  match signal with
  | TradingEngine.BuyBTC amount ->
      Alcotest.(check bool) "Buy BTC signal amount is positive" (amount > 0.0) true
  | _ ->
      Alcotest.fail "Should generate BuyBTC signal when BTC allocation is too low"

(** Test: Yield sustainability calculation *)
let test_sustainability_calculation () =
  let vault = {
    total_capital_usd = Math.usd_to_cents 100_000_000.0;
    btc_float_sats = Math.btc_to_sats 200.0;
    btc_float_value_usd = Math.usd_to_cents 10_000_000.0;
    usd_reserves = Math.usd_to_cents 10_000_000.0;
    total_coverage_sold = Math.usd_to_cents 50_000_000.0;
  } in

  let years = YieldSustainability.sustainability_period vault
    ~btc_price:50_000.0
    ~required_annual_yield_btc:60.0  (* Need to pay 60 BTC per year *)
    ~annual_premiums_usd:2_000_000.0 (* Only collecting $2M premiums *)
  in

  (* Required: 60 BTC * $50k = $3M per year *)
  (* Have: $2M premiums + $10M float = depletes in ~10 years *)
  (* Shortfall: $1M per year *)
  (* Years: $10M float / $1M shortfall = 10 years *)
  Alcotest.(check bool) "Sustainability ~10 years"
    (years >= 8 && years <= 12) true

(** Alcotest suite *)
let suite = [
  ("allocation calculation", `Quick, test_allocation_calculation);
  ("rebalancing signal", `Quick, test_rebalancing_signal);
  ("sustainability calculation", `Quick, test_sustainability_calculation);
]

(** Run tests *)
let () =
  Alcotest.run "Bitcoin Float Manager" [
    ("Bitcoin Float", suite);
  ]
