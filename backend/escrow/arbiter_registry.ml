(**
 * Arbiter Registry
 *
 * Manages arbiter registration, reputation scoring, and selection.
 * Implements reputation-weighted round-robin selection with specialization matching.
 *)

open Types

(** Arbiter registry configuration *)
module ArbiterConfig = struct
  (** Minimum stake required (in USD cents) *)
  let min_stake = 1_000_000L (* $10,000 *)

  (** Minimum reputation score to be active *)
  let min_reputation = 0.7

  (** Initial reputation for new arbiters *)
  let initial_reputation = 0.8

  (** Reputation boost for successful resolution *)
  let success_reputation_boost = 0.01

  (** Reputation penalty for unsuccessful resolution *)
  let failure_reputation_penalty = 0.02

  (** Maximum reputation score *)
  let max_reputation = 1.0

  (** Minimum reputation score *)
  let min_reputation_floor = 0.3

  (** Fast resolution threshold (seconds) *)
  let fast_resolution_threshold = 86400.0 (* 24 hours *)

  (** Volume factor denominator for reputation *)
  let volume_factor_max = 100.0

  (** Speed bonus weight *)
  let speed_bonus = 0.1
end

(** Reputation calculation *)
module ReputationSystem = struct

  (** Calculate success rate *)
  let calculate_success_rate (arbiter: arbiter) : float =
    if arbiter.total_disputes_resolved = 0 then
      ArbiterConfig.initial_reputation
    else
      (* Simplified: base on reputation_score for now *)
      float_of_int arbiter.reputation_score /. 1000.0

  (** Calculate speed bonus *)
  let calculate_speed_bonus (_arbiter: arbiter) : float =
    (* Simplified: no speed tracking yet *)
    0.0

  (** Calculate volume factor *)
  let calculate_volume_factor (arbiter: arbiter) : float =
    min 1.0 (
      float_of_int arbiter.total_disputes_resolved /.
      ArbiterConfig.volume_factor_max
    )

  (** Calculate overall reputation score *)
  let calculate_reputation (arbiter: arbiter) : float =
    let success_rate = calculate_success_rate arbiter in
    let speed_bonus = calculate_speed_bonus arbiter in
    let volume_factor = calculate_volume_factor arbiter in

    (* Weighted combination *)
    let score =
      (success_rate *. 0.7) +.
      (volume_factor *. 0.2) +.
      speed_bonus
    in

    (* Clamp to valid range *)
    max ArbiterConfig.min_reputation_floor (
      min ArbiterConfig.max_reputation score
    )

  (** Update reputation after resolution *)
  let update_reputation
      ~(arbiter: arbiter)
      ~(resolution_time: float)
      ~(both_parties_satisfied: bool)
    : arbiter =
    let _ = both_parties_satisfied in
    let _ = resolution_time in

    (* Update statistics - simplified *)
    let total_disputes_resolved = arbiter.total_disputes_resolved + 1 in
    let total_votes_cast = arbiter.total_votes_cast + 1 in

    (* Create updated arbiter *)
    let updated_arbiter = {
      arbiter with
      total_disputes_resolved;
      total_votes_cast;
    } in

    (* Recalculate reputation *)
    let new_reputation_float = calculate_reputation updated_arbiter in
    let new_reputation_int = int_of_float new_reputation_float in

    { updated_arbiter with reputation_score = new_reputation_int }

  (** Apply reputation boost *)
  let apply_reputation_boost (arbiter: arbiter) : arbiter =
    let new_score =
      min (int_of_float ArbiterConfig.max_reputation) (
        int_of_float (float_of_int arbiter.reputation_score +. ArbiterConfig.success_reputation_boost)
      )
    in
    { arbiter with reputation_score = new_score }

  (** Apply reputation penalty *)
  let apply_reputation_penalty (arbiter: arbiter) : arbiter =
    let new_score =
      max (int_of_float ArbiterConfig.min_reputation_floor) (
        int_of_float (float_of_int arbiter.reputation_score -. ArbiterConfig.failure_reputation_penalty)
      )
    in
    { arbiter with reputation_score = new_score }

end

