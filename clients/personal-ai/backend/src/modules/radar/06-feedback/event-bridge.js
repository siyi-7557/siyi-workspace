/**
 * EventBridge - 与 Siyi OS Event Service 交互的桥接层
 * 
 * 职责：
 * - 记录信息雷达相关的所有事件（采集、阅读、保存、忽略等）
 * - 事件默认 private，只有明确标记 public 的事件才可被 Meet Siyi 访问
 * - 事件可用于 Memory Pipeline 分析和 Persona Proposal 生成
 */

const path = require('path');
const SIYI_OS_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..');
const { EVENT_TYPES } = require(path.join(SIYI_OS_ROOT, 'ai-core', 'event', 'service.js'));

class EventBridge {
  constructor(options = {}) {
    this.options = options;
    this.eventService = options.eventService; // Siyi OS EventService 实例
  }

  /**
   * 初始化
   */
  async init() {
    console.log('[EventBridge] 初始化完成');
  }

  /**
   * 记录事件
   * @param {string} type - 事件类型（使用 EVENT_TYPES）
   * @param {Object} payload - 事件数据
   * @param {string} itemId - 关联的信息项 ID
   * @param {Object} options - {visibility: 'private'|'public'}
   */
  async record(type, payload = {}, itemId = null, options = {}) {
    if (!this.eventService) return null;

    try {
      const event = await this.eventService.record(type, payload, itemId, {
        visibility: options.visibility || 'private',
        source: 'radar',
      });
      return event;
    } catch (err) {
      console.error('[EventBridge] 记录事件失败:', err.message);
      return null;
    }
  }

  /**
   * 查询事件
   * @param {Object} filter - {type, itemId, visibility, since, until, limit}
   */
  async query(filter = {}) {
    if (!this.eventService) return [];

    try {
      return await this.eventService.query(filter);
    } catch (err) {
      console.error('[EventBridge] 查询事件失败:', err.message);
      return [];
    }
  }

  /**
   * 获取事件统计
   */
  async getStats(filter = {}) {
    if (!this.eventService) return { total: 0, byType: {}, byDay: {} };

    try {
      return await this.eventService.getStats(filter);
    } catch (err) {
      console.error('[EventBridge] 获取统计失败:', err.message);
      return { total: 0, byType: {}, byDay: {} };
    }
  }

  /**
   * 便捷方法：记录信息采集事件
   */
  async recordCollected(item) {
    return this.record(EVENT_TYPES.RADAR_ITEM_COLLECTED, {
      itemId: item.id,
      title: item.title,
      source: item.source,
      category: item.category,
      relevanceScore: item.relevanceScore,
    }, item.id);
  }

  /**
   * 便捷方法：记录阅读事件
   */
  async recordRead(itemId) {
    return this.record(EVENT_TYPES.RADAR_ITEM_READ, { itemId }, itemId);
  }

  /**
   * 便捷方法：记录保存事件
   */
  async recordSaved(itemId, title, userNote = '') {
    return this.record(EVENT_TYPES.RADAR_ITEM_SAVED, {
      itemId,
      title,
      userNote,
    }, itemId);
  }

  /**
   * 便捷方法：记录忽略事件
   */
  async recordIgnored(itemId, category, source) {
    return this.record(EVENT_TYPES.RADAR_ITEM_IGNORED, {
      itemId,
      category,
      source,
    }, itemId);
  }

  /**
   * 便捷方法：记录采集触发事件
   */
  async recordCollectTriggered(result) {
    return this.record(EVENT_TYPES.RADAR_COLLECT_TRIGGERED, {
      collected: result.collected,
      newItems: result.newItems,
      processed: result.processed,
      errors: result.errors?.length || 0,
    });
  }
}

module.exports = { EventBridge, EVENT_TYPES };