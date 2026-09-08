# Siyi OS

> 一个 AI Core，两个入口。

Siyi OS 是思意的统一 AI 系统，将 Meet Siyi（公网网站数字伙伴）和 Personal AI（本地工作台私人助手）整合到同一个 AI Core 架构下。

## 给评估者 / 招聘演示（推荐）

这是一个 **Personal AI Workspace**，但仓库提供的是一个 **Sanitized Demo Environment**——你的真实个人数据（Obsidian、个人知识、记忆、API Key、绝对路径）全都留在你本机，不会上传 GitHub。仓库里只有**虚构的演示数据（Nova Labs）** + 同一套业务逻辑，第三方克隆后即可完整复现工作台效果。

### 方式一：完整复刻你界面（推荐，同一套前端）
用**真实工作台**（`backend/public` 前端，含总览/知识/复盘/提示词/信息雷达/英语学习等）跑在仓库内虚构 Vault 上，界面与你本机完全一致、内容为虚构 Nova Labs：

> **最快方式**：clone/解压后，直接双击根目录 **`start-demo.bat`**（Windows），或执行 **`bash start-demo.sh`**（macOS/Linux，无需赋执行权限），会自动「装依赖 → 初始化 → 启动 → 打开浏览器」。

```bash
# 获取代码（二选一）
git clone https://github.com/siyi-7557/siyi-os && cd siyi-os
# 或：GitHub 页面右上角 Code → Download ZIP，解压后 cd siyi-os

# 安装真实工作台依赖（demo:app 需要 express / better-sqlite3 等）
cd clients/personal-ai && npm install && cd ../..

npm run demo:init      # 生成 .env（聊天需自填一个智谱 ZHIPU_API_KEY）
npm run demo:app       # 启动真实工作台 → http://localhost:8788
```

- 界面、侧边栏、统计卡、知识卡片 = 和你一模一样；数字为虚构统计。
- 聊天走真实 LLM（智谱 GLM），**HR 自己填 Key**；视图/检索/记忆无需 Key 即可看。
- **信息雷达** 会自动采集公开 RSS（Hacker News / GitHub Trending / Product Hunt 等，无需 Key）；只有「AI 理解 / 相关性」层需要 LLM，未配 Key 时条目以原始状态展示。
- **网站后台** 是你私人功能，Demo 模式默认**不加载**。

### 方式二：零依赖快速演示（离屏 MockLLM）
不需要 Key、也不装依赖（纯 Node），用于快速看「检索→记忆→工具→回答」闭环：

```bash
npm run demo:web      # http://localhost:8789 带界面
npm run eval:rag      # 命令行跑 RAG 召回评测
npm run demo:memory   # 跨会话长期记忆
npm run demo:agent    # Agent / 工具调用 + 权限过滤
npm run demo:full     # 全链路
```

### Demo 的 RAG 评测结果（`demo/eval/queries.json`，10 条带 ground-truth，hybrid，topK=5，真实运行产出）

| 指标 | 数值 |
|---|---|
| Recall@1 | 0.90 |
| Recall@3 | 1.00 |
| MRR | 0.95 |

### 两种模式的区别

| | Personal Mode（默认）| Demo Mode |
|---|---|---|
| 启动 | `npm start` | `npm run demo:app` |
| 数据源 | 你的 Obsidian / 个人知识 | 仓库内 `demo/vault`（虚构 Nova Labs）|
| 聊天 | 你的 API Key | HR 自填智谱 ZHIPU_API_KEY |
| 网站后台 | 加载（你私人用）| 跳过 |
| 是否含个人数据 | 有（你本机）| 无（虚构）|

### RAG 链路（诚实说明）
当前生产 RAG = **BM25 + 向量 hybrid**，**没有 rerank**（`ai-core/knowledge/public/identity.md` 里「语义检索 + 重排序」只是人格的**计划/目标文案**，不是已有代码）。链路：Query → 分块 → BM25+向量 hybrid → TopK → 上下文注入 → LLM → Answer。

