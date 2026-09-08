# Siyi OS 设计令牌审计与规范

**审计路径**: `G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\backend\public`
**审计日期**: 2026-08-29
**审计范围**: Information Radar, Knowledge, AI Reflection 及共享全局组件

---

## 重要前置说明

### 模块实际状态

| 模块 | 目录 | 状态 | CSS文件 | JS文件 |
|------|------|------|---------|--------|
| Information Radar | `modules/radar/` | **不存在** | — | — |
| Knowledge | `modules/search/` | 已实现 | style.css (13KB, 567行) | module.js (15.1KB) |
| AI Reflection | `modules/obsidian-reviews/` | 已实现 | style.css (133.4KB, 6107行) | module.js (162.6KB) |

**Information Radar 在 index.html 导航中标记为 `nav-item-disabled`，title="信息雷达（开发中）"，无对应 CSS/JS 文件。** 本审计基于实际存在的 Knowledge 和 AI Reflection 两个模块，以及共享全局样式。

### 与 G:\SIYI-Hermess\Siyi-OS\clients\personal-ai 的关系

两个路径是**不同副本**（main.css MD5 不同）。`G:\SIYI-Hermess\Siyi-OS\clients\personal-ai` 下包含已开发的 Information Radar 模块及方案B色阶调整；`G:\SIYI-Hermess\Siyi-OS\clients\personal-ai` 下为旧版本，信息雷达尚未集成。本审计基于 `G:\SIYI-Hermess\Siyi-OS` 路径的实际代码。

---

## A. 当前设计令牌清单 (Current Design Token Inventory)

### A.1 已在 main.css :root 中实现的令牌

#### 颜色系统 (Color)

| 令牌名 | 当前值 | 用途 | 状态 |
|--------|--------|------|------|
| `--canvas` | `#F1F0FA` | App 背景 | ✅ 已实现 |
| `--surface-1` | `#F5F3FC` | 卡片/主工作区 | ✅ 已实现 |
| `--surface-2` | `#EDEAF6` | 输入框/暗面 | ✅ 已实现 |
| `--surface-3` | `#E4E0EE` | 按下/禁用 | ✅ 已实现 |
| `--highlight` | `rgba(255,255,255,0.85)` | 顶部柔白高光 | ✅ 已实现 |
| `--shadow-soft` | `rgba(80,65,130,0.06)` | 右下紫灰环境阴影 | ✅ 已实现 |
| `--text-primary` | `#292536` | 标题/重要文字 | ✅ 已实现 |
| `--text-secondary` | `#817C90` | 正文文字 | ✅ 已实现 |
| `--text-muted` | `#A09CAD` | 辅助/metadata | ✅ 已实现 |
| `--text-disabled` | `#C4C0D0` | 禁用/占位 | ✅ 已实现 |
| `--text-inverse` | `#FFFFFF` | 反色文字 | ✅ 已实现 |
| `--accent` | `#7A5ECD` | 主强调色 | ✅ 已实现 |
| `--accent-hover` | `#8B6FE0` | 悬停强调色 | ✅ 已实现 |
| `--accent-pressed` | `#6A4EC0` | 按下强调色 | ✅ 已实现 |
| `--accent-tint` | `rgba(122,94,205,0.10)` | 强调色淡背景 | ✅ 已实现 |
| `--accent-ring` | `rgba(122,94,205,0.25)` | 强调色焦点环 | ✅ 已实现 |
| `--sem-green` | `#6B9A7A` | 语义绿 | ✅ 已实现 |
| `--sem-orange` | `#B8906A` | 语义橙 | ✅ 已实现 |
| `--sem-red` | `#B07078` | 语义红 | ✅ 已实现 |
| `--sem-teal` | `#6A9A9A` | 语义青 | ✅ 已实现 |
| `--green-bg` | `rgba(107,154,122,0.10)` | 绿色淡背景 | ✅ 已实现 |
| `--orange-bg` | `rgba(184,144,106,0.10)` | 橙色淡背景 | ✅ 已实现 |
| `--red-bg` | `rgba(176,112,120,0.10)` | 红色淡背景 | ✅ 已实现 |
| `--teal-bg` | `rgba(106,154,154,0.10)` | 青色淡背景 | ✅ 已实现 |

#### 背景层级 (Background)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--bg-app` | `var(--canvas)` | ✅ |
| `--bg-surface` | `var(--surface-1)` | ✅ |
| `--bg-subtle` | `var(--surface-2)` | ✅ |
| `--bg-muted` | `var(--surface-3)` | ✅ |
| `--bg-hover` | `rgba(122,94,205,0.05)` | ⚠️ 硬编码值 |

#### 边框 (Border)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--border-subtle` | `rgba(255,255,255,0.45)` | ✅ |
| `--border-default` | `rgba(255,255,255,0.60)` | ✅ |
| `--border-strong` | `rgba(255,255,255,0.75)` | ✅ |
| `--separator` | `rgba(99,94,114,0.08)` | ✅ |

#### 玻璃拟态 (Glassmorphism)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--glass-bg` | `rgba(255,255,255,0.48)` | ✅ |
| `--glass-bg-strong` | `rgba(255,255,255,0.60)` | ✅ |
| `--glass-border` | `rgba(255,255,255,0.55)` | ✅ |
| `--glass-blur` | `blur(20px) saturate(150%)` | ✅ |
| `--glass-shadow` | `0 4px 20px rgba(80,70,130,0.04)` | ✅ |

#### 阴影 (Shadow)

| 令牌名 | 当前值 | 类型 | 状态 |
|--------|--------|------|------|
| `--nm-xs` | `2px 2px 5px var(--shadow-soft), -2px -2px 5px var(--highlight)` | 新拟态 | ✅ |
| `--nm-sm` | `3px 3px 7px ...` | 新拟态 | ✅ |
| `--nm-md` | `5px 5px 12px ...` | 新拟态 | ✅ |
| `--nm-lg` | `7px 7px 16px ...` | 新拟态 | ✅ |
| `--nm-inset-xs` | `inset 1px 1px 3px ...` | 内凹新拟态 | ✅ |
| `--nm-inset-sm` | `inset 2px 2px 5px ...` | 内凹新拟态 | ✅ |
| `--nm-inset-md` | `inset 3px 3px 7px ...` | 内凹新拟态 | ✅ |
| `--float-xs` | `0 2px 8px rgba(80,65,130,0.04)` | 浮动 | ✅ |
| `--float-sm` | `0 4px 14px rgba(80,65,130,0.05)` | 浮动 | ✅ |
| `--float-md` | `0 8px 28px rgba(80,65,130,0.07)` | 浮动 | ✅ |
| `--float-lg` | `0 16px 48px rgba(80,65,130,0.09)` | 浮动 | ✅ |
| `--float-hover` | `0 8px 24px rgba(80,65,130,0.08)` | 浮动悬停 | ✅ |

#### 字体 (Typography)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` | ✅ |
| `--font-mono` | `"SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace` | ✅ |
| `--text-xs` | `11px` | ✅ |
| `--text-sm` | `12px` | ✅ |
| `--text-base` | `13px` | ✅ |
| `--text-md` | `14px` | ✅ |
| `--text-lg` | `15px` | ✅ |
| `--text-xl` | `17px` | ✅ |
| `--text-2xl` | `19px` | ✅ |
| `--text-3xl` | `22px` | ✅ |
| `--text-4xl` | `26px` | ✅ |
| `--text-display` | `30px` | ✅ |
| `--leading-none` | `1` | ✅ |
| `--leading-tight` | `1.3` | ✅ |
| `--leading-snug` | `1.45` | ✅ |
| `--leading-normal` | `1.6` | ✅ |
| `--weight-light` | `300` | ✅ |
| `--weight-normal` | `400` | ✅ |
| `--weight-medium` | `500` | ✅ |
| `--weight-semibold` | `600` | ✅ |
| `--weight-bold` | `700` | ✅ |

#### 尺寸与间距 (Sizing & Spacing)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--sidebar-width` | `232px` | ✅ |
| `--topbar-height` | `52px` | ✅ |
| `--content-max` | `1080px` | ✅ |
| `--space-px` | `1px` | ✅ |
| `--space-05` | `2px` | ✅ |
| `--space-1` | `4px` | ✅ |
| `--space-15` | `6px` | ✅ |
| `--space-2` | `8px` | ✅ |
| `--space-25` | `10px` | ✅ |
| `--space-3` | `12px` | ✅ |
| `--space-35` | `14px` | ✅ |
| `--space-4` | `16px` | ✅ |
| `--space-45` | `18px` | ✅ |
| `--space-5` | `20px` | ✅ |
| `--space-6` | `24px` | ✅ |
| `--space-8` | `32px` | ✅ |
| `--space-10` | `40px` | ✅ |

