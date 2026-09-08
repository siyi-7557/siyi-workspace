/**
 * Memory Service - 记忆服务
 * 
 * 统一的记忆管理，支持会话记忆和长期记忆。
 * 
 * 记忆类型：
 * - session：会话记忆（当前对话上下文）
 * - long-term：长期记忆（跨会话保存的重要信息）
 * - user：用户级记忆（用户偏好、习惯等）
 * 
 * Meet Siyi：无持久化记忆（会话记忆在前端 localStorage）
 * Personal AI：有完整记忆系统（SQLite + 文件）
 */

const path = require('path');
const fs = require('fs');

/**
 * 原子写入：先写临时文件再 rename，避免进程中断留下半截 JSON
 */
function atomicWriteFile(file, content) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * 安全读取 JSON：文件缺失/损坏时返回 null（由调用方决定降级行为），不抛异常
 */
function safeReadJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.warn(`[MemoryService] 记忆文件读取失败(已跳过): ${path.basename(file)} - ${e.message}`);
    return null;
  }
}

class MemoryService {
  constructor(options = {}) {
    this.options = options;
    this.memoryDir = options.memoryDir || path.join(__dirname, '..', '..', 'data', 'memory');
    this._sessions = new Map(); // sessionId -> messages
  }

  /**
   * 初始化记忆服务
   */
  async init() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    console.log('[MemoryService] 初始化完成');
  }

  /**
   * 保存会话消息
   */
  async saveMessage(sessionId, message) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, []);
    }
    this._sessions.get(sessionId).push({
      ...message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(sessionId, limit = 20) {
    const messages = this._sessions.get(sessionId) || [];
    return messages.slice(-limit);
  }

  /**
   * 清除会话记忆
   */
  async clearSession(sessionId) {
    this._sessions.delete(sessionId);
  }

  /**
   * 保存长期记忆
   */
  async saveLongTerm(key, value, metadata = {}) {
    const file = path.join(this.memoryDir, `${key}.json`);
    const data = {
      key,
      value,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    atomicWriteFile(file, JSON.stringify(data, null, 2));
    return data;
  }

  /**
   * 获取长期记忆
   */
  async getLongTerm(key) {
    const file = path.join(this.memoryDir, `${key}.json`);
    return safeReadJson(file);
  }

  /**
   * 搜索长期记忆
   */
  async searchLongTerm(query, limit = 5) {
    if (!fs.existsSync(this.memoryDir)) return [];
    const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.json'));
    const results = [];
    for (const file of files) {
      const data = safeReadJson(path.join(this.memoryDir, file));
      if (!data) continue;
      const content = JSON.stringify(data.value || '') + ' ' + (data.metadata?.title || '');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        results.push(data);
      }
    }
    return results.slice(0, limit);
  }

  /**
   * 获取所有会话 ID
   */
  listSessions() {
    return Array.from(this._sessions.keys());
  }
}

module.exports = MemoryService;
