/**
 * RAG 检索器（Demo Mode 自包含，零依赖）
 *
 * 忠实镜像生产实现 backend/src/core/rag/indexer.js 的
 * tokenize / bm25Search / vectorSearch / search（hybrid 加权融合）逻辑。
 *
 * 无 API key 时使用字符级降级向量（镜像生产 embedding.js 的 fallbackVector），
 * 因此 BM25 / hybrid 检索在没有任何密钥的情况下也能确定性运行。
 */

const fs = require('fs');
const path = require('path');
const { chunkFile } = require('./chunk');

const DIM = 128;

/**
 * 从目录加载并分块所有 .md 文件
 * @param {string} dir
 * @returns {Array<Object>} chunks
 */
function loadCorpus(dir) {
  const chunks = [];
  if (!fs.existsSync(dir)) return chunks;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const full = path.join(dir, file);
    const content = fs.readFileSync(full, 'utf-8');
    chunks.push(...chunkFile(content, file));
  }
  return chunks;
}

// ---- 向量（降级） ----
function embed(text) {
  const vec = new Array(DIM).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[text.charCodeAt(i) % DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---- 分词（镜像生产：英文单词 + 中文单字/双字） ----
function tokenize(text) {
  const tokens = [];
  const english = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  tokens.push(...english);
  const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
  chinese.forEach(seg => {
    for (let i = 0; i < seg.length; i++) {
      tokens.push(seg[i]);
      if (i + 1 < seg.length) tokens.push(seg[i] + seg[i + 1]);
    }
  });
  return tokens;
}

// ---- BM25 ----
function buildBM25Index(chunks) {
  const docs = chunks.map(c => tokenize(c.content));
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / (N || 1);
  const k1 = 1.5, b = 0.75;
  const df = {};
  const tf = [];
  docs.forEach(doc => {
    const freq = {};
    doc.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    tf.push(freq);
    new Set(doc).forEach(t => { df[t] = (df[t] || 0) + 1; });
  });
  return { docs, avgdl, df, tf, k1, b, N };
}

function bm25Search(query, bm25, limit = 10) {
  const { docs, avgdl, df, tf, k1, b, N } = bm25;
  if (N === 0) return [];
  const queryTerms = tokenize(query);
  const scores = new Array(N).fill(0);
  queryTerms.forEach(term => {
    if (!df[term]) return;
    const idf = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
    for (let i = 0; i < N; i++) {
      const freq = tf[i][term] || 0;
      if (!freq) continue;
      const dl = docs[i].length;
      const numerator = freq * (k1 + 1);
      const denominator = freq + k1 * (1 - b + b * dl / avgdl);
      scores[i] += idf * numerator / denominator;
    }
  });
  return scores
    .map((score, idx) => ({ index: idx, score }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function vectorSearch(query, chunks, limit = 10) {
  const q = embed(query);
  return chunks
    .map((c, idx) => ({ index: idx, score: cosineSimilarity(q, c.vector) }))
    .filter(r => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * 统一检索入口
 * @param {string} query
 * @param {Array} chunks  已加载的分块（含 vector）
 * @param {Object} options { limit, mode: 'bm25'|'vector'|'hybrid' }
 * @returns {Array<Object>} 格式化结果
 */
function search(query, chunks, options = {}) {
  const { limit = 10, mode = 'hybrid' } = options;
  if (!chunks || chunks.length === 0) return [];

  // 确保每个 chunk 有向量
  if (mode !== 'bm25' && (!chunks[0] || !chunks[0].vector)) {
    chunks.forEach(c => { c.vector = embed(c.content); });
  }

  const bm25 = buildBM25Index(chunks);

  if (mode === 'bm25') {
    return bm25Search(query, bm25, limit).map(r => formatResult(chunks[r.index], r.score, 'bm25'));
  }
  if (mode === 'vector') {
    return vectorSearch(query, chunks, limit).map(r => formatResult(chunks[r.index], r.score, 'vector'));
  }

  // hybrid：0.4 bm25 + 0.6 vector（与生产一致）
  const bm25Res = bm25Search(query, bm25, limit * 3);
  const vecRes = vectorSearch(query, chunks, limit * 3);
  const scoreMap = {};
  const maxBm25 = bm25Res[0]?.score || 1;
  const maxVec = vecRes[0]?.score || 1;

  bm25Res.forEach(r => {
    const id = chunks[r.index].id;
    scoreMap[id] = (scoreMap[id] || 0) + 0.4 * (r.score / maxBm25);
    scoreMap[id + '_chunk'] = chunks[r.index];
  });
  vecRes.forEach(r => {
    const id = chunks[r.index].id;
    scoreMap[id] = (scoreMap[id] || 0) + 0.6 * (r.score / maxVec);
    scoreMap[id + '_chunk'] = chunks[r.index];
  });

  return Object.keys(scoreMap)
    .filter(k => !k.endsWith('_chunk'))
    .map(id => ({ chunk: scoreMap[id + '_chunk'], score: scoreMap[id] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => formatResult(r.chunk, r.score, 'hybrid'));
}

function formatResult(chunk, score, mode) {
  return {
    id: chunk.id,
    filePath: chunk.filePath,
    heading: chunk.heading,
    headingPath: chunk.headingPath,
    content: chunk.content,
    tags: chunk.tags,
    score: parseFloat(score.toFixed(4)),
    mode,
  };
}

module.exports = { loadCorpus, search, embed, cosineSimilarity, tokenize };
