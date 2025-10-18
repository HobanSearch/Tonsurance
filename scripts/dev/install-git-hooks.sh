#!/bin/bash
# Install Git Hooks for Tonsurance
# Purpose: Set up pre-commit hooks to detect secrets and enforce security policies

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Installing Tonsurance Git Hooks...${NC}"
echo ""

# Get repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPTS_DIR="$REPO_ROOT/scripts/dev"

# Check if in git repository
if [ ! -d "$REPO_ROOT/.git" ]; then
  echo -e "${RED}Error: Not in a git repository${NC}"
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Install pre-commit hook for secret detection
if [ -f "$SCRIPTS_DIR/detect-secrets.sh" ]; then
  echo "Installing pre-commit hook (secret detection)..."
  cp "$SCRIPTS_DIR/detect-secrets.sh" "$HOOKS_DIR/pre-commit"
  chmod +x "$HOOKS_DIR/pre-commit"
  echo -e "${GREEN}✓ Pre-commit hook installed${NC}"
else
  echo -e "${RED}✗ detect-secrets.sh not found in $SCRIPTS_DIR${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}Git hooks installed successfully!${NC}"
echo ""
echo "Installed hooks:"
echo "  • pre-commit: Detects secrets in staged files"
echo ""
echo "To test the hook:"
echo "  1. Stage a file with a secret: git add .env.deployment"
echo "  2. Try to commit: git commit -m 'test'"
echo "  3. Hook should block commit and show error"
echo ""
echo "To bypass hook (NOT RECOMMENDED):"
echo "  git commit --no-verify -m 'message'"
echo ""
echo -e "${YELLOW}⚠️  Remember: Never commit secrets to version control!${NC}"
echo "See backend/docs/SECRETS_MANAGEMENT.md for guidance."
