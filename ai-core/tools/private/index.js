/**
 * Private Tools - 私人工具集合
 * 
 * 仅 Personal AI 可调用，Meet Siyi 无权访问。
 * 
 * 数据来源：
 * - Obsidian 笔记库（可配置路径）
 * - Prompt 库
 * - AI 复盘记录
 * - 行动项/待办
 * - 长期记忆
 * 
 * 初始为基础实现，后续可扩展。
 */

const fs = require('fs');
const path = require('path');

// 私人数据配置
const PRIVATE_CONFIG = {
  obsidianVault: process.env.OBSIDIAN_VAULT_PATH || '',
  promptDir: process.env.PROMPT_DIR || '',
  reviewDir: process.env.REVIEW_DIR || '',
  memoryDir: process.env.MEMORY_DIR || path.join(__dirname, '..', '..', '..', 'data', 'memory'),
  actionFile: process.env.ACTION_FILE || path.join(__dirname, '..', '..', '..', 'data', 'actions.json'),
};

// ========== 工具函数 ==========

/**
 * 转义用户输入中的正则元字符，防止畸形正则导致抛错或 ReDoS
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 允许私人工具读取的根目录白名单（vault / prompt / review / 仓库内置公开知识 / data 目录）
 */
const ALLOWED_READ_ROOTS = [
  PRIVATE_CONFIG.obsidianVault,
  PRIVATE_CONFIG.promptDir,
  PRIVATE_CONFIG.reviewDir,
  path.join(__dirname, '..', '..', 'knowledge', 'public'),
  path.join(__dirname, '..', '..', '..', 'data'),
  process.env.MEMORY_DIR || '',
].filter(Boolean).map(p => path.resolve(p));

/**
 * 校验目标路径必须位于白名单根目录之内，防止路径穿越读取本机任意文件
 */
function isPathAllowed(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(targetPath);
  return ALLOWED_READ_ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep));
}

