#!/bin/bash

# Deployment Readiness Verification Script
# Checks all prerequisites before deploying to server

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Tonsurance Deployment Readiness Check${NC}\n"

ERRORS=0
WARNINGS=0

# ============================================================
# 1. CHECK CONTRACT COMPILATION
# ============================================================

echo -e "${YELLOW}1. Checking contract compilation...${NC}"

if [ -f "contracts/v3/children/NatCatChild.fc" ]; then
    echo -e "  ${GREEN}✓${NC} NatCatChild.fc exists"
else
    echo -e "  ${RED}✗${NC} NatCatChild.fc not found"
    ERRORS=$((ERRORS + 1))
fi

# Test compilation
echo "  Testing NatCatChild compilation..."
if npx ts-node test-natcat-compile.ts > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} NatCatChild compiles successfully"
else
    echo -e "  ${RED}✗${NC} NatCatChild compilation failed"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================
# 2. CHECK TYPESCRIPT WRAPPER
# ============================================================

echo -e "\n${YELLOW}2. Checking TypeScript wrapper...${NC}"

if grep -q "durationHours" wrappers/v3/NatCatChild.ts; then
    echo -e "  ${GREEN}✓${NC} Wrapper uses durationHours (hours-based)"
else
    echo -e "  ${RED}✗${NC} Wrapper still uses durationDays"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================
# 3. CHECK TESTS
# ============================================================

echo -e "\n${YELLOW}3. Checking test suite...${NC}"

if grep -q "durationHours: 720" tests/v3/NatCatChild.spec.ts; then
    echo -e "  ${GREEN}✓${NC} Tests updated to use hours (720 = 30 days)"
else
    echo -e "  ${RED}✗${NC} Tests not updated"
    ERRORS=$((ERRORS + 1))
fi

echo "  Running NatCatChild tests..."
if yarn test tests/v3/NatCatChild.spec.ts --silent > /tmp/test-results.txt 2>&1; then
    PASSED=$(grep -c "✓" /tmp/test-results.txt || true)
    echo -e "  ${GREEN}✓${NC} All tests passed ($PASSED tests)"
else
    echo -e "  ${RED}✗${NC} Tests failed"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================
# 4. CHECK FRONTEND CONFIGURATION
# ============================================================

echo -e "\n${YELLOW}4. Checking frontend configuration...${NC}"

# Check .env files exist
if [ -f "frontend/.env" ]; then
    echo -e "  ${GREEN}✓${NC} frontend/.env exists"
else
    echo -e "  ${RED}✗${NC} frontend/.env not found"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "frontend/.env.local" ]; then
    echo -e "  ${GREEN}✓${NC} frontend/.env.local exists (for local testing)"
else
    echo -e "  ${YELLOW}⚠${NC}  frontend/.env.local not found (recommended for local dev)"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -f "frontend/.env.production" ]; then
    echo -e "  ${GREEN}✓${NC} frontend/.env.production exists"
else
    echo -e "  ${RED}✗${NC} frontend/.env.production not found"
    ERRORS=$((ERRORS + 1))
fi

# Check TON API key
if grep -q "VITE_TON_API_KEY=aef46a8a66231331827251c34f07413ca1c66d8305b216661ed8e784f5077d65" frontend/.env; then
    echo -e "  ${GREEN}✓${NC} TON API key configured"
else
    echo -e "  ${RED}✗${NC} TON API key not configured"
    ERRORS=$((ERRORS + 1))
fi

# Check App.tsx uses env variable
if grep -q "import.meta.env.VITE_TON_CONNECT_MANIFEST_URL" frontend/src/App.tsx; then
    echo -e "  ${GREEN}✓${NC} App.tsx uses environment variable for manifest"
else
    echo -e "  ${RED}✗${NC} App.tsx hardcodes manifest URL"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================
# 5. CHECK TONCONNECT MANIFEST
# ============================================================

echo -e "\n${YELLOW}5. Checking TonConnect manifest...${NC}"

# Check local manifest
if [ -f "frontend/public/tonconnect-manifest.json" ]; then
    if grep -q '"url": "http://localhost:5174"' frontend/public/tonconnect-manifest.json; then
        echo -e "  ${GREEN}✓${NC} Local manifest configured (localhost)"
    else
        echo -e "  ${YELLOW}⚠${NC}  Manifest URL not set to localhost (may not work locally)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "  ${RED}✗${NC} tonconnect-manifest.json not found"
    ERRORS=$((ERRORS + 1))
fi

