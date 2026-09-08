const config = require('../config');
const https = require('https');
const { URL } = require('url');

const ZHIPU_API_KEY = config.get('ai.apiKey') || process.env.ZHIPU_API_KEY || '';
const DEEPSEEK_API_KEY = config.get('ai.deepseekApiKey') || process.env.DEEPSEEK_API_KEY || '';
const SILICONFLOW_API_KEY = config.get('ai.siliconflowApiKey') || process.env.SILICONFLOW_API_KEY || '';
const SILICONFLOW_MODEL = config.get('ai.siliconflowModel') || process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3';
const DEFAULT_MODEL = config.get('ai.model') || process.env.AI_MODEL || 'glm-4-flash';

/**
 * 通用 HTTPS POST 辅助函数
 * 使用 Node.js 原生 https 模块，避免 fetch/undici 在 Node v22 下的间歇性原生崩溃
 */
function httpsPost(urlStr, body, apiKey, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: timeout,
      // 禁用 keep-alive 连接池复用：避免长运行服务复用被对端关闭的 TLS 连接导致偶发底层错误
      agent: false,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            const err = new Error(`HTTP ${res.statusCode}: ${json.error?.message || data.substring(0, 200)}`);
            err.status = res.statusCode;
            err.data = json;
            reject(err);
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: 响应JSON解析失败: ${data.substring(0, 500)}`));
        }
      });
      // 响应流错误处理：连接中途重置时避免未处理的 error 事件导致进程异常
      res.on('error', (e) => reject(e));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(postData);
    req.end();
  });
}

async function fetchJson(url, body, apiKey, timeout = 120000) {
  return await httpsPost(url, body, apiKey, timeout);
}

/**
 * 混合模型调度配置
 */
const TASK_MODEL_CONFIG = {
  phase1: {
    primary: 'glm-4-flash',
    fallback: ['deepseek-v4-flash', 'deepseek-v4-pro']
  },
  phase2: {
    primary: 'deepseek-v4-pro',
    fallback: ['deepseek-v4-flash', 'glm-4-flash']
  },
  improvement_plan: {
    primary: 'deepseek-v4-pro',
    fallback: ['deepseek-v4-flash', 'glm-4-flash']
  },
  retry_analysis: {
    primary: 'deepseek-v4-flash',
    fallback: ['deepseek-v4-pro', 'glm-4-flash']
  },
  default: {
    primary: DEFAULT_MODEL,
    fallback: ['deepseek-v4-flash', 'glm-4-flash']
  }
};

/**
 * 模型别名映射
 */
const MODEL_ALIAS = {
  'glm-4-flash': 'glm-4-flash',
  'glm-4.7-flash': 'glm-4-flash',
  'deepseek-v4-flash': 'deepseek-ai/DeepSeek-V4-Flash',
  'deepseek-v4-pro': 'deepseek-ai/DeepSeek-V4-Pro',
  'deepseek-v3': 'deepseek-ai/DeepSeek-V3'
};

async function chat(messages, model = DEFAULT_MODEL, options = {}) {
  const { temperature = 0.7, maxTokens } = options;
  const actualModel = MODEL_ALIAS[model] || model;

  if (actualModel.startsWith('glm-') || actualModel.startsWith('chatglm')) {
    return await callZhipu(messages, actualModel, { temperature, maxTokens });
  } else if (actualModel.startsWith('deepseek-ai/') || actualModel.includes('/')) {
    if (SILICONFLOW_API_KEY) {
      return await callSiliconFlow(messages, actualModel, { temperature, maxTokens });
    }
    console.log('[AI] 未配置硅基流动API，降级到智谱');
    return await callZhipu(messages, 'glm-4-flash', { temperature, maxTokens });
  } else if (actualModel.startsWith('deepseek')) {
    if (DEEPSEEK_API_KEY) {
      return await callDeepSeek(messages, 'deepseek-chat', { temperature, maxTokens });
    }
    if (SILICONFLOW_API_KEY) {
      return await callSiliconFlow(messages, SILICONFLOW_MODEL, { temperature, maxTokens });
    }
    return await callZhipu(messages, 'glm-4-flash', { temperature, maxTokens });
  }
  return await callZhipu(messages, 'glm-4-flash', { temperature, maxTokens });
}

async function chatByTask(messages, taskType = 'default') {
  const cfg = TASK_MODEL_CONFIG[taskType] || TASK_MODEL_CONFIG.default;
  const models = [cfg.primary, ...(cfg.fallback || [])];

  let lastError = null;
  for (const model of models) {
    try {
      console.log(`[AI] 任务类型=${taskType}，尝试模型=${model}`);
      const result = await chat(messages, model);
      console.log(`[AI] 模型=${model} 调用成功`);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[AI] 模型=${model} 调用失败: ${err.message}，尝试下一个降级模型`);
      continue;
    }
  }
  throw lastError || new Error('所有模型都调用失败');
}

