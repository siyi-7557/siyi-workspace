const express = require('express');
const router = express.Router();
const reviewRoute = require('./route');
const obsidianRoute = require('./obsidian-route');

// Obsidian AI复盘路由（扫描展示Agent生成的复盘文件）
// 必须放在旧项目复盘路由之前，避免被 /:id 拦截
router.use('/ability', obsidianRoute);

// 旧项目复盘原有路由（已隐藏入口，保留兼容）
router.use('/', reviewRoute);

module.exports = {
  name: '项目复盘',
  icon: '📝',
  group: 'review',
  router,
};