(** Core type definitions for Tonsurance

    This module defines all fundamental types used throughout the system:
    - Currency types (USD cents, BTC satoshis)
    - Asset types (stablecoins, crypto)
    - Policy structures
    - Vault and collateral types
    - Risk metrics
    - Price data
*)

open Core

(** Currency types - use int64 to prevent overflow and ensure precision *)
type usd_cents = int64 [@@deriving sexp, compare, yojson, equal]
type btc_sats = int64 [@@deriving sexp, compare, yojson]

(** Asset types supported by the protocol *)
type asset =
  | USDC
  | USDT
  | USDP
  | DAI
  | FRAX
  | BUSD
  | USDe    (* Ethena stablecoin *)
  | SUSDe   (* Staked Ethena *)
  | USDY    (* Ondo yield-bearing *)
  | PYUSD   (* PayPal stablecoin *)
  | GHO     (* Aave stablecoin *)
  | LUSD    (* Liquity stablecoin *)
  | CrvUSD  (* Curve stablecoin *)
  | MkUSD   (* Prisma stablecoin *)
  | BTC
  | ETH
[@@deriving sexp, compare, yojson, enumerate, equal, hash]

let asset_to_string = function
  | USDC -> "USDC"
  | USDT -> "USDT"
  | USDP -> "USDP"
  | DAI -> "DAI"
  | FRAX -> "FRAX"
  | BUSD -> "BUSD"
  | USDe -> "USDe"
  | SUSDe -> "sUSDe"
  | USDY -> "USDY"
  | PYUSD -> "PYUSD"
  | GHO -> "GHO"
  | LUSD -> "LUSD"
  | CrvUSD -> "crvUSD"
  | MkUSD -> "mkUSD"
  | BTC -> "BTC"
  | ETH -> "ETH"

let asset_of_string = function
  | "USDC" -> Ok USDC
  | "USDT" -> Ok USDT
  | "USDP" -> Ok USDP
  | "DAI" -> Ok DAI
  | "FRAX" -> Ok FRAX
  | "BUSD" -> Ok BUSD
  | "USDe" -> Ok USDe
  | "sUSDe" -> Ok SUSDe
  | "USDY" -> Ok USDY
  | "PYUSD" -> Ok PYUSD
  | "GHO" -> Ok GHO
  | "LUSD" -> Ok LUSD
  | "crvUSD" -> Ok CrvUSD
  | "mkUSD" -> Ok MkUSD
  | "BTC" -> Ok BTC
  | "ETH" -> Ok ETH
  | s -> Error (Printf.sprintf "Unknown asset: %s" s)

(** Price data with metadata *)
type price = {
  value: float;
  timestamp: float; (* Unix timestamp *)
  source: string;
  confidence: float; (* 0.0 - 1.0 *)
} [@@deriving sexp, yojson]

type price_series = price list [@@deriving sexp, yojson]

(** Coverage types - now includes CEX liquidation *)
type coverage_type =
  | Depeg
  | Smart_contract
  | Oracle
  | Bridge
  | CEX_liquidation
[@@deriving sexp, compare, yojson, enumerate, equal, hash]

let coverage_type_to_string = function
  | Depeg -> "depeg"
  | Smart_contract -> "smart_contract"
  | Oracle -> "oracle"
  | Bridge -> "bridge"
  | CEX_liquidation -> "cex_liquidation"

let coverage_type_of_string = function
  | "depeg" -> Ok Depeg
  | "smart_contract" -> Ok Smart_contract
  | "oracle" -> Ok Oracle
  | "bridge" -> Ok Bridge
  | "cex_liquidation" -> Ok CEX_liquidation
  | s -> Error (Printf.sprintf "Unknown coverage type: %s" s)

(** Coverage type to contract ID (0-4) *)
let coverage_type_to_id = function
  | Depeg -> 0
  | Smart_contract -> 1
  | Oracle -> 2
  | Bridge -> 3
  | CEX_liquidation -> 4

