#!/bin/bash
set -e

echo "🛑 Stopping Tonsurance Backend Services..."
echo ""

LOGS_DIR="/Users/ben/Documents/Work/HS/Application/Tonsurance/logs"

# Stop API + WebSocket server
if [ -f "$LOGS_DIR/api.pid" ]; then
  API_PID=$(cat "$LOGS_DIR/api.pid")
  if ps -p $API_PID > /dev/null 2>&1; then
    kill $API_PID 2>/dev/null || true
    echo "✅ API + WebSocket server stopped (PID: $API_PID)"
  else
    echo "⚠️  API + WebSocket server was not running"
  fi
  rm "$LOGS_DIR/api.pid"
else
  echo "⚠️  No API server PID file found"
fi

# Stop Oracle Keeper
if [ -f "$LOGS_DIR/oracle_keeper.pid" ]; then
  KEEPER_PID=$(cat "$LOGS_DIR/oracle_keeper.pid")
  if ps -p $KEEPER_PID > /dev/null 2>&1; then
    kill $KEEPER_PID 2>/dev/null || true
    echo "✅ Oracle keeper stopped (PID: $KEEPER_PID)"
  else
    echo "⚠️  Oracle keeper was not running"
  fi
  rm "$LOGS_DIR/oracle_keeper.pid"
else
  echo "⚠️  No Oracle keeper PID file found"
fi

echo ""
echo "✅ All backend services stopped"
echo ""
