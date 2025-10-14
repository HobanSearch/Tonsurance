# Monorepo Consolidation Plan

## Current Problem

The repository is fragmented between two locations:

### Root Directory (`/Tonsurance/`)
- **OCaml Backend**: `lib/` (oracle_aggregator, bridge_monitor, pricing, risk, escrow)
- **OCaml API**: `lib/api/ocaml_price_api.ml` (NEW - just created)
- **Contracts**: `contracts/` (OLD - legacy)
- **Documentation**: `docs/`, `README.md`, `DEPLOYMENT.md`
- **Infrastructure**: `docker-compose.production.yml`, `monitoring/`

### Nested Directory (`/Tonsurance/Tonsurance/`)
- **TON Smart Contracts**: `contracts/` (Blueprint project - FunC)
- **TypeScript Wrappers**: `wrappers/` (PolicyFactory, PricingOracle, etc.)
- **TypeScript Services**: `services/` (PricingOracleKeeper, BridgeHealthKeeper - NEW)
- **TypeScript API**: `api/` (hedging-api.ts, hedging-websocket.ts)
- **React Frontend**: `frontend/` (NEW - multi-chain UI)
- **Blueprint Config**: `package.json`, `blueprint.config.ts`, `jest.config.js`
- **Documentation**: `CLAUDE.md`, `PRD.md`, `TECHNICAL_SPEC.md`, etc.

## Issues

1. **Duplicated Contracts**: Root has old contracts, nested has Blueprint contracts
2. **Fragmented Services**: OCaml in root, TypeScript in nested
3. **Duplicated Docs**: README, .env.example, build docs in both places
4. **Confusing Paths**: Import paths jump between root and nested
5. **Build System Split**: OCaml dune in root, Blueprint npm in nested
6. **Docker Confusion**: docker-compose references both locations

## Proposed Structure

```
/Tonsurance/                              (Root - Monorepo)
├── backend/                              (OCaml Backend)
│   ├── lib/
│   │   ├── types/
│   │   ├── integration/                  (oracle_aggregator, bridge_monitor)
│   │   ├── pricing/
│   │   ├── risk/
│   │   ├── escrow/
│   │   └── api/                          (ocaml_price_api.ml)
│   ├── dune-project
│   ├── Makefile
│   └── README.md
│
├── contracts/                            (TON Smart Contracts - Blueprint)
│   ├── core/                             (PolicyFactory, PremiumCalculator)
│   ├── hedged/                           (HedgedPolicyFactory, PricingOracle)
│   ├── shared/                           (Vaults, ClaimsEngine)
│   └── imports/                          (stdlib.fc)
│
├── wrappers/                             (TypeScript Contract Wrappers)
│   ├── PolicyFactory.ts
│   ├── PricingOracle.ts
│   ├── *.compile.ts
│   └── README.md
│
├── services/                             (TypeScript Keeper Services)
│   ├── PricingOracleKeeper.ts
│   ├── BridgeHealthKeeper.ts
│   ├── hedging-api.ts
│   ├── hedging-websocket.ts
│   ├── package.json                      (services-specific deps)
│   └── README.md
│
├── frontend/                             (React + Vite Frontend)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChainSelector.tsx
│   │   │   ├── BridgeHealthIndicator.tsx
│   │   │   └── terminal/
│   │   ├── pages/
│   │   │   ├── MultiChainInsurance.tsx
│   │   │   ├── EnterpriseBulk.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
│
├── tests/                                (All Tests)
│   ├── contracts/                        (TON contract tests - Jest)
│   ├── services/                         (Keeper service tests)
│   ├── backend/                          (OCaml backend tests)
│   └── e2e/                              (End-to-end tests)
│
├── scripts/                              (Deployment & Utility Scripts)
│   ├── deployPricingOracle.ts
│   ├── deployPolicyFactory.ts
│   ├── init-db.sql
│   └── start-keepers.sh
│
├── infra/                                (Infrastructure)
│   ├── docker/
│   │   ├── Dockerfile.ocaml
│   │   ├── Dockerfile.keeper
│   │   ├── Dockerfile.frontend
│   │   └── docker-compose.production.yml
│   ├── monitoring/
│   │   ├── prometheus.yml
│   │   └── grafana/
│   └── nginx/
│       └── nginx.conf
│
├── docs/                                 (Consolidated Documentation)
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── DESIGN_DECISIONS.md
│   ├── DEVELOPMENT_PLAN.md
│   ├── HEDGED_ARCHITECTURE.md
│   ├── PRD.md
│   ├── TECHNICAL_SPEC.md
│   └── TESTING_STRATEGY.md
│
├── .github/
│   └── workflows/
│       ├── backend-tests.yml
│       ├── contract-tests.yml
│       ├── frontend-tests.yml
│       └── deploy.yml
│
├── package.json                          (Root workspace config)
├── blueprint.config.ts                   (TON contract config)
├── jest.config.js                        (Test config)
├── tsconfig.json                         (TypeScript config)
├── dune-project                          (OCaml config)
├── Makefile                              (Build commands)
├── .env.example                          (Consolidated env vars)
├── .gitignore
├── CLAUDE.md                             (Consolidated AI instructions)
└── README.md                             (Main project README)
```