async function callZhipu(messages, model = 'glm-4-flash', options = {}) {
  const { temperature = 0.7, maxTokens } = options;
  if (!ZHIPU_API_KEY) {
    throw new Error('未配置ZHIPU_API_KEY，请在.env中设置');
  }

  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const postData = { model, messages, temperature };
      if (maxTokens) postData.max_tokens = maxTokens;
      const data = await fetchJson(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        postData,
        ZHIPU_API_KEY
      );
      return data.choices[0].message.content;
    } catch (err) {
      const status = err.status;
      const errMsg = err.message || '';
      const isRateLimit = status === 429 ||
        errMsg.includes('429') ||
        errMsg.includes('Too Many Requests') ||
        errMsg.includes('rate limit') ||
        errMsg.includes('限流') ||
        errMsg.includes('频繁');

      if (isRateLimit && attempt < maxRetries - 1) {
        const waitTime = 10000 * Math.pow(2, attempt);
        console.log(`[AI] 智谱429限流，第${attempt + 1}次重试，等待${waitTime / 1000}秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      console.error('[AI] 智谱调用失败:', err.message);
      if (SILICONFLOW_API_KEY) {
        console.log('[AI] 降级到硅基流动（SiliconFlow）');
        return await callSiliconFlow(messages, SILICONFLOW_MODEL, { temperature, maxTokens });
      }
      if (DEEPSEEK_API_KEY) {
        console.log('[AI] 降级到DeepSeek官方');
        return await callDeepSeek(messages, 'deepseek-chat', { temperature, maxTokens });
      }
      throw err;
    }
  }
}

async function callDeepSeek(messages, model = 'deepseek-chat', options = {}) {
  const { temperature = 0.7, maxTokens } = options;
  if (!DEEPSEEK_API_KEY) {
    throw new Error('未配置DEEPSEEK_API_KEY，请在.env中设置');
  }
  const postData = { model, messages, temperature };
  if (maxTokens) postData.max_tokens = maxTokens;
  const data = await fetchJson(
    'https://api.deepseek.com/chat/completions',
    postData,
    DEEPSEEK_API_KEY
  );
  return data.choices[0].message.content;
}

async function callSiliconFlow(messages, model = SILICONFLOW_MODEL, options = {}) {
  const { temperature = 0.7, maxTokens } = options;
  if (!SILICONFLOW_API_KEY) {
    throw new Error('未配置SILICONFLOW_API_KEY，请在.env中设置 SILICONFLOW_API_KEY');
  }
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const postData = { model, messages, temperature };
      if (maxTokens) postData.max_tokens = maxTokens;
      const data = await fetchJson(
        'https://api.siliconflow.cn/v1/chat/completions',
        postData,
        SILICONFLOW_API_KEY
      );
      return data.choices[0].message.content;
    } catch (err) {
      const status = err.status;
      const errMsg = err.message || '';
      const isRateLimit = status === 429 || errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('rate limit');

      if (isRateLimit && attempt < maxRetries - 1) {
        const waitTime = 5000 * Math.pow(2, attempt);
        console.log(`[AI] 硅基流动429限流，第${attempt + 1}次重试，等待${waitTime / 1000}秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      console.error('[AI] 硅基流动调用失败:', err.message);
      throw err;
    }
  }
}

