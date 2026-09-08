const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(config.DB_FILE);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // 繁忙超时：避免数据库被锁定时立即报错，等待最多5秒
    db.pragma('busy_timeout = 5000');
    // 同步模式：NORMAL 在 WAL 模式下兼顾性能和安全
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

function init() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  getDb().exec(schema);
  
  // 迁移：prompts 表添加 source_type 和 source_review_id 字段
  migratePromptsTable();
  
  console.log('[DB] 数据库初始化完成');
}

function columnExists(tableName, columnName) {
  const columns = getDb().prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(col => col.name === columnName);
}

function migratePromptsTable() {
  const db = getDb();
  if (!columnExists('prompts', 'source_type')) {
    db.exec(`ALTER TABLE prompts ADD COLUMN source_type TEXT DEFAULT 'manual'`);
    console.log('[DB] 迁移：prompts 表添加 source_type 字段');
  }
  if (!columnExists('prompts', 'source_review_id')) {
    db.exec(`ALTER TABLE prompts ADD COLUMN source_review_id INTEGER`);
    console.log('[DB] 迁移：prompts 表添加 source_review_id 字段');
  }
}

/**
 * 清理参数数组：把 undefined 转成 null，避免 better-sqlite3 忽略 undefined 导致参数数量不匹配
 */
function sanitizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map(v => v === undefined ? null : v);
}

function query(sql, params = []) {
  return getDb().prepare(sql).all(...sanitizeParams(params));
}

function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(...sanitizeParams(params));
}

function execute(sql, params = []) {
  return getDb().prepare(sql).run(...sanitizeParams(params));
}

module.exports = { getDb, init, query, queryOne, execute };
