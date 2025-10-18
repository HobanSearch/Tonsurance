#!/bin/bash
#
# View logs for Tonsurance backend services
#
# Usage:
#   ./scripts/dev/logs.sh           # Show all logs
#   ./scripts/dev/logs.sh api       # Show API logs
#   ./scripts/dev/logs.sh keeper    # Show Oracle Keeper logs

LOGS_DIR="/Users/ben/Documents/Work/HS/Application/Tonsurance/logs"

case "$1" in
  api)
    echo "📝 Viewing API + WebSocket logs (Ctrl+C to exit)..."
    tail -f "$LOGS_DIR/api.log"
    ;;

  keeper)
    echo "💰 Viewing Oracle Keeper logs (Ctrl+C to exit)..."
    tail -f "$LOGS_DIR/oracle_keeper.log"
    ;;

  db)
    echo "📊 Viewing PostgreSQL logs (Ctrl+C to exit)..."
    docker logs tonsurance-db -f
    ;;

  redis)
    echo "🔴 Viewing Redis logs (Ctrl+C to exit)..."
    docker logs tonsurance-redis -f
    ;;

  all|*)
    echo "📝 Viewing all service logs..."
    echo ""
    echo "Available logs:"
    echo "  1. API + WebSocket:   ./scripts/dev/logs.sh api"
    echo "  2. Oracle Keeper:     ./scripts/dev/logs.sh keeper"
    echo "  3. PostgreSQL:        ./scripts/dev/logs.sh db"
    echo "  4. Redis:             ./scripts/dev/logs.sh redis"
    echo ""
    echo "Showing API logs (Ctrl+C to exit)..."
    tail -f "$LOGS_DIR/api.log"
    ;;
esac
