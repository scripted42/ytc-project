@echo off
echo Cleaning Vite cache...
if exist "frontend\node_modules\.vite" (
    rmdir /s /q "frontend\node_modules\.vite"
)

echo Starting ContentRewards Backend and Frontend...
start cmd /k "cd backend && npm run dev"
start cmd /k "cd frontend && npm run dev"
echo Application servers are launching in separate windows.
pause
