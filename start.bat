@echo off
echo Starting ERP/POS System...
echo.

echo Step 1: Starting Docker containers...
docker-compose up -d
echo Waiting for services to be ready...
timeout /t 10

echo.
echo Step 2: Starting API...
start cmd /k "cd apps\api && npm run dev"

echo.
echo Step 3: Starting Desktop App...
timeout /t 5
start cmd /k "cd apps\desktop && npm run tauri dev"

echo.
echo All services started!
echo API: http://localhost:3000
echo Docs: http://localhost:3000/api/docs
echo.
pause
