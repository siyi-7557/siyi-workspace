# Personal AI Workspace — v2 设计规范与测试文档

> 基于《Personal AI Workspace — Product & UI Direction v2》落地执行
> 生成日期：2026-08-29

---

## 一、设计令牌（Design Tokens）

### 1.1 色彩系统

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--bg-base` | `#F7F6FB` | 页面背景（浅紫灰） |
| `--bg-surface` | `#FFFFFF` | 卡片/面板背景 |
| `--bg-muted` | `#F3F2F7` | 次级背景（输入框、消息区） |
| `--bg-hover` | `#EDEBF5` | hover 状态背景 |
| `--bg-disabled` | `#E5E3EC` | 禁用状态背景 |
| `--accent` | `#7A5ECD` | 主强调色（紫罗兰） |
| `--accent-hover` | `#6A4EBD` | 强调色 hover |
| `--accent-tint` | `#EFEAFB` | 强调色浅底（active tab、badge） |
| `--accent-ring` | `rgba(122,94,205,0.15)` | focus 光环 |
| `--text-primary` | `#1A1A2E` | 主文字 |
| `--text-secondary` | `#4A4A5A` | 次级文字 |
| `--text-muted` | `#8B8B9A` | 辅助文字 |
| `--text-disabled` | `#B0B0BC` | 禁用文字 |
| `--text-inverse` | `#FFFFFF` | 反色文字（深色背景上） |
| `--border-default` | `#E2E0EA` | 默认边框 |
| `--border-strong` | `#C8C6D2` | 强边框（hover） |
| `--border-divider` | `#ECEAF2` | 分隔线 |
| `--success` | `#10B981` | 成功 |
| `--warning` | `#F59E0B` | 警告 |
| `--danger` | `#EF4444` | 危险 |
| `--info` | `#3B82F6` | 信息 |

### 1.2 排版系统

| 级别 | 字号 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| `--text-xs` | 11px | 400 | 1.4 | 辅助信息、badge |
| `--text-sm` | 12px | 400 | 1.5 | 正文、描述 |
| `--text-base` | 14px | 400 | 1.6 | 正文、按钮 |
| `--text-md` | 15px | 500 | 1.5 | 卡片标题 |
| `--text-lg` | 17px | 600 | 1.4 | 页面标题 |
| `--text-xl` | 20px | 600 | 1.3 | 大标题 |
| `--text-2xl` | 24px | 700 | 1.25 | 统计数字 |
| `--text-3xl` | 30px | 700 | 1.2 | 英雄区数字 |

字重：`--weight-regular: 400` / `--weight-medium: 500` / `--weight-semibold: 600` / `--weight-bold: 700`

### 1.3 间距系统（4px 基础）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--space-1` | 4px | 最小间距 |
| `--space-2` | 8px | 紧凑间距 |
| `--space-3` | 12px | 标准间距 |
| `--space-4` | 16px | 卡片内边距 |
| `--space-5` | 20px | 区块间距 |
| `--space-6` | 24px | 大区块间距 |
| `--space-8` | 32px | 页面边距 |

### 1.4 圆角系统

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--radius-sm` | 6px | 按钮、输入框、badge |
| `--radius-md` | 8px | 卡片、面板 |
| `--radius-lg` | 12px | 大卡片、对话框、AI 面板 |
| `--radius-pill` | 999px | 胶囊形 |

### 1.5 阴影系统（克制使用）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` | 卡片 hover |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | FAB、下拉菜单 |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.10)` | 悬浮面板 |
| `--shadow-xl` | `0 16px 48px rgba(0,0,0,0.12)` | 模态框、AI 面板 |

### 1.6 动效系统

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--transition-fast` | `120ms ease-out` | 微交互（hover、active） |
| `--transition-base` | `200ms ease-out` | 标准过渡（面板、抽屉） |
| `--transition-slow` | `300ms ease-out` | 大动画（页面切换） |
| `--ease-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 标准缓动 |

---

## 二、组件使用指南

### 2.1 按钮（Button）

```html
<!-- 主按钮 -->
<button class="btn btn-primary">主要操作</button>