// 流式输出 - 智谱（已使用原生 https，保持不变）
function chatStreamZhipu(messages, model = 'glm-4-flash', onChunk, onDone, onError) {
  const https = require('https');
  if (!ZHIPU_API_KEY) {
    onError(new Error('未配置ZHIPU_API_KEY'));
    return;
  }
  const postData = JSON.stringify({ model, messages, temperature: 0.7, stream: true });
  const options = {
    hostname: 'open.bigmodel.cn',
    path: '/api/paas/v4/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 120000,
    // 禁用 keep-alive 连接池复用，避免复用过期 TLS 连接引发偶发底层错误
    agent: false,
  };
  const req = https.request(options, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          onDone && onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch (e) {
          // 忽略解析错误
        }
      }
    });
    res.on('end', () => { onDone && onDone(); });
    res.on('error', (err) => { onError && onError(err); });
  });
  req.on('error', (err) => { onError && onError(err); });
  req.on('timeout', () => { req.destroy(); onError && onError(new Error('请求超时')); });
  req.write(postData);
  req.end();
}

function chatStream(messages, model = DEFAULT_MODEL, onChunk, onDone, onError) {
  if (model.startsWith('glm-') || model.startsWith('chatglm')) {
    chatStreamZhipu(messages, model, onChunk, onDone, onError);
  } else {
    chat(messages, model).then(content => {
      onChunk(content);
      onDone && onDone();
    }).catch(err => onError && onError(err));
  }
}

async function generatePrompt(requirement) {
  const systemPrompt = `你是顶尖的 Prompt 工程师，擅长把模糊需求转化为高质量、结构化、可直接落地的 Prompt。

要求：
1. 输出严格按以下结构组成：
   - 【角色设定】
   - 【任务描述】（含目标、输入、处理过程、产出）
   - 【详细步骤】
   - 【约束条件】（边界、禁止项、语气风格、质量标准）
   - 【输出格式】（给出字段或结构模板）
   - 【质量自检】
2. 必须具体、可执行、可量化，拒绝空话套话（不要写"请认真完成"这类泛泛的表达）。
3. 结合用户给出的场景、目标受众与用途，选择贴合的语体与专业深度。
4. 直接输出 Prompt 正文，不要额外解释、不要寒暄。

参考颗粒度示例（仅参照写法，不要照搬示例内容）：
【角色设定】你是资深英语口语陪练，擅长把对话贴近真实生活场景。
【任务描述】当用户用英语描述一件事时，先纠正最常见的语法错误并说明理由，再引导用户用更地道的表达重说一次。
【约束条件】每轮只指出 1 个最重要的错误；给出 0-5 评分和一句话理由；不使用生僻书面词。
【输出格式】分三部分：1) 纠正与理由 2) 地道改写 3) 下一句引子。
【质量自检】检查角色、任务、约束、格式四要素是否齐全且具体可执行。`;

  // 生成任务优先用更强大的模型：可配置 ai.promptModel 覆盖；否则有硅基流动时用 DeepSeek-V3，都不配置则回落默认模型
  const model = config.get('ai.promptModel') || (SILICONFLOW_API_KEY ? SILICONFLOW_MODEL : DEFAULT_MODEL);
  const maxTokens = Number(config.get('ai.promptMaxTokens') || 1600) || 1600;
  return await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `需求：${requirement}` }
    ],
    model,
    { temperature: 0.3, maxTokens }
  );
}

