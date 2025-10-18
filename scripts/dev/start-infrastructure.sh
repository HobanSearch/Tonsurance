#!/bin/bash
set -e

echo "🚀 Starting Tonsurance Infrastructure..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop."
  exit 1
fi

# Stop existing containers (if any)
echo "🧹 Cleaning up existing containers..."
docker stop tonsurance-db tonsurance-redis 2>/dev/null || true
docker rm tonsurance-db tonsurance-redis 2>/dev/null || true

# Start TimescaleDB
echo ""
echo "📊 Starting TimescaleDB..."
docker run -d --name tonsurance-db \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tonsurance \
  timescale/timescaledb:latest-pg15

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec tonsurance-db pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
  echo -n "."
done
echo ""
echo "✅ PostgreSQL is ready"

# Start Redis
echo ""
echo "🔴 Starting Redis..."
docker run -d --name tonsurance-redis \
  -p 6379:6379 \
  redis:alpine

# Wait for Redis
echo "⏳ Waiting for Redis to be ready..."
until docker exec tonsurance-redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
  echo -n "."
done
echo ""
echo "✅ Redis is ready"

# Run database migrations
echo ""
echo "🗄️  Running database migrations..."

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo "⚠️  Warning: psql not found. Skipping migrations."
  echo "   Install PostgreSQL client: brew install postgresql (macOS) or apt install postgresql-client (Linux)"
else
  # Create database users
  echo "Creating database roles..."
  docker exec tonsurance-db psql -U postgres -d tonsurance -c "
    CREATE ROLE tonsurance_analytics WITH LOGIN PASSWORD 'analytics123';
    CREATE ROLE tonsurance_integration WITH LOGIN PASSWORD 'integration123';
  " 2>/dev/null || echo "Roles may already exist, continuing..."

  # Run migrations in order
  for migration_file in /Users/ben/Documents/Work/HS/Application/Tonsurance/backend/migrations/*.sql; do
    if [ -f "$migration_file" ]; then
      migration_name=$(basename "$migration_file")
      echo "  Applying $migration_name..."
      PGPASSWORD=postgres psql -h localhost -U postgres -d tonsurance -f "$migration_file" -q
    fi
  done

  echo "✅ Migrations complete"
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Infrastructure Ready!                 ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📊 PostgreSQL: localhost:5432"
echo "   Database: tonsurance"
echo "   User: postgres"
echo "   Password: postgres"
echo ""
echo "🔴 Redis: localhost:6379"
echo ""
echo "Next steps:"
echo "  1. Start backend services: ./scripts/dev/start-backend.sh"
echo "  2. Start frontend: ./scripts/dev/start-frontend.sh"
echo ""
