#!/bin/bash
set -e

echo "🛑 Stopping Tonsurance Infrastructure..."
echo ""

# Stop and remove containers
if docker ps -a | grep -q tonsurance-db; then
  docker stop tonsurance-db 2>/dev/null || true
  docker rm tonsurance-db 2>/dev/null || true
  echo "✅ PostgreSQL container stopped and removed"
else
  echo "⚠️  PostgreSQL container not found"
fi

if docker ps -a | grep -q tonsurance-redis; then
  docker stop tonsurance-redis 2>/dev/null || true
  docker rm tonsurance-redis 2>/dev/null || true
  echo "✅ Redis container stopped and removed"
else
  echo "⚠️  Redis container not found"
fi

echo ""
echo "✅ Infrastructure stopped"
echo ""
echo "💡 To restart infrastructure:"
echo "   ./scripts/dev/start-infrastructure.sh"
echo ""
