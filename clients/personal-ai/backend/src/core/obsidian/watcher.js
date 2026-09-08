const chokidar = require('chokidar');
const config = require('../config');
const indexer = require('../rag/indexer');

let watcher = null;

function start() {
  const vaultPath = config.get('vaultPath');
  if (!vaultPath) {
    console.log('[Watcher] 未配置vault路径，跳过监听');
    return;
  }
  if (watcher) {
    watcher.close();
  }
  watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\..|node_modules|\.siyi-workbench/,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.md')) {
      console.log(`[Watcher] 新增文件: ${filePath}`);
      indexer.indexFile(filePath);
      logActivity('note_created', filePath);
    }
  });

  watcher.on('change', (filePath) => {
    if (filePath.endsWith('.md')) {
      console.log(`[Watcher] 修改文件: ${filePath}`);
      indexer.updateFile(filePath);
      logActivity('note_updated', filePath);
    }
  });

  watcher.on('unlink', (filePath) => {
    if (filePath.endsWith('.md')) {
      console.log(`[Watcher] 删除文件: ${filePath}`);
      indexer.removeFile(filePath);
    }
  });

  console.log('[Watcher] 文件监听已启动:', vaultPath);
}

function stop() {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('[Watcher] 文件监听已停止');
  }
}

function logActivity(type, filePath) {
  try {
    const db = require('../db');
    const path = require('path');
    const vaultPath = config.get('vaultPath', '');
    const relPath = vaultPath ? path.relative(vaultPath, filePath) : filePath;
    db.execute('INSERT INTO activity_log (date, type, detail) VALUES (?, ?, ?)',
      [new Date().toISOString().slice(0, 10), type, relPath]);
  } catch (e) {
    console.error('[Watcher] 活动记录失败:', e.message);
  }
}

module.exports = { start, stop };
