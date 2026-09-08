/**
 * RadarItem - 信息雷达数据结构
 * 
 * 定义信息项的完整数据结构和工厂方法。
 * 所有字段严格按照实施方案定义，不额外添加。
 */

const crypto = require('crypto');

class RadarItem {
  constructor(data = {}) {
    this.id = data.id || RadarItem.generateId();
    this.title = data.title || '';
    this.url = data.url || '';
    this.source = data.source || '';
    this.sourceType = data.sourceType || 'rss';
    this.publishedAt = data.publishedAt || null;
    this.collectedAt = data.collectedAt || new Date().toISOString();
    this.category = data.category || '未分类';
    this.summary = data.summary || '';
    this.content = data.content || '';
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.relevanceScore = typeof data.relevanceScore === 'number' ? data.relevanceScore : 0;
    this.importanceScore = typeof data.importanceScore === 'number' ? data.importanceScore : 0;
    this.relevanceReason = data.relevanceReason || '';
    this.status = data.status || 'new'; // new / read / saved / ignored / later
    this.relatedKnowledge = Array.isArray(data.relatedKnowledge) ? data.relatedKnowledge : [];
    this.relatedProjects = Array.isArray(data.relatedProjects) ? data.relatedProjects : [];
    this.isRead = data.isRead === true || data.isRead === 1;
    this.isSaved = data.isSaved === true || data.isSaved === 1;
    this.userNote = data.userNote || '';
    this.visibility = data.visibility || 'private';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * 生成唯一 ID
   */
  static generateId() {
    return `radar_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * 从 URL 生成哈希（用于去重）
   */
  static urlHash(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * 转换为数据库存储格式（数组/对象序列化为 JSON 字符串）
   */
  toDB() {
    return {
      id: this.id,
      title: this.title,
      url: this.url,
      source: this.source,
      source_type: this.sourceType,
      published_at: this.publishedAt,
      collected_at: this.collectedAt,
      category: this.category,
      summary: this.summary,
      content: this.content,
      tags: JSON.stringify(this.tags),
      relevance_score: this.relevanceScore,
      importance_score: this.importanceScore,
      relevance_reason: this.relevanceReason,
      status: this.status,
      related_knowledge: JSON.stringify(this.relatedKnowledge),
      related_projects: JSON.stringify(this.relatedProjects),
      is_read: this.isRead ? 1 : 0,
      is_saved: this.isSaved ? 1 : 0,
      user_note: this.userNote,
      visibility: this.visibility,
      created_at: this.createdAt,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * 从数据库行创建 RadarItem
   */
  static fromDB(row) {
    if (!row) return null;
    return new RadarItem({
      id: row.id,
      title: row.title,
      url: row.url,
      source: row.source,
      sourceType: row.source_type,
      publishedAt: row.published_at,
      collectedAt: row.collected_at,
      category: row.category,
      summary: row.summary,
      content: row.content,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      relevanceScore: row.relevance_score,
      importanceScore: row.importance_score,
      relevanceReason: row.relevance_reason,
      status: row.status,
      relatedKnowledge: typeof row.related_knowledge === 'string' ? JSON.parse(row.related_knowledge) : row.related_knowledge,
      relatedProjects: typeof row.related_projects === 'string' ? JSON.parse(row.related_projects) : row.related_projects,
      isRead: row.is_read === 1 || row.is_read === true,
      isSaved: row.is_saved === 1 || row.is_saved === true,
      userNote: row.user_note,
      visibility: row.visibility,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  /**
   * 转换为 API 响应格式（隐藏内部字段，截断长内容）
   */
  toAPI() {
    return {
      id: this.id,
      title: this.title,
      url: this.url,
      source: this.source,
      sourceType: this.sourceType,
      publishedAt: this.publishedAt,
      collectedAt: this.collectedAt,
      category: this.category,
      summary: this.summary,
      content: this.content ? this.content.substring(0, 2000) : '',
      tags: this.tags,
      relevanceScore: this.relevanceScore,
      importanceScore: this.importanceScore,
      relevanceReason: this.relevanceReason,
      status: this.status,
      relatedKnowledge: this.relatedKnowledge,
      relatedProjects: this.relatedProjects,
      isRead: this.isRead,
      isSaved: this.isSaved,
      userNote: this.userNote,
    };
  }

  /**
   * 验证必要字段
   */
  validate() {
    const errors = [];
    if (!this.title) errors.push('title is required');
    if (!this.url) errors.push('url is required');
    if (!this.source) errors.push('source is required');
    return { valid: errors.length === 0, errors };
  }
}

module.exports = RadarItem;