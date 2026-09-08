#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/clients/personal-ai"

echo "============================================"
echo "  Siyi OS  Demo Mode 一键启动"
echo "  (复刻工作台界面，数据为虚构 Nova Labs)"
echo "============================================"
echo

if [ -d node_modules ]; then
  echo "[1/4] 依赖已安装，跳过 npm install"
else
  echo "[1/4] 首次运行，安装依赖（可能需要几分钟）..."
  npm install
  if [ $? -ne 0 ]; then
    echo
    echo "依赖安装失败，请确认已安装 Node.js >= 16，再重试。"
    read -r -p "按回车退出" _
    exit 1
  fi
fi

echo "[2/4] 初始化 Demo 配置..."
npm run demo:init

echo "[3/4] 启动服务（后台）..."
npm run demo:app &
SERVER_PID=$!

echo "[4/4] 打开浏览器 http://localhost:8788 ..."
sleep 4
open "http://localhost:8788" 2>/dev/null \
  || xdg-open "http://localhost:8788" 2>/dev/null \
  || echo "请手动打开 http://localhost:8788"

echo
echo "服务已启动（PID $SERVER_PID）。按 Ctrl+C 停止。"
echo "聊天需在 .env 填入 ZHIPU_API_KEY（视图/检索/记忆无需 Key）。"
wait $SERVER_PID
