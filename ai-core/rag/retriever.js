/**
 * RAG Retriever - 检索器
 * 
 * 支持 BM25 关键词检索和 Embedding 向量检索双模式。
 * 向量检索失败时自动回退到 BM25。
 * 
 * 从原 ai-rag.js 迁移而来，作为 Knowledge Service 的底层检索引擎。
 */

const BM25_K1 = 1.5;
const BM25_B = 0.75;
const TOP_K = 3;

class RAGRetriever {
  constructor(options = {}) {
    this.options = options;
    this._bm25Index = null;
    this._docs = null;
  }

  /**
   * 构建 BM25 索引
   */
  buildIndex(docs) {
    this._docs = docs;
    const docTokens = docs.map(d => this._tokenize(d.content + ' ' + d.title));
    const avgdl = docTokens.reduce((sum, t) => sum + t.length, 0) / docs.length;

    const df = {};
    docTokens.forEach(tokens => {
      const unique = new Set(tokens);
      unique.forEach(t => { df[t] = (df[t] || 0) + 1; });
    });

    this._bm25Index = { docTokens, avgdl, df, N: docs.length };
    return this._bm25Index;
  }

  /**
   * 统一检索入口
   * @param {string} query - 查询文本
   * @param {Array} docs - 文档集合
   * @param {Object} options - { topK, mode: 'bm25'|'embedding'|'auto' }
   */
  async search(query, docs, options = {}) {
    const topK = options.topK || TOP_K;
    const mode = options.mode || 'bm25';

    if (mode === 'embedding' || mode === 'auto') {
      try {
        const results = await this._searchEmbedding(query, docs, topK);
        if (results.length > 0) return results;
      } catch (err) {
        console.warn(`[RAGRetriever] 向量检索失败，回退 BM25: ${err.message}`);
      }
    }

    // BM25 检索
    return this._searchBM25(query, docs, topK);
  }

  /**
   * BM25 检索
   */
  _searchBM25(query, docs, topK) {
    if (!this._bm25Index || this._docs !== docs) {
      this.buildIndex(docs);
    }

    const queryTokens = this._tokenize(query);
    const { docTokens, avgdl, df, N } = this._bm25Index;

    const scores = docs.map((doc, i) => {
      const tokens = docTokens[i];
      let score = 0;
      for (const qt of queryTokens) {
        const tf = tokens.filter(t => t === qt).length;
        if (tf === 0) continue;
        const idf = Math.log(1 + (N - (df[qt] || 0) + 0.5) / ((df[qt] || 0) + 0.5));
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * tokens.length / avgdl);
        score += idf * numerator / denominator;
      }
      return { doc, score, index: i };
    });

    return scores
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 向量检索（预留，需配置 Embedding API）
   */
  async _searchEmbedding(query, docs, topK) {
    // 预留：调用 Embedding API 计算查询向量，与预计算文档向量做余弦相似度
    // 需要配置 SILICONFLOW_API_KEY 和 BGE-M3 模型
    return [];
  }

  /**
   * 中文 bigram 分词
   */
  _tokenize(text) {
    const cleaned = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ');
    const tokens = [];
    const chars = cleaned.replace(/\s+/g, '').split('');
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.push(chars[i] + chars[i + 1]);
    }
    cleaned.split(/\s+/).filter(w => w.length > 1 && /[a-z]/.test(w)).forEach(w => tokens.push(w));
    return tokens;
  }

  /**
   * 格式化检索结果
   */
  formatResults(results) {
    return results.map(r => ({
      id: r.doc.id,
      title: r.doc.title,
      visibility: r.doc.visibility,
      score: r.score,
      content: r.doc.content,
      source: r.doc.source,
    }));
  }
}

module.exports = RAGRetriever;
