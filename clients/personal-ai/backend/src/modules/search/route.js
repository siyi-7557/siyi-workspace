/**
 * 知识模块路由 - 原语义检索升级为个人知识空间
 *
 * 底层统一调用 <repo>/ai-core/knowledge/service.js
 * 保留原 /api/search 接口向后兼容（顶部全局搜索使用）
 * 新增 /api/search/knowledge/* 知识空间接口
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fm = require('front-matter');

// Siyi OS AI Core 路径
const SIYI_OS_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const KnowledgeService = require(path.join(SIYI_OS_ROOT, 'ai-core', 'knowledge', 'service.js'));

// 原 RAG 检索器（保留向后兼容）
const retriever = require('../../core/rag/retriever');

// 知识服务单例
let knowledgeService = null;

// ===== 额外知识目录加载（Obsidian 笔记库、文档等） =====
const appConfig = require('../../core/config');
// Demo 模式下，知识空间只指向仓库内虚构 Vault，避免把 clients/docs 下的个人叙事文档当知识条目展示
const EXTRA_KNOWLEDGE_DIRS = appConfig.isDemo()
  ? [
      {
        path: path.join(SIYI_OS_ROOT, 'clients', 'personal-ai', 'demo', 'vault'),
        source: '知识库（演示）',
        visibility: 'public',
      },
    ]
  : [
      { path: path.join(SIYI_OS_ROOT, 'clients'), source: 'Obsidian 笔记库', visibility: 'private' },
      { path: path.join(SIYI_OS_ROOT, 'docs'), source: '项目文档', visibility: 'public' },
    ];

let extraKnowledgeCache = null;
let extraKnowledgeCacheTime = 0;
const EXTRA_CACHE_TTL = 60 * 1000; // 缓存 60 秒

// 递归扫描目录下所有 .md 文件
function scanMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过隐藏目录和 node_modules
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...scanMarkdownFiles(fullPath));
      }
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// 加载单个 Markdown 文件为知识条目
function loadMarkdownFile(filePath, baseDir, sourceLabel, visibility) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = fm(raw);
    const stat = fs.statSync(filePath);
    const relativePath = path.relative(baseDir, filePath);
    const id = 'extra-' + relativePath.replace(/[\\\/]/g, '-').replace(/\.md$/, '').toLowerCase();
    const title = parsed.attributes.title || path.basename(filePath, '.md');

    return {
      id,
      title,
      tags: parsed.attributes.tags || [],
      content: parsed.body || raw,
      source: sourceLabel,
      sourcePath: relativePath,
      visibility,
      createdAt: parsed.attributes.created || stat.birthtime,
      updatedAt: parsed.attributes.updated || stat.mtime,
      relatedKnowledge: [],
    };
  } catch (err) {
    console.error('[Knowledge] 加载文件失败:', filePath, err.message);
    return null;
  }
}

// 加载所有额外知识目录
function loadExtraKnowledge() {
  const now = Date.now();
  if (extraKnowledgeCache && (now - extraKnowledgeCacheTime) < EXTRA_CACHE_TTL) {
    return extraKnowledgeCache;
  }

  const docs = [];
  for (const dirConfig of EXTRA_KNOWLEDGE_DIRS) {
    if (!fs.existsSync(dirConfig.path)) continue;
    const files = scanMarkdownFiles(dirConfig.path);
    for (const filePath of files) {
      const doc = loadMarkdownFile(filePath, dirConfig.path, dirConfig.source, dirConfig.visibility);
      if (doc) docs.push(doc);
    }
  }

  extraKnowledgeCache = docs;
  extraKnowledgeCacheTime = now;
  console.log('[Knowledge] 额外知识目录加载完成:', docs.length, '个文件');
  return docs;
}

// 获取所有知识文档（KnowledgeService + 额外目录）
async function getAllKnowledgeDocs() {
  const service = await getKnowledgeService();
  const coreDocs = service._docs || [];
  const extraDocs = loadExtraKnowledge();
  const reportDocs = loadReviewReports();
  const radarDocs = loadRadarSavedItems();
  return [...coreDocs, ...extraDocs, ...reportDocs, ...radarDocs];
}

/**
 * 从数据库加载复盘周期报告作为知识条目
 */
function loadReviewReports() {
  try {
    const db = require('../../core/db');
    const reports = db.query(
      `SELECT id, period, start_date, end_date, title, summary, content, review_count, avg_score, total_problems, generated_at FROM period_reports ORDER BY generated_at DESC`
    );
    const periodLabels = { week: '周报', month: '月报', quarter: '季报', year: '年报' };
    return reports.map(r => ({
      id: `report-${r.id}`,
      title: r.title || `${r.start_date} 至 ${r.end_date} 成长报告`,
      content: r.content || '',
      summary: r.summary || '',
      source: 'AI 成长报告',
      sourcePath: `report://${r.id}`,
      visibility: 'private',
      tags: ['成长报告', periodLabels[r.period] || r.period],
      type: 'report',
      createdAt: r.generated_at,
      updatedAt: r.generated_at,
      reportId: r.id,
      period: r.period,
      reviewCount: r.review_count,
      avgScore: r.avg_score,
      relatedKnowledge: [],
    }));
  } catch (err) {
    console.warn('[Knowledge] 加载复盘报告失败:', err.message);
    return [];
  }
}

