/**
 * Personal AI API 路由
 * 
 * 已接入 Siyi OS AI Core（共享 AI 核心）
 * 原工作台的 personalAI 已替换为统一的 SiyiAICore
 */

const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../../core/db');

// 引入 Siyi OS 共享 AI Core（__dirname = backend/src/modules/personal-ai，上跳 6 级到仓库根）
const SiyiAICore = require('../../../../../../ai-core');

// 仓库根目录（与 backend/index.js 的 data/memory 指向保持一致）
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');

let aiCore = null;
async function getAICore() {
  if (!aiCore) {
    // 设置私人工具的路径配置（从工作台配置/默认路径获取）
    const config = require('../../core/config');
    const vaultPath = config.get('vaultPath') || '';
    const reviewDir = path.join(vaultPath, 'AI复盘');
    const promptDir = path.join(vaultPath, 'Prompts');

    // 设置环境变量供 AI Core 私人工具使用
    process.env.OBSIDIAN_VAULT_PATH = vaultPath;
    process.env.REVIEW_DIR = reviewDir;
    process.env.PROMPT_DIR = promptDir;

    aiCore = new SiyiAICore({
      // 注入工作台 RAG 适配器：让 AI Core 网关的 RAG 上下文使用工作台的混合检索索引
      knowledgeService: createKnowledgeAdapter(),
      llm: {
        zhipuApiKey: process.env.ZHIPU_API_KEY,
        deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        qwenApiKey: process.env.QWEN_API_KEY,
        mockFallback: process.env.APP_MODE === 'demo', // 无 LLM Key 时用 MockLLM 补全「回答」，HR 无需 key 也能看全流程
      },
      memory: { memoryDir: path.join(REPO_ROOT, 'data', 'memory') },
    });
    await aiCore.init();

    // ===== 工作台工具完全接入 AI Core 私人工具层 =====
    // 用工作台的服务型工具（RAG 混合检索 / obsidian-scanner / SQLite）覆盖
    // AI Core 内置的简易文件扫描工具，提升 AI 回答的数据质量
    injectWorkbenchTools(aiCore);

    console.log('[PersonalAI] Siyi OS AI Core 已初始化');
    console.log('[PersonalAI] 私人工具路径 - Vault:', vaultPath);
    console.log('[PersonalAI] 私人工具路径 - 复盘:', reviewDir);
  }
  return aiCore;
}

/**
 * 将工作台的服务型工具注入 AI Core 私人工具层
 * 同名工具覆盖 AI Core 内置实现（AI Core registry 允许覆盖并会告警）
 */
function injectWorkbenchTools(core) {
  const registry = core.getToolRegistry();
  const toolSets = [
    require('../../core/ai/tools/knowledge'),
    require('../../core/ai/tools/prompts'),
    require('../../core/ai/tools/reviews'),
    require('../../core/ai/tools/actions'),
  ];
  const injected = [];
  for (const tool of toolSets.flat()) {
    const existed = registry.has(tool.name);
    // 绑定 execute，确保工具内部 this 指向原工具对象（如 action.list 的 _getStats）
    registry.register({
      ...tool,
      category: 'private',
      execute: tool.execute.bind(tool),
    });
    injected.push(`${tool.name}${existed ? '（覆盖内置）' : ''}`);
  }
  console.log('[PersonalAI] 工作台工具已注入 AI Core 私人工具层:', injected.join(', '));
}

/**
 * RAG 知识检索适配器
 * 实现 AI Core 网关所需的 searchKnowledge/init 接口，底层使用工作台的混合检索索引
 */
