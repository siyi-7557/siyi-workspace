# Demo 数据说明

这是一套**虚构人物「林拾意」**的演示数据，用于让新 clone 的仓库开箱即可体验完整流程——不包含任何真实个人数据。

「林拾意，产品运营，正在折腾个人知识库的 RAG 检索质量」——所有事件、记忆都围绕这个人设生成。

## 内容

```
examples/demo-data/
├── events/events-demo.json    # 信息雷达事件（来源添加/收藏/已读/稍后读/偏好更新）
└── memory/*.json              # 长期记忆（用户偏好、关注方向、阅读洞察）
```

## 使用

```bash
node scripts/seed-demo.js            # 植入 demo 数据（data/ 非空时会拒绝执行）
node scripts/seed-demo.js --force    # 强制合并植入（不覆盖已有文件，只新增 demo 文件）
```

植入后 `data/events/` 与 `data/memory/` 即有内容，工作台的信息雷达、记忆检索、洞察中心即可演示完整闭环。

## 隐私设计

- `data/` 整个目录不入库（见 `.gitignore`），运行时数据永远只在本机
- 知识库分 `ai-core/knowledge/public/`（可对外）与 `private/`（仅本地工作台可访问）两层
- demo 数据仅用于演示，随时可删除对应的 `events-demo.json` 与 `memory/*.json`
