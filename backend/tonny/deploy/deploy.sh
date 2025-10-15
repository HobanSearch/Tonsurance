#!/bin/bash
# Deployment script for Tonny to Hetzner server

set -e

SERVER_HOST="${1:-tonny.tonsurance.io}"
SERVER_USER="${2:-root}"
DEPLOY_PATH="/opt/tonny"

echo "🚀 Deploying Tonny to $SERVER_HOST..."

# Create deployment package
echo "📦 Creating deployment package..."
cd "$(dirname "$0")/.."
tar czf tonny-deploy.tar.gz \
  tonny_server.py \
  training_data/models/tonny-7b-merged/ \
  training_data/*.jsonl \
  deploy/tonny.service \
  deploy/requirements.txt \
  --exclude='*.pyc' \
  --exclude='__pycache__'

echo "✅ Package created: tonny-deploy.tar.gz"

# Upload to server
echo "📤 Uploading to server..."
scp tonny-deploy.tar.gz "$SERVER_USER@$SERVER_HOST:/tmp/"

echo "🔧 Installing on server..."
ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
set -e

# Create tonny user if doesn't exist
if ! id -u tonny > /dev/null 2>&1; then
  echo "Creating tonny user..."
  useradd -r -s /bin/bash -d /opt/tonny tonny
fi

# Create directory structure
mkdir -p /opt/tonny/{models,logs}
chown -R tonny:tonny /opt/tonny

# Extract deployment
cd /opt/tonny
tar xzf /tmp/tonny-deploy.tar.gz
chown -R tonny:tonny /opt/tonny

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -r deploy/requirements.txt

# Install systemd service
echo "Installing systemd service..."
cp deploy/tonny.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tonny
systemctl restart tonny

# Wait for service to start
sleep 5

# Check status
systemctl status tonny --no-pager

# Test health endpoint
echo "Testing health endpoint..."
curl -s http://localhost:8888/health | python3 -m json.tool

echo "✅ Deployment complete!"
echo "📊 View logs: journalctl -u tonny -f"
ENDSSH

# Cleanup
rm tonny-deploy.tar.gz

echo ""
echo "✅ Tonny deployed successfully!"
echo "🔍 Check server health: curl http://$SERVER_HOST:8888/health"
echo "💬 Test chat: curl -X POST http://$SERVER_HOST:8888/api/generate -H 'Content-Type: application/json' -d '{\"prompt\":\"What is Tonsurance?\"}'"
