/**
 * AI Gateway - 统一 AI 网关
 * 
 * 流程编排：Persona Layer → Knowledge Service → Tool Layer → LLM Router
 * 
 * 两个 AI 入口都通过 Gateway 处理消息，Gateway 根据人格配置自动：
 * 1. 加载对应 System Prompt
 * 2. 权限过滤知识和工具
 * 3. 知识检索（RAG）
 * 4. Function Calling 循环
 * 5. 多模型降级调用
 */

class AIGateway {
  constructor(options = {}) {
    this.knowledge = options.knowledge;
    this.tools = options.tools;
    this.llm = options.llm;
    this.memory = options.memory;
    this.maxIterations = options.maxIterations || 8;
  }

  /**
   * 统一消息处理入口
   * @param {Object} persona - 人格配置（meet-siyi 或 personal-ai）
   * @param {Object} input - { messages, sessionId, source }
   * @param {Object} options - { stream, model }
   * @returns {Promise<Object|ReadableStream>}
   */
  async processMessage(persona, input, options = {}) {
    const { messages, sessionId } = input;
    const stream = options.stream !== false;

    // 1. 构建对话上下文
    let conversation = this._buildConversation(persona, messages);
    // 1.5 跨会话上下文：把本会话历史并入（客户端只发单条新消息时，补上上一轮对话）
    conversation = await this._mergeSessionHistory(conversation, sessionId, messages);

    // 2. 知识检索（RAG）——仅对真正的信息类问题检索，闲聊/简短问候跳过，避免浪费 token 与干扰人设
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    if (this._shouldRetrieve(lastUserMessage)) {
      const ragResults = await this.knowledge.searchKnowledge(lastUserMessage, {
        visibility: persona.visibility,
        topK: 3,
      });

      if (ragResults.length > 0) {
        const ragContext = this._formatRAGContext(ragResults);
        conversation = this._injectRAGContext(conversation, ragContext);
      }
    }

    // 2.5 长期记忆召回（跨会话）——检索长期记忆并注入 system 上下文
    await this._injectMemoryContext(conversation, lastUserMessage);

    // 记录本轮用户消息到会话记忆
    this._remember(sessionId, { role: 'user', content: lastUserMessage });

    // 3. 获取可用工具（权限过滤）
    const toolDefinitions = this.tools.getToolDefinitions(persona.allowedTools);

    // 4. Function Calling 循环
    let iterations = 0;
    const toolCallsInfo = [];
    while (iterations < this.maxIterations) {
      iterations++;

      // 调用 LLM
      // temperature=0.3：降低随机性，提升工具调用率和回答准确性
      const response = await this.llm.chat(conversation, {
        stream: false, // 内部用非流式，工具调用需要完整响应
        tools: toolDefinitions,
        temperature: 0.3,
        maxTokens: 4096,
      });

      const message = response.choices?.[0]?.message;
      if (!message) break;

      conversation.push(message);

      // 检查是否有工具调用
      const toolCalls = message.tool_calls || [];
      if (toolCalls.length === 0) {
        // 没有工具调用，返回最终回答
        this._remember(sessionId, { role: 'assistant', content: message.content });
        if (stream) {
          return this._streamFinalAnswer(message.content, persona);
        }
        return { reply: message.content, iterations, toolCalls: toolCallsInfo };
      }

      // 执行工具调用
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          console.warn(`[AIGateway] 工具参数解析失败: ${toolCall.function.arguments}`);
        }

        const toolStartTime = Date.now();
        const result = await this.tools.execute(toolName, toolArgs, {
          sessionId,
          personaType: persona.type,
        });
        const toolDuration = Date.now() - toolStartTime;
        const toolSuccess = !(result && typeof result === 'object' && result.success === false);

        // 完整 trace：步骤号、成功状态、耗时、结果（供前端执行轨迹展示与日志留存）
        toolCallsInfo.push({ name: toolName, args: toolArgs, step: iterations, success: toolSuccess, duration: toolDuration, result });

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    // 超出最大迭代次数后：若最后一次迭代执行了工具但未生成最终回答，补一次最终生成
    // （不带 tools，强制模型基于已有工具结果总结，避免再次陷入工具调用循环）
    const lastMsg = conversation[conversation.length - 1];
    if (lastMsg && lastMsg.role === 'tool') {
      try {
        const finalResponse = await this.llm.chat(conversation, {
          stream: false,
          temperature: 0.3,
          maxTokens: 4096,
        });
        const finalMessage = finalResponse.choices?.[0]?.message;
        if (finalMessage && finalMessage.content) {
          conversation.push(finalMessage);
        }
      } catch (err) {
        console.warn(`[AIGateway] 最终回答生成失败: ${err.message}`);
      }
    }

    // 返回最后一条 assistant 消息
    const lastMessage = conversation.filter(m => m.role === 'assistant').pop();
    if (lastMessage?.content) {
      this._remember(sessionId, { role: 'assistant', content: lastMessage.content });
    }
    return { reply: lastMessage?.content || '', iterations, toolCalls: toolCallsInfo, truncated: true };
  }