(** Convert contract ID back to coverage type *)
let coverage_type_of_id = function
  | 0 -> Depeg
  | 1 -> Smart_contract
  | 2 -> Oracle
  | 3 -> Bridge
  | 4 -> CEX_liquidation
  | id -> failwith (Printf.sprintf "Invalid coverage_type ID: %d (must be 0-4)" id)

(** Supported blockchains *)
type blockchain =
  | Ethereum
  | Arbitrum
  | Base
  | Polygon
  | Optimism
  | Bitcoin
  | Lightning
  | Solana
  | TON
[@@deriving sexp, compare, yojson, enumerate, equal, hash]

let blockchain_to_string = function
  | Ethereum -> "Ethereum"
  | Arbitrum -> "Arbitrum"
  | Base -> "Base"
  | Polygon -> "Polygon"
  | Optimism -> "Optimism"
  | Bitcoin -> "Bitcoin"
  | Lightning -> "Lightning"
  | Solana -> "Solana"
  | TON -> "TON"

let blockchain_of_string = function
  | "Ethereum" -> Ok Ethereum
  | "Arbitrum" -> Ok Arbitrum
  | "Base" -> Ok Base
  | "Polygon" -> Ok Polygon
  | "Optimism" -> Ok Optimism
  | "Bitcoin" -> Ok Bitcoin
  | "Lightning" -> Ok Lightning
  | "Solana" -> Ok Solana
  | "TON" -> Ok TON
  | s -> Error (Printf.sprintf "Unknown blockchain: %s" s)

(** Market conditions for dynamic pricing *)
type market_conditions = {
  stablecoin_prices: (asset * float * float) list; (* asset, price, confidence *)
  bridge_health_scores: (string * float) list; (* bridge_id, health_score *)
  cex_liquidation_rate: float; (* liquidations per hour *)
  chain_gas_prices: (blockchain * float) list; (* chain, gas_price_gwei *)
  protocol_exploit_count_24h: int;
  overall_volatility_index: float; (* 0.0 - 1.0 *)
  timestamp: float;
} [@@deriving sexp, yojson]

(** Policy status *)
type policy_status =
  | Active
  | Triggered
  | Claimed
  | Expired
  | Cancelled
[@@deriving sexp, compare, yojson, equal]

let policy_status_to_string = function
  | Active -> "active"
  | Triggered -> "triggered"
  | Claimed -> "claimed"
  | Expired -> "expired"
  | Cancelled -> "cancelled"

(** Policy structure (multi-dimensional with chain and stablecoin) *)
type policy = {
  policy_id: int64;
  policyholder: string;
  beneficiary: string option; (* If None, policyholder is beneficiary *)
  coverage_type: coverage_type; (* NEW: Coverage dimension *)
  chain: blockchain; (* NEW: Chain dimension *)
  asset: asset; (* Stablecoin dimension *)
  coverage_amount: usd_cents;
  premium_paid: usd_cents;
  trigger_price: float;
  floor_price: float;
  start_time: float;
  expiry_time: float;
  status: policy_status;
  payout_amount: usd_cents option;
  payout_time: float option;
  is_gift: bool;
  gift_message: string option;
} [@@deriving sexp, yojson, fields]

let get_beneficiary policy =
  Option.value policy.beneficiary ~default:policy.policyholder

let is_active policy =
  match policy.status with
  | Active -> true
  | _ -> false

(* Commented out due to ppx_fields_conv conflict
let is_expired policy ~current_time =
  current_time >= policy.expiry_time
*)

(** Virtual tranche for LP accounting *)
type virtual_tranche = {
  tranche_id: int;
  seniority: int; (* 1 = most senior, higher = more junior *)
  target_yield_bps: int; (* Basis points *)
  allocated_capital: usd_cents;
  accumulated_losses: usd_cents;
  accumulated_yields: usd_cents;
  lp_token_supply: int64;
} [@@deriving sexp, yojson]

