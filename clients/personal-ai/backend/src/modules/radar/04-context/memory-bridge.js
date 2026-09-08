/**
 * MemoryBridge - 与 Siyi OS Memory 交互的桥接层
 * 
 * 职责：
 * - 读取用户偏好（关注主题、关键词、项目、技术方向）
 * - 写入用户操作信号（保存、忽略、阅读等）作为 Preference Memory
 * - 为未来的信息推荐提供依据
 * 
 * 不直接修改 Persona，只有经过 Memory Pipeline 分析后才允许产生 Persona Proposal。
 */

class MemoryBridge {
  constructor(options = {}) {
    this.options = options;
    this.memoryService = options.memoryService; // Siyi OS MemoryService 实例
    this.preferenceKey = 'radar-preferences';
    this.signalKey = 'radar-signals';
  }

  /**
   * 初始化
   */
  async init() {
    console.log('[MemoryBridge] 初始化完成');
  }

  /**
   * 获取用户偏好配置
   * @returns {Promise<Object>} 偏好 {topics, keywords, projects, techDirections, categories, sources}
   */
  async getPreferences() {
    if (!this.memoryService) return {};

    try {
      const prefs = await this.memoryService.getLongTerm(this.preferenceKey);
      return prefs?.value || {};
    } catch (err) {
      console.error('[MemoryBridge] 获取偏好失败:', err.message);
      return {};
    }
  }

  /**
   * 更新用户偏好
   */
  async updatePreferences(preferences) {
    if (!this.memoryService) return;

    try {
      const existing = await this.getPreferences();
      const merged = { ...existing, ...preferences };
      
      await this.memoryService.saveLongTerm(this.preferenceKey, merged, {
        type: 'radar-preferences',
        updatedAt: new Date().toISOString(),
      });

      console.log('[MemoryBridge] 偏好已更新');
    } catch (err) {
      console.error('[MemoryBridge] 更新偏好失败:', err.message);
    }
  }

  /**
   * 记录用户操作信号（作为 Preference Memory）
   * @param {string} action - 操作类型：save / ignore / read / later
   * @param {Object} signal - 信号数据 {category, source, itemId, tags}
   */
  async recordPreferenceSignal(action, signal = {}) {
    if (!this.memoryService) return;

    try {
      const existing = await this.memoryService.getLongTerm(this.signalKey);
      const signals = existing?.value?.signals || [];

      signals.push({
        action,
        ...signal,
        timestamp: new Date().toISOString(),
      });

      // 只保留最近 500 条信号，避免内存过大
      const recentSignals = signals.slice(-500);

      await this.memoryService.saveLongTerm(this.signalKey, {
        signals: recentSignals,
        lastUpdated: new Date().toISOString(),
      }, {
        type: 'radar-signals',
      });

      console.log(`[MemoryBridge] 偏好信号已记录: ${action}`);
    } catch (err) {
      console.error('[MemoryBridge] 记录偏好信号失败:', err.message);
    }
  }

  /**
   * 获取偏好信号（用于调整推荐）
   * @param {string} action - 操作类型过滤（可选）
   * @returns {Promise<Object>} {categories: [], sources: [], signals: []}
   */
  async getPreferenceSignals(action = null) {
    if (!this.memoryService) return { categories: [], sources: [], signals: [] };

    try {
      const existing = await this.memoryService.getLongTerm(this.signalKey);
      let signals = existing?.value?.signals || [];

      if (action) {
        signals = signals.filter(s => s.action === action);
      }

      // 统计忽略的分类和来源
      const ignoreSignals = signals.filter(s => s.action === 'ignore');
      const categories = [...new Set(ignoreSignals.map(s => s.category).filter(Boolean))];
      const sources = [...new Set(ignoreSignals.map(s => s.source).filter(Boolean))];

      return {
        categories,
        sources,
        signals: signals.slice(-50), // 只返回最近50条
      };
    } catch (err) {
      console.error('[MemoryBridge] 获取偏好信号失败:', err.message);
      return { categories: [], sources: [], signals: [] };
    }
  }

  /**
   * 获取用户关注的分类和来源（从偏好中）
   */
  async getFollowing() {
    const prefs = await this.getPreferences();
    return {
      categories: prefs.categories || [],
      sources: prefs.sources || [],
      topics: prefs.topics || [],
      keywords: prefs.keywords || [],
      techDirections: prefs.techDirections || [],
    };
  }
}

module.exports = MemoryBridge;