  // ========== 内部方法 ==========

  /**
   * 把本轮消息写入会话记忆（静默失败，不阻断对话主链路）
   */
  _remember(sessionId, message) {
    if (!this.memory || !sessionId || typeof this.memory.saveMessage !== 'function') return;
    try {
      this.memory.saveMessage(sessionId, message).catch(() => {});
    } catch (e) {
      // 记忆写入失败不影响回答
    }
  }

  /**
   * 长期记忆召回：把跨会话记忆注入 system 上下文（静默失败）
   */
  async _injectMemoryContext(conversation, query) {
    if (!this.memory || typeof this.memory.searchLongTerm !== 'function') return;
    if (!query || !this._shouldRetrieve(query)) return;
    try {
      const memResults = await this.memory.searchLongTerm(query, 3);
      if (Array.isArray(memResults) && memResults.length > 0) {
        const memContext = memResults
          .map(m => `- ${m.metadata?.title || m.key}：${typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}`)
          .join('\n');
        conversation[0].content += `\n\n## 长期记忆\n以下是与当前话题相关的跨会话记忆，可自然引用：\n${memContext}`;
      }
    } catch (e) {
      // 记忆召回失败不影响对话
    }
  }

  /**
   * 跨会话上下文：把 `_sessions` 里本会话的历史消息并入对话（去重，避免与客户端已传历史重复）
   */
  async _mergeSessionHistory(conversation, sessionId, messages) {
    if (!this.memory || !sessionId || typeof this.memory.getSessionHistory !== 'function') return conversation;
    try {
      const hist = await this.memory.getSessionHistory(sessionId, 10);
      if (!Array.isArray(hist) || hist.length === 0) return conversation;
      const seen = new Set(conversation.map(m => `${m.role}:${m.content}`));
      const toAdd = hist.filter(m => m.role !== 'system' && !seen.has(`${m.role}:${m.content}`));
      if (toAdd.length === 0) return conversation;
      const prior = toAdd.map(m => ({ role: m.role, content: m.content }));
      // 插在 system 之后
      conversation.splice(1, 0, ...prior);
    } catch (e) {
      // 记忆读回失败不影响对话
    }
    return conversation;
  }

  /**
   * 判断是否需要对用户消息进行知识检索
   * 简短问候/寒暄/纯情绪回复不检索，避免浪费 token 且干扰人设
   */
  _shouldRetrieve(query) {
    if (!query || typeof query !== 'string') return false;
    const q = query.trim();
    if (q.length === 0) return false;
    // 过短（≤3 字符）不检索，如"嗯""好的""继续"
    if (q.length <= 3) return false;
    // 纯寒暄/情绪表达不检索
    const casual = /^(你好|您好|哈喽|嗨|hello|hi|在吗|在么|谢谢|感谢|辛苦了|再见|拜拜|晚安|早|早上好|下午好|晚上好|好的|好|ok|好的谢谢|明白了|知道了|了解)[!！。.\s]*$/i;
    if (casual.test(q)) return false;
    return true;
  }

