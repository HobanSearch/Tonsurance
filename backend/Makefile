# Tonsurance Makefile
# Convenience commands for development and deployment

.PHONY: help build test run clean docker-build docker-up docker-down deploy

# Default target
help:
	@echo "Tonsurance - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make install        Install dependencies"
	@echo "  make build          Build the project"
	@echo "  make test           Run tests"
	@echo "  make run-api        Run API server"
	@echo "  make run-daemon     Run risk management daemon"
	@echo "  make clean          Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build   Build Docker images"
	@echo "  make docker-up      Start all services with Docker Compose"
	@echo "  make docker-down    Stop all services"
	@echo "  make docker-logs    View logs"
	@echo "  make docker-shell   Open shell in API container"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate     Run database migrations"
	@echo "  make db-seed        Seed database with test data"
	@echo "  make db-reset       Reset database (caution!)"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-staging Deploy to staging"
	@echo "  make deploy-prod    Deploy to production (requires approval)"
	@echo ""

# ============================================
# Development
# ============================================

install:
	@echo "Installing OCaml dependencies..."
	opam install . --deps-only -y

build:
	@echo "Building project..."
	dune build

build-release:
	@echo "Building release version..."
	dune build --release

test:
	@echo "Running tests..."
	dune test

test-watch:
	@echo "Running tests in watch mode..."
	dune test --watch

run-api:
	@echo "Starting API server on port 8080..."
	dune exec lib/api/api_server.exe

run-daemon:
	@echo "Starting risk management daemon..."
	dune exec lib/daemons/risk_management_daemon.exe

clean:
	@echo "Cleaning build artifacts..."
	dune clean
	rm -rf _build
	rm -rf logs/*.log

# ============================================
# Docker
# ============================================

docker-build:
	@echo "Building Docker images..."
	docker-compose build

docker-up:
	@echo "Starting services with Docker Compose..."
	docker-compose up -d
	@echo ""
	@echo "Services started:"
	@echo "  API Server:     http://localhost:8080"
	@echo "  Prometheus:     http://localhost:9090"
	@echo "  Grafana:        http://localhost:3000"
	@echo "  RabbitMQ UI:    http://localhost:15672"
	@echo ""

docker-down:
	@echo "Stopping services..."
	docker-compose down

docker-down-volumes:
	@echo "Stopping services and removing volumes (caution!)..."
	docker-compose down -v

docker-logs:
	docker-compose logs -f

docker-logs-api:
	docker-compose logs -f api

docker-logs-daemon:
	docker-compose logs -f risk-daemon

docker-shell:
	docker-compose exec api sh

docker-restart-api:
	docker-compose restart api

docker-restart-daemon:
	docker-compose restart risk-daemon

# ============================================
# Database
# ============================================

db-migrate:
	@echo "Running database migrations..."
	psql $(DATABASE_URL) -f migrations/001_initial_schema.sql

db-seed:
	@echo "Seeding database with test data..."
	psql $(DATABASE_URL) -f migrations/seed_data.sql

db-reset:
	@echo "⚠️  Warning: This will DROP and recreate the database!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		psql $(DATABASE_URL) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"; \
		make db-migrate; \
		make db-seed; \
	fi

db-shell:
	psql $(DATABASE_URL)

# ============================================
# Code Quality
# ============================================

format:
	@echo "Formatting code..."
	dune build @fmt --auto-promote

lint:
	@echo "Running linter..."
	# OCaml doesn't have a standard linter, but we can check build warnings
	dune build --display short 2>&1 | grep -i "warning" || echo "No warnings found"

check:
	@echo "Running all checks..."
	make format
	make lint
	make test

# ============================================
# Monitoring
# ============================================

health-check:
	@echo "Checking service health..."
	@curl -f http://localhost:8080/health && echo "✓ API Server healthy" || echo "✗ API Server down"

metrics:
	@echo "Fetching metrics..."
	@curl -s http://localhost:9090/metrics | head -20

logs:
	@tail -f logs/tonsurance.log

logs-error:
	@tail -f logs/tonsurance.log | grep ERROR

# ============================================
# Performance
# ============================================

benchmark:
	@echo "Running benchmarks..."
	# TODO: Add benchmark suite
	@echo "Benchmark suite not yet implemented"

load-test:
	@echo "Running load tests..."
	# TODO: Add load testing with wrk or similar
	@echo "Load test suite not yet implemented"

# ============================================
# Deployment
# ============================================

deploy-staging:
	@echo "Deploying to staging..."
	@read -p "Deploy to staging? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		./scripts/deploy-staging.sh; \
	fi

deploy-prod:
	@echo "⚠️  WARNING: This will deploy to PRODUCTION!"
	@read -p "Have you run tests? [y/N] " -n 1 -r; \
	echo; \
	if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then exit 1; fi
	@read -p "Have you reviewed the changes? [y/N] " -n 1 -r; \
	echo; \
	if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then exit 1; fi
	@read -p "Type 'PRODUCTION' to confirm: " confirm; \
	if [[ "$$confirm" == "PRODUCTION" ]]; then \
		./scripts/deploy-production.sh; \
	else \
		echo "Deployment cancelled."; \
		exit 1; \
	fi

# ============================================
# Utilities
# ============================================

version:
	@cat dune-project | grep "version" | cut -d'"' -f2

status:
	@echo "Project Status:"
	@echo "  Version: $(shell make version)"
	@echo "  OCaml:   $(shell ocaml --version | head -1)"
	@echo "  Dune:    $(shell dune --version)"
	@echo ""
	@echo "Services:"
	@docker-compose ps 2>/dev/null || echo "  Docker Compose not running"

watch:
	@echo "Watching for changes..."
	@while true; do \
		make build; \
		inotifywait -qre close_write lib/; \
	done
