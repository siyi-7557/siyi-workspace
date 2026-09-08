/**
 * Action Tools - 统一行动项工具
 * 跨模块的行动项管理（替代各模块单独的 Todo）
 * 基于 SQLite actions 表
 */

const db = require('../../db');

// ========== action.list ==========

const actionList = {
  name: 'action.list',
  description: '列出用户的行动项（待办事项）。支持按状态、优先级、来源筛选，按优先级和截止日期排序。行动项可以来自 AI 复盘、知识、英语学习或手动创建。',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '按状态筛选：pending（待办）、done（已完成）、ignored（已忽略）。不传则返回所有状态',
      },
      priority: {
        type: 'string',
        description: '按优先级筛选：P0（紧急）、P1（重要）、P2（一般）。不传则返回所有优先级',
      },
      source: {
        type: 'string',
        description: '按来源筛选：review（复盘）、knowledge（知识）、english（英语）、manual（手动）、other。不传则返回所有来源',
      },
      limit: {
        type: 'integer',
        description: '返回数量，默认 20，最多 50',
        default: 20,
      },
    },
  },
  async execute(args) {
    const { status, priority, source, limit = 20 } = args;
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    let sql = 'SELECT * FROM actions WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (priority) {
      sql += ' AND priority = ?';
      params.push(priority);
    }
    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }

    // 排序：待办的按优先级(P0>P1>P2)和截止日期，已完成的按完成时间倒序
    sql += ` ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'ignored' THEN 1 ELSE 2 END,
      CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      due_date IS NULL, due_date ASC,
      created_at DESC
      LIMIT ?`;
    params.push(safeLimit);

    const rows = db.query(sql, params);

    // 统计
    const stats = this._getStats();

    return {
      total: rows.length,
      stats,
      results: rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        priority: r.priority,
        source: r.source,
        sourceId: r.source_id,
        dueDate: r.due_date,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  },

  _getStats() {
    try {
      const total = db.queryOne('SELECT COUNT(*) as count FROM actions')?.count || 0;
      const pending = db.queryOne("SELECT COUNT(*) as count FROM actions WHERE status='pending'")?.count || 0;
      const done = db.queryOne("SELECT COUNT(*) as count FROM actions WHERE status='done'")?.count || 0;
      const p0 = db.queryOne("SELECT COUNT(*) as count FROM actions WHERE status='pending' AND priority='P0'")?.count || 0;
      return { total, pending, done, p0 };
    } catch (e) {
      return { total: 0, pending: 0, done: 0, p0: 0 };
    }
  },
};

// ========== action.create ==========

const actionCreate = {
  name: 'action.create',
  description: '创建一个新的行动项（待办事项）。这是写入操作，请确认用户意图后再调用。可以标记来源（review/knowledge/english/manual），如果是从 AI 复盘产生的行动项，source 应为 "review"。',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '行动项标题（简洁明确）',
      },
      description: {
        type: 'string',
        description: '详细描述（可选）',
      },
      priority: {
        type: 'string',
        description: '优先级：P0（紧急）、P1（重要，默认）、P2（一般）',
        default: 'P1',
      },
      source: {
        type: 'string',
        description: '来源：review（复盘）、knowledge（知识）、english（英语）、manual（手动，默认）、other',
        default: 'manual',
      },
      sourceId: {
        type: 'string',
        description: '来源标识（例如复盘文件路径，可选）',
      },
      dueDate: {
        type: 'string',
        description: '截止日期，格式 YYYY-MM-DD（可选）',
      },
    },
    required: ['title'],
  },
  async execute(args) {
    const {
      title,
      description = '',
      priority = 'P1',
      source = 'manual',
      sourceId = null,
      dueDate = null,
    } = args;

    // 校验优先级
    const validPriorities = ['P0', 'P1', 'P2'];
    const safePriority = validPriorities.includes(priority) ? priority : 'P1';

    try {
      const result = db.execute(
        `INSERT INTO actions (title, description, status, priority, source, source_id, due_date)
         VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
        [title, description, safePriority, source, sourceId, dueDate]
      );

      return {
        success: true,
        id: result.lastInsertRowid,
        title,
        priority: safePriority,
        source,
        dueDate,
        message: `行动项已创建: "${title}" (优先级: ${safePriority})`,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'ACTION_CREATE_ERROR',
          message: `创建行动项失败: ${err.message}`,
        },
      };
    }
  },
};

// ========== action.complete ==========

const actionComplete = {
  name: 'action.complete',
  description: '标记一个行动项为已完成。需要知道行动项的 ID（从 action.list 的结果中获取 id 字段）。这是写入操作。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        description: '行动项的 ID',
      },
    },
    required: ['id'],
  },
  async execute(args) {
    const { id } = args;

    try {
      // 检查行动项是否存在
      const action = db.queryOne('SELECT * FROM actions WHERE id = ?', [id]);
      if (!action) {
        return {
          success: false,
          error: {
            code: 'ACTION_NOT_FOUND',
            message: `行动项不存在: id=${id}`,
          },
        };
      }

      // 更新状态
      db.execute(
        `UPDATE actions SET status = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      return {
        success: true,
        id,
        title: action.title,
        message: `行动项已标记完成: "${action.title}"`,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'ACTION_COMPLETE_ERROR',
          message: `更新行动项失败: ${err.message}`,
        },
      };
    }
  },
};

// ========== 导出所有工具 ==========

module.exports = [actionList, actionCreate, actionComplete];