## 架构概览

```
用户
 │
 ├── Meet Siyi（公网网站）        ──┐
 │   公开人格层，仅访问公开知识      │
 │                                   │
 └── Personal AI（本地工作台）      ──┤
     私人助手层，访问全部知识         │
                                       │
                                       ▼
                           ┌──────────────────┐
                           │   Siyi AI Core    │
                           │                    │
                           │  Persona Layer     │
                           │  Knowledge Core    │
                           │  Tool Layer        │
                           │  RAG Engine        │
                           │  LLM Router        │
                           │  Memory Service    │
                           │  AI Gateway        │
                           └──────────────────┘
```

## 目录结构

```
Siyi OS/
├── ai-core/                    # 共享 AI Core（核心）
│   ├── index.js                # AI Core 统一入口
│   ├── persona/                # 人格配置层
│   │   ├── index.js            # 人格加载器
│   │   ├── meet-siyi.js        # Meet Siyi 人格（公开数字伙伴）
│   │   └── personal-ai.js      # Personal AI 人格（私人助手）
│   ├── knowledge/              # 知识核心
│   │   ├── service.js          # 统一知识服务（含权限过滤）
│   │   ├── public/             # 公开知识（两个入口均可访问）
│   │   └── private/            # 私人知识（仅 Personal AI 可访问）
│   ├── tools/                  # 工具层
│   │   ├── registry.js         # 工具注册中心
│   │   ├── public/             # 公开工具
│   │   └── private/            # 私人工具
│   ├── rag/                    # RAG 检索引擎
│   │   ├── retriever.js        # 检索器（BM25 + 向量）
│   │   ├── indexer.js          # 索引构建器
│   │   └── embedding.js        # 向量嵌入服务
│   ├── llm/                    # LLM 路由
│   │   └── router.js           # 多模型自动降级
│   ├── memory/                 # 记忆系统
│   │   └── service.js          # 记忆服务
│   └── gateway/                # AI 网关
│       └── index.js            # 统一流程编排
├── clients/                    # 客户端入口
│   ├── meet-siyi/              # Meet Siyi 同步镜像（生产入口在 D:\个人网站）
│   │   ├── frontend/           # 前端镜像（sync-knowledge.js 同步）
│   │   └── backend/            # 后端占位（生产用 Cloudflare/CloudBase）
│   └── personal-ai/            # Personal AI 工作台客户端
│       ├── electron/           # Electron 主进程
│       ├── frontend/           # 前端
│       └── backend/            # Express 后端
├── data/                       # 共享数据（不入库，本机私有）
│   ├── rag-index.json          # 向量索引
│   └── memory/                 # 记忆数据
├── examples/                   # 演示数据
│   └── demo-data/              # 虚构人物演示数据（seed 脚本用）
├── scripts/                    # 工具脚本
│   ├── seed-demo.js            # 植入演示数据
│   └── eval-rag.js             # RAG 检索质量评测
├── docs/                       # 文档
│   └── ARCHITECTURE.md         # 架构文档
└── README.md
```

## 两个入口对比

| 维度 | Meet Siyi | Personal AI |
|---|---|---|
| 定位 | 了解思意的数字伙伴 | 思意的私人 AI 工作伙伴 |
| 部署 | 公网网站（Cloudflare/CloudBase） | 本地 Electron 应用 |
| 知识权限 | 仅 public | 全部（public + private） |
| 工具权限 | 仅 public tools | 全部工具 |
| System Prompt | 公开人格，帮助访客认识思意 | 私人人格，帮助学习工作 |
| 记忆 | 无持久化（前端 localStorage） | 完整记忆系统 |
| 数据源 | 人格知识、项目、成长故事 | + Obsidian笔记、Prompt库、复盘、待办 |

## 核心模块说明

### AI Core (`ai-core/`)
共享的 AI 核心，两个客户端都通过它处理消息。

