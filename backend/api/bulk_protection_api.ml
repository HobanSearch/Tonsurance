(**
 * Bulk Protection API
 * Handles third-party protection purchases (buying for others)
 * Includes enterprise bulk purchasing with volume discounts
 *)

open Core
open Types

(** Notification for beneficiary *)
type beneficiary_notification = {
  policy_id: int64;
  beneficiary: string;
  sender_name: string;
  coverage_amount: usd_cents;
  asset: asset;
  trigger_price: float;
  expiry_date: float;
  personal_message: string option;
  claim_link: string;
} [@@deriving sexp]

(** Volume discount tiers *)
let get_volume_discount (count: int) : float =
  if count >= 200 then 0.30      (* 30% discount for 200+ *)
  else if count >= 51 then 0.25  (* 25% discount for 51-200 *)
  else if count >= 11 then 0.15  (* 15% discount for 11-50 *)
  else 0.0                       (* No discount for 1-10 *)

(** Calculate bulk premium with discount *)
let calculate_bulk_premium
    ~(base_premium: usd_cents)
    ~(quantity: int)
  : usd_cents * float =

  let discount = get_volume_discount quantity in
  let total_base = Int64.( * ) base_premium (Int64.of_int quantity) in
  let discount_amount = Int64.of_float (Int64.to_float total_base *. discount) in
  let total_with_discount = Int64.( - ) total_base discount_amount in

  (total_with_discount, discount)

(** Validate bulk protection request *)
let validate_bulk_request (req: bulk_protection_request) : (unit, string) Result.t =
  (* Check beneficiary count *)
  if List.length req.beneficiaries < 1 then
    Error "At least one beneficiary required"
  else if List.length req.beneficiaries > 10000 then
    Error "Maximum 10,000 beneficiaries per bulk request"

  (* Check coverage amounts (each beneficiary has their own coverage_amount) *)
  else if List.exists req.beneficiaries ~f:(fun (b: beneficiary_entry) -> Int64.(b.coverage_amount < 1000_00L)) then
    Error "Minimum coverage amount is $1,000 per policy"
  else if List.exists req.beneficiaries ~f:(fun (b: beneficiary_entry) -> Int64.(b.coverage_amount > 10_000_000_00L)) then
    Error "Maximum coverage amount is $10M per policy"

  (* Check duration *)
  else if req.duration_days < 1 then
    Error "Minimum duration is 1 day"
  else if req.duration_days > 365 then
    Error "Maximum duration is 365 days"

  (* Check trigger/floor prices *)
  else if Float.(req.protection_config.trigger_price <= req.protection_config.floor_price) then
    Error "Trigger price must be above floor price"
  else if Float.(req.protection_config.trigger_price > 1.0 || req.protection_config.floor_price < 0.5) then
    Error "Invalid price range (trigger <= 1.0, floor >= 0.5)"

  (* Check beneficiaries *)
  else
    let invalid_addresses =
      List.filter req.beneficiaries ~f:(fun (b: beneficiary_entry) ->
        String.length b.address < 10  (* Basic validation *)
      )
    in

    if List.length invalid_addresses > 0 then
      Error (Printf.sprintf "%d invalid wallet addresses" (List.length invalid_addresses))
    else
      Ok ()