#### 圆角 (Border Radius)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--radius-xs` | `8px` | ✅ |
| `--radius-sm` | `10px` | ✅ |
| `--radius-md` | `12px` | ✅ |
| `--radius-lg` | `14px` | ✅ |
| `--radius-xl` | `18px` | ✅ |
| `--radius-2xl` | `26px` | ✅ |
| `--radius-3xl` | `30px` | ✅ |
| `--radius-pill` | `980px` | ✅ |

#### 动效 (Motion)

| 令牌名 | 当前值 | 状态 |
|--------|--------|------|
| `--transition-fast` | `180ms cubic-bezier(0.25,0.1,0.25,1)` | ✅ |
| `--transition-base` | `240ms cubic-bezier(0.25,0.1,0.25,1)` | ✅ |
| `--transition-slow` | `300ms cubic-bezier(0.25,0.1,0.25,1)` | ✅ |
| `--ease-out` | `cubic-bezier(0.25,0.1,0.25,1)` | ✅ |

#### 兼容别名 (Compatibility Aliases)

main.css 中存在大量历史兼容别名，包括：
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
- `--apple-blue`, `--apple-blue-hover`, `--apple-bg`, `--apple-surface`, `--apple-border`, `--apple-text` 等 12个 apple-* 别名
- `--nm-bg`, `--nm-surface`, `--nm-light`, `--nm-dark` 等 6个 nm-* 别名
- `--shadow-card`, `--shadow-xs/sm/md/lg/hover` 等 6个 shadow-* 别名
- `--system-green/orange/red/teal/purple/gray` 等 6个 system-* 别名
- `--radius`, `--transition`, `--purple-bg`, `--font-serif`, `--weight-bold`(重定义为 semibold)
- `--bg-workspace`, `--bg-surface`(重复), `--bg-subtle`(重复), `--bg-muted`(重复), `--bg-hover`(硬编码), `--accent-soft`(硬编码错误紫色), `--accent-glow`, `--text-faint`, `--warning`, `--success`, `--danger`, `--info`

**深色模式** (`[data-theme="dark"]`) 完整覆盖了 canvas, surface-1/2/3, highlight, shadow-soft, text-primary/secondary/muted, accent/hover/pressed/tint/ring, glass-bg/strong/border/shadow, border-subtle/default/strong, separator, float-xs/sm/md/lg。

---

### A.2 模块中实际使用但未令牌化的值

#### Knowledge 模块 (modules/search/style.css)

**硬编码颜色 (34种唯一值)**:
- 紫色变体: `rgba(122,94,205,0.04/0.06/0.08/0.10/0.12)` (5种浓度)
- 白色半透明: `rgba(255,255,255,0.4/0.5/0.6/0.7/0.72/0.8/0.88/0.9/0.92/0.94/0.95)` (11种浓度)
- 紫灰阴影: `rgba(80,65,130,0.035)`, `rgba(90,75,140,0.08)`, `rgba(75,60,120,0.04/0.045/0.07/0.15)`, `rgba(70,60,100,0.05)`, `rgba(70,50,110,0.05)`, `rgba(60,50,100,0.03)` (7种不同紫灰色)
- 按钮紫影: `rgba(103,76,180,0.18/0.20/0.24)` (3种)
- 其他: `#fff`, `rgba(41,37,54,0.35)` (模态遮罩)

**硬编码字号**: `11.5px`, `15.5px`, `16px`, `18px`, `20px`, `36px` (6种不在令牌中)

**硬编码圆角**: `3px`, `5px`, `6px`, `7px`, `9px`, `16px`, `20px`, `3px 0 0 3px` (8种不在令牌中)

**硬编码间距**: padding 使用 `3px 9px`, `5px 12px`, `9px 20px`, `48px 20px` 等非网格值；gap 大量使用令牌但也有 `0`

**过渡**: `0ms` (1处，禁用过渡)

**阴影**: 10种不同的硬编码 box-shadow 模式，均未使用 float-* 或 nm-* 令牌

#### AI Reflection 模块 (modules/obsidian-reviews/style.css)

**硬编码颜色 (98种唯一值)**:
- 白色半透明: `rgba(255,255,255,0.35/0.5/0.55/0.6/0.62/0.65/0.68/0.72/0.78/0.8/0.82/0.85/0.86/0.9/0.92/0.94/0.95)` (17种浓度!)
- 紫色变体: `rgba(122,94,205,0.04/0.05/0.06/0.08/0.10/0.12/0.15/0.2)` (8种浓度)
- 紫灰边框/背景: `rgba(90,75,140,0.06/0.08/0.10/0.15)` (4种)
- 紫灰阴影: `rgba(75,60,120,0.025/0.03/0.035/0.04/0.045/0.05/0.06/0.07/0.08)`, `rgba(80,60,130,0.06)`, `rgba(80,65,130,0.03/0.04/0.06)` (14种!)
- 按钮紫影: `rgba(103,76,180,0.15)` (4处)
- 黑色阴影: `rgba(0,0,0,0.02/0.03/0.04/0.05/0.06/0.08/0.10/0.12/0.15)` (9种)
- 其他紫色: `rgba(139,92,246,0.12)`, `rgba(124,92,252,0.1/0.3)`, `rgba(79,70,229,0.05/0.3)`, `rgba(37,99,235,0.2)` (6种不同紫色!)
- 语义色: 绿色 `#22c55e`, `rgba(34,197,94,0.06/0.08/0.15)`, `rgba(22,163,74,0.08)`, `#065f46`, `#166534`; 红色 `#e74c3c`, `#c0392b`, `rgba(239,68,68,0.06/0.08/0.15)`, `rgba(220,38,38,0.08)`; 黄色 `#eab308`, `#ca8a04`, `rgba(234,179,8,0.08/0.1)`, `#fef9c3`, `#fef08a`, `#fde68a`; 蓝色 `#3b82f6`, `rgba(59,130,246,0.05/0.06/0.08)`, `#6b8dd4`, `rgba(107,141,212,0.08/0.1)`, `#0369a1`, `#1e40af`, `#e0f2fe`, `#f0f9ff`
- 其他: `#fff` (16处!), `#111827`, `#1f2937`, `#1e293b` (深色代码块), `#fafafa`, `#f5f3ff`, `#ddd6fe`, `#f3e8ff`, `#dcfce7`, `#f0fdf4`, `#bbf7d0`, `rgba(41,37,54,0.25/0.3)` (模态遮罩)

**硬编码字号**: `10px`, `11.5px`, `12.5px`, `16px` (17处!), `18px`, `20px` (8处), `24px`, `28px` (大量不在令牌中)

**硬编码圆角**: `2px`, `3px` (6处), `4px` (15处), `5px`, `6px` (23处!), `16px` (5处), `20px` (4处), `50%`, `3px 0 0 3px` (3处), `0 6px 6px 0`, `0 8px 8px 0` (大量非令牌圆角)

**硬编码间距**: padding 大量使用 `3px 10px`, `var(--space-05) 8px`, `5px 12px` 等混合值；gap 大量使用令牌但也有非标准值

**过渡**: `0ms` (24处! 大量禁用过渡)

**阴影**: 10+ 种硬编码 box-shadow，包括 `0 1px 3px rgba(103,76,180,0.15)` (4处), `0 1px 4px rgba(80,60,130,0.06)` (4处), `0 3px 12px rgba(75,60,120,0.04)` (3处), `0 2px 8px rgba(0,0,0,0.08)` (3处) 等

#### Personal AI 模块 (modules/personal-ai/style.css)

**硬编码颜色 (24种唯一值)**:
- 错误紫色 `#8D7CC7`: `rgba(141,124,199,0.06/0.08/0.1/0.15/0.18/0.2/0.4)` (7种浓度!)
- 另一种紫色 `#6C5CE7`: `rgba(108,92,231,0.4/0.5)` (2种)
- 黑色半透明: `rgba(0,0,0,0.02/0.04/0.05/0.06/0.08/0.12/0.15)` (7种)
- 白色半透明: `rgba(255,255,255,0.2/0.6/0.9/0.92)` (4种)
- 语义色: `rgba(255,193,7,0.15)`, `rgba(76,175,80,0.15)`, `rgba(244,67,54,0.15)`, `rgba(220,50,50,0.1)` (Material Design 颜色!)

**硬编码字号**: `8px`, `10px` (5处), `11px`, `12px`, `13px`, `14px`, `16px`, `36px` (大量不在令牌中)