async function chatWithTools(messages, tools, model = DEFAULT_MODEL, options = {}) {
  const actualModel = MODEL_ALIAS[model] || model;
  const { tool_choice = 'auto', temperature = 0.7, maxTokens } = options;

  const postData = {
    model: actualModel,
    messages,
    tools,
    tool_choice,
    temperature,
    stream: false,
  };
  if (maxTokens) postData.max_tokens = maxTokens;

  if (actualModel.startsWith('glm-') || actualModel.startsWith('chatglm')) {
    return await callZhipuWithTools(postData);
  } else if (actualModel.startsWith('deepseek-ai/') || actualModel.includes('/')) {
    if (SILICONFLOW_API_KEY) {
      return await callSiliconFlowWithTools(postData);
    }
    console.log('[AI] 未配置硅基流动API，降级到智谱');
    postData.model = 'glm-4-flash';
    return await callZhipuWithTools(postData);
  } else if (actualModel.startsWith('deepseek')) {
    if (DEEPSEEK_API_KEY) {
      return await callDeepSeekWithTools(postData);
    }
    if (SILICONFLOW_API_KEY) {
      postData.model = SILICONFLOW_MODEL;
      return await callSiliconFlowWithTools(postData);
    }
    postData.model = 'glm-4-flash';
    return await callZhipuWithTools(postData);
  }
  postData.model = 'glm-4-flash';
  return await callZhipuWithTools(postData);
}

async function callZhipuWithTools(postData) {
  if (!ZHIPU_API_KEY) throw new Error('未配置ZHIPU_API_KEY');
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const responseData = await fetchJson(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        postData,
        ZHIPU_API_KEY
      );
      const choice = responseData.choices[0];
      return {
        message: choice.message,
        finish_reason: choice.finish_reason,
        usage: responseData.usage,
        model: responseData.model,
      };
    } catch (err) {
      const errMsg = err.message || '';
      const isRateLimit = errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('rate limit') || errMsg.includes('限流') || errMsg.includes('频繁');
      if (isRateLimit && attempt < maxRetries - 1) {
        const waitTime = 10000 * Math.pow(2, attempt);
        console.log(`[AI] 智谱429限流，第${attempt + 1}次重试，等待${waitTime / 1000}秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      console.error('[AI] 智谱Tool Calling失败:', err.message);
      if (SILICONFLOW_API_KEY) {
        console.log('[AI] 降级到硅基流动');
        postData.model = SILICONFLOW_MODEL;
        return await callSiliconFlowWithTools(postData);
      }
      throw err;
    }
  }
}

async function callSiliconFlowWithTools(postData) {
  if (!SILICONFLOW_API_KEY) throw new Error('未配置SILICONFLOW_API_KEY');
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const responseData = await fetchJson(
        'https://api.siliconflow.cn/v1/chat/completions',
        postData,
        SILICONFLOW_API_KEY
      );
      const choice = responseData.choices[0];
      return {
        message: choice.message,
        finish_reason: choice.finish_reason,
        usage: responseData.usage,
        model: responseData.model,
      };
    } catch (err) {
      const status = err.status;
      const errMsg = err.message || '';
      const isRateLimit = status === 429 || errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('rate limit');
      if (isRateLimit && attempt < maxRetries - 1) {
        const waitTime = 5000 * Math.pow(2, attempt);
        console.log(`[AI] 硅基流动429限流，第${attempt + 1}次重试，等待${waitTime / 1000}秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      console.error('[AI] 硅基流动Tool Calling失败:', err.message);
      throw err;
    }
  }
}

async function callDeepSeekWithTools(postData) {
  if (!DEEPSEEK_API_KEY) throw new Error('未配置DEEPSEEK_API_KEY');
  const responseData = await fetchJson(
    'https://api.deepseek.com/chat/completions',
    postData,
    DEEPSEEK_API_KEY
  );
  const choice = responseData.choices[0];
  return {
    message: choice.message,
    finish_reason: choice.finish_reason,
    usage: responseData.usage,
    model: responseData.model,
  };
}

module.exports = {
  chat,
  chatByTask,
  chatWithTools,
  chatStream,
  generatePrompt,
  DEFAULT_MODEL,
  SILICONFLOW_MODEL,
  hasSiliconFlow: () => !!SILICONFLOW_API_KEY,
  hasZhipu: () => !!ZHIPU_API_KEY,
  hasDeepSeek: () => !!DEEPSEEK_API_KEY
};
