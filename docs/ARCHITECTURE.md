# Siyi OS 架构文档

## 1. 设计目标

将两个独立的 AI 应用（Meet Siyi 网站 AI 和 Personal AI 工作台）整合为同一个 AI Core 下的两个入口，实现：

- **共享核心**：人格、知识、工具、RAG、LLM、记忆全部共享
- **权限隔离**：Meet Siyi 仅访问公开层，Personal AI 访问全部
- **渐进迁移**：不推倒重写，现有功能逐步迁移到新架构
- **可扩展**：未来可新增更多 AI 入口（如微信机器人、API 服务等）

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      客户端层                              │
│  ┌──────────────┐              ┌──────────────────┐     │
│  │  Meet Siyi   │              │   Personal AI    │     │
│  │  (公网网站)   │              │  (本地工作台)     │     │
│  │  公开人格层    │              │   私人助手层      │     │
│  └──────┬───────┘              └────────┬─────────┘     │
│         │                                │                │
│         └────────────────┬───────────────┘                │
│                          │                                 │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     AI Gateway                            │
│         (流程编排：Persona → Knowledge → Tool → LLM)    │
└──────────────────────────┬─────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Persona Layer │  │ Knowledge Core│  │  Tool Layer   │
│ (人格配置)     │  │ (知识服务)     │  │ (工具注册)     │
│ meet-siyi     │  │ public/       │  │ public/       │
│ personal-ai   │  │ private/      │  │ private/      │
└───────────────┘  └───────┬───────┘  └───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  RAG Engine   │
                    │ (BM25+向量)   │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  LLM Router   │
                    │ (多模型降级)   │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Memory Service│
                    │ (会话+长期记忆)│
                    └───────────────┘
```

## 3. 核心模块详解

### 3.1 AI Gateway (`ai-core/gateway/`)

统一的消息处理入口，负责：

1. 根据入口类型加载对应 Persona 配置
2. 调用 Knowledge Core 进行 RAG 检索（权限过滤）
3. 组装 Prompt（System + RAG上下文 + 对话历史）
4. 调用 LLM Router（多模型降级）
5. 处理 Function Calling 循环（最多4轮）
6. 返回流式或非流式响应

### 3.2 Persona Layer (`ai-core/persona/`)

管理不同入口的人格配置，每个 Persona 包含：

- `name`: 人格名称
- `type`: 'public' | 'private'
- `systemPrompt`: System Prompt 文本
- `visibility`: 知识访问权限（'public' | 'all'）
- `allowedTools`: 工具访问权限（'public' | 'all' | 工具名数组）
- `suggestedQuestions`: 推荐问题
- `welcomeMessage`: 欢迎语

### 3.3 Knowledge Core (`ai-core/knowledge/`)

统一的知识服务，核心特性：

- **权限过滤**：根据 `visibility` 参数自动过滤 public/private 知识
- **双模式检索**：BM25（默认，零成本）+ 向量（可选，BGE-M3）
- **自动回退**：向量检索失败自动回退到 BM25
- **统一 API**：`searchKnowledge()`, `getDocument()`, `getProject()`, `getMemory()`

知识目录结构：
```
knowledge/
├── public/          # 公开知识（Meet Siyi + Personal AI 均可访问）
│   ├── identity.md
│   ├── about.md
│   ├── projects.md
│   ├── growth_story.md
│   ├── current_focus.md
│   └── working_style.md
└── private/         # 私人知识（仅 Personal AI 可访问）
    ├── reflection.md
    ├── private_memory.md
    ├── diary.md
    └── unfinished_ideas.md
```

每篇文档支持 front matter metadata：
```yaml
---
id: growth-story-why-ai
title: 为什么学习AI
visibility: public
tags: [成长故事, AI学习]
updatedAt: 2026-08-28
---
```

### 3.4 Tool Layer (`ai-core/tools/`)

工具注册中心，支持：

- **分类管理**：public（公开工具）、private（私人工具）、frontend（前端操作）
- **权限校验**：Meet Siyi 调用 private 工具时自动拒绝
- **统一执行**：所有工具通过 `registry.execute(name, args, context)` 执行
- **OpenAI 兼容**：工具定义自动转换为 OpenAI Function Calling 格式

公开工具（6个）：
- `get_profile`: 个人基本信息
- `get_projects`: 项目列表和详情
- `get_growth_story`: 成长故事
- `get_current_focus`: 当前状态
- `search_public_knowledge`: 公开知识检索
- `get_contact_card`: 联系方式

私人工具（14个，初始为占位实现）：
- `knowledge.search/get/save`: Obsidian 笔记管理
- `prompt.search/get/save`: Prompt 库管理
- `review.search/get`: 复盘记录
- `action.list/create/complete`: 行动项管理
- `memory.search/save`: 长期记忆

### 3.5 RAG Engine (`ai-core/rag/`)

从原 `ai-rag.js` 迁移而来，拆分为三个模块：

- `retriever.js`: 检索器（BM25 + 向量双模式）
- `indexer.js`: 索引构建器（从 Markdown 目录构建文档索引）
- `embedding.js`: 向量嵌入服务（硅基流动 BGE-M3）

### 3.6 LLM Router (`ai-core/llm/`)

统一的 LLM 调用服务，支持：

- **多模型自动降级**：智谱 GLM-4-Flash → DeepSeek → 通义千问
- **429/5xx 自动切换**：遇到限流或服务器错误自动尝试下一个模型
- **4xx 不降级**：客户端错误直接报错（除429外）
- **流式/非流式**：支持 SSE 流式和完整 JSON 两种响应
- **统一 API**：`chat(messages, options)`

### 3.7 Memory Service (`ai-core/memory/`)

统一的记忆管理，支持：

- **会话记忆**：当前对话上下文（内存存储）
- **长期记忆**：跨会话保存的重要信息（文件存储）
- **用户级记忆**：用户偏好、习惯等（预留）

Meet Siyi：无持久化记忆（会话记忆在前端 localStorage）
Personal AI：完整记忆系统

## 4. 权限机制

### 4.1 知识权限

每篇知识文档有 `visibility` 字段：
- `public`: Meet Siyi 和 Personal AI 均可访问
- `private`: 仅 Personal AI 可访问

Knowledge Core 的 `searchKnowledge(query, { visibility })` 方法：
- Meet Siyi 调用时 `visibility='public'`，自动过滤 private 文档
- Personal AI 调用时 `visibility='all'`，可访问全部文档

### 4.2 工具权限

每个工具有 `category` 字段：
- `public`: 两个入口均可调用
- `private`: 仅 Personal AI 可调用

Tool Registry 的 `execute(name, args, { personaType })` 方法：
- `personaType='meet-siyi'` 时，调用 private 工具自动拒绝
- `personaType='personal-ai'` 时，可调用全部工具

### 4.3 人格配置权限

每个 Persona 配置指定：
- `visibility`: 知识访问权限（'public' | 'all'）
- `allowedTools`: 工具访问权限（'public' | 'all' | 工具名数组）

AI Gateway 根据 Persona 配置自动设置知识和工具的权限过滤。

## 5. 数据流对比

### Meet Siyi 数据流

```
访客提问
  ↓
