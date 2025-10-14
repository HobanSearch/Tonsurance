(** Mathematical utilities and financial calculations

    This module provides:
    - Currency conversion functions
    - Statistical functions (mean, std dev, percentiles)
    - Correlation and covariance calculations
    - Monte Carlo simulation helpers
    - Financial mathematics (PV, FV, annuities)
    - Time series analysis
*)

open Core
open Types

(** Currency conversions *)

let usd_to_cents (dollars: float) : usd_cents =
  Int64.of_float (dollars *. 100.0)

let cents_to_usd (cents: usd_cents) : float =
  Int64.to_float cents /. 100.0

let btc_to_sats (btc: float) : btc_sats =
  Int64.of_float (btc *. 100_000_000.0)

let sats_to_btc (sats: btc_sats) : float =
  Int64.to_float sats /. 100_000_000.0

(** Safe arithmetic operations *)

let safe_div (num: float) (denom: float) : float option =
  if Float.abs denom < Float.epsilon
  then None
  else Some (num /. denom)

let safe_div_exn (num: float) (denom: float) : float =
  match safe_div num denom with
  | Some result -> result
  | None -> failwith "Division by zero"

let safe_log (x: float) : float option =
  if x <= 0.0 then None
  else Some (Float.log x)

let safe_sqrt (x: float) : float option =
  if x < 0.0 then None
  else Some (Float.sqrt x)

(** Statistical functions *)

let mean (values: float list) : float =
  match values with
  | [] -> 0.0
  | _ ->
      let sum = List.fold values ~init:0.0 ~f:(+.) in
      sum /. Float.of_int (List.length values)

let variance (values: float list) : float =
  let m = mean values in
  let squared_diffs =
    List.map values ~f:(fun x -> (x -. m) ** 2.0)
  in
  mean squared_diffs

let std_dev (values: float list) : float =
  Float.sqrt (variance values)

let percentile (values: float list) (p: float) : float =
  if List.is_empty values then 0.0
  else
    let sorted = List.sort values ~compare:Float.compare in
    let index =
      Float.of_int (List.length sorted - 1) *. p
      |> Float.round_nearest
      |> Float.to_int
      |> max 0
      |> min (List.length sorted - 1)
    in
    List.nth_exn sorted index

let quantile values q =
  percentile values q

let median values =
  percentile values 0.5

(** Advanced statistics *)

let skewness (values: float list) : float =
  let n = Float.of_int (List.length values) in
  let m = mean values in
  let s = std_dev values in
  if s < Float.epsilon then 0.0
  else
    let sum_cubed = List.fold values ~init:0.0 ~f:(fun acc x ->
      acc +. ((x -. m) /. s) ** 3.0
    ) in
    sum_cubed /. n

let kurtosis (values: float list) : float =
  let n = Float.of_int (List.length values) in
  let m = mean values in
  let s = std_dev values in
  if s < Float.epsilon then 0.0
  else
    let sum_fourth = List.fold values ~init:0.0 ~f:(fun acc x ->
      acc +. ((x -. m) /. s) ** 4.0
    ) in
    (sum_fourth /. n) -. 3.0

(** Correlation and covariance *)

let covariance (xs: float list) (ys: float list) : float option =
  if List.length xs <> List.length ys || List.is_empty xs then None
  else
    let mean_x = mean xs in
    let mean_y = mean ys in
    let sum = List.fold2_exn xs ys ~init:0.0
      ~f:(fun acc x y -> acc +. ((x -. mean_x) *. (y -. mean_y)))
    in
    Some (sum /. Float.of_int (List.length xs))

let correlation (xs: float list) (ys: float list) : float option =
  if List.length xs <> List.length ys then None
  else
    let mean_x = mean xs in
    let mean_y = mean ys in

    let numerator =
      List.fold2_exn xs ys ~init:0.0
        ~f:(fun acc x y -> acc +. ((x -. mean_x) *. (y -. mean_y)))
    in

    let denom_x =
      Float.sqrt (List.fold xs ~init:0.0
        ~f:(fun acc x -> acc +. ((x -. mean_x) ** 2.0)))
    in
    let denom_y =
      Float.sqrt (List.fold ys ~init:0.0
        ~f:(fun acc y -> acc +. ((y -. mean_y) ** 2.0)))
    in

    safe_div numerator (denom_x *. denom_y)

