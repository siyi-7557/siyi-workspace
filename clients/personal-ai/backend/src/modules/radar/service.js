/**
 * InformationRadarService - 信息雷达协调层
 *
 * 6层架构的协调层，负责各层服务的创建、注入和请求转发。
 * 不包含具体业务逻辑，只做协调和调度。
 *
 * 架构：
 * 01 Sources - 信息源（01-sources/）
 * 02 Ingestion - 信息采集（02-ingestion/collector.js）
 * 03 Intelligence - AI理解（03-intelligence/processor.js）
 * 04 Context - 我的状态（04-context/：knowledge-bridge, memory-bridge, projects-bridge, preferences）
 * 05 Recommendation - 推荐排序（05-recommendation/recommender.js）
 * 06 Feedback - 用户反馈（06-feedback/：feedback-service, event-bridge）
 *
 * 前端只负责展示和交互，不直接处理抓取、AI分析或知识库逻辑。
 */

const RadarItem = require('./models/radar-item');

// 02 Ingestion 层
const { IngestionService } = require('./02-ingestion/collector');

// 03 Intelligence 层
const AIProcessor = require('./03-intelligence/processor');

// 05 Recommendation 层
const RecommendationService = require('./05-recommendation/recommender');

// 06 Feedback 层
const { FeedbackService } = require('./06-feedback/feedback-service');

// 01 Sources 默认配置
const { getDefaultSources, shouldInitializeDefaults } = require('./01-sources/default-sources');

class InformationRadarService {
  constructor(options = {}) {
    this.options = options;
    this.llm = options.llm; // LLM Router

    // 04 Context 层
    this.knowledgeBridge = options.knowledgeBridge;
    this.memoryBridge = options.memoryBridge;
    this.projectsBridge = options.projectsBridge;
    this.preferencesManager = options.preferencesManager;

    // 06 Feedback 层
    this.eventBridge = options.eventBridge;

    // 03 Intelligence 层
    this.aiProcessor = new AIProcessor({
      llm: this.llm,
      knowledgeBridge: this.knowledgeBridge,
    });

    // 05 Recommendation 层
    this.recommendation = new RecommendationService();

    // 02 Ingestion 层
    this.ingestion = new IngestionService({
      aiProcessor: this.aiProcessor,
      eventBridge: this.eventBridge,
    });

    // 06 Feedback 层
    this.feedback = new FeedbackService({
      knowledgeBridge: this.knowledgeBridge,
      memoryBridge: this.memoryBridge,
      eventBridge: this.eventBridge,
      recommendation: this.recommendation,
    });

    // 自动采集调度状态
    this.schedulerTimer = null;
    this.isCollecting = false;
    this.lastCollectAt = null;
    this.lastCollectResult = null;
    this.schedulerTickMs = 15 * 60 * 1000; // 每 15 分钟检查一次是否有到期源
  }

  /**
   * 初始化：创建默认信息源（如果没有的话）
   */
  async init() {
    const existingSources = this.getSources();
    if (shouldInitializeDefaults(existingSources)) {
      const defaults = getDefaultSources();
      for (const source of defaults) {
        this.addSource(source);
      }
      console.log('[Radar] 已初始化默认信息源');
    }
    console.log('[Radar] InformationRadarService 初始化完成（协调层）');
  }

  // ========== 02 Ingestion - 信息采集 ==========