<!-- 次要按钮 -->
<button class="btn btn-secondary">次要操作</button>

<!-- 幽灵按钮 -->
<button class="btn btn-ghost">文字按钮</button>

<!-- 危险按钮 -->
<button class="btn btn-danger">删除</button>

<!-- 尺寸 -->
<button class="btn btn-primary btn-sm">小按钮</button>
<button class="btn btn-primary btn-lg">大按钮</button>

<!-- 禁用 -->
<button class="btn btn-primary" disabled>禁用</button>
```

### 2.2 表单（Form）

```html
<!-- 输入框 -->
<div class="form-row">
  <label class="form-label">API Key</label>
  <input type="text" class="form-input" placeholder="输入 API Key">
  <span class="form-help">用于调用 AI 服务</span>
</div>

<!-- 文本域 -->
<textarea class="form-textarea" rows="4"></textarea>

<!-- 下拉选择 -->
<select class="form-select">
  <option>选项一</option>
</select>

<!-- 开关 -->
<label class="form-switch">
  <input type="checkbox" checked>
  <span>启用自动同步</span>
</label>
```

### 2.3 卡片（Card）

```html
<!-- 基础卡片 -->
<div class="card">
  <div class="card-header">
    <h3>卡片标题</h3>
  </div>
  <div class="card-body">卡片内容</div>
</div>

<!-- 统计卡片 -->
<div class="stat-card">
  <div class="stat-label">知识笔记</div>
  <div class="stat-value">17</div>
  <div class="stat-trend">+3 本周</div>
</div>

<!-- 统计网格 -->
<div class="stat-grid">
  <div class="stat-card">...</div>
  <div class="stat-card">...</div>
</div>
```

### 2.4 Badge / Tag

```html
<span class="badge badge-primary">主要</span>
<span class="badge badge-success">成功</span>
<span class="badge badge-warning">警告</span>
<span class="badge badge-danger">危险</span>
<span class="badge badge-info">信息</span>
<span class="badge badge-muted">默认</span>
```

### 2.5 空状态（Empty State）

```html
<div class="empty-state">
  <div class="empty-icon">📚</div>
  <h3>暂无数据</h3>
  <p>还没有内容，点击下方按钮开始添加</p>
  <button class="btn btn-primary">添加</button>
</div>
```

---

## 三、页面结构规范

### 3.1 App Shell

```
┌─────────────────────────────────────────────────┐
│  Header (56px)                                    │
│  [页面标题+描述]          [搜索] [AI] [设置]     │
├────────┬────────────────────────────────────────┤
│        │                                        │
│ Sidebar│  Content Area                          │
│ 208px  │  padding: 24px                        │
│        │                                        │
│ WORKSPACE │                                     │
│  总览    │                                     │
│  知识    │                                     │
│  复盘    │                                     │
│  提示词  │                                     │
│        │                                        │
│ SYSTEM  │                                        │
│  网站    │                                     │
│  设置    │                                     │
│        │                                        │
│ ──────  │                                        │
│ 索引状态 │                                        │
└────────┴────────────────────────────────────────┘
```

### 3.2 响应式断点

| 断点 | 侧边栏 | 内容区 | 卡片网格 |
|------|--------|--------|----------|
| > 1024px | 208px 完整 | 24px padding | 多列 |
| 768-1024px | 64px 图标 | 20px padding | 2-3 列 |
| < 768px | 抽屉式（可滑出） | 16px padding | 单列 |
| < 480px | 抽屉式 | 16px padding | 单列 |

---

## 四、测试清单

### 4.1 视觉一致性测试

- [ ] 页面背景色为 `#F7F6FB`
- [ ] 卡片背景为白色，边框 `#E2E0EA`
- [ ] 主强调色为 `#7A5ECD`
- [ ] 无玻璃模糊效果（`backdrop-filter: none`）
- [ ] 圆角不超过 12px
- [ ] 无过度阴影（默认无阴影，hover 时 `--shadow-sm`）
- [ ] 文字层级清晰（primary/secondary/muted）

