const fs = require('fs');
const path = require('path');
const config = require('../config');
const { chunkFile } = require('./chunker');
const embedding = require('./embedding');

// 索引状态
let status = {
  totalFiles: 0,
  indexedFiles: 0,
  totalChunks: 0,
  isBuilding: false,
  lastSync: null,
  error: null,
};

// 内存索引
let index = {
  chunks: [],       // {id, filePath, heading, content, vector, tags}
  fileMap: {},      // filePath -> [chunkIds]
  fileMtimes: {},   // filePath -> mtime (ISO字符串)
  bm25Index: null,  // BM25索引
};

// 加载已有索引
function loadIndex() {
  try {
    if (fs.existsSync(config.RAG_INDEX_FILE)) {
      const data = JSON.parse(fs.readFileSync(config.RAG_INDEX_FILE, 'utf-8'));
      index.chunks = data.chunks || [];
      index.fileMap = data.fileMap || {};
      index.fileMtimes = data.fileMtimes || {};
      status.totalChunks = index.chunks.length;
      status.indexedFiles = Object.keys(index.fileMap).length;
      status.lastSync = data.lastSync || null;
      buildBM25Index();
      console.log(`[Indexer] 加载索引: ${status.indexedFiles}文件, ${status.totalChunks}块`);
    }
  } catch (err) {
    console.error('[Indexer] 加载索引失败:', err.message);
  }
}

// 保存索引
function saveIndex() {
  try {
    const data = {
      chunks: index.chunks,
      fileMap: index.fileMap,
      fileMtimes: index.fileMtimes,
      lastSync: new Date().toISOString(),
    };
    fs.writeFileSync(config.RAG_INDEX_FILE, JSON.stringify(data), 'utf-8');
    status.lastSync = data.lastSync;
  } catch (err) {
    console.error('[Indexer] 保存索引失败:', err.message);
  }
}

// 获取所有索引路径（vaultPath + extraPaths）
function getAllIndexPaths() {
  const paths = [];
  const vaultPath = config.get('vaultPath');
  if (vaultPath) paths.push(vaultPath);
  const extraPaths = config.get('extraPaths', []);
  if (Array.isArray(extraPaths)) {
    extraPaths.forEach(p => { if (p && !paths.includes(p)) paths.push(p); });
  }
  return paths;
}

// 根据完整路径计算相对路径（遍历所有索引源）
function getRelPath(fullPath) {
  const paths = getAllIndexPaths();
  for (const srcPath of paths) {
    if (fullPath.startsWith(srcPath)) {
      return path.relative(srcPath, fullPath);
    }
  }
  return fullPath;
}

// 重建索引
async function rebuildIndex(vaultPath) {
  if (status.isBuilding) {
    console.log('[Indexer] 索引正在构建中，跳过');
    return;
  }
  status.isBuilding = true;
  status.error = null;
  try {
    // 清空索引
    index.chunks = [];
    index.fileMap = {};

    // 获取所有索引路径
    const allPaths = vaultPath ? [vaultPath] : getAllIndexPaths();

    // 遍历所有路径下的md文件
    const files = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    }
    allPaths.forEach(p => {
      if (fs.existsSync(p)) walk(p);
    });
    status.totalFiles = files.length;
    status.indexedFiles = 0;

    console.log(`[Indexer] 开始重建索引，共${files.length}个文件`);

    // 分批处理，每批10个文件
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(f => indexFile(f, false)));
      status.indexedFiles = Math.min(i + batchSize, files.length);
      console.log(`[Indexer] 进度: ${status.indexedFiles}/${status.totalFiles}`);
    }

    buildBM25Index();
    saveIndex();
    status.totalChunks = index.chunks.length;
    console.log(`[Indexer] 索引重建完成: ${status.indexedFiles}文件, ${status.totalChunks}块`);
  } catch (err) {
    status.error = err.message;
    console.error('[Indexer] 索引重建失败:', err.message);
  } finally {
    status.isBuilding = false;
  }
}

