@echo off
setlocal
title Siyi OS - Demo Launcher
cd /d "%~dp0clients\personal-ai" 2>nul || (
  echo Cannot find the clients\personal-ai folder.
  echo Please unzip the repo properly and run start-demo.bat from the repo root.
  pause
  exit /b 1
)

echo ============================================
echo   Siyi OS  -  Demo Mode  one-click launcher
echo   Same workbench UI, fictional Nova Labs data
echo ============================================
echo.

if exist node_modules (
  echo [1/4] Dependencies already installed.
) else (
  echo [1/4] Installing dependencies - may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install FAILED. Please install Node.js LTS and retry.
    pause
    exit /b 1
  )
)

echo [2/4] Initializing demo config...
call npm run demo:init

echo [3/4] Starting server in a new window...
start "Siyi Workbench Demo" cmd /k "npm run demo:app"

echo [4/4] Opening browser at http://localhost:8788 ...
timeout /t 4 /nobreak >nul
start "" "http://localhost:8788"

echo.
echo Started. Press Ctrl+C in the server window to stop.
echo Chat needs a ZHIPU_API_KEY in .env (views/search/memory need no key).
echo.
pause
