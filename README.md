# Siyi OS — Personal AI Workspace

> 一个 0→1 独立完成的**本地个人 AI 工作台**：统一 AI Core，覆盖 **RAG 检索、跨会话记忆、Agent / Tool Calling、可复现评测**。本仓库提供的是 **Sanitized Demo**（虚构数据，克隆即跑，不含任何真实个人信息）。

把「AI 增强的个人知识管理」落到本地。核心是一套 AI Core，串联四块能力：

- **RAG 检索**（BM25 + 向量混合，带来源引用，检索可复现）
- **跨会话 / 长期记忆**（召回、沉淀、合并）
- **Agent / Tool Calling**（工具注册、多轮调用、公开/私人权限过滤）
- **RAG 召回评测**（Recall@k / Precision@k / MRR / nDCG，真实运行产出）

---

## 给评估者：快速体验（零依赖、无需个人数据）

仓库只含**虚构的演示数据**（虚构公司 Nova Labs + 虚构创始人 Alex），第三方克隆后即可完整复现工作台效果，**不读、不写任何个人数据**。

```bash
git clone https://github.com/siyi-7557/siyi-workspace && cd siyi-workspace
```

或 GitHub 页右上角 `Code` → `Download ZIP`，解压进入。

**环境要求**：Node.js **20+**（推荐 LTS；`better-sqlite3` 需要 Node 20 及以上版本）。

**最快方式**：Windows 双击根目录 **`start-demo.bat`**；macOS/Linux 执行 **`bash start-demo.sh`**。自动「装依赖 → 初始化 → 启动 → 打开浏览器」→ http://localhost:8788

> 下面的 `npm run ...` 命令都**必须在仓库根目录**（`cd siyi-workspace` 之后、有 `package.json` 的那层）运行；一键脚本 `start-demo.bat` / `start-demo.sh` 会自动定位路径，无需先进入。`demo:web`/`demo:app` 是**常驻服务**，请在对应终端窗口保持运行（关闭即停止）。

命令行直接跑：

```bash
npm run eval:rag      # RAG 召回评测（真实指标，离线可跑）
npm run demo:web      # 零依赖快速演示（离屏 MockLLM）
npm run demo:memory   # 跨会话长期记忆
npm run demo:agent    # Agent / 工具调用 + 权限过滤
npm run demo:full     # 入库→检索→记忆→工具→回答（全链路）
```

> **这个仓库的「demo」是什么？** 本仓库只含**虚构数据**（虚构公司 Nova Labs + 虚构创始人 Alex），所以叫 **Sanitized Demo**——跑起来是你的工作台界面，但内容全是虚构，**不含你的任何个人数据**。
>
> **两条入口的分工**：
> - `demo:web`（http://localhost:8789）：**零依赖、无需任何 key**，看「检索→记忆→工具→回答」四段式闭环 + RAG 评测面板。这是 **HR 看全流程效果走这条**。
> - `demo:app`（http://localhost:8788）：**真实工作台完整界面**（侧边栏/统计卡/知识卡片），数据虚构；聊天**未填 `ZHIPU_API_KEY` 时自动用离线 MockLLM 补全回答**，也能看完整闭环；填了则用真实模型。

> **两个 API Key（都在 `clients/personal-ai/.env`，复制 `.env.example` 后填写，不会入库）**：
> - `ZHIPU_API_KEY` —— **聊天/回答**用（智谱 GLM）。不填则聊天提示「未配置 Key」；视图/检索/记忆/评测**无需**。
> - `SILICONFLOW_API_KEY` —— **语义向量检索**用（硅基流动 BGE-m3）。填了才真正走「BM25+向量」混合，**召回质量更好**；不填回退纯 BM25（召回略降）。两个是不同的服务商，**需分别申请，不能一个顶两个**。

### Demo 的 RAG 评测结果（真实运行产出）

`clients/personal-ai/demo/eval/queries.json`（10 条带 ground-truth，hybrid，topK=5，离线确定性运行，任何人重跑结果一致）：

| 指标 | 数值 |
|---|---|
| Recall@1 | 0.90 |
| Recall@3 | 1.00 |
| Recall@5 | 1.00 |
| Precision@3 | 0.77 |
| MRR | 0.95 |
| nDCG@3 | 0.81 |

复现：`npm run eval:rag`（或 `node clients/personal-ai/demo/run-eval.js hybrid`）。