**硬编码圆角**: `2px`, `3px`, `4px`, `6px`, `8px`, `10px`, `16px`, `50%` (6处)

#### Prompt 模块 (modules/prompt/style.css)

**硬编码颜色 (34种唯一值)**: 与 Knowledge 模块高度重叠，包括 11种白色半透明浓度、8种紫灰阴影、3种按钮紫影、3种紫色淡背景浓度等

#### Website 模块 (modules/website/style.css)

**硬编码颜色 (8种唯一值)**: 相对最干净，包括 `rgba(122,94,205,0.03/0.05/0.08)` (3种紫色淡背景)、5种白色半透明、1种蓝色 `rgba(74,127,216,0.1)`

#### 全局搜索 (core/global-search.css)

**硬编码颜色 (3种)**: `rgba(15,15,17,0.35)` (遮罩), `rgba(0,0,0,0.06/0.12)` (阴影)

**硬编码字号**: `10px`, `10.5px`, `11px`, `11.5px`, `12px`, `13.5px`, `14px`, `15px`, `17px`, `32px` (10种非令牌字号!)

---

## B. 提议的 Siyi OS 设计令牌规范 (Proposed Specification)

### B.1 基础令牌层 (Foundation Tokens)

#### 颜色原始值 (Raw Color Palette)

**紫色系 (Purple Scale)**
```
--color-purple-50:  #F5F3FC
--color-purple-100: #EDEAF6
--color-purple-200: #E4E0EE
--color-purple-300: #C4C0D0
--color-purple-400: #A09CAD
--color-purple-500: #817C90
--color-purple-600: #7A5ECD  (accent)
--color-purple-700: #6A4EC0  (pressed)
--color-purple-800: #292536  (text-primary)
--color-purple-900: #1E1C26  (dark surface-3)
```

**语义色原始值**
```
--color-green:   #6B9A7A
--color-orange:  #B8906A
--color-red:     #B07078
--color-teal:    #6A9A9A
--color-blue:    #6B8DD4  (新增，当前模块中大量使用但无令牌)
--color-yellow:  #D4A84B  (新增，当前模块中大量使用但无令牌)
```

**中性色**
```
--color-white:   #FFFFFF
--color-black:   #000000
```

#### 透明度标度 (Opacity Scale)
```
--opacity-0:    0
--opacity-5:    0.05
--opacity-10:   0.10
--opacity-15:   0.15
--opacity-20:   0.20
--opacity-25:   0.25
--opacity-30:   0.30
--opacity-35:   0.35
--opacity-40:   0.40
--opacity-45:   0.45
--opacity-50:   0.50
--opacity-60:   0.60
--opacity-70:   0.70
--opacity-75:   0.75
--opacity-80:   0.80
--opacity-85:   0.85
--opacity-90:   0.90
--opacity-95:   0.95
```

#### 字体 (Typography)

**字体族** — 保持现有 `--font-sans` 和 `--font-mono` 不变

**字号标度** — 在现有基础上补充模块中高频使用的值：
```
--text-2xs:   10px   (新增，模块中高频使用)
--text-xs:    11px   (现有)
--text-sm:    12px   (现有)
--text-base:  13px   (现有)
--text-md:    14px   (现有)
--text-lg:    15px   (现有)
--text-xl:    17px   (现有)
--text-2xl:   19px   (现有)
--text-3xl:   22px   (现有)
--text-4xl:   26px   (现有)
--text-5xl:   32px   (新增，global-search 中使用)
--text-display: 30px (现有)
```
*注：模块中使用的 10.5px, 11.5px, 12.5px, 13.5px, 15.5px 等半像素值应逐步迁移到最近的整像素令牌*

**行高** — 保持现有 4 级不变

**字重** — 保持现有 6 级不变

**字间距** — 当前未定义，建议新增：
```
--tracking-tight:  -0.01em
--tracking-normal:  0
--tracking-wide:    0.02em
```

#### 间距标度 (Spacing Scale)

保持现有 4px 网格间距体系不变（space-px 到 space-10，共17级）。模块中使用的非网格值（如 3px, 5px, 7px, 9px, 18px 等）应逐步迁移到最近的网格值。

#### 尺寸标度 (Sizing)

**布局尺寸** — 保持现有：
```
--sidebar-width:  232px
--topbar-height:  52px
--content-max:    1080px
```

**组件尺寸** — 当前未定义，建议新增（基于模块实际使用值）：
```
--size-input-height:   36px
--size-button-sm:      28px
--size-button-md:      36px
--size-button-lg:      44px
--size-icon-xs:        12px
--size-icon-sm:        14px
--size-icon-md:        16px
--size-icon-lg:        20px
--size-avatar-sm:      24px
--size-avatar-md:      32px
--size-avatar-lg:      48px
```

#### 圆角标度 (Border Radius)

保持现有 8 级令牌不变。模块中使用的 2px, 3px, 4px, 5px, 6px, 7px, 9px, 16px, 20px 等应逐步迁移到最近的令牌值（xs=8px 为最小，建议新增 `--radius-2xs: 4px` 和 `--radius-3xs: 2px` 以覆盖小元素需求）。

#### 边框宽度 (Border Width)

当前未定义，建议新增：
```
--border-width-thin:   1px
--border-width-medium: 1.5px
--border-width-thick:  2px
```

#### 阴影标度 (Shadow Scale)

**新拟态阴影** — 保持现有 nm-xs/sm/md/lg + nm-inset-xs/sm/md 不变

**浮动阴影** — 保持现有 float-xs/sm/md/lg/hover 不变

**内阴影/高光** — 当前未独立定义，建议新增：
```
--shadow-inset:    inset 0 1px 2px rgba(80,65,130,0.03)
--shadow-highlight: inset 0 1px 0 rgba(255,255,255,0.6)
--shadow-focus:    0 0 0 3px var(--accent-ring)
```

#### 模糊 (Blur)
```
--blur-sm:   blur(8px)
--blur-md:   blur(16px)
--blur-lg:   blur(20px) saturate(150%)  (现有 glass-blur)
```

#### 动效 (Motion)

**时长** — 保持现有 fast/base/slow 三级不变，补充：
```
--duration-instant:  0ms     (模块中大量 0ms 使用)
--duration-fast:     180ms   (现有)
--duration-base:     240ms   (现有)
--duration-slow:     300ms   (现有)
```

**缓动** — 保持现有 ease-out，补充：
```
--ease-in:     cubic-bezier(0.4, 0, 1, 1)
--ease-out:    cubic-bezier(0.25, 0.1, 0.25, 1)  (现有)
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

#### Z-Index 层级 (Z-Index Layers)

当前未定义，建议新增（基于 index.html 和模块实际使用）：
```
--z-base:        0
--z-dropdown:    100
--z-sticky:      200
--z-fixed:       300
--z-overlay:     400   (模态遮罩)
--z-modal:       500   (模态框/Drawer)
--z-popover:     600
--z-tooltip:     700
--z-toast:       800
--z-fab:         900   (Personal AI 悬浮按钮)
```

---

### B.2 语义令牌层 (Semantic Tokens)

#### 背景 (Background)

| 语义令牌 | 映射到基础令牌 | 用途 | 状态 |
|----------|---------------|------|------|
| `--bg-app` | `var(--canvas)` | 应用背景 | ✅ 现有 |
| `--bg-surface` | `var(--surface-1)` | 卡片/面板背景 | ✅ 现有 |
| `--bg-subtle` | `var(--surface-2)` | 输入框/内嵌区域 | ✅ 现有 |
| `--bg-muted` | `var(--surface-3)` | 禁用/按下状态 | ✅ 现有 |
| `--bg-hover` | `var(--accent-tint)` | 悬停背景 | 🔧 需修改（当前硬编码 rgba(122,94,205,0.05)） |
| `--bg-active` | `var(--accent-tint)` | 选中/激活背景 | 🆕 新增 |
| `--bg-disabled` | `var(--surface-3)` | 禁用元素背景 | 🆕 新增 |
| `--bg-overlay` | `rgba(42,39,51,0.35)` | 模态遮罩 | 🆕 新增（模块中高频使用） |
| `--bg-glass` | `var(--glass-bg)` | 玻璃面板背景 | ✅ 现有(glass-bg) |
| `--bg-glass-strong` | `var(--glass-bg-strong)` | 强玻璃面板背景 | ✅ 现有 |

#### 表面/卡片 (Surface/Card)

| 语义令牌 | 映射 | 用途 | 状态 |
|----------|------|------|------|
| `--surface-card` | `var(--surface-1)` | 普通卡片 | 🆕 新增（统一模块中17种白色半透明） |
| `--surface-card-hover` | `var(--surface-1)` + `var(--shadow-hover)` | 卡片悬停 | 🆕 新增 |
| `--surface-card-active` | `var(--surface-1)` + `var(--accent-ring)` | 卡片选中 | 🆕 新增 |
| `--surface-input` | `var(--surface-2)` | 输入框背景 | 🆕 新增 |
| `--surface-code` | `var(--surface-2)` | 代码块背景 | 🆕 新增 |

#### 文字 (Text)

| 语义令牌 | 映射 | 用途 | 状态 |
|----------|------|------|------|
| `--text-primary` | `#292536` | 标题/重要 | ✅ 现有 |
| `--text-secondary` | `#817C90` | 正文 | ✅ 现有 |
| `--text-muted` | `#A09CAD` | 辅助/metadata | ✅ 现有 |
| `--text-disabled` | `#C4C0D0` | 禁用/占位 | ✅ 现有 |
| `--text-inverse` | `#FFFFFF` | 反色 | ✅ 现有 |
| `--text-accent` | `var(--accent)` | 强调文字 | 🆕 新增 |
| `--text-success` | `var(--sem-green)` | 成功文字 | 🆕 新增 |
| `--text-warning` | `var(--sem-orange)` | 警告文字 | 🆕 新增 |
| `--text-danger` | `var(--sem-red)` | 危险文字 | 🆕 新增 |
| `--text-info` | `var(--sem-teal)` | 信息文字 | ✅ 现有(别名 info) |
| `--text-link` | `var(--accent)` | 链接文字 | 🆕 新增 |

