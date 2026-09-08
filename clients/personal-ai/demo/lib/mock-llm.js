/**
 * Mock LLM（Demo Mode 专用，零依赖、确定性、可离线运行）
 *
 * 生产环境调用的是 backend/src/core/ai/client.js 的 chatWithTools()，
 * 需要真实的 智谱 / DeepSeek / 硅基流动 API key。
 *
 * Demo 为了「可复现 + 无密钥」提供一个 Shape 完全一致（返回 { message, finish_reason, usage, model }）
 * 的确定性实现：
 *  1. 若对话中已含工具结果 -> 返回基于工具结果的最终回答（grounded answer）
 *  2. 否则根据用户问题关键词，脚本化地返回一个工具调用（tool_call）
 *
 * 这样 Agent 的「LLM -> 工具调用 -> 执行 -> 回填 -> 生成」完整循环可以离线跑通。
 */

class MockLLM {
  constructor(options = {}) {
    this.model = options.model || 'mock-grounded';
    this._toolCallId = 0;
  }

  // 与生产 aiClient.chatWithTools(messages, tools, model, options) 同形
  async chatWithTools(messages, tools, model, options = {}) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const hasToolResult = messages.some(m => m.role === 'tool') ||
      lastUser.includes('工具返回的结果');

    if (hasToolResult) {
      return this._finalAnswer(messages, lastUser, model);
    }
    return this._toolCall(lastUser, tools, model);
  }

  _toolCall(user, tools, model) {
    const available = (tools || []).map(t => t.function?.name);
    const pick = (name, args) => {
      if (!available.includes(name)) return null;
      return {
        id: `call_${++this._toolCallId}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      };
    };

    let call = null;
    if (/行动项|待办|action|创建任务/.test(user)) {
      // 提取标题（简化）
      const title = user.replace(/.*[,，:：]?\s*创建行动项[：:]\s*/g, '').split(/[。.!！]/)[0] || '新行动项';
      call = pick('action.create', { title });
    } else if (/记忆|remember|偏好|记住/.test(user)) {
      call = pick('memory.search', { query: user });
    } else if (/知识|笔记|内容|文档|关于|什么是|如何|怎么|技术栈|产品|安全|流程/.test(user)) {
      call = pick('search_knowledge', { query: user });
    } else {
      // 兜底也走一次知识检索，展示工具链
      call = pick('search_knowledge', { query: user });
    }

    if (!call) {
      return {
        message: { role: 'assistant', content: '（MockLLM：没有匹配任何可用工具，直接作答）' },
        finish_reason: 'stop',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        model: model,
      };
    }

    return {
      message: { role: 'assistant', content: null, tool_calls: [call] },
      finish_reason: 'tool_calls',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: model,
    };
  }

  _finalAnswer(messages, lastUser, model) {
    // 从 tool 消息提取结果
    const toolResults = messages
      .filter(m => m.role === 'tool')
      .map(m => { try { return JSON.parse(m.content); } catch { return m.content; } });

    const summary = toolResults.map(r => {
      if (r && r.success) {
        const data = r.data || {};
        const items = data.results || data.actions || [];
        if (items.length) {
          const head = items[0];
          const title = head.title || head.heading || head.name || '结果';
          const snippet = String(head.content || head.value || '').slice(0, 120);
          return `· ${title}${snippet ? ' — ' + snippet : ''}`;
        }
        return `· 返回 ${data.total !== undefined ? data.total : items.length} 条结果`;
      }
      return '· 工具返回失败';
    }).join('\n');

    return {
      message: { role: 'assistant', content: `基于工具结果回答：\n${summary || '未获取到相关结果。'}` },
      finish_reason: 'stop',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: model,
    };
  }
}

module.exports = { MockLLM };