---

## 为什么做 / 项目亮点

- **0→1 独立完成**：从架构设计到落地的个人 AI 系统。
- **本地私有**：个人数据不上云，默认落本机，可脱离外网运行。
- **可复现**：一套隔离的虚构 Demo 环境，任何人 clone 即可跑通核心链路。
- **可验证**：自带 RAG 评测（Recall / Precision / MRR / nDCG），指标任何人可重跑复现。

## 系统架构

```
用户（浏览器 / Electron 桌面端）
                │
                ▼
   ┌─────────────────────────────┐
   │      Siyi AI Core           │
   │  Persona · Knowledge        │
   │  Tool · RAG · LLM           │
   │  Memory · Gateway           │
   └─────────────────────────────┘
      │           │            │
   RAG 检索    Agent 工具    跨会话记忆
  (BM25+向量)  (公开/私人)   (召回/沉淀/合并)
```

## 核心能力

- **RAG**：Markdown → 分块 → **BM25 + 向量混合检索** → TopK → 上下文注入 → LLM → 带来源回答。
  - Demo 内置**字符级降级向量**（确定性、无需任何 Key），保证离线可复现；生产可配置真实 embedding（BGE-M3 / 智谱 embedding-3）获得语义向量。
- **Agent / Tool Calling**：LLM → 工具注册 → 执行 → 回填 → 多轮；公开/私人工具权限过滤。
- **Memory**：会话上下文 + 长期记忆（沉淀 / 召回 / 合并），网关对话链路自动召回注入。
- **评测**：带 ground-truth 的查询集，输出 Recall@k / Precision@k / MRR / nDCG（含逐条命中情况）。

## 两种运行模式

| | Personal Mode（默认）| Demo Mode |
|---|---|---|
| 启动 | `npm start` | `npm run demo:app` |
| 数据源 | 本机 Obsidian / 个人知识 | 仓库内 `demo/vault`（虚构 Nova Labs）|
| 聊天 | 本机 API Key | 自填智谱 `ZHIPU_API_KEY` |
| 是否含个人数据 | 有（本机） | 无（虚构）|

## 隐私与安全设计

- 仓库是 **Sanitized Demo**：`demo/vault`、`demo/persona` 全部为虚构内容。
- 真实个人数据（Obsidian、`.env`、`data/`、API Key、绝对路径）由 `.gitignore` 排除，**不进仓库**。
- 私人模块（网站后台）在 Demo 模式**默认不加载**；配置 `ADMIN_PASSWORD` 环境变量后可启用后台访问口令。
- 服务默认只监听本机回环地址（127.0.0.1），不对局域网暴露。

## 目录结构（要点）

```
.
├── ai-core/                  # 共享 AI Core（persona / knowledge / tools / rag / llm / memory / gateway）
├── clients/personal-ai/
│   ├── backend/              # 工作台后端（Obsidian / RAG / Memory / Agent / SQLite）
│   │   └── public/           # 工作台前端（随服务一并启动）
│   ├── demo/                 # Sanitized Demo：虚构数据 + 语料 + 评测 + 一键脚本
│   └── electron/             # 桌面端壳
├── package.json              # 根级 npm 脚本（demo:* / eval:rag）
├── start-demo.bat|.sh        # 一键启动
└── LICENSE                   # MIT
```

## 本机自用（Personal 模式）

```bash
cd clients/personal-ai
npm install
copy .env.example .env   # Windows；Mac/Linux 用 cp，然后填 ZHIPU_API_KEY
npm start                # http://localhost:8788
```

## 诚实说明（已知边界）

- RAG 检索以 **BM25 为主**、混合向量加权融合；Demo 的向量通道为字符级降级向量（确定性、零依赖），**未使用语义 embedding**；配置真实 embedding Key 后可切换语义向量。**尚无 rerank**（文档中「重排序」是计划文案，非已实现）。
- 信息雷达采集公开 RSS 无需 Key；「AI 个性化筛选 / 相关性」层需要 LLM。
- 复盘、提示词模块默认 0，需在个人环境使用后产生数据。
- Demo 模式下私人工具（Obsidian 笔记 / Prompt / 复盘文件）路径未配置，对应工具会返回清晰的「未配置」提示——这是刻意的隐私隔离，不是 Bug。

## License

MIT
