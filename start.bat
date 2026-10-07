@echo off
setlocal

echo Starting ERP/POS Web System...
echo.

echo Step 1: Starting Docker containers...
docker-compose up -d
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo.
echo Step 2: Starting API and Web applications...
npm run dev
