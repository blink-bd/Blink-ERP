#!/bin/bash
set -e

echo "🚀 Setting up ERP/POS System..."

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required"
  exit 1
fi
echo "✅ Node.js version OK"

echo "📦 Installing dependencies..."
npm install

if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo "⚠️  Please update .env with your configuration"
fi

echo "🎣 Setting up Git hooks..."
npm run prepare || true

echo "🐳 Starting Docker containers..."
npm run docker:up

echo "⏳ Waiting for database..."
sleep 8

echo "🗄️  Running database migrations..."
npm run db:migrate

echo "🌱 Seeding database..."
npm run db:seed

echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
