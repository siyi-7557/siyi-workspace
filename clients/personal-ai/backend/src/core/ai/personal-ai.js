/**
 * Personal AI Service - 个人 AI 核心服务层
 * 统一的 Tool Calling 循环 + System Prompt + 上下文管理
 * 架构：一个主 AI + Tool Calling + 共享数据层（非 Multi-Agent）
 */

const aiClient = require('./client');
const toolRegistry = require('./tool-registry');
const aiLogger = require('./logger');

// ========== System Prompt ==========

const SYSTEM_PROMPT = `你是用户的 Personal AI Assistant，一个连接用户个人数据和工具的智能助手。

## 你的能力

你可以调用以下工具来访问用户的个人数据：
- knowledge.search / knowledge.get / knowledge.save — 搜索、获取、保存用户的 Obsidian 笔记
- prompt.search / prompt.get / prompt.save — 搜索、获取、保存用户的 Prompt 库
- review.search / review.get — 搜索、获取用户的 AI 复盘记录
- action.list / action.create / action.complete — 列出、创建、完成用户的行动项

## 核心规则（必须严格遵守）

1. **涉及用户个人数据时，必须先调用工具，不要直接回答。**
   - 用户问"我的知识/笔记/之前写过..." → 必须调用 knowledge.search
   - 用户问"我的 Prompt/提示词..." → 必须调用 prompt.search
   - 用户问"我的复盘/AI工作/最近学到..." → 必须调用 review.search
   - 用户问"我的待办/行动项/任务..." → 必须调用 action.list
   - 用户要求"保存/记录/创建..." → 必须调用对应的 save/create 工具

2. **不知道的事情不要编造。** 如果工具返回结果不足，诚实告知用户，不要 hallucinate。

3. **区分用户数据与模型推测。** 基于工具返回的数据回答时，说明数据来源；模型自身的推测要明确标注"根据我的理解"。

4. **Tool 返回的数据优先于模型自身猜测。** 如果工具返回了相关数据，以工具数据为准。

5. **只获取完成任务所需的数据。** 不要请求大量无关数据，使用 limit 参数限制返回数量（默认5-10条）。

6. **对重要结论说明依据。** 引用知识或复盘时，标注来源标题。

7. **对写入操作保持谨慎。** 保存知识、保存 Prompt、创建行动项等写入操作，确认用户意图后再执行。

8. **如果没有足够信息，应明确说明需要什么信息。**

## 回答风格

- 用中文回复
- 简洁、准确、有结构
- 涉及列表时用 Markdown 列表
- 涉及引用时标注来源
- 不要过度解释，直接给出答案
- 普通问候或闲聊可以直接回答，不需要调用工具`;

// ========== Personal AI Service ==========

