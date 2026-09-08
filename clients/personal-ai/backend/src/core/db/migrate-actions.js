/**
 * 行动项数据迁移脚本
 * 将旧的 action-items-status.json 迁移到新的 actions 数据库表
 *
 * 用法：node src/core/db/migrate-actions.js
 */

const fs = require('fs');
const path = require('path');
const db = require('./index');

// 应用数据目录
const appDataDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'siyi-workbench')
  : path.join(__dirname, '..', '..', '..', 'data');

const statusFile = path.join(appDataDir, 'action-items-status.json');

console.log('[迁移] 开始迁移行动项数据...');
console.log('[迁移] 状态文件:', statusFile);

// 检查文件是否存在
if (!fs.existsSync(statusFile)) {
  console.log('[迁移] 状态文件不存在，无需迁移');
  process.exit(0);
}

// 读取状态文件
let statusData;
try {
  const raw = fs.readFileSync(statusFile, 'utf-8');
  statusData = JSON.parse(raw);
} catch (err) {
  console.error('[迁移] 读取状态文件失败:', err.message);
  process.exit(1);
}

const entries = Object.entries(statusData);
console.log(`[迁移] 找到 ${entries.length} 条行动项状态记录`);

let migrated = 0;
let skipped = 0;

for (const [key, value] of entries) {
  try {
    // key 格式: 文件名#索引
    const parts = key.split('#');
    const fileName = parts[0] || '';
    const index = parts[1] ? parseInt(parts[1], 10) : 0;

    const status = value.status || 'pending';
    const dueDate = value.dueDate || null;
    const note = value.note || '';

    // 从文件名中提取标题（去掉日期前缀和 .md 后缀）
    let title = fileName
      .replace(/\.md$/, '')
      .replace(/^\d{4}-\d{2}-\d{2}-/, '')
      .replace(/-复盘$/, '')
      .trim();

    if (!title) {
      title = `行动项 (来自复盘 #${index})`;
    } else {
      title = `${title} - 行动项 #${index + 1}`;
    }

    // 检查是否已存在相同标题的行动项（避免重复迁移）
    const existing = db.queryOne('SELECT id FROM actions WHERE title = ?', [title]);
    if (existing) {
      console.log(`[迁移] 跳过已存在: ${title}`);
      skipped++;
      continue;
    }

    // 插入行动项
    const completedAt = status === 'done' ? new Date().toISOString() : null;
    const result = db.execute(
      `INSERT INTO actions (title, description, status, priority, source, source_id, due_date, completed_at)
       VALUES (?, ?, ?, 'P1', 'review', ?, ?, ?)`,
      [title, note, status, fileName, dueDate, completedAt]
    );

    console.log(`[迁移] 已迁移: ${title} [${status}]`);
    migrated++;
  } catch (err) {
    console.error(`[迁移] 迁移失败 key=${key}:`, err.message);
    skipped++;
  }
}

console.log('');
console.log('[迁移] 迁移完成!');
console.log(`[迁移] 成功: ${migrated}`);
console.log(`[迁移] 跳过: ${skipped}`);

// 备份旧文件
const backupFile = statusFile + '.bak';
try {
  fs.copyFileSync(statusFile, backupFile);
  console.log(`[迁移] 旧文件已备份到: ${backupFile}`);
} catch (err) {
  console.warn('[迁移] 备份旧文件失败:', err.message);
}

process.exit(0);
