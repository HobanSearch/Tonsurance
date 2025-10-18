(* Collateral Manager Example - 6-Tier Model Demo
 *
 * Demonstrates:
 * 1. Effective capital calculation
 * 2. Capital adequacy checks
 * 3. Tranche-specific utilization
 * 4. Coverage limit validation
 *)

open Core
open Pool.Collateral_manager
open Types
(* open Pricing_engine.Tranche_pricing *)

module CM = CollateralManager

let print_separator () =
  printf "\n%s\n" (String.make 80 '=')

let print_tranche_info (util: CM.tranche_utilization) =
  printf "  %-12s | Balance: $%10Ld | Coverage: $%10Ld | Utilization: %5.2f%% | Capacity: %3.0f%%\n"
    (tranche_to_string util.tranche_id)
    util.balance
    util.allocated_coverage
    (util.utilization_pct *. 100.0)
    (util.risk_capacity_pct *. 100.0)

let () =
  print_separator ();
  printf "COLLATERAL MANAGER - 6-TIER MODEL DEMONSTRATION\n";
  print_separator ();

  (* Scenario 1: Create pool with $100M capital *)
  printf "\n📊 SCENARIO 1: Initialize Pool with $100M Capital\n\n";

  let pool = CM.create_pool
    ~initial_capital:100_000_000_00L
    ()
  in

  (* Distribute capital across tranches (matching allocation percentages) *)
  let distribute_capital pool =
    let total_capital = pool.total_capital_usd in

    let updated_tranches = List.map pool.virtual_tranches ~f:(fun tranche ->
      let allocation_pct = match tranche.tranche_id with
        | "SURE_BTC" -> 0.25      (* 25% *)
        | "SURE_SNR" -> 0.20      (* 20% *)
        | "SURE_MEZZ" -> 0.18     (* 18% *)
        | SURE_JNR -> 0.15      (* 15% *)
        | SURE_JNR_PLUS -> 0.12 (* 12% *)
        | SURE_EQT -> 0.10      (* 10% *)
      in

      let allocated_capital =
        Float.to_int64 (Int64.to_float total_capital *. allocation_pct)
      in

      { tranche with allocated_capital }
    ) in

    { pool with virtual_tranches = updated_tranches }
  in

  let pool = distribute_capital pool in

  printf "Total Capital (Raw):         $100,000,000\n\n";

  printf "Tranche Allocations:\n";
  let all_utils = CM.get_all_tranche_utilizations pool in
  List.iter all_utils ~f:print_tranche_info;

  (* Calculate effective capital *)
  let effective_capital = CM.calculate_effective_capital pool in

  printf "\nEffective Capital (Risk-Weighted): $%Ld\n" effective_capital;
  printf "  BTC   (25M × 50%%) = $12.5M\n";
  printf "  SNR   (20M × 60%%) = $12.0M\n";
  printf "  MEZZ  (18M × 70%%) = $12.6M\n";
  printf "  JNR   (15M × 80%%) = $12.0M\n";
  printf "  JNR+  (12M × 90%%) = $10.8M\n";
  printf "  EQT   (10M × 100%%) = $10.0M\n";
  printf "  ----------------------------------------\n";
  printf "  TOTAL EFFECTIVE     = $69.9M\n";

  print_separator ();
  printf "\n📊 SCENARIO 2: Underwrite $50M Coverage (71.5%% utilization)\n\n";

  let pool_with_coverage = {
    pool with
    total_coverage_sold = 50_000_000_00L;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in

  let utilization = CM.get_total_utilization manager in
  printf "Total Coverage Sold:         $50,000,000\n";
  printf "Effective Capital Utilization: %.2f%%\n" (utilization *. 100.0);
  printf "Status: %s\n"
    (if utilization < 0.75 then "✅ HEALTHY"
     else if utilization < 0.85 then "⚠️  WARNING"
     else "🚨 CRITICAL");

  print_separator ();
  printf "\n📊 SCENARIO 3: Attempt $65M Coverage (93%% utilization - REJECT)\n\n";

  let pool_with_high_coverage = {
    pool with
    total_coverage_sold = 65_000_000_00L;
  } in

  let manager_high = CM.create ~pool_opt:(Some pool_with_high_coverage) () in

  let test_policy = {
    policy_id = 1L;
    policyholder = "EQTest...";
    beneficiary = None;
    coverage_type = Depeg;
    chain = TON;
    asset = USDC;
    coverage_amount = 1_000_000_00L;
    premium_paid = 0L;
    trigger_price = 0.98;
    floor_price = 0.95;
    start_time = Unix.time ();
    expiry_time = Unix.time () +. 2592000.0;
    status = Active;
    payout_amount = None;
    payout_time = None;
    is_gift = false;
    gift_message = None;
  } in

  let (can_underwrite, reason) = CM.can_underwrite manager_high test_policy in

  let high_utilization = CM.get_total_utilization manager_high in
  printf "Total Coverage Sold:         $65,000,000\n";
  printf "Effective Capital Utilization: %.2f%%\n" (high_utilization *. 100.0);
  printf "Can Underwrite New Policy:   %s\n" (if can_underwrite then "✅ YES" else "❌ NO");
  printf "Reason: %s\n" reason;

  print_separator ();
  printf "\n📊 SCENARIO 4: Tranche-Specific Utilization Monitoring\n\n";

  (* Simulate EQT tranche at 90% utilization *)
  let pool_eqt_stress =
    let eqt_capital = 10_000_000_00L in
    let eqt_coverage = Int64.(eqt_capital * 90L / 100L) in

    let updated_tranches = List.map pool.virtual_tranches ~f:(fun t ->
      if Poly.equal t.tranche_id SURE_EQT then
        { t with allocated_coverage = eqt_coverage }
      else
        t
    ) in

    { pool with virtual_tranches = updated_tranches }
  in

  printf "Simulating EQT tranche stress (90%% allocated):\n\n";
  let eqt_util = CM.get_tranche_utilization pool_eqt_stress ~tranche_id:SURE_EQT in
  print_tranche_info eqt_util;

  printf "\nStatus: ";
  if eqt_util.utilization_pct > 0.90 then
    printf "🚨 CRITICAL - Equity tranche near capacity!\n"
  else if eqt_util.utilization_pct > 0.85 then
    printf "⚠️  WARNING - High equity utilization\n"
  else
    printf "✅ HEALTHY\n";

  print_separator ();
  printf "\n📊 SCENARIO 5: Pool Statistics Summary\n\n";

  let stats = CM.get_pool_stats manager in
  List.iter stats ~f:(fun (key, value) ->
    printf "  %-35s %s\n" (key ^ ":") value
  );

  print_separator ();
  printf "\n✅ DEMONSTRATION COMPLETE\n";
  print_separator ();
  printf "\nKey Insights:\n";
  printf "  1. Effective capital (69.9M) < Raw capital (100M) due to risk weighting\n";
  printf "  2. Conservative limits prevent over-allocation (85%% max)\n";
  printf "  3. Per-tranche monitoring ensures balanced risk distribution\n";
  printf "  4. EQT (first loss) monitored separately (90%% threshold)\n";
  print_separator ();
  printf "\n"
