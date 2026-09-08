// Function Calling 工具定义
const tools = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '检索Obsidian笔记库，根据关键词或自然语言问题找到相关的笔记片段',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或自然语言问题' },
          limit: { type: 'integer', description: '返回结果数量，默认5', default: 5 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: '在Obsidian中创建一篇新的Markdown笔记',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          content: { type: 'string', description: '笔记正文内容（Markdown格式）' },
          folder: { type: 'string', description: '存放文件夹，默认为根目录', default: '' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_summary',
      description: '根据检索到的多篇笔记内容，生成一个结构化的汇总摘要',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '汇总的主题' },
          notes: { type: 'array', items: { type: 'string' }, description: '笔记内容片段列表' },
        },
        required: ['topic', 'notes'],
      },
    },
  },
];

// 工具执行器
async function executeTool(name, args) {
  switch (name) {
    case 'search_notes':
      return await execSearchNotes(args);
    case 'create_note':
      return await execCreateNote(args);
    case 'generate_summary':
      return await execGenerateSummary(args);
    default:
      return { error: `未知工具: ${name}` };
  }
}

async function execSearchNotes(args) {
  const indexer = require('../rag/indexer');
  const results = await indexer.search(args.query, { limit: args.limit || 5, mode: 'hybrid' });
  return {
    results: results.map(r => ({
      title: r.heading,
      path: r.filePath,
      content: r.content.substring(0, 500),
      score: r.score,
    })),
  };
}

async function execCreateNote(args) {
  const vault = require('../obsidian/vault');
  const path = require('path');
  const folder = args.folder || '';
  const fileName = `${args.title}.md`;
  const relPath = folder ? path.join(folder, fileName) : fileName;

  const frontmatter = `---
title: "${args.title}"
created: ${new Date().toISOString()}
---

`;
  const fullPath = vault.writeNote(relPath, frontmatter + args.content);
  return { success: true, path: relPath, fullPath };
}

async function execGenerateSummary(args) {
  const aiClient = require('./client');
  const systemPrompt = `你是一个知识汇总助手。根据用户提供的多篇笔记片段，生成一个结构化的汇总摘要。
要求：
1. 按主题分类整理
2. 提取核心观点和关键信息
3. 标注信息来源（笔记标题）
4. 输出Markdown格式
5. 如果笔记内容有冲突，指出差异`;

  const notesText = args.notes.map((n, i) => `笔记${i + 1}:\n${n}`).join('\n\n---\n\n');
  const summary = await aiClient.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `汇总主题：${args.topic}\n\n${notesText}` },
  ]);
  return { summary };
}

module.exports = { tools, executeTool };