(** Process bulk protection purchase *)
let process_bulk_purchase
    ~(request: bulk_protection_request)
    ~(pricing_engine: Types.policy -> usd_cents)
    ~(pool_state: Types.unified_pool)
  : (bulk_protection_response, string) Result.t Lwt.t =

  (* Validate request *)
  match validate_bulk_request request with
  | Error msg -> Lwt.return (Error msg)
  | Ok () ->
      let num_beneficiaries = List.length request.beneficiaries in

      (* Calculate single policy premium *)
      let sample_policy = {
        policy_id = 0L;
        policyholder = request.buyer_address;
        beneficiary = None;
        coverage_type = Depeg;  (* Default for bulk protection - TODO: add to request *)
        chain = request.protection_config.chain;
        asset = request.protection_config.asset;
        coverage_amount = 1000_00L;  (* Use average or first beneficiary amount *)
        premium_paid = 0L;
        trigger_price = request.protection_config.trigger_price;
        floor_price = request.protection_config.floor_price;
        start_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        expiry_time = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. (Float.of_int request.duration_days *. 86400.0);
        status = Active;
        payout_amount = None;
        payout_time = None;
        is_gift = true;
        gift_message = None;
      } in

      let single_premium = pricing_engine sample_policy in

      (* Calculate bulk premium with discount *)
      let (total_premium, discount_pct) =
        calculate_bulk_premium ~base_premium:single_premium ~quantity:num_beneficiaries
      in

      (* Check pool capacity *)
      let total_coverage = List.fold_left request.beneficiaries ~init:0L ~f:(fun acc b ->
        Int64.( + ) acc b.coverage_amount
      ) in
      let available_capacity = Int64.( - ) pool_state.total_capital_usd pool_state.total_coverage_sold in

      if Int64.compare total_coverage available_capacity > 0 then
        Lwt.return (Error "Insufficient pool capacity for bulk purchase")
      else
        (* Create policies for each beneficiary *)
        let policies = List.mapi request.beneficiaries ~f:(fun i (b: beneficiary_entry) ->
          {
            sample_policy with
            policy_id = Int64.of_int (i + 1);
            policyholder = request.buyer_address;
            beneficiary = Some b.address;
            premium_paid = single_premium;
            gift_message = b.custom_message;
          }
        ) in

        (* Create response *)
        let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        let response = {
          bulk_contract_id = Int64.of_float (now *. 1000.0);
          policy_ids = List.map policies ~f:(fun p -> p.policy_id);
          total_premium_usd = Int64.to_float total_premium /. 100.0;
          discount_applied_pct = discount_pct *. 100.0;
          beneficiary_count = num_beneficiaries;
        } in

        Lwt.return (Ok response)

(** Send notification to beneficiary *)
let send_beneficiary_notification
    ~(beneficiary: string)
    ~(channel: notification_channel)
    ~(notification: beneficiary_notification)
  : bool Lwt.t =

  match channel with
  | Email email_addr ->
      (* Mock email sending - integrate with real email service *)
      let () = Printf.printf
        "📧 Sending email to %s:\n\
         Subject: You've received insurance protection!\n\
         From: %s\n\
         Coverage: $%Ld\n\
         Message: %s\n\n"
        email_addr
        notification.sender_name
        notification.coverage_amount
        (Option.value notification.personal_message ~default:"")
      in
      Lwt.return true

  | Telegram username ->
      (* Mock Telegram notification - integrate with Telegram Bot API *)
      let () = Printf.printf
        "📱 Sending Telegram to @%s:\n\
         You've received $%Ld in insurance protection from %s!\n\n"
        username
        notification.coverage_amount
        notification.sender_name
      in
      Lwt.return true

  | OnChain ->
      (* Mock on-chain message - integrate with TON smart contracts *)
      let () = Printf.printf
        "⛓️  Posting on-chain notification for %s\n\
         Policy ID: %Ld\n\n"
        beneficiary
        notification.policy_id
      in
      Lwt.return true

  | SMS phone_number ->
      (* Mock SMS notification *)
      let () = Printf.printf
        "📱 Sending SMS to %s:\n\
         New insurance protection from %s\n\n"
        phone_number
        notification.sender_name
      in
      Lwt.return true

