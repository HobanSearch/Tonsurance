#!/bin/bash
set -e

echo "🎨 Starting Tonsurance Frontend..."
echo ""

# Check if backend is running
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
  echo "⚠️  Backend API is not running."
  echo "   The frontend will work but API calls will fail."
  echo "   Start backend with: ./scripts/dev/start-backend.sh"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Navigate to frontend directory
cd /Users/ben/Documents/Work/HS/Application/Tonsurance/frontend

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo "✅ Created .env file"
  echo ""
  echo "⚠️  Note: Contract addresses are not set."
  echo "   Deploy contracts first or use existing addresses."
  echo ""
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo "✅ Dependencies installed"
  echo ""
fi

# Start dev server
echo "🚀 Starting Vite dev server..."
echo ""
npm run dev
