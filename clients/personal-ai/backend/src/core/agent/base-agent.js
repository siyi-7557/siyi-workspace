/**
 * Agent 基类
 * 所有专业 Agent 都继承自这个基类
 * 提供统一的执行接口、日志、错误处理
 */
class BaseAgent {
  constructor(name, role) {
    this.name = name;
    this.role = role;
  }

  /**
   * Agent 的核心执行方法，由子类实现
   * @param {Object} input - 输入数据
   * @param {Object} context - 上下文信息（如 reviewId, session 等）
   * @returns {Promise<Object>} 执行结果
   */
  async execute(input, context = {}) {
    throw new Error(`Agent ${this.name} 未实现 execute 方法`);
  }

  /**
   * 记录日志
   */
  log(message) {
    console.log(`[Agent:${this.name}] ${message}`);
  }

  /**
   * 记录错误
   */
  error(message) {
    console.error(`[Agent:${this.name}] ❌ ${message}`);
  }

  /**
   * 记录警告
   */
  warn(message) {
    console.warn(`[Agent:${this.name}] ⚠️ ${message}`);
  }
}

module.exports = BaseAgent;