function createKnowledgeAdapter() {
  let indexInitiated = false;
  return {
    async init() {
      // 确保知识索引可用：索引为空且已配置 vault 时，后台构建索引
      if (indexInitiated) return;
      indexInitiated = true;
      try {
        const config = require('../../core/config');
        const indexer = require('../../core/rag/indexer');
        if (config.get('vaultPath') && indexer.getStatus().totalChunks === 0) {
          indexer.incrementalIndex().then(r => {
            console.log('[KnowledgeAdapter] 后台构建知识索引完成:', JSON.stringify(r));
          }).catch(e => console.warn('[KnowledgeAdapter] 后台构建知识索引失败:', e.message));
        }
      } catch (e) {
        console.warn('[KnowledgeAdapter] 初始化索引失败:', e.message);
      }
    },
    async searchKnowledge(query, options = {}) {
      if (!query) return [];
      try {
        const indexer = require('../../core/rag/indexer');
        const topK = options.topK || 3;
        const results = await indexer.search(query, { limit: topK, mode: 'hybrid' });
        return results.map(r => ({
          id: r.id,
          title: r.heading || r.filePath,
          visibility: 'all',
          score: r.score,
          content: r.content ? r.content.substring(0, 2000) : '',
          source: r.filePath,
        }));
      } catch (err) {
        console.warn('[KnowledgeAdapter] RAG 检索失败:', err.message);
        return [];
      }
    },
    async getDocument() {
      return null;
    },
  };
}

router.post('/chat', async (req, res) => {
  try {
    const { message, messages, model } = req.body;
    if (!message && (!messages || !Array.isArray(messages) || messages.length === 0)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'message 或 messages 必填' } });
    }

    const input = messages && Array.isArray(messages) ? messages : [{ role: 'user', content: message }];
    const core = await getAICore();

    const result = await core.chat('personal-ai', {
      messages: input,
      sessionId: req.body.sessionId || 'workbench',
      source: 'workbench',
    }, {
      stream: false,
      model,
    });

    res.json({
      success: true,
      reply: result.reply || result,
      toolCalls: result.toolCalls || [],
      iterations: result.iterations || 0,
      usage: result.usage || null,
    });
  } catch (err) {
    console.error('[PersonalAI] API 错误:', err.message);
    res.status(500).json({ success: false, error: { code: 'API_ERROR', message: err.message || '服务器内部错误' } });
  }
});