let covariance_matrix (data: float list list) : float list list =
  let n = List.length data in
  if n = 0 then []
  else
    let means = List.map data ~f:mean in

    List.mapi data ~f:(fun i series_i ->
      let mean_i = List.nth_exn means i in

      List.mapi data ~f:(fun j series_j ->
        let mean_j = List.nth_exn means j in

        let cov =
          List.fold2_exn series_i series_j ~init:0.0
            ~f:(fun acc x_i x_j ->
              acc +. ((x_i -. mean_i) *. (x_j -. mean_j))
            )
        in
        let n_samples = Float.of_int (List.length series_i) in
        if n_samples > 0.0 then cov /. n_samples else 0.0
      )
    )

let correlation_matrix (data: float list list) : float list list =
  let cov_matrix = covariance_matrix data in
  let std_devs = List.map data ~f:std_dev in

  List.mapi cov_matrix ~f:(fun i row ->
    let std_i = List.nth_exn std_devs i in
    List.mapi row ~f:(fun j cov ->
      let std_j = List.nth_exn std_devs j in
      if std_i < Float.epsilon || std_j < Float.epsilon then
        0.0
      else
        cov /. (std_i *. std_j)
    )
  )

(** Monte Carlo simulation helpers *)

(* Box-Muller transform for generating normal random variables *)
let box_muller_transform () : float * float =
  let u1 = Random.float 1.0 in
  let u2 = Random.float 1.0 in

  let mag = Float.sqrt (-2.0 *. Float.log u1) in
  let z0 = mag *. Float.cos (2.0 *. Float.pi *. u2) in
  let z1 = mag *. Float.sin (2.0 *. Float.pi *. u2) in

  (z0, z1)

let normal_random ~mean ~std_dev : float =
  let (z, _) = box_muller_transform () in
  mean +. (std_dev *. z)

let normal_random_list ~mean ~std_dev ~count : float list =
  List.init count ~f:(fun _ -> normal_random ~mean ~std_dev)

(* Correlated random variables using Cholesky decomposition *)
let cholesky_decomposition (matrix: float list list) : float list list option =
  let n = List.length matrix in
  if n = 0 then Some []
  else
    try
      let result = Array.make_matrix ~dimx:n ~dimy:n 0.0 in

      for i = 0 to n - 1 do
        for j = 0 to i do
          let sum = ref 0.0 in
          for k = 0 to j - 1 do
            sum := !sum +. (result.(i).(k) *. result.(j).(k))
          done;

          if i = j then begin
            let diag_value = (List.nth_exn (List.nth_exn matrix i) i) -. !sum in
            if diag_value < 0.0 then failwith "Matrix not positive definite";
            result.(i).(j) <- Float.sqrt diag_value
          end else begin
            if Float.abs result.(j).(j) < Float.epsilon then
              failwith "Division by zero in Cholesky";
            result.(i).(j) <- ((List.nth_exn (List.nth_exn matrix i) j) -. !sum) /. result.(j).(j)
          end
        done
      done;

      Some (Array.to_list (Array.map result ~f:Array.to_list))
    with _ -> None

let correlated_normal_samples ~correlation_matrix ~means ~std_devs ~count : float list list option =
  match cholesky_decomposition correlation_matrix with
  | None -> None
  | Some cholesky ->
      let n = List.length means in

      let samples = List.init count ~f:(fun _ ->
        (* Generate independent normals *)
        let independent = List.init n ~f:(fun _ ->
          let (z, _) = box_muller_transform () in z
        ) in

        (* Apply Cholesky to correlate them *)
        List.mapi cholesky ~f:(fun i row ->
          let correlated_z = List.fold2_exn row independent ~init:0.0
            ~f:(fun acc coeff z -> acc +. (coeff *. z))
          in
          let mean_i = List.nth_exn means i in
          let std_i = List.nth_exn std_devs i in
          mean_i +. (std_i *. correlated_z)
        )
      ) in

      Some samples

