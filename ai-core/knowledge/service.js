/**
 * Knowledge Service - 统一知识服务
 * 
 * Meet Siyi 和 Personal AI 都通过同一个知识服务获取信息。
 * 支持权限过滤：Meet Siyi 只能访问 public 知识，Personal AI 可访问全部。
 * 
 * 核心 API：
 * - searchKnowledge(query, options)  统一检索入口（含权限过滤）
 * - getDocument(id)                   获取单篇文档
 * - getProject(id)                    获取项目
 * - getMemory(query)                  获取记忆（预留）
 * - buildIndex()                      构建向量索引
 */

const path = require('path');
const fs = require('fs');

class KnowledgeService {
  constructor(options = {}) {
    this.options = options;
    this.rootDir = options.rootDir || path.join(__dirname, '..', '..');
    // Demo 模式：人格知识指向仓库内虚构创始人（避免把真实人格/个人资料当演示知识展示）
    const demoMode = process.env.APP_MODE === 'demo';
    this.publicDir = demoMode
      ? path.join(this.rootDir, 'clients', 'personal-ai', 'demo', 'persona')
      : path.join(this.rootDir, 'ai-core', 'knowledge', 'public');
    this.privateDir = path.join(this.rootDir, 'ai-core', 'knowledge', 'private');
    this.indexFile = options.indexFile || path.join(this.rootDir, 'data', 'rag-index.json');
    this._docs = null;
    this._bm25Index = null;
  }

  /**
   * 初始化：加载文档、构建索引
   */
  async init() {
    this._docs = this._loadAllDocuments();
    console.log(`[KnowledgeService] 加载 ${this._docs.length} 篇文档`);
  }

  /**
   * 统一知识检索入口
   * @param {string} query - 查询文本
   * @param {Object} options - { visibility: 'public'|'all', topK: 3, mode: 'bm25'|'embedding'|'auto' }
   * @returns {Promise<Array>} 检索结果
   */
  async searchKnowledge(query, options = {}) {
    if (!this._docs) await this.init();

    const visibility = options.visibility || 'public';
    const topK = options.topK || 3;

    // 权限过滤：Meet Siyi 只能访问 public
    let docs = this._docs;
    if (visibility === 'public') {
      docs = docs.filter(d => d.visibility === 'public');
    }

    // BM25 检索（默认，零成本）
    const results = this._searchBM25(query, docs, topK);

    return this._formatResults(results);
  }

  /**
   * 获取单篇文档
   */
  async getDocument(id) {
    if (!this._docs) await this.init();
    return this._docs.find(d => d.id === id) || null;
  }

  /**
   * 获取项目信息
   */
  async getProject(id) {
    const doc = await this.getDocument(`project-${id}`);
    return doc ? doc.content : null;
  }

  /**
   * 获取记忆（预留，初始返回空）
   */
  async getMemory(query) {
    return [];
  }

  /**
   * 构建向量索引
   */
  async buildIndex() {
    if (!this._docs) await this.init();
    // 预留：调用 Embedding API 构建向量索引
    console.log('[KnowledgeService] 索引构建（预留）');
  }

  // ========== 内部方法 ==========

  _loadAllDocuments() {
    const docs = [];

    // 加载公开知识
    if (fs.existsSync(this.publicDir)) {
      this._loadMarkdownFromDir(this.publicDir, 'public', docs);
    }

    // 加载私人知识
    if (fs.existsSync(this.privateDir)) {
      this._loadMarkdownFromDir(this.privateDir, 'private', docs);
    }

    return docs;
  }

  _loadMarkdownFromDir(dir, visibility, docs) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { metadata, body } = this._parseFrontMatter(content);
      docs.push({
        id: metadata.id || `${visibility}-${file.replace('.md', '')}`,
        title: metadata.title || file.replace('.md', ''),
        visibility: visibility,
        tags: metadata.tags || [],
        updatedAt: metadata.updatedAt || new Date().toISOString(),
        content: body,
        source: filePath,
      });
    }
  }

  _parseFrontMatter(content) {
    // 兼容 CRLF（Windows 检出）与 LF 两种换行；去掉 UTF-8 BOM
    const text = content.replace(/^\uFEFF/, '');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { metadata: {}, body: content };
    const metadata = {};
    match[1].split(/\r?\n/).forEach(line => {
      const [key, ...rest] = line.split(':');
      if (key && rest.length) {
        let value = rest.join(':').trim();
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(s => s.trim());
        }
        metadata[key.trim()] = value;
      }
    });
    return { metadata, body: match[2] };
  }

  _searchBM25(query, docs, topK) {
    if (docs.length === 0) return [];

    const BM25_K1 = 1.5;
    const BM25_B = 0.75;
    const N = docs.length;

    // 预计算文档分词和平均长度
    const docTokensList = docs.map(d => this._tokenize(d.content + ' ' + d.title));
    const avgdl = docTokensList.reduce((sum, t) => sum + t.length, 0) / N;

    // 预计算 df（文档频率）
    const df = {};
    docTokensList.forEach(tokens => {
      const unique = new Set(tokens);
      unique.forEach(t => { df[t] = (df[t] || 0) + 1; });
    });

    const queryTokens = this._tokenize(query);

    const scored = docs.map((doc, i) => {
      const tokens = docTokensList[i];
      const dl = tokens.length;
      let score = 0;

      for (const qt of queryTokens) {
        const tf = tokens.filter(t => t === qt).length;
        if (tf === 0) continue;

        // 标准 BM25 IDF：log(1 + (N - df + 0.5) / (df + 0.5))
        const dft = df[qt] || 0;
        const idf = Math.log(1 + (N - dft + 0.5) / (dft + 0.5));

        // BM25 分数
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl);
        score += idf * numerator / denominator;
      }

      return { doc, score };
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  _tokenize(text) {
    // 中文 bigram 分词
    const cleaned = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ');
    const tokens = [];
    const chars = cleaned.replace(/\s+/g, '').split('');
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.push(chars[i] + chars[i + 1]);
    }
    // 英文单词
    cleaned.split(/\s+/).filter(w => w.length > 1 && /[a-z]/.test(w)).forEach(w => tokens.push(w));
    return tokens;
  }

  _formatResults(results) {
    return results.map(r => ({
      id: r.doc.id,
      title: r.doc.title,
      visibility: r.doc.visibility,
      score: r.score,
      content: r.doc.content.substring(0, 2000),
      source: r.doc.source,
    }));
  }
}

module.exports = KnowledgeService;