// 增量索引 - 只索引修改过和新增的文件，删除已不存在的文件
async function incrementalIndex() {
  if (status.isBuilding) {
    console.log('[Indexer] 索引正在构建中，跳过');
    return { skipped: true, message: '索引正在构建中' };
  }
  status.isBuilding = true;
  status.error = null;

  const result = {
    added: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    total: 0,
  };

  try {
    // 获取所有索引路径
    const allPaths = getAllIndexPaths();

    // 遍历所有路径下的md文件
    const files = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    }
    allPaths.forEach(p => {
      if (fs.existsSync(p)) walk(p);
    });

    result.total = files.length;
    status.totalFiles = files.length;

    console.log(`[Indexer] 开始增量索引，共${files.length}个文件`);

    // 记录当前存在的文件（用于删除已不存在的文件）
    const existingRelPaths = new Set();

    // 分批处理
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(async (fullPath) => {
        try {
          const relPath = getRelPath(fullPath);
          existingRelPaths.add(relPath);

          const stat = fs.statSync(fullPath);
          const currentMtime = stat.mtime.toISOString();
          const oldMtime = index.fileMtimes[relPath];

          if (!oldMtime) {
            // 新增文件
            await indexFile(fullPath, false);
            result.added++;
          } else if (oldMtime !== currentMtime) {
            // 修改过的文件
            await indexFile(fullPath, false);
            result.updated++;
          } else {
            // 未修改的文件
            result.unchanged++;
          }
        } catch (err) {
          console.error(`[Indexer] 增量索引文件失败 ${fullPath}:`, err.message);
        }
      }));
      processed = Math.min(i + batchSize, files.length);
      status.indexedFiles = processed;
      if (processed % 50 === 0 || processed === files.length) {
        console.log(`[Indexer] 增量进度: ${processed}/${files.length} (新增${result.added}, 更新${result.updated}, 未变${result.unchanged})`);
      }
    }

    // 删除已不存在的文件
    const indexedPaths = Object.keys(index.fileMap);
    for (const relPath of indexedPaths) {
      if (!existingRelPaths.has(relPath)) {
        removeFileFromMemory(relPath);
        delete index.fileMtimes[relPath];
        result.deleted++;
      }
    }

    buildBM25Index();
    saveIndex();
    status.totalChunks = index.chunks.length;
    status.indexedFiles = Object.keys(index.fileMap).length;

    console.log(`[Indexer] 增量索引完成: 新增${result.added}, 更新${result.updated}, 删除${result.deleted}, 未变${result.unchanged}, 共${status.totalChunks}块`);
  } catch (err) {
    status.error = err.message;
    console.error('[Indexer] 增量索引失败:', err.message);
  } finally {
    status.isBuilding = false;
  }

  return result;
}

// 索引单个文件
async function indexFile(fullPath, save = true) {
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relPath = getRelPath(fullPath);
    const stat = fs.statSync(fullPath);
    const chunks = chunkFile(content, relPath);

    // 删除旧的
    removeFileFromMemory(relPath);

    // 获取embedding
    const texts = chunks.map(c => c.content);
    const vectors = await embedding.embed(texts);

    chunks.forEach((chunk, idx) => {
      chunk.vector = vectors[idx];
      index.chunks.push(chunk);
    });

    index.fileMap[relPath] = chunks.map(c => c.id);
    index.fileMtimes[relPath] = stat.mtime.toISOString();
    if (save) {
      buildBM25Index();
      saveIndex();
    }
    status.totalChunks = index.chunks.length;
    status.indexedFiles = Object.keys(index.fileMap).length;
  } catch (err) {
    console.error(`[Indexer] 索引文件失败 ${fullPath}:`, err.message);
  }
}

// 更新文件
async function updateFile(fullPath) {
  await indexFile(fullPath);
}

// 删除文件
function removeFile(fullPath) {
  const relPath = getRelPath(fullPath);
  removeFileFromMemory(relPath);
  buildBM25Index();
  saveIndex();
  status.totalChunks = index.chunks.length;
  status.indexedFiles = Object.keys(index.fileMap).length;
}

function removeFileFromMemory(relPath) {
  const ids = index.fileMap[relPath];
  if (ids) {
    const idSet = new Set(ids);
    index.chunks = index.chunks.filter(c => !idSet.has(c.id));
    delete index.fileMap[relPath];
  }
}

// 构建BM25索引
function buildBM25Index() {
  // 简单的BM25实现
  const docs = index.chunks.map(c => tokenize(c.content));
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / (N || 1);
  const k1 = 1.5, b = 0.75;

  // 文档频率
  const df = {};
  docs.forEach(doc => {
    const unique = new Set(doc);
    unique.forEach(term => { df[term] = (df[term] || 0) + 1; });
  });

  // 每个文档的词频
  const tf = docs.map(doc => {
    const freq = {};
    doc.forEach(term => { freq[term] = (freq[term] || 0) + 1; });
    return freq;
  });

  index.bm25Index = { docs, avgdl, df, tf, k1, b, N };
}

// 简单分词（中英文混合）
function tokenize(text) {
  const tokens = [];
  // 英文单词
  const english = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  tokens.push(...english);
  // 中文单字+双字
  const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
  chinese.forEach(seg => {
    for (let i = 0; i < seg.length; i++) {
      tokens.push(seg[i]);
      if (i + 1 < seg.length) tokens.push(seg[i] + seg[i + 1]);
    }
  });
  return tokens;
}

