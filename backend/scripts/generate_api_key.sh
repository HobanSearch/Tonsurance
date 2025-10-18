#!/bin/bash

# Generate Secure API Key for Tonsurance API v2
#
# Usage:
#   ./generate_api_key.sh --name "My App" --scopes "read,write"
#
# Options:
#   --name      Name/identifier for the API key (required)
#   --scopes    Comma-separated scopes: read,write,admin (default: read)
#   --expires   Expiration in days (optional, default: no expiration)

set -e

# Parse arguments
NAME=""
SCOPES="read"
EXPIRES=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      NAME="$2"
      shift 2
      ;;
    --scopes)
      SCOPES="$2"
      shift 2
      ;;
    --expires)
      EXPIRES="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$NAME" ]; then
  echo "Error: --name is required"
  echo ""
  echo "Usage:"
  echo "  ./generate_api_key.sh --name \"My App\" --scopes \"read,write\""
  exit 1
fi

# Generate 32 random bytes and base64 encode
API_KEY=$(openssl rand -base64 32 | tr -d '=' | tr '+/' '-_' | head -c 44)

# Add tonsure_ prefix
FULL_KEY="tonsure_${API_KEY}"

# Calculate SHA-256 hash
KEY_HASH=$(echo -n "$FULL_KEY" | shasum -a 256 | awk '{print $1}')

# Get current timestamp
TIMESTAMP=$(date +%s)

# Calculate expiry if provided
EXPIRES_JSON="null"
if [ -n "$EXPIRES" ]; then
  EXPIRES_TS=$(date -v+${EXPIRES}d +%s 2>/dev/null || date -d "+${EXPIRES} days" +%s)
  EXPIRES_JSON="$EXPIRES_TS.0"
fi

# Convert scopes to JSON array
SCOPES_JSON=$(echo "$SCOPES" | awk -F',' '{
  printf "["
  for (i=1; i<=NF; i++) {
    if (i > 1) printf ", "
    printf "\"%s\"", $i
  }
  printf "]"
}')

# Output results
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Tonsurance API Key Generated"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "API Key (KEEP SECRET):"
echo "  $FULL_KEY"
echo ""
echo "Key Hash (SHA-256):"
echo "  $KEY_HASH"
echo ""
echo "Name: $NAME"
echo "Scopes: $SCOPES"
if [ -n "$EXPIRES" ]; then
  EXPIRES_DATE=$(date -r "$EXPIRES_TS" "+%Y-%m-%d" 2>/dev/null || date -d "@$EXPIRES_TS" "+%Y-%m-%d")
  echo "Expires: $EXPIRES_DATE ($EXPIRES days from now)"
else
  echo "Expires: Never"
fi
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Add this to backend/config/api_security.json:"
echo ""
cat <<EOF
{
  "key": "$FULL_KEY",
  "name": "$NAME",
  "scopes": $SCOPES_JSON,
  "created_at": ${TIMESTAMP}.0,
  "expires_at": $EXPIRES_JSON,
  "revoked": false,
  "environment": "production"
}
EOF
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Store the API key securely:"
echo "  - Add to .env file (never commit to git)"
echo "  - Store in AWS Secrets Manager / HashiCorp Vault"
echo "  - Use environment variables in production"
echo ""
echo "Test the key:"
echo "  curl -X POST http://localhost:8080/api/v2/policies \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'Authorization: Bearer $FULL_KEY' \\"
echo "    -d '{...}'"
echo ""
