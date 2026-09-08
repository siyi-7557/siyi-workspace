const express = require('express');
const router = express.Router();
const backup = require('./service');

// 列出所有备份
router.get('/', (req, res) => {
  try {
    const backups = backup.listBackups();
    res.json({
      backups: backups.map(b => ({
        ...b,
        sizeFormatted: backup.formatSize(b.size || 0),
      })),
      total: backups.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建备份
router.post('/', (req, res) => {
  try {
    const { description = '' } = req.body;
    const result = backup.createBackup(description);
    res.status(201).json({
      message: '备份创建成功',
      backup: {
        ...result,
        sizeFormatted: backup.formatSize(result.size || 0),
      },
    });
  } catch (err) {
    console.error('[Backup] 创建失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 删除备份
router.delete('/:id', (req, res) => {
  try {
    backup.deleteBackup(req.params.id);
    res.json({ message: '备份删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 恢复备份
router.post('/:id/restore', (req, res) => {
  try {
    const result = backup.restoreBackup(req.params.id);
    res.json({
      message: '备份恢复成功，建议重启服务器使更改生效',
      tempBackupId: result.tempBackupId,
    });
  } catch (err) {
    console.error('[Backup] 恢复失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;