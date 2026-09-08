@echo off
chcp 65001 >nul
title Siyi Workbench Desktop

REM ============================================================
REM  Siyi Workbench - Desktop Launcher (Electron window)
REM  Starts the Electron desktop app directly (no blocking cmd).
REM  Port cleanup is handled by electron-main.js itself.
REM ============================================================

cd /d "%~dp0"

REM Start Electron detached from this console window.
REM Closing this console will NOT close the workbench.
start "" "%~dp0node_modules\electron\dist\electron.exe" .

REM Exit this console immediately, leaving Electron running independently.
exit /b 0
