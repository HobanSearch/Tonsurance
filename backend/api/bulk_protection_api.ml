(**
 * Bulk Protection API
 * Handles third-party protection purchases (buying for others)
 * Includes enterprise bulk purchasing with volume discounts
 *)

open Lwt.Syntax
open Types

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
  let total_base = Int64.mul base_premium (Int64.of_int quantity) in
  let discount_amount = Int64.of_float (Int64.to_float total_base *. discount) in
  let total_with_discount = Int64.sub total_base discount_amount in

  (total_with_discount, discount)

(** Validate bulk protection request *)
let validate_bulk_request (req: bulk_protection_request) : (unit, string) result =
  (* Check beneficiary count *)
  if List.length req.beneficiaries < 1 then
    Error "At least one beneficiary required"
  else if List.length req.beneficiaries > 10000 then
    Error "Maximum 10,000 beneficiaries per bulk request"

  (* Check template validity *)
  else if req.template.coverage_amount < 1000_00L then
    Error "Minimum coverage amount is $1,000"
  else if req.template.coverage_amount > 10_000_000_00L then
    Error "Maximum coverage amount is $10M per policy"

  (* Check duration *)
  else if req.template.duration_days < 1 then
    Error "Minimum duration is 1 day"
  else if req.template.duration_days > 365 then
    Error "Maximum duration is 365 days"

  (* Check trigger/floor prices *)
  else if req.template.trigger_price <= req.template.floor_price then
    Error "Trigger price must be above floor price"
  else if req.template.trigger_price > 1.0 || req.template.floor_price < 0.5 then
    Error "Invalid price range (trigger <= 1.0, floor >= 0.5)"

  (* Check beneficiaries *)
  else
    let invalid_addresses =
      List.filter (fun (b: beneficiary_entry) ->
        String.length b.wallet_address < 10  (* Basic validation *)
      ) req.beneficiaries
    in

    if List.length invalid_addresses > 0 then
      Error (Printf.sprintf "%d invalid wallet addresses" (List.length invalid_addresses))
    else
      Ok ()