  _buildConversation(persona, messages) {
    const conversation = [
      { role: 'system', content: persona.systemPrompt },
    ];

    // 注入当前日期，让"最近/本周/上月"等时间表述有准确基准
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（周${weekdays[now.getDay()]}）`;
    conversation[0].content += `\n\n## 当前时间\n今天是 ${todayStr}。用户提到"最近""本周""上月"等相对时间时，以今天为基准判断具体范围。`;

    // 加入历史消息
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        conversation.push({ role: msg.role, content: msg.content });
      }
    }

    return conversation;
  }

  _formatRAGContext(results) {
    return results.map((r, i) => {
      return `【来源${i + 1}：${r.title}】\n${r.content}`;
    }).join('\n\n---\n\n');
  }

  _injectRAGContext(conversation, ragContext) {
    // 在 system prompt 后注入 RAG 上下文
    const systemMsg = conversation[0];
    systemMsg.content += `\n\n## 参考资料\n以下是从知识库中检索到的相关内容，请基于这些内容回答：\n\n${ragContext}`;
    return conversation;
  }

  async _streamFinalAnswer(content, persona) {
    // 简化实现：将完整内容模拟为流式输出
    const { Readable } = require('stream');
    const stream = new Readable({
      read() {
        this.push(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        this.push('data: [DONE]\n\n');
        this.push(null);
      },
    });
    return stream;
  }

  /**
   * 裁剪工具结果用于流式事件推送：过大结果只保留成功状态与预览，
   * 避免单条 SSE 事件过大；完整结果仍会通过 conversation 回传给模型
   */
  _trimToolResultForStream(result) {
    try {
      const str = JSON.stringify(result);
      if (!str) return null;
      if (str.length <= 2000) return result;
      const success = !(result && typeof result === 'object' && result.success === false);
      return { success, truncated: true, preview: str.substring(0, 1800) };
    } catch (e) {
      return null;
    }
  }

  /**
   * 流式消息处理 - 工具调用用非流式，最终回答用真正的 SSE 流式
   * 返回一个 Readable stream，推送 SSE 格式数据
   */
  async processMessageStream(persona, input, options = {}) {
    const { messages, sessionId } = input;
    const { Readable } = require('stream');

    // 1. 构建对话上下文
    let conversation = this._buildConversation(persona, messages);
    conversation = await this._mergeSessionHistory(conversation, sessionId, messages);

    // 2. 知识检索（RAG）——仅对真正的信息类问题检索，闲聊/简短问候跳过
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    if (this._shouldRetrieve(lastUserMessage)) {
      const ragResults = await this.knowledge.searchKnowledge(lastUserMessage, {
        visibility: persona.visibility,
        topK: 3,
      });
      if (ragResults.length > 0) {
        const ragContext = this._formatRAGContext(ragResults);
        conversation = this._injectRAGContext(conversation, ragContext);
      }
    }

    // 2.5 长期记忆召回（跨会话）——检索长期记忆并注入 system 上下文
    await this._injectMemoryContext(conversation, lastUserMessage);

    // 记录本轮用户消息到会话记忆
    this._remember(sessionId, { role: 'user', content: lastUserMessage });

    // 3. 获取工具定义
    const toolDefinitions = this.tools.getToolDefinitions(persona.allowedTools);

    // 输出流：工具循环期间实时推送 tool_start / tool_end 事件，最终回答阶段推送流式内容
    // （push 发生在 return 之前时会暂存于内部缓冲区，消费端开始读取后按序送达，顺序安全）
    const outputStream = new Readable({ read() {} });

    // 4. 工具调用循环（非流式，需要完整响应判断工具调用）
    let iterations = 0;
    let toolCallsInfo = [];
    while (iterations < this.maxIterations) {
      iterations++;
      const response = await this.llm.chat(conversation, {
        stream: false,
        tools: toolDefinitions,
        temperature: 0.3,
        maxTokens: 4096,
      });

      const message = response.choices?.[0]?.message;
      if (!message) break;
      conversation.push(message);

      const toolCalls = message.tool_calls || [];
      if (toolCalls.length === 0) {
        // 无工具调用，这是最终回答 - 改用流式获取
        break;
      }

      // 执行工具调用（实时推送 tool_start / tool_end 事件，前端可逐步渲染执行轨迹）
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          console.warn(`[AIGateway] 工具参数解析失败: ${toolCall.function.arguments}`);
        }

        outputStream.push(`data: ${JSON.stringify({ type: 'tool_start', id: toolCall.id, name: toolName, args: toolArgs, step: iterations })}\n\n`);

        const toolStartTime = Date.now();
        const result = await this.tools.execute(toolName, toolArgs, {
          sessionId,
          personaType: persona.type,
        });
        const toolDuration = Date.now() - toolStartTime;
        const toolSuccess = !(result && typeof result === 'object' && result.success === false);

        outputStream.push(`data: ${JSON.stringify({ type: 'tool_end', id: toolCall.id, name: toolName, step: iterations, success: toolSuccess, duration: toolDuration, result: this._trimToolResultForStream(result) })}\n\n`);

        toolCallsInfo.push({ name: toolName, args: toolArgs, step: iterations, success: toolSuccess, duration: toolDuration, result });

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    // 5. 流式获取最终回答
    // 移除工具调用循环中最后一条非流式 assistant 消息，用流式重新生成
    while (conversation.length > 0 && conversation[conversation.length - 1].role === 'assistant') {
      conversation.pop();
    }

    // 先推送工具调用信息（如果有）—— 兼容旧前端的兜底事件，新版前端以 tool_start/tool_end 为准
    if (toolCallsInfo.length > 0) {
      outputStream.push(`data: ${JSON.stringify({ type: 'tool_calls', toolCalls: toolCallsInfo.map(tc => ({ name: tc.name, args: tc.args, result: tc.result })) })}\n\n`);
    }

    console.log(`[AIGateway] 开始流式生成，conversation 长度: ${conversation.length}`);

    try {
      // 不传 tools：工具调用阶段已结束，最终回答强制模型基于工具结果做总结，
      // 避免流式阶段模型再次尝试调用工具而被静默丢弃
      const llmStream = await this.llm.chatStream(conversation, {
        temperature: 0.3,
        maxTokens: 4096,
      });

    let buffer = '';
    let fullContent = '';
    // 防止重复结束：LLM 流正常情况下既发 [DONE] 又触发 end 事件，
    // 必须只对输出流 push 一次 EOF，否则抛 ERR_STREAM_PUSH_AFTER_EOF
    let outputEnded = false;
    const endOutput = () => {
      if (outputEnded) return;
      outputEnded = true;
      outputStream.push('data: [DONE]\n\n');
      outputStream.push(null);
    };

    llmStream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          endOutput();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            outputStream.push(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
          }
          // 检查是否有工具调用（流式中出现工具调用说明需要继续循环）
          const toolCallDelta = parsed.choices?.[0]?.delta?.tool_calls;
          if (toolCallDelta) {
            // 流式中出现工具调用，记录但不处理（最终回答阶段已不传 tools，正常不会走到这里）
            console.warn('[AIGateway] 流式响应中出现工具调用，简化处理');
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });

    llmStream.on('end', () => {
      if (!outputEnded) {
        // LLM 流自然结束但未发 [DONE]（异常情况），也要给前端一个明确的结束信号
        endOutput();
      }
      // 记录本轮最终回答到会话记忆
      if (fullContent) {
        this._remember(sessionId, { role: 'assistant', content: fullContent });
      }
    });

    llmStream.on('error', (err) => {
      console.error('[AIGateway] 流式错误:', err.message);
      if (!outputEnded) {
        outputStream.push(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        endOutput();
      }
    });

  } catch (err) {
    console.error('[AIGateway] 流式启动失败:', err.message);
    outputStream.push(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    outputStream.push('data: [DONE]\n\n');
    outputStream.push(null);
  }

    return outputStream;
  }
}

module.exports = AIGateway;
