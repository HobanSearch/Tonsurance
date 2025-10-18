#!/bin/bash
# Health check for Redis cluster
# This script verifies that all Redis nodes in the cluster are running and responding

set -e

echo "======================================="
echo "Checking Redis cluster health..."
echo "======================================="
echo ""

NODES_HEALTHY=0
TOTAL_NODES=3

# Check each Redis node
for port in 6379 6380 6381; do
  echo -n "Checking Redis node on port $port... "

  if redis-cli -p $port ping &> /dev/null; then
    echo "UP"
    NODES_HEALTHY=$((NODES_HEALTHY + 1))
  else
    echo "DOWN"
  fi
done

echo ""
echo "======================================="
echo "Health Check Summary"
echo "======================================="
echo "Healthy nodes: $NODES_HEALTHY / $TOTAL_NODES"

if [ $NODES_HEALTHY -eq $TOTAL_NODES ]; then
  echo "Status: ALL NODES HEALTHY"
  echo ""
  echo "Cluster is ready for distributed locking!"
  exit 0
else
  echo "Status: CLUSTER UNHEALTHY"
  echo ""
  echo "Some nodes are not responding. Please check:"
  echo "1. Docker containers are running: docker-compose -f infra/docker/docker-compose.redis.yml ps"
  echo "2. Container logs: docker logs tonsurance-redis-1"
  echo "3. Port availability: lsof -i :6379"
  exit 1
fi
