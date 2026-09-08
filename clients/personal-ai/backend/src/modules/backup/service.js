/**
 * 系统备份服务
 * 定期备份数据库和索引文件，支持手动备份和恢复
 */
const fs = require('fs');
const path = require('path');
const config = require('../../core/config');

const BACKUP_DIR = path.join(config.DATA_DIR || path.join(__dirname, '../../data'), 'backups');

// 确保备份目录存在
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// 创建备份
function createBackup(description = '') {
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup-${timestamp}`;
  const backupDir = path.join(BACKUP_DIR, backupId);

  try {
    fs.mkdirSync(backupDir, { recursive: true });

    // 备份数据库
    const dbFile = config.DB_FILE || path.join(__dirname, '../../data/workbench.db');
    if (fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, path.join(backupDir, 'workbench.db'));
    }

    // 备份索引
    const indexFile = config.RAG_INDEX_FILE || path.join(__dirname, '../../data/rag-index.json');
    if (fs.existsSync(indexFile)) {
      fs.copyFileSync(indexFile, path.join(backupDir, 'rag-index.json'));
    }

    // 写入备份元信息
    const meta = {
      id: backupId,
      timestamp: new Date().toISOString(),
      description,
      files: fs.readdirSync(backupDir),
      size: calculateDirSize(backupDir),
    };
    fs.writeFileSync(path.join(backupDir, 'meta.json'), JSON.stringify(meta, null, 2));

    // 清理旧备份（保留最近10个）
    cleanupOldBackups(10);

    return meta;
  } catch (err) {
    console.error('[Backup] 创建备份失败:', err.message);
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    throw err;
  }
}

// 列出所有备份
function listBackups() {
  ensureBackupDir();
  const backups = [];
  const dirs = fs.readdirSync(BACKUP_DIR).filter(d => d.startsWith('backup-'));
  for (const dir of dirs) {
    const metaFile = path.join(BACKUP_DIR, dir, 'meta.json');
    if (fs.existsSync(metaFile)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        backups.push(meta);
      } catch (e) {}
    }
  }
  backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return backups;
}

// 校验备份 ID：仅允许合法的 backup-<timestamp> 格式，防止路径穿越删除/覆盖任意目录
function validateBackupId(backupId) {
  if (typeof backupId !== 'string' || !/^backup-[A-Za-z0-9._-]+$/.test(backupId)) {
    throw new Error('非法的备份 ID');
  }
  const backupDir = path.resolve(path.join(BACKUP_DIR, backupId));
  if (!backupDir.startsWith(path.resolve(BACKUP_DIR) + path.sep)) {
    throw new Error('非法的备份 ID');
  }
  return backupDir;
}

// 删除备份
function deleteBackup(backupId) {
  const backupDir = validateBackupId(backupId);
  if (!fs.existsSync(backupDir)) {
    throw new Error('备份不存在');
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
  return { success: true };
}

// 恢复备份
function restoreBackup(backupId) {
  const backupDir = validateBackupId(backupId);
  if (!fs.existsSync(backupDir)) {
    throw new Error('备份不存在');
  }

  try {
    // 先创建当前状态的临时备份
    const tempBackup = createBackup('恢复前自动备份');

    // 恢复数据库
    const dbFile = config.DB_FILE || path.join(__dirname, '../../data/workbench.db');
    const backupDb = path.join(backupDir, 'workbench.db');
    if (fs.existsSync(backupDb)) {
      fs.copyFileSync(backupDb, dbFile);
    }

    // 恢复索引
    const indexFile = config.RAG_INDEX_FILE || path.join(__dirname, '../../data/rag-index.json');
    const backupIndex = path.join(backupDir, 'rag-index.json');
    if (fs.existsSync(backupIndex)) {
      fs.copyFileSync(backupIndex, indexFile);
    }

    return { success: true, tempBackupId: tempBackup.id };
  } catch (err) {
    console.error('[Backup] 恢复备份失败:', err.message);
    throw err;
  }
}

// 清理旧备份
function cleanupOldBackups(keepCount = 10) {
  const backups = listBackups();
  if (backups.length <= keepCount) return;
  const toDelete = backups.slice(keepCount);
  for (const backup of toDelete) {
    try {
      deleteBackup(backup.id);
    } catch (e) {}
  }
}

// 计算目录大小
function calculateDirSize(dirPath) {
  let totalSize = 0;
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        totalSize += fs.statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }
  walk(dirPath);
  return totalSize;
}

// 格式化文件大小
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

module.exports = {
  createBackup,
  listBackups,
  deleteBackup,
  restoreBackup,
  cleanupOldBackups,
  formatSize,
  BACKUP_DIR,
};