  /**
   * 触发采集（转发到 02 Ingestion 层）
   */
  async collect(options = {}) {
    if (this.isCollecting && !options.force) {
      return { skipped: true, reason: '正在采集中' };
    }
    this.isCollecting = true;
    try {
      const context = await this._buildContext();
      const result = await this.ingestion.collect({ ...options, context });
      this.lastCollectAt = new Date().toISOString();
      this.lastCollectResult = result;
      return result;
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * 测试单个信息源连通性（转发到采集层，不入库）
   */
  async testSource(id) {
    return this.ingestion.testSource(id);
  }

  /**
   * 启动自动采集调度：启动后短延迟检查一次，之后周期性检查到期源
   */
  startScheduler() {
    if (this.schedulerTimer) return;
    const tick = async () => {
      if (this.isCollecting) return;
      try {
        const due = this.getSources().filter(s => s.enabled === 1 && this.ingestion._isSourceDue(s));
        if (due.length === 0) return;
        console.log('[Radar] 自动采集：到期源', due.map(s => s.name).join('、'));
        await this.collect({ onlyDue: true });
      } catch (err) {
        console.error('[Radar] 自动采集失败:', err.message);
      }
    };
    // 启动 20 秒后先检查一次（错开服务启动高峰）
    setTimeout(() => { tick(); }, 20 * 1000).unref?.();
    this.schedulerTimer = setInterval(tick, this.schedulerTickMs);
    this.schedulerTimer.unref?.();
    console.log('[Radar] 自动采集调度已启动（每 15 分钟检查到期源）');
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /**
   * 调度/采集运行状态（供前端展示）
   */
  getStatus() {
    const sources = this.getSources();
    return {
      isCollecting: this.isCollecting,
      lastCollectAt: this.lastCollectAt,
      lastCollectResult: this.lastCollectResult,
      sourceCount: sources.length,
      enabledCount: sources.filter(s => s.enabled === 1).length,
      sources: sources.map(s => ({
        id: s.id, name: s.name, enabled: s.enabled,
        fetchInterval: s.fetch_interval, lastFetchedAt: s.last_fetched_at,
      })),
    };
  }

  // ========== 06 Feedback - 信息查询和用户操作 ==========

  /**
   * 获取信息列表（转发到 06 Feedback 层）
   */
  getItems(options = {}) {
    return this.feedback.getItems(options);
  }

  /**
   * 获取单条信息详情（转发到 06 Feedback 层）
   */
  getItem(id) {
    return this.feedback.getItem(id);
  }

  /**
   * 获取分区信息（05 Recommendation 层 + 06 Feedback 层）
   */
  async getPartitionedItems(context = {}) {
    const userContext = context.preferences ? context : await this._buildContext();
    // 拉取最近 7 天全部记录参与分区，避免历史未读被新采集挤出
    const allItems = [];
    const pageSize = 200;
    for (let page = 1; page <= 5; page++) {
      const batch = this.getItems({ days: 7, pageSize, page, sortBy: 'time' });
      allItems.push(...batch.items);
      if (allItems.length >= batch.total) break;
    }
    return this.recommendation.partition(allItems, userContext);
  }

  /**
   * 标记已读（转发到 06 Feedback 层）
   */
  async markAsRead(id) {
    return this.feedback.markAsRead(id);
  }

  /**
   * 保存到知识库候选（转发到 06 Feedback 层）
   */
  async saveToKnowledge(id, userNote = '') {
    return this.feedback.saveToKnowledge(id, userNote);
  }

  /**
   * 稍后阅读（转发到 06 Feedback 层）
   */
  async markAsLater(id) {
    return this.feedback.markAsLater(id);
  }

  /**
   * 忽略此类信息（转发到 06 Feedback 层）
   */
  async ignoreItem(id) {
    return this.feedback.ignoreItem(id);
  }

  /**
   * 获取"为什么推荐给我"（转发到 06 Feedback 层）
   */
  async getWhyRecommended(id) {
    const context = await this._buildContext();
    return this.feedback.getWhyRecommended(id, context);
  }

  /**
   * 搜索信息（转发到 06 Feedback 层）
   */
  searchItems(q, options = {}) {
    return this.feedback.searchItems(q, options);
  }

  /**
   * 获取知识库候选列表（转发到 06 Feedback 层）
   */
  getSavedItems(options = {}) {
    return this.feedback.getSavedItems(options);
  }

  /**
   * 批准知识库候选（转发到 06 Feedback 层）
   */
  async approveSavedItem(id, visibility = 'private') {
    return this.feedback.approveSavedItem(id, visibility);
  }

  /**
   * 拒绝知识库候选（转发到 06 Feedback 层）
   */
  async rejectSavedItem(id) {
    return this.feedback.rejectSavedItem(id);
  }

  // ========== 01 Sources - 信息源管理 ==========

  getSources() {
    return this.ingestion.getSources();
  }

  addSource(source) {
    const db = require('../../core/db');
    const result = db.execute(`
      INSERT INTO radar_sources (name, type, url, category, enabled, fetch_interval)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [source.name, source.type, source.url, source.category || null, source.enabled !== false ? 1 : 0, source.fetchInterval || 3600]);

    if (this.eventBridge) {
      this.eventBridge.record('radar.source.added', { sourceId: result.lastInsertRowid, name: source.name });
    }
    return result.lastInsertRowid;
  }

  updateSource(id, updates) {
    const db = require('../../core/db');
    const fields = [];
    const params = [];
    if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
    if (updates.type !== undefined) { fields.push('type = ?'); params.push(updates.type); }
    if (updates.url !== undefined) { fields.push('url = ?'); params.push(updates.url); }
    if (updates.category !== undefined) { fields.push('category = ?'); params.push(updates.category); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); params.push(updates.enabled ? 1 : 0); }
    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    db.execute(`UPDATE radar_sources SET ${fields.join(', ')} WHERE id = ?`, params);

    if (this.eventBridge) {
      this.eventBridge.record('radar.source.updated', { sourceId: id });
    }
  }

  deleteSource(id) {
    const db = require('../../core/db');
    db.execute('DELETE FROM radar_sources WHERE id = ?', [id]);
    if (this.eventBridge) {
      this.eventBridge.record('radar.source.removed', { sourceId: id });
    }
  }

  // ========== 04 Context - 偏好配置 ==========

  getPreferences() {
    return this.preferencesManager ? this.preferencesManager.getAll() : {};
  }

  updatePreferences(prefs) {
    if (this.preferencesManager) {
      const result = this.preferencesManager.update(prefs);
      if (this.eventBridge) {
        this.eventBridge.record('radar.preference.updated', { keys: Object.keys(prefs) });
      }
      return result;
    }
    return {};
  }

  // ========== 内部方法 - 构建用户上下文（04 Context 层） ==========

  /**
   * 构建用户上下文（用于 AI 相关性判断）
   * 整合 Knowledge、Memory、Projects、Preferences
   */
  async _buildContext() {
    const context = {
      projects: [],
      knowledge: [],
      preferences: this.getPreferences(),
      ignoredCategories: [],
      ignoredSources: [],
    };

    // 从 KnowledgeBridge 获取项目和知识
    if (this.knowledgeBridge) {
      try {
        context.projects = await this.knowledgeBridge.getProjects();
        context.knowledge = await this.knowledgeBridge.getKnowledgeSummary();
      } catch (err) {
        console.error('[Radar] 获取知识上下文失败:', err.message);
      }
    }

    // 从 ProjectsBridge 获取项目（补充）
    if (this.projectsBridge) {
      try {
        const extraProjects = await this.projectsBridge.getProjects();
        context.projects = [...new Set([...context.projects, ...extraProjects.map(p => p.name)])];
      } catch (err) {
        console.error('[Radar] 获取项目上下文失败:', err.message);
      }
    }

    // 从 MemoryBridge 获取忽略偏好
    if (this.memoryBridge) {
      try {
        const ignoreSignals = await this.memoryBridge.getPreferenceSignals('ignore');
        context.ignoredCategories = ignoreSignals.categories || [];
        context.ignoredSources = ignoreSignals.sources || [];
      } catch (err) {
        console.error('[Radar] 获取偏好信号失败:', err.message);
      }
    }

    return context;
  }
}

module.exports = InformationRadarService;