let calculate_tranche_nav tranche =
  if Int64.(tranche.lp_token_supply = 0L) then
    1.0
  else
    let net_value =
      Int64.(tranche.allocated_capital - tranche.accumulated_losses + tranche.accumulated_yields)
      |> Int64.to_float
    in
    let tokens = Int64.to_float tranche.lp_token_supply in
    net_value /. tokens

(** Unified pool state *)
type unified_pool = {
  total_capital_usd: usd_cents;
  total_coverage_sold: usd_cents;
  btc_float_sats: btc_sats;
  btc_cost_basis: usd_cents;
  usd_reserves: usd_cents;
  virtual_tranches: virtual_tranche list;
  active_policies: policy list;
  last_rebalance_time: float;
} [@@deriving sexp, yojson]

(** Risk parameters for unified pool *)
type unified_risk_params = {
  max_ltv: float; (* Maximum loan-to-value ratio *)
  min_reserve_ratio: float; (* Minimum USD reserve ratio *)
  max_single_asset_exposure: float; (* Max exposure to single asset *)
  max_correlated_exposure: float; (* Max exposure to correlated assets *)
  required_stress_buffer: float; (* Stress test buffer multiplier *)
  rebalance_threshold: float; (* Drift threshold for rebalancing *)
} [@@deriving sexp, yojson]

let default_risk_params = {
  max_ltv = 0.75;
  min_reserve_ratio = 0.15;
  max_single_asset_exposure = 0.30;
  max_correlated_exposure = 0.50;
  required_stress_buffer = 1.5;
  rebalance_threshold = 0.10;
}

(** Collateral position *)
type collateral_position = {
  asset: asset;
  amount: int64;
  value_usd: usd_cents;
  cost_basis: usd_cents;
} [@@deriving sexp, yojson]

(** Stablecoin risk factors *)
type stablecoin_risk_factors = {
  reserve_quality: float; (* 0-1, higher = worse *)
  banking_exposure: float; (* 0-1, higher = more risk *)
  redemption_velocity: float; (* Normalized rate *)
  market_depth: float; (* Liquidity score *)
  regulatory_clarity: float; (* 0-1, higher = better *)
  historical_volatility: float; (* Standard deviation *)
  audit_frequency: float; (* Audits per year *)
  transparency_score: float; (* 0-1, higher = better *)
} [@@deriving sexp, yojson]

let default_risk_factors = {
  reserve_quality = 0.1;
  banking_exposure = 0.2;
  redemption_velocity = 0.0;
  market_depth = 0.8;
  regulatory_clarity = 0.7;
  historical_volatility = 0.02;
  audit_frequency = 4.0;
  transparency_score = 0.8;
}

(** Market stress level *)
type market_stress_level =
  | Normal
  | Elevated
  | High
  | Extreme
[@@deriving sexp, compare, yojson, equal]

let market_stress_to_float = function
  | Normal -> 1.0
  | Elevated -> 1.3
  | High -> 1.7
  | Extreme -> 2.5

(** Risk metrics *)
type risk_metrics = {
  var_95: float; (* Value at Risk, 95% confidence *)
  var_99: float; (* Value at Risk, 99% confidence *)
  cvar_95: float; (* Conditional VaR / Expected Shortfall *)
  expected_loss: float; (* Expected loss from current portfolio *)
  sharpe_ratio: float; (* Risk-adjusted return *)
  max_drawdown: float; (* Maximum observed loss *)
  stress_test_results: (string * float) list; (* Scenario -> Loss *)
  ltv: float; (* Current loan-to-value *)
  reserve_ratio: float; (* Current reserve ratio *)
} [@@deriving sexp, yojson]

(** Rebalancing action *)
type rebalance_action =
  | BuyBTC of float (* USD amount to spend *)
  | SellBTC of float (* BTC amount to sell *)
  | Hold
[@@deriving sexp, yojson]

let rebalance_action_to_string = function
  | BuyBTC amount -> Printf.sprintf "Buy BTC ($%.2f)" amount
  | SellBTC amount -> Printf.sprintf "Sell BTC (%.8f)" amount
  | Hold -> "Hold"

