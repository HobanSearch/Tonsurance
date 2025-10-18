open Lwt.Syntax
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
    (tup5 string float float int int)
    |> map
      ~decode:(fun (asset, timestamp, min_price, duration_seconds, recovery_time_seconds) ->
        Ok { asset; timestamp; min_price; duration_seconds; recovery_time_seconds; })
      ~encode:(fun { asset; timestamp; min_price; duration_seconds; recovery_time_seconds } ->
        Ok (asset, timestamp, min_price, duration_seconds, recovery_time_seconds))

  let chain_risk_type =
    (tup5 string float float int float)
    |> map
      ~decode:(fun (chain, security_multiplier, validator_centralization, historical_exploits, reorg_risk) ->
        Ok { chain; security_multiplier; validator_centralization; historical_exploits; reorg_risk; })
      ~encode:(fun { chain; security_multiplier; validator_centralization; historical_exploits; reorg_risk } ->
        Ok (chain, security_multiplier, validator_centralization, historical_exploits, reorg_risk))

  let get_depegs_by_asset =
    string ->* depeg_event_type
    @@ "SELECT asset, timestamp, min_price, duration_seconds, recovery_time_seconds FROM historical_depegs WHERE asset = ?"

  let get_chain_risk_by_chain =
    string ->? chain_risk_type
    @@ "SELECT chain, security_multiplier, validator_centralization, historical_exploits, reorg_risk FROM chain_risk_parameters WHERE chain = ?"

end

module RiskDb = struct
  let get_historical_depegs (db_pool: db_pool) (asset: string) : (depeg_event_record list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.collect_list Q.get_depegs_by_asset asset)

  let get_chain_risk_parameters (db_pool: db_pool) (chain: string) : (chain_risk_record option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.find_opt Q.get_chain_risk_by_chain chain)
end
