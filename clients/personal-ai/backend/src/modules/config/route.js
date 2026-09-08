const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// 导出配置
router.get('/export', (req, res) => {
  try {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      config: {
        vaultPath: config.get('vaultPath') || '',
        extraPaths: config.get('extraPaths') || [],
        port: config.get('port') || 8788,
      },
      env: {
        AI_MODEL: process.env.AI_MODEL || '',
      },
    };

    const filename = `siyi-workbench-config-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 导入配置
router.post('/import', (req, res) => {
  try {
    const { config: importConfig } = req.body;
    if (!importConfig) {
      return res.status(400).json({ error: '配置数据必填' });
    }
    if (importConfig.vaultPath !== undefined) {
      config.set('vaultPath', importConfig.vaultPath);
    }
    if (importConfig.extraPaths !== undefined) {
      config.set('extraPaths', importConfig.extraPaths);
    }
    if (importConfig.port !== undefined) {
      config.set('port', importConfig.port);
    }
    res.json({
      message: '配置导入成功',
      config: {
        vaultPath: config.get('vaultPath'),
        extraPaths: config.get('extraPaths'),
        port: config.get('port'),
      },
    });
  } catch (err) {
    console.error('[Config] 导入失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;