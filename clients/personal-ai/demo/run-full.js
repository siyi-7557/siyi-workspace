/**
 * 完整端到端闭环（离线、无密钥）
 *
 * 一次性串起全流程，对应招聘方关注的「完整端到端闭环」：
 *   语料入库 -> 索引/分块 -> RAG 检索 -> 上下文注入 -> Agent 工具循环 -> 基于来源的最终回答
 *
 * 用法：node demo/run-full.js [query]
 */

const path = require('path');
const { loadCorpus, search } = require('./lib/retriever');
const { MemoryStore } = require('./lib/memory');
const { DemoToolRegistry, buildDemoTools } = require('./lib/tools');
const { MockLLM } = require('./lib/mock-llm');

const corpusDir = path.join(__dirname, 'corpus');
const DEFAULT_QUERY = 'Nova Labs 的整套系统包含哪些产品线？它们共享什么核心？';

async function main() {
  const query = process.argv[2] || DEFAULT_QUERY;

  console.log('====================================================');
  console.log('  完整端到端闭环');
  console.log('  用户问题：' + query);
  console.log('====================================================');

  // 1. 语料入库 + 索引
  console.log('\n[1] 语料入库');
  const chunks = loadCorpus(corpusDir);
  console.log(`    从 demo/corpus 载入 ${chunks.length} 个分块（${new Set(chunks.map(c => c.filePath)).size} 篇文档）`);

  // 2. RAG 检索
  console.log('\n[2] RAG 检索 (hybrid)');
  const results = search(query, chunks, { limit: 3, mode: 'hybrid' });
  results.forEach((r, i) => {
    console.log(`    ${i + 1}. [${r.mode}] score=${r.score.toFixed(4)}  ${r.filePath}  《${r.heading}》`);
  });

  // 3. 上下文注入（镜像生产 gateway 的 _injectRAGContext）
  console.log('\n[3] 上下文注入');
  const ragContext = results.map((r, i) => `【来源${i + 1}：${r.filePath} / ${r.heading}】\n${r.content.slice(0, 200)}`).join('\n\n---\n\n');
  const systemPrompt = '你是用户的工作台助手。请基于提供的参考资料回答，并标注来源。\n\n## 参考资料\n' + ragContext;
  console.log(`    注入 ${results.length} 条参考到 System Prompt（长度 ${systemPrompt.length} 字符）`);

  // 4. Agent 工具循环（MockLLM 离线）
  console.log('\n[4] Agent 工具循环');
  const memory = new MemoryStore();
  memory.saveLongTerm('company.name', 'Nova Labs', { title: '公司', tags: ['company'] });
  const actions = new Map();
  const registry = new DemoToolRegistry();
  registry.registerAll(buildDemoTools({ chunks, memory, actions }));
  const llm = new MockLLM();
  let conversation = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ];
  const personaAllowed = ['search_knowledge', 'memory.search', 'action.list', 'action.create'];
  const toolsDefs = registry.getDefinitions().filter(t => personaAllowed.includes(t.function.name));

  let iterations = 0;
  let finalReply = '';
  const executed = [];
  while (iterations < 5) {
    iterations++;
    const response = await llm.chatWithTools(conversation, toolsDefs, llm.model, { tool_choice: 'auto' });
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
      const result = await registry.execute(name, args);
      executed.push(name);
      console.log(`    ⚙ ${name} -> success=${result.success}`);
      conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  // 5. 最终回答
  console.log(`\n[5] 最终回答（迭代 ${iterations} 次，执行工具 ${executed.length} 次）`);
  console.log('\n' + finalReply);

  console.log('\n====================================================');
  console.log('  闭环完成：入库->索引->检索->注入->工具循环->回答');
  console.log('====================================================');
}

main().catch(e => { console.error(e); process.exit(1); });
