#!/bin/bash
# Deploy Tonsurance to production using Docker

set -e

echo "🚀 Deploying Tonsurance to Production"
echo "======================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ .env.production file not found${NC}"
    echo -e "${YELLOW}Please create .env.production from .env.production.example${NC}"
    exit 1
fi

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi

# Load production environment
export $(cat .env.production | xargs)

echo -e "${GREEN}✅ Environment loaded${NC}"

# Validate required variables
REQUIRED_VARS=(
    "TON_RPC_URL"
    "KEEPER_MNEMONIC"
    "PRICING_ORACLE_ADDRESS"
    "REDSTONE_API_KEY"
    "PYTH_API_KEY"
    "CHAINLINK_API_KEY"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Required variable $var is not set${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ Required variables validated${NC}"

# Build Docker images
echo -e "${GREEN}📦 Building Docker images...${NC}"
docker-compose -f infra/docker/docker-compose.production.yml build

# Start services
echo -e "${GREEN}🚀 Starting services...${NC}"
docker-compose -f infra/docker/docker-compose.production.yml up -d

# Wait for services to be healthy
echo -e "${GREEN}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
echo -e "${GREEN}🏥 Checking service health...${NC}"

if curl -sf http://localhost:8080/health > /dev/null; then
    echo -e "${GREEN}✅ OCaml Backend: Healthy${NC}"
else
    echo -e "${RED}❌ OCaml Backend: Unhealthy${NC}"
fi

if curl -sf http://localhost:3000 > /dev/null; then
    echo -e "${GREEN}✅ Frontend: Healthy${NC}"
else
    echo -e "${RED}❌ Frontend: Unhealthy${NC}"
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Services:"
echo "  Frontend:    http://localhost:3000"
echo "  API:         http://localhost:8080"
echo "  Grafana:     http://localhost:3001"
echo "  Prometheus:  http://localhost:9090"
echo ""
echo "View logs:"
echo "  docker-compose -f infra/docker/docker-compose.production.yml logs -f"
echo ""
echo "Stop services:"
echo "  docker-compose -f infra/docker/docker-compose.production.yml down"
