/**
 * 02 Ingestion - 信息采集层
 *
 * 负责从各信息源采集原始数据，去重后交给 AI 处理层。
 * 架构位置：01 Sources → 02 Ingestion → 03 Intelligence
 */

const db = require('../../../core/db');
const RadarItem = require('../models/radar-item');
const RSSAdapter = require('../01-sources/rss');
const WebpageAdapter = require('../01-sources/webpage');

class IngestionService {
  constructor(options = {}) {
    this.aiProcessor = options.aiProcessor;
    this.eventBridge = options.eventBridge;
    this.sourceAdapters = {
      rss: RSSAdapter,
      webpage: WebpageAdapter,
    };
  }

  /**
   * 触发采集
   * @param {Object} options - {sourceId?: number, force?: boolean, context?: Object}
   * @returns {Promise<Object>} 采集结果 {collected, newItems, processed, errors}
   */
  async collect(options = {}) {
    const result = {
      collected: 0,
      newItems: 0,
      processed: 0,
      errors: [],
    };

    // 获取启用的信息源
    let sources = this.getSources().filter(s => s.enabled === 1);
    if (options.sourceId) {
      sources = sources.filter(s => s.id === options.sourceId);
    }
    // 定时调度：只采集已到采集间隔的源（force 时忽略间隔）
    if (options.onlyDue && !options.force) {
      sources = sources.filter(s => this._isSourceDue(s));
    }

    const context = options.context || {};

    for (const source of sources) {
      try {
        const adapter = this._createAdapter(source);
        if (!adapter) {
          result.errors.push(`不支持的信息源类型: ${source.type}`);
          continue;
        }

        // 采集
        const rawItems = await adapter.fetch();
        result.collected += rawItems.length;

        // 去重 + 处理
        for (const rawItem of rawItems) {
          try {
            // 去重（URL 匹配）
            if (this._isDuplicate(rawItem.url)) {
              continue;
            }

            // AI 处理（03 Intelligence 层）
            const aiResult = await this.aiProcessor.process({
              ...rawItem,
              source: source.name,
              sourceType: source.type,
            }, context);

            // 创建 RadarItem
            const item = new RadarItem({
              title: rawItem.title,
              url: rawItem.url,
              source: source.name,
              sourceType: source.type,
              publishedAt: rawItem.publishedAt,
              category: aiResult.category,
              summary: aiResult.summary,
              content: rawItem.content,
              tags: aiResult.tags,
              relevanceScore: aiResult.relevanceScore,
              importanceScore: aiResult.importanceScore,
              relevanceReason: aiResult.relevanceReason,
              relatedKnowledge: aiResult.relatedKnowledge,
              relatedProjects: aiResult.relatedProjects,
              status: 'new',
            });

            // 保存
            this._saveItem(item);
            result.newItems++;
            result.processed++;

            // 记录 Event（06 Feedback 层的输出）
            if (this.eventBridge) {
              await this.eventBridge.record('radar.item.collected', {
                itemId: item.id,
                title: item.title,
                source: item.source,
                category: item.category,
                relevanceScore: item.relevanceScore,
              }, item.id);
            }
          } catch (err) {
            console.error('[Ingestion] 处理信息项失败:', err.message);
            result.errors.push(`${rawItem.title || rawItem.url}: ${err.message}`);
          }
        }

        // 更新信息源最后采集时间
        this._updateSourceLastFetched(source.id);
      } catch (err) {
        console.error(`[Ingestion] 采集信息源失败 ${source.name}:`, err.message);
        result.errors.push(`${source.name}: ${err.message}`);
      }
    }

    // 记录采集 Event
    if (this.eventBridge) {
      await this.eventBridge.record('radar.collect.triggered', {
        collected: result.collected,
        newItems: result.newItems,
        processed: result.processed,
        errors: result.errors.length,
      });
    }

    return result;
  }

  // ========== 信息源管理（01 Sources 的查询接口） ==========

  getSources() {
    return db.query('SELECT * FROM radar_sources ORDER BY created_at DESC');
  }

  // ========== 内部方法 ==========

  _createAdapter(source) {
    const AdapterClass = this.sourceAdapters[source.type];
    if (!AdapterClass) return null;
    return new AdapterClass(source);
  }

  /**
   * 判断信息源是否已到采集间隔（last_fetched_at 为 SQLite CURRENT_TIMESTAMP，UTC 无时区）
   */
  _isSourceDue(source) {
    if (!source.last_fetched_at) return true;
    const intervalMs = (source.fetch_interval || 3600) * 1000;
    const norm = String(source.last_fetched_at).replace(' ', 'T');
    const last = new Date(norm.endsWith('Z') ? norm : norm + 'Z').getTime();
    if (!last || isNaN(last)) return true;
    return Date.now() - last >= intervalMs;
  }

  /**
   * 测试单个信息源连通性（不入库）
   */
  async testSource(id) {
    const source = this.getSources().find(s => s.id === id);
    if (!source) throw new Error('信息源不存在');
    const adapter = this._createAdapter(source);
    if (!adapter) throw new Error('不支持的信息源类型: ' + source.type);
    const started = Date.now();
    const items = await adapter.fetch();
    return {
      ok: true,
      count: items.length,
      elapsedMs: Date.now() - started,
      sample: items.slice(0, 3).map(i => i.title).filter(Boolean),
    };
  }

  _isDuplicate(url) {
    if (!url) return false;
    const row = db.queryOne('SELECT id FROM radar_items WHERE url = ?', [url]);
    return !!row;
  }

  _saveItem(item) {
    const data = item.toDB();
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    db.execute(`INSERT OR IGNORE INTO radar_items (${columns}) VALUES (${placeholders})`, values);
  }

  _updateSourceLastFetched(sourceId) {
    db.execute('UPDATE radar_sources SET last_fetched_at = CURRENT_TIMESTAMP WHERE id = ?', [sourceId]);
  }
}

module.exports = { IngestionService };