@echo off
chcp 65001 >nul 2>nul
setlocal
title Siyi OS - Demo Mode 一键启动
color 0B

echo.
echo  ============================================================
echo    Siyi OS - 个人 AI 工作台   一键演示启动
echo    自动完成：装依赖  -  初始化  -  启动  -  打开浏览器
echo  ============================================================
echo.
echo  说明：
echo    · 界面和作者完全一致，但内容为【虚构 Nova Labs】
echo    · 不含任何个人数据，无需你的 Obsidian
echo    · 聊天需自填智谱 Key（可跳过；查看/检索/记忆无需 Key）
echo.
echo  即将依次执行：
echo    [1/4] 安装依赖            （仅首次需要）
echo    [2/4] 初始化演示配置
echo    [3/4] 启动真实工作台        （新窗口）
echo    [4/4] 打开浏览器
echo.
echo  开始...
echo.

cd /d "%~dp0clients\personal-ai" 2>nul || (
  echo  [错误] 找不到 clients\personal-ai 文件夹。
  echo         请确认已解压到仓库根目录后重试。
  pause
  exit /b 1
)

REM  环境检查：是否已安装 Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 未检测到 Node.js，无法安装依赖。
  echo         请先安装 Node.js LTS 版：https://nodejs.org
  echo         安装时请勾选「Add to PATH」，然后重新运行本脚本。
  start "" "https://nodejs.org"
  pause
  exit /b 1
)
echo  [OK] 已检测到 Node.js 环境，继续。
node -v
echo.

REM  第1步：安装依赖
if exist node_modules (
  echo  [1/4] 依赖已安装，跳过。
) else (
  echo  [1/4] 首次运行，正在安装依赖（可能需要几分钟）...
  call npm install
  if errorlevel 1 (
    echo.
    echo  [错误] npm install 失败。请先安装 Node.js LTS（https://nodejs.org）。
    pause
    exit /b 1
  )
  echo  [1/4] 依赖安装完成。
)

REM  第2步：初始化演示配置
echo  [2/4] 正在初始化演示配置...
call npm run demo:init

REM  第3步：启动工作台（新窗口，避免关掉脚本就停止服务）
echo  [3/4] 正在启动工作台（新窗口）...
start "Siyi Workbench Demo" cmd /k "npm run demo:app"

REM  第4步：打开浏览器
echo  [4/4] 正在打开浏览器 http://localhost:8788 ...
timeout /t 5 /nobreak >nul
start "" "http://localhost:8788"

echo.
echo  ============================================================
echo    完成！浏览器应已打开 http://localhost:8788
echo    若没打开，请手动访问 http://localhost:8788
echo.
echo    停止服务：在【Siyi Workbench Demo】窗口里按 Ctrl+C
echo    或直接关闭那个窗口。本窗口可随时关闭。
echo  ============================================================
echo.
pause
