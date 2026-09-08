# Demo Mode（可复现演示）

> 一套**自包含、零依赖、无需 API Key** 的可复现 Demo。用于向招聘方演示：RAG 全链路、RAG Recall / Evaluation、Memory、Agent / Tool Calling、完整端到端闭环——**全程不包含任何真实 / 个人数据**。

## 为什么需要 Demo Mode

这是一个原本为个人使用而开发的 Personal AI Workspace，生产系统依赖本地环境（Obsidian Vault、本地数据库、个人记忆/复盘、API Key、绝对路径）。这些数据**不会上传 GitHub**。为了在不暴露个人数据的前提下让技术验证可跑通，本项目提供本 Demo Mode：用一套**通用示例知识库**（虚构公司 Nova Labs）复现同一套推理流程。

## 与生产代码的关系

Demo 采用与生产**相同的算法与结构**，但在一个隔离、无密钥的沙箱里运行：

| 能力 | Demo 实现 | 生产实现 |
|---|---|---|
| Markdown 分块 | `demo/lib/chunk.js` | `backend/src/core/obsidian/parser.js` + `src/core/rag/chunker.js` |
| 检索（BM25+向量+hybrid） | `demo/lib/retriever.js` | `backend/src/core/rag/indexer.js` |
| 记忆（会话+长期+合并） | `demo/lib/memory.js` | `backend/src/core/rag` + `data/` |
| 工具注册/执行 | `demo/lib/tools.js` | `backend/src/core/ai/tool-registry.js` |
| Agent / Tool Calling 循环 | `demo/run-agent.js`（MockLLM） | `backend/src/core/ai/personal-ai.js`（真实 LLM） |

生产需要真实 API Key 与个人语料；Demo 用确定性 MockLLM 与通用语料，因此**克隆后无需配置即可运行**。

## 可视化 App（推荐给招聘方做远程演示）

这是首选演示方式：克隆后一键起一个本地服务，用浏览器看**带界面的完整闭环**（RAG 检索 → 记忆召回 → 工具调用 → 基于来源的回答），以及 RAG 评测数字面板。

在 `clients/personal-ai/` 下，任选一种：

```bash
npm run demo:web            # 启动后打开 http://localhost:8789
# 或
node demo/run-server.js
```

Windows 也可以直接双击 `demo/start-demo.cmd`（会自动启动服务并打开浏览器）。

界面里你可以：
- **对话闭环**：输入问题，看到「检索到的文档 / 命中的记忆 / 调用的工具 / 最终回答」四步实况。
- **运行时入库**：粘贴任意一段文本，它会即时入索引，随后输入相关关键词就能看到它被检索命中——演示「增量索引」。
- **RAG 评测**：一键跑 `hybrid / bm25 / vector` 三种模式，展示 Recall@k、MRR 与逐条命中情况。

> 说明：Demo 使用确定性 MockLLM 驱动工具循环，因此无需任何 API Key 也能离线演示工具调用。若配置了真实 LLM，生产实现见 `backend/src/core/ai/`。

## 运行

在 `clients/personal-ai/` 下（已有 Node 即可，无需 `npm install`，因为 Demo 是零依赖的纯 Node 脚本）：

```bash
# RAG 召回 / Evaluation（默认 hybrid，可选 bm25 / vector）
node demo/run-eval.js
node demo/run-eval.js bm25
node demo/run-eval.js vector

# 跨会话记忆闭环
node demo/run-memory.js

# Agent / Tool Calling + 权限过滤
node demo/run-agent.js

# 完整端到端闭环
node demo/run-full.js
node demo/run-full.js "Nova Labs 的整套系统包含哪些产品线？"
```

也可以：
```bash
npm run demo:eval
npm run demo:memory
npm run demo:agent
npm run demo:full
```

## 评测指标说明

`demo/eval/queries.json` 是带 ground-truth 的查询集（每条查询对应期望的文档来源）。`node demo/run-eval.js` 会：

- 针对每条查询打印命中位置与完整 TopK（`✓` 表示命中期望来源）。
- 汇总 `Recall@k` / `Precision@k` / `MRR` / `nDCG@k`。

这些 metrics 正是生产 RAG 评测的常用指标，Demo 用可复现的方式完整呈现。

## 隐私与安全

- `demo/` 下所有语料均为虚构、通用的内容，与你个人数据无关。
- 不读取、不写入生产配置 / 数据库 / Obsidian / `.env`。
- MockLLM 不发起任何网络请求；向量检索在没有 Embedding API Key 时使用降级向量（与生产一致）。
- 生产真实数据（`backend/data/`、`.env`、Obsidian）已被 `.gitignore` 排除，不会进入仓库。
