@echo off
title Siyi Personal AI Workspace - Demo Mode
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 未检测到 Node.js。请先安装：https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo 正在启动 Demo 服务，浏览器将自动打开 http://localhost:8789
echo 关闭服务窗口即可停止。Ctrl+C 亦可退出。
echo.

start "Demo Server" cmd /k "node demo\run-server.js"
timeout /t 2 >nul
start "" http://localhost:8789

pause
