/**
 * Tool Registry - 工具注册中心
 * 统一管理所有 Personal AI 可用的工具
 * 负责注册、查找、执行、参数校验和错误处理
 */

class ToolRegistry {
  constructor() {
    this.tools = new Map(); // name -> { definition, execute }
  }

  /**
   * 注册一个工具
   * @param {Object} tool - 工具对象
   * @param {string} tool.name - 工具名称（如 knowledge.search）
   * @param {string} tool.description - 工具描述
   * @param {Object} tool.parameters - JSON Schema 格式的参数定义
   * @param {Function} tool.execute - 执行函数 (args) => Promise<Object>
   */
  register(tool) {
    if (!tool.name || !tool.execute) {
      throw new Error(`Tool 注册失败：缺少 name 或 execute 函数`);
    }
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 ${tool.name} 已存在，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] 已注册工具: ${tool.name}`);
  }

  /**
   * 批量注册工具
   * @param {Array} tools - 工具对象数组
   */
  registerAll(tools) {
    tools.forEach(t => this.register(t));
  }

  /**
   * 获取工具定义
   * @param {string} name - 工具名称
   * @returns {Object|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具的 OpenAI 兼容格式定义
   * 用于传给 LLM 的 tools 参数
   * @returns {Array}
   */
  getDefinitions() {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
      },
    }));
  }

  /**
   * 获取所有已注册工具名称
   * @returns {Array<string>}
   */
  listNames() {
    return Array.from(this.tools.keys());
  }

  /**
   * 执行工具
   * @param {string} name - 工具名称
   * @param {Object} args - 工具参数
   * @returns {Promise<Object>} 结构化结果 { success, data, error }
   */
  async execute(name, args = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `工具不存在: ${name}`,
        },
      };
    }

    try {
      // 参数校验（必填字段）
      const validationError = this._validateArgs(tool, args);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // 执行工具
      const startTime = Date.now();
      const result = await tool.execute(args);
      const duration = Date.now() - startTime;

      // 如果工具返回了自己的 success 字段，直接使用
      if (result && typeof result === 'object' && 'success' in result) {
        return { ...result, _duration: duration, _tool: name };
      }

      // 否则包装为成功格式
      return { success: true, data: result, _duration: duration, _tool: name };
    } catch (err) {
      console.error(`[ToolRegistry] 工具执行失败 ${name}:`, err.message);
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: err.message || '工具执行失败',
          tool: name,
        },
      };
    }
  }

  /**
   * 简单的参数校验（必填字段）
   * @private
   */
  _validateArgs(tool, args) {
    const params = tool.parameters || {};
    const required = params.required || [];
    for (const field of required) {
      if (args[field] === undefined || args[field] === null || args[field] === '') {
        return {
          code: 'MISSING_PARAMETER',
          message: `缺少必填参数: ${field}`,
          field,
        };
      }
    }
    return null;
  }
}

// 全局单例
const registry = new ToolRegistry();

module.exports = registry;
