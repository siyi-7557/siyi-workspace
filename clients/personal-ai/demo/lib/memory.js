/**
 * Demo 记忆服务（自包含，零依赖）
 *
 * 镜像生产两种记忆形态（见 backend/src/core/rag + ai-core/memory/service.js 的设计）：
 *  - session：会话记忆（当前对话上下文）
 *  - long-term：长期记忆（跨会话保存、可搜索）
 *
 * 提供跨会话召回与「关联/合并」演示能力。
 */

class MemoryStore {
  constructor(options = {}) {
    this._sessions = new Map(); // sessionId -> messages[]
    this._longTerm = new Map(); // key -> { value, metadata, updatedAt }
    this.dataDir = options.dataDir || null;
  }

  // ---------- 会话记忆 ----------
  addMessage(sessionId, role, content) {
    if (!this._sessions.has(sessionId)) this._sessions.set(sessionId, []);
    this._sessions.get(sessionId).push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  getSessionHistory(sessionId, limit = 20) {
    const msgs = this._sessions.get(sessionId) || [];
    return msgs.slice(-limit);
  }

  listSessions() {
    return Array.from(this._sessions.keys());
  }

  // ---------- 长期记忆 ----------
  saveLongTerm(key, value, metadata = {}) {
    this._longTerm.set(key, {
      key,
      value,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return this._longTerm.get(key);
  }

  getLongTerm(key) {
    return this._longTerm.get(key) || null;
  }

  allLongTerm() {
    return Array.from(this._longTerm.values());
  }

  /**
   * 搜索长期记忆：关键词/标签子串匹配（镜像生产 searchLongTerm）
   * @param {string} query
   * @param {number} limit
   * @returns {Array}
   */
  searchLongTerm(query, limit = 5) {
    const q = String(query).toLowerCase();
    const results = [];
    for (const item of this._longTerm.values()) {
      const haystack = (item.value + ' ' + (item.metadata.title || '') + ' ' + (item.metadata.tags || []).join(' ')).toLowerCase();
      if (haystack.includes(q)) results.push(item);
    }
    return results.slice(0, limit);
  }

  /**
   * 合并/关联长期记忆：把多条相关记忆聚合成一条摘要（镜像生产「复盘/合并」思路）
   * @param {string} topic 主题关键词
   * @param {string} summary
   */
  consolidate(topic, summary, metadata = {}) {
    const key = `consolidation:${topic}`;
    const existing = this._longTerm.get(key);
    const merged = {
      key,
      value: summary,
      metadata: {
        ...(existing ? existing.metadata : {}),
        ...metadata,
        merged: true,
        sourceCount: (existing?.metadata?.sourceCount || 0) + 1,
      },
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
    };
    this._longTerm.set(key, merged);
    return merged;
  }
}

module.exports = { MemoryStore };
