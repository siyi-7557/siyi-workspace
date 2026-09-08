/**
 * AI 对话路由
 * 
 * 已接入 Siyi OS AI Core（共享 AI 核心）
 * 前端调用：POST /api/ai/chat
 */

const express = require('express');
const path = require('path');
const router = express.Router();

// 引入 Siyi OS 共享 AI Core
const SiyiAICore = require('../../../../../../ai-core');

let aiCore = null;
async function getAICore() {
  if (!aiCore) {
    aiCore = new SiyiAICore({
      knowledge: { rootDir: path.join(__dirname, '..', '..', '..', '..', '..') },
      llm: {
        zhipuApiKey: process.env.ZHIPU_API_KEY,
        deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        qwenApiKey: process.env.QWEN_API_KEY,
      },
      memory: { memoryDir: path.join(__dirname, '..', '..', '..', '..', '..', 'data', 'memory') },
    });
    await aiCore.init();
    console.log('[AI Route] Siyi OS AI Core 已初始化');
  }
  return aiCore;
}

// 通用AI对话
router.post('/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages数组必填' });
    }

    const core = await getAICore();
    const result = await core.chat('personal-ai', {
      messages,
      sessionId: req.body.sessionId || 'workbench',
      source: 'workbench',
    }, {
      stream: false,
      model,
    });

    res.json({ reply: result.reply || result });
  } catch (err) {
    console.error('[AI Route] 错误:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 可用模型列表
router.get('/models', (req, res) => {
  res.json({
    models: [
      { id: 'glm-4-flash', name: 'GLM-4-Flash', provider: '智谱', free: true },
      { id: 'deepseek-chat', name: 'DeepSeek-V3', provider: 'DeepSeek', free: false },
    ],
    current: process.env.AI_MODEL || 'glm-4-flash',
    aiCore: 'Siyi OS Shared AI Core',
  });
});

module.exports = router;
