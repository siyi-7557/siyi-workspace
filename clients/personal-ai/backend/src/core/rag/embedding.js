const https = require('https');
const { URL } = require('url');
const config = require('../config');

const SILICONFLOW_API_KEY = config.get('ai.embeddingApiKey') || process.env.SILICONFLOW_API_KEY || '';
const EMBEDDING_MODEL = config.get('ai.embeddingModel') || 'BAAI/bge-m3';
const EMBEDDING_URL = config.get('ai.embeddingBaseUrl') || 'https://api.siliconflow.cn/v1/embeddings';

// Embedding缓存（hash -> vector）
const cache = new Map();
const MAX_CACHE_SIZE = 10000;

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// 使用 https 模块 POST 请求（替代 axios，避免 Node v22 下的间歇性原生崩溃）
function httpsPost(urlStr, body, apiKey, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: timeout,
      // 禁用 keep-alive 连接池复用，避免复用过期 TLS 连接引发偶发底层错误
      agent: false,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: 响应JSON解析失败`));
        }
      });
      // 响应流错误处理：连接中途重置时避免未处理的 error 事件导致进程异常
      res.on('error', (e) => reject(e));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(postData);
    req.end();
  });
}

// 批量获取Embedding
async function embed(texts) {
  if (!Array.isArray(texts)) texts = [texts];
  const results = new Array(texts.length);
  const toFetch = [];
  const fetchIndices = [];

  // 检查缓存
  texts.forEach((text, i) => {
    const key = hashText(text);
    if (cache.has(key)) {
      results[i] = cache.get(key);
    } else {
      toFetch.push(text);
      fetchIndices.push(i);
    }
  });

  if (toFetch.length === 0) return results;

  if (!SILICONFLOW_API_KEY) {
    // 没有API key时，返回简单的词频向量作为降级
    console.warn('[Embedding] 未配置SILICONFLOW_API_KEY，使用降级向量');
    toFetch.forEach((text, idx) => {
      results[fetchIndices[idx]] = fallbackVector(text);
    });
    return results;
  }

  try {
    const response = await httpsPost(
      EMBEDDING_URL,
      { model: EMBEDDING_MODEL, input: toFetch },
      SILICONFLOW_API_KEY,
      60000
    );
    response.data.forEach((item, idx) => {
      const vec = item.embedding;
      results[fetchIndices[idx]] = vec;
      // 写入缓存
      const key = hashText(toFetch[idx]);
      if (cache.size < MAX_CACHE_SIZE) cache.set(key, vec);
    });
    return results;
  } catch (err) {
    console.error('[Embedding] API调用失败:', err.message);
    // 降级
    toFetch.forEach((text, idx) => {
      results[fetchIndices[idx]] = fallbackVector(text);
    });
    return results;
  }
}

// 降级向量：简单的字符级特征（维度128）
function fallbackVector(text) {
  const dim = 128;
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    vec[code % dim] += 1;
  }
  // 归一化
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

// 余弦相似度
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = { embed, cosineSimilarity, hashText };
