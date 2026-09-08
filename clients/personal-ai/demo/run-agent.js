/**
 * Agent / Tool Calling 闭环演示（离线、无密钥）
 *
 * 演示与生产 backend/src/core/ai/personal-ai.js 相同的 Agent 循环：
 *   System Prompt -> LLM(tool_calls) -> 执行工具 -> 回填结果 -> LLM(最终) -> 退出
 *
 * 额外演示权限过滤：公开人格只能调用公开工具，私人工具被拦截。
 */

const path = require('path');
const { loadCorpus } = require('./lib/retriever');
const { MemoryStore } = require('./lib/memory');
const { DemoToolRegistry, buildDemoTools } = require('./lib/tools');
const { MockLLM } = require('./lib/mock-llm');

const corpusDir = path.join(__dirname, 'corpus');

// 人格配置（演示权限差异，对应生产 persona/personal-ai.js 与 meet-siyi.js）
const PERSONAS = {
  'personal-ai': {
    visibility: 'all',
    allowedTools: ['search_knowledge', 'memory.search', 'memory.save', 'action.list', 'action.create'],
    systemPrompt: '你是用户的 Personal AI 助手，调用工具访问数据，工具结果优先于模型猜测。',
  },
  'meet-siyi': {
    visibility: 'public',
    // 公开人格只允许公开工具
    allowedTools: ['search_knowledge'],
    systemPrompt: '你是公开数字伙伴，只基于公开知识回答。',
  },
};

function buildConversation(persona, userInput) {
  return [
    { role: 'system', content: persona.systemPrompt },
    { role: 'user', content: userInput },
  ];
}

async function runAgent(personaName, userInput, toolsDefs, registry, llm, forcedToolCalls = []) {
  const persona = PERSONAS[personaName];
  let conversation = buildConversation(persona, userInput);
  const toolCalls = [];
  let iterations = 0;
  const maxIterations = 5;
  let finalReply = '';

  while (iterations < maxIterations) {
    iterations++;
    const tools = toolsDefs.filter(t => persona.allowedTools.includes(t.function.name));
    let message;
    if (iterations === 1 && forcedToolCalls.length > 0) {
      // 直接注入一次工具调用，用于确定性演示权限拦截（绕过 LLM 选择）
      message = { role: 'assistant', content: null, tool_calls: forcedToolCalls };
    } else {
      const response = await llm.chatWithTools(conversation, tools, llm.model, { tool_choice: 'auto' });
      message = response.message;
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      finalReply = message.content || '';
      break;
    }

    conversation.push(message);
    for (const tc of message.tool_calls) {
      const tName = tc.function.name;
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}

      // 权限过滤
      if (!persona.allowedTools.includes(tName)) {
        console.log(`   ⚠ 权限拦截：人格[${personaName}] 尝试调用私人工具 ${tName}，已拒绝`);
        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ success: false, error: { code: 'PERMISSION_DENIED', message: '公开人格无权调用私人工具' } }),
        });
        continue;
      }

      const result = await registry.execute(tName, args);
      toolCalls.push({ name: tName, args, success: result.success, duration: result._duration });
      console.log(`   ⚙ 执行工具 ${tName}(${JSON.stringify(args)}) -> success=${result.success} (${result._duration}ms)`);
      conversation.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { personaName, userInput, iterations, toolCalls, finalReply };
}

async function main() {
  const chunks = loadCorpus(corpusDir);
  const memory = new MemoryStore();
  memory.saveLongTerm('company.name', 'Nova Labs', { title: '公司名', tags: ['company'] });
  memory.saveLongTerm('preference.language', '默认使用中文回复', { title: '偏好', tags: ['preference'] });

  const actions = new Map();
  const registry = new DemoToolRegistry();
  registry.registerAll(buildDemoTools({ chunks, memory, actions }));
  const llm = new MockLLM();
  const toolsDefs = registry.getDefinitions();

  console.log('====================================================');
  console.log('  Agent / Tool Calling 闭环（离线 MockLLM）');
  console.log('====================================================');

  // 场景 1：私人助手，走知识检索 + 记忆检索
  const r1 = await runAgent('personal-ai', 'Nova Labs 的 Workbench 产品核心能力是什么？', toolsDefs, registry, llm);
  console.log('\n[场景1] personal-ai 人格，用户问产品能力：');
  console.log(`  迭代 ${r1.iterations} 次，调用工具 ${r1.toolCalls.length} 个`);
  console.log(`  最终：${r1.finalReply}`);

  // 场景 2：私人助手，写记忆 + 读记忆
  const r2 = await runAgent('personal-ai', '帮我创建行动项：整理本周复盘记录', toolsDefs, registry, llm);
  console.log('\n[场景2] personal-ai 人格，用户要求创建行动项：');
  console.log(`  迭代 ${r2.iterations} 次，调用工具 ${r2.toolCalls.length} 个`);
  r2.toolCalls.forEach(tc => console.log(`    * ${tc.name} -> ${tc.success}`));

  // 场景 3：公开人格，尝试调用私人工具 -> 权限拦截
  const r3 = await runAgent(
    'meet-siyi',
    '帮我保存一条私人记忆：我的偏好',
    toolsDefs,
    registry,
    llm,
    [{ id: 'call_forced', type: 'function', function: { name: 'memory.save', arguments: JSON.stringify({ key: 'preference.foo', value: '私人偏好' }) } }]
  );
  console.log('\n[场景3] meet-siyi 公开人格，用户要求保存记忆：');
  console.log(`  迭代 ${r3.iterations} 次`);
  r3.toolCalls.forEach(tc => console.log(`    * 请求私有工具 ${tc.name} -> 被权限层拒绝`));
  console.log('   （公开人格工具白名单只含 search_knowledge，即便 LLM 请求 memory.save 也被循环层拦截）');
  console.log(`  最终：${r3.finalReply || '（无工具结果，已安全退回）'}`);

  console.log('\n====================================================');
  console.log('  结论：Agent 循环（LLM->tool_call->执行->回填->最终）可离线跑通，且权限过滤生效。');
  console.log('====================================================');
}

main().catch(e => { console.error(e); process.exit(1); });
