---
title: RAG 工程实践手册
tags: [rag, 检索, 召回, 评估, evaluation]
---
# RAG 工程实践手册

## 检索链路
知识库文档 → 按标题分块 → 生成向量（可选）→ 建立 BM25 索引 → 检索时 hybrid 融合（BM25 0.4 + 向量 0.6）→ 返回 TopK。

## 召回评估（Recall / Evaluation）
使用带 ground-truth 的查询集进行评测。常用指标：
- **Recall@k**：前 k 篇中包含相关文档的比例。
- **Precision@k**：前 k 篇中相关文档占比。
- **MRR**：首个相关文档排名的倒数平均值。
- **nDCG@k**：考虑排名位置的归一化折损累积增益。

评测脚本会针对每条查询打印命中位置与完整 TopK，并汇总上述指标。