(** Arbiter selection algorithm *)
module ArbiterSelection = struct

  (** Check if arbiter is eligible *)
  let is_eligible (arbiter: arbiter) : bool =
    arbiter.is_active &&
    float_of_int arbiter.reputation_score >= (ArbiterConfig.min_reputation *. 1000.0)
    (* TODO: Add staked_amount field to arbiter type and check minimum stake *)

  (** Filter arbiters by specialization *)
  let filter_by_specialization
      ~(arbiters: arbiter list)
      ~(required_specialization: specialization)
    : arbiter list =

    List.filter (fun arbiter ->
      match arbiter.specialization with
      | Some spec -> spec = specialization_to_string required_specialization
      | None -> false
    ) arbiters

  (** Calculate selection weight based on reputation *)
  let calculate_weight (arbiter: arbiter) : float =
    (* Weight is proportional to reputation score *)
    float_of_int arbiter.reputation_score

  (** Select arbiter using weighted random selection *)
  let weighted_random_selection (arbiters: arbiter list) : arbiter option =
    if List.length arbiters = 0 then
      None
    else
      (* Calculate total weight *)
      let total_weight =
        List.fold_left (fun acc arbiter ->
          acc +. calculate_weight arbiter
        ) 0.0 arbiters
      in

      (* Generate random value *)
      let random_value = Random.float total_weight in

      (* Select arbiter based on cumulative weights *)
      let rec select_arbiter cumulative remaining =
        match remaining with
        | [] -> List.hd arbiters (* Fallback *)
        | arbiter :: rest ->
            let new_cumulative = cumulative +. calculate_weight arbiter in
            if random_value <= new_cumulative then
              arbiter
            else
              select_arbiter new_cumulative rest
      in

      Some (select_arbiter 0.0 arbiters)

  (** Select best arbiter for dispute *)
  let select_arbiter
      ~(arbiters: arbiter list)
      ~(required_specialization: specialization)
    : arbiter option =

    (* Filter eligible arbiters *)
    let eligible = List.filter is_eligible arbiters in

    (* Filter by specialization *)
    let specialized =
      filter_by_specialization
        ~arbiters:eligible
        ~required_specialization
    in

    (* Select using weighted random *)
    weighted_random_selection specialized

  (** Get load balancing score (inverse of recent assignments) *)
  let calculate_load_score (arbiter: arbiter) : float =
    (* This would need tracking of recent assignments *)
    (* For now, use inverse of total disputes resolved *)
    let base_load = float_of_int arbiter.total_disputes_resolved in
    1.0 /. (1.0 +. base_load)

end

(** Reward calculation *)
module RewardCalculation = struct

  (** Calculate base arbiter fee *)
  let calculate_base_fee (escrow_amount: usd_cents) : usd_cents =
    Int64.of_float (
      Int64.to_float escrow_amount *. 0.01 (* 1% *)
    )

  (** Calculate fast resolution bonus *)
  let calculate_speed_bonus
      ~(base_fee: usd_cents)
      ~(resolution_time: float)
    : usd_cents =

    if resolution_time < ArbiterConfig.fast_resolution_threshold then
      Int64.of_float (
        Int64.to_float base_fee *. 0.5 (* 50% bonus *)
      )
    else
      0L

  (** Calculate complexity bonus *)
  let calculate_complexity_bonus
      ~(base_fee: usd_cents)
      ~(evidence_count: int)
    : usd_cents =

    (* Bonus for handling complex disputes with lots of evidence *)
    if evidence_count > 10 then
      Int64.of_float (Int64.to_float base_fee *. 0.2) (* 20% *)
    else if evidence_count > 5 then
      Int64.of_float (Int64.to_float base_fee *. 0.1) (* 10% *)
    else
      0L

  (** Calculate total arbiter reward *)
  let calculate_reward
      ~(escrow_amount: usd_cents)
      ~(resolution_time: float)
      ~(evidence_count: int)
      ~(both_parties_satisfied: bool)
    : usd_cents =

    let base_fee = calculate_base_fee escrow_amount in
    let speed_bonus = calculate_speed_bonus ~base_fee ~resolution_time in
    let complexity_bonus = calculate_complexity_bonus ~base_fee ~evidence_count in

    (* Satisfaction bonus *)
    let satisfaction_bonus =
      if both_parties_satisfied then
        Int64.of_float (Int64.to_float base_fee *. 0.1) (* 10% *)
      else
        0L
    in

    Int64.add base_fee (
      Int64.add speed_bonus (
        Int64.add complexity_bonus satisfaction_bonus
      )
    )

end

(** Arbiter slashing *)
module ArbiterSlashing = struct

  (** Reasons for slashing *)
  type slash_reason =
    | BiasedDecision
    | MissedDeadline
    | PoorQualityReasoning
    | EthicsViolation
    | InactiveStatus

  (** Calculate slashing amount *)
  let calculate_slash_amount
      ~(arbiter: arbiter)
      ~(reason: slash_reason)
    : usd_cents =

    let slash_pct = match reason with
      | BiasedDecision -> 0.50 (* 50% *)
      | MissedDeadline -> 0.10 (* 10% *)
      | PoorQualityReasoning -> 0.05 (* 5% *)
      | EthicsViolation -> 1.00 (* 100% *)
      | InactiveStatus -> 0.20 (* 20% *)
    in

    Int64.of_float (
      Int64.to_float arbiter.staked_amount *. slash_pct
    )

  (** Execute slashing *)
  let slash_arbiter
      ~(arbiter: arbiter)
      ~(reason: slash_reason)
      ~(slash_amount: usd_cents)
    : arbiter =

    let _ = reason in  (* Unused but kept for API consistency *)
    let new_stake = Int64.sub arbiter.staked_amount slash_amount in

    (* Deactivate if stake falls below minimum *)
    let is_active =
      Int64.compare new_stake ArbiterConfig.min_stake >= 0
    in

    {
      arbiter with
      staked_amount = new_stake;
      is_active;
    }

