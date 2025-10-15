(**
 * Compliance Filter
 * Ensures Tonny uses compliant language for parametric risk coverage
 *)

open Core

(** Forbidden terms that violate compliance *)
let forbidden_terms = [
  "insurance";
  "insure";
  "insured";
  "insurer";
  "policy holder";
  "policyholder";
  "insurance company";
  "insurance provider";
  "underwriter";
  "underwriting";
  "policy" (* Unless in specific contexts like "coverage policy" *);
]

(** Compliant replacements for forbidden terms *)
let compliance_replacements = [
  ("insurance", "parametric risk coverage");
  ("insure", "provide coverage for");
  ("insured", "covered");
  ("insurer", "coverage provider");
  ("policy holder", "coverage holder");
  ("policyholder", "coverage holder");
  ("insurance company", "coverage protocol");
  ("insurance provider", "risk coverage provider");
  ("underwriter", "risk assessor");
  ("underwriting", "risk assessment");
  ("policy", "coverage contract");
]

(** Check if text contains forbidden terms *)
let contains_forbidden_terms text =
  let lower = String.lowercase text in
  List.filter forbidden_terms ~f:(fun term ->
    String.is_substring lower ~substring:term
  )

(** Validate response for compliance *)
let validate_response text =
  match contains_forbidden_terms text with
  | [] -> Ok text
  | violations ->
      Error (sprintf
        "Compliance violation: Response contains forbidden terms: %s"
        (String.concat ~sep:", " violations))

(** Auto-correct common compliance violations *)
let auto_correct text =
  List.fold_left compliance_replacements ~init:text ~f:(fun acc (from, to_) ->
    (* Case-insensitive replacement *)
    let re = Str.regexp_case_fold from in
    Str.global_replace re to_ acc
  )

(** Ensure pricing responses emphasize dynamic nature *)
let has_fixed_rate_language text =
  let lower = String.lowercase text in
  String.is_substring lower ~substring:"fixed apr" ||
  String.is_substring lower ~substring:"always costs" ||
  (* Match patterns like "0.8% APR" or "1.5% APR" *)
  Str.string_match (Str.regexp ".*[0-9]+\\.[0-9]+% apr.*") lower 0

(** Check if response has dynamic pricing language *)
let has_dynamic_language text =
  let lower = String.lowercase text in
  String.is_substring lower ~substring:"current" ||
  String.is_substring lower ~substring:"live" ||
  String.is_substring lower ~substring:"dynamic" ||
  String.is_substring lower ~substring:"real-time" ||
  String.is_substring lower ~substring:"market"

(** Validate pricing response compliance *)
let validate_pricing_response text =
  match has_fixed_rate_language text, has_dynamic_language text with
  | true, _ ->
      Error "Response suggests fixed pricing - must emphasize dynamic rates"
  | false, true ->
      Ok text
  | false, false ->
      (* Add dynamic pricing disclaimer *)
      Ok (text ^ "\n\n*Rates are dynamic and adjust based on current risk factors.")

(** Main compliance check with auto-correction *)
let ensure_compliance ?(is_pricing_response=false) text =
  (* First try validation *)
  match validate_response text with
  | Ok validated ->
      if is_pricing_response then
        validate_pricing_response validated
      else
        Ok validated
  | Error violation ->
      (* Log the violation *)
      printf "Compliance violation detected: %s\n" violation;

      (* Auto-correct and retry *)
      let corrected = auto_correct text in
      match validate_response corrected with
      | Ok safe_response ->
          if is_pricing_response then
            validate_pricing_response safe_response
          else
            Ok safe_response
      | Error _ ->
          (* Fallback to safe generic response *)
          Error "Could not auto-correct compliance violation"

(** Safe fallback response *)
let safe_fallback_response () =
  "I'm here to help with Tonsurance's parametric risk coverage! \
   Let me know what you'd like to protect. 🤖"