// BM25检索
function bm25Search(query, limit = 10) {
  if (!index.bm25Index || index.chunks.length === 0) return [];
  const { avgdl, df, tf, k1, b, N } = index.bm25Index;
  const queryTerms = tokenize(query);
  const scores = new Array(N).fill(0);

  queryTerms.forEach(term => {
    if (!df[term]) return;
    const idf = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
    for (let i = 0; i < N; i++) {
      const freq = tf[i][term] || 0;
      if (freq === 0) continue;
      const dl = index.bm25Index.docs[i].length;
      const numerator = freq * (k1 + 1);
      const denominator = freq + k1 * (1 - b + b * dl / avgdl);
      scores[i] += idf * numerator / denominator;
    }
  });

  const results = scores
    .map((score, idx) => ({ chunk: index.chunks[idx], score }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}

// 向量检索
async function vectorSearch(query, limit = 10) {
  if (index.chunks.length === 0) return [];
  const [queryVec] = await embedding.embed([query]);
  const results = index.chunks.map(chunk => ({
    chunk,
    score: embedding.cosineSimilarity(queryVec, chunk.vector),
  }));
  return results
    .filter(r => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// 混合检索
async function search(query, options = {}) {
  const { limit = 10, mode = 'hybrid', source = 'all', fileType = 'all' } = options;
  if (index.chunks.length === 0) return [];

  // 同文件结果去重：限制每个文件最多返回 maxPerFile 块，保证检索来源多样
  const maxPerFile = limit <= 3 ? 1 : 2;
  function diversify(results) {
    const counts = {};
    const out = [];
    for (const r of results) {
      const file = r.filePath;
      const c = counts[file] || 0;
      if (c >= maxPerFile) continue;
      counts[file] = c + 1;
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  // 过滤函数
  function matchFilter(chunk) {
    // 来源过滤
    if (source !== 'all') {
      const isCodex = chunk.filePath && (chunk.filePath.includes('codex-exports') || chunk.filePath.includes('codex'));
      if (source === 'codex' && !isCodex) return false;
      if (source === 'obsidian' && isCodex) return false;
    }
    // 文件类型过滤
    if (fileType !== 'all') {
      const ext = chunk.filePath ? chunk.filePath.split('.').pop().toLowerCase() : '';
      if (fileType === 'md' && ext !== 'md') return false;
      if (fileType === 'txt' && ext !== 'txt') return false;
    }
    return true;
  }

  if (mode === 'bm25') {
    return diversify(
      bm25Search(query, limit * 2)
        .filter(r => matchFilter(r.chunk))
        .map(r => formatResult(r.chunk, r.score, 'bm25'))
    );
  }
  if (mode === 'vector') {
    const results = await vectorSearch(query, limit * 2);
    return diversify(
      results
        .filter(r => matchFilter(r.chunk))
        .map(r => formatResult(r.chunk, r.score, 'vector'))
    );
  }

  // 混合检索：加权融合
  const bm25Results = bm25Search(query, limit * 3);
  const vectorResults = await vectorSearch(query, limit * 3);

  const scoreMap = {};
  const maxBm25 = bm25Results[0]?.score || 1;
  const maxVec = vectorResults[0]?.score || 1;

  bm25Results.forEach(r => {
    if (!matchFilter(r.chunk)) return;
    const id = r.chunk.id;
    scoreMap[id] = (scoreMap[id] || 0) + 0.4 * (r.score / maxBm25);
    scoreMap[id + '_chunk'] = r.chunk;
  });
  vectorResults.forEach(r => {
    if (!matchFilter(r.chunk)) return;
    const id = r.chunk.id;
    scoreMap[id] = (scoreMap[id] || 0) + 0.6 * (r.score / maxVec);
    scoreMap[id + '_chunk'] = r.chunk;
  });

  const fused = Object.keys(scoreMap)
    .filter(k => !k.endsWith('_chunk'))
    .map(id => ({ chunk: scoreMap[id + '_chunk'], score: scoreMap[id] }))
    .sort((a, b) => b.score - a.score)
    .map(r => formatResult(r.chunk, r.score, 'hybrid'));

  return diversify(fused);
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

function getStatus() {
  return { ...status };
}

function getChunks() {
  return index.chunks;
}

// 启动时加载索引
loadIndex();

module.exports = {
  rebuildIndex,
  incrementalIndex,
  indexFile,
  updateFile,
  removeFile,
  search,
  bm25Search,
  vectorSearch,
  getStatus,
  getChunks,
  loadIndex,
  getAllIndexPaths,
};
