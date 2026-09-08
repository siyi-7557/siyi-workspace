/**
 * Demo 工具注册中心 + 工具集（自包含，零依赖）
 *
 * 镜像生产 backend/src/core/ai/tool-registry.js 的
 * 注册/getDefinitions/execute 接口（返回 { success, data/error, _duration, _tool }）。
 *
 * 工具通过注入的回调访问语义数据源（demo 语料 + demo 记忆），
 * 因此不触碰任何真实 / 个人数据。
 */

class DemoToolRegistry {
  constructor() {
    this.tools = new Map(); // name -> { definition, execute }
  }

  register(tool) {
    if (!tool.name || !tool.execute) {
      throw new Error(`DemoTool 注册失败：缺少 name 或 execute`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools) {
    tools.forEach(t => this.register(t));
  }

  get(name) {
    return this.tools.get(name);
  }

  getDefinitions() {
    return Array.from(this.tools.values()).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    }));
  }

  listNames() {
    return Array.from(this.tools.keys());
  }

  async execute(name, args = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: { code: 'TOOL_NOT_FOUND', message: `工具不存在: ${name}` } };
    }
    // 必填校验
    const required = (tool.parameters && tool.parameters.required) || [];
    for (const f of required) {
      if (args[f] === undefined || args[f] === null || args[f] === '') {
        return { success: false, error: { code: 'MISSING_PARAMETER', message: `缺少必填参数: ${f}`, field: f } };
      }
    }
    const start = Date.now();
    try {
      const result = await tool.execute(args);
      return { success: true, data: result, _duration: Date.now() - start, _tool: name };
    } catch (err) {
      return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err.message, tool: name }, _duration: Date.now() - start, _tool: name };
    }
  }
}

/**
 * 构造 Demo 工具集
 * @param {Object} deps { retriever, chunks, memory, actions }
 */
function buildDemoTools({ chunks, memory, actions }) {
  return [
    {
      name: 'search_knowledge',
      description: '在示例知识库中检索相关内容，返回最相关的文档片段。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索查询' },
          topK: { type: 'number', description: '返回条数', default: 3 },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const { search } = require('./retriever');
        const results = search(args.query, chunks, { limit: args.topK || 3, mode: 'hybrid' });
        return { results, count: results.length, mode: 'hybrid' };
      },
    },
    {
      name: 'memory.search',
      description: '检索长期记忆，返回已保存的用户偏好 / 关键信息。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number', default: 5 } },
        required: ['query'],
      },
      execute: async (args) => {
        const results = memory.searchLongTerm(args.query, args.limit || 5);
        return { results, count: results.length };
      },
    },
    {
      name: 'memory.save',
      description: '保存一条长期记忆。',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
      execute: async (args) => {
        const saved = memory.saveLongTerm(args.key, args.value, { title: args.key });
        return { saved: true, createdAt: new Date(saved.updatedAt).toISOString() };
      },
    },
    {
      name: 'action.list',
      description: '列出当前待办行动项。',
      parameters: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
      execute: async () => {
        return { actions: Array.from(actions.values()), total: actions.size };
      },
    },
    {
      name: 'action.create',
      description: '创建一条行动项。',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: '标题' }, description: { type: 'string' } },
        required: ['title'],
      },
      execute: async (args) => {
        const id = `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const action = { id, title: args.title, description: args.description || '', status: 'pending', createdAt: Date.now() };
        actions.set(id, action);
        return { created: true, action };
      },
    },
  ];
}

module.exports = { DemoToolRegistry, buildDemoTools };
