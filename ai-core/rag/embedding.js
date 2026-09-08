/**
 * RAG Embedding - 向量嵌入服务
 * 
 * 支持硅基流动 BGE-M3 等 Embedding 模型。
 * 向量检索失败时自动回退到 BM25。
 * 
 * 从原 ai-rag.js EMBED_PROVIDERS 和 getEmbedConfig() 迁移而来。
 */

const https = require('https');
const { URL } = require('url');

const EMBED_PROVIDERS = {
  siliconflow: {
    name: 'siliconflow',
    endpoint: 'https://api.siliconflow.cn/v1/embeddings',
    model: 'BAAI/bge-m3',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    dimensions: 1024,
  },
};

class RAGEmbedding {
  constructor(options = {}) {
    this.options = options;
    this.provider = options.provider || 'siliconflow';
    this.apiKey = options.apiKey || process.env.SILICONFLOW_API_KEY || '';
    this.config = EMBED_PROVIDERS[this.provider];
  }

  /**
   * 检查是否可用
   */
  isAvailable() {
    return !!this.apiKey && !!this.config;
  }

  /**
   * 生成文本的向量嵌入
   * @param {string|Array<string>} text - 文本或文本数组
   * @returns {Promise<Array<number>>} 向量
   */
  async embed(text) {
    if (!this.isAvailable()) {
      throw new Error('Embedding 服务不可用：未配置 API Key');
    }

    const input = Array.isArray(text) ? text : [text];
    const body = {
      model: this.config.model,
      input,
      dimensions: this.config.dimensions,
    };

    const response = await this._post(this.config.endpoint, body, this.apiKey);
    if (Array.isArray(text)) {
      return response.data.map(d => d.embedding);
    }
    return response.data[0].embedding;
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * 批量生成文档向量并保存
   */
  async buildDocumentEmbeddings(docs, outputFile) {
    if (!this.isAvailable()) {
      console.warn('[RAGEmbedding] 跳过向量索引构建：未配置 API Key');
      return null;
    }

    console.log(`[RAGEmbedding] 开始构建 ${docs.length} 篇文档的向量索引...`);
    const embeddings = {};

    // 分批处理，避免请求过大
    const batchSize = 10;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const texts = batch.map(d => d.title + '\n' + d.content.substring(0, 500));
      const vectors = await this.embed(texts);
      batch.forEach((d, j) => {
        embeddings[d.id] = vectors[j];
      });
      console.log(`[RAGEmbedding] 进度: ${Math.min(i + batchSize, docs.length)}/${docs.length}`);
    }

    const fs = require('fs');
    const path = require('path');
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFile, JSON.stringify({
      version: '1.0',
      model: this.config.model,
      dimensions: this.config.dimensions,
      createdAt: new Date().toISOString(),
      embeddings,
    }), 'utf-8');

    console.log(`[RAGEmbedding] 向量索引构建完成：${docs.length} 篇文档`);
    return embeddings;
  }

  _post(endpoint, body, apiKey) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const postData = JSON.stringify(body);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 60000,
        // 禁用 keep-alive 连接池复用，避免复用过期 TLS 连接引发偶发底层错误
        agent: false,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || data.substring(0, 200)}`));
            }
          } catch (e) {
            reject(new Error(`响应JSON解析失败: ${data.substring(0, 500)}`));
          }
        });
        // 响应流错误处理：连接中途重置时避免未处理的 error 事件导致进程异常
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.write(postData);
      req.end();
    });
  }
}

module.exports = RAGEmbedding;
module.exports.EMBED_PROVIDERS = EMBED_PROVIDERS;
