open Core
open Types

module ChainRiskCalculator = struct

  type chain_metrics = {
    security_multiplier: float;
    validator_centralization: float;
    historical_exploits: int;
    reorg_risk: float;
    (* Other metrics can be added here *)
  }

  let get_chain_metrics (db_pool: Db.Connection_pool.ConnectionPool.t) (chain: blockchain) : (chain_metrics option, [> Caqti_error.t]) Result.t Lwt.t =
    let%lwt result = Db.Risk_db.RiskDb.get_chain_risk_parameters db_pool (blockchain_to_string chain) in
    match result with
    | Ok (Some record) ->
        Lwt.return (Ok (Some {
            security_multiplier = record.security_multiplier;
            validator_centralization = record.validator_centralization;
            historical_exploits = record.historical_exploits;
            reorg_risk = record.reorg_risk;
        }))
    | Ok None -> Lwt.return (Ok None)
    | Error e -> Lwt.return (Error e)

  let calculate_bridge_risk ~(db_pool: Db.Connection_pool.ConnectionPool.t) ~(source_chain: blockchain) ~(dest_chain: blockchain) : (float, [> Caqti_error.t]) Result.t Lwt.t =
    let%lwt source_metrics_res = get_chain_metrics db_pool source_chain in
    let%lwt dest_metrics_res = get_chain_metrics db_pool dest_chain in

    match (source_metrics_res, dest_metrics_res) with
    | (Ok (Some source_metrics)), (Ok (Some dest_metrics)) ->
        let base_risk = Float.max source_metrics.security_multiplier dest_metrics.security_multiplier in
        (* Simplified logic, can be expanded *)
        Lwt.return (Ok base_risk)
    | (Error e), _ -> Lwt.return (Error e)
    | _, (Error e) -> Lwt.return (Error e)
    | _ -> Lwt.return (Ok 1.5) (* Default high risk if data is missing *)

  (* ... Other functions refactored to be async and use the DB-backed get_chain_metrics ... *)

end
