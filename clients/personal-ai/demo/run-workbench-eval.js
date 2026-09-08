/**
 * 工作台生产链路 RAG 召回评测
 *
 * 用工作台 Agent 实际使用的检索器（backend/src/core/rag/indexer，BM25+向量 hybrid）
 * 对 demo/corpus 做检索，并按 demo/eval/queries.json 的 ground-truth 计算
 * Recall@k / Precision@k / MRR / nDCG@k。
 *
 * 用法：node demo/run-workbench-eval.js [mode] [topK]
 *   mode = bm25 | vector | hybrid（默认 hybrid）
 *
 * 这样广告里的召回数字 = 工作台生产链路本身的检索质量，而非另一套 lib 的实现。
 */

const path = require('path');
const fs = require('fs');

const indexer = require('../backend/src/core/rag/indexer');

const CORPUS = path.join(__dirname, 'corpus');
const EVAL = path.join(__dirname, 'eval', 'queries.json');
const mode = process.argv[2] || 'hybrid';
const TOP_K = parseInt(process.argv[3] || '5', 10);

function main() {
  const queries = JSON.parse(fs.readFileSync(EVAL, 'utf-8'));

  // 命中判断：结果 filePath 的 basename 是否属于金标准集合
  const goldMatch = (result, gold) => {
    const base = path.basename(result.filePath).replace(/\\/g, '/').toLowerCase();
    return gold.some(g => String(g).replace(/\\/g, '/').toLowerCase() === base);
  };

  let sumHits1 = 0, sumHits3 = 0, sumHits5 = 0, sumPrec1 = 0, sumPrec3 = 0, sumPrec5 = 0;
  let sumRR = 0, sumDCG3 = 0, sumDCG5 = 0;
  const perQuery = [];

  return (async () => {
    await indexer.rebuildIndex(CORPUS);

    for (const q of queries) {
      const raw = await indexer.search(q.query, { limit: TOP_K, mode });
      const gold = q.gold || [];
      // 按文件去重（同一文档多 chunk 只算一次），保留首个（分数最高）出现
      const seen = new Set();
      const results = raw.filter(r => {
        const base = path.basename(r.filePath).replace(/\\/g, '/').toLowerCase();
        if (seen.has(base)) return false;
        seen.add(base);
        return true;
      });

      const hitAt = results.findIndex(r => goldMatch(r, gold));
      const hitRank = hitAt === -1 ? null : hitAt + 1;

      // 逐位相关度（去重后，唯一文件）
      let dcg3 = 0, dcg5 = 0;
      results.forEach((r, i) => {
        const rel = goldMatch(r, gold) ? 1 : 0;
        if (rel) {
          if (i < 3) dcg3 += 1 / Math.log2(i + 2);
          if (i < 5) dcg5 += 1 / Math.log2(i + 2);
        }
      });
      const ideal3 = gold.slice(0, 3).reduce((s, _, i) => s + 1 / Math.log2(i + 2), 0);
      const ideal5 = gold.slice(0, 5).reduce((s, _, i) => s + 1 / Math.log2(i + 2), 0);

      const rel3 = results.slice(0, 3).filter(r => goldMatch(r, gold)).length;
      const rel5 = results.slice(0, 5).filter(r => goldMatch(r, gold)).length;
      sumHits1 += hitRank === 1 ? 1 : 0;
      sumHits3 += hitRank != null && hitRank <= 3 ? 1 : 0;
      sumHits5 += hitRank != null && hitRank <= 5 ? 1 : 0;
      sumPrec1 += rel3 >= 1 ? 1 : 0;
      sumPrec3 += rel3 / Math.min(3, results.length || 1);
      sumPrec5 += rel5 / Math.min(5, results.length || 1);
      sumRR += hitRank ? 1 / hitRank : 0;
      sumDCG3 += ideal3 ? dcg3 / ideal3 : 0;
      sumDCG5 += ideal5 ? dcg5 / ideal5 : 0;

      perQuery.push({ q: q.query, hitRank, top: results.slice(0, 5).map(r => path.basename(r.filePath)) });
    }

    const N = queries.length;
    console.log('====================================================');
    console.log(`  工作台生产链路 RAG Eval  模式=${mode}  语料块=${indexer.getStatus().totalChunks}  查询=${N}`);
    console.log('====================================================');
    perQuery.forEach(p => console.log(`  ${p.hitRank ? '✓' : '✗'} [${p.q}]  命中#${p.hitRank ?? '-'}  ${p.top.join(' | ')}`));
    console.log('----------------------------------------------------');
    console.log(`  Recall@1   ${(sumHits1 / N).toFixed(4)}`);
    console.log(`  Recall@3   ${(sumHits3 / N).toFixed(4)}`);
    console.log(`  Recall@5   ${(sumHits5 / N).toFixed(4)}`);
    console.log(`  Precision@1 ${(sumPrec1 / N).toFixed(4)}`);
    console.log(`  Precision@3 ${(sumPrec3 / N).toFixed(4)}`);
    console.log(`  Precision@5 ${(sumPrec5 / N).toFixed(4)}`);
    console.log(`  MRR        ${(sumRR / N).toFixed(4)}`);
    console.log(`  nDCG@3     ${(sumDCG3 / N).toFixed(4)}`);
    console.log(`  nDCG@5     ${(sumDCG5 / N).toFixed(4)}`);
    console.log('====================================================');
  })();
}

main().catch(e => { console.error('[WorkbenchEval] 失败:', e.message); process.exit(1); });
