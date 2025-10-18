#!/bin/bash

################################################################################
# Tonsurance Deployment Rollback Script
#
# Purpose: Emergency rollback for failed deployments
# Usage: ./scripts/rollback.sh [OPTIONS]
#
# Options:
#   --env=<testnet|mainnet>     Environment to rollback (required)
#   --type=<contracts|services|database|all>  What to rollback (required)
#   --backup-id=<ID>            Specific backup to restore (optional)
#   --dry-run                   Test rollback without executing
#   --force                     Skip confirmation prompts
#
# Examples:
#   ./scripts/rollback.sh --env=testnet --type=services
#   ./scripts/rollback.sh --env=mainnet --type=all --backup-id=20250115-1430
#
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
DEPLOYMENT_DIR="$PROJECT_ROOT/deployments"

# Default values
ENVIRONMENT=""
ROLLBACK_TYPE=""
BACKUP_ID=""
DRY_RUN=false
FORCE=false

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

confirm() {
    if [ "$FORCE" = true ]; then
        return 0
    fi

    read -p "$1 (yes/no): " response
    if [ "$response" != "yes" ]; then
        log_error "Rollback cancelled by user"
        exit 1
    fi
}

################################################################################
# Parse Arguments
################################################################################

for arg in "$@"; do
    case $arg in
        --env=*)
            ENVIRONMENT="${arg#*=}"
            ;;
        --type=*)
            ROLLBACK_TYPE="${arg#*=}"
            ;;
        --backup-id=*)
            BACKUP_ID="${arg#*=}"
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        --force)
            FORCE=true
            ;;
        --help)
            head -n 30 "$0" | grep "^#"
            exit 0
            ;;
        *)
            log_error "Unknown argument: $arg"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$ENVIRONMENT" ] || [ -z "$ROLLBACK_TYPE" ]; then
    log_error "Missing required arguments"
    echo "Usage: $0 --env=<testnet|mainnet> --type=<contracts|services|database|all> [OPTIONS]"
    exit 1
fi

if [ "$ENVIRONMENT" != "testnet" ] && [ "$ENVIRONMENT" != "mainnet" ]; then
    log_error "Invalid environment: $ENVIRONMENT (must be testnet or mainnet)"
    exit 1
fi

################################################################################
# Main Rollback Logic
################################################################################

log_info "=========================================="
log_info "Tonsurance Deployment Rollback"
log_info "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Rollback Type: $ROLLBACK_TYPE"
log_info "Dry Run: $DRY_RUN"
log_info ""

# Critical confirmation for mainnet
if [ "$ENVIRONMENT" = "mainnet" ]; then
    log_warn "⚠️  MAINNET ROLLBACK DETECTED ⚠️"
    log_warn "This will revert production systems to previous version"
    log_warn "Users may experience service interruption"
    confirm "Are you ABSOLUTELY SURE you want to proceed?"

    # Second confirmation
    log_warn "This is your last chance to abort."
    confirm "Type 'yes' again to confirm mainnet rollback"
fi

################################################################################
# Step 1: Identify Previous Version
################################################################################

log_info "Step 1: Identifying previous version..."

if [ -z "$BACKUP_ID" ]; then
    # Auto-detect latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR/$ENVIRONMENT/" | head -n 1)
    if [ -z "$LATEST_BACKUP" ]; then
        log_error "No backups found for $ENVIRONMENT"
        exit 1
    fi
    BACKUP_ID="$LATEST_BACKUP"
    log_info "Auto-detected latest backup: $BACKUP_ID"
else
    log_info "Using specified backup: $BACKUP_ID"
fi

BACKUP_PATH="$BACKUP_DIR/$ENVIRONMENT/$BACKUP_ID"
if [ ! -d "$BACKUP_PATH" ]; then
    log_error "Backup not found: $BACKUP_PATH"
    exit 1
fi

log_info "✅ Backup located: $BACKUP_PATH"

################################################################################
# Step 2: Rollback Smart Contracts
################################################################################