#### 边框 (Border)

| 语义令牌 | 映射 | 用途 | 状态 |
|----------|------|------|------|
| `--border-subtle` | `rgba(255,255,255,0.45)` | 极细边框 | ✅ 现有 |
| `--border-default` | `rgba(255,255,255,0.60)` | 默认边框 | ✅ 现有 |
| `--border-strong` | `rgba(255,255,255,0.75)` | 粗边框 | ✅ 现有 |
| `--separator` | `rgba(99,94,114,0.08)` | 分隔线 | ✅ 现有 |
| `--border-accent` | `var(--accent)` | 强调边框 | 🆕 新增 |
| `--border-focus` | `var(--accent-ring)` | 焦点边框 | 🆕 新增 |
| `--border-success` | `var(--sem-green)` | 成功边框 | 🆕 新增 |
| `--border-warning` | `var(--sem-orange)` | 警告边框 | 🆕 新增 |
| `--border-danger` | `var(--sem-red)` | 危险边框 | 🆕 新增 |
| `--border-disabled` | `var(--separator)` | 禁用边框 | 🆕 新增 |
| `--border-glass` | `var(--glass-border)` | 玻璃边框 | ✅ 现有 |

#### 强调色 (Accent)

| 语义令牌 | 映射 | 用途 | 状态 |
|----------|------|------|------|
| `--accent` | `#7A5ECD` | 主强调 | ✅ 现有 |
| `--accent-hover` | `#8B6FE0` | 悬停 | ✅ 现有 |
| `--accent-pressed` | `#6A4EC0` | 按下 | ✅ 现有 |
| `--accent-tint` | `rgba(122,94,205,0.10)` | 淡背景 | ✅ 现有 |
| `--accent-ring` | `rgba(122,94,205,0.25)` | 焦点环 | ✅ 现有 |
| `--accent-soft` | `var(--accent-tint)` | 柔和强调 | 🔧 需修改（当前硬编码错误紫色 rgba(141,124,199,0.10)） |
| `--accent-glow` | `var(--accent-tint)` | 发光 | ✅ 现有(别名) |

#### 状态色 (Status)