(** Process all notifications for bulk purchase *)
let process_bulk_notifications
    ~(response: bulk_protection_response)
    ~(beneficiaries: beneficiary_entry list)
    ~(buyer_address: string)
    ~(asset: asset)
    ~(trigger_price: float)
    ~(duration_days: int)
  : (string * bool) list Lwt.t =

  let create_notification (beneficiary: beneficiary_entry) (policy_id: int64) =
    let now = Time_float.now ()
      |> Time_float.to_span_since_epoch
      |> Time_float.Span.to_sec
    in
    {
      policy_id;
      beneficiary = beneficiary.address;
      sender_name = buyer_address;
      coverage_amount = beneficiary.coverage_amount;
      asset;
      trigger_price;
      expiry_date = now +. (float_of_int duration_days *. 86400.0);
      personal_message = beneficiary.custom_message;
      claim_link = Printf.sprintf "https://tonsurance.com/policy/%Ld" policy_id;
    }
  in

  (* Send notifications to all beneficiaries *)
  let%lwt results =
    Lwt_list.mapi_p (fun i (b: beneficiary_entry) ->
      let policy_id = List.nth_exn response.policy_ids i in
      let notification = create_notification b policy_id in

      (* TODO: Add notification_channel to beneficiary_entry type *)
      match None with (* b.notification_channel *)
      | Some channel ->
          let%lwt success =
            send_beneficiary_notification
              ~beneficiary:b.address
              ~channel
              ~notification
          in
          Lwt.return (b.address, success)
      | None ->
          Lwt.return (b.address, false) (* No notification channel *)
    ) beneficiaries
  in

  Lwt.return results

(** Bulk statistics type *)
type bulk_stats = {
  total_policies: int;
  total_spent: usd_cents;
  average_per_policy: usd_cents;
  unique_beneficiaries: int;
} [@@deriving sexp]

(** Get bulk purchase statistics *)
let get_bulk_stats
    ~(payer_address: string)
    ~(all_policies: policy list)
  : bulk_stats =

  let payer_policies =
    List.filter ~f:(fun p ->
      String.equal p.policyholder payer_address && p.is_gift
    ) all_policies
  in

  let total_spent =
    List.fold ~f:(fun acc p -> Int64.(+) acc p.premium_paid) ~init:0L payer_policies
  in

  let _total_coverage =
    List.fold ~f:(fun acc p -> Int64.(+) acc p.coverage_amount) ~init:0L payer_policies
  in

  let _active_policies =
    List.filter ~f:(fun p -> equal_policy_status p.status Active) payer_policies
  in

  let _triggered_policies =
    List.filter ~f:(fun p -> equal_policy_status p.status Triggered) payer_policies
  in

  {
    total_policies = List.length payer_policies;
    total_spent = total_spent;
    average_per_policy = (if List.length payer_policies > 0 then Int64.(/) total_spent (Int64.of_int (List.length payer_policies)) else 0L);
    unique_beneficiaries = List.length (List.dedup_and_sort ~compare:String.compare
      (List.filter_map payer_policies ~f:(fun p -> p.beneficiary)));
  }

