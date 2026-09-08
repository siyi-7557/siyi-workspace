/**
 * Demo Mode 可视化本地服务（零依赖：仅用 Node 原生 http/fs）
 *
 * 用法：node demo/run-server.js [port]
 *   浏览器打开 http://localhost:8789
 *
 * 端点：
 *   GET  /             -> 聊天 + 评测界面
 *   POST /api/chat     -> 运行完整闭环（检索/注入/工具循环/回答）
 *   POST /api/ingest   -> 运行时把一段文本加入内存语料（演示增量索引）
 *   GET  /api/eval     -> 运行 RAG 评测，返回指标
 *   GET  /api/stats    -> 当前语料/记忆/工具统计
 *
 * 不读取、不写入任何个人数据；不发起任何外部请求（MockLLM）。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadCorpus, search, embed } = require('./lib/retriever');
const { MemoryStore } = require('./lib/memory');
const { DemoToolRegistry, buildDemoTools } = require('./lib/tools');
const { MockLLM } = require('./lib/mock-llm');

const PORT = parseInt(process.argv[2] || process.env.PORT || process.env.DEMO_PORT || '8789', 10);
const CORPUS_DIR = path.join(__dirname, 'corpus');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 状态（每个进程实例独立） ----------
const state = {
  chunks: loadCorpus(CORPUS_DIR),
  memory: new MemoryStore(),
  actions: new Map(),
  registry: new DemoToolRegistry(),
  llm: new MockLLM(),
};

// 预置几条长期记忆，供记忆召回演示
state.memory.saveLongTerm('company.name', 'Nova Labs', { title: '公司名', tags: ['company'] });
state.memory.saveLongTerm('preference.language', '默认使用中文回复', { title: '偏好', tags: ['preference'] });
state.memory.saveLongTerm('project.rag-eval', '正在开发 RAG 评测脚本，目标是 Recall@3 与 MRR。', { title: '项目：RAG 评测', tags: ['project'] });
state.registry.registerAll(buildDemoTools({ chunks: state.chunks, memory: state.memory, actions: state.actions }));

const SYSTEM_HEAD = '你是用户工作台的智能助手。请基于提供的参考资料回答，并标注来源。工具结果优先于模型猜测。';

// ---------- 完整闭环 ----------
async function runClosedLoop(query) {
  // 1. RAG 检索
  const retrieved = search(query, state.chunks, { limit: 3, mode: 'hybrid' });

  // 2. 上下文注入
  const ragContext = retrieved
    .map((r, i) => `【来源${i + 1}：${r.filePath} / ${r.heading}】\n${r.content}`)
    .join('\n\n---\n\n');
  const systemPrompt = SYSTEM_HEAD + (ragContext ? '\n\n## 参考资料\n' + ragContext : '');

  // 3. 记忆召回（跨会话）
  const memResults = state.memory.searchLongTerm(query, 3);

  // 4. Agent 工具循环（MockLLM 离线）
  let conversation = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ];
  const toolsDefs = state.registry.getDefinitions()
    .filter(t => ['search_knowledge', 'memory.search', 'action.list', 'action.create'].includes(t.function.name));
  const toolCalls = [];
  let finalReply = '';
  let iterations = 0;
  while (iterations < 5) {
    iterations++;
    const response = await state.llm.chatWithTools(conversation, toolsDefs, state.llm.model, { tool_choice: 'auto' });
    const message = response.message;
    if (!message.tool_calls || message.tool_calls.length === 0) {
      finalReply = message.content || '';
      break;
    }
    conversation.push(message);
    for (const tc of message.tool_calls) {
      const name = tc.function.name;
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
      const result = await state.registry.execute(name, args);
      toolCalls.push({ name, args, success: result.success, duration: result._duration });
      conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return {
    query,
    stages: [
      { label: 'RAG 检索（hybrid）', items: retrieved.map(r => ({
        file: r.filePath, heading: r.heading, score: r.score,
        content: r.content.slice(0, 200),
      })) },
      { label: '记忆召回（跨会话）', items: memResults.map(r => ({ key: r.key, value: r.value })) },
      { label: 'Agent 工具调用', items: toolCalls.map(r => ({ name: r.name, args: r.args, success: r.success, duration: r.duration })) },
    ],
    answer: finalReply,
    iterations,
  };
}

// ---------- 运行时入库（增量索引演示） ----------
function ingest(content, title) {
  const filePath = `runtime/${title || 'untitled'}.md`;
  const { chunkFile } = require('./lib/chunk');
  const md = content || `# ${title || 'untitled'}\n\n${content || ''}`;
  const newChunks = chunkFile(md, filePath);
  newChunks.forEach(c => { c.vector = embed(c.content); });
  state.chunks.push(...newChunks);
  return { added: newChunks.length, filePath };
}

// ---------- 评测 ----------
function runEval(mode = 'hybrid') {
  const chunks = loadCorpus(CORPUS_DIR);
  const queriesPath = path.join(__dirname, 'eval', 'queries.json');
  const queries = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
  const perQuery = [];
  let sumHits3 = 0, sumRR = 0, sumHits1 = 0;
  const n = queries.length;
  queries.forEach(q => {
    const gold = new Set(q.gold);
    const res = search(q.query, chunks, { limit: 5, mode });
    const hitRank = ((idx => idx === -1 ? null : idx + 1)(res.findIndex(r => gold.has(r.filePath))));
    sumHits1 += (hitRank !== null && hitRank <= 1) ? 1 : 0;
    sumHits3 += (hitRank !== null && hitRank <= 3) ? 1 : 0;
    sumRR += hitRank ? 1 / hitRank : 0;
    perQuery.push({
      id: q.id, query: q.query, gold: q.gold, hitRank,
      top: res.map(r => ({ file: r.filePath, score: r.score, hit: gold.has(r.filePath) })),
    });
  });
  return {
    mode,
    n,
    metrics: {
      'Recall@1': +(sumHits1 / n).toFixed(4),
      'Recall@3': +(sumHits3 / n).toFixed(4),
      'MRR': +(sumRR / n).toFixed(4),
    },
    perQuery,
  };
}

// ---------- 工具：读取 body ----------
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    if (p === '/api/chat' && req.method === 'POST') {
      const { query } = await readBody(req);
      const result = await runClosedLoop(query || 'Nova Labs 的 Workbench 产品是什么？');
      return json(res, 200, result);
    }
    if (p === '/api/ingest' && req.method === 'POST') {
      const { content, title } = await readBody(req);
      if (!content) return json(res, 400, { error: '缺少 content' });
      return json(res, 200, ingest(content, title));
    }
    if (p === '/api/eval') {
      return json(res, 200, runEval(url.searchParams.get('mode') || 'hybrid'));
    }
    if (p === '/api/stats') {
      return json(res, 200, {
        chunks: state.chunks.length,
        docs: new Set(state.chunks.map(c => c.filePath)).size,
        tools: state.registry.listNames(),
        memory: state.memory.allLongTerm().map(m => m.key),
      });
    }
    if (p === '/') {
      const file = path.join(PUBLIC_DIR, 'index.html');
      return serve(res, file);
    }
    // 静态文件（限制在 PUBLIC_DIR 内，禁止路径穿越）
    const file = path.resolve(PUBLIC_DIR, path.normalize(p).replace(/^([/\\])+/, ''));
    if ((file === path.resolve(path.join(PUBLIC_DIR, 'index.html')) || file.startsWith(PUBLIC_DIR + path.sep)) && fs.existsSync(file)) return serve(res, file);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function serve(res, file) {
  const ext = path.extname(file);
  const body = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': body.length });
  res.end(body);
}

// 仅监听本机回环地址，不对局域网暴露
server.listen(PORT, '127.0.0.1', () => {
  console.log('======================================================');
  console.log('   Siyi Personal AI Workspace — Demo Mode');
  console.log(`   已就绪，请用浏览器打开： http://localhost:${PORT}`);
  console.log(`   语料分块 ${state.chunks.length}  |  工具 ${state.registry.listNames().length} 个`);
  console.log('   按 Ctrl+C 退出');
  console.log('======================================================');
});
