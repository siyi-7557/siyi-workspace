# Siyi OS — Personal AI Workspace

> 一个 0→1 独立完成的个人 AI 工作台：统一 AI Core，覆盖 **RAG 检索、跨会话记忆、Agent / Tool Calling、可复现评测**。本仓库提供的是 **Sanitized Demo**（虚构数据，克隆即跑，不含任何真实个人信息）。

把「AI 增强的个人知识管理」落到本地。核心是同一套 AI Core，串联四块能力：

- **RAG 检索**（BM25 + 向量混合，带来源引用）
- **跨会话 / 长期记忆**（召回、沉淀、合并）
- **Agent / Tool Calling**（工具注册、多轮调用、公开/私人权限过滤）
- **RAG 召回评测**（Recall@k / MRR / nDCG，真实运行产出）

---

## 给评估者：快速体验（零依赖、无需个人数据）

仓库只含**虚构的演示数据**（虚构公司 Nova Labs + 虚构创始人 Alex），第三方克隆后即可完整复现工作台效果，**不读、不写任何个人数据**。

```bash
git clone https://github.com/siyi-7557/siyi-workspace && cd siyi-workspace
```

或 GitHub 页右上角 `Code` → `Download ZIP`，解压进入。

**最快方式**：Windows 双击根目录 **`start-demo.bat`**；macOS/Linux 执行 **`bash start-demo.sh`**。自动「装依赖 → 初始化 → 启动 → 打开浏览器」→ http://localhost:8788

命令行直接跑：

```bash
npm run eval:rag      # RAG 召回评测（真实指标）
npm run demo:web      # 零依赖快速演示（离屏 MockLLM）
npm run demo:memory   # 跨会话长期记忆
npm run demo:agent    # Agent / 工具调用 + 权限过滤
npm run demo:full     # 入库→检索→记忆→工具→回答（全链路）
```

> 视图、检索、记忆、评测**无需 API Key**。聊天需要填一个智谱 `ZHIPU_API_KEY`（`clients/personal-ai/.env`）；未配置时界面会给出清晰提示。

### Demo 的 RAG 评测结果（真实运行产出）

`demo/eval/queries.json`（10 条带 ground-truth，hybrid，topK=5）：

| 指标 | 数值 |
|---|---|
| Recall@1 | 0.90 |
| Recall@3 | 1.00 |
| MRR | 0.95 |

---

## 为什么做 / 项目亮点

- **0→1 独立完成**：从架构设计到落地的个人 AI 系统。
- **本地私有**：个人数据不上云，默认落本机，可脱离外网运行。
- **可复现**：一套隔离的虚构 Demo 环境，任何人 clone 即可跑通核心链路。
- **可验证**：自带 RAG 评测（Recall / Precision / MRR / nDCG），指标可复现。

## 系统架构

```
用户
 ├── Meet Siyi（公网数字伙伴，仅公开知识）  ──┐
 │                                            │
 └── Personal AI（本地工作台，全部知识）      ──┤
                                                │
                                                ▼
                  ┌──────────────────────────┐
                  │        Siyi AI Core      │
                  │  Persona · Knowledge      │
                  │  Tool · RAG · LLM         │
                  │  Memory · Gateway         │
                  └──────────────────────────┘
```

> 「Meet Siyi」公网数字伙伴独立部署；本仓库聚焦**可公开复现的本地工作台 Demo**。

## 核心能力

- **RAG**：Markdown → 分块 → BM25 + 向量 hybrid → TopK → 上下文注入 → LLM → 带来源回答。
- **Agent / Tool Calling**：LLM → 工具注册 → 执行 → 回填 → 多轮；公开/私人工具权限过滤。
- **Memory**：会话上下文 + 长期记忆（沉淀 / 召回 / 合并）。
- **评测**：带 ground-truth 的查询集，输出 hit@k / MRR / nDCG（含逐条命中情况）。

## 两种运行模式

| | Personal Mode（默认）| Demo Mode |
|---|---|---|
| 启动 | `npm start` | `npm run demo:app` |
| 数据源 | 本机 Obsidian / 个人知识 | 仓库内 `demo/vault`（虚构 Nova Labs）|
| 聊天 | 本机 API Key | 自填智谱 `ZHIPU_API_KEY` |
| 是否含个人数据 | 有（本机） | 无（虚构）|

## 隐私设计

- 仓库是 **Sanitized Demo**：`demo/vault`、`demo/persona` 全部为虚构内容。
- 真实个人数据（Obsidian、`.env`、`data/`、API Key、绝对路径）由 `.gitignore` 排除，**不进仓库**。
- 「网站后台」为私人功能，Demo 模式**默认不加载**。

## 目录结构（要点）

```
.
├── ai-core/            # 共享 AI Core（persona / knowledge / tools / rag / llm / memory / gateway）
├── clients/personal-ai/
│   ├── backend/        # 生产后端（Obsidian / RAG / Memory / Agent）
│   ├── frontend/       # 工作台前端
│   └── demo/           # Sanitized Demo：虚构数据 + 评测 + 一键启动
├── package.json        # 根级 npm 脚本（demo:* / eval:rag）
└── start-demo.bat|.sh  # 一键启动
```

## 本机自用（Personal 模式）

```bash
cd clients/personal-ai
npm install
copy .env.example .env   # Windows；Mac/Linux 用 cp，然后填 ZHIPU_API_KEY
npm start                # http://localhost:8788
```

## 诚实说明（已知边界）

- 当前 RAG 为 **BM25 + 向量 hybrid**，**尚无 rerank**（文档中「重排序」是计划文案，非已实现）。
- 信息雷达采集公开 RSS 无需 Key；「AI 个性化筛选 / 相关性」层需要 LLM。
- 复盘、提示词模块默认 0，需在个人环境使用后产生数据。

## License

MIT