/**
 * 从数据库加载信息雷达保存的新闻作为知识条目
 */
function loadRadarSavedItems() {
  try {
    const db = require('../../core/db');
    const items = db.query(
      `SELECT id, radar_item_id, source_url, original_title, summary, tags, user_note, saved_at, status, visibility FROM radar_saved_items WHERE status = 'approved' ORDER BY saved_at DESC`
    );
    return items.map(item => {
      let tags = [];
      try { tags = JSON.parse(item.tags || '[]'); } catch (e) { tags = []; }
      const content = [
        item.summary || '',
        item.user_note ? `用户备注：${item.user_note}` : '',
        `来源：${item.source_url}`
      ].filter(Boolean).join('\n\n');
      return {
        id: `radar-${item.id}`,
        title: item.original_title || '未命名资讯',
        content,
        summary: (item.summary || '').substring(0, 200),
        source: '信息雷达',
        sourcePath: item.source_url,
        visibility: item.visibility || 'private',
        tags: ['资讯', ...tags],
        type: 'article',
        createdAt: item.saved_at,
        updatedAt: item.saved_at,
        radarItemId: item.radar_item_id,
        relatedKnowledge: [],
      };
    });
  } catch (err) {
    console.warn('[Knowledge] 加载信息雷达保存条目失败:', err.message);
    return [];
  }
}

/**
 * 获取或初始化知识服务
 */
async function getKnowledgeService() {
  if (!knowledgeService) {
    knowledgeService = new KnowledgeService({ rootDir: SIYI_OS_ROOT });
    await knowledgeService.init();
  }
  return knowledgeService;
}

/**
 * 推断知识类型
 * 基于 front matter 的 tags 和文件名推断，不修改底层数据
 */
function inferKnowledgeType(doc) {
  const tags = (doc.tags || []).map(t => String(t).toLowerCase());
  const id = String(doc.id || '').toLowerCase();
  const title = String(doc.title || '').toLowerCase();

  // 项目类型
  if (id.startsWith('project-') || tags.includes('项目') || title.includes('项目')) {
    return 'project';
  }
  // 概念/人格知识
  if (tags.includes('人格知识') || tags.includes('身份') || id.includes('identity') || id.includes('personality')) {
    return 'concept';
  }
  // 经验/工作方式
  if (tags.includes('工作方式') || tags.includes('思维模式') || id.includes('working') || id.includes('thinking')) {
    return 'experience';
  }
  // 学习/技能
  if (tags.includes('技能') || tags.includes('能力') || id.includes('skill') || id.includes('learning')) {
    return 'learning';
  }
  // 反思/成长
  if (tags.includes('成长') || tags.includes('反思') || id.includes('growth') || id.includes('reflection')) {
    return 'reflection';
  }
  // 资源/参考
  if (tags.includes('资源') || tags.includes('参考') || id.includes('resource')) {
    return 'resource';
  }
  // 默认笔记
  return 'note';
}

/**
 * 规范化知识来源
 * 1) 额外目录/复盘报告/信息雷达等已显式标注来源的，原样保留（环环相扣：各模块汇入知识库时带来源标签）
 * 2) 核心知识库文档的 source 是文件路径，按 private/public 目录推断
 */
const KNOWN_SOURCES = ['Obsidian 笔记库', '项目文档', 'AI 成长报告', '信息雷达'];
function inferKnowledgeSource(doc) {
  const raw = String(doc.source || '').trim();
  // 已是标准来源标签，直接保留
  if (KNOWN_SOURCES.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  // 按关键词兜底识别（防止标签写法有细微差异）
  if (lower.includes('obsidian')) return 'Obsidian 笔记库';
  if (raw.includes('成长报告') || raw.includes('报告') || lower.includes('report')) return 'AI 成长报告';
  if (raw.includes('信息雷达') || raw.includes('资讯') || lower.includes('radar')) return '信息雷达';
  if (raw.includes('项目') || lower.includes('project')) return '项目文档';
  if (lower.includes('private')) return '知识库（私人）';
  if (lower.includes('public')) return '知识库（公开）';
  return '知识库';
}

/**
 * 格式化知识文档为 API 输出
 */
function formatKnowledgeDoc(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    // 显式类型（report/article 等，来自报告/雷达模块）优先；核心库文档才按 tags 推断
    type: doc.type || inferKnowledgeType(doc),
    visibility: doc.visibility || 'private',
    tags: doc.tags || [],
    summary: doc.content ? doc.content.substring(0, 200) : '',
    content: doc.content,
    source: inferKnowledgeSource(doc),
    sourcePath: doc.sourcePath || doc.source,
    createdAt: doc.createdAt || doc.updatedAt || null,
    updatedAt: doc.updatedAt || null,
    // 预留：知识关系（当前 ai-core/knowledge 无真实关系数据）
    relatedKnowledge: doc.relatedKnowledge || [],
  };
}

