/**
 * 06 Feedback - 用户反馈层
 *
 * 负责处理用户对信息的操作：阅读、保存、忽略、稍后阅读、搜索、候选审核。
 * 用户操作产生 Event，输出到 Siyi OS。
 * 架构位置：05 Recommendation → 06 Feedback → Siyi OS
 */

const db = require('../../../core/db');
const RadarItem = require('../models/radar-item');

class FeedbackService {
  constructor(options = {}) {
    this.knowledgeBridge = options.knowledgeBridge;
    this.memoryBridge = options.memoryBridge;
    this.eventBridge = options.eventBridge;
    this.recommendation = options.recommendation;
  }

  // ========== 用户操作 ==========

  /**
   * 标记已读
   */
  async markAsRead(id) {
    db.execute("UPDATE radar_items SET is_read = 1, status = CASE WHEN status = 'new' THEN 'read' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    if (this.eventBridge) {
      await this.eventBridge.record('radar.item.read', { itemId: id }, id);
    }
    return this.getItem(id);
  }

  /**
   * 保存到知识库：保存即进入个人知识空间（status=approved，可在知识模块「资讯收藏」检索到）
   */
  async saveToKnowledge(id, userNote = '') {
    const item = this.getItem(id);
    if (!item) throw new Error('信息项不存在');

    // 更新信息项状态
    db.execute("UPDATE radar_items SET is_saved = 1, status = 'saved', user_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [userNote, id]);

    // 创建知识库候选
    db.execute(`
      INSERT INTO radar_saved_items (radar_item_id, source_url, original_title, summary, tags, user_note, status, visibility)
      VALUES (?, ?, ?, ?, ?, ?, 'approved', 'private')
    `, [id, item.url, item.title, item.summary, JSON.stringify(item.tags), userNote]);

    // 通过 KnowledgeBridge 创建候选（不直接写入）
    if (this.knowledgeBridge) {
      await this.knowledgeBridge.addCandidate({
        title: item.title,
        sourceUrl: item.url,
        summary: item.summary,
        tags: item.tags,
        userNote,
        source: 'radar',
        sourceItemId: id,
      });
    }

    // 记录 Event
    if (this.eventBridge) {
      await this.eventBridge.record('radar.item.saved', {
        itemId: id,
        title: item.title,
        userNote,
      }, id);
    }

    return this.getItem(id);
  }

  /**
   * 稍后阅读
   */
  async markAsLater(id) {
    db.execute("UPDATE radar_items SET status = 'later', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    if (this.eventBridge) {
      await this.eventBridge.record('radar.item.later', { itemId: id }, id);
    }
    return this.getItem(id);
  }

  /**
   * 忽略此类信息（记录偏好信号到 Memory）
   */
  async ignoreItem(id) {
    const item = this.getItem(id);
    if (!item) throw new Error('信息项不存在');

    db.execute("UPDATE radar_items SET status = 'ignored', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    // 记录偏好信号到 Memory（04 Context 层）
    if (this.memoryBridge) {
      await this.memoryBridge.recordPreferenceSignal('ignore', {
        category: item.category,
        source: item.source,
        itemId: id,
      });
    }

    // 记录 Event
    if (this.eventBridge) {
      await this.eventBridge.record('radar.item.ignored', {
        itemId: id,
        category: item.category,
        source: item.source,
      }, id);
    }

    return this.getItem(id);
  }

  /**
   * 获取"为什么推荐给我"（调用 05 Recommendation 层）
   */
  async getWhyRecommended(id, context = {}) {
    const item = this.getItem(id);
    if (!item) throw new Error('信息项不存在');
    return this.recommendation.getWhyRecommended(item, context);
  }

  // ========== 信息查询 ==========

  getItem(id) {
    const row = db.queryOne('SELECT * FROM radar_items WHERE id = ?', [id]);
    const item = RadarItem.fromDB(row);
    return item ? item.toAPI() : null;
  }

  getItems(options = {}) {
    const {
      status,
      category,
      source,
      isRead,
      isSaved,
      sortBy = 'relevance',
      page = 1,
      pageSize = 20,
    } = options;

    let sql = 'SELECT * FROM radar_items WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (source) { sql += ' AND source = ?'; params.push(source); }
    if (isRead !== undefined) { sql += ' AND is_read = ?'; params.push(isRead ? 1 : 0); }
    if (isSaved !== undefined) { sql += ' AND is_saved = ?'; params.push(isSaved ? 1 : 0); }
    // 按采集时间窗口过滤（留存最近 N 天记录）
    if (options.days) {
      const cutoff = new Date(Date.now() - parseInt(options.days) * 86400000).toISOString();
      sql += ' AND collected_at >= ?';
      params.push(cutoff);
    }

    if (sortBy === 'time') {
      sql += ' ORDER BY published_at DESC, collected_at DESC';
    } else if (sortBy === 'importance') {
      sql += ' ORDER BY importance_score DESC';
    } else {
      sql += ' ORDER BY relevance_score DESC, collected_at DESC';
    }

    const offset = (page - 1) * pageSize;
    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    const rows = db.query(sql, params);
    const items = rows.map(row => RadarItem.fromDB(row));

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').split(' ORDER BY')[0].split(' LIMIT')[0];
    const countResult = db.queryOne(countSql, params.slice(0, params.length - 2));

    return {
      items: items.map(i => i.toAPI()),
      total: countResult?.total || 0,
      page,
      pageSize,
    };
  }

  // ========== 搜索 ==========

  searchItems(q, options = {}) {
    if (!q || !q.trim()) {
      return { items: [], total: 0, page: options.page || 1, pageSize: options.pageSize || 20 };
    }
    const page = parseInt(options.page) || 1;
    const pageSize = parseInt(options.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const searchPattern = '%' + q + '%';
    const total = db.queryOne(
      'SELECT COUNT(*) as cnt FROM radar_items WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ?',
      [searchPattern, searchPattern, searchPattern, searchPattern]
    ).cnt;
    const rows = db.query(
      'SELECT * FROM radar_items WHERE title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags LIKE ? ORDER BY relevance_score DESC, collected_at DESC LIMIT ? OFFSET ?',
      [searchPattern, searchPattern, searchPattern, searchPattern, pageSize, offset]
    );
    const items = rows.map(row => {
      const item = RadarItem.fromDB(row);
      return item ? item.toAPI() : null;
    }).filter(Boolean);
    return { items, total, page, pageSize };
  }

  // ========== 知识库候选审核 ==========

  getSavedItems(options = {}) {
    const page = parseInt(options.page) || 1;
    const pageSize = parseInt(options.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const status = options.status || 'pending';
    let whereClause = '';
    const params = [];
    if (status && status !== 'all') {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }
    const total = db.queryOne(
      'SELECT COUNT(*) as cnt FROM radar_saved_items ' + whereClause,
      params
    ).cnt;
    const rows = db.query(
      'SELECT * FROM radar_saved_items ' + whereClause + ' ORDER BY saved_at DESC LIMIT ? OFFSET ?',
      [...params, pageSize, offset]
    );
    const items = rows.map(row => ({
      id: row.id,
      radarItemId: row.radar_item_id,
      sourceUrl: row.source_url,
      originalTitle: row.original_title,
      summary: row.summary,
      tags: row.tags ? JSON.parse(row.tags) : [],
      userNote: row.user_note,
      savedAt: row.saved_at,
      status: row.status,
      visibility: row.visibility,
    }));
    return { items, total, page, pageSize };
  }

  async approveSavedItem(id, visibility = 'private') {
    const item = db.queryOne('SELECT * FROM radar_saved_items WHERE id = ?', [id]);
    if (!item) throw new Error('候选不存在');
    db.execute('UPDATE radar_saved_items SET status = ?, visibility = ? WHERE id = ?', ['approved', visibility, id]);
    if (this.knowledgeBridge) {
      try { await this.knowledgeBridge.approveCandidate(item.radar_item_id, visibility); }
      catch (err) { console.error('[Feedback] 批准候选时 KnowledgeBridge 调用失败:', err.message); }
    }
    if (this.eventBridge) {
      try { await this.eventBridge.record('radar.item.approved', { savedItemId: id, title: item.original_title, visibility }, item.radar_item_id); }
      catch (err) { console.error('[Feedback] 记录事件失败:', err.message); }
    }
    return { success: true, id, status: 'approved' };
  }

  async rejectSavedItem(id) {
    const item = db.queryOne('SELECT * FROM radar_saved_items WHERE id = ?', [id]);
    if (!item) throw new Error('候选不存在');
    db.execute('UPDATE radar_saved_items SET status = ? WHERE id = ?', ['rejected', id]);
    if (this.eventBridge) {
      try { await this.eventBridge.record('radar.item.rejected', { savedItemId: id, title: item.original_title }, item.radar_item_id); }
      catch (err) { console.error('[Feedback] 记录事件失败:', err.message); }
    }
    return { success: true, id, status: 'rejected' };
  }
}

module.exports = { FeedbackService };