(** Financial mathematics *)

let compound ~principal ~rate ~periods : float =
  principal *. ((1.0 +. rate) ** Float.of_int periods)

let present_value ~future_value ~rate ~periods : float =
  future_value /. ((1.0 +. rate) ** Float.of_int periods)

let annuity_pv ~payment ~rate ~periods : float =
  if Float.abs rate < Float.epsilon then
    payment *. Float.of_int periods
  else
    payment *. (1.0 -. (1.0 +. rate) ** Float.neg (Float.of_int periods)) /. rate

let annuity_fv ~payment ~rate ~periods : float =
  if Float.abs rate < Float.epsilon then
    payment *. Float.of_int periods
  else
    payment *. (((1.0 +. rate) ** Float.of_int periods) -. 1.0) /. rate

let compound_annual_growth_rate ~start_value ~end_value ~years : float option =
  if start_value <= 0.0 || end_value <= 0.0 || years <= 0.0 then None
  else
    Some (((end_value /. start_value) ** (1.0 /. years)) -. 1.0)

(** Black-Scholes option pricing *)

let normal_cdf (x: float) : float =
  0.5 *. (1.0 +. Float.erf (x /. Float.sqrt 2.0))

let black_scholes ~spot ~strike ~time_to_expiry ~rate ~volatility ~call_option : float =
  if time_to_expiry <= 0.0 then
    if call_option then
      Float.max (spot -. strike) 0.0
    else
      Float.max (strike -. spot) 0.0
  else
    let d1 =
      (Float.log (spot /. strike) +. (rate +. 0.5 *. volatility ** 2.0) *. time_to_expiry)
      /. (volatility *. Float.sqrt time_to_expiry)
    in
    let d2 = d1 -. volatility *. Float.sqrt time_to_expiry in

    if call_option then
      spot *. normal_cdf d1 -. strike *. Float.exp (Float.neg rate *. time_to_expiry) *. normal_cdf d2
    else
      strike *. Float.exp (Float.neg rate *. time_to_expiry) *. normal_cdf (Float.neg d2) -. spot *. normal_cdf (Float.neg d1)

(** Time series analysis *)

let exponential_moving_average ~values ~alpha : float list =
  match values with
  | [] -> []
  | first :: rest ->
      let _, result =
        List.fold rest ~init:(first, [first]) ~f:(fun (prev_ema, acc) value ->
          let new_ema = alpha *. value +. (1.0 -. alpha) *. prev_ema in
          (new_ema, new_ema :: acc)
        )
      in
      List.rev result

let simple_moving_average ~values ~window : float list =
  if List.length values < window then []
  else
    let rec go values acc =
      if List.length values < window then List.rev acc
      else
        let window_values = List.take values window in
        let avg = mean window_values in
        go (List.tl_exn values) (avg :: acc)
    in
    go values []

let bollinger_bands ~values ~window ~num_std_devs : (float * float * float) list =
  if List.length values < window then []
  else
    let rec go values acc =
      if List.length values < window then List.rev acc
      else
        let window_values = List.take values window in
        let avg = mean window_values in
        let std = std_dev window_values in
        let upper = avg +. (Float.of_int num_std_devs *. std) in
        let lower = avg -. (Float.of_int num_std_devs *. std) in
        go (List.tl_exn values) ((avg, upper, lower) :: acc)
    in
    go values []