// ========== 原语义检索接口（向后兼容） ==========

// 混合检索笔记
router.get('/', async (req, res) => {
  try {
    const { q, limit = 10, mode = 'hybrid', source = 'all', fileType = 'all' } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ results: [], total: 0 });
    }
    const results = await retriever.search(q, { limit: parseInt(limit), mode, source, fileType });
    res.json({ results, total: results.length, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 列出所有笔记（向后兼容）
router.get('/notes', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const vault = require('../../core/obsidian/vault');
    const notes = vault.listNotes(parseInt(page), parseInt(pageSize));
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取笔记详情（向后兼容）
router.get('/notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const vault = require('../../core/obsidian/vault');
    const note = vault.getNote(decodeURIComponent(id));
    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 新知识空间接口 ==========

/**
 * 获取知识列表
 * GET /api/search/knowledge?type=project&page=1&pageSize=20&sort=updated
 */
router.get('/knowledge', async (req, res) => {
  try {
    const { type, page = 1, pageSize = 20, sort = 'updated' } = req.query;
    // 获取所有文档（KnowledgeService + Obsidian 笔记库 + 项目文档）
    const allDocs = await getAllKnowledgeDocs();

    // 格式化并推断类型
    let items = allDocs.map(formatKnowledgeDoc);

    // 按类型过滤
    if (type && type !== 'all') {
      items = items.filter(item => item.type === type);
    }

    // 排序
    if (sort === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    } else if (sort === 'created') {
      items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else {
      // 默认按更新时间
      items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }

    const total = items.length;
    const start = (parseInt(page) - 1) * parseInt(pageSize);
    const paginated = items.slice(start, start + parseInt(pageSize));

    // 最近更新（前5条，不分页）
    const recent = items.slice(0, 5);

    res.json({
      items: paginated,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      recent,
    });
  } catch (err) {
    console.error('[Knowledge] 获取知识列表失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 知识搜索（基于 KnowledgeService BM25）
 * GET /api/search/knowledge/search?q=关键词&limit=10
 */
router.get('/knowledge/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ results: [], total: 0, query: q });
    }

    // 在所有文档中搜索（KnowledgeService BM25 + 额外目录关键词匹配）
    const allDocs = await getAllKnowledgeDocs();
    const query = q.toLowerCase();
    const matched = allDocs.filter(doc => {
      const title = String(doc.title || '').toLowerCase();
      const content = String(doc.content || '').toLowerCase();
      const tags = (doc.tags || []).map(t => String(t).toLowerCase());
      return title.includes(query) || content.includes(query) || tags.some(t => t.includes(query));
    });
    // 简单排序：标题命中 > 标签命中 > 仅正文命中，同级按更新时间
    matched.sort((a, b) => {
      const score = (doc) => {
        const t = String(doc.title || '').toLowerCase();
        const tags = (doc.tags || []).map(x => String(x).toLowerCase());
        if (t.includes(query)) return 0; // 标题命中
        if (tags.some(x => x.includes(query))) return 1; // 标签命中
        return 2; // 仅正文命中
      };
      const sa = score(a), sb = score(b);
      if (sa !== sb) return sa - sb;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    const results = matched.slice(0, parseInt(limit));
    const formatted = results.map(formatKnowledgeDoc).filter(Boolean);

    res.json({
      results: formatted,
      total: formatted.length,
      query: q,
    });
  } catch (err) {
    console.error('[Knowledge] 知识搜索失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取知识分类统计
 * GET /api/search/knowledge/stats
 */
router.get('/knowledge/stats', async (req, res) => {
  try {
    const allDocs = await getAllKnowledgeDocs();

    const typeCounts = {};
    const sourceCounts = {};
    const allTags = new Set();

    allDocs.forEach(rawDoc => {
      const doc = formatKnowledgeDoc(rawDoc);
      typeCounts[doc.type] = (typeCounts[doc.type] || 0) + 1;
      sourceCounts[doc.source] = (sourceCounts[doc.source] || 0) + 1;
      (doc.tags || []).forEach(tag => allTags.add(String(tag)));
    });

    // 按数量排序
    const sortedTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
    const sortedSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));

    res.json({
      total: allDocs.length,
      types: sortedTypes,
      sources: sortedSources,
      tags: Array.from(allTags).sort(),
    });
  } catch (err) {
    console.error('[Knowledge] 获取统计失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取知识详情
 * GET /api/search/knowledge/:id
 */
router.get('/knowledge/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allDocs = await getAllKnowledgeDocs();
    const doc = allDocs.find(d => d.id === decodeURIComponent(id));
    if (!doc) {
      return res.status(404).json({ error: '知识不存在' });
    }

    const formatted = formatKnowledgeDoc(doc);

    // 预留：相关知识（当前无真实关系数据，返回空）
    formatted.relatedKnowledge = [];

    res.json(formatted);
  } catch (err) {
    console.error('[Knowledge] 获取知识详情失败:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
