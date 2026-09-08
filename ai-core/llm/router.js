/**
 * LLM Router - 统一 LLM 调用服务
 * 
 * 多模型自动降级：智谱 GLM-4-Flash → DeepSeek → 通义千问
 * 支持流式和非流式输出。
 * 
 * 两个 AI 入口共用同一个 LLM Router。
 */

const https = require('https');
const { URL } = require('url');

// 模型配置
const MODELS = {
  'glm-4-flash': {
    name: 'glm-4-flash',
    provider: 'zhipu',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKeyEnv: 'ZHIPU_API_KEY',
    free: true,
  },
  'deepseek-chat': {
    name: 'deepseek-chat',
    provider: 'deepseek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    free: false,
  },
  'qwen-turbo': {
    name: 'qwen-turbo',
    provider: 'alibaba',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'QWEN_API_KEY',
    free: false,
  },
};

// 默认降级顺序
const DEFAULT_PRIORITY = ['glm-4-flash', 'deepseek-chat', 'qwen-turbo'];

class LLRouter {
  constructor(options = {}) {
    this.options = options;
    this.priority = options.priority || DEFAULT_PRIORITY;
    this.apiKeys = {
      zhipu: options.zhipuApiKey || process.env.ZHIPU_API_KEY || '',
      deepseek: options.deepseekApiKey || process.env.DEEPSEEK_API_KEY || '',
      alibaba: options.qwenApiKey || process.env.QWEN_API_KEY || '',
    };
  }

  /**
   * 统一聊天接口
   * @param {Array} messages - 消息数组
   * @param {Object} options - { stream, tools, model, temperature, maxTokens }
   * @returns {Promise<Object|ReadableStream>}
   */
  async chat(messages, options = {}) {
    const stream = options.stream !== false;
    const tools = options.tools || [];
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens || 4096;

    // 按优先级尝试模型，自动降级
    let lastError = null;
    for (const modelName of this.priority) {
      const model = MODELS[modelName];
      if (!model) continue;

      const apiKey = this.apiKeys[model.provider];
      if (!apiKey) {
        console.log(`[LLMRouter] 跳过 ${modelName}：未配置 API Key`);
        continue;
      }

      try {
        console.log(`[LLMRouter] 尝试模型: ${modelName}`);
        const result = await this._callModel(model, apiKey, messages, {
          stream, tools, temperature, maxTokens,
        });
        console.log(`[LLMRouter] 模型 ${modelName} 调用成功`);
        return result;
      } catch (err) {
        lastError = err;
        console.warn(`[LLMRouter] 模型 ${modelName} 调用失败: ${err.message}，尝试下一个`);
        // 4xx 错误（除429外）不降级，直接报错
        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
      }
    }

    throw new Error(`所有模型调用失败: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels() {
    return this.priority.filter(name => {
      const model = MODELS[name];
      return model && this.apiKeys[model.provider];
    });
  }

  // ========== 内部方法 ==========

  async _callModel(model, apiKey, messages, options) {
    const body = {
      model: model.name,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: options.stream,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    if (options.stream) {
      return this._callStream(model.endpoint, apiKey, body);
    } else {
      return this._callNonStream(model.endpoint, apiKey, body);
    }
  }

  _callNonStream(endpoint, apiKey, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const postData = JSON.stringify(body);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 120000,
        // 禁用 keep-alive 连接池复用：避免长运行服务复用被对端关闭的 TLS 连接导致偶发底层错误
        agent: false,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              const err = new Error(`HTTP ${res.statusCode}: ${json.error?.message || data.substring(0, 200)}`);
              err.status = res.statusCode;
              reject(err);
            }
          } catch (e) {
            reject(new Error(`响应JSON解析失败: ${data.substring(0, 500)}`));
          }
        });
        // 响应流错误处理：连接中途重置时避免未处理的 error 事件导致进程异常
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.write(postData);
      req.end();
    });
  }

  _callStream(endpoint, apiKey, body) {
    // 返回原始响应流（IncomingMessage），由调用方解析 SSE
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const postData = JSON.stringify(body);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 120000,
        // 禁用 keep-alive 连接池复用：避免长运行服务复用被对端关闭的 TLS 连接导致偶发底层错误
        agent: false,
      }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 安全网：调用方挂载 error 监听前避免未处理 error 崩溃
          res.on('error', () => {});
          resolve(res);
        } else {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const err = new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
            err.status = res.statusCode;
            reject(err);
          });
          res.on('error', reject);
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.write(postData);
      req.end();
    });
  }

  /**
   * 流式聊天 - 返回原始响应流，由调用方解析 SSE
   * 自动降级：按优先级尝试模型
   */
  async chatStream(messages, options = {}) {
    const tools = options.tools || [];
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens || 4096;

    let lastError = null;
    for (const modelName of this.priority) {
      const model = MODELS[modelName];
      if (!model) continue;
      const apiKey = this.apiKeys[model.provider];
      if (!apiKey) continue;

      try {
        console.log(`[LLMRouter] 流式尝试模型: ${modelName}`);
        const body = {
          model: model.name,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        };
        if (tools.length > 0) {
          body.tools = tools;
          body.tool_choice = 'auto';
        }
        const stream = await this._callStream(model.endpoint, apiKey, body);
        stream.modelName = modelName;
        return stream;
      } catch (err) {
        lastError = err;
        console.warn(`[LLMRouter] 流式模型 ${modelName} 失败: ${err.message}，尝试下一个`);
        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
      }
    }
    throw new Error(`所有流式模型调用失败: ${lastError?.message || '未知错误'}`);
  }
}

module.exports = LLRouter;
module.exports.MODELS = MODELS;
module.exports.DEFAULT_PRIORITY = DEFAULT_PRIORITY;