(** Process bulk protection purchase *)
let process_bulk_purchase
    ~(request: bulk_protection_request)
    ~(pricing_engine: Types.policy -> usd_cents)
    ~(pool_state: Types.pool_state)
  : (bulk_protection_response, string) result Lwt.t =

  (* Validate request *)
  match validate_bulk_request request with
  | Error msg -> Lwt.return (Error msg)
  | Ok () ->
      let num_beneficiaries = List.length request.beneficiaries in

      (* Calculate single policy premium *)
      let sample_policy = {
        policy_id = 0L;
        policyholder = request.payer_address;
        beneficiary = None;
        asset = request.template.asset;
        coverage_amount = request.template.coverage_amount;
        premium_paid = 0L;
        trigger_price = request.template.trigger_price;
        floor_price = request.template.floor_price;
        start_time = Unix.time ();
        end_time = Unix.time () +. (float_of_int request.template.duration_days *. 86400.0);
        status = Active;
        is_gift = true;
        gift_message = None;
      } in

      let single_premium = pricing_engine sample_policy in

      (* Calculate bulk premium with discount *)
      let (total_premium, discount_pct) =
        calculate_bulk_premium ~base_premium:single_premium ~quantity:num_beneficiaries
      in

      (* Check pool capacity *)
      let total_coverage = Int64.mul request.template.coverage_amount (Int64.of_int num_beneficiaries) in
      let available_capacity = Int64.sub pool_state.total_capital pool_state.total_coverage_sold in

      if Int64.compare total_coverage available_capacity > 0 then
        Lwt.return (Error "Insufficient pool capacity for bulk purchase")
      else
        (* Create policies for each beneficiary *)
        let policies = List.mapi (fun i (b: beneficiary_entry) ->
          {
            sample_policy with
            policy_id = Int64.of_int (i + 1);
            policyholder = request.payer_address;
            beneficiary = Some b.wallet_address;
            premium_paid = single_premium;
            gift_message = b.custom_message;
          }
        ) request.beneficiaries in

        (* Create response *)
        let response = {
          request_id = Printf.sprintf "bulk_%s_%f" request.payer_address (Unix.time ());
          payer = request.payer_address;
          num_policies = num_beneficiaries;
          total_premium_paid = total_premium;
          discount_applied = discount_pct;
          policies_created = List.map (fun p -> p.policy_id) policies;
          notification_status = if request.notify_beneficiaries then
            List.map (fun (b: beneficiary_entry) ->
              (b.wallet_address, "pending")
            ) request.beneficiaries
          else
            [];
          timestamp = Unix.time ();
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

  | OnChainMessage ->
      (* Mock on-chain message - integrate with TON smart contracts *)
      let () = Printf.printf
        "⛓️  Posting on-chain notification for %s\n\
         Policy ID: %Ld\n\n"
        beneficiary
        notification.policy_id
      in
      Lwt.return true

  | Push device_token ->
      (* Mock push notification - integrate with FCM/APNS *)
      let () = Printf.printf
        "🔔 Sending push to device %s:\n\
         New insurance protection from %s\n\n"
        device_token
        notification.sender_name
      in
      Lwt.return true

(** Process all notifications for bulk purchase *)
let process_bulk_notifications
    ~(response: bulk_protection_response)
    ~(beneficiaries: beneficiary_entry list)
    ~(template: protection_template)
  : (string * bool) list Lwt.t =

  let create_notification (beneficiary: beneficiary_entry) (policy_id: int64) =
    {
      policy_id;
      beneficiary = beneficiary.wallet_address;
      sender_name = response.payer;
      coverage_amount = template.coverage_amount;
      asset = template.asset;
      trigger_price = template.trigger_price;
      expiry_date = Unix.time () +. (float_of_int template.duration_days *. 86400.0);
      personal_message = beneficiary.custom_message;
      claim_link = Printf.sprintf "https://tonsurance.com/policy/%Ld" policy_id;
    }
  in

  (* Send notifications to all beneficiaries *)
  let%lwt results =
    Lwt_list.mapi_p (fun i (b: beneficiary_entry) ->
      let policy_id = List.nth response.policies_created i in
      let notification = create_notification b policy_id in

      match b.notification_channel with
      | Some channel ->
          let%lwt success =
            send_beneficiary_notification
              ~beneficiary:b.wallet_address
              ~channel
              ~notification
          in
          Lwt.return (b.wallet_address, success)
      | None ->
          Lwt.return (b.wallet_address, false) (* No notification channel *)
    ) beneficiaries
  in

  Lwt.return results

(** Get bulk purchase statistics *)
let get_bulk_stats
    ~(payer_address: string)
    ~(all_policies: policy list)
  : bulk_stats =

  let payer_policies =
    List.filter (fun p ->
      p.policyholder = payer_address && p.is_gift
    ) all_policies
  in

  let total_spent =
    List.fold_left (fun acc p -> Int64.add acc p.premium_paid) 0L payer_policies
  in

  let total_coverage =
    List.fold_left (fun acc p -> Int64.add acc p.coverage_amount) 0L payer_policies
  in

  let active_policies =
    List.filter (fun p -> p.status = Active) payer_policies
  in

  let triggered_policies =
    List.filter (fun p -> p.status = Triggered) payer_policies
  in

  {
    total_policies_purchased = List.length payer_policies;
    total_premium_spent = total_spent;
    total_coverage_provided = total_coverage;
    active_policies = List.length active_policies;
    triggered_policies = List.length triggered_policies;
    unique_beneficiaries = List.length (List.sort_uniq String.compare
      (List.filter_map (fun p -> p.beneficiary) payer_policies));
  }

and bulk_stats = {
  total_policies_purchased: int;
  total_premium_spent: usd_cents;
  total_coverage_provided: usd_cents;
  active_policies: int;
  triggered_policies: int;
  unique_beneficiaries: int;
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
      Bytes.set random_bytes i (Char.chr (Random.int 256))
    done;
    let hex =
      Bytes.to_seq random_bytes
      |> Seq.map (fun c -> Printf.sprintf "%02x" (Char.code c))
      |> List.of_seq
      |> String.concat ""
    in
    "TONS-" ^ String.uppercase_ascii (String.sub hex 0 12)

  (** Create gift voucher *)
  let create_voucher
      ~(purchaser: string)
      ~(template: protection_template)
      ~(validity_days: int)
    : voucher =
    {
      voucher_code = generate_voucher_code ();
      purchaser;
      coverage_amount = template.coverage_amount;
      asset = template.asset;
      duration_days = template.duration_days;
      trigger_price = template.trigger_price;
      floor_price = template.floor_price;
      redeemed = false;
      redeemed_by = None;
      expiry_date = Unix.time () +. (float_of_int validity_days *. 86400.0);
      created_at = Unix.time ();
    }

  (** Redeem voucher *)
  let redeem_voucher
      ~(voucher: voucher)
      ~(beneficiary: string)
    : (voucher * policy, string) result =

    if voucher.redeemed then
      Error "Voucher already redeemed"
    else if Unix.time () > voucher.expiry_date then
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
        asset = voucher.asset;
        coverage_amount = voucher.coverage_amount;
        premium_paid = 0L; (* Already paid by voucher purchaser *)
        trigger_price = voucher.trigger_price;
        floor_price = voucher.floor_price;
        start_time = Unix.time ();
        end_time = Unix.time () +. (float_of_int voucher.duration_days *. 86400.0);
        status = Active;
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
      List.filter (fun p -> p.policyholder = org_address) all_policies
    in

    let active_policies =
      List.filter (fun p -> p.status = Active) org_policies
    in

    let total_coverage =
      List.fold_left (fun acc p -> Int64.add acc p.coverage_amount) 0L active_policies
    in

    let monthly_premium =
      (* Estimate monthly premium based on 30-day policies *)
      List.fold_left (fun acc p ->
        let days = (p.end_time -. p.start_time) /. 86400.0 in
        let monthly = Int64.of_float (Int64.to_float p.premium_paid *. (30.0 /. days)) in
        Int64.add acc monthly
      ) 0L active_policies
    in

    let discount_tier =
      let count = List.length org_policies in
      if count >= 200 then "Platinum (30%)"
      else if count >= 51 then "Gold (25%)"
      else if count >= 11 then "Silver (15%)"
      else "Standard (0%)"
    in

    let policies_by_asset =
      List.fold_left (fun acc p ->
        let count = List.assoc_opt p.asset acc |> Option.value ~default:0 in
        (p.asset, count + 1) :: List.remove_assoc p.asset acc
      ) [] active_policies
    in

    let now = Unix.time () in
    let upcoming_renewals =
      List.filter (fun p ->
        let days_until_expiry = (p.end_time -. now) /. 86400.0 in
        days_until_expiry > 0.0 && days_until_expiry <= 7.0
      ) active_policies
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