/**
 * 流式对话 - SSE (Server-Sent Events)
 * 返回 SSE 格式的流式响应，前端用 fetch + ReadableStream 接收
 */
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, messages, model } = req.body;
    if (!message && (!messages || !Array.isArray(messages) || messages.length === 0)) {
      return res.status(400).json({ success: false, error: 'message 或 messages 必填' });
    }

    const input = messages && Array.isArray(messages) ? messages : [{ role: 'user', content: message }];
    const core = await getAICore();

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 发送初始事件
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

    const stream = await core.chatStream('personal-ai', {
      messages: input,
      sessionId: req.body.sessionId || 'workbench',
      source: 'workbench',
    }, {
      model,
    });

    // 将 AI Core 的流转发到响应
    stream.on('data', (chunk) => {
      res.write(chunk);
    });

    stream.on('end', () => {
      res.end();
    });

    stream.on('error', (err) => {
      console.error('[PersonalAI] 流式错误:', err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    // 客户端断开时清理
    req.on('close', () => {
      stream.destroy();
    });

  } catch (err) {
    console.error('[PersonalAI] 流式 API 错误:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

router.get('/tools', async (req, res) => {
  try {
    const core = await getAICore();
    const tools = core.tools.getToolDefinitions('all');
    res.json({
      success: true,
      tools: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
      total: tools.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const core = await getAICore();
    const persona = core.getPersona('personal-ai');
    res.json({
      success: true,
      status: 'ok',
      aiCore: 'Siyi OS Shared AI Core',
      persona: persona.name,
      availableTools: core.tools.listNames(),
      knowledgeDocs: (await core.knowledge.searchKnowledge('test', { visibility: 'all' })).length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== 对话历史 ==========

// 获取会话列表
router.get('/conversations', (req, res) => {
  try {
    const conversations = db.query(
      `SELECT id, title, created_at, updated_at, 
              json_array_length(messages) as message_count 
       FROM agent_conversations 
       WHERE agent_type = 'personal-ai' 
       ORDER BY updated_at DESC 
       LIMIT 50`
    );
    res.json({ success: true, conversations });
  } catch (err) {
    console.error('[PersonalAI] 获取会话列表失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建新会话
router.post('/conversations', (req, res) => {
  try {
    const { title, messages } = req.body;
    const result = db.execute(
      `INSERT INTO agent_conversations (agent_type, title, messages) VALUES (?, ?, ?)`,
      ['personal-ai', title || '新对话', JSON.stringify(messages || [])]
    );
    const conversation = db.queryOne('SELECT * FROM agent_conversations WHERE id = ?', [result.lastInsertRowid]);
    res.json({ success: true, conversation });
  } catch (err) {
    console.error('[PersonalAI] 创建会话失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取会话详情
router.get('/conversations/:id', (req, res) => {
  try {
    const conversation = db.queryOne('SELECT * FROM agent_conversations WHERE id = ? AND agent_type = ?', [req.params.id, 'personal-ai']);
    if (!conversation) {
      return res.status(404).json({ success: false, error: '会话不存在' });
    }
    conversation.messages = JSON.parse(conversation.messages || '[]');
    res.json({ success: true, conversation });
  } catch (err) {
    console.error('[PersonalAI] 获取会话详情失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新会话（保存消息/标题）
router.put('/conversations/:id', (req, res) => {
  try {
    const { title, messages } = req.body;
    const existing = db.queryOne('SELECT id FROM agent_conversations WHERE id = ? AND agent_type = ?', [req.params.id, 'personal-ai']);
    if (!existing) {
      return res.status(404).json({ success: false, error: '会话不存在' });
    }
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (messages !== undefined) { updates.push('messages = ?'); params.push(JSON.stringify(messages)); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    db.execute(`UPDATE agent_conversations SET ${updates.join(', ')} WHERE id = ?`, params);
    const conversation = db.queryOne('SELECT * FROM agent_conversations WHERE id = ?', [req.params.id]);
    conversation.messages = JSON.parse(conversation.messages || '[]');
    res.json({ success: true, conversation });
  } catch (err) {
    console.error('[PersonalAI] 更新会话失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除会话
router.delete('/conversations/:id', (req, res) => {
  try {
    db.execute('DELETE FROM agent_conversations WHERE id = ? AND agent_type = ?', [req.params.id, 'personal-ai']);
    res.json({ success: true });
  } catch (err) {
    console.error('[PersonalAI] 删除会话失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 主动打招呼 + 个性化建议
 * 依据用户真实使用习惯（最新复盘 / 常用 Prompt / 使用记录）生成问候与建议
 * 轻量启发式实现，不调用 AI 推理，保证即时返回
 */
router.get('/welcome', (req, res) => {
  try {
    // 1. 问候语：按时段
    const hour = new Date().getHours();
    let period;
    if (hour < 5) period = '凌晨了，还在忙';
    else if (hour < 9) period = '早上好';
    else if (hour < 12) period = '上午好';
    else if (hour < 14) period = '中午好';
    else if (hour < 18) period = '下午好';
    else if (hour < 23) period = '晚上好';
    else period = '夜深了';

    const contextBits = [];

    // 2. 最近的复盘
    const latestReview = db.queryOne(
      `SELECT project_name, created_at, action_items FROM reviews ORDER BY created_at DESC LIMIT 1`
    );

    // 3. 常用 / 最近的 Prompt
    const topPrompt = db.queryOne(
      `SELECT title, category, use_count, updated_at FROM prompts ORDER BY use_count DESC, updated_at DESC LIMIT 1`
    );

    // 4. 使用记录（最近 7 天）
    const weekCut = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recentPromptLogs = db.query(
      `SELECT COUNT(*) c FROM activity_log WHERE type='prompt_created' AND date >= ?`,
      [weekCut]
    );
    const recentActive = (recentPromptLogs && recentPromptLogs[0] && recentPromptLogs[0].c) || 0;

    // 构建语境描述
    if (latestReview && latestReview.project_name) {
      const days = Math.floor((Date.now() - new Date(latestReview.created_at).getTime()) / 86400000);
      const timeDesc = days < 1 ? '今天' : days < 7 ? `最近${days}天` : '最近';
      contextBits.push(`${timeDesc}你在做「${latestReview.project_name}」的项目复盘`);
      if (latestReview.action_items) {
        try {
          const items = JSON.parse(latestReview.action_items);
          if (Array.isArray(items) && items.length) contextBits.push('有行动项待跟进');
        } catch (e) {}
      }
    }
    if (topPrompt && topPrompt.title) {
      if (topPrompt.use_count > 0) {
        contextBits.push(`你最常用的是「${topPrompt.title}」这条 Prompt`);
      } else {
        contextBits.push(`你最近存了「${topPrompt.title}」这条 Prompt`);
      }
    }
    if (recentActive > 0) contextBits.push(`本周新增 ${recentActive} 条 Prompt`);

    // 组装具体建议（优先由真实数据驱动）
    const suggestions = [];
    if (latestReview && latestReview.project_name) {
      const p = latestReview.project_name;
      // 有行动项 → 建议跟进行动项；否则 → 建议总结复盘
      if (latestReview.action_items) {
        try {
          const items = JSON.parse(latestReview.action_items);
          if (Array.isArray(items) && items.length) {
            suggestions.push({
              text: `跟进「${p}」复盘行动`,
              msg: `帮我梳理「${p}」项目复盘里的行动项，看看哪些完成了、哪些还欠着，并按优先级排一下`,
            });
          }
        } catch (e) {}
      }
      if (suggestions.length === 0) {
        suggestions.push({
          text: `提炼「${p}」复盘收获`,
          msg: `根据「${p}」项目复盘，帮我提炼最值得记住的 3 个收获，并指出重复出现的问题`,
        });
      }
    }

    if (topPrompt && topPrompt.title) {
      suggestions.push({
        text: topPrompt.use_count > 0 ? `复用「${topPrompt.title}」` : `启用「${topPrompt.title}」`,
        msg: `把「${topPrompt.title}」这条 Prompt 的核心内容讲给我，并判断它适不适合我现在手头的任务`,
      });
    }

    // 兜底建议：围绕知识库/复盘/提示词
    const backupSuggestions = [
      { text: '梳理近期知识重点', msg: '把知识库里最近新增的内容整理成我今天的行动重点' },
      { text: '看看最近的复盘质量', msg: '最近一周我的 AI 复盘质量在变好还是变差？依据是什么？' },
      { text: '找一段高效 Prompt', msg: '帮我在提示词库里找一段最适合我当前场景的高效 Prompt' },
    ];
    while (suggestions.length < 3 && backupSuggestions.length) {
      suggestions.push(backupSuggestions.shift());
    }

    const context = contextBits.length
      ? contextBits.slice(0, 2).join('，') + '。'
      : '我还没怎么记录你的使用轨迹，先从这几个方向聊聊吧。';

    res.json({
      success: true,
      greeting: `${period}，今天想从哪里继续？`,
      context,
      suggestions,
    });
  } catch (err) {
    console.error('[PersonalAI] 生成欢迎建议失败:', err.message);
    res.json({
      success: false,
      greeting: '你好，我是你的 Personal AI',
      context: '我可以搜索你的知识库、查询 Prompt、查看 AI 复盘、管理行动项。',
      suggestions: [
        { text: '搜索知识', msg: '帮我找一下最新的关键知识' },
        { text: '查看复盘', msg: '我最近的 AI 工作有什么问题？' },
        { text: '查找 Prompt', msg: '我有哪些常用的 Prompt？' },
      ],
    });
  }
});

module.exports = router;
