/**
 * RAG Recall / Evaluation 评测
 *
 * 用法：node demo/run-eval.js [mode]
 *   mode = bm25 | vector | hybrid（默认 hybrid）
 *
 * 针对 demo/eval/queries.json 的每条查询检索 TopK，
 * 打印每条命中位置与完整 TopK，并汇总 Recall@k / Precision@k / MRR / nDCG@k。
 */

const path = require('path');
const { loadCorpus, search } = require('./lib/retriever');

const corpusDir = path.join(__dirname, 'corpus');
const evalFile = path.join(__dirname, 'eval', 'queries.json');
const mode = process.argv[2] || 'hybrid';

const TOP_K = 5;

function main() {
  const chunks = loadCorpus(corpusDir);
  const queries = JSON.parse(require('fs').readFileSync(evalFile, 'utf-8'));

  console.log('====================================================');
  console.log(`  RAG Evaluation  mode=${mode}  语料 ${chunks.length} 个分块  / 查询 ${queries.length} 条`);
  console.log('====================================================');

  let sumHits1 = 0, sumHits3 = 0, sumHits5 = 0, sumPrec1 = 0, sumPrec3 = 0, sumPrec5 = 0;
  let sumRR = 0, sumDCG3 = 0, sumDCG5 = 0;

  queries.forEach(q => {
    const results = search(q.query, chunks, { limit: TOP_K, mode });
    const gold = new Set(q.gold);
    const goldChunks = chunks.filter(c => gold.has(c.filePath));

    // 命中：检索结果的 filePath 属于 gold 集合
    const hitAt = results.findIndex(r => gold.has(r.filePath));
    const hitRank = hitAt === -1 ? null : hitAt + 1;

    // 逐文档 relevance（k 以内）
    let dcg3 = 0, dcg5 = 0;
    let ideal3 = 0, ideal5 = 0;
    results.forEach((r, i) => {
      const rel = gold.has(r.filePath) ? 1 : 0;
      if (rel) {
        if (i < 3) dcg3 += 1 / Math.log2(i + 2);
        if (i < 5) dcg5 += 1 / Math.log2(i + 2);
      }
    });
    // 理想排序：把所有金标块放在最前
    for (let i = 0; i < Math.min(goldChunks.length, 3); i++) ideal3 += 1 / Math.log2(i + 2);
    for (let i = 0; i < Math.min(goldChunks.length, 5); i++) ideal5 += 1 / Math.log2(i + 2);
    ideal3 = ideal3 || 1;
    ideal5 = ideal5 || 1;

    const hits1 = hitRank !== null && hitRank <= 1 ? 1 : 0;
    const hits3 = hitRank !== null && hitRank <= 3 ? 1 : 0;
    const hits5 = hitRank !== null && hitRank <= 5 ? 1 : 0;
    const prec1 = hits1 / 1;
    const prec3 = results.slice(0, 3).filter(r => gold.has(r.filePath)).length / 3;
    const prec5 = results.slice(0, 5).filter(r => gold.has(r.filePath)).length / 5;
    const rr = hitRank ? 1 / hitRank : 0;

    sumHits1 += hits1; sumHits3 += hits3; sumHits5 += hits5;
    sumPrec1 += prec1; sumPrec3 += prec3; sumPrec5 += prec5;
    sumRR += rr; sumDCG3 += dcg3 / ideal3; sumDCG5 += dcg5 / ideal5;

    console.log(`\n[${q.id}] ${q.query}`);
    console.log(`  期望来源: ${q.gold.join(', ')}`);
    console.log(`  命中位置: ${hitRank === null ? '未命中(>5)' : '#' + hitRank}`);
    results.forEach((r, i) => {
      const mark = gold.has(r.filePath) ? '✓' : ' ';
      console.log(`   ${mark} ${i + 1}. [${r.mode}] score=${r.score.toFixed(4)}  ${r.filePath}  《${r.heading}》`);
    });
  });

  const n = queries.length;
  console.log('\n====================================================');
  console.log('  汇总指标（mode=' + mode + '）');
  console.log('====================================================');
  const row = (label, val) => console.log(`  ${label.padEnd(22)} ${val.toFixed(4)}`);
  row('Recall@1', sumHits1 / n);
  row('Recall@3', sumHits3 / n);
  row('Recall@5', sumHits5 / n);
  row('Precision@1', sumPrec1 / n);
  row('Precision@3', sumPrec3 / n);
  row('Precision@5', sumPrec5 / n);
  row('MRR', sumRR / n);
  row('nDCG@3', sumDCG3 / n);
  row('nDCG@5', sumDCG5 / n);
  console.log('');
}

main();