## Migration Steps

### Phase 1: Analyze & Backup

1. ✅ Document current structure (DONE)
2. Create backup branch: `git checkout -b pre-consolidation-backup`
3. Tag current state: `git tag v0.1-pre-consolidation`

### Phase 2: Backend Consolidation

1. Rename root `lib/` → `backend/`
2. Move `dune-project`, `Makefile` → `backend/`
3. Update all OCaml imports (types, modules)
4. Test OCaml build: `cd backend && dune build`

### Phase 3: Contracts & Wrappers

1. Move `Tonsurance/contracts/` → root `contracts/`
2. Move `Tonsurance/wrappers/` → root `wrappers/`
3. Move `Tonsurance/*.compile.ts` → `wrappers/`
4. Update `blueprint.config.ts` to point to new paths
5. Test contracts build: `npx blueprint build`

### Phase 4: Services Consolidation

1. Create root `services/` directory
2. Move `Tonsurance/services/*` → root `services/`
3. Move `Tonsurance/api/*` → root `services/`
4. Create `services/package.json` with dependencies
5. Update imports from `../wrappers/` to `../wrappers/`
6. Test services: `cd services && npm test`

### Phase 5: Frontend Migration

1. Move `Tonsurance/frontend/` → root `frontend/`
2. Update frontend imports (if any reference wrappers/services)
3. Test frontend build: `cd frontend && npm run build`

### Phase 6: Infrastructure

1. Create `infra/docker/` directory
2. Move docker files from root → `infra/docker/`
3. Move `monitoring/` → `infra/monitoring/`
4. Update docker-compose paths

### Phase 7: Documentation

1. Move `Tonsurance/docs/*.md` → root `docs/`
2. Move root `DEPLOYMENT.md` → `docs/`
3. Consolidate `Tonsurance/CLAUDE.md` + root `.claude/` → root `CLAUDE.md`
4. Update all internal doc links

### Phase 8: Tests

1. Move `Tonsurance/tests/` → root `tests/contracts/`
2. Move root `tests/` → root `tests/backend/`
3. Create `tests/services/`, `tests/e2e/`
4. Update jest.config.js paths

### Phase 9: Root Config

1. Create workspace `package.json`:
```json
{
  "name": "tonsurance-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "services",
    "frontend",
    "wrappers"
  ],
  "scripts": {
    "build": "npm run build:backend && npm run build:contracts && npm run build:services && npm run build:frontend",
    "build:backend": "cd backend && dune build",
    "build:contracts": "npx blueprint build",
    "build:services": "cd services && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:contracts && npm run test:services",
    "test:backend": "cd backend && dune test",
    "test:contracts": "npx blueprint test",
    "test:services": "cd services && npm test",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:services": "cd services && npm run dev"
  }
}
```

2. Update `blueprint.config.ts`:
```typescript
export const config: Config = {
    contracts: {
        targets: ['contracts/core/**/*.fc', 'contracts/hedged/**/*.fc', 'contracts/shared/**/*.fc']
    }
};
```

3. Update `tsconfig.json` with path aliases:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@contracts/*": ["contracts/*"],
      "@wrappers/*": ["wrappers/*"],
      "@services/*": ["services/*"],
      "@backend/*": ["backend/*"]
    }
  }
}
```

### Phase 10: Delete Old Structure

1. Delete `Tonsurance/` nested directory entirely
2. Update `.gitignore` to remove nested-specific entries
3. Commit changes

### Phase 11: Verification

1. Build all components:
```bash
npm run build
```

2. Run all tests:
```bash
npm test
```

3. Test docker build:
```bash
docker-compose -f infra/docker/docker-compose.production.yml build
```

4. Verify frontend dev server:
```bash
npm run dev:frontend
```

5. Verify keeper services:
```bash
cd services && node PricingOracleKeeper.ts
```

## Benefits After Consolidation

1. **Clear Separation**: Backend (OCaml), Contracts (FunC), Services (TS), Frontend (React)
2. **Single Source of Truth**: One README, one CLAUDE.md, one .env.example
3. **Simpler Imports**: No `../../Tonsurance/nested/path` confusion
4. **Better CI/CD**: Can test each component independently
5. **Workspace Management**: npm workspaces handle shared dependencies
6. **Docker Simplicity**: All paths relative from root
7. **Onboarding**: New developers see logical structure immediately

## Timeline

- Phase 1-2: 30 minutes (backup, backend)
- Phase 3-5: 1 hour (contracts, services, frontend)
- Phase 6-8: 30 minutes (infra, docs, tests)
- Phase 9-10: 30 minutes (root config, cleanup)
- Phase 11: 30 minutes (verification)

**Total: ~3 hours**

## Risks

1. **Breaking Imports**: Mitigated by thorough testing after each phase
2. **Docker Path Changes**: Mitigated by testing docker build before deletion
3. **Lost Git History**: Mitigated by backup branch and tag
4. **CI/CD Breakage**: Update GitHub Actions after consolidation

## Rollback Plan

If consolidation fails:
```bash
git checkout pre-consolidation-backup
git branch -D main  # if needed
git checkout -b main
```

The tag `v0.1-pre-consolidation` preserves the exact state before changes.
