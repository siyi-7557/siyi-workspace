/**
 * Siyi AI Core - 统一 AI 核心入口
 * 
 * 一个 AI Core，两个入口：
 * - Meet Siyi：公网网站，公开人格层
 * - Personal AI：本地工作台，私人助手层
 * 
 * 两者共享同一个 Knowledge Core，通过不同 System Prompt 和权限控制实现不同职责。
 */

const AIGateway = require('./gateway');
const PersonaLoader = require('./persona');
const KnowledgeService = require('./knowledge/service');
const ToolRegistry = require('./tools/registry');
const LLRouter = require('./llm/router');
const MemoryService = require('./memory/service');

class SiyiAICore {
  constructor(options = {}) {
    this.options = options;
    // 支持注入自定义知识服务（如工作台的 RAG 适配器），默认使用内置 KnowledgeService
    this.knowledge = options.knowledgeService || new KnowledgeService(options.knowledge);
    this.tools = new ToolRegistry();
    this.llm = new LLRouter(options.llm);
    this.memory = new MemoryService(options.memory);
    this.gateway = new AIGateway({
      knowledge: this.knowledge,
      tools: this.tools,
      llm: this.llm,
      memory: this.memory,
    });
    this._initialized = false;
  }

  /**
   * 初始化 AI Core：加载人格、注册工具、构建知识索引
   */
  async init() {
    if (this._initialized) return;

    // 加载人格配置
    this.personas = {
      'meet-siyi': require('./persona/meet-siyi'),
      'personal-ai': require('./persona/personal-ai'),
    };

    // 注册公开工具（两个入口都可用）
    const publicTools = require('./tools/public');
    this.tools.registerAll(publicTools);

    // 注册私人工具（仅 Personal AI 可用）
    const privateTools = require('./tools/private');
    this.tools.registerAll(privateTools);

    // 初始化知识服务
    await this.knowledge.init();

    this._initialized = true;
    console.log('[SiyiAICore] 初始化完成');
  }

  /**
   * 统一对话入口
   * @param {string} personaType - 'meet-siyi' | 'personal-ai'
   * @param {Object} input - { messages, sessionId, source }
   * @param {Object} options - { stream, model }
   * @returns {Promise<Object|ReadableStream>}
   */
  async chat(personaType, input, options = {}) {
    if (!this._initialized) await this.init();

    const persona = this.personas[personaType];
    if (!persona) {
      throw new Error(`未知的人格类型: ${personaType}，可选: meet-siyi, personal-ai`);
    }

    return this.gateway.processMessage(persona, input, options);
  }

  /**
   * 流式对话入口 - 返回 SSE 格式的 Readable stream
   */
  async chatStream(personaType, input, options = {}) {
    if (!this._initialized) await this.init();

    const persona = this.personas[personaType];
    if (!persona) {
      throw new Error(`未知的人格类型: ${personaType}，可选: meet-siyi, personal-ai`);
    }

    return this.gateway.processMessageStream(persona, input, options);
  }

  /**
   * 获取指定人格的配置
   */
  getPersona(personaType) {
    return this.personas?.[personaType];
  }

  /**
   * 获取知识服务实例
   */
  getKnowledgeService() {
    return this.knowledge;
  }

  /**
   * 获取工具注册中心
   */
  getToolRegistry() {
    return this.tools;
  }
}

module.exports = SiyiAICore;
module.exports.SiyiAICore = SiyiAICore;
module.exports.default = SiyiAICore;
