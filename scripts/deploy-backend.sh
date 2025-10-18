#!/bin/bash

################################################################################
# Tonsurance Backend Deployment Script
#
# Purpose: Deploy OCaml backend and TypeScript services to production
# Usage: ./scripts/deploy-backend.sh [OPTIONS]
#
# Options:
#   --env=<testnet|mainnet>     Environment (required)
#   --component=<all|ocaml|services>  What to deploy (default: all)
#   --skip-tests                Skip test execution
#   --skip-migrations           Skip database migrations
#   --dry-run                   Test deployment without executing
#
################################################################################

set -e
set -u

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Defaults
ENVIRONMENT=""
COMPONENT="all"
SKIP_TESTS=false
SKIP_MIGRATIONS=false
DRY_RUN=false

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

################################################################################
# Parse Arguments
################################################################################

for arg in "$@"; do
    case $arg in
        --env=*) ENVIRONMENT="${arg#*=}" ;;
        --component=*) COMPONENT="${arg#*=}" ;;
        --skip-tests) SKIP_TESTS=true ;;
        --skip-migrations) SKIP_MIGRATIONS=true ;;
        --dry-run) DRY_RUN=true ;;
        --help) head -n 20 "$0" | grep "^#"; exit 0 ;;
        *) log_error "Unknown argument: $arg"; exit 1 ;;
    esac
done

if [ -z "$ENVIRONMENT" ]; then
    log_error "Missing --env argument"
    exit 1
fi

log_info "=========================================="
log_info "Tonsurance Backend Deployment"
log_info "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Component: $COMPONENT"
log_info "Timestamp: $TIMESTAMP"
log_info ""

################################################################################
# Pre-deployment Checks
################################################################################

log_step "Step 1: Pre-deployment checks..."

# Check required tools
for tool in docker kubectl pg_dump jq; do
    if ! command -v $tool &> /dev/null; then
        log_error "$tool not found. Please install it."
        exit 1
    fi
done

# Check Docker login
if ! docker info &> /dev/null; then
    log_error "Docker not running or not logged in"
    exit 1
fi

# Check kubectl context
CURRENT_CONTEXT=$(kubectl config current-context)
log_info "Current kubectl context: $CURRENT_CONTEXT"

if [ "$ENVIRONMENT" = "mainnet" ] && [[ ! "$CURRENT_CONTEXT" =~ "mainnet" ]]; then
    log_error "kubectl context mismatch for mainnet deployment"
    exit 1
fi

log_info "✅ Pre-deployment checks passed"

################################################################################
# Run Tests
################################################################################

if [ "$SKIP_TESTS" = false ]; then
    log_step "Step 2: Running test suite..."

    cd "$PROJECT_ROOT"

    # Backend tests
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "ocaml" ]; then
        log_info "Running OCaml backend tests..."
        cd backend && dune test && cd ..
    fi

    # Service tests
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "services" ]; then
        log_info "Running TypeScript service tests..."
        cd services && npm test && cd ..
    fi

    log_info "✅ All tests passed"
else
    log_warn "Skipping tests (--skip-tests flag)"
fi

################################################################################
# Build Components
################################################################################

log_step "Step 3: Building components..."

# Build OCaml backend
if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "ocaml" ]; then
    log_info "Building OCaml backend..."
    cd "$PROJECT_ROOT/backend"
    dune clean
    dune build
    log_info "✅ OCaml backend built"
fi

# Build TypeScript services
if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "services" ]; then
    log_info "Building TypeScript services..."
    cd "$PROJECT_ROOT/services"
    npm run build
    log_info "✅ TypeScript services built"
fi

################################################################################
# Create Database Backup
################################################################################

log_step "Step 4: Creating database backup..."

if [ "$SKIP_MIGRATIONS" = false ]; then
    BACKUP_DIR="$PROJECT_ROOT/backups/$ENVIRONMENT"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/db-backup-$TIMESTAMP.sql.gz"

    if [ "$ENVIRONMENT" = "mainnet" ]; then
        DB_URL="$MAINNET_DATABASE_URL"
    else
        DB_URL="$TESTNET_DATABASE_URL"
    fi

    if [ "$DRY_RUN" = false ]; then
        pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"
        log_info "✅ Database backup created: $BACKUP_FILE"
    else
        log_info "[DRY-RUN] Would create database backup"
    fi
