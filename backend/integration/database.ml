(* Database Layer - PostgreSQL + TimescaleDB Integration

   Provides type-safe database access using Caqti.

   Schema Design:
   - policies: Insurance policy records
   - vaults: Vault state and capital
   - tranches: Individual tranche data
   - price_history: Time-series price data (TimescaleDB hypertable)
   - transactions: All financial transactions
   - users: User accounts and profiles
   - claims: Insurance claim records
   - risk_assessments: Historical risk calculations

   Features:
   - Type-safe queries (Caqti)
   - Connection pooling
   - Prepared statements
   - Transaction support
   - TimescaleDB for time-series
   - Migrations
*)

open Core
open Lwt.Syntax
open Types

module Database = struct

  (** Database configuration **)
  type db_config = {
    host: string;
    port: int;
    database: string;
    user: string;
    password: string;
    pool_size: int;
  } [@@deriving sexp]

  let default_config = {
    host = "localhost";
    port = 5432;
    database = "tonsurance";
    user = "postgres";
    password = "";
    pool_size = 10;
  }

  (** Connection URI **)
  let connection_uri (config: db_config) : string =
    Printf.sprintf "postgresql://%s:%s@%s:%d/%s"
      config.user
      config.password
      config.host
      config.port
      config.database

  module type CONNECTION = Caqti_lwt.CONNECTION

  (** Policy database record **)
  type policy_record = {
    policy_id: int64;
    buyer_address: string;
    beneficiary_address: string;
    asset: string;
    coverage_amount_cents: int64;
    premium_amount_cents: int64;
    trigger_price: float;
    floor_price: float;
    start_time: float;
    expiry_time: float;
    status: string;
    created_at: float;
    updated_at: float;
  } [@@deriving sexp, yojson]

  (** Price history record **)
  type price_record = {
    asset: string;
    price: float;
    volume_24h: float option;
    market_cap: float option;
    source: string;
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** Transaction record **)
  type transaction_record = {
    tx_id: int64;
    tx_type: string; (* "premium", "payout", "deposit", "withdrawal" *)
    policy_id: int64 option;
    from_address: string;
    to_address: string;
    amount_cents: int64;
    tx_hash: string option; (* Blockchain tx hash *)
    status: string;
    created_at: float;
  } [@@deriving sexp, yojson]

  (** Schema creation queries **)
  module Schema = struct

    let create_policies_table = {|
      CREATE TABLE IF NOT EXISTS policies (
        policy_id BIGSERIAL PRIMARY KEY,
        buyer_address TEXT NOT NULL,
        beneficiary_address TEXT NOT NULL,
        asset TEXT NOT NULL,
        coverage_amount_cents BIGINT NOT NULL,
        premium_amount_cents BIGINT NOT NULL,
        trigger_price DOUBLE PRECISION NOT NULL,
        floor_price DOUBLE PRECISION NOT NULL,
        start_time TIMESTAMP NOT NULL,
        expiry_time TIMESTAMP NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_policies_buyer ON policies(buyer_address);
      CREATE INDEX IF NOT EXISTS idx_policies_beneficiary ON policies(beneficiary_address);
      CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
      CREATE INDEX IF NOT EXISTS idx_policies_expiry ON policies(expiry_time);
    |}

    let create_price_history_table = {|
      CREATE TABLE IF NOT EXISTS price_history (
        id BIGSERIAL,
        asset TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        volume_24h DOUBLE PRECISION,
        market_cap DOUBLE PRECISION,
        source TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL
      );

      -- Convert to hypertable (TimescaleDB)
      SELECT create_hypertable('price_history', 'timestamp',
        if_not_exists => TRUE,
        chunk_time_interval => INTERVAL '1 day'
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_asset_time
        ON price_history(asset, timestamp DESC);
    |}

    let create_vaults_table = {|
      CREATE TABLE IF NOT EXISTS vaults (
        vault_id BIGSERIAL PRIMARY KEY,
        vault_name TEXT UNIQUE NOT NULL,
        vault_type TEXT NOT NULL,
        total_capital_cents BIGINT NOT NULL,
        total_coverage_sold_cents BIGINT NOT NULL,
        btc_float_sats BIGINT NOT NULL,
        btc_cost_basis_cents BIGINT NOT NULL,
        usd_reserves_cents BIGINT NOT NULL,
        target_return_bps INT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_vaults_status ON vaults(status);
    |}

    let create_tranches_table = {|
      CREATE TABLE IF NOT EXISTS tranches (
        tranche_id BIGSERIAL PRIMARY KEY,
        vault_id BIGINT NOT NULL REFERENCES vaults(vault_id),
        tranche_number INT NOT NULL,
        tranche_name TEXT NOT NULL,
        target_yield_bps INT NOT NULL,
        total_deposits_cents BIGINT NOT NULL,
        total_lp_tokens NUMERIC(30, 0) NOT NULL,
        accumulated_losses_cents BIGINT NOT NULL,
        accumulated_yields_cents BIGINT NOT NULL,
        last_yield_update TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(vault_id, tranche_number)
      );

      CREATE INDEX IF NOT EXISTS idx_tranches_vault ON tranches(vault_id);
    |}

    let create_transactions_table = {|
      CREATE TABLE IF NOT EXISTS transactions (
        tx_id BIGSERIAL PRIMARY KEY,
        tx_type TEXT NOT NULL,
        policy_id BIGINT REFERENCES policies(policy_id),
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount_cents BIGINT NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_policy ON transactions(policy_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
      CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address);
      CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
    |}

    let create_users_table = {|
      CREATE TABLE IF NOT EXISTS users (
        user_id BIGSERIAL PRIMARY KEY,
        wallet_address TEXT UNIQUE NOT NULL,
        telegram_id BIGINT,
        email TEXT,
        kyc_status TEXT NOT NULL DEFAULT 'pending',
        total_coverage_purchased_cents BIGINT DEFAULT 0,
        total_premiums_paid_cents BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
    |}

    let create_claims_table = {|
      CREATE TABLE IF NOT EXISTS claims (
        claim_id BIGSERIAL PRIMARY KEY,
        policy_id BIGINT NOT NULL REFERENCES policies(policy_id),
        trigger_price_observed DOUBLE PRECISION NOT NULL,
        trigger_detected_at TIMESTAMP NOT NULL,
        confirmation_period_end TIMESTAMP NOT NULL,
        payout_amount_cents BIGINT NOT NULL,
        payout_status TEXT NOT NULL,
        payout_tx_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_claims_policy ON claims(policy_id);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(payout_status);
    |}

    let all_tables = [
      create_policies_table;
      create_price_history_table;
      create_vaults_table;
      create_tranches_table;
      create_transactions_table;
      create_users_table;
      create_claims_table;
    ]

  end

  (** Initialize database schema **)
  let initialize_schema (module Db : CONNECTION) : unit Lwt.t =
    let%lwt () =
      Lwt_list.iter_s
        (fun query ->
          let%lwt _ = Db.exec (Caqti_request.exec Caqti_type.unit query) () in
          Lwt.return ()
        )
        Schema.all_tables
    in
    Lwt.return ()

  (** Policy Queries **)
  module PolicyQueries = struct

    let insert_policy =
      Caqti_request.exec
        Caqti_type.(tup3 string string
          (tup4 string int64 int64
            (tup4 float float float float)))
        {|
          INSERT INTO policies (
            buyer_address, beneficiary_address, asset,
            coverage_amount_cents, premium_amount_cents,
            trigger_price, floor_price,
            start_time, expiry_time, status
          ) VALUES (
            $1, $2, $3,
            $4, $5,
            $6, $7,
            to_timestamp($8), to_timestamp($9), 'active'
          )
        |}

    let get_policy_by_id =
      Caqti_request.find
        Caqti_type.int64
        Caqti_type.(tup3 int64 string
          (tup3 string string
            (tup3 int64 int64
              (tup3 float float string))))
        {|
          SELECT
            policy_id, buyer_address, beneficiary_address,
            asset, coverage_amount_cents, premium_amount_cents,
            trigger_price, floor_price, status
          FROM policies
          WHERE policy_id = $1
        |}

    let get_active_policies =
      Caqti_request.collect
        Caqti_type.unit
        Caqti_type.(tup3 int64 string
          (tup3 string int64 float))
        {|
          SELECT
            policy_id, asset, beneficiary_address,
            coverage_amount_cents, trigger_price
          FROM policies
          WHERE status = 'active'
            AND expiry_time > NOW()
          ORDER BY policy_id
        |}

    let update_policy_status =
      Caqti_request.exec
        Caqti_type.(tup2 string int64)
        {|
          UPDATE policies
          SET status = $1, updated_at = NOW()
          WHERE policy_id = $2
        |}

    let get_policies_by_user =
      Caqti_request.collect
        Caqti_type.string
        Caqti_type.(tup3 int64 string
          (tup3 int64 float string))
        {|
          SELECT
            policy_id, asset, coverage_amount_cents,
            trigger_price, status
          FROM policies
          WHERE buyer_address = $1
          ORDER BY created_at DESC
        |}

  end

  (** Price History Queries **)
  module PriceQueries = struct

    let insert_price =
      Caqti_request.exec
        Caqti_type.(tup3 string float
          (tup2 string float))
        {|
          INSERT INTO price_history (
            asset, price, source, timestamp
          ) VALUES (
            $1, $2, $3, to_timestamp($4)
          )
        |}

    let get_latest_price =
      Caqti_request.find
        Caqti_type.string
        Caqti_type.(tup2 float float)
        {|
          SELECT price, EXTRACT(EPOCH FROM timestamp)
          FROM price_history
          WHERE asset = $1
          ORDER BY timestamp DESC
          LIMIT 1
        |}

    let get_price_history =
      Caqti_request.collect
        Caqti_type.(tup3 string float float)
        Caqti_type.(tup2 float float)
        {|
          SELECT price, EXTRACT(EPOCH FROM timestamp)
          FROM price_history
          WHERE asset = $1
            AND timestamp >= to_timestamp($2)
            AND timestamp <= to_timestamp($3)
          ORDER BY timestamp ASC
        |}

    let get_twap =
      Caqti_request.find
        Caqti_type.(tup2 string float)
        Caqti_type.float
        {|
          SELECT AVG(price)
          FROM price_history
          WHERE asset = $1
            AND timestamp >= NOW() - INTERVAL '1 second' * $2
        |}

    let check_sustained_depeg =
      Caqti_request.find
        Caqti_type.(tup3 string float float)
        Caqti_type.bool
        {|
          SELECT BOOL_AND(price < $2)
          FROM price_history
          WHERE asset = $1
            AND timestamp >= NOW() - INTERVAL '1 second' * $3
        |}

  end

  (** Transaction Queries **)
  module TransactionQueries = struct

    let insert_transaction =
      Caqti_request.exec
        Caqti_type.(tup4 string (option int64)
          (tup3 string string int64))
        {|
          INSERT INTO transactions (
            tx_type, policy_id, from_address,
            to_address, amount_cents, status
          ) VALUES (
            $1, $2, $3,
            $4, $5, 'pending'
          )
        |}

    let update_transaction_status =
      Caqti_request.exec
        Caqti_type.(tup3 string (option string) int64)
        {|
          UPDATE transactions
          SET status = $1, tx_hash = $2
          WHERE tx_id = $3
        |}

    let get_user_transactions =
      Caqti_request.collect
        Caqti_type.string
        Caqti_type.(tup4 int64 string
          (tup3 int64 string float))
        {|
          SELECT
            tx_id, tx_type, amount_cents,
            status, EXTRACT(EPOCH FROM created_at)
          FROM transactions
          WHERE from_address = $1 OR to_address = $1
          ORDER BY created_at DESC
          LIMIT 100
        |}

  end

  (** Vault Queries **)
  module VaultQueries = struct

    let insert_vault =
      Caqti_request.exec
        Caqti_type.(tup3 string string int)
        {|
          INSERT INTO vaults (
            vault_name, vault_type, target_return_bps,
            total_capital_cents, total_coverage_sold_cents,
            btc_float_sats, btc_cost_basis_cents,
            usd_reserves_cents, status
          ) VALUES (
            $1, $2, $3,
            0, 0, 0, 0, 0, 'active'
          )
        |}

    let get_vault_state =
      Caqti_request.find
        Caqti_type.string
        Caqti_type.(tup4 int64 int64
          (tup3 int64 int64 int64))
        {|
          SELECT
            total_capital_cents, total_coverage_sold_cents,
            btc_float_sats, btc_cost_basis_cents,
            usd_reserves_cents
          FROM vaults
          WHERE vault_name = $1
        |}

    let update_vault_capital =
      Caqti_request.exec
        Caqti_type.(tup2 int64 string)
        {|
          UPDATE vaults
          SET total_capital_cents = $1, updated_at = NOW()
          WHERE vault_name = $2
        |}

  end

  (** Connection pool management **)
  let create_pool (config: db_config) : (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result =
    let uri = Uri.of_string (connection_uri config) in
    Caqti_lwt.connect_pool ~max_size:config.pool_size uri

  (** Execute query with connection pool **)
  let with_connection
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      (f: (module CONNECTION) -> 'a Lwt.t)
    : ('a, [> Caqti_error.t]) result Lwt.t =

    match pool with
    | Error e -> Lwt.return (Error e)
    | Ok pool ->
        Caqti_lwt.Pool.use f pool

  (** Helper: Insert policy **)
  let insert_policy
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(buyer: string)
      ~(beneficiary: string)
      ~(asset: string)
      ~(coverage: int64)
      ~(premium: int64)
      ~(trigger: float)
      ~(floor: float)
      ~(start_time: float)
      ~(expiry_time: float)
    : (unit, [> Caqti_error.t]) result Lwt.t =

    with_connection pool (fun (module Db : CONNECTION) ->
      Db.exec PolicyQueries.insert_policy
        (buyer, beneficiary, (asset, coverage, premium,
          (trigger, floor, start_time, expiry_time)))
    )

  (** Helper: Get active policies **)
  let get_active_policies
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
    : ((int64 * string * (string * int64 * float)) list, [> Caqti_error.t]) result Lwt.t =

    with_connection pool (fun (module Db : CONNECTION) ->
      Db.collect_list PolicyQueries.get_active_policies ()
    )

  (** Helper: Insert price **)
  let insert_price
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(asset: string)
      ~(price: float)
      ~(source: string)
      ~(timestamp: float)
    : (unit, [> Caqti_error.t]) result Lwt.t =

    with_connection pool (fun (module Db : CONNECTION) ->
      Db.exec PriceQueries.insert_price (asset, price, (source, timestamp))
    )

  (** Helper: Check sustained depeg **)
  let check_sustained_depeg
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(asset: string)
      ~(trigger_price: float)
      ~(duration_seconds: float)
    : (bool, [> Caqti_error.t]) result Lwt.t =

    with_connection pool (fun (module Db : CONNECTION) ->
      Db.find PriceQueries.check_sustained_depeg
        (asset, trigger_price, duration_seconds)
    )

end
