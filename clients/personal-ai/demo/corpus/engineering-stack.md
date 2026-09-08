---
tags: [engineering, 技术栈, 架构, backend]
---
# 技术栈与架构

## 运行环境
- 后端使用 Node.js（JavaScript），服务端渲染与 API。
- 前端使用原生 HTML/CSS/JS 或轻量框架，通过 Electron 打包为桌面应用。
- 数据库使用 SQLite（better-sqlite3），本地文件存储，适合私有化部署。

## 关键组件
- **RAG 检索**：BM25 关键词检索 + Embedding 向量检索，hybrid 加权融合（0.4/0.6）。
- **Embedding 模型**：BAAI/bge-m3（通过硅基流动 API），无 key 时回退字符级向量。
- **LLM 路由**：多个模型自动降级（智谱 GLM-4-Flash → DeepSeek → 通义千问）。
- **Markdown 解析**：front-matter + 按标题分块。

## 数据流
用户的 Obsidian 笔记库 → 增量扫描 → 分块 → 向量化 → 写入本地索引（rag-index.json）→ 检索时混合召回。
