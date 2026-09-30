#!/bin/bash
echo "Starting ERP/POS System..."
echo ""
echo "Step 1: Starting Docker containers..."
docker-compose up -d
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "Step 2: Starting API (in background, logs in api.log)..."
(cd apps/api && npm run dev > ../../api.log 2>&1 &)

echo ""
echo "Step 3: Starting Desktop App..."
sleep 5
(cd apps/desktop && npm run tauri dev)

echo ""
echo "All services started!"
echo "API: http://localhost:3000"
echo "Docs: http://localhost:3000/api/docs"
