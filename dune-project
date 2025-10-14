(lang dune 3.10)
(name tonsurance)

(generate_opam_files true)

(source (github anthropic/tonsurance))
(license MIT)
(authors "Tonsurance Team")
(maintainers "dev@tonsurance.com")

(package
 (name tonsurance)
 (synopsis "Stablecoin insurance protocol on TON blockchain")
 (description "OCaml backend for Tonsurance - a decentralized insurance protocol for stablecoins with actuarial pricing, risk management, and Bitcoin float")
 (depends
  ;; Core
  (ocaml (>= 5.0))
  base
  core
  core_unix

  ;; Web Framework
  dream

  ;; Database
  caqti
  caqti-lwt
  caqti-driver-postgresql

  ;; Async/Concurrency
  lwt
  lwt_ppx
  lwt_ssl

  ;; JSON
  yojson
  ppx_yojson_conv

  ;; HTTP
  cohttp
  cohttp-lwt-unix

  ;; WebSocket
  websocket
  websocket-lwt-unix

  ;; Cryptography
  cryptokit
  digestif

  ;; Math/Stats
  owl
  lacaml
  gsl

  ;; Testing
  alcotest
  alcotest-lwt
  qcheck
  qcheck-alcotest

  ;; Logging
  logs
  logs-lwt
  fmt

  ;; Configuration
  ppx_deriving
  ppx_fields_conv
  ppx_compare
  ppx_sexp_conv

  ;; CLI
  cmdliner

  ;; Time
  ptime

  ;; Data Structures
  containers

  ;; Monitoring
  prometheus
 ))