(** Gift card / voucher system *)
module GiftVoucher = struct

  type voucher = {
    voucher_code: string;
    purchaser: string;
    coverage_amount: usd_cents;
    asset: asset;
    duration_days: int;
    trigger_price: float;
    floor_price: float;
    redeemed: bool;
    redeemed_by: string option;
    expiry_date: float;
    created_at: float;
  }

  (** Generate unique voucher code *)
  let generate_voucher_code () : string =
    let random_bytes = Bytes.create 16 in
    (* In production, use proper crypto random *)
    for i = 0 to 15 do
      Bytes.set random_bytes i (Char.of_int_exn (Random.int 256))
    done;
    let hex =
      let chars = ref [] in
      for i = 0 to Bytes.length random_bytes - 1 do
        chars := (Printf.sprintf "%02x" (Char.to_int (Bytes.get random_bytes i))) :: !chars
      done;
      String.concat ~sep:"" (List.rev !chars)
    in
    "TONS-" ^ String.uppercase (String.sub hex ~pos:0 ~len:12)

  (** Create gift voucher *)
  let create_voucher
      ~(purchaser: string)
      ~(coverage_amount: usd_cents)
      ~(duration_days: int)
      ~(template: protection_template)
      ~(validity_days: int)
    : voucher =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    {
      voucher_code = generate_voucher_code ();
      purchaser;
      coverage_amount;
      asset = template.asset;
      duration_days;
      trigger_price = template.trigger_price;
      floor_price = template.floor_price;
      redeemed = false;
      redeemed_by = None;
      expiry_date = now +. (float_of_int validity_days *. 86400.0);
      created_at = now;
    }

  (** Redeem voucher *)
  let redeem_voucher
      ~(voucher: voucher)
      ~(beneficiary: string)
      ~(coverage_type: coverage_type)
      ~(chain: blockchain)
    : (voucher * policy, string) Result.t =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    if voucher.redeemed then
      Error "Voucher already redeemed"
    else if Float.(now > voucher.expiry_date) then
      Error "Voucher expired"
    else
      let updated_voucher = { voucher with
        redeemed = true;
        redeemed_by = Some beneficiary;
      } in

      let policy = {
        policy_id = 0L; (* Will be assigned by system *)
        policyholder = voucher.purchaser;
        beneficiary = Some beneficiary;
        coverage_type;
        chain;
        asset = voucher.asset;
        coverage_amount = voucher.coverage_amount;
        premium_paid = 0L; (* Already paid by voucher purchaser *)
        trigger_price = voucher.trigger_price;
        floor_price = voucher.floor_price;
        start_time = now;
        expiry_time = now +. (float_of_int voucher.duration_days *. 86400.0);
        status = Active;
        payout_amount = None;
        payout_time = None;
        is_gift = true;
        gift_message = Some "Redeemed from gift voucher";
      } in

      Ok (updated_voucher, policy)

end

(** Enterprise dashboard data *)
module EnterpriseDashboard = struct

  type enterprise_stats = {
    organization_name: string;
    total_employees_covered: int;
    total_coverage_amount: usd_cents;
    monthly_premium: usd_cents;
    discount_tier: string;
    policies_by_asset: (asset * int) list;
    upcoming_renewals: int;
    active_claims: int;
  }

  (** Calculate enterprise statistics *)
  let get_enterprise_stats
      ~(org_address: string)
      ~(all_policies: policy list)
    : enterprise_stats =

    let org_policies =
      List.filter all_policies ~f:(fun p -> String.equal p.policyholder org_address)
    in

    let active_policies =
      List.filter org_policies ~f:(fun p -> equal_policy_status p.status Active)
    in

    let total_coverage =
      List.fold active_policies ~init:0L ~f:(fun acc p -> Int64.(+) acc p.coverage_amount)
    in

    let monthly_premium =
      (* Estimate monthly premium based on 30-day policies *)
      List.fold active_policies ~init:0L ~f:(fun acc p ->
        let days = (p.expiry_time -. p.start_time) /. 86400.0 in
        let monthly = Int64.of_float (Int64.to_float p.premium_paid *. (30.0 /. days)) in
        Int64.(+) acc monthly
      )
    in

    let discount_tier =
      let count = List.length org_policies in
      if count >= 200 then "Platinum (30%)"
      else if count >= 51 then "Gold (25%)"
      else if count >= 11 then "Silver (15%)"
      else "Standard (0%)"
    in

    let policies_by_asset =
      List.fold active_policies ~init:[] ~f:(fun acc p ->
        let count = List.Assoc.find acc ~equal:equal_asset p.asset |> Option.value ~default:0 in
        List.Assoc.add acc ~equal:equal_asset p.asset (count + 1)
      )
    in

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let upcoming_renewals =
      List.filter active_policies ~f:(fun p ->
        let days_until_expiry = (p.expiry_time -. now) /. 86400.0 in
        Float.(days_until_expiry > 0.0 && days_until_expiry <= 7.0)
      )
      |> List.length
    in

    {
      organization_name = org_address;
      total_employees_covered = List.length active_policies;
      total_coverage_amount = total_coverage;
      monthly_premium;
      discount_tier;
      policies_by_asset;
      upcoming_renewals;
      active_claims = 0; (* Would query claims engine *)
    }

end
