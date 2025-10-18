#!/bin/bash
set -e

echo "🔧 Starting Tonsurance Backend Services..."
echo ""

# Check if infrastructure is running
if ! docker exec tonsurance-db pg_isready -U postgres > /dev/null 2>&1; then
  echo "❌ PostgreSQL not running."
  echo "   Run ./scripts/dev/start-infrastructure.sh first."
  exit 1
fi

if ! docker exec tonsurance-redis redis-cli ping > /dev/null 2>&1; then
  echo "❌ Redis not running."
  echo "   Run ./scripts/dev/start-infrastructure.sh first."
  exit 1
fi

# Build OCaml backend
echo "🏗️  Building OCaml services..."
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/backend

if ! dune build 2>&1; then
  echo "❌ Build failed. Check OCaml dependencies:"
  echo "   opam install . --deps-only"
  exit 1
fi

echo "✅ Build complete"
cd ..

# Create logs directory
mkdir -p /Users/ben/Documents/Work/HS/Application/Tonsurance/logs

# Stop any existing services
if [ -f /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/api.pid ]; then
  kill $(cat /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/api.pid) 2>/dev/null || true
fi

if [ -f /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/ws.pid ]; then
  kill $(cat /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/ws.pid) 2>/dev/null || true
fi

if [ -f /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/oracle_keeper.pid ]; then
  kill $(cat /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/oracle_keeper.pid) 2>/dev/null || true
fi

# Start API server (includes WebSocket on /ws endpoint)
echo ""
echo "🌐 Starting REST API + WebSocket server (port 8080)..."
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/backend
nohup dune exec -- tonsurance-api-v2 > /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/api.log 2>&1 &
API_PID=$!
echo $API_PID > /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/api.pid
cd ..

# Start pricing oracle keeper
echo "💰 Starting Pricing Oracle Keeper..."
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/backend
nohup dune exec -- pricing_oracle_keeper > /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/oracle_keeper.log 2>&1 &
KEEPER_PID=$!
echo $KEEPER_PID > /Users/ben/Documents/Work/HS/Application/Tonsurance/logs/oracle_keeper.pid
cd ..

# Wait for services to start
echo ""
echo "⏳ Waiting for services to initialize..."
sleep 5

# Health checks
echo ""
echo "🏥 Running health checks..."

# Check API
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
  echo "✅ REST API healthy (http://localhost:8080)"
  echo "✅ WebSocket endpoint available (ws://localhost:8080/ws)"
else
  echo "⚠️  API server not responding (check logs/api.log)"
fi

# Check if oracle keeper is running
if ps -p $KEEPER_PID > /dev/null 2>&1; then
  echo "✅ Pricing Oracle Keeper running (check logs/oracle_keeper.log)"
else
  echo "⚠️  Oracle Keeper not running (check logs/oracle_keeper.log)"
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Backend Services Started!             ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📝 Service logs:"
echo "   API + WS:       tail -f logs/api.log"
echo "   Oracle Keeper:  tail -f logs/oracle_keeper.log"
echo ""
echo "🌐 Endpoints:"
echo "   REST API:       http://localhost:8080"
echo "   WebSocket:      ws://localhost:8080/ws"
echo "   Health Check:   curl http://localhost:8080/health"
echo ""
echo "🛑 To stop services:"
echo "   ./scripts/dev/stop-backend.sh"
echo ""
