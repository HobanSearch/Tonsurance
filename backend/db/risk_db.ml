open Core
open Connection_pool.ConnectionPool

(* Corresponds to the depeg_event in risk_model.ml *)
type depeg_event_record = {
  asset: string;
  timestamp: float;
  min_price: float;
  duration_seconds: int;
  recovery_time_seconds: int;
}

type chain_risk_record = {
  chain: string;
  security_multiplier: float;
  validator_centralization: float;
  historical_exploits: int;
  reorg_risk: float;
}

type db_pool = t

module Q = struct
  open Caqti_request.Infix
  open Caqti_type

  let depeg_event_type =
    custom
      ~encode:(fun { asset; timestamp; min_price; duration_seconds; recovery_time_seconds } ->
        Ok (asset, timestamp, min_price, duration_seconds, recovery_time_seconds))
      ~decode:(fun (asset, timestamp, min_price, duration_seconds, recovery_time_seconds) ->
        Ok { asset; timestamp; min_price; duration_seconds; recovery_time_seconds; })
      (t5 string float float int int)

  let chain_risk_type =
    custom
      ~encode:(fun { chain; security_multiplier; validator_centralization; historical_exploits; reorg_risk } ->
        Ok (chain, security_multiplier, validator_centralization, historical_exploits, reorg_risk))
      ~decode:(fun (chain, security_multiplier, validator_centralization, historical_exploits, reorg_risk) ->
        Ok { chain; security_multiplier; validator_centralization; historical_exploits; reorg_risk; })
      (t5 string float float int float)

  let get_depegs_by_asset =
    string ->* depeg_event_type
    @@ "SELECT asset, timestamp, min_price, duration_seconds, recovery_time_seconds FROM historical_depegs WHERE asset = ?"

  let get_chain_risk_by_chain =
    string ->? chain_risk_type
    @@ "SELECT chain, security_multiplier, validator_centralization, historical_exploits, reorg_risk FROM chain_risk_parameters WHERE chain = ?"

  (** Get hot products (by policy count or total coverage)
      Returns (coverage_type_id, chain_id, stablecoin_id, policy_count, total_coverage_usd) *)
  let hot_product_type = t5 int int int int float

  let get_hot_products =
    int ->* hot_product_type
    @@ {|
      SELECT coverage_type, chain_id, stablecoin_id, policy_count,
             (total_coverage / 100.0) as total_coverage_usd
      FROM product_exposure
      WHERE policy_count > 0 OR total_coverage > 0
      ORDER BY policy_count DESC, total_coverage DESC
      LIMIT ?
    |}

end

module RiskDb = struct
  let get_historical_depegs (db_pool: db_pool) (asset: string) : (depeg_event_record list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.collect_list Q.get_depegs_by_asset asset)

  let get_chain_risk_parameters (db_pool: db_pool) (chain: string) : (chain_risk_record option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.find_opt Q.get_chain_risk_by_chain chain)

  (** Get most popular products from database (by policy count and total coverage)
      Returns list of (coverage_type_id, chain_id, stablecoin_id, policy_count, total_coverage_usd) *)
  let get_hot_products (db_pool: db_pool) ~(limit: int)
    : ((int * int * int * int * float) list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.collect_list Q.get_hot_products limit)

  (** Count recent depeg events (policies with status=paid for depeg coverage)
      Returns count of depeg claims in last N days *)
  let count_recent_depeg_claims (db_pool: db_pool) ~(days: int)
    : (int, [> Caqti_error.t]) result Lwt.t =

    let open Caqti_request.Infix in
    let open Caqti_type in

    let query = int ->! int
      @@ {|SELECT COUNT(*)::int
           FROM policies
           WHERE coverage_type = 0
             AND status = 'paid'
             AND payout_time > NOW() - INTERVAL '1 day' * $1|}
    in

    with_connection db_pool (fun (module Db) -> Db.find query days)
end
