/**
 * Knowledge Tools - 知识工具
 * 基于 Obsidian Vault 的知识检索、获取和保存
 * 底层复用 RAG 索引引擎和 Obsidian 文件系统
 */

const indexer = require('../../rag/indexer');
const vault = require('../../obsidian/vault');
const aiClient = require('../client');

// 轻量关键词检索：RAG 索引尚未构建完成时，直接扫描 vault 的 md 文件作为降级
function fallbackKeywordSearch(query, limit) {
  const paths = vault.getAllIndexPaths().filter(p => p && require('fs').existsSync(p));
  if (paths.length === 0) return [];

  const fs = require('fs');
  const path = require('path');
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
  paths.forEach(walk);

  const q = query.toLowerCase();
  const results = [];
  for (const fullPath of files) {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const title = path.basename(fullPath, '.md');
      const contentScore = (content.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const titleScore = (title.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (contentScore > 0) {
        results.push({
          id: fullPath,
          filePath: fullPath,
          heading: title,
          content: content.substring(0, 800),
          score: contentScore + titleScore * 3,
          mode: 'fallback',
        });
      }
    } catch (e) {
      // 跳过无法读取的文件
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ========== knowledge.search ==========

const knowledgeSearch = {
  name: 'knowledge.search',
  description: '搜索用户的知识库（Obsidian 笔记），根据关键词或自然语言问题找到相关的笔记片段。使用混合检索（BM25 + 向量）。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或自然语言问题',
      },
      limit: {
        type: 'integer',
        description: '返回结果数量，默认 5，最多 20',
        default: 5,
      },
    },
    required: ['query'],
  },
  async execute(args) {
    const { query, limit = 5 } = args;
    const safeLimit = Math.min(Math.max(limit, 1), 20);

    // RAG 索引尚未构建完成时，回退到轻量关键词检索，保证 AI 有数据可用
    let results;
    if (indexer.getStatus().totalChunks === 0) {
      results = fallbackKeywordSearch(query, safeLimit);
    } else {
      results = await indexer.search(query, {
        limit: safeLimit,
        mode: 'hybrid',
        source: 'all',
      });
    }

    // 结构化返回：只返回必要字段，不返回完整内容
    return {
      query,
      total: results.length,
      results: results.map(r => ({
        id: r.id,
        title: r.heading || r.filePath,
        path: r.filePath,
        excerpt: r.content ? r.content.substring(0, 300) : '',
        score: r.score,
        mode: r.mode,
      })),
    };
  },
};

// ========== knowledge.get ==========

const knowledgeGet = {
  name: 'knowledge.get',
  description: '获取一篇笔记的完整内容。需要知道笔记的相对路径（从 knowledge.search 的结果中获取 path 字段）。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '笔记的相对路径（相对于 Obsidian Vault 根目录），例如 "AI/工具使用.md"',
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const { path } = args;
    const note = vault.getNote(path);

    if (!note) {
      return {
        success: false,
        error: {
          code: 'KNOWLEDGE_NOT_FOUND',
          message: `笔记不存在: ${path}`,
        },
      };
    }

    // 返回结构化内容，不暴露绝对路径
    return {
      title: note.title,
      path: note.path,
      frontmatter: note.frontmatter || {},
      content: note.content,
      size: note.size,
      modifiedAt: note.mtime,
    };
  },
};

// ========== knowledge.save ==========