Meet Siyi 后端入口
  ↓
AI Gateway (personaType='meet-siyi')
  ↓
Persona Layer: 加载 meet-siyi 配置
  - System Prompt: 公开数字伙伴
  - visibility: 'public'
  - allowedTools: 'public'
  ↓
Knowledge Core: searchKnowledge(query, { visibility: 'public' })
  - 自动过滤 private 知识
  - BM25/向量检索
  ↓
Tool Layer: getToolDefinitions('public')
  - 仅返回公开工具
  ↓
Prompt 组装
  ↓
LLM Router: 多模型降级
  ↓
Function Calling 循环（仅 public 工具）
  ↓
SSE 流式返回
```

### Personal AI 数据流

```
思意提问
  ↓
Personal AI 后端入口（本地 Electron）
  ↓
AI Gateway (personaType='personal-ai')
  ↓
Persona Layer: 加载 personal-ai 配置
  - System Prompt: 私人工作伙伴
  - visibility: 'all'
  - allowedTools: 'all'
  ↓
Knowledge Core: searchKnowledge(query, { visibility: 'all' })
  - 可访问 public + private 知识
  - BM25/向量检索
  ↓
Tool Layer: getToolDefinitions('all')
  - 返回全部工具（public + private）
  ↓
Prompt 组装
  ↓
LLM Router: 多模型降级
  ↓
Function Calling 循环（全部工具）
  - knowledge.search: 搜索 Obsidian 笔记
  - prompt.search: 搜索 Prompt 库
  - review.search: 搜索复盘记录
  - action.list: 列出待办
  - memory.search: 搜索长期记忆
  ↓
Memory Service: 保存会话记忆
  ↓
SSE 流式返回
```

## 6. 迁移计划

### 阶段1：AI Core 基础框架 ✅
- [x] 目录结构
- [x] AI Core 入口
- [x] Persona Layer
- [x] Knowledge Core
- [x] Tool Layer
- [x] RAG Engine
- [x] LLM Router
- [x] Memory Service
- [x] AI Gateway

### 阶段2：Meet Siyi 迁移（已搁置 2026-08-31）

> 决策：Meet Siyi 生产入口保持为 D:\个人网站（独立部署），不做整体迁移。
> clients/meet-siyi/ 保留为同步镜像，通过 sync-knowledge.js 定期同步知识文档和 RAG 模块。
> 公开知识已统一在 ai-core/knowledge/public/，作为单一数据源向网站同步。
- [~] ~~从 D:\个人网站 迁移前端到 clients/meet-siyi/frontend/~~（搁置：网站保持独立部署）
- [~] ~~迁移后端到 clients/meet-siyi/backend/~~（搁置：生产用 Cloudflare/CloudBase）
- [x] 迁移公开知识到 ai-core/knowledge/public/（已完成，17 篇）
- [x] 端到端测试（洞察中心 e2e + 知识同步脚本验证）

### 阶段3：Personal AI 迁移
- [ ] 从 <repo>/clients/personal-ai 迁移前端到 clients/personal-ai/frontend/
- [ ] 迁移 Electron 主进程到 clients/personal-ai/electron/
- [ ] 迁移后端到 clients/personal-ai/backend/
- [ ] 接入私人工具（Obsidian/Prompt/复盘/待办）
- [ ] 端到端测试

### 阶段4：优化和扩展
- [ ] 向量索引优化
- [ ] 记忆系统完善
- [ ] 性能优化
- [ ] 新增 AI 入口（API 服务、微信机器人等）

## 7. 兼容性保证

- **现有 API 不变**：`POST /api/chat` 接口和响应格式完全兼容
- **现有前端不变**：chat.js 不需要修改，继续使用 SSE 流式
- **现有工具兼容**：旧工具名保留为别名
- **渐进式重构**：每个阶段独立可部署，不破坏现有功能
- **ai-persona.js / ai-rag.js 保留**：作为兼容层，现有 require 不需要改
- **sync-knowledge.js**：Siyi OS 公开知识 → 网站知识目录的单向同步脚本，剥离 YAML front matter