- **Persona Layer**: 管理不同入口的人格配置（System Prompt、可用工具、权限）
- **Knowledge Core**: 统一知识服务，支持权限过滤（public/private）
- **Tool Layer**: 工具注册中心，支持公开/私人工具分类和权限校验
- **RAG Engine**: BM25 + 向量双模式检索，自动回退
- **LLM Router**: 多模型自动降级（智谱 → DeepSeek → 通义千问）
- **Memory Service**: 会话记忆和长期记忆管理
- **AI Gateway**: 统一流程编排（Persona → Knowledge → Tool → LLM）

### 数据流

```
用户输入
  ↓
AI Gateway（判断入口类型）
  ↓
Persona Layer（加载 System Prompt + 权限）
  ↓
Knowledge Core（权限过滤 → 知识检索）
  ↓
Tool Layer（权限过滤 → 工具注册）
  ↓
Prompt 组装
  ↓
LLM Router（多模型降级 → 流式输出）
  ↓
Function Calling 循环（最多4轮）
  ↓
返回结果
```

## 迁移状态

- [x] AI Core 基础框架
- [x] Persona Layer（Meet Siyi + Personal AI）
- [x] Knowledge Core（统一知识服务 + 权限过滤）
- [x] Tool Layer（注册中心 + 公开/私人工具）
- [x] RAG Engine（BM25 + 向量检索）
- [x] LLM Router（多模型降级）
- [x] Memory Service（记忆服务）
- [x] AI Gateway（流程编排）
- [x] 客户端入口骨架
- [~] ~~从 D:\个人网站 迁移 Meet Siyi 前端~~（已搁置：网站保持独立部署，clients/meet-siyi 仅作同步镜像）
- [ ] 从 G:\SIYI-Hermess\Siyi-OS\clients\personal-ai 迁移 Personal AI 前端
- [ ] 填充公开知识文档
- [ ] 接入私人工具（Obsidian/Prompt/复盘/待办）
- [ ] 端到端测试

## 快速开始

```bash
# 本机自用（需要智谱 API Key；无 Obsidian/复盘/提示词目录时优雅降级）
cd clients/personal-ai
npm install
copy .env.example .env        # Windows；Mac/Linux 用 cp，然后填 ZHIPU_API_KEY
npm start                     # http://localhost:8788
```

对外演示请用上方的 **Demo Mode**（零依赖、无需 Key）。生产数据（`.env`、`backend/data/`、Obsidian、绝对路径）已被 `.gitignore` 排除，不会进入仓库。

## RAG 检索质量评测

仓库自带一套检索评测脚本（12 组真实问法 + 预期命中文档），零依赖即可运行：

```bash
node scripts/eval-rag.js                    # BM25 模式（默认，无需 API Key）
node scripts/eval-rag.js --mode embedding   # 向量模式（需 SILICONFLOW_API_KEY）
node scripts/eval-rag.js --topk 5           # 调整 topK
```

输出 hit@1 / recall@k / MRR 三项指标。当前 BM25 基线：**hit@1 41.7%，recall@3 61.1%，MRR 0.569**。
这套评测集本身也是开发工具——frontmatter 的 CRLF 解析 bug 就是它抓出来的。

## 隐私设计

- **知识双层**：`ai-core/knowledge/public/`（可对外）与 `private/`（仅本地工作台），由 Knowledge Service 统一做权限过滤
- **运行时数据不入库**：`data/`（事件/记忆/知识候选）整个目录不进 git，永远是本机私有
- **演示数据隔离**：`examples/demo-data/` 提供虚构人物的演示数据，seed 脚本检测到真实数据时会拒绝覆盖

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `ZHIPU_API_KEY` | 智谱 AI API Key（主模型） | ✅ |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（备用） | 可选 |
| `QWEN_API_KEY` | 通义千问 API Key（备用） | 可选 |
| `SILICONFLOW_API_KEY` | 硅基流动 API Key（向量检索） | 启用向量时必填 |
| `RAG_USE_EMBEDDING` | 是否启用向量检索（true/false） | 可选 |

## License

MIT
