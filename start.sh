#!/bin/bash
set -e

echo "Starting ERP/POS Web System..."
echo ""
echo "Step 1: Starting Docker containers..."
docker-compose up -d
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "Step 2: Starting API and Web applications..."
npm run dev
