#!/bin/bash
# Start local development environment for Tonsurance

set -e

echo "🚀 Starting Tonsurance Local Development Environment"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Copying from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please update .env with your configuration before continuing${NC}"
    exit 1
fi

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
npm install

# Build contracts
echo -e "${GREEN}🔨 Building TON contracts...${NC}"
npx blueprint build

# Start services in background
echo -e "${GREEN}🖥️  Starting frontend dev server...${NC}"
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ Development environment started!${NC}"
echo ""
echo "Services running:"
echo "  Frontend: http://localhost:3000"
echo ""
echo "To start keeper services manually:"
echo "  npm run start:pricing-keeper"
echo "  npm run start:bridge-keeper"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "echo ''; echo 'Stopping services...'; kill $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