(** Pricing inputs *)
type pricing_input = {
  asset: asset;
  coverage_amount: usd_cents;
  trigger_price: float;
  floor_price: float;
  duration_days: int;
  market_stress: market_stress_level;
  risk_factors: stablecoin_risk_factors;
} [@@deriving sexp, yojson]

(** Premium calculation result *)
type premium_result = {
  premium_usd_cents: usd_cents;
  base_rate: float;
  risk_multiplier: float;
  duration_factor: float;
  utilization_factor: float;
  stress_factor: float;
  breakdown: (string * float) list;
} [@@deriving sexp, yojson]

(** Trigger check result *)
type trigger_check = {
  policy_id: int64;
  current_price: float;
  trigger_price: float;
  is_triggered: bool;
  samples_below: int;
  first_below_time: float option;
  should_payout: bool;
} [@@deriving sexp, yojson]

(** Payout calculation result *)
type payout_result = {
  policy_id: int64;
  payout_amount: usd_cents;
  beneficiary: string;
  trigger_price: float;
  floor_price: float;
  current_price: float;
  interpolation_factor: float;
} [@@deriving sexp, yojson]

(** Oracle consensus result *)
type oracle_consensus = {
  asset: asset;
  price: float;
  timestamp: float;
  sources: (string * float * float) list; (* source, price, confidence *)
  confidence: float; (* Overall confidence *)
  deviation: float; (* Standard deviation across sources *)
} [@@deriving sexp, yojson]

(** Duration helpers *)
type duration =
  | Hours of int
  | Days of int
  | Weeks of int
  | Months of int
[@@deriving sexp, yojson]

let duration_to_seconds = function
  | Hours h -> h * 3600
  | Days d -> d * 86400
  | Weeks w -> w * 604800
  | Months m -> m * 2592000 (* Approximate 30 days *)

let duration_to_days = function
  | Hours h -> h / 24
  | Days d -> d
  | Weeks w -> w * 7
  | Months m -> m * 30

let duration_to_string = function
  | Hours h -> Printf.sprintf "%d hours" h
  | Days d -> Printf.sprintf "%d days" d
  | Weeks w -> Printf.sprintf "%d weeks" w
  | Months m -> Printf.sprintf "%d months" m

(** Error types *)
type error =
  | InvalidAsset of string
  | InvalidPrice of string
  | InvalidDuration of string
  | InsufficientCapital of string
  | PolicyNotFound of int64
  | PolicyExpired of int64
  | PolicyAlreadyClaimed of int64
  | TriggerNotMet of string
  | RiskLimitExceeded of string
  | RebalanceError of string
  | OracleError of string
  | DatabaseError of string
  | ContractError of string
[@@deriving sexp, yojson]

let error_to_string = function
  | InvalidAsset msg -> Printf.sprintf "Invalid asset: %s" msg
  | InvalidPrice msg -> Printf.sprintf "Invalid price: %s" msg
  | InvalidDuration msg -> Printf.sprintf "Invalid duration: %s" msg
  | InsufficientCapital msg -> Printf.sprintf "Insufficient capital: %s" msg
  | PolicyNotFound id -> Printf.sprintf "Policy not found: %Ld" id
  | PolicyExpired id -> Printf.sprintf "Policy expired: %Ld" id
  | PolicyAlreadyClaimed id -> Printf.sprintf "Policy already claimed: %Ld" id
  | TriggerNotMet msg -> Printf.sprintf "Trigger not met: %s" msg
  | RiskLimitExceeded msg -> Printf.sprintf "Risk limit exceeded: %s" msg
  | RebalanceError msg -> Printf.sprintf "Rebalance error: %s" msg
  | OracleError msg -> Printf.sprintf "Oracle error: %s" msg
  | DatabaseError msg -> Printf.sprintf "Database error: %s" msg
  | ContractError msg -> Printf.sprintf "Contract error: %s" msg

(** Result type alias *)
type 'a result = ('a, error) Result.t