if [ "$ROLLBACK_TYPE" = "contracts" ] || [ "$ROLLBACK_TYPE" = "all" ]; then
    log_info ""
    log_info "Step 2: Rolling back smart contracts..."

    # Load previous contract addresses
    PREV_MANIFEST="$BACKUP_PATH/deployment-manifest.json"
    if [ ! -f "$PREV_MANIFEST" ]; then
        log_error "Deployment manifest not found: $PREV_MANIFEST"
        exit 1
    fi

    PREV_ROUTER=$(jq -r '.router.address' "$PREV_MANIFEST")
    PREV_ORACLE=$(jq -r '.pricingOracle.address' "$PREV_MANIFEST")
    PREV_VAULT=$(jq -r '.vault.address' "$PREV_MANIFEST")

    log_info "Previous contract addresses:"
    log_info "  Router: $PREV_ROUTER"
    log_info "  Oracle: $PREV_ORACLE"
    log_info "  Vault: $PREV_VAULT"

    if [ "$DRY_RUN" = false ]; then
        # Update PolicyFactory to use previous router
        log_info "Updating PolicyFactory to use previous router..."
        node "$SCRIPT_DIR/update-factory-router.js" \
            --env="$ENVIRONMENT" \
            --router="$PREV_ROUTER"

        # Update keepers to use previous oracle
        log_info "Updating keepers to use previous oracle..."
        kubectl set env deployment/pricing-keeper \
            PRICING_ORACLE_ADDRESS="$PREV_ORACLE" \
            -n tonsurance-$ENVIRONMENT

        # Verify contract rollback
        log_info "Verifying contract rollback..."
        node "$SCRIPT_DIR/verify-deployment.js" \
            --env="$ENVIRONMENT" \
            --router="$PREV_ROUTER" \
            --oracle="$PREV_ORACLE"

        log_info "✅ Smart contracts rolled back successfully"
    else
        log_info "[DRY-RUN] Would rollback smart contracts"
    fi
fi

################################################################################
# Step 3: Rollback Backend Services
################################################################################

if [ "$ROLLBACK_TYPE" = "services" ] || [ "$ROLLBACK_TYPE" = "all" ]; then
    log_info ""
    log_info "Step 3: Rolling back backend services..."

    # Get previous Docker image tags
    PREV_IMAGE_TAG=$(jq -r '.docker.imageTag' "$BACKUP_PATH/deployment-manifest.json")

    log_info "Previous image tag: $PREV_IMAGE_TAG"

    if [ "$DRY_RUN" = false ]; then
        # Rollback Kubernetes deployments
        log_info "Rolling back Kubernetes deployments..."

        kubectl set image deployment/ocaml-backend \
            ocaml-backend="tonsurance/ocaml-backend:$ENVIRONMENT-$PREV_IMAGE_TAG" \
            -n tonsurance-$ENVIRONMENT

        kubectl set image deployment/pricing-keeper \
            pricing-keeper="tonsurance/keepers:$ENVIRONMENT-$PREV_IMAGE_TAG" \
            -n tonsurance-$ENVIRONMENT

        kubectl set image deployment/bridge-keeper \
            bridge-keeper="tonsurance/keepers:$ENVIRONMENT-$PREV_IMAGE_TAG" \
            -n tonsurance-$ENVIRONMENT

        # Wait for rollouts
        log_info "Waiting for rollouts to complete..."
        kubectl rollout status deployment/ocaml-backend -n tonsurance-$ENVIRONMENT --timeout=5m
        kubectl rollout status deployment/pricing-keeper -n tonsurance-$ENVIRONMENT --timeout=5m
        kubectl rollout status deployment/bridge-keeper -n tonsurance-$ENVIRONMENT --timeout=5m

        # Verify service health
        log_info "Verifying service health..."
        sleep 30  # Wait for services to stabilize

        HEALTH_URL="https://$ENVIRONMENT-api.tonsurance.com/health"
        if curl -f "$HEALTH_URL" > /dev/null 2>&1; then
            log_info "✅ Services rolled back successfully"
        else
            log_error "Services health check failed after rollback"
            exit 1
        fi
    else
        log_info "[DRY-RUN] Would rollback backend services to $PREV_IMAGE_TAG"
    fi
fi

################################################################################
# Step 4: Rollback Database
################################################################################

