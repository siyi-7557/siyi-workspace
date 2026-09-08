/**
 * Event Service - Siyi OS 统一事件服务
 * 
 * 记录系统中发生的重要事件，用于：
 * - 用户行为追踪（保存、忽略、阅读等操作）
 * - 系统事件记录（采集、处理、错误等）
 * - Memory Pipeline 分析输入
 * - Persona Proposal 生成依据
 * 
 * 存储：内存 + JSON 文件持久化（不依赖数据库，ai-core 各模块通用）
 * 权限：事件默认 private，只有明确标记 public 的事件才可被 Meet Siyi 访问
 */

const path = require('path');
const fs = require('fs');

// 事件类型定义
const EVENT_TYPES = {
  // 信息雷达事件
  RADAR_ITEM_COLLECTED: 'radar.item.collected',
  RADAR_ITEM_READ: 'radar.item.read',
  RADAR_ITEM_SAVED: 'radar.item.saved',
  RADAR_ITEM_LATER: 'radar.item.later',
  RADAR_ITEM_IGNORED: 'radar.item.ignored',
  RADAR_SOURCE_ADDED: 'radar.source.added',
  RADAR_SOURCE_UPDATED: 'radar.source.updated',
  RADAR_SOURCE_REMOVED: 'radar.source.removed',
  RADAR_PREFERENCE_UPDATED: 'radar.preference.updated',
  RADAR_COLLECT_TRIGGERED: 'radar.collect.triggered',
  RADAR_AI_PROCESSED: 'radar.ai.processed',

  // 通用事件
  KNOWLEDGE_CANDIDATE_CREATED: 'knowledge.candidate.created',
  KNOWLEDGE_CANDIDATE_APPROVED: 'knowledge.candidate.approved',
  MEMORY_SIGNAL_RECORDED: 'memory.signal.recorded',
  ERROR_OCCURRED: 'error.occurred',
};

class EventService {
  constructor(options = {}) {
    this.options = options;
    this.eventDir = options.eventDir || path.join(__dirname, '..', '..', 'data', 'events');
    this._events = [];
    this._loaded = false;
  }

  /**
   * 初始化：加载历史事件
   */
  async init() {
    if (!fs.existsSync(this.eventDir)) {
      fs.mkdirSync(this.eventDir, { recursive: true });
    }
    this._loadEvents();
    this._loaded = true;
    console.log(`[EventService] 初始化完成，已加载 ${this._events.length} 条事件`);
  }

  /**
   * 记录事件
   * @param {string} type - 事件类型（使用 EVENT_TYPES）
   * @param {Object} payload - 事件数据
   * @param {string} itemId - 关联的项目ID（可选）
   * @param {Object} options - { visibility: 'private'|'public', source: string }
   * @returns {Object} 已记录的事件
   */
  async record(type, payload = {}, itemId = null, options = {}) {
    if (!this._loaded) await this.init();

    const event = {
      id: this._generateId(),
      type,
      itemId,
      payload,
      visibility: options.visibility || 'private',
      source: options.source || 'system',
      createdAt: new Date().toISOString(),
    };

    this._events.push(event);
    this._persist();

    return event;
  }

  /**
   * 查询事件
   * @param {Object} filter - { type, itemId, visibility, source, since, until, limit }
   * @returns {Array} 事件列表（按时间倒序）
   */
  async query(filter = {}) {
    if (!this._loaded) await this.init();

    let results = [...this._events];

    if (filter.type) {
      results = results.filter(e => e.type === filter.type);
    }
    if (filter.itemId) {
      results = results.filter(e => e.itemId === filter.itemId);
    }
    if (filter.visibility) {
      results = results.filter(e => e.visibility === filter.visibility);
    }
    if (filter.source) {
      results = results.filter(e => e.source === filter.source);
    }
    if (filter.since) {
      const since = new Date(filter.since).getTime();
      results = results.filter(e => new Date(e.createdAt).getTime() >= since);
    }
    if (filter.until) {
      const until = new Date(filter.until).getTime();
      results = results.filter(e => new Date(e.createdAt).getTime() <= until);
    }

    // 按时间倒序
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * 获取事件统计
   * @param {Object} filter - 同 query 的 filter
   * @returns {Object} { total, byType, byDay, recent }
   */
  async getStats(filter = {}) {
    const events = await this.query(filter);
    const byType = {};
    const byDay = {};

    events.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
      const day = e.createdAt.split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });

    return {
      total: events.length,
      byType,
      byDay,
      recent: events.slice(0, 10),
    };
  }

  /**
   * 获取某类型事件的偏好信号（用于 Memory Pipeline）
   * 例如：用户忽略了哪些 category/source，保存了哪些类型
   * @param {string} type - 事件类型
   * @param {string} payloadKey - payload 中的关键字段
   * @returns {Object} { values: [], counts: {} }
   */
  async getPreferenceSignals(type, payloadKey) {
    const events = await this.query({ type });
    const values = [];
    const counts = {};

    events.forEach(e => {
      const value = e.payload?.[payloadKey];
      if (value) {
        values.push(value);
        counts[value] = (counts[value] || 0) + 1;
      }
    });

    return { values, counts, total: events.length };
  }

  // ========== 内部方法 ==========

  _generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _getEventFile() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.eventDir, `events-${today}.json`);
  }

  _loadEvents() {
    this._events = [];
    if (!fs.existsSync(this.eventDir)) return;

    const files = fs.readdirSync(this.eventDir)
      .filter(f => f.startsWith('events-') && f.endsWith('.json'))
      .sort()
      .slice(-7); // 只加载最近7天的事件，避免内存过大

    files.forEach(file => {
      try {
        const content = fs.readFileSync(path.join(this.eventDir, file), 'utf-8');
        const events = JSON.parse(content);
        this._events.push(...events);
      } catch (e) {
        console.error(`[EventService] 加载事件文件失败 ${file}:`, e.message);
      }
    });
  }

  _persist() {
    try {
      const file = this._getEventFile();
      // 只持久化今天的事件
      const today = new Date().toISOString().split('T')[0];
      const todayEvents = this._events.filter(e => e.createdAt.startsWith(today));
      // 原子写入：先写临时文件再 rename，避免中断留下半截 JSON
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(todayEvents, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error('[EventService] 持久化事件失败:', e.message);
    }
  }
}

module.exports = { EventService, EVENT_TYPES };