(** LP position *)
type lp_position = {
  lp_address: string;
  tranche_id: int;
  lp_tokens: int64;
  entry_nav: float;
  entry_timestamp: float;
} [@@deriving sexp, yojson]

(** Withdrawal calculation *)
type withdrawal_result = {
  lp_tokens_burned: int64;
  usd_cents_returned: usd_cents;
  current_nav: float;
  entry_nav: float;
  profit_loss_pct: float;
} [@@deriving sexp, yojson]

(** Monitoring alert *)
type alert_severity =
  | Low
  | Medium
  | High
  | Critical
[@@deriving sexp, compare, yojson, equal]

type alert = {
  severity: alert_severity;
  component: string;
  message: string;
  timestamp: float;
  metadata: (string * string) list;
} [@@deriving sexp, yojson]

let create_alert ~severity ~component ~message =
  {
    severity;
    component;
    message;
    timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    metadata = [];
  }

(** Transaction types for audit log *)
type transaction_type =
  | PolicyPurchase
  | PolicyPayout
  | LPDeposit
  | LPWithdrawal
  | Rebalance
  | YieldDistribution
  | LossAllocation
[@@deriving sexp, yojson]

type transaction = {
  tx_id: string;
  tx_type: transaction_type;
  timestamp: float;
  from_address: string option;
  to_address: string option;
  amount_usd_cents: usd_cents;
  metadata: (string * string) list;
} [@@deriving sexp, yojson]

(** API request/response types *)
type quote_request = {
  asset: asset;
  coverage_amount_usd: float;
  trigger_price: float;
  floor_price: float;
  duration: duration;
} [@@deriving sexp, yojson]

type quote_response = {
  premium_usd: float;
  premium_rate_bps: int;
  coverage_usd: float;
  duration_days: int;
  estimated_roi: float;
  available: bool;
  reason: string option;
} [@@deriving sexp, yojson]

type policy_purchase_request = {
  quote: quote_request;
  buyer_address: string;
  beneficiary_address: string option;
  is_gift: bool;
  gift_message: string option;
} [@@deriving sexp, yojson]

type policy_purchase_response = {
  policy_id: int64;
  contract_address: string;
  nft_minted: bool;
  premium_paid_usd: float;
  transaction_hash: string;
} [@@deriving sexp, yojson]

type policy_info_response = {
  policy: policy;
  current_asset_price: float;
  is_triggered: bool;
  time_remaining_seconds: int;
  estimated_payout_usd: float option;
} [@@deriving sexp, yojson]

type vault_info_response = {
  total_capital_usd: float;
  total_coverage_sold_usd: float;
  ltv_ratio: float;
  usd_reserves_usd: float;
  btc_float_btc: float;
  btc_float_usd: float;
  tranches: tranche_info list;
  available_capacity_usd: float;
} [@@deriving sexp, yojson]

and tranche_info = {
  tranche_id: int;
  seniority: int;
  target_yield_bps: int;
  nav: float;
  tvl_usd: float;
  accumulated_yield_usd: float;
  accumulated_loss_usd: float;
} [@@deriving sexp, yojson]

(** ========================================
    MULTI-CHAIN TYPES
    ======================================== *)

(** Oracle sources for price/event data *)
type oracle_source =
  | RedStone
  | Pyth
  | Chainlink
  | TONOracle
  | ChainSpecific of string
[@@deriving sexp, yojson]

(** Cross-chain events that can trigger protection *)
type cross_chain_event =
  | PriceUpdate of { chain: blockchain; asset: asset; price: float; timestamp: float }
  | BridgeExploit of { source_chain: blockchain; dest_chain: blockchain; amount: usd_cents; timestamp: float }
  | ContractExploit of { chain: blockchain; contract_address: string; severity: float; timestamp: float }
  | NetworkCongestion of { chain: blockchain; gas_price: float; congestion_level: float; timestamp: float }
[@@deriving sexp, yojson]

