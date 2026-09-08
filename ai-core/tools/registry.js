/**
 * Tool Registry - 工具注册中心
 * 
 * 统一管理所有 AI 可用的工具，负责注册、查找、执行、权限过滤。
 * 
 * 工具分类：
 * - public：Meet Siyi 和 Personal AI 均可调用
 * - private：仅 Personal AI 可调用
 * - frontend：仅特定前端可用（如 Meet Siyi 网站的页面导航）
 */

class ToolRegistry {
  constructor() {
    this.tools = new Map(); // name -> { definition, execute, category }
  }

  /**
   * 注册一个工具
   * @param {Object} tool - { name, description, parameters, execute, category }
   */
  register(tool) {
    if (!tool.name || !tool.execute) {
      throw new Error(`Tool 注册失败：缺少 name 或 execute 函数`);
    }
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 ${tool.name} 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, {
      definition: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
      },
      execute: tool.execute,
      category: tool.category || 'public',
    });
    console.log(`[ToolRegistry] 已注册工具: ${tool.name} (${tool.category})`);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools) {
    tools.forEach(t => this.register(t));
  }

  /**
   * 获取工具定义
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具的 OpenAI 兼容格式定义
   * @param {string|Array} category - 'public' | 'private' | 'all' | 具体工具名数组（支持通配符，如 'knowledge.*'）
   */
  getToolDefinitions(category = 'all') {
    let tools = Array.from(this.tools.values());
    if (category === 'public') {
      tools = tools.filter(t => t.category === 'public');
    } else if (category === 'private') {
      tools = tools.filter(t => t.category === 'private' || t.category === 'public');
    } else if (Array.isArray(category)) {
      // 支持通配符模式，如 'knowledge.*' 匹配 'knowledge.search', 'knowledge.get' 等
      const patterns = category.map(p => {
        if (p.includes('*')) {
          // 将通配符转换为正则
          const regexStr = '^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
          return new RegExp(regexStr);
        }
        return p; // 精确匹配
      });
      tools = tools.filter(t => {
        return patterns.some(pattern => {
          if (pattern instanceof RegExp) {
            return pattern.test(t.definition.name);
          }
          return pattern === t.definition.name;
        });
      });
    }
    return tools.map(t => ({
      type: 'function',
      function: t.definition,
    }));
  }

  /**
   * 执行工具
   * @param {string} name - 工具名
   * @param {Object} args - 工具参数
   * @param {Object} context - 上下文（sessionId, personaType 等）
   * @returns {Promise<Object>}
   */
  async execute(name, args = {}, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`工具不存在: ${name}`);
    }

    // 权限校验：Meet Siyi 不能调用 private 工具
    if (context.personaType === 'meet-siyi' && tool.category === 'private') {
      return { success: false, error: `权限不足：Meet Siyi 不能调用 private 工具 ${name}` };
    }

    try {
      const result = await tool.execute(args, context);
      return { success: true, data: result };
    } catch (err) {
      console.error(`[ToolRegistry] 工具 ${name} 执行失败:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取所有工具名
   */
  listNames() {
    return Array.from(this.tools.keys());
  }

  /**
   * 按分类获取工具名
   */
  listByCategory(category) {
    return Array.from(this.tools.entries())
      .filter(([, t]) => t.category === category)
      .map(([name]) => name);
  }
}

module.exports = ToolRegistry;
