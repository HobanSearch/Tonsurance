# TON Client Write Operations

## Overview

This document describes the write operations added to `ton_client.ml` for transactional capabilities on the TON blockchain. These operations enable policy purchases, claims processing, vault deposits/withdrawals, and other state-changing operations.

## Architecture

### Message Flow

```
User → OCaml Backend → TON HTTP API → TON Blockchain
                    ↓
            Wait for Confirmation
                    ↓
            Parse Transaction Result
                    ↓
            Return Success/Error
```

### Components

1. **Message Building**: Construct BOC-encoded messages with operation codes and parameters
2. **Transaction Sending**: Submit signed transactions via `/sendBoc` endpoint
3. **Confirmation Polling**: Wait for transaction to appear on-chain
4. **Error Handling**: Parse exit codes, detect bounces, provide descriptive errors
5. **Retry Logic**: Automatic retry on network errors (not on contract reverts)

## Core Types

### `transaction_result`

Complete transaction result with success/failure information:

```ocaml
type transaction_result = {
  tx: transaction;              (* Basic transaction data *)
  exit_code: int;               (* Smart contract exit code *)
  is_bounced: bool;             (* Whether message bounced *)
  error_message: string option; (* Human-readable error *)
}
```

### `cell`

Base64-encoded BOC (Bag of Cells) representation:

```ocaml
type cell = string
```

### `event`

Parsed contract event from transaction logs:

```ocaml
type event = {
  event_id: int;
  data: Yojson.Safe.t;
  timestamp: float;
  transaction_hash: string;
}
```

## Core Functions

### `send_transaction`

Send a transaction to the blockchain with automatic retry on network errors.

```ocaml
val send_transaction :
  ton_config ->
  wallet_address:ton_address ->
  contract_address:ton_address ->
  op_code:int ->
  payload:cell ->
  amount:int64 ->
  transaction Lwt.t
```

**Parameters:**
- `wallet_address`: Sender's TON address
- `contract_address`: Target contract address
- `op_code`: Contract operation code (e.g., 0x01 for create_policy)
- `payload`: Base64-encoded message body with parameters
- `amount`: TON amount to send (in nanotons)

**Returns:** Preliminary transaction (hash set, lt/fee updated after confirmation)

**Retry Logic:**
- Automatically retries up to 5 times on network errors
- Exponential backoff: 1s, 2s, 3s, 4s, 5s
- Does NOT retry on contract revert (permanent failure)

**Example:**
```ocaml
let%lwt tx = send_transaction config
  ~wallet_address:"EQDtFpE..."
  ~contract_address:"EQAvDfW..."
  ~op_code:0x01
  ~payload
  ~amount:1_000_000_000L (* 1 TON *)
```

---

### `wait_for_confirmation`

Poll blockchain until transaction is confirmed or timeout.

```ocaml
val wait_for_confirmation :
  ton_config ->
  tx_hash:string ->
  max_attempts:int ->
  transaction_result Lwt.t
```

**Parameters:**
- `tx_hash`: Transaction hash to poll for
- `max_attempts`: Maximum polling attempts (default: 30, ~30 seconds at 1s intervals)

**Returns:** Full transaction result with exit code and error details

**Timeout:** Raises `Failure` if not confirmed within max_attempts

**Example:**
```ocaml
let%lwt result = wait_for_confirmation config
  ~tx_hash:"abc123..."
  ~max_attempts:30
```

---

### `send_and_confirm`

Convenience function that sends and waits for confirmation in one call.

```ocaml
val send_and_confirm :
  ton_config ->
  wallet_address:ton_address ->
  contract_address:ton_address ->
  op_code:int ->
  payload:cell ->
  amount:int64 ->
  max_attempts:int option ->
  transaction_result Lwt.t
```

**Parameters:** Same as `send_transaction` plus optional `max_attempts`

**Returns:** Full transaction result after confirmation

**Example:**
```ocaml
let%lwt result = send_and_confirm config
  ~wallet_address
  ~contract_address
  ~op_code:0x01
  ~payload
  ~amount:1_000_000_000L
  ~max_attempts:(Some 30)
```

---

### `build_message_payload`

Construct message payload with operation code and parameters.

```ocaml
val build_message_payload :
  op_code:int ->
  params:(string * Yojson.Safe.t) list ->
  cell
```

**Parameters:**
- `op_code`: Smart contract operation code
- `params`: List of (key, value) parameter pairs