if [ "$ROLLBACK_TYPE" = "database" ] || [ "$ROLLBACK_TYPE" = "all" ]; then
    log_info ""
    log_info "Step 4: Rolling back database..."

    DB_BACKUP="$BACKUP_PATH/database-backup.sql.gz"
    if [ ! -f "$DB_BACKUP" ]; then
        log_error "Database backup not found: $DB_BACKUP"
        exit 1
    fi

    log_warn "⚠️  DATABASE ROLLBACK WARNING ⚠️"
    log_warn "This will RESTORE the database to a previous state"
    log_warn "All data since backup will be LOST"
    confirm "Are you sure you want to restore the database?"

    if [ "$DRY_RUN" = false ]; then
        # Load database credentials
        if [ "$ENVIRONMENT" = "mainnet" ]; then
            DB_URL="$MAINNET_DATABASE_URL"
        else
            DB_URL="$TESTNET_DATABASE_URL"
        fi

        # Create current backup before restore
        log_info "Creating safety backup of current database..."
        SAFETY_BACKUP="$BACKUP_DIR/$ENVIRONMENT/pre-rollback-$(date +%Y%m%d-%H%M%S).sql.gz"
        mkdir -p "$(dirname "$SAFETY_BACKUP")"
        pg_dump "$DB_URL" | gzip > "$SAFETY_BACKUP"
        log_info "Safety backup created: $SAFETY_BACKUP"

        # Restore database
        log_info "Restoring database from backup..."
        gunzip -c "$DB_BACKUP" | psql "$DB_URL"

        # Verify restore
        log_info "Verifying database restore..."
        POLICY_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM policies;")
        log_info "Policies in database: $POLICY_COUNT"

        log_info "✅ Database rolled back successfully"
    else
        log_info "[DRY-RUN] Would restore database from $DB_BACKUP"
    fi
fi

################################################################################
# Step 5: Verification and Monitoring
################################################################################

log_info ""
log_info "Step 5: Post-rollback verification..."

if [ "$DRY_RUN" = false ]; then
    # Run smoke tests
    log_info "Running smoke tests..."
    npm run test:smoke -- --env="$ENVIRONMENT"

    # Check error rates
    log_info "Checking error rates..."
    ERROR_RATE=$(curl -s "http://prometheus-$ENVIRONMENT.tonsurance.com/api/v1/query?query=rate(http_requests_total{status=~\"5..\"}[5m])" | jq -r '.data.result[0].value[1]')

    if [ "$ERROR_RATE" != "null" ] && (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
        log_warn "Error rate elevated: $ERROR_RATE"
        log_warn "Continue monitoring for issues"
    else
        log_info "Error rate acceptable: $ERROR_RATE"
    fi

    # Monitor for 5 minutes
    log_info "Monitoring system for 5 minutes..."
    for i in {1..5}; do
        echo -n "."
        sleep 60
    done
    echo ""

    log_info "✅ Post-rollback verification complete"
else
    log_info "[DRY-RUN] Would run post-rollback verification"
fi

################################################################################
# Step 6: Notification
################################################################################

log_info ""
log_info "Step 6: Sending notifications..."

if [ "$DRY_RUN" = false ]; then
    # Send Slack notification
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"🔄 Rollback Complete\",
            \"blocks\": [
                {
                    \"type\": \"section\",
                    \"text\": {
                        \"type\": \"mrkdwn\",
                        \"text\": \"*Rollback Complete*\\n\\nEnvironment: \`$ENVIRONMENT\`\\nType: \`$ROLLBACK_TYPE\`\\nBackup: \`$BACKUP_ID\`\\nExecuted by: \`$(whoami)\`\"
                    }
                }
            ]
        }"

    # Create incident report
    INCIDENT_REPORT="$BACKUP_DIR/$ENVIRONMENT/rollback-report-$(date +%Y%m%d-%H%M%S).txt"
    cat > "$INCIDENT_REPORT" << EOF
Tonsurance Rollback Report
=========================

Environment: $ENVIRONMENT
Rollback Type: $ROLLBACK_TYPE
Backup ID: $BACKUP_ID
Executed By: $(whoami)
Timestamp: $(date)

Previous Versions:
- Router: $PREV_ROUTER
- Oracle: $PREV_ORACLE
- Vault: $PREV_VAULT
- Image Tag: $PREV_IMAGE_TAG

Post-Rollback Metrics:
- Error Rate: $ERROR_RATE
- Database Policies: $POLICY_COUNT

Status: SUCCESS
EOF

    log_info "Incident report saved: $INCIDENT_REPORT"
else
    log_info "[DRY-RUN] Would send notifications"
fi

################################################################################
# Summary
################################################################################

log_info ""
log_info "=========================================="
log_info "Rollback Complete"
log_info "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Rollback Type: $ROLLBACK_TYPE"
log_info "Backup Used: $BACKUP_ID"

if [ "$DRY_RUN" = true ]; then
    log_info ""
    log_info "This was a DRY-RUN - no actual changes made"
    log_info "Run without --dry-run to execute rollback"
else
    log_info ""
    log_info "✅ Rollback completed successfully"
    log_info ""
    log_info "Next Steps:"
    log_info "1. Monitor system metrics for 1 hour"
    log_info "2. Verify user reports and support tickets"
    log_info "3. Document root cause in incident report"
    log_info "4. Schedule post-mortem meeting"
    log_info "5. Fix underlying issue before redeployment"
fi

log_info "=========================================="

exit 0
