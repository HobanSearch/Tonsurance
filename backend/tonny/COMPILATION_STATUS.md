# Tonny Bot - Compilation Status

## Current Issue

The Tonny bot cannot compile due to **syntax errors in dependencies** across the backend codebase:

### Blocking Errors

1. **tonny/ollama_client.ml** - ✅ FIXED
   - Error: `done: bool;` - `done` is OCaml reserved keyword
   - Fix: Changed to `done_: bool; [@key "done"]`

2. **types/types.ml:480**
   - Error: `Unbound module "Caml_unix"`
   - Issue: Missing Core.Unix import

3. **pricing/tranche_pricing.ml:16**
   - Error: `'compare' is not a supported type deriving generator`
   - Issue: Missing ppx_compare preprocessor

4. **monitoring/unified_risk_monitor.ml:31**
   - Error: `'yojson' is not a supported type deriving generator`
   - Issue: Missing ppx_yojson_conv

5. **monitoring/oracle_monitoring.ml:453**
   - Error: `Syntax error at "end"`
   - Issue: Incomplete module definition

6. **db/escrow_db.ml:18**
   - Error: `Syntax error: ")" expected`
   - Issue: Unmatched parentheses in Caqti query

7. **pool library**
   - Error: Example modules depend on Pool module itself (circular dependency)
   - Fix Applied: Explicitly list modules in dune, exclude examples

## Attempted Solutions

### Approach 1: Fix All Dependencies (Current)
- Status: **In Progress**
- Blocking: Multiple syntax errors across 6+ modules
- Time estimate: 2-4 hours to fix all errors

### Approach 2: Create Minimal Standalone Build
- Status: **Not Started**
- Strategy: Remove backend service dependencies, use mock data
- Commands affected:
  - `/quote` - Would return fixed quotes instead of dynamic
  - `/bridges` - Would return cached bridge statuses
  - AI responses still work (Ollama only dependency)
- Time estimate: 30 minutes

### Approach 3: Fix Only Tonny Dependencies
- Status: **Partially Done**
- Already fixed: `ollama_client.ml`, `pool/dune`
- Still need: `types`, `pricing`, `monitoring`, `db` modules

## Recommended Path Forward

**Option A: Quick MVP (30 min)**
Create standalone Tonny bot:
- Remove `pool`, `monitoring`, `pricing_engine` dependencies
- Use mock/static data for quotes and bridge status
- Full AI chat functionality works
- Deploy to test Telegram integration immediately

**Option B: Full Integration (2-4 hours)**
Fix all syntax errors in dependencies:
1. Fix `types/types.ml` (Unix import)
2. Fix `pricing/tranche_pricing.ml` (add ppx_compare)
3. Fix `monitoring/unified_risk_monitor.ml` (ppx_yojson_conv)
4. Fix `monitoring/oracle_monitoring.ml` (incomplete module)
5. Fix `db/escrow_db.ml` (SQL syntax)
6. Recompile full stack

## Files Modified So Far

1. ✅ `/backend/tonny/tonny_bot.ml` - Complete implementation (68 → 226 lines)
2. ✅ `/backend/tonny/dune` - Updated library dependencies
3. ✅ `/backend/tonny/commands/dune` - Created command module library
4. ✅ `/backend/tonny/.env.example` - Added webhook config
5. ✅ `/backend/tonny/INTEGRATION.md` - 400+ line documentation
6. ✅ `/backend/tonny/ollama_client.ml` - Fixed `done` keyword syntax error
7. ✅ `/backend/pool/dune` - Excluded example modules

## Next Steps

**User Decision Required:**
1. Should we proceed with **Option A** (quick MVP, mock data) to test Telegram integration ASAP?
2. Or invest time in **Option B** (fix all dependencies) for full dynamic pricing?

Current recommendation: **Option A** first to verify bot/Telegram integration works, then fix backend dependencies separately.