| 语义令牌 | 映射 | 用途 | 状态 |
|----------|------|------|------|
| `--status-success` | `var(--sem-green)` | 成功 | 🆕 新增(统一 #22c55e, #16a34a, #4CAF50 等) |
| `--status-success-bg` | `var(--green-bg)` | 成功背景 | ✅ 现有 |
| `--status-warning` | `var(--sem-orange)` | 警告 | 🆕 新增(统一 #eab308, #FFC107 等) |
| `--status-warning-bg` | `var(--orange-bg)` | 警告背景 | ✅ 现有 |
| `--status-danger` | `var(--sem-red)` | 危险 | 🆕 新增(统一 #e74c3c, #ef4444, #F44336 等) |
| `--status-danger-bg` | `var(--red-bg)` | 危险背景 | ✅ 现有 |
| `--status-info` | `var(--sem-teal)` | 信息 | 🆕 新增 |
| `--status-info-bg` | `var(--teal-bg)` | 信息背景 | ✅ 现有 |
| `--status-blue` | `#6B8DD4` | 蓝色状态 | 🆕 新增(模块中高频使用但无令牌) |
| `--status-blue-bg` | `rgba(107,141,212,0.10)` | 蓝色背景 | 🆕 新增 |

#### 交互状态 (Interactive States)

| 语义令牌 | 映射 | 用途 | 状态 |
|----------|------|------|------|
| `--state-hover-bg` | `var(--accent-tint)` | 悬停背景 | 🆕 新增 |
| `--state-hover-shadow` | `var(--float-hover)` | 悬停阴影 | 🆕 新增 |
| `--state-active-bg` | `var(--accent-tint)` | 激活背景 | 🆕 新增 |
| `--state-focus-ring` | `0 0 0 3px var(--accent-ring)` | 焦点环 | 🆕 新增 |
| `--state-disabled-opacity` | `0.5` | 禁用透明度 | 🆕 新增 |
| `--state-disabled-cursor` | `not-allowed` | 禁用光标 | 🆕 新增 |

---

### B.3 组件令牌层 (Component Tokens)

#### 侧边栏 (Sidebar)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--sidebar-width` | `232px` | main.css | ✅ 现有 |
| `--sidebar-bg` | `var(--canvas)` | 推断 | 🆕 新增 |
| `--sidebar-item-height` | `36px` | 模块实际 | 🆕 新增 |
| `--sidebar-item-radius` | `var(--radius-md)` | 推断 | 🆕 新增 |
| `--sidebar-item-gap` | `var(--space-1)` | 推断 | 🆕 新增 |
| `--sidebar-item-padding` | `0 var(--space-3)` | 推断 | 🆕 新增 |
| `--sidebar-item-active-bg` | `var(--accent-tint)` | 推断 | 🆕 新增 |
| `--sidebar-item-active-color` | `var(--accent)` | 推断 | 🆕 新增 |

#### 顶栏/搜索 (Topbar/Search)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--topbar-height` | `52px` | main.css | ✅ 现有 |
| `--topbar-bg` | `var(--glass-bg-strong)` | global-search.css | 🆕 新增 |
| `--topbar-blur` | `var(--glass-blur)` | 推断 | 🆕 新增 |
| `--topbar-search-height` | `36px` | global-search.css | 🆕 新增 |
| `--topbar-search-radius` | `var(--radius-md)` | global-search.css | 🆕 新增 |
| `--topbar-search-bg` | `var(--surface-2)` | global-search.css | 🆕 新增 |
| `--topbar-search-padding` | `0 var(--space-3) 0 var(--space-4)` | global-search.css | 🆕 新增 |

#### 按钮 (Button)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--button-primary-bg` | `var(--accent)` | 模块实际 | 🆕 新增 |
| `--button-primary-color` | `var(--text-inverse)` | 模块实际(#fff) | 🆕 新增 |
| `--button-primary-hover-bg` | `var(--accent-hover)` | 模块实际 | 🆕 新增 |
| `--button-primary-active-bg` | `var(--accent-pressed)` | 模块实际 | 🆕 新增 |
| `--button-primary-shadow` | `0 1px 3px rgba(103,76,180,0.15)` | 模块实际(4处) | 🔧 需令牌化 |
| `--button-secondary-bg` | `var(--surface-1)` | 模块实际 | 🆕 新增 |
| `--button-secondary-color` | `var(--text-primary)` | 模块实际 | 🆕 新增 |
| `--button-secondary-border` | `var(--border-default)` | 模块实际 | 🆕 新增 |
| `--button-ghost-bg` | `transparent` | 模块实际 | 🆕 新增 |
| `--button-ghost-color` | `var(--text-secondary)` | 模块实际 | 🆕 新增 |
| `--button-ghost-hover-bg` | `var(--accent-tint)` | 模块实际 | 🆕 新增 |
| `--button-danger-bg` | `var(--sem-red)` | 模块实际(#e74c3c) | 🔧 需统一 |
| `--button-danger-color` | `var(--text-inverse)` | 模块实际 | 🆕 新增 |
| `--button-height-sm` | `28px` | 模块实际 | 🆕 新增 |
| `--button-height-md` | `36px` | 模块实际 | 🆕 新增 |
| `--button-height-lg` | `44px` | 模块实际 | 🆕 新增 |
| `--button-padding-x` | `var(--space-4)` | 模块实际 | 🆕 新增 |
| `--button-radius` | `var(--radius-md)` | 模块实际 | 🆕 新增 |
| `--button-font-size` | `var(--text-sm)` | 模块实际 | 🆕 新增 |
| `--button-font-weight` | `var(--weight-medium)` | 模块实际 | 🆕 新增 |
| `--button-transition` | `var(--transition-base)` | 推断 | 🆕 新增 |
| `--button-disabled-opacity` | `0.5` | 推断 | 🆕 新增 |

#### 输入框 (Input)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--input-height` | `36px` | 模块实际 | 🆕 新增 |
| `--input-bg` | `var(--surface-2)` | 模块实际 | 🆕 新增 |
| `--input-color` | `var(--text-primary)` | 模块实际 | 🆕 新增 |
| `--input-placeholder-color` | `var(--text-disabled)` | 模块实际 | 🆕 新增 |
| `--input-border` | `var(--border-subtle)` | 模块实际 | 🆕 新增 |
| `--input-border-focus` | `var(--accent)` | 模块实际 | 🆕 新增 |
| `--input-radius` | `var(--radius-md)` | 模块实际 | 🆕 新增 |
| `--input-padding-x` | `var(--space-3)` | 模块实际 | 🆕 新增 |
| `--input-font-size` | `var(--text-sm)` | 模块实际 | 🆕 新增 |
| `--input-transition` | `var(--transition-base)` | 推断 | 🆕 新增 |
| `--input-focus-ring` | `0 0 0 3px var(--accent-ring)` | 模块实际 | 🆕 新增 |

#### 标签页 (Tab)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--tab-height` | `36px` | 模块实际 | 🆕 新增 |
| `--tab-padding-x` | `var(--space-4)` | 模块实际 | 🆕 新增 |
| `--tab-gap` | `var(--space-1)` | 模块实际 | 🆕 新增 |
| `--tab-color` | `var(--text-secondary)` | 模块实际 | 🆕 新增 |
| `--tab-active-color` | `var(--accent)` | 模块实际 | 🆕 新增 |
| `--tab-active-bg` | `var(--accent-tint)` | 模块实际 | 🆕 新增 |
| `--tab-radius` | `var(--radius-md)` | 模块实际 | 🆕 新增 |
| `--tab-font-size` | `var(--text-sm)` | 模块实际 | 🆕 新增 |
| `--tab-font-weight` | `var(--weight-medium)` | 模块实际 | 🆕 新增 |
| `--tab-indicator-height` | `2px` | 模块实际 | 🆕 新增 |
| `--tab-indicator-color` | `var(--accent)` | 模块实际 | 🆕 新增 |

#### 卡片 (Card)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--card-bg` | `var(--surface-1)` | 模块实际(统一17种白色半透明) | 🆕 新增 |
| `--card-border` | `var(--border-default)` | 模块实际 | 🆕 新增 |
| `--card-radius` | `var(--radius-lg)` | 模块实际(14px) | 🆕 新增 |
| `--card-padding` | `var(--space-4)` | 模块实际 | 🆕 新增 |
| `--card-shadow` | `var(--float-xs)` | 模块实际 | 🆕 新增 |
| `--card-shadow-hover` | `var(--float-hover)` | 模块实际 | 🆕 新增 |
| `--card-gap` | `var(--space-3)` | 模块实际 | 🆕 新增 |
| `--card-header-padding` | `var(--space-3) var(--space-4)` | 模块实际 | 🆕 新增 |
| `--card-body-padding` | `var(--space-4)` | 模块实际 | 🆕 新增 |
| `--card-footer-padding` | `var(--space-3) var(--space-4)` | 模块实际 | 🆕 新增 |
| `--card-active-border` | `var(--accent)` | 模块实际(左侧指示条) | 🆕 新增 |
| `--card-active-border-width` | `3px` | 模块实际 | 🆕 新增 |

#### 徽章/标签 (Badge/Tag)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--badge-height` | `22px` | 模块实际 | 🆕 新增 |
| `--badge-padding-x` | `var(--space-2)` | 模块实际 | 🆕 新增 |
| `--badge-radius` | `var(--radius-pill)` | 模块实际 | 🆕 新增 |
| `--badge-font-size` | `var(--text-xs)` | 模块实际 | 🆕 新增 |
| `--badge-font-weight` | `var(--weight-medium)` | 模块实际 | 🆕 新增 |
| `--badge-default-bg` | `var(--surface-2)` | 模块实际 | 🆕 新增 |
| `--badge-default-color` | `var(--text-secondary)` | 模块实际 | 🆕 新增 |
| `--badge-accent-bg` | `var(--accent-tint)` | 模块实际 | 🆕 新增 |
| `--badge-accent-color` | `var(--accent)` | 模块实际 | 🆕 新增 |
| `--badge-success-bg` | `var(--green-bg)` | 模块实际 | 🆕 新增 |
| `--badge-success-color` | `var(--sem-green)` | 模块实际 | 🆕 新增 |
| `--badge-warning-bg` | `var(--orange-bg)` | 模块实际 | 🆕 新增 |
| `--badge-warning-color` | `var(--sem-orange)` | 模块实际 | 🆕 新增 |
| `--badge-danger-bg` | `var(--red-bg)` | 模块实际 | 🆕 新增 |
| `--badge-danger-color` | `var(--sem-red)` | 模块实际 | 🆕 新增 |
| `--badge-info-bg` | `var(--teal-bg)` | 模块实际 | 🆕 新增 |
| `--badge-info-color` | `var(--sem-teal)` | 模块实际 | 🆕 新增 |
| `--badge-blue-bg` | `rgba(107,141,212,0.10)` | 模块实际(高频) | 🆕 新增 |
| `--badge-blue-color` | `#6B8DD4` | 模块实际 | 🆕 新增 |

#### 模态框/Drawer (Modal/Drawer)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--modal-overlay-bg` | `rgba(42,39,51,0.35)` | 模块实际(高频) | 🆕 新增 |
| `--modal-overlay-blur` | `blur(4px)` | 推断 | 🆕 新增 |
| `--modal-bg` | `var(--surface-1)` | 模块实际 | 🆕 新增 |
| `--modal-radius` | `var(--radius-xl)` | 模块实际(18px) | 🆕 新增 |
| `--modal-shadow` | `var(--float-lg)` | 模块实际 | 🆕 新增 |
| `--modal-padding` | `var(--space-5)` | 模块实际 | 🆕 新增 |
| `--modal-max-width` | `640px` | 模块实际 | 🆕 新增 |
| `--modal-max-width-lg` | `800px` | 模块实际 | 🆕 新增 |
| `--drawer-width` | `480px` | 模块实际 | 🆕 新增 |
| `--drawer-width-lg` | `640px` | 模块实际 | 🆕 新增 |
| `--drawer-shadow` | `-8px 0 32px rgba(80,65,130,0.1)` | 模块实际 | 🆕 新增 |
| `--modal-z-index` | `500` | 推断 | 🆕 新增 |
| `--modal-transition` | `var(--transition-base)` | 推断 | 🆕 新增 |

#### Personal AI 悬浮按钮 (FAB)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--fab-size` | `56px` | personal-ai.css | 🆕 新增 |
| `--fab-bg` | `var(--accent)` | personal-ai.css | 🆕 新增 |
| `--fab-color` | `var(--text-inverse)` | personal-ai.css | 🆕 新增 |
| `--fab-shadow` | `0 4px 16px rgba(108,92,231,0.4)` | personal-ai.css | 🔧 需统一紫色 |
| `--fab-shadow-hover` | `0 6px 24px rgba(108,92,231,0.5)` | personal-ai.css | 🔧 需统一紫色 |
| `--fab-bottom` | `24px` | personal-ai.css | 🆕 新增 |
| `--fab-right` | `24px` | personal-ai.css | 🆕 新增 |
| `--fab-z-index` | `900` | 推断 | 🆕 新增 |
| `--fab-panel-width` | `380px` | personal-ai.css | 🆕 新增 |
| `--fab-panel-height` | `560px` | personal-ai.css | 🆕 新增 |
| `--fab-panel-radius` | `var(--radius-xl)` | personal-ai.css | 🆕 新增 |
| `--fab-panel-bg` | `var(--glass-bg-strong)` | personal-ai.css | 🆕 新增 |
| `--fab-panel-blur` | `var(--glass-blur)` | personal-ai.css | 🆕 新增 |
| `--fab-panel-shadow` | `0 12px 48px rgba(0,0,0,0.15)` | personal-ai.css | 🆕 新增 |

#### 知识模块特定组件 (Knowledge Module Specific)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--knowledge-card-min-height` | `180px` | search.css | 🆕 新增 |
| `--knowledge-grid-columns` | `repeat(3, 1fr)` | search.css | 🆕 新增 |
| `--knowledge-grid-gap` | `var(--space-4)` | search.css | 🆕 新增 |
| `--knowledge-type-icon-size` | `16px` | search.css | 🆕 新增 |
| `--knowledge-detail-drawer-width` | `560px` | search.css | 🆕 新增 |
| `--knowledge-search-height` | `44px` | search.css | 🆕 新增 |
| `--knowledge-empty-icon-size` | `64px` | search.css | 🆕 新增 |

#### AI复盘模块特定组件 (AI Reflection Module Specific)

| 令牌 | 值 | 来源 | 状态 |
|------|-----|------|------|
| `--review-card-min-height` | `200px` | obsidian-reviews.css | 🆕 新增 |
| `--review-grid-columns` | `repeat(3, 1fr)` | obsidian-reviews.css | 🆕 新增 |
| `--review-grid-gap` | `var(--space-4)` | obsidian-reviews.css | 🆕 新增 |
| `--review-score-star-size` | `14px` | obsidian-reviews.css | 🆕 新增 |
| `--review-stat-icon-size` | `14px` | obsidian-reviews.css | 🆕 新增 |
| `--review-detail-drawer-width` | `640px` | obsidian-reviews.css | 🆕 新增 |
| `--review-code-bg` | `var(--surface-2)` | obsidian-reviews.css(#1e293b) | 🔧 需统一 |
| `--review-code-radius` | `var(--radius-sm)` | obsidian-reviews.css | 🆕 新增 |
| `--review-code-padding` | `var(--space-3)` | obsidian-reviews.css | 🆕 新增 |
| `--review-timeline-width` | `2px` | obsidian-reviews.css | 🆕 新增 |
| `--review-timeline-color` | `var(--separator)` | obsidian-reviews.css | 🆕 新增 |

---

## C. 不一致与重复审计 (Inconsistencies & Duplication Audit)

### C.1 颜色不一致

#### 紫色变体 (Purple Variants) — 严重

当前代码中存在 **至少 8 种不同的紫色**：

| 紫色值 | 使用位置 | 出现次数 | 问题 |
|--------|----------|----------|------|
| `#7A5ECD` | main.css accent | 令牌定义 | ✅ 标准 |
| `#8D7CC7` (`rgba(141,124,199,...)`) | personal-ai.css, main.css 兼容别名 | 10+处 | ❌ 错误紫色，偏亮 |
| `#6C5CE7` (`rgba(108,92,231,...)`) | personal-ai.css 按钮阴影 | 2处 | ❌ 另一种紫色 |
| `#8B5CF6` (`rgba(139,92,246,...)`) | obsidian-reviews.css | 1处 | ❌ Tailwind 紫色 |
| `#7C5CFC` (`rgba(124,92,252,...)`) | obsidian-reviews.css | 2处 | ❌ 另一种紫色 |
| `#4F46E5` (`rgba(79,70,229,...)`) | obsidian-reviews.css | 2处 | ❌ 靛蓝色 |
| `#A899D8` | main.css 深色模式 accent | 令牌定义 | ✅ 深色模式标准 |
| `rgba(122,94,205,0.04~0.25)` | 各模块 | 30+处 | ⚠️ 8种不同浓度，应统一为 accent-tint/ring |

**影响**: Personal AI 悬浮按钮和面板的紫色与工作台主色不一致，视觉上能明显看出色差。

#### 白色半透明 (White Opacity) — 严重

当前代码中存在 **至少 17 种不同浓度的白色半透明**：

`0.2, 0.35, 0.4, 0.48, 0.5, 0.55, 0.6, 0.62, 0.65, 0.68, 0.7, 0.72, 0.78, 0.8, 0.85, 0.88, 0.9, 0.92, 0.94, 0.95`

而设计令牌只定义了 3 种：`--glass-bg` (0.48), `--glass-bg-strong` (0.60), `--surface-1` (不透明 #F5F3FC)。

**影响**: 卡片背景不统一，有的偏透明有的偏白，视觉层次感混乱。

#### 阴影颜色 (Shadow Color) — 严重

当前代码中存在 **至少 14 种不同的紫灰色阴影** + **9 种黑色阴影**：

紫灰色: `rgba(80,65,130,...)`, `rgba(75,60,120,...)`, `rgba(60,50,100,...)`, `rgba(70,60,100,...)`, `rgba(70,50,110,...)`, `rgba(90,75,140,...)`, `rgba(80,60,130,...)`, `rgba(103,76,180,...)` 等

黑色: `rgba(0,0,0,0.02)` 到 `rgba(0,0,0,0.35)` 共9种

而设计令牌定义了统一的 `--shadow-soft: rgba(80,65,130,0.06)` 和 float-* 系列。

**影响**: 阴影色调不统一，有的偏紫有的偏黑，视觉不和谐。

#### 语义色不统一 (Semantic Colors) — 严重

**绿色**: `#22c55e`, `#16a34a`, `#4CAF50`, `#6B9A7A` (sem-green), `#065f46`, `#166534`, `rgba(34,197,94,...)`, `rgba(22,163,74,...)` — **至少 8 种**

**红色**: `#e74c3c`, `#c0392b`, `#ef4444`, `#dc2626`, `#B07078` (sem-red), `#F44336`, `#dc3232`, `rgba(239,68,68,...)`, `rgba(220,38,38,...)`, `rgba(220,50,50,...)` — **至少 10 种**

**黄色/橙色**: `#eab308`, `#ca8a04`, `#FFC107`, `#B8906A` (sem-orange), `#fef9c3`, `#fef08a`, `#fde68a`, `rgba(234,179,8,...)`, `rgba(255,193,7,...)` — **至少 9 种**

**蓝色** (无令牌!): `#3b82f6`, `#2563eb`, `#4A7FD8`, `#0369a1`, `#1e40af`, `#6b8dd4`, `rgba(59,130,246,...)`, `rgba(107,141,212,...)`, `#e0f2fe`, `#f0f9ff` — **至少 10 种，且无对应语义令牌**

**影响**: 同一种状态（如"成功"）在不同模块显示不同颜色，用户无法建立稳定的视觉联想。

### C.2 字号不一致 (Typography) — 中等

当前代码中存在 **至少 25 种不同字号**，而设计令牌只定义了 12 种：

非令牌字号: `7px, 8px, 9px, 10px, 10.5px, 11.5px, 12.5px, 13.5px, 15px(令牌有但模块硬编码), 15.5px, 16px(17处!), 18px, 20px(8处), 22px(令牌有但模块硬编码), 24px, 26px(令牌有但模块硬编码), 28px, 30px(令牌有但模块硬编码), 32px, 34px, 36px`

**半像素字号**: `10.5px, 11.5px, 12.5px, 13.5px, 15.5px` — 5种半像素值，渲染不一致

**影响**: 文字大小不统一，模块间视觉层级不一致。

### C.3 圆角不一致 (Border Radius) — 中等

当前代码中存在 **至少 15 种不同圆角**，而设计令牌定义了 8 种：

非令牌圆角: `2px, 3px, 4px, 5px, 6px, 7px, 9px, 16px, 20px, 50%, 3px 0 0 3px, 0 6px 6px 0, 0 8px 8px 0`

**obsidian-reviews.css 中 6px 圆角出现 23 次**，远高于令牌最小值 8px

**影响**: 圆角不统一，有的元素尖锐有的圆润，视觉风格不一致。

### C.4 间距不一致 (Spacing) — 中等

模块中大量使用非网格间距值：
- `3px, 5px, 7px, 9px, 18px` 等非 4px 网格值
- padding 混合使用令牌和硬编码：`var(--space-05) 8px`, `var(--space-1) 12px` 等
- gap 在 obsidian-reviews.css 中大量使用令牌（41次 space-3），但在其他模块中硬编码

**影响**: 元素间距不统一，视觉节奏不一致。

### C.5 过渡不一致 (Motion) — 轻微

- `0ms` 在 obsidian-reviews.css 中出现 **24 次**，大量禁用过渡
- 实际使用过渡的地方大多使用令牌，但也有硬编码
- 模块间过渡行为不一致，有的有动画有的没有

### C.6 兼容别名冗余 (Alias Redundancy) — 轻微

main.css 中存在 **40+ 个兼容别名**（apple-*, nm-*, system-*, shadow-* 等），其中大部分与主令牌重复，增加了维护成本。部分别名使用了错误紫色（`--bg-hover`, `--accent-soft`）。

### C.7 深色模式覆盖不完整 — 轻微

深色模式完整覆盖了基础令牌，但模块中的硬编码颜色（如 `#1e293b` 代码块背景、`#111827` 文字色）在深色模式下可能显示异常。

---

## D. 应统一的共享令牌 (Shared Tokens to Unify)

### D.1 最高优先级 (P0) — 影响整体视觉一致性

| 令牌 | 当前问题 | 统一目标 | 影响范围 |
|------|----------|----------|----------|
| 主色紫色 | 8种不同紫色 | 统一为 `--accent: #7A5ECD` | 所有模块，特别是 Personal AI |
| 卡片背景 | 17种白色半透明浓度 | 统一为 `--surface-1` / `--glass-bg` / `--glass-bg-strong` 三级 | 所有模块 |
| 阴影颜色 | 14种紫灰 + 9种黑色 | 统一为 `--shadow-soft: rgba(80,65,130,0.06)` + float-* 系列 | 所有模块 |
| 语义色-绿 | 8种绿色 | 统一为 `--sem-green: #6B9A7A` + `--green-bg` | 所有模块 |
| 语义色-红 | 10种红色 | 统一为 `--sem-red: #B07078` + `--red-bg` | 所有模块 |
| 语义色-黄/橙 | 9种黄橙色 | 统一为 `--sem-orange: #B8906A` + `--orange-bg` | 所有模块 |

### D.2 高优先级 (P1) — 影响组件一致性

| 令牌 | 当前问题 | 统一目标 | 影响范围 |
|------|----------|----------|----------|
| 新增蓝色语义色 | 10种蓝色无令牌 | 新增 `--sem-blue: #6B8DD4` + `--blue-bg` | obsidian-reviews, search |
| 按钮样式 | 各模块按钮不统一 | 统一按钮组件令牌 (primary/secondary/ghost/danger) | 所有模块 |
| 输入框样式 | 高度/内边距不统一 | 统一输入框组件令牌 | 所有模块 |
| 卡片样式 | 圆角/内边距/阴影不统一 | 统一卡片组件令牌 | 所有模块 |
| 徽章/标签样式 | 颜色/大小不统一 | 统一徽章组件令牌 (8种状态色) | 所有模块 |
| 模态遮罩 | `rgba(42,39,51,0.25/0.3/0.35)` 3种 | 统一为 `--bg-overlay: rgba(42,39,51,0.35)` | 所有模块 |
| 焦点环 | `0 0 0 3px rgba(122,94,205,0.10)` 硬编码 | 统一为 `--state-focus-ring: 0 0 0 3px var(--accent-ring)` | 所有模块 |

### D.3 中优先级 (P2) — 影响细节一致性

| 令牌 | 当前问题 | 统一目标 | 影响范围 |
|------|----------|----------|----------|
| 字号 | 25种字号(含半像素) | 统一为 12级令牌 + 新增 2xs/5xl | 所有模块 |
| 圆角 | 15种圆角 | 统一为 8级令牌 + 新增 2xs/3xs | 所有模块 |
| 间距 | 非网格值 | 统一为 4px 网格体系 | 所有模块 |
| Z-index | 无定义 | 新增 10级 z-index 令牌 | 所有模块 |
| 过渡 | 24处 0ms | 统一为 duration-instant + 三级时长 | 所有模块 |
| 字间距 | 无定义 | 新增 3级 tracking 令牌 | 所有模块 |
| 边框宽度 | 无定义 | 新增 3级 border-width 令牌 | 所有模块 |
| 图标尺寸 | 硬编码 12/14/16/20px | 新增 4级 icon-size 令牌 | 所有模块 |

### D.4 低优先级 (P3) — 维护优化

| 令牌 | 当前问题 | 统一目标 | 影响范围 |
|------|----------|----------|----------|
| 兼容别名 | 40+ 个重复别名 | 逐步废弃 apple-*/nm-*/system-* 别名 | main.css |
| 深色模式 | 模块硬编码在深色模式异常 | 确保所有语义令牌在深色模式有覆盖 | 所有模块 |
| 代码块背景 | `#1e293b` 硬编码 | 新增 `--surface-code` 语义令牌 | obsidian-reviews |

---

## E. 应保持模块特定的值 (Module-Specific Values)

以下值因模块功能差异，**不应强制统一**，应保持模块特定：

### E.1 布局结构

| 模块 | 特定值 | 原因 |
|------|--------|------|
| Knowledge | 3列网格 (`repeat(3, 1fr)`) | 知识卡片内容较短，适合3列 |
| AI Reflection | 3列网格但卡片更高 (`min-height: 200px`) | 复盘卡片包含统计信息，需要更高 |
| Knowledge | Drawer 宽度 560px | 知识详情内容中等 |
| AI Reflection | Drawer 宽度 640px | 复盘详情包含完整内容和时间线，需要更宽 |

### E.2 模块特定组件

| 模块 | 特定组件 | 原因 |
|------|----------|------|
| AI Reflection | 时间线 (timeline) 2px 宽度 | 复盘模块特有，展示复盘历史 |
| AI Reflection | 评分星级 (star rating) 14px | 复盘模块特有，展示 AI 评分 |
| AI Reflection | 统计图标 (stat icons) 14px | 复盘模块特有，展示警告/完成/新增计数 |
| AI Reflection | 代码块深色背景 `#1e293b` | 复盘模块包含代码片段，需要深色代码背景 |
| Knowledge | 知识类型图标 (7种类型) | 知识模块特有，区分知识类型 |
| Knowledge | 空状态图标 64px | 知识模块特有，空状态展示 |

### E.3 模块特定配色

| 模块 | 特定配色 | 原因 |
|------|----------|------|
| Knowledge | 7种知识类型色 (project/concept/experience/learning/note/reflection/resource) | 知识类型标识，不属于全局语义色 |
| AI Reflection | 复盘评分色 (1-5星不同色) | 评分系统特有，不属于全局语义色 |
| Personal AI | 聊天气泡色 (用户/AI 不同背景) | 对话界面特有 |
| Information Radar | 相关性等级色 (高/中/低) | 信息雷达特有，当前模块不存在但未来需要 |

### E.4 Personal AI 悬浮面板

| 特定值 | 原因 |
|--------|------|
| FAB 尺寸 56px | 悬浮按钮标准尺寸，与全局按钮不同 |
| 面板尺寸 380x560px | 聊天面板特定尺寸 |
| 面板位置 bottom/right: 24px | 悬浮位置特定 |
| z-index: 900 | 必须在所有内容之上 |

---

## F. 建议的令牌文件/目录结构 (Recommended Token File Structure)

```
public/
├── core/
│   ├── main.css                    # 现有全局样式（保留）
│   ├── global-search.css           # 现有全局搜索样式（保留）
│   └── tokens/                     # 🆕 新增令牌目录
│       ├── index.css               # 令牌入口，@import 所有分层
│       ├── foundation/             # 基础令牌层
│       │   ├── colors.css          # 原始色板（紫色系、语义色原始值、中性色）
│       │   ├── typography.css      # 字体族、字号、行高、字重、字间距
│       │   ├── spacing.css         # 间距标度、尺寸标度
│       │   ├── radius.css          # 圆角标度
│       │   ├── border.css          # 边框宽度
│       │   ├── shadow.css          # 阴影标度（新拟态、浮动、内阴影）
│       │   ├── blur.css            # 模糊标度
│       │   ├── motion.css          # 时长、缓动
│       │   ├── opacity.css         # 透明度标度
│       │   └── zindex.css          # Z-index 层级
│       ├── semantic/               # 语义令牌层
│       │   ├── background.css      # 背景语义令牌（bg-app/surface/subtle/muted/hover/overlay/glass）
│       │   ├── surface.css         # 表面语义令牌（card/input/code）
│       │   ├── text.css            # 文字语义令牌（primary/secondary/muted/disabled/inverse/accent/status）
│       │   ├── border.css          # 边框语义令牌（subtle/default/strong/separator/accent/focus/status）
│       │   ├── accent.css          # 强调色语义令牌
│       │   ├── status.css          # 状态色语义令牌（success/warning/danger/info/blue）
│       │   └── interactive.css     # 交互状态令牌（hover/active/focus/disabled）
│       └── components/             # 组件令牌层
│           ├── sidebar.css         # 侧边栏
│           ├── topbar.css          # 顶栏/搜索
│           ├── button.css          # 按钮（primary/secondary/ghost/danger + 尺寸）
│           ├── input.css           # 输入框
│           ├── tab.css             # 标签页
│           ├── card.css            # 卡片
│           ├── badge.css           # 徽章/标签（8种状态）
│           ├── modal.css           # 模态框/Drawer
│           ├── fab.css             # Personal AI 悬浮按钮
│           ├── knowledge.css       # 知识模块特定组件
│           ├── review.css          # AI复盘模块特定组件
│           └── radar.css           # 信息雷达模块特定组件（预留）
└── modules/
    ├── search/
    │   ├── style.css               # 仅保留模块特定样式，引用全局令牌
    │   └── module.js
    ├── obsidian-reviews/
    │   ├── style.css               # 仅保留模块特定样式，引用全局令牌
    │   └── module.js
    └── ...
```

### 迁移策略

1. **Phase 1**: 创建 `tokens/foundation/` 层，从 main.css :root 中提取基础令牌，保持值不变
2. **Phase 2**: 创建 `tokens/semantic/` 层，映射基础令牌到语义用途
3. **Phase 3**: 创建 `tokens/components/` 层，基于模块实际使用值定义组件令牌
4. **Phase 4**: 逐步将模块 CSS 中的硬编码替换为令牌引用
5. **Phase 5**: 清理 main.css 中的兼容别名和重复定义
6. **Phase 6**: 深色模式令牌覆盖

---

## G. 迁移优先级 (Migration Priority)

### P0 — 立即修复（影响核心视觉一致性）

| 序号 | 任务 | 原因 | 预估工作量 |
|------|------|------|-----------|
| 1 | 统一主色紫色：将 `#8D7CC7`, `#6C5CE7`, `#8B5CF6`, `#7C5CFC`, `#4F46E5` 全部替换为 `--accent: #7A5ECD` | Personal AI 悬浮按钮紫色与全局不一致，视觉差异明显 | 小（~15处） |
| 2 | 修复 main.css 兼容别名中的错误紫色：`--bg-hover` 和 `--accent-soft` | 这两个别名被模块引用，传播错误紫色 | 极小（2处） |
| 3 | 统一卡片背景：将 17 种白色半透明浓度归纳为 `--surface-1`（不透明卡片）、`--glass-bg`（半透明面板）、`--glass-bg-strong`（强玻璃面板）三级 | 卡片背景不统一是"工作台看着丑"的主要原因 | 中（~80处） |
| 4 | 统一阴影颜色：将 14 种紫灰 + 9 种黑色阴影统一为 `--shadow-soft` + float-* 系列 | 阴影色调不统一破坏整体和谐感 | 中（~50处） |
| 5 | 统一语义色：将 8 种绿、10 种红、9 种黄橙统一为 sem-* 令牌 | 同一种状态显示不同颜色，用户无法建立视觉联想 | 中（~60处） |

### P1 — 短期修复（1-2周内）

| 序号 | 任务 | 原因 | 预估工作量 |
|------|------|------|-----------|
| 6 | 新增蓝色语义令牌 `--sem-blue` + `--blue-bg` | 模块中 10+ 处蓝色无对应令牌，当前只能硬编码 | 小（新增2个令牌+替换~15处） |
| 7 | 统一按钮组件令牌：primary/secondary/ghost/danger 四种变体 + sm/md/lg 三种尺寸 | 各模块按钮样式不统一，交互反馈不一致 | 中（定义~30个令牌+替换~40处） |
| 8 | 统一输入框组件令牌 | 输入框高度、内边距、焦点样式不统一 | 小（定义~12个令牌+替换~20处） |
| 9 | 统一卡片组件令牌：bg/border/radius/padding/shadow/gap | 卡片是最常用组件，统一后视觉提升最大 | 中（定义~15个令牌+替换~60处） |
| 10 | 统一徽章/标签组件令牌：8种状态色 + 统一尺寸 | 标签颜色不统一，状态识别困难 | 中（定义~20个令牌+替换~50处） |
| 11 | 统一模态遮罩：`rgba(42,39,51,0.25/0.3/0.35)` → `--bg-overlay` | 遮罩浓度不统一，模态体验不一致 | 小（~8处） |
| 12 | 统一焦点环：`0 0 0 3px rgba(122,94,205,0.10)` → `--state-focus-ring` | 焦点样式不统一，可访问性受影响 | 小（~10处） |

### P2 — 中期修复（1个月内）

| 序号 | 任务 | 原因 | 预估工作量 |
|------|------|------|-----------|
| 13 | 统一字号：25种字号归纳为 12 级令牌 + 新增 2xs(10px)/5xl(32px)，废弃半像素字号 | 字号不统一破坏排版层次 | 大（~100处） |
| 14 | 统一圆角：15种圆角归纳为 8 级令牌 + 新增 2xs(4px)/3xs(2px) | 圆角不统一破坏视觉风格 | 中（~70处） |
| 15 | 统一间距：非网格值迁移到 4px 网格体系 | 间距不统一破坏视觉节奏 | 大（~120处） |
| 16 | 新增 Z-index 令牌：10级层级定义 | 当前无 z-index 令牌，层级混乱 | 小（新增10个令牌） |
| 17 | 统一过渡：24处 0ms → `--duration-instant`，统一三级时长 | 过渡行为不统一，有的有动画有的没有 | 中（~30处） |
| 18 | 新增字间距/边框宽度/图标尺寸令牌 | 这些维度当前完全无令牌 | 小（新增~10个令牌） |
| 19 | 创建 tokens/ 目录结构和分层文件 | 为令牌系统提供物理载体 | 小（新建~20个文件） |

### P3 — 长期优化（持续进行）

| 序号 | 任务 | 原因 | 预估工作量 |
|------|------|------|-----------|
| 20 | 清理 main.css 中 40+ 个兼容别名（apple-*/nm-*/system-*） | 减少维护成本，避免混淆 | 中（~40处） |
| 21 | 完善深色模式覆盖：确保所有语义令牌在深色模式有对应值 | 当前深色模式只覆盖基础令牌，模块硬编码在深色模式异常 | 中 |
| 22 | 新增代码块语义令牌 `--surface-code` | obsidian-reviews 中 `#1e293b` 硬编码 | 小 |
| 23 | 建立令牌使用规范文档和 lint 规则 | 防止未来再次引入硬编码 | 中 |
| 24 | Information Radar 模块集成时遵循令牌规范 | 新模块从一开始就使用令牌 | 待模块开发 |

---

## 审计总结

### 当前状态

- **已实现令牌**: main.css :root 中定义了 ~120 个基础令牌，覆盖颜色、字体、间距、圆角、阴影、过渡等维度
- **令牌使用率**: 全局样式 var() 引用 425 次，但模块中大量硬编码（obsidian-reviews 1779次 var 引用但仍有 98 种唯一硬编码颜色）
- **主要问题**: 8种紫色、17种白色半透明、14种紫灰阴影、9种黑色阴影、8种绿色、10种红色、9种黄橙色、10种蓝色（无令牌）、25种字号、15种圆角

### 核心建议

1. **先统一颜色**（P0）：紫色、白色半透明、阴影色、语义色的统一是视觉提升的关键
2. **再统一组件**（P1）：按钮、卡片、输入框、徽章等高频组件的令牌化
3. **然后统一排版**（P2）：字号、圆角、间距等基础维度的标准化
4. **最后清理优化**（P3）：别名清理、深色模式完善、规范文档

### 关键发现

- **Information Radar 模块在当前路径下不存在**，仅在导航中标记为"开发中"。该模块的完整实现位于 `G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\public\modules\radar\`，未来集成时应遵循本规范。
- **Personal AI 模块使用了错误紫色 `#8D7CC7`**，与全局主色 `#7A5ECD` 不一致，这是最明显的视觉问题。
- **AI Reflection 模块是硬编码重灾区**（98种唯一硬编码颜色、24处 0ms 过渡、23处 6px 圆角），需要最多迁移工作量。
- **Website 模块是最干净的模块**（仅8种硬编码颜色，且大部分是紫色淡背景），可作为令牌化迁移的参考模板。

---

*审计完成时间: 2026-08-29*
*审计范围: G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\backend\public*
*审计文件: 7个CSS文件，总计 ~9300行，~231KB*