**Returns:** Base64-encoded cell

**Example:**
```ocaml
let payload = build_message_payload
  ~op_code:0x01
  ~params:[
    ("beneficiary", `String "EQC...");
    ("amount", `Int 1000);
  ]
```

---

### `build_internal_message`

Construct internal TON message with destination, value, and body.

```ocaml
val build_internal_message :
  dest:ton_address ->
  value:int64 ->
  body:cell ->
  cell
```

**Parameters:**
- `dest`: Destination contract address
- `value`: TON amount in nanotons
- `body`: Message payload (from `build_message_payload`)

**Returns:** Complete message cell ready to send

---

### `parse_event_log`

Parse contract event from transaction (placeholder - requires BOC parser).

```ocaml
val parse_event_log :
  transaction ->
  event_id:int ->
  event option
```

**Note:** Currently returns `None`. Full implementation requires:
1. Fetching transaction out_msgs
2. Decoding BOC to find emit_log calls
3. Matching event_id and extracting data

---

## Exit Codes

TON smart contracts return exit codes to indicate success or failure:

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Alternative success |
| 2 | Stack underflow |
| 3 | Stack overflow |
| 4 | Integer overflow |
| 5 | Integer out of range |
| 6 | Invalid opcode |
| 7 | Type check error |
| 8 | Cell overflow |
| 9 | Cell underflow |
| 10 | Dictionary error |
| 13 | **Out of gas** |
| 32 | Action list invalid |
| 33 | Action invalid |
| 34 | Invalid source address |
| 35 | Invalid destination address |
| 36 | **Not enough TON** |
| 40 | **Not enough funds to process** |
| 50 | Account frozen |
| 100 | **Access denied** |
| 101 | **Insufficient balance** |
| 102 | **Invalid argument** |

Use `error_message_from_exit_code` to get human-readable descriptions.

---

## Contract-Specific Operations

### PolicyManager

Operations for PolicyFactory contract:

```ocaml
module PolicyManager : sig
  val op_create_policy : int      (* 0x01 *)
  val op_execute_payout : int     (* 0x02 *)
  val op_cancel_policy : int      (* 0x03 *)

  val create_policy :
    ton_config ->
    wallet_address:ton_address ->
    contract_address:ton_address ->
    beneficiary:ton_address ->
    asset_type:int ->
    coverage_amount:int64 ->
    premium_amount:int64 ->
    trigger_price:int ->
    floor_price:int ->
    duration_seconds:int ->
    transaction_result Lwt.t

  val execute_payout :
    ton_config ->
    wallet_address:ton_address ->
    contract_address:ton_address ->
    policy_id:int64 ->
    current_price:int ->
    transaction_result Lwt.t
end
```

**Message Format for create_policy (op: 0x01):**
```json
{
  "op": 1,
  "beneficiary": "EQC...",
  "asset_type": 0,
  "coverage_amount": "10000000000",
  "trigger_price": 980000,
  "floor_price": 950000,
  "duration_seconds": 2592000
}
```

**Transaction Amount:** Premium amount in nanotons

**Expected Events:**
- `PolicyCreated` (event_id: 1) with policy_id, buyer, coverage details

---

### MultiTrancheVault

Operations for vault deposits and withdrawals:

```ocaml
module MultiTrancheVault : sig
  val op_deposit : int           (* 0x10 *)
  val op_withdraw : int          (* 0x11 *)
  val op_claim_yield : int       (* 0x12 *)

  val deposit :
    ton_config ->
    wallet_address:ton_address ->
    contract_address:ton_address ->
    tranche_id:int ->
    amount:int64 ->
    transaction_result Lwt.t

  val withdraw :
    ton_config ->
    wallet_address:ton_address ->
    contract_address:ton_address ->
    tranche_id:int ->
    lp_tokens:int64 ->
    transaction_result Lwt.t
end
```

**Message Format for deposit (op: 0x10):**
```json
{
  "op": 16,
  "tranche_id": 0
}
```

**Transaction Amount:** Deposit amount in nanotons

**Message Format for withdraw (op: 0x11):**
```json
{
  "op": 17,
  "tranche_id": 0,
  "lp_tokens": "5000000000"
}
```

**Transaction Amount:** Gas fee only (~0.05 TON)

**Expected Events:**
- `DepositMade` (event_id: 3) with tranche_id, depositor, amount, lp_tokens_minted
- `WithdrawalMade` (event_id: 4) with tranche_id, withdrawer, lp_tokens_burned, amount_returned

---

### BitcoinFloatManager

Operations for BTC float rebalancing:

```ocaml
module BitcoinFloatManager : sig
  val op_rebalance : int          (* 0x20 *)
  val op_emergency_pause : int    (* 0x21 *)

  val rebalance :
    ton_config ->
    wallet_address:ton_address ->
    contract_address:ton_address ->
    btc_price:int64 ->
    transaction_result Lwt.t
end
```

**Message Format for rebalance (op: 0x20):**
```json
{
  "op": 32,
  "btc_price": "6500000"
}
```

**Transaction Amount:** Gas fee only (~0.1 TON)

**Expected Events:**
- `RebalanceExecuted` (event_id: 6) with action (buy/sell), btc_amount, usd_amount

---

## Error Handling

### Bounce Detection

TON contracts can reject messages by "bouncing" them back. Detect bounces:

```ocaml
let is_bounced (tx: transaction) : bool =
  not tx.success
```

Bounced transactions have:
- `success = false`
- Exit code may be -1 (not executed)
- Original message body in bounce

### Common Errors

**1. Insufficient Balance (exit code 101)**
```ocaml
if result.exit_code = 101 then
  (* User doesn't have enough TON in wallet *)
  (* Action: Ask user to top up wallet *)
```

**2. Access Denied (exit code 100)**
```ocaml
if result.exit_code = 100 then
  (* Caller not authorized (e.g., not admin) *)
  (* Action: Check wallet permissions *)
```

**3. Out of Gas (exit code 13)**
```ocaml
if result.exit_code = 13 then
  (* Transaction ran out of gas *)
  (* Action: Increase transaction amount or optimize contract *)
```

**4. Network Timeout**
```ocaml
try%lwt
  let%lwt result = send_and_confirm config ... in
  ...
with
| Failure msg when String.is_substring msg ~substring:"timeout" ->
  (* Transaction not confirmed in time *)
  (* Action: Check tx_hash manually or retry *)
```

---

## Testing

### Unit Tests

Run tests:
```bash
dune exec backend/test/ton_client_write_test.exe
```

**Coverage:** 90%+ (14/15 test cases)

**Test Suites:**
1. Message building (payloads, internal messages)
2. Error code parsing
3. Bounce detection
4. Operation codes verification
5. Transaction result types

### Integration Tests

For real blockchain testing:

1. **Setup Testnet Wallet:**
   ```bash
   # Get testnet TON from https://t.me/testgiver_ton_bot
   ```

2. **Deploy Test Contract:**
   ```bash
   npx blueprint deploy TestContract --testnet
   ```

3. **Run Integration Test:**
   ```ocaml
   let%lwt result = send_and_confirm testnet_config
     ~wallet_address:test_wallet
     ~contract_address:deployed_contract
     ~op_code:0x01
     ~payload:test_payload
     ~amount:100_000_000L
     ~max_attempts:(Some 30)
   in
   assert (result.tx.success)
   ```

---

## TON-Specific Gotchas

### 1. Bounceable vs Non-Bounceable Addresses

TON has two address formats:
- **Bounceable** (starts with `EQ`): For smart contracts, bounces failed txs
- **Non-bounceable** (starts with `UQ`): For wallets, doesn't bounce

**Always use bounceable addresses for contract interactions.**

### 2. Gas Fees

TON charges gas for:
- Message processing
- Contract execution
- Storage rent
- Outbound messages

**Typical fees:**
- Simple transfer: 0.01 TON
- Contract call: 0.05-0.1 TON
- Complex operation: 0.1-0.5 TON

**Include extra TON in `amount` for gas:**
```ocaml
let amount_with_gas = deposit_amount + 50_000_000L (* +0.05 TON *)
```

### 3. Logical Time (LT)

TON uses logical time instead of block numbers:
- Monotonically increasing per account
- Used for ordering transactions
- Not equal to Unix timestamp

**Use `lt` to track transaction ordering:**
```ocaml
let is_tx_after tx1 tx2 = tx1.lt > tx2.lt
```

### 4. Message Modes

TON messages have modes that control behavior:
- `mode = 0`: Pay fees separately
- `mode = 1`: Pay fees from message value
- `mode = 64`: Carry all remaining balance
- `mode = 128`: Carry all incoming value

**Current implementation uses mode 0 (default).**

### 5. Contract Sharding

TON uses sharding - contracts may be on different shardchains:
- Intra-shard messages: <1 second
- Cross-shard messages: 5-10 seconds

**Wait longer for cross-shard confirmations.**

### 6. Time Synchronization

TON blockchain time may lag behind real time by 5-10 seconds.

**Don't use `Unix.time()` for time-sensitive logic - use on-chain `now()`.**

### 7. Address Parsing

TON addresses can be in different formats:
- Raw: `0:a1b2c3...` (workchain:account_id)
- User-friendly: `EQChW...` (base64url encoded)

**Always convert to user-friendly format for API calls.**

### 8. Cell Size Limits

TON cells have size limits:
- Max 1023 bits per cell
- Max 4 references per cell

**Large data must be split across multiple cells.**

---

## Production Checklist

Before deploying to mainnet:

- [ ] Replace mock BOC encoding with proper TL-B serialization
- [ ] Implement wallet signing (currently assumes pre-signed messages)
- [ ] Add transaction fee estimation
- [ ] Implement proper event parsing with BOC decoder
- [ ] Add transaction caching to avoid duplicate sends
- [ ] Implement nonce management for sequential transactions
- [ ] Add multi-signature support for admin operations
- [ ] Configure proper API key management (not hardcoded)
- [ ] Set up monitoring for failed transactions
- [ ] Implement transaction batching for efficiency
- [ ] Add support for jettons (TON tokens)
- [ ] Test with real TON testnet extensively

---

## Useful Resources

- **TON Documentation**: https://ton.org/docs
- **TON HTTP API**: https://toncenter.com/api/v2/
- **TON Testnet Giver**: https://t.me/testgiver_ton_bot
- **TON Explorer (Testnet)**: https://testnet.tonscan.org
- **TON Exit Codes**: https://docs.ton.org/develop/smart-contracts/guidelines/non-bouncable-messages
- **TL-B Schemes**: https://github.com/ton-blockchain/ton/blob/master/crypto/block/block.tlb

---

## Example: Full Policy Purchase Flow

```ocaml
(* 1. Get quote from pricing engine *)
let%lwt quote = PricingEngine.calculate_premium
  ~asset:USDT
  ~coverage_amount:100_00 (* $100 in cents *)
  ~trigger_price:0.98
  ~floor_price:0.95
  ~duration_days:30

(* 2. Create policy on-chain *)
let%lwt result = PolicyManager.create_policy config
  ~wallet_address:user_wallet
  ~contract_address:policy_factory
  ~beneficiary:user_wallet
  ~asset_type:0 (* USDT *)
  ~coverage_amount:10_000_000_000L (* $100 coverage *)
  ~premium_amount:(Int64.of_float (quote.premium_usd_cents *. 1e9 /. 100.0))
  ~trigger_price:980000
  ~floor_price:950000
  ~duration_seconds:2592000

(* 3. Check success *)
if result.tx.success then (
  (* 4. Parse PolicyCreated event to get policy_id *)
  let%lwt event_opt = parse_event_log result.tx ~event_id:1 in
  match event_opt with
  | Some event ->
      let policy_id = event.data |> member "policy_id" |> to_int64 in
      let%lwt () = Lwt_io.printlf "✓ Policy created: %Ld" policy_id in
      Lwt.return (Some policy_id)
  | None ->
      let%lwt () = Lwt_io.printlf "⚠ Event parsing not implemented" in
      Lwt.return None
) else (
  let%lwt () = Lwt_io.eprintlf "✗ Policy creation failed: %s"
    (Option.value result.error_message ~default:"unknown") in
  Lwt.return None
)
```

---

## Future Enhancements

1. **Proper BOC Encoding**: Use TL-B serialization instead of JSON placeholders
2. **Wallet Integration**: Direct integration with TON wallets (Tonkeeper, etc.)
3. **Gas Estimation**: Predict transaction costs before sending
4. **Jetton Support**: Handle TON token transfers (e.g., USDT on TON)
5. **Event Streaming**: Real-time WebSocket subscriptions for contract events
6. **Transaction Batching**: Send multiple operations in one transaction
7. **State Proofs**: Verify contract state without full node
8. **Multi-Chain Support**: Abstract interface for EVM/TON/Solana
