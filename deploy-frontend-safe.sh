#!/bin/bash

# Tonsurance Safe Frontend Deployment Script
#
# This script deploys ONLY frontend files to the server
# WITHOUT touching the working backend/tonny setup
#
# Usage: ./deploy-frontend-safe.sh [user@server:/path]
#
# Example: ./deploy-frontend-safe.sh root@tonsurance-server:/app/Tonsurance/

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Tonsurance Safe Frontend Deployment${NC}\n"

# Check if destination is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Please provide destination${NC}"
    echo "Usage: $0 user@server:/path"
    echo "Example: $0 root@tonsurance-server:/app/Tonsurance/"
    exit 1
fi

DESTINATION="$1"

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "Destination: $DESTINATION"
echo ""

# Confirm with user
echo -e "${YELLOW}⚠️  This will deploy:${NC}"
echo "  ✅ frontend/ directory (src, public, dist, .env, configs)"
echo "  ✅ contracts/v3/ (new contracts)"
echo "  ✅ wrappers/v3/ (new wrappers)"
echo "  ✅ scripts/v3/ (deployment scripts)"
echo ""
echo -e "${GREEN}Will NOT touch:${NC}"
echo "  ❌ backend/ (OCaml API - server version preserved)"
echo "  ❌ docker-compose.yml (server version preserved)"
echo "  ❌ backend .env files (server version preserved)"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

echo -e "\n${GREEN}📦 Starting deployment...${NC}\n"

# Create temporary exclude file
EXCLUDE_FILE=$(mktemp)
cat > "$EXCLUDE_FILE" << 'EOF'
# Exclude backend (preserve server's working version)
backend/
!backend/README.md

# Exclude Docker configs (preserve server's version)
docker-compose.yml
docker-compose.*.yml
Dockerfile*

# Exclude node_modules and build artifacts
node_modules/
.next/
**/dist/
**/.turbo/

# Exclude git and IDE files
.git/
.vscode/
.idea/
.DS_Store

# Exclude environment files (except frontend/.env which we want to deploy)
.env
.env.local
.env.development
.env.test
!frontend/.env
!frontend/.env.production

# Exclude documentation markdown (except deployment guides)
*.md
!DEPLOYMENT_STEPS.md
!DOMAIN_CONFIGURATION.md
!HETZNER_CLOUDFLARE_DEPLOYMENT.md
!README.md

# Exclude test and backup files
**/test_output.txt
**/*.bak*
**/v3_test_results.txt
EOF

echo -e "${YELLOW}1/3 Syncing frontend files...${NC}"
rsync -avz --progress \
    --exclude-from="$EXCLUDE_FILE" \
    --include='frontend/***' \
    --include='contracts/v3/***' \
    --include='wrappers/v3/***' \
    --include='scripts/v3/***' \
    --include='tests/v3/***' \
    --include='DEPLOYMENT_STEPS.md' \
    --include='DOMAIN_CONFIGURATION.md' \
    --include='HETZNER_CLOUDFLARE_DEPLOYMENT.md' \
    --include='README.md' \
    --exclude='*' \
    . "$DESTINATION"

# Clean up
rm "$EXCLUDE_FILE"

echo -e "\n${GREEN}✅ Deployment complete!${NC}\n"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. SSH to server: ssh ${DESTINATION%%:*}"
echo "2. Update contract addresses in frontend/.env"
echo "3. Rebuild frontend: cd frontend && npm install && npm run build"
echo "4. Restart frontend service: docker-compose restart frontend"
echo ""
echo -e "${GREEN}🎉 Frontend deployed successfully without touching backend!${NC}"