(** Trigger conditions for cross-chain policies *)
type trigger_condition =
  | PriceDepeg of { trigger_price: float; floor_price: float; duration_hours: int }
  | BridgeFailure of { bridge_contract: string; verification_threshold: int }
  | ContractExploit of { protocol_address: string; tvl_drop_pct: float }
  | NetworkFailure of { congestion_threshold: float; duration_minutes: int }
[@@deriving sexp, yojson]

(** Cross-chain policy (extends regular policy) *)
type chain_specific_policy = {
  policy_id: int64;
  policyholder: string;
  beneficiary: string option;
  monitored_chain: blockchain; (* Where the asset is *)
  settlement_chain: blockchain; (* Always TON for contagion protection *)
  asset: asset;
  coverage_amount: usd_cents;
  premium_paid: usd_cents;
  trigger_condition: trigger_condition;
  start_time: float;
  expiry_time: float;
  status: policy_status;
  payout_amount: usd_cents option;
  payout_time: float option;
  is_gift: bool;
  gift_message: string option;
} [@@deriving sexp, yojson]

(** Bridge security state *)
type bridge_state = {
  bridge_id: string;
  bridge_name: string;
  source_chain: blockchain;
  dest_chain: blockchain;
  tvl_usd: usd_cents;
  last_check: float;
  health_score: float; (* 0.0 - 1.0 *)
  recent_exploits: bridge_exploit list;
}[@@deriving sexp, yojson]

and bridge_exploit = {
  timestamp: float;
  amount_lost: usd_cents;
  vulnerability_type: string;
  confirmed: bool;
  oracle_sources: string list;
} [@@deriving sexp, yojson]

(** ========================================
    THIRD-PARTY PROTECTION TYPES
    ======================================== *)

(** Bulk protection request for enterprises *)
type bulk_protection_request = {
  buyer_address: string; (* Payer *)
  beneficiaries: beneficiary_entry list;
  protection_config: protection_template;
  duration_days: int;
  payment_method: payment_method;
} [@@deriving sexp, yojson]

and beneficiary_entry = {
  address: string;
  name: string option;
  coverage_amount: usd_cents;
  custom_message: string option;
} [@@deriving sexp, yojson]

and protection_template = {
  asset: asset;
  chain: blockchain;
  trigger_price: float;
  floor_price: float;
} [@@deriving sexp, yojson]

and payment_method =
  | OneTime
  | Recurring of int (* months *)
[@@deriving sexp, yojson]

type bulk_protection_response = {
  bulk_contract_id: int64;
  policy_ids: int64 list;
  total_premium_usd: float;
  discount_applied_pct: float;
  beneficiary_count: int;
} [@@deriving sexp, yojson]

(** Notification channels *)
type notification_channel =
  | Telegram of string (* user_id *)
  | Email of string
  | SMS of string
  | OnChain
[@@deriving sexp, yojson]

type notification_type =
  | GiftReceived of { from_address: string; policy_id: int64 }
  | ProtectionTriggered of { policy_id: int64; estimated_payout: usd_cents }
  | PayoutExecuted of { policy_id: int64; amount: usd_cents; tx_hash: string }
  | ProtectionExpiring of { policy_id: int64; days_remaining: int }
[@@deriving sexp, yojson]

(** ========================================
    PARAMETRIC ESCROW TYPES
    ======================================== *)

(** Escrow contract *)
type escrow_contract = {
  escrow_id: int64;
  payer: string;
  payee: string;
  amount: usd_cents;
  asset: asset;
  created_at: float;

  (* Conditions *)
  release_conditions: release_condition list;
  timeout_action: timeout_action;
  timeout_seconds: int;

  (* Multi-party support *)
  additional_parties: party_allocation list;

  (* Status *)
  status: escrow_status;
  conditions_met: int;
  released_at: float option;
  funded_at: float option;
  timeout_at: float;

  (* Protection *)
  protection_enabled: bool;
  protection_covers: protection_coverage;
  protection_policy_id: int64 option;
} [@@deriving sexp, yojson]

