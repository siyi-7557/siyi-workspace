/**
 * Website Admin 数据库初始化
 * 创建会话、消息、洞察、同步状态等表
 */

const db = require('../../core/db');

function init() {
  // 会话表
  db.execute(`
    CREATE TABLE IF NOT EXISTS website_sessions (
      session_id TEXT PRIMARY KEY,
      source TEXT DEFAULT 'direct',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      message_count INTEGER DEFAULT 0,
      first_question TEXT,
      is_only_preset INTEGER DEFAULT 0,
      meta TEXT DEFAULT '{}'
    )
  `);

  // 消息表
  db.execute(`
    CREATE TABLE IF NOT EXISTS website_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES website_sessions(session_id) ON DELETE CASCADE
    )
  `);

  db.execute(`CREATE INDEX IF NOT EXISTS idx_website_messages_session ON website_messages(session_id)`);
  db.execute(`CREATE INDEX IF NOT EXISTS idx_website_messages_content ON website_messages(content)`);

  // 洞察表
  db.execute(`
    CREATE TABLE IF NOT EXISTS website_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      cognitive_gap TEXT,
      suggestion TEXT,
      evidence TEXT DEFAULT '[]',
      date_range TEXT,
      status TEXT DEFAULT 'pending',
      review_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 删除标记（tombstone）：手动删除过的会话，同步时不再从云端拉回
  db.execute(`
    CREATE TABLE IF NOT EXISTS website_deleted_sessions (
      session_id TEXT PRIMARY KEY,
      deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步状态表
  db.execute(`
    CREATE TABLE IF NOT EXISTS website_sync_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_syncing INTEGER DEFAULT 0,
      last_synced_at DATETIME,
      last_sync_success INTEGER DEFAULT 1,
      last_sync_error TEXT,
      cloud_api_base_url TEXT DEFAULT '',
      cloud_api_key TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 初始化同步状态
  const existing = db.queryOne('SELECT id FROM website_sync_status WHERE id = 1');
  if (!existing) {
    db.execute(`INSERT INTO website_sync_status (id, is_syncing, cloud_api_base_url) VALUES (1, 0, '')`);
  }

  console.log('[Website Admin] 数据库表初始化完成');
}

module.exports = { init };
