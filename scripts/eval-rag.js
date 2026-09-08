#!/usr/bin/env node
/**
 * eval-rag.js - RAG 检索质量评测
 *
 * 对 KnowledgeService 的检索效果做量化评测：
 *   - hit@1     榜首即命中的比例
 *   - recall@3  前 3 条结果覆盖预期文档的比例
 *   - MRR       平均倒数排名
 *
 * 默认用 BM25（零成本、无需 API Key）。
 * 设置 SILICONFLOW_API_KEY 并加 --mode embedding 可测向量检索。
 *
 * 用法：
 *   node scripts/eval-rag.js
 *   node scripts/eval-rag.js --mode embedding
 *   node scripts/eval-rag.js --topk 5
 */

const path = require('path');
const KnowledgeService = require('../ai-core/knowledge/service');

// 评测集：query 为真实用户口吻的问法，expected 为应当命中的知识文档 id
const TEST_SET = [
  { query: '你是谁，介绍一下自己', expected: ['public-identity', 'profile'] },
  { query: '会哪些技能？技术栈是什么', expected: ['skills'] },
  { query: '做过哪些项目', expected: ['project-0', 'project-1', 'project-2'] },
  { query: '怎么联系你', expected: ['contact'] },
  { query: '什么学校毕业的，教育背景', expected: ['profile'] },
  { query: '成长经历是怎样的', expected: ['public-growth-story', 'growth-story-structured'] },
  { query: 'AI 工具的使用经历', expected: ['ai-journey'] },
  { query: '最近在忙什么', expected: ['public-current_focus', 'current-focus-structured'] },
  { query: '工作方式是什么样的', expected: ['public-working-style', 'working-style-structured'] },
  { query: '性格特点是什么', expected: ['public-personality-traits'] },
  { query: '作品集网站用了什么技术', expected: ['project-0'] },
  { query: '平时的思维方式', expected: ['public-thinking-pattern'] },
];

async function main() {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'bm25';
  const topkIdx = args.indexOf('--topk');
  const topK = topkIdx >= 0 ? parseInt(args[topkIdx + 1], 10) : 3;

  const svc = new KnowledgeService({ rootDir: path.join(__dirname, '..') });
  await svc.init();

  console.log(`\n[RAG Eval] 模式: ${mode}  |  文档数: ${svc._docs.length}  |  topK: ${topK}\n`);
  console.log('─'.repeat(76));

  let hit1 = 0, recallSum = 0, mrrSum = 0;
  const rows = [];

  for (const t of TEST_SET) {
    const results = await svc.searchKnowledge(t.query, { visibility: 'public', topK, mode });
    const ids = results.map(r => r.id);
    const hits = t.expected.filter(id => ids.includes(id));
    const hit = ids.length > 0 && t.expected.includes(ids[0]);
    const firstHitRank = ids.findIndex(id => t.expected.includes(id));
    const rr = firstHitRank >= 0 ? 1 / (firstHitRank + 1) : 0;
    const recall = hits.length / t.expected.length;

    hit1 += hit ? 1 : 0;
    recallSum += recall;
    mrrSum += rr;
    rows.push({ query: t.query, ids, recall, rr, hit });

    const mark = hit ? '✓' : (hits.length > 0 ? '◐' : '✗');
    console.log(`${mark} ${t.query}`);
    console.log(`   召回 ${hits.length}/${t.expected.length}  →  [${ids.join(', ')}]`);
  }

  console.log('─'.repeat(76));
  const n = TEST_SET.length;
  console.log(`hit@1    : ${(hit1 / n * 100).toFixed(1)}%  (${hit1}/${n})`);
  console.log(`recall@${topK} : ${(recallSum / n * 100).toFixed(1)}%`);
  console.log(`MRR      : ${(mrrSum / n).toFixed(3)}`);
  console.log('');
}

main().catch(err => {
  console.error('[RAG Eval] 执行失败:', err.message);
  process.exit(1);
});