and release_condition =
  | OracleVerification of {
      oracle_endpoint: string;
      expected_value: string;
      verified: bool;
      last_check: float option;
    }
  | TimeElapsed of {
      seconds: int;
      start_time: float;
    }
  | ManualApproval of {
      approver: string;
      approved: bool;
      approval_deadline: float option;
      signature: string option;
    }
  | ChainEvent of {
      chain: blockchain;
      event_type: string;
      contract_address: string;
      occurred: bool;
      verified_at: float option;
    }
  | MultisigApproval of {
      required_signatures: int;
      signers: string list;
      signatures_received: (string * string) list; (* address * signature *)
    }
[@@deriving sexp, yojson]

and timeout_action =
  | ReleaseToPayee
  | ReturnToPayer
  | Split of float (* percentage to payee *)
[@@deriving sexp, yojson]

and party_allocation = {
  party_address: string;
  party_name: string option;
  allocation_pct: float; (* 0.0 - 1.0 *)
  conditions: release_condition list option;
} [@@deriving sexp, yojson]

and escrow_status =
  | EscrowActive
  | ConditionsMet
  | Released
  | Disputed
  | Cancelled
  | TimedOut
[@@deriving sexp, compare, yojson, equal]

and protection_coverage =
  | PayerOnly
  | PayeeOnly
  | BothParties
[@@deriving sexp, yojson]

let escrow_status_to_string = function
  | EscrowActive -> "active"
  | ConditionsMet -> "conditions_met"
  | Released -> "released"
  | Disputed -> "disputed"
  | Cancelled -> "cancelled"
  | TimedOut -> "timed_out"

(** Escrow types for different use cases *)
type escrow_type =
  | Freelance (* Simple work-for-payment *)
  | TradeFin (* International trade finance *)
  | Milestone (* Multi-milestone funding *)
  | RealEstate (* Property transactions *)
  | MultiParty (* Complex multi-party deals *)
[@@deriving sexp, yojson]

(** API request/response types for escrow *)
type escrow_create_request = {
  payer: string;
  payee: string;
  amount_usd: float;
  asset: asset;
  conditions: release_condition list;
  timeout_days: int;
  escrow_type: escrow_type;
  protection_enabled: bool;
} [@@deriving sexp, yojson]

type escrow_create_response = {
  escrow_id: int64;
  payer: string;
  payee: string;
  amount_usd: float;
  escrow_fee_usd: float;
  status: string;
  contract_address: string option;
} [@@deriving sexp, yojson]

type escrow_status_response = {
  escrow: escrow_contract;
  conditions_status: (int * bool * string) list; (* index, met, description *)
  time_remaining_seconds: int;
  can_release: bool;
} [@@deriving sexp, yojson]

(** ========================================
    DISPUTE RESOLUTION TYPES
    ======================================== *)

(** Evidence for dispute *)
type evidence = {
  evidence_id: int64;
  dispute_id: int64;
  submitted_by: string; (* payer or payee *)
  evidence_type: string; (* "transaction_proof", "oracle_data", etc. *)
  content_hash: string; (* SHA-256 hash of evidence *)
  ipfs_cid: string option; (* IPFS CID if stored on IPFS *)
  description: string;
  metadata: string option; (* Additional structured data as JSON string *)
  submitted_at: float;
  verified: bool;
  verified_at: float option;
  verified_by: string option;
} [@@deriving sexp, yojson]

type evidence_type_legacy =
  | Document
  | Image
  | Video
  | ScreenRecording
  | GitHubCommit
  | ChatLog
  | ContractAgreement
  | Other
[@@deriving sexp, yojson]

(** Dispute reasons *)
type dispute_reason =
  | WorkNotCompleted of { expected_deliverable: string; actual_state: string }
  | WorkQualityIssue of { agreed_standard: string; actual_quality: string }
  | PaymentDispute of { agreed_amount: usd_cents; disputed_amount: usd_cents }
  | TimelineViolation of { deadline: float; completion_time: float option }
  | FraudSuspicion of { evidence_url: string; description: string }
  | OtherReason of string
