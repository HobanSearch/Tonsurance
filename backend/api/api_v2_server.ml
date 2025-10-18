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
open Config

let () =
  (* Initialize and validate configuration *)
  Lwt_main.run (
    let* () = ConfigManager.initialize () in
    let* () = ConfigManager.load_all_config () in
    let* validation_result = ConfigManager.validate_config () in
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
  Lwt_main.run (
    let* redis_host = ConfigManager.Pools.get_redis_host () in
    let* redis_port = ConfigManager.Pools.get_redis_port () in
    Logs_lwt.info (fun m -> m "Initializing rate limiter with Redis at %s:%d" redis_host redis_port) >>= fun () ->
    Rate_limiter.init ~redis_host ~redis_port ()
  );

  (* Create collateral manager *)
  let pool = Collateral_manager.CollateralManager.create_unified_pool () in
  let collateral_manager = ref (Collateral_manager.CollateralManager.create pool) in

  (* Define protected routes (require API key authentication) *)
  let protected_routes = [
    ("/api/v2/policies", ["POST"]);           (* Buy policy *)
    ("/api/v2/claims", ["POST"]);             (* File claim *)
    ("/api/v2/vault/deposit", ["POST"]);      (* Deposit to vault *)
    ("/api/v2/vault/withdraw", ["POST"]);     (* Withdraw from vault *)
    ("/api/v2/admin/*", ["GET"; "POST"; "PUT"; "DELETE"]);  (* Admin endpoints *)
  ] in

  (* Start combined server *)
  Lwt_main.run (
    let* () = Lwt_io.printlf "\n╔════════════════════════════════════════╗" in
    let* () = Lwt_io.printlf "║  Tonsurance API v2 + WebSocket         ║" in
    let* () = Lwt_io.printlf "║  🔒 Security: ENABLED                   ║" in
    let* () = Lwt_io.printlf "╚════════════════════════════════════════╝\n" in
    let* () = Lwt_io.printlf "Port: %d\n" port in
    let* () = Lwt_io.printlf "Base URL: http://localhost:%d\n" port in
    let* () = Lwt_io.printlf "\nSecurity Features:" in
    let* () = Lwt_io.printlf "  ✓ Rate Limiting: 100/min per IP, 500/min per API key" in
    let* () = Lwt_io.printlf "  ✓ CORS: Enabled with origin allowlist" in
    let* () = Lwt_io.printlf "  ✓ Authentication: Bearer token (write ops only)" in
    let* () = Lwt_io.printlf "  ✓ Request Size Limit: 10MB" in
    let* () = Lwt_io.printlf "  ✓ Logging: Comprehensive request logging\n" in
    let* () = Lwt_io.printlf "REST Endpoints (Public - No Auth Required):" in
    let* () = Lwt_io.printlf "  POST http://localhost:%d/api/v2/quote/multi-dimensional" port in
    let* () = Lwt_io.printlf "  GET  http://localhost:%d/api/v2/risk/exposure" port in
    let* () = Lwt_io.printlf "  GET  http://localhost:%d/api/v2/bridge-health/:bridge_id" port in
    let* () = Lwt_io.printlf "  GET  http://localhost:%d/api/v2/risk/alerts" port in
    let* () = Lwt_io.printlf "  GET  http://localhost:%d/api/v2/tranches/apy\n" port in
    let* () = Lwt_io.printlf "REST Endpoints (Protected - Requires API Key):" in
    let* () = Lwt_io.printlf "  POST http://localhost:%d/api/v2/policies (Buy Policy)" port in
    let* () = Lwt_io.printlf "  POST http://localhost:%d/api/v2/claims (File Claim)" port in
    let* () = Lwt_io.printlf "  POST http://localhost:%d/api/v2/vault/deposit" port in
    let* () = Lwt_io.printlf "  POST http://localhost:%d/api/v2/vault/withdraw\n" port in
    let* () = Lwt_io.printlf "WebSocket:" in
    let* () = Lwt_io.printlf "  WS   ws://localhost:%d/ws\n" port in
    let* () = Lwt_io.printlf "Channels: bridge_health, risk_alerts, top_products, tranche_apy\n" in

    (* Create WebSocket handler *)
    let ws_handler = Websocket_v2.start_websocket_server ~collateral_manager () in

    (* Combine REST + WebSocket routes *)
    let base_routes = Api_v2.router {
      collateral_manager;
      bridge_states = [];
      last_risk_snapshot = None;
      websocket_clients = [];
      pricing_config = Pricing_engine.PricingEngine.default_config;
    } @ [
      Dream.get "/ws" (fun request ->
        Dream.websocket ws_handler request
      );
      (* CORS preflight handler *)
      Dream.options "**" Security_middleware.cors_preflight_handler;
    ] in

    (* Apply security middleware stack *)
    Dream.run ~port
      @@ Security_middleware.apply_security_stack ~protected_routes
      @@ Dream.logger
      @@ Dream.router base_routes
  )