const knowledgeSave = {
  name: 'knowledge.save',
  description: '保存一篇新笔记到用户的知识库（Obsidian Vault）。会自动添加 YAML Front Matter（标题、创建时间）。这是写入操作，请确认用户意图后再调用。',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '笔记标题',
      },
      content: {
        type: 'string',
        description: '笔记正文内容（Markdown 格式）',
      },
      folder: {
        type: 'string',
        description: '存放文件夹（相对于 Vault 根目录），默认为根目录。例如 "AI/学习笔记"',
        default: '',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '笔记标签列表',
      },
    },
    required: ['title', 'content'],
  },
  async execute(args) {
    const { title, content, folder = '', tags = [] } = args;

    // 构建 YAML Front Matter
    const dateStr = new Date().toISOString();
    let frontmatter = `---\ntitle: "${title}"\ncreated: ${dateStr}\n`;
    if (tags.length > 0) {
      frontmatter += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
    }
    frontmatter += `---\n\n`;

    const fullContent = frontmatter + content;

    // 构建相对路径
    const path = require('path');
    const fileName = `${title}.md`;
    const relPath = folder ? path.join(folder, fileName) : fileName;

    try {
      const fullPath = vault.writeNote(relPath, fullContent);

      // 写入后触发增量索引（异步，不阻塞返回）
      indexer.indexFile(fullPath, true).catch(err => {
        console.warn(`[KnowledgeTool] 索引新笔记失败: ${err.message}`);
      });

      return {
        success: true,
        title,
        path: relPath,
        message: `笔记已保存到知识库: ${relPath}`,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'KNOWLEDGE_SAVE_ERROR',
          message: `保存笔记失败: ${err.message}`,
        },
      };
    }
  },
};

// ========== knowledge.compare ==========

const knowledgeCompare = {
  name: 'knowledge.compare',
  description: '对比知识库中与指定主题最接近的若干笔记，说明每篇相关的理由，以及它们在侧重点或结论上的差异。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '想要对比的主题或查询',
      },
      limit: {
        type: 'integer',
        description: '返回最接近的篇数，默认 3，最多 5',
        default: 3,
      },
    },
    required: ['query'],
  },
  async execute(args) {
    const { query, limit = 3 } = args;
    const safeLimit = Math.min(Math.max(limit, 1), 5);

    // 检索较宽的候选集，再按文件去重（保留每个文件最高相关片段）
    let chunks;
    if (indexer.getStatus().totalChunks === 0) {
      chunks = fallbackKeywordSearch(query, 30);
    } else {
      chunks = await indexer.search(query, { limit: 30, mode: 'hybrid', source: 'all' });
    }
    if (!chunks || !chunks.length) {
      return { query, total: 0, results: [], analysis: `知识库中没有与「${query}」相关的笔记` };
    }

    const byFile = new Map();
    for (const c of chunks) {
      const key = c.filePath;
      if (!key) continue;
      if (!byFile.has(key) || (c.score ?? 0) > (byFile.get(key).score ?? -1)) {
        byFile.set(key, { title: c.heading || c.filePath, path: c.filePath, content: c.content, score: c.score ?? 0 });
      }
    }
    const top = [...byFile.values()].sort((a, b) => b.score - a.score).slice(0, safeLimit);

    // 用 LLM 说明每篇为何贴合主题，以及彼此侧重点的差异
    const listText = top.map((r, i) =>
      `第${i + 1}篇（相关度 ${Number(r.score).toFixed(4)}）\n标题: ${r.title}\n路径: ${r.path}\n摘要: ${(r.content || '').substring(0, 400)}`
    ).join('\n\n---\n\n');

    let analysis = '';
    try {
      analysis = await aiClient.chat([
        {
          role: 'system',
          content: `你是知识库对比助手。用户会给出一个主题和若干篇笔记，请：
1. 指出这 ${top.length} 篇中哪篇与主题最接近，并分别给出关联理由；
2. 简要说明它们在侧重点、角度或结论上的差异；
3. 控制在 300 字内，用中文，条理、简洁、具体，不要空话。`,
        },
        { role: 'user', content: `对比主题：${query}\n\n${listText}` },
      ]);
    } catch (e) {
      analysis = `（AI 分析生成失败，但已按相关度检索出最接近的笔记。${e.message}）`;
    }

    return {
      query,
      total: top.length,
      results: top.map(r => ({
        title: r.title,
        path: r.path,
        score: Number(r.score.toFixed(4)),
        excerpt: (r.content || '').substring(0, 300),
      })),
      analysis,
    };
  },
};

// ========== 导出所有工具 ==========

module.exports = [knowledgeSearch, knowledgeGet, knowledgeSave, knowledgeCompare];
