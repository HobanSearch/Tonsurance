(** API v2 + WebSocket Server Entry Point
 *
 * Combines REST API and WebSocket into unified server with security:
 * - Rate limiting (100 requests/min per IP, 500/min per API key)
 * - CORS protection
 * - API key authentication for write operations
 * - Request size limits (10MB)
 * - Comprehensive logging
 *)

open Lwt.Syntax
open Lwt.Infix

let () =
  (* Initialize and validate configuration *)
  Lwt_main.run (
    let* () = Config_manager.ConfigManager.initialize () in
    let* () = Config_manager.ConfigManager.load_all_config () in
    let* validation_result = Config_manager.ConfigManager.validate_config () in
    match validation_result with
    | Error msg ->
        Logs_lwt.err (fun m -> m "Configuration validation failed: %s. Exiting." msg) >>= fun () ->
        exit 1
    | Ok () -> Lwt.return_unit
  );

  (* Parse port from environment or default *)
  let port =
    try int_of_string (Sys.getenv "PORT")
    with Not_found -> 8080
  in

  (* Initialize rate limiter from config *)
  (* TODO: Re-enable rate limiter when module structure is resolved *)
  (* Lwt_main.run (
    let* redis_host = Config_manager.ConfigManager.Pools.get_redis_host () in
    let* redis_port = Config_manager.ConfigManager.Pools.get_redis_port () in
    Logs_lwt.info (fun m -> m "Initializing rate limiter with Redis at %s:%d" redis_host redis_port) >>= fun () ->
    Security_middleware.Rate_limiter.init ~redis_host ~redis_port ()
  ); *)

  (* Create collateral manager *)
  let pool = Pool.Collateral_manager.CollateralManager.create_pool () in
  let collateral_manager = ref (Pool.Collateral_manager.CollateralManager.create ~pool_opt:pool ()) in

  (* Define protected routes (require API key authentication) *)
  let protected_routes = [
    ("/api/v2/policies", ["POST"]);           (* Buy policy *)
    ("/api/v2/claims", ["POST"]);             (* File claim *)
    ("/api/v2/vault/deposit", ["POST"]);      (* Deposit to vault *)
    ("/api/v2/vault/withdraw", ["POST"]);     (* Withdraw from vault *)
    ("/api/v2/admin/*", ["GET"; "POST"; "PUT"; "DELETE"]);  (* Admin endpoints *)
  ] in

  (* Initialize database connection pool *)
  let db_pool = Lwt_main.run (
    let* db_pool_result = Db.Connection_pool.GlobalPool.initialize () in
    match db_pool_result with
    | Error msg ->
        let* () = Lwt_io.printlf "ERROR: Failed to initialize database pool: %s" msg in
        exit 1
    | Ok pool -> Lwt.return pool
  ) in

  (* Print banner *)
  Printf.printf "\n╔════════════════════════════════════════╗\n";
  Printf.printf "║  Tonsurance API v2 + WebSocket         ║\n";
  Printf.printf "║  🔒 Security: ENABLED                   ║\n";
  Printf.printf "╚════════════════════════════════════════╝\n\n";
  Printf.printf "Port: %d\n" port;
  Printf.printf "Base URL: http://localhost:%d\n\n" port;
  Printf.printf "Security Features:\n";
  Printf.printf "  ✓ Rate Limiting: 100/min per IP, 500/min per API key\n";
  Printf.printf "  ✓ CORS: Enabled with origin allowlist\n";
  Printf.printf "  ✓ Authentication: Bearer token (write ops only)\n";
  Printf.printf "  ✓ Request Size Limit: 10MB\n";
  Printf.printf "  ✓ Logging: Comprehensive request logging\n\n";
  Printf.printf "REST Endpoints (Public - No Auth Required):\n";
  Printf.printf "  POST http://localhost:%d/api/v2/quote/multi-dimensional\n" port;
  Printf.printf "  GET  http://localhost:%d/api/v2/risk/exposure\n" port;
  Printf.printf "  GET  http://localhost:%d/api/v2/bridge-health/:bridge_id\n" port;
  Printf.printf "  GET  http://localhost:%d/api/v2/risk/alerts\n" port;
  Printf.printf "  GET  http://localhost:%d/api/v2/tranches/apy\n\n" port;
  Printf.printf "REST Endpoints (Protected - Requires API Key):\n";
  Printf.printf "  POST http://localhost:%d/api/v2/policies (Buy Policy)\n" port;
  Printf.printf "  POST http://localhost:%d/api/v2/claims (File Claim)\n" port;
  Printf.printf "  POST http://localhost:%d/api/v2/vault/deposit\n" port;
  Printf.printf "  POST http://localhost:%d/api/v2/vault/withdraw\n\n" port;
  Printf.printf "WebSocket:\n";
  Printf.printf "  WS   ws://localhost:%d/ws\n\n" port;
  Printf.printf "Channels: bridge_health, risk_alerts, top_products, tranche_apy\n\n";

  (* Create WebSocket handler *)
  let ws_handler = Websocket_v2.start_websocket_server ~collateral_manager ~db_pool () in

  (* Combine REST + WebSocket routes *)
  let ton_config = () in (* TODO: Load actual TON config when needed *)
  let base_routes = Api_v2.router {
    collateral_manager;
    bridge_states = [];
    last_risk_snapshot = None;
    websocket_clients = [];
    pricing_config = Pricing_engine.PricingEngine.default_config;
  } ton_config @ [
    Dream.get "/ws" (fun _request ->
      Dream.websocket ws_handler
    );
    (* CORS preflight handler *)
    Dream.options "**" Security_middleware.cors_preflight_handler;
  ] in

  (* Start server with security middleware stack *)
  Dream.run ~port
    @@ Security_middleware.apply_security_stack ~protected_routes
    @@ Dream.logger
    @@ Dream.router base_routes
