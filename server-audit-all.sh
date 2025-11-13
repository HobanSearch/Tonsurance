#!/bin/bash
# COMPREHENSIVE TONSURANCE SERVER AUDIT
# Run this on the server or pipe via SSH
# Usage: ssh root@37.27.223.56 'bash -s' < server-audit-all.sh > audit-results.txt

echo "========================================="
echo "TONSURANCE COMPREHENSIVE SERVER AUDIT"
echo "Date: $(date)"
echo "Server: $(hostname)"
echo "========================================="
echo ""

# PHASE 1: QUICK HEALTH CHECK
echo "╔═══════════════════════════════════════╗"
echo "║  PHASE 1: QUICK HEALTH CHECK          ║"
echo "╚═══════════════════════════════════════╝"
echo ""

cd /opt/tonsurance 2>/dev/null || { echo "ERROR: /opt/tonsurance not found!"; exit 1; }

echo "→ Git commit:"
git rev-parse HEAD 2>&1
echo ""

echo "→ Git branch:"
git branch --show-current 2>&1
echo ""

echo "→ Git status:"
git status --short 2>&1
echo ""

echo "→ Docker containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1
echo ""

echo "→ MasterFactory address check:"
echo "  Expected: EQDsE9sylBzHemAHY1x6D7UO2wk27mjTgM6v6f4j2T2Z3TzG"
echo "  Server:"
grep "MASTER_FACTORY" frontend/.env 2>&1 | head -1
echo ""

# PHASE 2: ENVIRONMENT FILES
echo "╔═══════════════════════════════════════╗"
echo "║  PHASE 2: ENVIRONMENT FILES           ║"
echo "╚═══════════════════════════════════════╝"
echo ""

echo "→ All .env files:"
find . -name ".env*" -type f 2>/dev/null
echo ""

echo "→ Frontend .env content:"
echo "--- START frontend/.env ---"
cat frontend/.env 2>&1
echo "--- END frontend/.env ---"
echo ""

# PHASE 3: DOCKER & SERVICES
echo "╔═══════════════════════════════════════╗"
echo "║  PHASE 3: DOCKER & SERVICES           ║"
echo "╚═══════════════════════════════════════╝"
echo ""

echo "→ Docker Compose config:"
ls -lh docker-compose.yml 2>&1
echo ""

echo "→ Container details:"
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>&1
echo ""

echo "→ Frontend container logs (last 20 lines):"
docker logs tonsurance-frontend --tail 20 2>&1
echo ""

echo "→ API container logs (last 20 lines):"
docker logs tonsurance-api --tail 20 2>&1
echo ""

# PHASE 4: CODE & BUILD
echo "╔═══════════════════════════════════════╗"
echo "║  PHASE 4: CODE & BUILD VERIFICATION   ║"
echo "╚═══════════════════════════════════════╝"
echo ""

echo "→ Frontend directory structure:"
ls -lh frontend/ 2>&1 | head -20
echo ""

echo "→ V3 wrappers exist?"
ls wrappers/v3/ 2>/dev/null | head -10 || echo "wrappers/v3/ NOT FOUND"
echo ""

echo "→ Frontend build exists?"
ls -lh frontend/dist/ 2>/dev/null | head -10 || echo "frontend/dist/ NOT FOUND"
echo ""

echo "→ Frontend source files:"
ls frontend/src/ 2>&1
echo ""

echo "→ Frontend src/lib/contracts.ts (first 30 lines):"
head -30 frontend/src/lib/contracts.ts 2>&1
echo ""

# PHASE 5: INTEGRATION & SECURITY
echo "╔═══════════════════════════════════════╗"
echo "║  PHASE 5: INTEGRATION & SECURITY      ║"
echo "╚═══════════════════════════════════════╝"
echo ""

echo "→ Health checks:"
echo "  Frontend (port 3001):"
curl -s -o /dev/null -w "    HTTP %{http_code}\n" http://localhost:3001/ 2>&1
echo "  API (port 8080):"
curl -s -o /dev/null -w "    HTTP %{http_code}\n" http://localhost:8080/health 2>&1
echo "  Marketing (port 3000):"
curl -s -o /dev/null -w "    HTTP %{http_code}\n" http://localhost:3000/ 2>&1
echo ""

echo "→ TON Connect manifest (in container):"
docker exec tonsurance-frontend cat /usr/share/nginx/html/tonconnect-manifest.json 2>&1 | head -10
echo ""

echo "→ SSL certificates:"
ls -lh /etc/letsencrypt/live/ 2>&1 | grep tonsurance || echo "No certificates found"
echo ""

echo "→ Open ports:"
netstat -tlnp 2>&1 | grep -E ':(80|443|3000|3001|8080|5432|6379)' || ss -tlnp 2>&1 | grep -E ':(80|443|3000|3001|8080|5432|6379)'
echo ""

echo "→ Database status:"
docker exec tonsurance-postgres pg_isready -U tonsurance 2>&1
echo ""

echo "→ Redis status:"
docker exec tonsurance-redis redis-cli ping 2>&1
echo ""

echo "========================================="
echo "AUDIT COMPLETE"
echo "========================================="
echo ""
echo "→ Summary:"
echo "  Git commit: $(git rev-parse --short HEAD 2>&1)"
echo "  Containers running: $(docker ps --format '{{.Names}}' 2>&1 | wc -l)"
echo "  MasterFactory configured: $(grep -q 'MASTER_FACTORY.*EQA' frontend/.env 2>&1 && echo 'YES' || echo 'NO')"
echo ""
