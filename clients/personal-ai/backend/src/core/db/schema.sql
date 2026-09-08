-- Prompt知识库
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT '通用',
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  scene TEXT,
  effect TEXT DEFAULT '一般',
  model TEXT,
  tags TEXT,
  iteration INTEGER DEFAULT 1,
  parent_id INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 项目复盘
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  tech_stack TEXT,
  ai_efficiency TEXT,
  prompt_quality TEXT,
  tech_learning TEXT,
  pitfalls TEXT,
  ai_hallucination TEXT,
  improvements TEXT,
  related_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 学习活动日志
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  type TEXT NOT NULL,
  detail TEXT,
  duration INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 配置表
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent对话历史
CREATE TABLE IF NOT EXISTS agent_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL DEFAULT 'general',
  title TEXT,
  messages TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 统一行动项（跨模块）
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'P1',
  source TEXT DEFAULT 'manual',
  source_id TEXT,
  due_date DATE,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_effect ON prompts(effect);
CREATE INDEX IF NOT EXISTS idx_prompts_title ON prompts(title);
CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_project_name ON reviews(project_name);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(date);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(type);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent_type ON agent_conversations(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated_at ON agent_conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_priority ON actions(priority);
CREATE INDEX IF NOT EXISTS idx_actions_source ON actions(source);
CREATE INDEX IF NOT EXISTS idx_actions_due_date ON actions(due_date);
CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at);

-- ============================================================
--  信息雷达（Information Radar）
-- ============================================================

-- 信息项主表
CREATE TABLE IF NOT EXISTS radar_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rss',
  published_at DATETIME,
  collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  category TEXT DEFAULT '未分类',
  summary TEXT,
  content TEXT,
  tags TEXT DEFAULT '[]',
  relevance_score REAL DEFAULT 0,
  importance_score REAL DEFAULT 0,
  relevance_reason TEXT,
  status TEXT DEFAULT 'new',
  related_knowledge TEXT DEFAULT '[]',
  related_projects TEXT DEFAULT '[]',
  is_read INTEGER DEFAULT 0,
  is_saved INTEGER DEFAULT 0,
  user_note TEXT,
  visibility TEXT DEFAULT 'private',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 信息源配置
CREATE TABLE IF NOT EXISTS radar_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'rss',
  url TEXT NOT NULL,
  category TEXT,
  enabled INTEGER DEFAULT 1,
  last_fetched_at DATETIME,
  fetch_interval INTEGER DEFAULT 3600,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户关注配置（Preference Memory）
CREATE TABLE IF NOT EXISTS radar_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 保存到知识库的候选（不直接写入 Knowledge）
CREATE TABLE IF NOT EXISTS radar_saved_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  radar_item_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  original_title TEXT NOT NULL,
  summary TEXT,
  tags TEXT DEFAULT '[]',
  user_note TEXT,
  saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  visibility TEXT DEFAULT 'private',
  FOREIGN KEY (radar_item_id) REFERENCES radar_items(id)
);

-- Event 记录
CREATE TABLE IF NOT EXISTS radar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  radar_item_id TEXT,
  payload TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (radar_item_id) REFERENCES radar_items(id)
);

-- 信息雷达索引
CREATE INDEX IF NOT EXISTS idx_radar_items_status ON radar_items(status);
CREATE INDEX IF NOT EXISTS idx_radar_items_category ON radar_items(category);
CREATE INDEX IF NOT EXISTS idx_radar_items_source ON radar_items(source);
CREATE INDEX IF NOT EXISTS idx_radar_items_relevance ON radar_items(relevance_score);
CREATE INDEX IF NOT EXISTS idx_radar_items_collected_at ON radar_items(collected_at);
CREATE INDEX IF NOT EXISTS idx_radar_items_is_read ON radar_items(is_read);
CREATE INDEX IF NOT EXISTS idx_radar_items_is_saved ON radar_items(is_saved);
CREATE INDEX IF NOT EXISTS idx_radar_sources_enabled ON radar_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_radar_saved_items_status ON radar_saved_items(status);
CREATE INDEX IF NOT EXISTS idx_radar_events_type ON radar_events(type);
CREATE INDEX IF NOT EXISTS idx_radar_events_created_at ON radar_events(created_at);

-- ============================================================
--  周期报告（周/月/季/年 AI 生成报告）
-- ============================================================

CREATE TABLE IF NOT EXISTS period_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  title TEXT,
  summary TEXT,
  content TEXT NOT NULL,
  review_count INTEGER DEFAULT 0,
  avg_score REAL DEFAULT 0,
  total_problems INTEGER DEFAULT 0,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_period_reports_period ON period_reports(period);
CREATE INDEX IF NOT EXISTS idx_period_reports_generated_at ON period_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_period_reports_start_date ON period_reports(start_date);
