/**
 * SourceAdapter - 信息源适配器抽象基类
 * 
 * 定义信息源的统一接口，未来可以接 RSS、网页、GitHub、AI行业动态、
 * 产品更新、Newsletter 等来源。
 * 
 * 所有适配器必须继承此类并实现 fetch() 方法。
 */

class SourceAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'Unknown';
    this.url = config.url || '';
    this.type = config.type || 'unknown';
    this.category = config.category || null;
    this.timeout = config.timeout || 20000;
  }

  /**
   * 采集信息（子类必须实现）
   * @returns {Promise<Array>} 原始信息项数组，每项至少包含 {title, url, publishedAt, content}
   */
  async fetch() {
    throw new Error('SourceAdapter.fetch() must be implemented by subclass');
  }

  /**
   * 测试信息源是否可用
   * @returns {Promise<{available: boolean, error?: string, count?: number}>}
   */
  async test() {
    try {
      const items = await this.fetch();
      return {
        available: true,
        count: items.length,
      };
    } catch (err) {
      return {
        available: false,
        error: err.message,
      };
    }
  }

  /**
   * 规范化信息项（统一字段格式）
   * @param {Object} raw - 原始信息项
   * @returns {Object} 规范化后的信息项
   */
  normalize(raw) {
    return {
      title: raw.title || raw.name || '',
      url: raw.url || raw.link || '',
      publishedAt: raw.publishedAt || raw.pubDate || raw.date || new Date().toISOString(),
      content: raw.content || raw.description || raw.summary || '',
      author: raw.author || raw.creator || '',
      tags: raw.tags || raw.categories || [],
    };
  }

  /**
   * 验证配置
   * @returns {Object} {valid: boolean, errors: string[]}
   */
  validate() {
    const errors = [];
    if (!this.url) errors.push('url is required');
    if (!this.name) errors.push('name is required');
    return { valid: errors.length === 0, errors };
  }
}

module.exports = SourceAdapter;