class PersonalAIService {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 5;
    this.model = options.model || aiClient.DEFAULT_MODEL;
    this.systemPrompt = options.systemPrompt || SYSTEM_PROMPT;
  }

  /**
   * 主对话入口
   * @param {string|Array} input - 用户消息文本，或完整的消息数组
   * @param {Object} options - { model, maxIterations }
   * @returns {Promise<Object>} { reply, toolCalls, iterations, usage }
   */
  async chat(input, options = {}) {
    const model = options.model || this.model;
    const maxIterations = options.maxIterations || this.maxIterations;

    // 构建 conversation
    let conversation;
    if (typeof input === 'string') {
      conversation = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: input },
      ];
    } else if (Array.isArray(input)) {
      // 确保有 system prompt
      if (input.length === 0 || input[0].role !== 'system') {
        conversation = [{ role: 'system', content: this.systemPrompt }, ...input];
      } else {
        conversation = [...input];
      }
    } else {
      throw new Error('input 必须是字符串或消息数组');
    }

    const toolCalls = [];
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let finalReply = '';
    let iteration = 0;

    const startTime = Date.now();

    try {
      while (iteration < maxIterations) {
        iteration++;
        const tools = toolRegistry.getDefinitions();
        // 第二次调用（含tool message）使用简化conversation，避免复杂多轮结构导致的崩溃
        const hasToolResult = conversation.some(m => m.role === 'tool');
        let callConversation = conversation;
        let callTools = tools;
        if (hasToolResult) {
          // 构建简化conversation：system + user问题 + 工具结果摘要
          const userMsg = conversation.find(m => m.role === 'user');
          const toolResults = conversation.filter(m => m.role === 'tool').map(m => {
            try { return JSON.parse(m.content); } catch { return m.content; }
          });
          callConversation = [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userMsg ? userMsg.content : '' },
            { role: 'user', content: '以下是工具返回的结果，请基于这些结果回答用户的问题：\n\n' + JSON.stringify(toolResults, null, 2) },
          ];
          callTools = []; // 第二次调用不需要工具
          console.log('[PersonalAI] 使用简化conversation进行第二次调用，工具结果数:', toolResults.length);
        }

        const response = await aiClient.chatWithTools(callConversation, callTools, model, {
          tool_choice: 'auto',
        });

        const message = response.message;
        if (response.usage) {
          totalUsage.prompt_tokens += response.usage.prompt_tokens || 0;
          totalUsage.completion_tokens += response.usage.completion_tokens || 0;
          totalUsage.total_tokens += response.usage.total_tokens || 0;
        }

        // 如果有 tool_calls，执行工具
        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(`[PersonalAI] LLM 请求调用 ${message.tool_calls.length} 个工具`);

          // 将 assistant 的 tool_calls 消息加入 conversation
          conversation.push(message);

          // 执行所有工具调用
          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (e) {
              console.warn(`[PersonalAI] 工具参数解析失败: ${toolCall.function.arguments}`);
            }

            console.log(`[PersonalAI] 执行工具: ${toolName}`, JSON.stringify(toolArgs));

            const toolResult = await toolRegistry.execute(toolName, toolArgs);

            toolCalls.push({
              id: toolCall.id,
              name: toolName,
              args: toolArgs,
              result: toolResult,
              duration: toolResult._duration,
            });

            // 将工具结果加入 conversation
            conversation.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(this._sanitizeToolResult(toolResult)),
            });
          }

          // V1稳定方案：工具执行后直接返回结构化结果摘要，跳过第二次LLM调用
          // 原因：第二次LLM调用在当前环境下会间歇性导致Node.js原生模块崩溃
          // 后续可优化为：在子进程或独立服务中执行第二次LLM调用
          const resultLines = [];
          for (const tc of toolCalls) {
            const r = tc.result;
            if (r && r.success) {
              const data = r.data || {};
              const total = data.total || (data.results ? data.results.length : 0);
              resultLines.push(`✅ **${tc.name}** 执行成功，返回 ${total} 条结果`);
              if (data.results && data.results.length > 0) {
                data.results.slice(0, 5).forEach((item, idx) => {
                  const title = item.title || item.name || `结果${idx + 1}`;
                  const summary = item.summary || item.content || '';
                  resultLines.push(`  ${idx + 1}. ${title}${summary ? ' — ' + summary.substring(0, 100) : ''}`);
                });
                if (data.results.length > 5) {
                  resultLines.push(`  ... 还有 ${data.results.length - 5} 条结果`);
                }
              }
            } else {
              resultLines.push(`❌ **${tc.name}** 执行失败: ${r?.error?.message || '未知错误'}`);
            }
          }
          finalReply = `已调用 ${toolCalls.length} 个工具：\n\n${resultLines.join('\n')}\n\n（V1版本：工具结果已直接返回，AI综合总结功能将在后续版本优化）`;
          console.log('[PersonalAI] 工具执行完成，直接返回结构化结果摘要');
          break;
        }

        // 没有 tool_calls，说明是最终回复
        finalReply = message.content || '';
        console.log(`[PersonalAI] 最终回复生成完成，长度: ${finalReply.length}`);
        break;
      }

      if (!finalReply && iteration >= maxIterations) {
        finalReply = '抱歉，处理步骤过多，请简化你的需求或分步骤提问。';
        console.warn('[PersonalAI] 达到最大迭代次数');
      }

      const duration = Date.now() - startTime;

      // 记录日志
      aiLogger.logChat({
        input,
        reply: finalReply,
        toolCalls,
        iterations: iteration,
        usage: totalUsage,
        duration,
        success: true,
        model,
      });

      return {
        success: true,
        reply: finalReply,
        toolCalls,
        iterations: iteration,
        usage: totalUsage,
        duration,
      };
    } catch (err) {
      console.error('[PersonalAI] 对话失败:', err.message);

      // 记录错误日志
      aiLogger.logChat({
        input,
        reply: '',
        toolCalls,
        iterations: iteration,
        usage: totalUsage,
        duration: Date.now() - startTime,
        success: false,
        error: { code: 'AI_SERVICE_ERROR', message: err.message },
        model,
      });

      return {
        success: false,
        reply: '',
        error: {
          code: 'AI_SERVICE_ERROR',
          message: err.message || 'AI 服务异常',
        },
        toolCalls,
        iterations: iteration,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 清理工具结果，移除内部字段，确保 LLM 收到干净的数据
   * @private
   */
  _sanitizeToolResult(result) {
    const { _duration, _tool, ...clean } = result;
    // 通过 JSON 序列化/反序列化确保是纯 JSON 对象，避免循环引用或非可序列化属性
    try {
      return JSON.parse(JSON.stringify(clean));
    } catch (e) {
      console.warn('[PersonalAI] 工具结果序列化失败，返回原始对象:', e.message);
      return clean;
    }
  }

  /**
   * 获取可用工具列表（用于前端展示）
   */
  getAvailableTools() {
    return toolRegistry.listNames();
  }
}

// 全局单例
const personalAI = new PersonalAIService();

module.exports = {
  PersonalAIService,
  personalAI,
  SYSTEM_PROMPT,
};
