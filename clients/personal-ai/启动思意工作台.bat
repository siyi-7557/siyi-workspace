@echo off
chcp 65001 >nul
title 思意工作台 (Siyi Workbench)

REM ============================================================
REM  思意工作台启动脚本
REM  强制使用 Node.js v22（better-sqlite3 编译目标）
REM ============================================================

set "NODE22=C:\Program Files\nodejs\node.exe"

if not exist "%NODE22%" (
    echo [错误] 未找到 Node.js v22: %NODE22%
    echo 请安装 Node.js v22 到默认路径，或修改本脚本中的 NODE22 变量。
    pause
    exit /b 1
)

cd /d "%~dp0backend"

echo ============================================================
echo   思意工作台启动中...
echo   Node.js: %NODE22%
echo   地址: http://localhost:8788
echo ============================================================
echo.

REM 检查端口是否被占用
netstat -ano | findstr ":8788" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [警告] 端口 8788 已被占用，正在尝试释放...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8788" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

REM 启动看门狗模式：崩溃后自动重启
:loop
"%NODE22%" server.js
echo.
echo [警告] 服务器已退出，退出码: %errorlevel%
echo 3秒后自动重启... (按 Ctrl+C 终止)
timeout /t 3 /nobreak >nul
goto loop