[@@deriving sexp, yojson]

(** Resolution outcomes *)
type resolution_outcome =
  | FullRelease (* 100% to payee *)
  | FullRefund (* 100% to payer *)
  | PartialSplit of { payee_pct: float; payer_pct: float } (* e.g., 60/40 *)
  | ExtendedDeadline of { extension_days: int } (* Give more time *)
  | RequireArbitration (* Escalate to multi-arbiter panel *)
[@@deriving sexp, yojson]

(** Dispute status *)
type dispute_status =
  | EvidenceCollection
  | UnderReview
  | Resolved
  | Appealed
  | Closed
[@@deriving sexp, compare, yojson, equal]

(** Dispute record *)
type dispute = {
  dispute_id: int64;
  escrow_id: int64;
  initiated_by: string;
  reason: dispute_reason;
  evidence: evidence list;
  assigned_arbiter: string option;
  status: dispute_status;
  resolution: resolution_outcome option;
  resolution_reasoning: string option;
  created_at: float;
  resolved_at: float option;
  appeal_deadline: float option;
} [@@deriving sexp, yojson]

(** Arbiter specialization *)
type specialization =
  | FreelanceDisputes
  | TradeFinDisputes
  | RealEstateDisputes
  | MilestoneDisputes
  | TechnicalDisputes
  | LegalDisputes
[@@deriving sexp, compare, yojson, equal]

let specialization_to_string = function
  | FreelanceDisputes -> "freelance"
  | TradeFinDisputes -> "trade_fin"
  | RealEstateDisputes -> "real_estate"
  | MilestoneDisputes -> "milestone"
  | TechnicalDisputes -> "technical"
  | LegalDisputes -> "legal"

let specialization_of_string = function
  | "freelance" -> Ok FreelanceDisputes
  | "trade_fin" -> Ok TradeFinDisputes
  | "real_estate" -> Ok RealEstateDisputes
  | "milestone" -> Ok MilestoneDisputes
  | "technical" -> Ok TechnicalDisputes
  | "legal" -> Ok LegalDisputes
  | s -> Error (Printf.sprintf "Unknown specialization: %s" s)

(** Arbiter record *)
type arbiter = {
  arbiter_id: int64;
  arbiter_address: string;
  reputation_score: int; (* Integer score, default 1000 *)
  total_disputes_resolved: int;
  total_votes_cast: int;
  specialization: string option;
  is_active: bool;
  staked_amount: usd_cents; (* Amount staked in USD cents *)
  staked_at: float option; (* Unix timestamp when stake was deposited *)
} [@@deriving sexp, yojson]

(** Arbiter vote *)
type arbiter_vote = {
  vote_id: int64;
  dispute_id: int64;
  arbiter_id: int64;
  arbiter_address: string;
  vote_option: string; (* "approve", "deny", "partial_approve", "abstain" *)
  vote_amount: int64 option; (* For partial approvals *)
  reasoning: string option;
} [@@deriving sexp, yojson]

(** Timeline event *)
type timeline_event = {
  event_id: int64;
  dispute_id: int64;
  event_type: string; (* "dispute_created", "evidence_submitted", etc. *)
  actor_address: string option;
  event_data: string option; (* JSON string *)
} [@@deriving sexp, yojson]

(** Configuration for escrow insurance pricing *)
type escrow_config = {
  base_apr: float; (* 0.008 = 0.8% APR *)
  short_duration_discount: float; (* 0.8 = 20% off for <= 7 days *)
  medium_duration_discount: float; (* 0.9 = 10% off for <= 30 days *)
  volume_discount: float; (* 0.9 = 10% off for 5+ escrows *)
  both_parties_multiplier: float; (* 1.5x for dual coverage *)
} [@@deriving sexp, yojson]

(** Protection coverage types for escrow *)
type escrow_coverage =
  | PayerOnly
  | PayeeOnly
  | BothParties
[@@deriving sexp, yojson]