### 4.2 组件测试

- [ ] 按钮四种变体（primary/secondary/ghost/danger）显示正确
- [ ] 按钮三种尺寸（sm/md/lg）显示正确
- [ ] 输入框 focus 时有紫色光环
- [ ] 卡片 hover 时有轻微上浮和阴影
- [ ] Badge 六种颜色显示正确
- [ ] 空状态显示正确

### 4.3 页面测试

- [ ] 刷新默认进入总览页
- [ ] 总览页统计数据正确（知识/标签/复盘/提示词）
- [ ] 知识页卡片网格布局正常
- [ ] 知识页卡片无重影（内部元素透明）
- [ ] 提示词页卡片无重影
- [ ] 复盘页视觉规范一致
- [ ] 设置页视觉规范一致
- [ ] Personal AI FAB 显示正确（48px 圆形紫色）
- [ ] Personal AI 面板打开/关闭正常

### 4.4 导航测试

- [ ] 侧边栏六项导航切换正常
- [ ] 导航项 active 状态为紫色背景
- [ ] 顶栏页面标题随导航切换
- [ ] 顶栏搜索框 focus 时跳转到知识页

### 4.5 响应式测试

- [ ] 1024px 以下侧边栏收缩为 64px 图标栏
- [ ] 768px 以下侧边栏变为抽屉式
- [ ] 768px 以下卡片网格变为单列
- [ ] 768px 以下 AI 面板自适应宽度
- [ ] 480px 以下统计卡片变为单列

### 4.6 无障碍测试

- [ ] 键盘 Tab 导航焦点可见（紫色外框）
- [ ] 按钮/链接可通过键盘操作
- [ ] 输入框有 associated label
- [ ] `prefers-reduced-motion` 时动效减弱
- [ ] 文字对比度符合 WCAG AA 标准

### 4.7 控制台错误测试

- [ ] 页面加载无 404 错误
- [ ] 页面加载无 JavaScript 错误
- [ ] 导航切换无错误
- [ ] AI 面板打开无错误

---

## 五、文件清单

### 5.1 修改的文件

| 文件 | 说明 |
|------|------|
| `public/index.html` | 新 App Shell 布局（Sidebar + Header + Content） |
| `public/core/main.css` | 设计令牌 + 组件库 + 全部页面覆盖样式 + 响应式 + 无障碍（93KB） |
| `public/core/app.js` | 导航绑定、总览模块注册、默认页面改为总览 |
| `public/modules/overview/module.js` | 新建总览页模块 |

### 5.2 同步目录

- 开发目录：`G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\`
- 运行目录：`G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\backend\`

### 5.3 访问地址

- 本地开发：`http://localhost:8788/`

---

## 六、已完成 Phase 总览

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 0 | 设计令牌落地 | ✅ |
| Phase 1 | App Shell 重构 | ✅ |
| Phase 2 | 基础组件库 | ✅ |
| Phase 3 | 总览页 | ✅ |
| Phase 4 | 知识页重构 | ✅ |
| Phase 5 | 复盘页视觉覆盖 | ✅ |
| Phase 6 | 提示词页视觉覆盖 | ✅ |
| Phase 7 | 设置页视觉覆盖 | ✅ |
| Phase 8 | Personal AI 面板视觉覆盖 | ✅ |
| Phase 9 | 响应式适配 + 无障碍 | ✅ |
| Phase 10 | 测试文档 + 组件使用指南 | ✅ |

---

*文档结束 — Personal AI Workspace v2 设计规范与测试文档*
