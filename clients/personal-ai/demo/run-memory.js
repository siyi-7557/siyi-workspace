/**
 * Memory 跨会话闭环演示
 *
 * 演示三种记忆能力：
 *  1. 会话记忆：同一 session 内保留上下文。
 *  2. 长期记忆：跨 session 保存并在后续会话召回（偏好 / 关键信息持久化）。
 *  3. 关联合并：把多条相关记忆聚合成一条摘要。
 *
 * 全程不依赖任何真实数据 / API。
 */

const { MemoryStore } = require('./lib/memory');

function main() {
  const mem = new MemoryStore();
  console.log('====================================================');
  console.log('  Memory 跨会话闭环演示');
  console.log('====================================================');

  // ---------- 会话 1：用户表达偏好 ----------
  console.log('\n[会话 A] 用户："以后回答尽量用中文，并且每条结论都标注来源。"');
  mem.addMessage('session-a', 'user', '以后回答尽量用中文，并且每条结论都标注来源。');
  mem.addMessage('session-a', 'assistant', '好的，我会用中文回复并标注来源。');
  console.log('   -> 已写入会话记忆（session-a）');

  // 提取长期信息
  mem.saveLongTerm('preference.language', '默认使用中文回复。', { title: '语言偏好', tags: ['preference'] });
  mem.saveLongTerm('preference.citation', '回答重要结论时需标注来源。', { title: '引用偏好', tags: ['preference'] });
  console.log('   -> 已沉淀 2 条长期记忆（preference.language / preference.citation）');

  // ---------- 会话 1：跟踪一个项目的状态 ----------
  mem.addMessage('session-a', 'user', '我在开发一个 RAG 评测脚本，目标是跑出 Recall@3 和 MRR。');
  mem.saveLongTerm('project.rag-eval', '正在开发 RAG 评测脚本，目标是输出 Recall@3 与 MRR。', { title: '项目：RAG 评测', tags: ['project'] });
  console.log('\n[会话 A] 用户："我在开发一个 RAG 评测脚本，目标 Recall@3 和 MRR。"');
  console.log('   -> 已保存项目状态到长期记忆');

  // ---------- 会话 2：跨会话追问 ----------
  console.log('\n[会话 B] 用户："你还记得我偏好什么语言回复吗？"');
  const prefResults = mem.searchLongTerm('中文');
  prefResults.forEach(r => console.log(`   -> 长期记忆命中：${r.key} = ${r.value}`));

  console.log('\n[会话 B] 用户："那个 RAG 评测项目进行到哪了？"');
  const projResults = mem.searchLongTerm('RAG 评测');
  projResults.forEach(r => console.log(`   -> 长期记忆命中：${r.key} = ${r.value}`));

  // ---------- 会话记忆：同 session 上下文 ----------
  console.log('\n[会话 C] 上下文保持演示：');
  mem.addMessage('session-c', 'user', '产品叫 Workbench');
  mem.addMessage('session-c', 'assistant', '明白，产品叫 Workbench。');
  mem.addMessage('session-c', 'user', '那它的定位是什么？');
  const ctx = mem.getSessionHistory('session-c');
  console.log('   session-c 历史上下文长度 = ' + ctx.length + ' 条');
  console.log('   最近一条用户消息 -> ' + ctx[ctx.length - 1].content);

  // ---------- 关联合并 ----------
  console.log('\n[合并] 把两条偏好聚合成一条摘要：');
  const merged = mem.consolidate('preference', '回答偏好：默认中文，结论标注来源。', { title: '回答偏好汇总', tags: ['preference', 'consolidation'] });
  console.log(`   -> ${merged.key}（合并次数 ${merged.metadata.sourceCount}）：${merged.value}`);

  console.log('\n====================================================');
  console.log('  结论：跨会话长期记忆可召回、会话内上下文可保持、多记忆可合并。');
  console.log('====================================================');
}

main();
