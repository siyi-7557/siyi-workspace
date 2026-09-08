const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const config = require('./config');
const db = require('./core/db');

// 初始化数据库
db.init();

const app = express();

// CORS：默认仅允许本机来源（localhost/127.0.0.1）；需要额外来源时用 CORS_ORIGINS 环境变量配置（逗号分隔）。
// 无 Origin 头的请求（同源页面、curl、Electron 主进程）默认放行。
const extraOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || extraOrigins.includes(origin)) {
        return cb(null, true);
      }
    } catch (e) { /* 非法 Origin */ }
    return cb(null, false);
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（开发环境禁止缓存，确保修改即时生效）
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// 模块名到路由路径的映射
const routePathMap = {
  search: '/api/search',
  prompt: '/api/prompts',
  review: '/api/reviews',
  dashboard: '/api/stats',
  agent: '/api/agent',
  resume: '/api/resume',
  code: '/api/code',
  graph: '/api/graph',
  learning: '/api/learning',
  codex: '/api/codex-sessions',
  pitfalls: '/api/pitfalls',
  website: '/api/website-admin',
  backup: '/api/backup',
  config: '/api/config',
  'personal-ai': '/api/personal-ai',
};

// 自动加载所有功能模块
const modulesDir = path.join(__dirname, 'modules');
const loadedModules = [];
if (fs.existsSync(modulesDir)) {
  fs.readdirSync(modulesDir).forEach(modName => {
    if (modName === 'website' && config.isDemo()) {
      console.log('[Module] Demo 模式跳过私人模块: website');
      return;
    }
    const modPath = path.join(modulesDir, modName);
    const indexPath = path.join(modPath, 'index.js');
    if (fs.statSync(modPath).isDirectory() && fs.existsSync(indexPath)) {
      try {
        const mod = require(indexPath);
        const routePath = routePathMap[modName] || `/api/${modName}`;
        app.use(routePath, mod.router);
        loadedModules.push({ name: modName, routePath, meta: mod });
        console.log(`[Module] 已加载: ${mod.name || modName} -> ${routePath}`);
      } catch (e) {
        console.error(`[Module] 加载失败 ${modName}:`, e.message);
      }
    }
  });
}

// 核心路由
app.use('/api/obsidian', require('./core/routes/obsidian'));
app.use('/api/ai', require('./core/routes/ai'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), modules: loadedModules.length });
});

// SPA fallback - 所有非API请求返回index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