end

(** Arbiter registry operations *)
module ArbiterRegistry = struct

  type t = {
    mutable arbiters: arbiter list;
  }

  (** Create new arbiter registry *)
  let create () : t =
    { arbiters = [] }

  (** Register new arbiter *)
  let register_arbiter
      (t: t)
      ~(address: string)
      ~(stake_amount: usd_cents)
      ~(specializations: specialization list)
    : (arbiter, string) Result.t Lwt.t =

    (* Validate stake amount *)
    if Int64.compare stake_amount ArbiterConfig.min_stake < 0 then
      Lwt.return (Error (
        Printf.sprintf "Stake amount must be at least $%s"
          (Int64.to_string (Int64.div ArbiterConfig.min_stake 100L))
      ))
    else if List.length specializations = 0 then
      Lwt.return (Error "At least one specialization required")
    else
      (* Check if already registered *)
      let existing =
        List.find_opt (fun (a : arbiter) -> a.arbiter_address = address) t.arbiters
      in

      match existing with
      | Some _ ->
          Lwt.return (Error "Arbiter already registered")
      | None ->
          let arbiter = {
            arbiter_id = Int64.of_int (List.length t.arbiters + 1);
            arbiter_address = address;
            reputation_score = int_of_float ArbiterConfig.initial_reputation;
            total_disputes_resolved = 0;
            total_votes_cast = 0;
            specialization = (match specializations with
              | [] -> None
              | hd :: _ -> Some (Types.specialization_to_string hd));
            is_active = true;
            staked_amount = stake_amount;
            staked_at = Some (Unix.gettimeofday ());
          } in

          t.arbiters <- arbiter :: t.arbiters;
          Lwt.return (Ok arbiter)

  (** Select arbiter for dispute *)
  let select_arbiter
      (t: t)
      ~(required_specialization: specialization)
    : arbiter Lwt.t =

    match ArbiterSelection.select_arbiter
            ~arbiters:t.arbiters
            ~required_specialization
    with
    | Some arbiter -> Lwt.return arbiter
    | None -> failwith "No eligible arbiter found"

  (** Calculate arbiter reward *)
  let calculate_reward
      ~(escrow_amount: usd_cents)
      ~(resolution_time: float)
      ~(evidence_count: int)
      ~(both_parties_satisfied: bool)
    : usd_cents =

    RewardCalculation.calculate_reward
      ~escrow_amount
      ~resolution_time
      ~evidence_count
      ~both_parties_satisfied

  (** Update arbiter reputation *)
  let update_reputation
      (t: t)
      ~(arbiter: arbiter)
      ~(resolution_time: float)
      ~(both_parties_satisfied: bool)
    : arbiter Lwt.t =

    let updated =
      ReputationSystem.update_reputation
        ~arbiter
        ~resolution_time
        ~both_parties_satisfied
    in

    (* Update in registry *)
    t.arbiters <- List.map (fun (a : arbiter) ->
      if a.arbiter_address = arbiter.arbiter_address then
        updated
      else
        a
    ) t.arbiters;

    Lwt.return updated

  (** Slash arbiter *)
  let slash_arbiter
      (t: t)
      ~(arbiter: arbiter)
      ~(reason: ArbiterSlashing.slash_reason)
    : unit Lwt.t =

    let slash_amount =
      ArbiterSlashing.calculate_slash_amount ~arbiter ~reason
    in

    let slashed =
      ArbiterSlashing.slash_arbiter ~arbiter ~reason ~slash_amount
    in

    (* Update in registry *)
    t.arbiters <- List.map (fun (a : arbiter) ->
      if a.arbiter_address = arbiter.arbiter_address then
        slashed
      else
        a
    ) t.arbiters;

    Lwt.return_unit

  (** Get arbiter by address *)
  let get_arbiter (t: t) ~(address: string) : arbiter option =
    List.find_opt (fun (a : arbiter) -> a.arbiter_address = address) t.arbiters

  (** Get all active arbiters *)
  let get_active_arbiters (t: t) : arbiter list =
    List.filter (fun (a : arbiter) -> a.is_active) t.arbiters

  (** Get arbiter statistics *)
  let get_arbiter_stats (t: t) : (string * float * int) list =
    List.map (fun (arb : arbiter) ->
      (arb.arbiter_address,
       float_of_int arb.reputation_score,
       arb.total_disputes_resolved)
    ) t.arbiters

end