let relative_strength_index ~prices ~period : float list =
  if List.length prices < period + 1 then []
  else
    (* Calculate price changes *)
    let changes = List.mapi prices ~f:(fun i price ->
      if i = 0 then None
      else Some (price -. List.nth_exn prices (i - 1))
    ) |> List.filter_opt in

    (* Calculate RSI for each window *)
    let rec go changes acc =
      if List.length changes < period then List.rev acc
      else
        let window = List.take changes period in
        let gains = List.filter window ~f:(fun x -> x > 0.0) in
        let losses = List.filter window ~f:(fun x -> x < 0.0) |> List.map ~f:Float.abs in

        let avg_gain = if List.is_empty gains then 0.0 else mean gains in
        let avg_loss = if List.is_empty losses then 0.0 else mean losses in

        let rs = if avg_loss < Float.epsilon then 100.0 else avg_gain /. avg_loss in
        let rsi = 100.0 -. (100.0 /. (1.0 +. rs)) in

        go (List.tl_exn changes) (rsi :: acc)
    in
    go changes []

(** Risk metrics *)

let sharpe_ratio ~returns ~risk_free_rate : float =
  let excess_returns = List.map returns ~f:(fun r -> r -. risk_free_rate) in
  let mean_excess = mean excess_returns in
  let std_excess = std_dev excess_returns in
  if std_excess < Float.epsilon then 0.0
  else mean_excess /. std_excess

let sortino_ratio ~returns ~risk_free_rate : float =
  let excess_returns = List.map returns ~f:(fun r -> r -. risk_free_rate) in
  let mean_excess = mean excess_returns in

  (* Only consider downside deviation *)
  let downside_returns = List.filter excess_returns ~f:(fun r -> r < 0.0) in
  let downside_std = std_dev downside_returns in

  if downside_std < Float.epsilon then 0.0
  else mean_excess /. downside_std

let max_drawdown (values: float list) : float =
  if List.is_empty values then 0.0
  else
    let _, _, max_dd = List.fold values ~init:(Float.neg_infinity, 0.0, 0.0)
      ~f:(fun (peak, current_dd, max_dd) value ->
        let new_peak = Float.max peak value in
        let drawdown = (new_peak -. value) /. new_peak in
        let new_max_dd = Float.max max_dd drawdown in
        (new_peak, drawdown, new_max_dd)
      )
    in
    max_dd

let calmar_ratio ~returns ~risk_free_rate : float =
  let total_return = List.fold returns ~init:1.0 ~f:(fun acc r -> acc *. (1.0 +. r)) -. 1.0 in
  let mdd = max_drawdown (List.fold returns ~init:[1.0] ~f:(fun acc r ->
    let last = List.hd_exn acc in
    (last *. (1.0 +. r)) :: acc
  ) |> List.rev) in

  if mdd < Float.epsilon then 0.0
  else (total_return -. risk_free_rate) /. mdd

(** Interpolation *)

let linear_interpolation ~x ~x0 ~x1 ~y0 ~y1 : float =
  if Float.abs (x1 -. x0) < Float.epsilon then y0
  else
    y0 +. ((x -. x0) /. (x1 -. x0)) *. (y1 -. y0)

let clamp ~value ~min_val ~max_val : float =
  Float.max min_val (Float.min max_val value)

(** Utility functions *)

let weighted_average (values: (float * float) list) : float =
  (* values = (value, weight) pairs *)
  let total_weight = List.fold values ~init:0.0 ~f:(fun acc (_, w) -> acc +. w) in
  if total_weight < Float.epsilon then 0.0
  else
    let weighted_sum = List.fold values ~init:0.0 ~f:(fun acc (v, w) -> acc +. (v *. w)) in
    weighted_sum /. total_weight

let normalize (values: float list) : float list =
  let min_val = List.fold values ~init:Float.infinity ~f:Float.min in
  let max_val = List.fold values ~init:Float.neg_infinity ~f:Float.max in
  let range = max_val -. min_val in
  if range < Float.epsilon then List.map values ~f:(fun _ -> 0.5)
  else List.map values ~f:(fun x -> (x -. min_val) /. range)

let z_score (values: float list) : float list =
  let m = mean values in
  let s = std_dev values in
  if s < Float.epsilon then List.map values ~f:(fun _ -> 0.0)
  else List.map values ~f:(fun x -> (x -. m) /. s)