function searchFiles(dir, query, limit = 5) {
  if (!dir || !fs.existsSync(dir)) return [];

  const results = [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const score = (content.toLowerCase().match(new RegExp(escapeRegExp(query.toLowerCase()), 'g')) || []).length;
      if (score > 0) {
        results.push({
          title: file.replace('.md', ''),
          path: filePath,
          score,
          content: content.substring(0, 500),
        });
      }
    } catch (e) {
      // 跳过无法读取的文件
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function getFileContent(filePath) {
  // 白名单校验：只允许读取已配置的数据目录内的文件
  if (!isPathAllowed(filePath)) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
}

/**
 * 清洗文件名：剥离路径分隔符与 ..，防止保存时逃逸目标目录
 */
function sanitizeTitle(title) {
  return String(title || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '')
    .trim() || 'untitled';
}

function saveFile(dir, title, content) {
  if (!dir) return { success: false, error: '目录未配置' };
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sanitizeTitle(title)}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return { success: true, path: filePath };
}

function loadActions() {
  if (!fs.existsSync(PRIVATE_CONFIG.actionFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(PRIVATE_CONFIG.actionFile, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function saveActions(actions) {
  const dir = path.dirname(PRIVATE_CONFIG.actionFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PRIVATE_CONFIG.actionFile, JSON.stringify(actions, null, 2), 'utf-8');
}

// ========== 工具定义 ==========

module.exports = [
  // ---------- 知识管理（Obsidian） ----------
  {
    name: 'knowledge.search',
    category: 'private',
    description: '搜索思意的 Obsidian 笔记库。需要配置 OBSIDIAN_VAULT_PATH 环境变量。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回数量', default: 5 },
      },
      required: ['query'],
    },
    execute: async (args) => {
      if (!PRIVATE_CONFIG.obsidianVault) {
        return { results: [], note: 'Obsidian 笔记库路径未配置，请设置 OBSIDIAN_VAULT_PATH 环境变量' };
      }
      const results = searchFiles(PRIVATE_CONFIG.obsidianVault, args.query, args.limit || 5);
      return { results, count: results.length, source: 'obsidian' };
    },
  },

  {
    name: 'knowledge.get',
    category: 'private',
    description: '获取指定的 Obsidian 笔记内容。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '笔记文件路径' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const content = getFileContent(args.path);
      if (!content) return { content: null, error: '文件不存在或无法读取' };
      return { content, path: args.path };
    },
  },

  {
    name: 'knowledge.save',
    category: 'private',
    description: '保存内容到 Obsidian 笔记库。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题' },
        content: { type: 'string', description: '笔记内容' },
      },
      required: ['title', 'content'],
    },
    execute: async (args) => {
      const result = saveFile(PRIVATE_CONFIG.obsidianVault, args.title, args.content);
      return result;
    },
  },

  // ---------- Prompt 库 ----------
  {
    name: 'prompt.search',
    category: 'private',
    description: '搜索思意的 Prompt 库。需要配置 PROMPT_DIR 环境变量。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
    execute: async (args) => {
      if (!PRIVATE_CONFIG.promptDir) {
        return { results: [], note: 'Prompt 库路径未配置，请设置 PROMPT_DIR 环境变量' };
      }
      const results = searchFiles(PRIVATE_CONFIG.promptDir, args.query, args.limit || 5);
      return { results, count: results.length };
    },
  },

  {
    name: 'prompt.get',
    category: 'private',
    description: '获取指定的 Prompt。',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Prompt 文件路径' } },
      required: ['path'],
    },
    execute: async (args) => {
      const content = getFileContent(args.path);
      return content ? { content, path: args.path } : { content: null, error: '文件不存在' };
    },
  },

  {
    name: 'prompt.save',
    category: 'private',
    description: '保存 Prompt 到库中。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'content'],
    },
    execute: async (args) => {
      const content = args.tags ? `---\ntags: [${args.tags.join(', ')}]\n---\n\n${args.content}` : args.content;
      return saveFile(PRIVATE_CONFIG.promptDir, args.title, content);
    },
  },

  // ---------- 复盘记录 ----------
  {
    name: 'review.search',
    category: 'private',
    description: '搜索思意的 AI 复盘记录。需要配置 REVIEW_DIR 环境变量。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
    execute: async (args) => {
      if (!PRIVATE_CONFIG.reviewDir) {
        return { results: [], note: '复盘记录路径未配置，请设置 REVIEW_DIR 环境变量' };
      }
      const results = searchFiles(PRIVATE_CONFIG.reviewDir, args.query, args.limit || 5);
      return { results, count: results.length };
    },
  },

  {
    name: 'review.get',
    category: 'private',
    description: '获取指定的复盘记录。',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    execute: async (args) => {
      const content = getFileContent(args.path);
      return content ? { content, path: args.path } : { content: null, error: '文件不存在' };
    },
  },

  // ---------- 行动项 ----------
  {
    name: 'action.list',
    category: 'private',
    description: '列出思意的待办行动项。',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'completed', 'all'], default: 'pending' },
        limit: { type: 'number', default: 10 },
      },
    },
    execute: async (args) => {
      const actions = loadActions();
      let filtered = actions;
      if (args.status && args.status !== 'all') {
        filtered = actions.filter(a => a.status === args.status);
      }
      return { actions: filtered.slice(0, args.limit || 10), total: filtered.length };
    },
  },

  {
    name: 'action.create',
    category: 'private',
    description: '创建新的行动项。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        dueDate: { type: 'string' },
      },
      required: ['title'],
    },
    execute: async (args) => {
      const actions = loadActions();
      const newAction = {
        id: Date.now().toString(),
        title: args.title,
        description: args.description || '',
        dueDate: args.dueDate || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      actions.push(newAction);
      saveActions(actions);
      return { created: true, action: newAction };
    },
  },

  {
    name: 'action.complete',
    category: 'private',
    description: '完成指定的行动项。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: async (args) => {
      const actions = loadActions();
      const action = actions.find(a => a.id === args.id);
      if (!action) return { completed: false, error: '行动项不存在' };
      action.status = 'completed';
      action.completedAt = new Date().toISOString();
      saveActions(actions);
      return { completed: true, action };
    },
  },

  // ---------- 记忆 ----------
  {
    name: 'memory.search',
    category: 'private',
    description: '搜索思意的长期记忆。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const results = searchFiles(PRIVATE_CONFIG.memoryDir, args.query, args.limit || 5);
      return { results, count: results.length };
    },
  },

  {
    name: 'memory.save',
    category: 'private',
    description: '保存长期记忆。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '记忆键名' },
        value: { type: 'string', description: '记忆内容' },
      },
      required: ['key', 'value'],
    },
    execute: async (args) => {
      const content = `# ${args.key}\n\n${args.value}\n\n---\n保存时间: ${new Date().toISOString()}`;
      return saveFile(PRIVATE_CONFIG.memoryDir, args.key, content);
    },
  },
];

module.exports.PRIVATE_CONFIG = PRIVATE_CONFIG;
