/**
 * Prompt Tools - Prompt 库工具
 * 基于 SQLite prompts 表的搜索、获取和保存
 */

const db = require('../../db');

// ========== prompt.search ==========

const promptSearch = {
  name: 'prompt.search',
  description: '搜索用户的 Prompt 库，根据关键词查找经过验证、可复用的 AI 方法。支持按标题、内容、场景搜索，可按分类筛选。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，匹配标题、内容和适用场景',
      },
      category: {
        type: 'string',
        description: '按分类筛选（可选），例如"通用"、"AI复盘提取"等',
      },
      limit: {
        type: 'integer',
        description: '返回结果数量，默认 10，最多 30',
        default: 10,
      },
    },
    required: ['query'],
  },
  async execute(args) {
    const { query, category, limit = 10 } = args;
    const safeLimit = Math.min(Math.max(limit, 1), 30);

    let sql = 'SELECT id, title, category, scene, effect, tags, use_count, created_at, updated_at FROM prompts WHERE 1=1';
    const params = [];

    if (query) {
      sql += ' AND (title LIKE ? OR prompt LIKE ? OR scene LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(safeLimit);

    const rows = db.query(sql, params);

    return {
      query,
      total: rows.length,
      results: rows.map(r => ({
        id: r.id,
        title: r.title,
        category: r.category,
        scene: r.scene,
        effect: r.effect,
        tags: r.tags ? this._parseTags(r.tags) : [],
        useCount: r.use_count || 0,
        updatedAt: r.updated_at,
      })),
    };
  },
  _parseTags(tagsStr) {
    try {
      const parsed = JSON.parse(tagsStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // 尝试逗号分隔
      return tagsStr.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
    }
  },
};

// ========== prompt.get ==========

const promptGet = {
  name: 'prompt.get',
  description: '获取一个 Prompt 的完整内容。需要知道 Prompt 的 ID（从 prompt.search 的结果中获取 id 字段）。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        description: 'Prompt 的 ID',
      },
    },
    required: ['id'],
  },
  async execute(args) {
    const { id } = args;
    const row = db.queryOne('SELECT * FROM prompts WHERE id = ?', [id]);

    if (!row) {
      return {
        success: false,
        error: {
          code: 'PROMPT_NOT_FOUND',
          message: `Prompt 不存在: id=${id}`,
        },
      };
    }

    return {
      id: row.id,
      title: row.title,
      content: row.prompt,
      category: row.category,
      scene: row.scene,
      effect: row.effect,
      model: row.model,
      tags: row.tags ? promptSearch._parseTags(row.tags) : [],
      iteration: row.iteration,
      parentId: row.parent_id,
      notes: row.notes,
      useCount: row.use_count || 0,
      sourceType: row.source_type || 'manual',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },
};

// ========== prompt.save ==========

const promptSave = {
  name: 'prompt.save',
  description: '保存一个新的 Prompt 到用户的 Prompt 库。这是写入操作，请确认用户意图后再调用。保存时可以标记来源（manual/review/import）。',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Prompt 标题',
      },
      content: {
        type: 'string',
        description: 'Prompt 完整内容',
      },
      category: {
        type: 'string',
        description: '分类，默认"通用"',
        default: '通用',
      },
      scene: {
        type: 'string',
        description: '适用场景描述',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签列表',
      },
      source: {
        type: 'string',
        description: '来源类型：manual（手动创建）、review（从复盘提取）、import（导入）、other',
        default: 'manual',
      },
      sourceReviewId: {
        type: 'string',
        description: '如果来源是复盘，记录复盘的标识（可选）',
      },
    },
    required: ['title', 'content'],
  },
  async execute(args) {
    const {
      title,
      content,
      category = '通用',
      scene = '',
      tags = [],
      source = 'manual',
      sourceReviewId = null,
    } = args;

    try {
      const tagsStr = JSON.stringify(tags);
      const result = db.execute(
        `INSERT INTO prompts (category, title, prompt, scene, tags, source_type, source_review_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [category, title, content, scene, tagsStr, source, sourceReviewId]
      );

      // 记录活动日志
      db.execute(
        'INSERT INTO activity_log (date, type, detail) VALUES (?, ?, ?)',
        [new Date().toISOString().slice(0, 10), 'prompt_created', title]
      );

      return {
        success: true,
        id: result.lastInsertRowid,
        title,
        category,
        message: `Prompt 已保存到库: "${title}" (id=${result.lastInsertRowid})`,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'PROMPT_SAVE_ERROR',
          message: `保存 Prompt 失败: ${err.message}`,
        },
      };
    }
  },
};

// ========== 导出所有工具 ==========

module.exports = [promptSearch, promptGet, promptSave];
