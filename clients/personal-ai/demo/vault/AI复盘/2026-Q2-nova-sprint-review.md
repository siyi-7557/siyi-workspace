---
title: 2026 Q2 Nova Labs 冲刺复盘
tags: [复盘, sprint, reflection]
---
# 2026 Q2 Nova Labs 冲刺复盘

## 做得好的
- Workbench 的检索链路稳定，混合检索命中率提升明显。
- Agent 工具循环在沙箱里可离线复现，便于演示与回归。

## 待改进
- Radar 的 AI 理解层依赖 LLM，缺少 Key 时只能降级为原始采集。
- 知识空间目前扫描仓库目录导致夹杂开发文档，需要在 Demo 模式收敛到演示语料。

## 下一步
- 将 Radar 的演示语料固定下来，保证第三方复现结果一致。