# Check production manifest
if [ -f "frontend/public/tonconnect-manifest.production.json" ]; then
    if grep -q '"url": "https://tonsurance.com"' frontend/public/tonconnect-manifest.production.json; then
        echo -e "  ${GREEN}✓${NC} Production manifest configured (tonsurance.com)"
    else
        echo -e "  ${RED}✗${NC} Production manifest URL incorrect"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${RED}✗${NC} tonconnect-manifest.production.json not found"
    ERRORS=$((ERRORS + 1))
fi

# Test manifest is served
echo "  Testing manifest endpoint..."
if curl -s http://localhost:5174/tonconnect-manifest.json | grep -q '"url"'; then
    echo -e "  ${GREEN}✓${NC} Manifest is served by dev server"
else
    echo -e "  ${YELLOW}⚠${NC}  Manifest endpoint not responding (is dev server running?)"
    WARNINGS=$((WARNINGS + 1))
fi

# ============================================================
# 6. CHECK FRONTEND BUILD
# ============================================================

echo -e "\n${YELLOW}6. Checking frontend build...${NC}"

cd frontend
if [ -d "node_modules" ]; then
    echo -e "  ${GREEN}✓${NC} node_modules exists"
else
    echo -e "  ${YELLOW}⚠${NC}  node_modules not found (run npm install)"
    WARNINGS=$((WARNINGS + 1))
fi

# Check if we can build
echo "  Testing production build..."
if npm run build > /tmp/build-output.txt 2>&1; then
    echo -e "  ${GREEN}✓${NC} Production build succeeds"

    # Check build artifacts
    if [ -f "dist/index.html" ]; then
        echo -e "  ${GREEN}✓${NC} dist/index.html created"
    else
        echo -e "  ${RED}✗${NC} dist/index.html not found after build"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${RED}✗${NC} Production build failed"
    echo "    Check /tmp/build-output.txt for details"
    ERRORS=$((ERRORS + 1))
fi
cd ..

# ============================================================
# 7. CHECK DEPLOYMENT SCRIPTS
# ============================================================

echo -e "\n${YELLOW}7. Checking deployment scripts...${NC}"

if [ -f "deploy-frontend-safe.sh" ]; then
    echo -e "  ${GREEN}✓${NC} deploy-frontend-safe.sh exists"

    if [ -x "deploy-frontend-safe.sh" ]; then
        echo -e "  ${GREEN}✓${NC} deploy-frontend-safe.sh is executable"
    else
        echo -e "  ${YELLOW}⚠${NC}  deploy-frontend-safe.sh not executable (run chmod +x)"
        WARNINGS=$((WARNINGS + 1))
    fi

    # Check script excludes backend
    if grep -q "backend/" deploy-frontend-safe.sh; then
        echo -e "  ${GREEN}✓${NC} Script excludes backend (preserves server version)"
    else
        echo -e "  ${RED}✗${NC} Script doesn't exclude backend"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${RED}✗${NC} deploy-frontend-safe.sh not found"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "scripts/v3/deployHackathonDemo.ts" ]; then
    echo -e "  ${GREEN}✓${NC} deployHackathonDemo.ts exists"
else
    echo -e "  ${RED}✗${NC} deployHackathonDemo.ts not found"
    ERRORS=$((ERRORS + 1))
fi

# ============================================================
# 8. CHECK DOCUMENTATION
# ============================================================

echo -e "\n${YELLOW}8. Checking documentation...${NC}"

if [ -f "HACKATHON_DEPLOYMENT_CHECKLIST.md" ]; then
    echo -e "  ${GREEN}✓${NC} HACKATHON_DEPLOYMENT_CHECKLIST.md exists"
else
    echo -e "  ${YELLOW}⚠${NC}  Deployment checklist not found"
    WARNINGS=$((WARNINGS + 1))
fi

# ============================================================
# SUMMARY
# ============================================================

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                   SUMMARY                        ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo -e "${GREEN}🚀 Ready for deployment!${NC}\n"

    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Test wallet connection locally: http://localhost:5174/tradfi"
    echo "2. Deploy contracts: npx blueprint run scripts/v3/deployHackathonDemo.ts"
    echo "3. Update frontend/.env with contract addresses"
    echo "4. Build frontend: cd frontend && npm run build"
    echo "5. Deploy to server: ./deploy-frontend-safe.sh root@SERVER:/app/Tonsurance/"

    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}"
    echo -e "Warnings: $WARNINGS"
    echo -e "\n${YELLOW}You can proceed, but consider fixing warnings first.${NC}\n"
    exit 0
else
    echo -e "${RED}❌ CHECKS FAILED${NC}"
    echo -e "Errors: $ERRORS"
    echo -e "Warnings: $WARNINGS"
    echo -e "\n${RED}Fix errors before deploying.${NC}\n"
    exit 1
fi
