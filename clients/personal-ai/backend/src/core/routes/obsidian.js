const express = require('express');
const router = express.Router();
const config = require('../config');
const indexer = require('../rag/indexer');

// 索引状态
router.get('/status', (req, res) => {
  try {
    const status = indexer.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 设置vault路径
router.post('/config', (req, res) => {
  try {
    const { vaultPath, extraPaths } = req.body;
    const fs = require('fs');

    if (vaultPath !== undefined) {
      if (!vaultPath) return res.status(400).json({ error: 'vault路径必填' });
      if (!fs.existsSync(vaultPath)) {
        return res.status(400).json({ error: '路径不存在' });
      }
      config.set('vaultPath', vaultPath);
    }

    if (extraPaths !== undefined) {
      if (!Array.isArray(extraPaths)) {
        return res.status(400).json({ error: 'extraPaths必须是数组' });
      }
      // 验证路径存在
      for (const p of extraPaths) {
        if (p && !fs.existsSync(p)) {
          return res.status(400).json({ error: `路径不存在: ${p}` });
        }
      }
      config.set('extraPaths', extraPaths.filter(Boolean));
    }

    res.json({
      message: '配置已保存',
      vaultPath: config.get('vaultPath', ''),
      extraPaths: config.get('extraPaths', []),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取配置
router.get('/config', (req, res) => {
  try {
    res.json({
      vaultPath: config.get('vaultPath', ''),
      extraPaths: config.get('extraPaths', []),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 手动重建索引
router.post('/reindex', async (req, res) => {
  try {
    const paths = indexer.getAllIndexPaths();
    if (paths.length === 0) {
      return res.status(400).json({ error: '请先配置Obsidian vault路径或额外索引路径' });
    }
    // 异步执行重建（不传vaultPath，使用所有索引路径）
    indexer.rebuildIndex();
    res.json({ message: '索引重建已启动', status: 'building', paths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 增量索引 - 只索引修改过和新增的文件
router.post('/incremental-index', async (req, res) => {
  try {
    const paths = indexer.getAllIndexPaths();
    if (paths.length === 0) {
      return res.status(400).json({ error: '请先配置Obsidian vault路径或额外索引路径' });
    }
    // 异步执行增量索引
    indexer.incrementalIndex().then(result => {
      console.log('[Obsidian] 增量索引完成:', result);
    }).catch(err => {
      console.error('[Obsidian] 增量索引失败:', err.message);
    });
    res.json({ message: '增量索引已启动', status: 'building', paths });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// vault统计
router.get('/vault-stats', (req, res) => {
  try {
    const vault = require('../obsidian/vault');
    const stats = vault.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== Local REST API ==========

// 获取 Local REST API 配置
router.get('/local-api/config', (req, res) => {
  try {
    const obsidianConfig = config.get('obsidian') || {};
    res.json({
      enabled: obsidianConfig.localRestApiEnabled || false,
      port: obsidianConfig.localRestApiPort || 27124,
      insecurePort: obsidianConfig.localRestApiInsecurePort || 27123,
      apiKey: obsidianConfig.localRestApiKey || '',
      useInsecureHttp: obsidianConfig.useInsecureHttp || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 保存 Local REST API 配置
router.post('/local-api/config', (req, res) => {
  try {
    const { enabled, port, insecurePort, apiKey, useInsecureHttp } = req.body;
    const current = config.get('obsidian') || {};
    const updated = { ...current };
    if (enabled !== undefined) updated.localRestApiEnabled = enabled;
    if (port !== undefined) updated.localRestApiPort = port;
    if (insecurePort !== undefined) updated.localRestApiInsecurePort = insecurePort;
    if (apiKey !== undefined) updated.localRestApiKey = apiKey;
    if (useInsecureHttp !== undefined) updated.useInsecureHttp = useInsecureHttp;
    config.set('obsidian', updated);

    // 重新加载 API 模块配置
    try {
      const obsidianApi = require('../obsidian/api');
      obsidianApi.reloadConfig();
    } catch (e) {}

    res.json({ message: '配置已保存', config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 测试 Local REST API 连接
router.get('/local-api/test', async (req, res) => {
  try {
    const obsidianApi = require('../obsidian/api');
    const available = await obsidianApi.isAvailable();
    if (available) {
      res.json({ success: true, message: '连接成功', connected: true });
    } else {
      res.json({
        success: false,
        message: '连接失败，请检查Obsidian是否运行、Local REST API插件是否启用、API Key是否正确',
        connected: false,
      });
    }
  } catch (err) {
    res.json({ success: false, message: err.message, connected: false });
  }
});

module.exports = router;