else
    log_warn "Skipping database backup (--skip-migrations flag)"
fi

################################################################################
# Run Database Migrations
################################################################################

if [ "$SKIP_MIGRATIONS" = false ]; then
    log_step "Step 5: Running database migrations..."

    if [ "$DRY_RUN" = false ]; then
        for migration in "$PROJECT_ROOT/backend/migrations"/*.sql; do
            log_info "Running migration: $(basename "$migration")"
            psql "$DB_URL" -f "$migration" || {
                log_error "Migration failed: $migration"
                log_info "Restoring from backup..."
                gunzip -c "$BACKUP_FILE" | psql "$DB_URL"
                exit 1
            }
        done
        log_info "✅ Migrations completed"
    else
        log_info "[DRY-RUN] Would run database migrations"
    fi
else
    log_warn "Skipping database migrations (--skip-migrations flag)"
fi

################################################################################
# Build and Push Docker Images
################################################################################

log_step "Step 6: Building and pushing Docker images..."

DOCKER_REGISTRY="tonsurance"
IMAGE_TAG="$ENVIRONMENT-$TIMESTAMP"

# Build OCaml backend image
if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "ocaml" ]; then
    log_info "Building OCaml backend image..."

    if [ "$DRY_RUN" = false ]; then
        docker build \
            -f "$PROJECT_ROOT/infra/docker/Dockerfile.ocaml" \
            -t "$DOCKER_REGISTRY/ocaml-backend:$IMAGE_TAG" \
            -t "$DOCKER_REGISTRY/ocaml-backend:$ENVIRONMENT-latest" \
            "$PROJECT_ROOT"

        docker push "$DOCKER_REGISTRY/ocaml-backend:$IMAGE_TAG"
        docker push "$DOCKER_REGISTRY/ocaml-backend:$ENVIRONMENT-latest"

        log_info "✅ OCaml backend image pushed: $IMAGE_TAG"
    else
        log_info "[DRY-RUN] Would build and push OCaml backend image"
    fi
fi

# Build keeper services image
if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "services" ]; then
    log_info "Building keeper services image..."

    if [ "$DRY_RUN" = false ]; then
        docker build \
            -f "$PROJECT_ROOT/infra/docker/Dockerfile.keeper" \
            -t "$DOCKER_REGISTRY/keepers:$IMAGE_TAG" \
            -t "$DOCKER_REGISTRY/keepers:$ENVIRONMENT-latest" \
            "$PROJECT_ROOT/services"

        docker push "$DOCKER_REGISTRY/keepers:$IMAGE_TAG"
        docker push "$DOCKER_REGISTRY/keepers:$ENVIRONMENT-latest"

        log_info "✅ Keeper services image pushed: $IMAGE_TAG"
    else
        log_info "[DRY-RUN] Would build and push keeper services image"
    fi
fi

################################################################################
# Deploy to Kubernetes
################################################################################

log_step "Step 7: Deploying to Kubernetes..."

NAMESPACE="tonsurance-$ENVIRONMENT"

# Ensure namespace exists
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Update OCaml backend
if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "ocaml" ]; then
    log_info "Deploying OCaml backend..."

    if [ "$DRY_RUN" = false ]; then
        kubectl set image deployment/ocaml-backend \
            ocaml-backend="$DOCKER_REGISTRY/ocaml-backend:$IMAGE_TAG" \
            -n "$NAMESPACE"

        kubectl rollout status deployment/ocaml-backend -n "$NAMESPACE" --timeout=5m

        log_info "✅ OCaml backend deployed"
    else
        log_info "[DRY-RUN] Would deploy OCaml backend"
    fi
fi

# Update keeper services
if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "services" ]; then
    log_info "Deploying keeper services..."

    if [ "$DRY_RUN" = false ]; then
        for deployment in pricing-keeper bridge-keeper hedge-keeper; do
            kubectl set image deployment/$deployment \
                keeper="$DOCKER_REGISTRY/keepers:$IMAGE_TAG" \
                -n "$NAMESPACE" || log_warn "$deployment not found, skipping"
        done

        # Wait for rollouts
        kubectl rollout status deployment/pricing-keeper -n "$NAMESPACE" --timeout=5m || true
        kubectl rollout status deployment/bridge-keeper -n "$NAMESPACE" --timeout=5m || true

        log_info "✅ Keeper services deployed"
    else
        log_info "[DRY-RUN] Would deploy keeper services"
    fi
fi

################################################################################
# Health Checks
################################################################################

log_step "Step 8: Running health checks..."

if [ "$DRY_RUN" = false ]; then
    log_info "Waiting 30 seconds for services to stabilize..."
    sleep 30

    # Check pod status
    log_info "Pod status:"
    kubectl get pods -n "$NAMESPACE"

    # Check service health
    if [ "$ENVIRONMENT" = "mainnet" ]; then
        API_URL="https://api.tonsurance.com"
    else
        API_URL="https://testnet-api.tonsurance.com"
    fi

    log_info "Checking API health..."
    if curl -f "$API_URL/health" > /dev/null 2>&1; then
        log_info "✅ API health check passed"
    else
        log_error "API health check failed"
        log_error "Rolling back deployment..."
        ./scripts/rollback.sh --env="$ENVIRONMENT" --type=services --force
        exit 1
    fi

    # Check oracle updates
    log_info "Checking oracle updates..."
    LAST_UPDATE=$(curl -s "$API_URL/oracle/last-update" | jq -r '.timestamp')
    NOW=$(date +%s)
    AGE=$((NOW - LAST_UPDATE))

    if [ $AGE -lt 300 ]; then
        log_info "✅ Oracle updates working (${AGE}s old)"
    else
        log_warn "Oracle updates may be delayed (${AGE}s old)"
    fi
else
    log_info "[DRY-RUN] Would run health checks"
fi

################################################################################
# Save Deployment Manifest
################################################################################

log_step "Step 9: Saving deployment manifest..."

MANIFEST_FILE="$PROJECT_ROOT/deployments/backend-$ENVIRONMENT-$TIMESTAMP.json"
mkdir -p "$(dirname "$MANIFEST_FILE")"

cat > "$MANIFEST_FILE" << EOF
{
  "environment": "$ENVIRONMENT",
  "timestamp": "$TIMESTAMP",
  "component": "$COMPONENT",
  "docker": {
    "imageTag": "$IMAGE_TAG",
    "ocamlBackend": "$DOCKER_REGISTRY/ocaml-backend:$IMAGE_TAG",
    "keepers": "$DOCKER_REGISTRY/keepers:$IMAGE_TAG"
  },
  "kubernetes": {
    "namespace": "$NAMESPACE",
    "deployments": ["ocaml-backend", "pricing-keeper", "bridge-keeper"]
  },
  "database": {
    "backupFile": "$BACKUP_FILE",
    "migrationsRun": $([ "$SKIP_MIGRATIONS" = false ] && echo "true" || echo "false")
  },
  "deployer": "$(whoami)",
  "gitCommit": "$(git rev-parse HEAD)"
}
EOF

log_info "✅ Deployment manifest saved: $MANIFEST_FILE"

################################################################################
# Summary
################################################################################

log_info ""
log_info "=========================================="
log_info "Deployment Complete"
log_info "=========================================="
log_info "Environment: $ENVIRONMENT"
log_info "Component: $COMPONENT"
log_info "Image Tag: $IMAGE_TAG"
log_info ""

if [ "$DRY_RUN" = true ]; then
    log_info "This was a DRY-RUN - no actual changes made"
else
    log_info "✅ Backend successfully deployed"
    log_info ""
    log_info "Next Steps:"
    log_info "1. Monitor Grafana dashboards: https://grafana.tonsurance.com"
    log_info "2. Check logs: kubectl logs -n $NAMESPACE -l app=ocaml-backend --tail=100"
    log_info "3. Verify metrics in Prometheus"
    log_info "4. Monitor for 1 hour before considering deployment stable"
fi

log_info "=========================================="

exit 0
