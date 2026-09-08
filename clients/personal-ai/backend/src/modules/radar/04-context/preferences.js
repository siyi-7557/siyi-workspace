/**
 * 04 Context - Preferences
 *
 * 用户偏好配置管理。
 * 存储关注主题、关键词、项目、技术方向、分类等配置。
 * 架构位置：04 Context 的子模块之一（Knowledge / Memory / Projects / Preferences）
 */

const db = require('../../../core/db');

class PreferencesManager {
  constructor(options = {}) {
    this.options = options;
  }

  async init() {
    console.log('[Preferences] 初始化完成');
  }

  /**
   * 获取所有偏好配置
   */
  getAll() {
    const rows = db.query('SELECT key, value, description FROM radar_preferences');
    const prefs = {};
    for (const row of rows) {
      try {
        prefs[row.key] = JSON.parse(row.value);
      } catch {
        prefs[row.key] = row.value;
      }
    }
    return prefs;
  }

  /**
   * 获取指定偏好
   */
  get(key, defaultValue = null) {
    const row = db.queryOne('SELECT value FROM radar_preferences WHERE key = ?', [key]);
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  /**
   * 更新偏好配置
   */
  update(prefs) {
    for (const [key, value] of Object.entries(prefs)) {
      db.execute(`
        INSERT INTO radar_preferences (key, value, description, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `, [key, JSON.stringify(value), '']);
    }
    return this.getAll();
  }

  /**
   * 获取关注主题
   */
  getTopics() {
    return this.get('topics', []);
  }

  /**
   * 获取关注关键词
   */
  getKeywords() {
    return this.get('keywords', []);
  }

  /**
   * 获取关注项目
   */
  getProjects() {
    return this.get('projects', []);
  }

  /**
   * 获取技术方向
   */
  getTechDirections() {
    return this.get('techDirections', []);
  }

  /**
   * 获取关注分类
   */
  getCategories() {
    return this.get('categories', []);
  }

  /**
   * 构建用于 AI 相关性判断的偏好上下文
   */
  buildContext() {
    return {
      topics: this.getTopics(),
      keywords: this.getKeywords(),
      projects: this.getProjects(),
      techDirections: this.getTechDirections(),
      categories: this.getCategories(),
    };
  }
}

module.exports = { PreferencesManager };