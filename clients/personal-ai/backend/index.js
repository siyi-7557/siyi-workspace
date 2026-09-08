/**
 * Personal AI 后端入口
 * 
 * 本地工作台的 AI 入口，调用 Siyi AI Core 的 personal-ai 人格。
 * 
 * 部署：本地 Electron 应用（Express）
 * 权限：全部知识和全部工具（公开 + 私人）
 * 
 * 从原 siyi-workbench src/modules/personal-ai/route.js 迁移而来。
 */

const path = require('path');
const SiyiAICore = require('../../../ai-core');

let aiCore = null;

async function getAICore() {
  if (!aiCore) {
    aiCore = new SiyiAICore({
      knowledge: { rootDir: path.join(__dirname, '..', '..', '..') },
      llm: {
        zhipuApiKey: process.env.ZHIPU_API_KEY,
        deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        qwenApiKey: process.env.QWEN_API_KEY,
      },
      memory: { memoryDir: path.join(__dirname, '..', '..', '..', 'data', 'memory') },
    });
    await aiCore.init();
  }
  return aiCore;
}

/**
 * Express 路由处理
 */
async function handleChat(req, res) {
  try {
    const { messages, sessionId, source } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages 参数缺失' });
    }

    const core = await getAICore();
    const result = await core.chat('personal-ai', {
      messages,
      sessionId: sessionId || 'local',
      source: source || 'workbench',
    }, {
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    result.pipe(res);
  } catch (err) {
    console.error('[PersonalAI] 处理失败:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * 获取当前人格配置
 */
async function getPersona(req, res) {
  try {
    const core = await getAICore();
    const persona = core.getPersona('personal-ai');
    res.json({
      name: persona.name,
      description: persona.description,
      suggestedQuestions: persona.suggestedQuestions,
      welcomeMessage: persona.welcomeMessage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * 注册 Express 路由
 */
function registerRoutes(app) {
  app.post('/api/personal-ai/chat', handleChat);
  app.get('/api/personal-ai/persona', getPersona);
  console.log('[PersonalAI] 路由已注册: /api/personal-ai/*');
}

module.exports = { handleChat, getPersona, registerRoutes };
